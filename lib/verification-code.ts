import { Parser } from "htmlparser2";
import type { MailMessageDto } from "./types";

type VerificationMessage = Pick<MailMessageDto, "subject" | "textBody" | "htmlBody" | "verificationCodeIgnored">;
type Code = { display: string; value: string };
type Range = { start: number; end: number };

const codeContext = /验证码|校验码|动态码|安全码|登录码|确认码|授权码|一次性密码|临时密码|短信码|\b(?:(?:verification|confirmation|security|authentication|validation|temporary|access|login|log-in|sign-in)\s+(?:code|pin)|security\s+token|one[-\s]time\s+(?:code|password|passcode)|passcode|otp)\b/giu;
const authenticationSubject = /验证|校验|登录|登入|一次性密码|重置密码|\b(?:verify|verification|confirm\s+(?:your\s+)?email|email\s+confirmation|authenticate|authentication|sign[ -]?in|log[ -]?in|reset\s+(?:your\s+)?password|passcode|otp)\b/iu;
const otherNumberContext = /邮政编码|邮编|地址|订单(?:号)?|单号|发票(?:号)?|运单(?:号)?|电话|手机|优惠码|折扣码|旧验证码|已过期|已失效|秒|分钟|小时|\b(?:(?:postal|zip|order|invoice|tracking|reference|coupon|discount|promo)(?:[ _-]+(?:code|number|no))?|(?:previous|expired|superseded)(?:\s+(?:verification|confirmation|security|login))?(?:\s+(?:code|otp|passcode))?|postcode|address|street|road|avenue|suite|telephone|phone|tel|seconds?|minutes?|hours?|days?)\b/giu;
const blockTags = new Set(["p", "div", "section", "article", "table", "tr", "td", "th", "li", "h1", "h2", "h3", "h4", "h5", "h6", "br", "hr", "pre"]);
const excludedTags = new Set(["head", "script", "style", "noscript", "template", "footer", "address", "blockquote"]);

function normalize(value: string) {
  return value.normalize("NFKC").replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, "");
}

function textBlocks(value: string) {
  const blocks: string[] = [];
  for (const line of normalize(value).split(/\r?\n|[。！？；]|(?<=[.!?;])\s+/u)) {
    // Quoted and forwarded messages may contain a previous, now invalid code.
    if (/^\s*(?:-{2,}\s*(?:original message|forwarded message)|on\s+.+wrote:|在.+写道[:：])/iu.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    const block = line.replace(/\s+/g, " ").trim();
    if (block) blocks.push(block);
  }
  return blocks;
}

function htmlBlocks(html: string) {
  let text = "";
  const excluded: boolean[] = [];
  const parser = new Parser({
    onopentag(name, attributes) {
      const skip = Boolean(excluded.at(-1)) || excludedTags.has(name)
        || "hidden" in attributes || attributes["aria-hidden"] === "true"
        || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attributes.style || "")
        || /(?:^|[\s_-])(?:footer|signature|gmail_quote)(?:$|[\s_-])/i.test(`${attributes.class || ""} ${attributes.id || ""}`);
      excluded.push(skip);
      text += skip || blockTags.has(name) ? "\n" : " ";
    },
    ontext(value) {
      if (!excluded.at(-1)) text += value.replace(/\s+/g, " ");
    },
    onclosetag(name) {
      const skip = excluded.pop();
      text += skip || blockTags.has(name) ? "\n" : " ";
    },
  });
  parser.end(html);
  return textBlocks(text);
}

function ranges(text: string, pattern: RegExp): Range[] {
  return Array.from(text.matchAll(pattern), (match) => ({ start: match.index, end: match.index + match[0].length }));
}

function distance(candidate: Range, context: Range) {
  return Math.max(context.start - candidate.end, candidate.start - context.end, 0);
}

function numericCandidates(text: string) {
  const candidates: Array<Code & Range> = [];
  // Keep the existing six-digit scope, including 123 456, 123-456 and digit cells.
  for (const match of text.matchAll(/(?<![A-Za-z0-9])(?:\d{6}|\d{1,3}(?:[ -]+\d{1,3})+)(?![A-Za-z0-9])/g)) {
    const display = match[0];
    const value = display.replace(/[ -]/g, "");
    const start = match.index;
    const end = start + display.length;
    if (value.length !== 6 || /\d[ -]+$/.test(text.slice(0, start)) || /^[ -]+\d/.test(text.slice(end))) continue;
    candidates.push({ display, value, start, end });
  }
  return candidates;
}

export function verificationCode(message: VerificationMessage): Code | null {
  if (message.verificationCodeIgnored) return null;
  const subject = normalize(message.subject).replace(/\s+/g, " ").trim();
  const body = message.htmlBody?.trim() ? htmlBlocks(message.htmlBody) : textBlocks(message.textBody);
  const blocks = [subject, ...body];
  const subjectIsAuthentication = authenticationSubject.test(subject) || ranges(subject, codeContext).length > 0;
  const accepted = new Map<string, Code>();

  for (const [index, block] of blocks.entries()) {
    const contexts = ranges(block, codeContext);
    if (subjectIsAuthentication || authenticationSubject.test(block)) {
      contexts.push(...ranges(block, /\b(?:code|pin|token)\b/giu));
    }
    const exclusions = ranges(block, otherNumberContext);
    for (const candidate of numericCandidates(block)) {
      const positiveDistance = Math.min(...contexts.map((context) => distance(candidate, context)));
      const negativeDistance = Math.min(...exclusions.map((context) => distance(candidate, context)));
      const positiveBefore = Math.max(...contexts.filter((context) => context.end <= candidate.start).map((context) => context.end));
      const negativeBefore = Math.max(...exclusions.filter((context) => context.end <= candidate.start).map((context) => context.end));
      if (negativeDistance <= 40 && (negativeDistance < positiveDistance
        || (Number.isFinite(negativeBefore) && negativeBefore >= positiveBefore))) continue;

      let supported = positiveDistance <= 64;
      // A separate code block needs nearby authentication context. A subject
      // alone never promotes arbitrary numbers embedded in an address or receipt.
      if (!supported && candidate.display === block && index > 0) {
        const previous = blocks[index - 1];
        const nearby = body.slice(Math.max(0, index - 3), index - 1).join(" ");
        const followsCodeLabel = previous.length <= 160 && ranges(previous, codeContext).length > 0;
        supported = (followsCodeLabel || subjectIsAuthentication)
          && ranges(nearby, otherNumberContext).length === 0;
      }
      if (supported) accepted.set(candidate.value, { display: candidate.display, value: candidate.value });
    }
  }

  // Do not guess between distinct plausible codes, even if one appears first.
  return accepted.size === 1 ? accepted.values().next().value! : null;
}

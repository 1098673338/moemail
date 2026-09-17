type MessageContent = {
  subject: string;
  textBody: string;
  htmlBody?: string | null;
};

export const OPENAI_ACCESS_DEACTIVATED_PREFIXES = [
  "OpenAI - Access Deactivated",
  "OpenAI - アクセスが無効になりました",
] as const;

function normalizeMessageText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function messageSummary(message: Pick<MessageContent, "textBody" | "htmlBody">) {
  const htmlSource = message.htmlBody
    ?.replace(/<(style|script|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  const source = normalizeMessageText(htmlSource || message.textBody);
  return source || "没有可显示的邮件摘要";
}

export function isOpenAiAccessDeactivatedMessage(message: MessageContent) {
  const subject = normalizeMessageText(message.subject);
  const summary = messageSummary(message);
  return OPENAI_ACCESS_DEACTIVATED_PREFIXES.some((prefix) => subject.startsWith(prefix) || summary.startsWith(prefix));
}

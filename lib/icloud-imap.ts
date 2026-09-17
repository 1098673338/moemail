
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CRLF = encoder.encode("\r\n");
const IMAP_HOST = "imap.mail.me.com";
const IMAP_PORT = 993;

type Mailbox = { uidValidity: string | null };
export type IcloudImapMessage = { uid: number; internalDate: Date | null; source: Uint8Array };

function concat(left: Uint8Array, right: Uint8Array) {
  const value = new Uint8Array(left.length + right.length);
  value.set(left);
  value.set(right, left.length);
  return value;
}

function bytes(value: string) { return encoder.encode(value); }

function indexOf(haystack: Uint8Array, needle: Uint8Array, from = 0) {
  outer: for (let index = from; index <= haystack.length - needle.length; index++) {
    for (let offset = 0; offset < needle.length; offset++) if (haystack[index + offset] !== needle[offset]) continue outer;
    return index;
  }
  return -1;
}

function lastIndexOf(haystack: Uint8Array, needle: Uint8Array) {
  for (let index = haystack.length - needle.length; index >= 0; index--) {
    let matches = true;
    for (let offset = 0; offset < needle.length; offset++) if (haystack[index + offset] !== needle[offset]) { matches = false; break; }
    if (matches) return index;
  }
  return -1;
}

function quote(value: string) { return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }

function timeout<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(label)), milliseconds); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

/**
 * Minimal IMAP-over-TLS client for the Workers runtime. It deliberately uses
 * `cloudflare:sockets` instead of a Node IMAP package, whose net/tls streams do
 * not provide a reliable Workers transport contract.
 */
export class IcloudImapClient {
  private socket: Socket | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private pending = new Uint8Array();
  private sequence = 0;

  async connect(username: string, password: string) {
    // Keep the Workers-only module out of Next's Node.js route-metadata pass.
    // OpenNext resolves this import in the deployed Workers bundle.
    const workerSocketsModule = "cloudflare:" + "sockets";
    const { connect } = await import(workerSocketsModule);
    const socket = connect({ hostname: IMAP_HOST, port: IMAP_PORT }, { secureTransport: "on", allowHalfOpen: false });
    this.socket = socket;
    await timeout(socket.opened, 15_000, "无法连接 iCloud IMAP 服务器，请稍后重试");
    this.reader = socket.readable.getReader() as ReadableStreamDefaultReader<Uint8Array>;
    this.writer = socket.writable.getWriter() as WritableStreamDefaultWriter<Uint8Array>;
    const greeting = decoder.decode(await this.readUntilLine());
    if (!/^\* (OK|PREAUTH)\b/i.test(greeting)) throw new Error("iCloud IMAP 服务器未返回有效问候语");
    if (!/^\* PREAUTH\b/i.test(greeting)) await this.command(`LOGIN ${quote(username)} ${quote(password)}`);
  }

  async examineInbox(): Promise<Mailbox> {
    const response = decoder.decode(await this.command('EXAMINE "INBOX"'));
    return { uidValidity: response.match(/\[UIDVALIDITY (\d+)\]/i)?.[1] || null };
  }

  async searchUids() {
    const response = decoder.decode(await this.command("UID SEARCH ALL"));
    const list = response.match(/^\* SEARCH(?:\s+(.*))?$/mi)?.[1] || "";
    return list.split(/\s+/).map(Number).filter((value) => Number.isSafeInteger(value) && value > 0);
  }

  async fetchMessage(uid: number): Promise<IcloudImapMessage | null> {
    const response = await this.command(`UID FETCH ${uid} (UID INTERNALDATE BODY.PEEK[])`);
    const firstLineEnd = indexOf(response, CRLF);
    if (firstLineEnd < 0) return null;
    const firstLine = decoder.decode(response.slice(0, firstLineEnd));
    const match = firstLine.match(/^\* \d+ FETCH \(UID (\d+) INTERNALDATE "([^"]+)" BODY\.PEEK\[\] \{(\d+)\}$/i);
    if (!match) return null;
    const sourceStart = firstLineEnd + CRLF.length;
    const size = Number(match[3]);
    if (!Number.isSafeInteger(size) || size < 0 || response.length < sourceStart + size) throw new Error("iCloud IMAP 返回了不完整的邮件内容");
    const internalDate = new Date(match[2]);
    return { uid: Number(match[1]), internalDate: Number.isNaN(internalDate.getTime()) ? null : internalDate, source: response.slice(sourceStart, sourceStart + size) };
  }

  async deleteMessage(uid: number) {
    await this.command(`UID STORE ${uid} +FLAGS.SILENT (\\Deleted)`);
    await this.command("EXPUNGE");
  }

  async logout() {
    try { if (this.writer) await this.command("LOGOUT"); } catch { /* close below */ }
    await this.close();
  }

  async close() {
    try { await this.reader?.cancel(); } catch { /* socket is already closed */ }
    try { await this.writer?.close(); } catch { /* socket is already closed */ }
    try { await this.socket?.close(); } catch { /* socket is already closed */ }
    this.reader = null;
    this.writer = null;
    this.socket = null;
  }

  private async command(command: string) {
    if (!this.writer) throw new Error("iCloud IMAP 连接未建立");
    const tag = `A${String(++this.sequence).padStart(4, "0")}`;
    await this.writer.write(bytes(`${tag} ${command}\r\n`));
    const response = await timeout(this.readTagged(tag), 20_000, "iCloud IMAP 服务器响应超时，请稍后重试");
    const marker = bytes(`\r\n${tag} `);
    const taggedAt = lastIndexOf(response, marker);
    const tagged = decoder.decode(response.slice(taggedAt >= 0 ? taggedAt + CRLF.length : 0));
    if (!new RegExp(`^${tag} OK\\b`, "i").test(tagged)) throw new Error(this.commandError(tagged));
    return response;
  }

  private commandError(line: string) {
    const auth = /\b(?:AUTHENTICATIONFAILED|LOGIN failed|invalid credentials)\b/i.test(line);
    return auth ? "iCloud 用户名或 App 专用密码无效" : `iCloud IMAP 请求失败：${line.slice(0, 240)}`;
  }

  private async readTagged(tag: string): Promise<Uint8Array> {
    const prefix = bytes(`${tag} `);
    const marker = bytes(`\r\n${tag} `);
    for (;;) {
      const at = this.pending.length >= prefix.length && indexOf(this.pending, prefix) === 0 ? 0 : indexOf(this.pending, marker);
      if (at >= 0) {
        const lineStart = at === 0 ? 0 : at + CRLF.length;
        const lineEnd = indexOf(this.pending, CRLF, lineStart);
        if (lineEnd >= 0) {
          const response = this.pending.slice(0, lineEnd + CRLF.length);
          this.pending = this.pending.slice(lineEnd + CRLF.length);
          return response;
        }
      }
      await this.readMore();
    }
  }

  private async readUntilLine(): Promise<Uint8Array> {
    for (;;) {
      const end = indexOf(this.pending, CRLF);
      if (end >= 0) {
        const line = this.pending.slice(0, end + CRLF.length);
        this.pending = this.pending.slice(end + CRLF.length);
        return line;
      }
      await this.readMore();
    }
  }

  private async readMore() {
    if (!this.reader) throw new Error("iCloud IMAP 连接已关闭");
    const next = await this.reader.read();
    if (next.done) throw new Error("iCloud IMAP 服务器提前关闭了连接");
    this.pending = concat(this.pending, next.value);
  }
}

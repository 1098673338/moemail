import { and, desc, eq, gt, sql } from "drizzle-orm"
import { getRequestContext } from "@cloudflare/next-on-pages"
import PostalMime, { type Address } from "postal-mime"
import { EMAIL_CONFIG } from "@/config"
import { getUserRole } from "@/lib/auth"
import { createDb, type Db } from "@/lib/db"
import { ROLES } from "@/lib/permissions"
import { externalMailAccounts, emails, messages, users } from "@/lib/schema"

const ICLOUD_MAIL_PROVIDER = "icloud"
const ICLOUD_MAIL_DOMAINS = new Set(["icloud.com", "me.com", "mac.com"])

export const ICLOUD_MAIL_SETTINGS = {
  imapHost: "imap.mail.me.com",
  imapPort: 993,
  smtpHost: "smtp.mail.me.com",
  smtpPort: 587,
} as const

export const EXTERNAL_MAIL_INITIAL_SYNC_LIMIT = 100
export const EXTERNAL_MAIL_INCREMENTAL_SYNC_LIMIT = 50

export type ExternalMailAccountRecord = typeof externalMailAccounts.$inferSelect

export interface ExternalMailConnectionAccount {
  id: string
  emailId: string
  emailAddress: string
  username: string
  enabled: boolean
  lastUid: number
}

export interface SyncedExternalMailMessage {
  id: string
  emailId: string
  fromAddress: string
  toAddress: string
  subject: string
  content: string
  html: string | null
  type: "received"
  receivedAt: Date
  sentAt: Date
}

interface ExternalMailCredentials {
  username: string
  password: string
}

interface TestIcloudConnectionCredentials extends ExternalMailCredentials {
  emailAddress?: string
}

type ExternalMailRuntimeError = Error & {
  authenticationFailed?: boolean
  serverResponseCode?: string
  responseCode?: number
  response?: string
  responseText?: string
  code?: string
}

interface CreateExternalMailAccountInput extends ExternalMailCredentials {
  emailAddress: string
  enabled?: boolean
}

interface SendExternalMailInput {
  to: string
  subject: string
  content: string
}

interface SyncExternalMailOptions {
  rescan?: boolean
}

interface ImapFetchedMessage {
  uid: number
  source: Uint8Array
  internalDate?: Date
}

interface ImapCommandResponse {
  tag: string
  ok: boolean
  lines: string[]
}

interface ImapMailboxStatus {
  exists: number
  uidNext: number | null
  uidValidity: number | null
}

type SocketConnect = (address: SocketAddress | string, options?: SocketOptions) => Socket

const PERMANENT_EXPIRES_AT = new Date("9999-01-01T00:00:00.000Z")
const MESSAGE_ID_HEADER_REGEX = /<([^>]+)>/
const TEXT_URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"']+/gi
const TRAILING_URL_PUNCTUATION = ".,!?;:]}"
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function getExternalMailSecret() {
  const localDevSecret = process.env.NODE_ENV === "development"
    ? "moemail-local-development-secret"
    : undefined
  const secret = process.env.EXTERNAL_MAIL_SECRET || process.env.AUTH_SECRET || localDevSecret

  if (!secret) {
    throw new Error("iCloud 邮箱密钥未配置，请设置 EXTERNAL_MAIL_SECRET 或 AUTH_SECRET")
  }

  return secret
}

async function getSocketConnect(): Promise<SocketConnect> {
  const sockets = await import(/* webpackIgnore: true */ "cloudflare:sockets") as { connect: SocketConnect }
  return sockets.connect
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function bytesToBase64Url(bytes: Uint8Array) {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  return base64ToBytes(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))
}

function concatBytes(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  return result
}

async function sha256Bytes(value: string | Uint8Array) {
  const input = typeof value === "string" ? textEncoder.encode(value) : value
  return new Uint8Array(await crypto.subtle.digest("SHA-256", input))
}

async function sha256Hex(value: string | Uint8Array) {
  return Array.from(await sha256Bytes(value))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")
}

async function getExternalMailCryptoKey() {
  const digest = await sha256Bytes(getExternalMailSecret())
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  )
}

export async function encryptExternalMailPassword(password: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await getExternalMailCryptoKey(),
    textEncoder.encode(password)
  ))

  return [
    "v2",
    bytesToBase64Url(iv),
    bytesToBase64Url(encrypted),
  ].join(":")
}

export async function decryptExternalMailPassword(encryptedPassword: string) {
  const [version, iv, encrypted] = encryptedPassword.split(":")

  if (version !== "v2" || !iv || !encrypted) {
    throw new Error("iCloud 邮箱凭据格式无效")
  }

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(iv) },
    await getExternalMailCryptoKey(),
    base64UrlToBytes(encrypted)
  )

  return textDecoder.decode(decrypted)
}

function normalizeEmailAddress(value: string) {
  return value.trim().toLowerCase()
}

function normalizeUsername(value: string) {
  return value.trim()
}

function isIcloudMailAddress(value: string) {
  const domain = getAddressDomain(normalizeEmailAddress(value))
  return Boolean(domain && ICLOUD_MAIL_DOMAINS.has(domain))
}

function assertIcloudMailAddress(value: string) {
  if (!isIcloudMailAddress(value)) {
    throw new Error("目前仅支持 iCloud 邮箱地址（@icloud.com、@me.com 或 @mac.com）")
  }
}

function getHostname(value?: string | null) {
  const input = value?.trim()
  if (!input) return null

  try {
    return new URL(input.includes("://") ? input : `https://${input}`).hostname
  } catch {
    return null
  }
}

function getAddressDomain(value?: string | null) {
  const input = value?.trim()
  if (!input || !input.includes("@")) return null
  return input.split("@").pop() || null
}

function normalizeMailDomain(value?: string | null) {
  const hostname = getHostname(value) || getAddressDomain(value)
  const domain = hostname?.trim().toLowerCase().replace(/\.$/, "")

  if (
    !domain
    || domain === "localhost"
    || domain.endsWith(".local")
    || !domain.includes(".")
    || !/^[a-z0-9.-]+$/.test(domain)
  ) {
    return null
  }

  return domain
}

function getOutboundMailDomain(fromAddress?: string) {
  return normalizeMailDomain(process.env.EXTERNAL_MAIL_DOMAIN)
    || normalizeMailDomain(process.env.NEXT_PUBLIC_BASE_URL)
    || normalizeMailDomain(process.env.CUSTOM_DOMAIN)
    || normalizeMailDomain(process.env.CF_PAGES_URL)
    || normalizeMailDomain(process.env.VERCEL_URL)
    || normalizeMailDomain(fromAddress)
    || "moemail.app"
}

function getDisplayAddress(address?: Address | null) {
  if (!address) return ""
  if (address.address && address.name) return `${address.name} <${address.address}>`
  return address.address || address.name || ""
}

function getDisplayAddresses(addresses?: Address[] | null) {
  return addresses?.map(getDisplayAddress).filter(Boolean).join(", ") || ""
}

function getParsedMessageTimestamp(parsedDate?: string, fallbackDate?: Date | string) {
  const parsedTime = parsedDate ? new Date(parsedDate).getTime() : NaN
  if (Number.isFinite(parsedTime)) return new Date(parsedTime)

  if (fallbackDate) {
    const fallbackTime = new Date(fallbackDate).getTime()
    if (Number.isFinite(fallbackTime)) return new Date(fallbackTime)
  }

  return new Date()
}

async function getExternalMessageId(accountId: string, uid: number, parsedMessageId?: string) {
  const stableMessageId = parsedMessageId?.match(MESSAGE_ID_HEADER_REGEX)?.[1] || parsedMessageId
  const suffix = stableMessageId
    ? (await sha256Hex(stableMessageId)).slice(0, 16)
    : String(uid)

  return `external:${accountId}:${uid}:${suffix}`
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || value
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      default:
        return "&#39;"
    }
  })
}

function trimTrailingUrlPunctuation(value: string) {
  let url = value
  let trailing = ""

  while (url.length > 0) {
    const lastChar = url[url.length - 1]
    const shouldTrimClosingParen = lastChar === ")"
      && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)

    if (!TRAILING_URL_PUNCTUATION.includes(lastChar) && !shouldTrimClosingParen) {
      break
    }

    trailing = lastChar + trailing
    url = url.slice(0, -1)
  }

  return { url, trailing }
}

function getSafeTextUrlHref(value: string) {
  const href = value.toLowerCase().startsWith("www.")
    ? `https://${value}`
    : value

  try {
    const url = new URL(href)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null
  } catch {
    return null
  }
}

function textToLinkedHtml(value: string) {
  let lastIndex = 0
  let hasLink = false
  const htmlParts: string[] = []

  for (const match of value.matchAll(TEXT_URL_REGEX)) {
    const matchedText = match[0]
    const matchIndex = match.index ?? 0
    const { url, trailing } = trimTrailingUrlPunctuation(matchedText)
    const href = getSafeTextUrlHref(url)

    htmlParts.push(escapeHtml(value.slice(lastIndex, matchIndex)))

    if (href) {
      hasLink = true
      htmlParts.push(`<a href="${escapeHtml(href)}">${escapeHtml(url)}</a>`)
    } else {
      htmlParts.push(escapeHtml(matchedText))
    }

    if (trailing) {
      htmlParts.push(escapeHtml(trailing))
    }

    lastIndex = matchIndex + matchedText.length
  }

  if (!hasLink) return null

  htmlParts.push(escapeHtml(value.slice(lastIndex)))

  return `<div>${htmlParts.join("").replace(/\r?\n/g, "<br />")}</div>`
}

function normalizeLineBreaks(value: string) {
  return value.replace(/\r?\n/g, "\r\n")
}

function encodeMimeHeader(value: string) {
  return /^[\x00-\x7F]*$/.test(value)
    ? value
    : `=?UTF-8?B?${bytesToBase64(textEncoder.encode(value))}?=`
}

function formatMessageDate(date: Date) {
  return date.toUTCString().replace("GMT", "+0000")
}

function createRawEmail(from: string, input: SendExternalMailInput, messageIdDomain: string) {
  const boundary = `moemail-${crypto.randomUUID()}`
  const html = normalizeLineBreaks(input.content)
  const text = normalizeLineBreaks(stripHtml(input.content))

  return [
    `From: <${from}>`,
    `To: <${input.to}>`,
    `Subject: ${encodeMimeHeader(input.subject)}`,
    `Date: ${formatMessageDate(new Date())}`,
    `Message-ID: <${crypto.randomUUID()}@${messageIdDomain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    `--${boundary}--`,
    "",
  ].join("\r\n")
}

function isExternalMailAuthError(error: ExternalMailRuntimeError) {
  const code = String(error.code || "").toUpperCase()
  const serverResponseCode = String(error.serverResponseCode || "").toUpperCase()
  const response = `${error.response || ""} ${error.responseText || ""} ${error.message || ""}`.toUpperCase()

  return Boolean(
    error.authenticationFailed
    || code === "EAUTH"
    || serverResponseCode === "AUTHENTICATIONFAILED"
    || error.responseCode === 535
    || response.includes("AUTHENTICATIONFAILED")
    || response.includes("AUTHENTICATION FAILED")
    || response.includes("LOGIN FAILED")
    || response.includes("AUTHENTICATION FAILED")
    || response.includes("[AUTHENTICATIONFAILED]")
  )
}

function isExternalMailNetworkError(error: ExternalMailRuntimeError) {
  const code = String(error.code || "").toUpperCase()
  const message = String(error.message || "").toUpperCase()

  return [
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EHOSTUNREACH",
    "ENETUNREACH",
  ].includes(code) || message.includes("SOCKET") || message.includes("NETWORK")
}

export function getExternalMailErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback

  const mailError = error as ExternalMailRuntimeError

  if (isExternalMailAuthError(mailError)) {
    return "iCloud 认证失败：请确认 Apple ID 正确，并使用 Apple 生成的 App 专用密码，不是网页登录密码"
  }

  if (isExternalMailNetworkError(mailError)) {
    return "无法连接 iCloud 邮件服务器，请检查本机网络、防火墙或代理设置"
  }

  if (mailError.message && mailError.message !== "Command failed") {
    return mailError.message
  }

  return fallback
}

class SocketLineClient {
  private reader: ReadableStreamDefaultReader<Uint8Array>
  private writer: WritableStreamDefaultWriter<Uint8Array>
  private chunks: Uint8Array[] = []
  private bufferedLength = 0

  constructor(private socket: Socket) {
    this.reader = socket.readable.getReader()
    this.writer = socket.writable.getWriter()
  }

  async write(value: string | Uint8Array) {
    await this.writer.write(typeof value === "string" ? textEncoder.encode(value) : value)
  }

  async writeLine(value: string) {
    await this.write(`${value}\r\n`)
  }

  async readLine() {
    while (true) {
      const buffered = this.readBufferedLine()
      if (buffered !== null) return buffered

      const { value, done } = await this.reader.read()
      if (done) {
        throw new Error("邮件服务器连接已关闭")
      }

      if (value?.length) {
        this.chunks.push(value)
        this.bufferedLength += value.length
      }
    }
  }

  async readBytes(length: number) {
    while (this.bufferedLength < length) {
      const { value, done } = await this.reader.read()
      if (done) {
        throw new Error("邮件服务器连接已关闭")
      }
      if (value?.length) {
        this.chunks.push(value)
        this.bufferedLength += value.length
      }
    }

    const output = new Uint8Array(length)
    let copied = 0

    while (copied < length) {
      const chunk = this.chunks[0]
      const take = Math.min(chunk.length, length - copied)
      output.set(chunk.subarray(0, take), copied)
      copied += take

      if (take === chunk.length) {
        this.chunks.shift()
      } else {
        this.chunks[0] = chunk.subarray(take)
      }
    }

    this.bufferedLength -= length
    return output
  }

  async close() {
    try {
      await this.writer.close()
    } catch {
      // The peer often closes first after LOGOUT/QUIT.
    }

    try {
      this.reader.releaseLock()
      this.writer.releaseLock()
    } catch {
      // Ignore cleanup-only failures.
    }

    await this.socket.close().catch(() => undefined)
  }

  release() {
    this.reader.releaseLock()
    this.writer.releaseLock()
  }

  startTls(options?: TlsOptions) {
    return this.socket.startTls(options)
  }

  private readBufferedLine() {
    if (!this.bufferedLength) return null

    const all = concatBytes(this.chunks)
    for (let index = 0; index < all.length; index += 1) {
      if (all[index] === 0x0a) {
        const lineBytes = all.subarray(0, index + 1)
        const remaining = all.subarray(index + 1)
        this.chunks = remaining.length ? [remaining] : []
        this.bufferedLength = remaining.length
        return textDecoder.decode(lineBytes).replace(/\r?\n$/, "")
      }
    }

    this.chunks = [all]
    this.bufferedLength = all.length
    return null
  }
}

class SmtpClient {
  private client: SocketLineClient | null = null
  private readonly heloDomain: string

  constructor(
    private account: ExternalMailConnectionAccount,
    private password: string
  ) {
    this.heloDomain = getOutboundMailDomain(account.emailAddress)
  }

  async connect() {
    const connectSocket = await getSocketConnect()
    this.client = new SocketLineClient(connectSocket(
      { hostname: ICLOUD_MAIL_SETTINGS.smtpHost, port: ICLOUD_MAIL_SETTINGS.smtpPort },
      { secureTransport: "starttls", allowHalfOpen: false }
    ))
    await this.expect([220])
    await this.ehlo()

    await this.command("STARTTLS", [220])
    this.client.release()
    const tlsSocket = this.client.startTls({
      expectedServerHostname: ICLOUD_MAIL_SETTINGS.smtpHost,
    })
    this.client = new SocketLineClient(tlsSocket)
    await this.ehlo()

    await this.auth()
  }

  async verify() {
    await this.command("NOOP", [250])
  }

  async sendMail(fromAddress: string, input: SendExternalMailInput) {
    await this.command(`MAIL FROM:<${fromAddress}>`, [250])
    await this.command(`RCPT TO:<${input.to}>`, [250, 251])
    await this.command("DATA", [354])
    await this.write(`${createRawEmail(fromAddress, input, this.heloDomain)}\r\n.\r\n`)
    await this.expect([250])
  }

  async quit() {
    if (!this.client) return
    await this.command("QUIT", [221]).catch(() => undefined)
    await this.client.close()
    this.client = null
  }

  private async ehlo() {
    await this.command(`EHLO ${this.heloDomain}`, [250])
  }

  private async auth() {
    const payload = bytesToBase64(textEncoder.encode(`\u0000${this.account.username}\u0000${this.password}`))
    await this.command(`AUTH PLAIN ${payload}`, [235])
  }

  private async write(value: string | Uint8Array) {
    if (!this.client) throw new Error("SMTP 未连接")
    await this.client.write(value)
  }

  private async command(command: string, expectedCodes: number[]) {
    if (!this.client) throw new Error("SMTP 未连接")
    await this.client.writeLine(command)
    return this.expect(expectedCodes)
  }

  private async expect(expectedCodes: number[]) {
    if (!this.client) throw new Error("SMTP 未连接")

    const lines: string[] = []
    let code = 0

    while (true) {
      const line = await this.client.readLine()
      lines.push(line)
      code = Number(line.slice(0, 3))
      if (line[3] !== "-") break
    }

    if (!expectedCodes.includes(code)) {
      const error = new Error(`SMTP 命令失败：${lines.join(" ")}`) as ExternalMailRuntimeError
      error.responseCode = code
      error.responseText = lines.join(" ")
      throw error
    }

    return lines
  }
}

class ImapClient {
  private client: SocketLineClient | null = null
  private tagCounter = 0

  constructor(
    private account: ExternalMailConnectionAccount,
    private password: string
  ) {}

  async connect() {
    const connectSocket = await getSocketConnect()
    this.client = new SocketLineClient(connectSocket(
      { hostname: ICLOUD_MAIL_SETTINGS.imapHost, port: ICLOUD_MAIL_SETTINGS.imapPort },
      { secureTransport: "on", allowHalfOpen: false }
    ))
    const greeting = await this.readLine()
    if (!greeting.includes("* OK")) {
      throw new Error(`IMAP 服务器响应异常：${greeting}`)
    }

    await this.command(`LOGIN ${this.quote(this.account.username)} ${this.quote(this.password)}`)
  }

  async openInbox() {
    const response = await this.command('SELECT "INBOX"')
    return this.parseMailboxStatus(response.lines)
  }

  async searchNewUids(lastUid: number) {
    const response = await this.command(lastUid > 0
      ? `UID SEARCH UID ${lastUid + 1}:* NOT DELETED`
      : "UID SEARCH NOT DELETED"
    )
    const searchLine = response.lines.find(line => line.startsWith("* SEARCH"))
    if (!searchLine) return []

    return searchLine
      .replace(/^\* SEARCH\s*/i, "")
      .trim()
      .split(/\s+/)
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value > 0)
  }

  async fetchMessages(uids: number[]) {
    if (!uids.length) return []

    const messages = await this.fetchMessagesBatch(uids)
    if (messages.length > 0 || uids.length <= 1) return messages

    const retryMessages: ImapFetchedMessage[] = []
    for (const uid of uids) {
      retryMessages.push(...await this.fetchMessagesBatch([uid]))
    }

    return retryMessages
  }

  async fetchCurrentMessages(exists: number, limit: number) {
    if (exists <= 0 || limit <= 0) return []

    const end = exists
    const start = Math.max(1, exists - limit + 1)
    return this.fetchMessagesBySequence(`${start}:${end}`)
  }

  private async fetchMessagesBatch(uids: number[]) {
    if (!uids.length) return []
    const tag = this.nextTag()
    await this.writeLine(`${tag} UID FETCH ${uids.join(",")} (UID INTERNALDATE BODY.PEEK[])`)
    const fallbackUid = uids.length === 1 ? uids[0] : null

    return this.readFetchMessages(tag, fallbackUid)
  }

  private async fetchMessagesBySequence(sequenceSet: string) {
    const tag = this.nextTag()
    await this.writeLine(`${tag} FETCH ${sequenceSet} (UID INTERNALDATE BODY.PEEK[])`)

    return this.readFetchMessages(tag, null)
  }

  private async readFetchMessages(tag: string, fallbackUid: number | null) {
    const messages: ImapFetchedMessage[] = []
    const lines: string[] = []

    while (true) {
      const line = await this.readLine()
      lines.push(line)

      if (line.startsWith(`${tag} `)) {
        if (!line.toUpperCase().includes(`${tag} OK`)) {
          throw new Error(`IMAP FETCH 失败：${lines.join(" ")}`)
        }
        return messages
      }

      const literalMatch = line.match(/~?\{(\d+)\+?\}$/)
      if (!literalMatch) continue

      const source = await this.readBytes(Number(literalMatch[1]))
      const tail = await this.readLine()
      const metadata = `${line} ${tail}`
      const uid = this.parseUid(metadata) ?? fallbackUid
      const internalDate = this.parseInternalDate(metadata)

      if (uid) {
        messages.push({ uid, source, internalDate })
      }
    }
  }

  async logout() {
    if (!this.client) return
    await this.command("LOGOUT").catch(() => undefined)
    await this.client.close()
    this.client = null
  }

  private async command(command: string): Promise<ImapCommandResponse> {
    const tag = this.nextTag()
    await this.writeLine(`${tag} ${command}`)

    const lines: string[] = []

    while (true) {
      const line = await this.readLine()
      lines.push(line)

      if (line.startsWith(`${tag} `)) {
        const ok = line.toUpperCase().startsWith(`${tag} OK`)
        if (!ok) {
          const error = new Error(`IMAP 命令失败：${lines.join(" ")}`) as ExternalMailRuntimeError
          error.responseText = lines.join(" ")
          if (lines.join(" ").toUpperCase().includes("AUTHENTICATIONFAILED")) {
            error.authenticationFailed = true
          }
          throw error
        }

        return { tag, ok, lines }
      }
    }
  }

  private nextTag() {
    this.tagCounter += 1
    return `M${String(this.tagCounter).padStart(4, "0")}`
  }

  private quote(value: string) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
  }

  private async writeLine(value: string) {
    if (!this.client) throw new Error("IMAP 未连接")
    await this.client.writeLine(value)
  }

  private async readLine() {
    if (!this.client) throw new Error("IMAP 未连接")
    return this.client.readLine()
  }

  private async readBytes(length: number) {
    if (!this.client) throw new Error("IMAP 未连接")
    return this.client.readBytes(length)
  }

  private parseUid(value: string) {
    const match = value.match(/\bUID\s+(\d+)/i)
    return match ? Number(match[1]) : null
  }

  private parseInternalDate(value: string) {
    const match = value.match(/INTERNALDATE\s+"([^"]+)"/i)
    if (!match) return undefined
    const timestamp = new Date(match[1]).getTime()
    return Number.isFinite(timestamp) ? new Date(timestamp) : undefined
  }

  private parseMailboxStatus(lines: string[]): ImapMailboxStatus {
    const joinedLines = lines.join(" ")
    const existsLine = lines.find(line => /^\*\s+\d+\s+EXISTS$/i.test(line))
    const existsMatch = existsLine?.match(/^\*\s+(\d+)\s+EXISTS$/i)
    const uidNextMatch = joinedLines.match(/\[UIDNEXT\s+(\d+)\]/i)
    const uidValidityMatch = joinedLines.match(/\[UIDVALIDITY\s+(\d+)\]/i)

    return {
      exists: existsMatch ? Number(existsMatch[1]) : 0,
      uidNext: uidNextMatch ? Number(uidNextMatch[1]) : null,
      uidValidity: uidValidityMatch ? Number(uidValidityMatch[1]) : null,
    }
  }
}

export async function testIcloudConnection(credentials: TestIcloudConnectionCredentials) {
  const emailAddress = normalizeEmailAddress(credentials.emailAddress || credentials.username)
  const username = normalizeUsername(credentials.username || emailAddress)

  if (!username || !credentials.password) {
    throw new Error("请输入 Apple ID 邮箱和 App 专用密码")
  }

  assertIcloudMailAddress(emailAddress)

  const account: ExternalMailConnectionAccount = {
    id: "connection-test",
    emailId: "",
    emailAddress,
    username,
    enabled: true,
    lastUid: 0,
  }

  const imapClient = new ImapClient(account, credentials.password)
  try {
    await imapClient.connect()
    await imapClient.openInbox()
  } finally {
    await imapClient.logout().catch(() => undefined)
  }

  const smtpClient = new SmtpClient(account, credentials.password)
  try {
    await smtpClient.connect()
    await smtpClient.verify()
  } finally {
    await smtpClient.quit().catch(() => undefined)
  }
}

async function assertEmailCapacity(db: Db, userId: string) {
  const userRole = await getUserRole(userId)
  if (userRole === ROLES.EMPEROR) return

  const activeEmailsCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(emails)
    .where(
      and(
        eq(emails.userId, userId),
        gt(emails.expiresAt, new Date())
      )
    )
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      maxEmails: true,
    },
  })
  const siteMaxEmailsValue = await getRequestContext().env.SITE_CONFIG.get("MAX_EMAILS")
  const siteMaxEmails = siteMaxEmailsValue && siteMaxEmailsValue.trim() !== "" ? Number(siteMaxEmailsValue) : NaN
  const defaultMaxEmails = Number.isInteger(siteMaxEmails) && siteMaxEmails >= 0
    ? siteMaxEmails
    : EMAIL_CONFIG.MAX_ACTIVE_EMAILS
  const maxEmails = user?.maxEmails != null && user.maxEmails >= 0
    ? user.maxEmails
    : defaultMaxEmails

  if (maxEmails !== EMAIL_CONFIG.UNLIMITED_LIMIT && Number(activeEmailsCount[0]?.count ?? 0) >= maxEmails) {
    throw new Error(`已达到最大邮箱数量限制 (${maxEmails})`)
  }
}

export function serializeExternalMailAccount(
  account: ExternalMailAccountRecord,
  email?: Pick<typeof emails.$inferSelect, "address" | "createdAt" | "expiresAt"> | null
) {
  return {
    id: account.id,
    emailId: account.emailId,
    emailAddress: account.emailAddress,
    username: account.username,
    enabled: account.enabled,
    lastUid: account.lastUid,
    lastSyncAt: account.lastSyncAt?.getTime() ?? null,
    createdAt: account.createdAt.getTime(),
    updatedAt: account.updatedAt.getTime(),
    email: email
      ? {
          address: email.address,
          createdAt: email.createdAt.getTime(),
          expiresAt: email.expiresAt.getTime(),
        }
      : null,
  }
}

export async function listExternalMailAccounts(userId: string) {
  const db = createDb()
  const accounts = await db.query.externalMailAccounts.findMany({
    where: and(
      eq(externalMailAccounts.userId, userId),
      eq(externalMailAccounts.provider, ICLOUD_MAIL_PROVIDER)
    ),
    orderBy: desc(externalMailAccounts.createdAt),
    with: {
      email: {
        columns: {
          address: true,
          createdAt: true,
          expiresAt: true,
        },
      },
    },
  })

  return accounts.map(account => serializeExternalMailAccount(account, account.email))
}

export async function createExternalMailAccount(userId: string, input: CreateExternalMailAccountInput) {
  const db = createDb()
  const emailAddress = normalizeEmailAddress(input.emailAddress)
  const username = normalizeUsername(input.username || emailAddress)

  if (!emailAddress || !emailAddress.includes("@")) {
    throw new Error("请输入有效的 iCloud 邮箱地址")
  }

  assertIcloudMailAddress(emailAddress)

  if (!username || !input.password) {
    throw new Error("请输入 Apple ID 邮箱和 App 专用密码")
  }

  const existingAccount = await db.query.externalMailAccounts.findFirst({
    where: and(
      eq(externalMailAccounts.userId, userId),
      eq(externalMailAccounts.emailAddress, emailAddress)
    ),
  })

  if (existingAccount) {
    throw new Error("这个 iCloud 邮箱已经接入过了")
  }

  const existingEmail = await db.query.emails.findFirst({
    where: eq(sql`LOWER(${emails.address})`, emailAddress),
  })

  if (existingEmail && existingEmail.userId !== userId) {
    throw new Error("这个邮箱地址已被其他用户使用")
  }

  if (!existingEmail) {
    await assertEmailCapacity(db, userId)
  }

  const now = new Date()
  const [minSortOrderRow] = await db.select({
    sortOrder: sql<number>`coalesce(min(${emails.sortOrder}), 0)`,
  })
    .from(emails)
    .where(eq(emails.userId, userId))
  const emailRecord = existingEmail
    ? (await db.update(emails)
        .set({
          isCustom: false,
          expiresAt: PERMANENT_EXPIRES_AT,
          tag: existingEmail.tag || "iCloud",
        })
        .where(eq(emails.id, existingEmail.id))
        .returning())[0]
    : (await db.insert(emails)
        .values({
          address: emailAddress,
          isCustom: false,
          tag: "iCloud",
          createdAt: now,
          expiresAt: PERMANENT_EXPIRES_AT,
          userId,
          sortOrder: Number(minSortOrderRow?.sortOrder ?? 0) - 1,
        })
        .returning())[0]

  const account = (await db.insert(externalMailAccounts)
    .values({
      userId,
      emailId: emailRecord.id,
      provider: ICLOUD_MAIL_PROVIDER,
      emailAddress,
      username,
      passwordEncrypted: await encryptExternalMailPassword(input.password),
      imapHost: ICLOUD_MAIL_SETTINGS.imapHost,
      imapPort: ICLOUD_MAIL_SETTINGS.imapPort,
      smtpHost: ICLOUD_MAIL_SETTINGS.smtpHost,
      smtpPort: ICLOUD_MAIL_SETTINGS.smtpPort,
      enabled: input.enabled ?? true,
      lastUid: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning())[0]

  return serializeExternalMailAccount(account, emailRecord)
}

async function parseExternalMessage(
  account: ExternalMailConnectionAccount,
  input: {
    uid: number
    source: Uint8Array
    internalDate?: Date | string
  }
): Promise<SyncedExternalMailMessage> {
  const parsed = await PostalMime.parse(input.source)
  const timestamp = getParsedMessageTimestamp(parsed.date, input.internalDate)
  const id = await getExternalMessageId(account.id, input.uid, parsed.messageId)
  const content = parsed.text || ""
  const html = parsed.html || textToLinkedHtml(content)

  return {
    id,
    emailId: account.emailId,
    fromAddress: getDisplayAddress(parsed.from),
    toAddress: getDisplayAddresses(parsed.to),
    subject: parsed.subject || "(无主题)",
    content,
    html,
    type: "received",
    receivedAt: timestamp,
    sentAt: timestamp,
  }
}

export async function syncExternalMailMessages(options: {
  account: ExternalMailConnectionAccount
  password: string
  messageExists: (messageId: string) => Promise<boolean> | boolean
  insertMessage: (message: SyncedExternalMailMessage) => Promise<void> | void
  updateAccount: (cursor: { lastUid: number; lastSyncAt: Date }) => Promise<void> | void
  rescan?: boolean
}) {
  const { account, password } = options

  if (!account.enabled) {
    throw new Error("iCloud 邮箱账号已停用")
  }

  const client = new ImapClient(account, password)
  let fetched = 0
  let imported = 0
  let maxUid = account.lastUid
  let inboxExists = 0
  let searched = 0
  let selected = 0
  let uidNext: number | null = null
  const syncedAt = new Date()

  try {
    await client.connect()
    const mailboxStatus = await client.openInbox()
    inboxExists = mailboxStatus.exists
    uidNext = mailboxStatus.uidNext

    const shouldFetchCurrentInbox = options.rescan || account.lastUid <= 0
    let fetchedMessages = shouldFetchCurrentInbox
      ? await client.fetchCurrentMessages(inboxExists, EXTERNAL_MAIL_INITIAL_SYNC_LIMIT)
      : await (async () => {
          const uids = await client.searchNewUids(account.lastUid)
          searched = uids.length
          const selectedUids = uids.slice(0, EXTERNAL_MAIL_INCREMENTAL_SYNC_LIMIT)
          selected = selectedUids.length
          return client.fetchMessages(selectedUids)
        })()

    if (shouldFetchCurrentInbox) {
      searched = inboxExists
      selected = fetchedMessages.length

      if (inboxExists > 0 && fetchedMessages.length === 0) {
        const uids = await client.searchNewUids(0)
        const selectedUids = uids.slice(-Math.min(inboxExists, EXTERNAL_MAIL_INITIAL_SYNC_LIMIT))
        searched = uids.length
        selected = selectedUids.length
        fetchedMessages = await client.fetchMessages(selectedUids)
      }
    }

    for (const message of fetchedMessages) {
      fetched += 1
      maxUid = Math.max(maxUid, message.uid)

      const parsedMessage = await parseExternalMessage(account, {
        uid: message.uid,
        source: message.source,
        internalDate: message.internalDate,
      })

      if (await options.messageExists(parsedMessage.id)) continue

      await options.insertMessage(parsedMessage)
      imported += 1
    }

    await options.updateAccount({
      lastUid: maxUid,
      lastSyncAt: syncedAt,
    })
  } finally {
    await client.logout().catch(() => undefined)
  }

  return {
    fetched,
    imported,
    inboxExists,
    searched,
    selected,
    uidNext,
    rescan: Boolean(options.rescan),
    lastUid: maxUid,
    lastSyncAt: syncedAt.getTime(),
  }
}

export async function syncExternalMailAccount(userId: string, accountId: string, options?: SyncExternalMailOptions) {
  const db = createDb()
  const account = await db.query.externalMailAccounts.findFirst({
    where: and(
      eq(externalMailAccounts.id, accountId),
      eq(externalMailAccounts.userId, userId),
      eq(externalMailAccounts.provider, ICLOUD_MAIL_PROVIDER)
    ),
  })

  if (!account) {
    throw new Error("iCloud 邮箱账号不存在")
  }

  if (!account.enabled) {
    throw new Error("iCloud 邮箱账号已停用")
  }

  const password = await decryptExternalMailPassword(account.passwordEncrypted)

  return syncExternalMailMessages({
    account,
    password,
    rescan: options?.rescan,
    messageExists: async (messageId) => {
      const existing = await db.query.messages.findFirst({
        where: eq(messages.id, messageId),
        columns: {
          id: true,
        },
      })
      return Boolean(existing)
    },
    insertMessage: async (message) => {
      await db.insert(messages).values({
        id: message.id,
        emailId: message.emailId,
        fromAddress: message.fromAddress,
        toAddress: message.toAddress,
        subject: message.subject,
        content: message.content,
        html: message.html,
        type: message.type,
        receivedAt: message.receivedAt,
        sentAt: message.sentAt,
      })
    },
    updateAccount: async ({ lastUid, lastSyncAt }) => {
      await db.update(externalMailAccounts)
        .set({
          lastUid,
          lastSyncAt,
          updatedAt: new Date(),
        })
        .where(eq(externalMailAccounts.id, account.id))
    },
  })
}

export async function syncExternalMailAccountByEmailId(emailId: string, options?: SyncExternalMailOptions) {
  const db = createDb()
  const account = await db.query.externalMailAccounts.findFirst({
    where: and(
      eq(externalMailAccounts.emailId, emailId),
      eq(externalMailAccounts.provider, ICLOUD_MAIL_PROVIDER),
      eq(externalMailAccounts.enabled, true)
    ),
  })

  if (!account) return null

  const password = await decryptExternalMailPassword(account.passwordEncrypted)

  return syncExternalMailMessages({
    account,
    password,
    rescan: options?.rescan,
    messageExists: async (messageId) => {
      const existing = await db.query.messages.findFirst({
        where: eq(messages.id, messageId),
        columns: {
          id: true,
        },
      })
      return Boolean(existing)
    },
    insertMessage: async (message) => {
      await db.insert(messages).values({
        id: message.id,
        emailId: message.emailId,
        fromAddress: message.fromAddress,
        toAddress: message.toAddress,
        subject: message.subject,
        content: message.content,
        html: message.html,
        type: message.type,
        receivedAt: message.receivedAt,
        sentAt: message.sentAt,
      })
    },
    updateAccount: async ({ lastUid, lastSyncAt }) => {
      await db.update(externalMailAccounts)
        .set({
          lastUid,
          lastSyncAt,
          updatedAt: new Date(),
        })
        .where(eq(externalMailAccounts.id, account.id))
    },
  })
}

export async function deleteExternalMailAccount(userId: string, accountId: string) {
  const db = createDb()
  const account = await db.query.externalMailAccounts.findFirst({
    where: and(
      eq(externalMailAccounts.id, accountId),
      eq(externalMailAccounts.userId, userId),
      eq(externalMailAccounts.provider, ICLOUD_MAIL_PROVIDER)
    ),
  })

  if (!account) return false

  await db.delete(externalMailAccounts)
    .where(eq(externalMailAccounts.id, accountId))

  return true
}

export async function findExternalMailAccountByEmailId(userId: string, emailId: string) {
  const db = createDb()
  return db.query.externalMailAccounts.findFirst({
    where: and(
      eq(externalMailAccounts.userId, userId),
      eq(externalMailAccounts.emailId, emailId),
      eq(externalMailAccounts.provider, ICLOUD_MAIL_PROVIDER)
    ),
  })
}

export async function sendExternalMail(
  userId: string,
  emailId: string,
  input: SendExternalMailInput
) {
  const db = createDb()
  const account = await db.query.externalMailAccounts.findFirst({
    where: and(
      eq(externalMailAccounts.userId, userId),
      eq(externalMailAccounts.emailId, emailId),
      eq(externalMailAccounts.provider, ICLOUD_MAIL_PROVIDER)
    ),
    with: {
      email: true,
    },
  })

  if (!account) return null
  if (!account.enabled) {
    throw new Error("iCloud 邮箱账号已停用")
  }

  const password = await decryptExternalMailPassword(account.passwordEncrypted)
  const sentAt = new Date()

  await sendExternalMailWithAccount(account, password, account.email.address, input)

  await db.insert(messages).values({
    emailId: account.emailId,
    fromAddress: account.email.address,
    toAddress: input.to,
    subject: input.subject,
    content: "",
    html: input.content,
    type: "sent",
    receivedAt: sentAt,
    sentAt,
  })

  return { success: true }
}

export async function sendExternalMailWithAccount(
  account: ExternalMailConnectionAccount,
  password: string,
  fromAddress: string,
  input: SendExternalMailInput
) {
  if (!account.enabled) {
    throw new Error("iCloud 邮箱账号已停用")
  }

  const client = new SmtpClient(account, password)

  try {
    await client.connect()
    await client.sendMail(fromAddress, input)
  } finally {
    await client.quit().catch(() => undefined)
  }

  return { success: true }
}

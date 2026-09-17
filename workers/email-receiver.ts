import PostalMime, { type Attachment } from 'postal-mime'

interface Env { DB: D1Database }

const MAX_EMAIL_BYTES = 2 * 1024 * 1024
const MAX_INLINE_IMAGE_BYTES = 256 * 1024
const MAX_TOTAL_INLINE_IMAGE_BYTES = 768 * 1024

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }

  return btoa(binary)
}

const normalizeContentId = (contentId: string) => {
  return contentId.trim().replace(/^<|>$/g, '')
}

const escapeRegExp = (value: string) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const inlineCidImages = (html: string, attachments: Attachment[]) => {
  if (!html || attachments.length === 0) {
    return html
  }

  let nextHtml = html
  let inlinedBytes = 0

  for (const attachment of attachments) {
    if (
      !attachment.contentId ||
      !attachment.content ||
      !attachment.mimeType.startsWith('image/')
    ) {
      continue
    }

    const contentId = normalizeContentId(attachment.contentId)
    if (!contentId) {
      continue
    }

    if (typeof attachment.content === 'string') continue
    const content = attachment.content instanceof Uint8Array ? new Uint8Array(attachment.content).buffer : attachment.content
    const byteLength = content.byteLength
    if (
      byteLength > MAX_INLINE_IMAGE_BYTES ||
      inlinedBytes + byteLength > MAX_TOTAL_INLINE_IMAGE_BYTES
    ) {
      continue
    }

    const dataUrl = `data:${attachment.mimeType};base64,${arrayBufferToBase64(
      content
    )}`
    inlinedBytes += byteLength
    const cidVariants = Array.from(new Set([
      contentId,
      encodeURI(contentId),
      encodeURIComponent(contentId),
      `<${contentId}>`,
      encodeURI(`<${contentId}>`),
      encodeURIComponent(`<${contentId}>`)
    ]))

    for (const cid of cidVariants) {
      nextHtml = nextHtml.replace(
        new RegExp(`cid:${escapeRegExp(cid)}`, 'gi'),
        dataUrl
      )
    }
  }

  return nextHtml
}

const handleEmail = async (message: ForwardableEmailMessage, env: Env) => {
  if (message.rawSize > MAX_EMAIL_BYTES) {
    message.setReject('Email exceeds the supported size limit')
    console.warn(`Rejected oversized email: ${message.rawSize} bytes`)
    return
  }

  try {
    const targetEmail = await env.DB.prepare(
      "SELECT id,address FROM email WHERE lower(address)=? AND expires_at>? LIMIT 1",
    ).bind(message.to.toLowerCase(), Date.now()).first<{ id: string; address: string }>()

    if (!targetEmail) {
      console.error(`Active temporary mailbox not found: ${message.to}`)
      return
    }

    // `message.raw` is a one-shot stream. Cache it before parsing so future
    // processing can never accidentally consume it twice.
    const raw = await new Response(message.raw).arrayBuffer()
    const parsedMessage = await PostalMime.parse(raw)
    const html = inlineCidImages(parsedMessage.html || '', parsedMessage.attachments)
    const now = Date.now()
    const id = crypto.randomUUID()
    await env.DB.prepare(`INSERT INTO message (
      id,source,account_id,provider_uid,provider_mailbox,provider_message_id,sender_address,sender_name,
      recipients_json,subject,text_body,html_body,raw_object_key,received_at,is_read,automatic_tag_scanned_at,
      deleted_at,created_at,updated_at,emailId,from_address,to_address,content,html,type,sent_at
    ) VALUES (?,'temporary',NULL,NULL,NULL,NULL,?,NULL,?,?,?,?,NULL,?,0,NULL,NULL,?,?,?,?,?,'received',?)`).bind(
      id, message.from, JSON.stringify([targetEmail.address]), parsedMessage.subject || '(无主题)',
      parsedMessage.text || '', html, now, now, now, targetEmail.id, message.from,
      targetEmail.address, parsedMessage.text || '', html, now,
    ).run()
    console.log(`Temporary email processed: ${id}`)
  } catch (error) {
    console.error('Failed to process email:', error)
  }
}

const worker = {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    await handleEmail(message, env)
  }
}

export default worker

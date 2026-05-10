import { Env } from '../types'
import { drizzle } from 'drizzle-orm/d1'
import { messages, emails, webhooks } from '../app/lib/schema'
import { eq, sql } from 'drizzle-orm'
import PostalMime, { type Attachment } from 'postal-mime'
import { WEBHOOK_CONFIG } from '../app/config/webhook'
import { EmailMessage } from '../app/lib/webhook'

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

    const dataUrl = `data:${attachment.mimeType};base64,${arrayBufferToBase64(
      attachment.content
    )}`
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
  const db = drizzle(env.DB, { schema: { messages, emails, webhooks } })

  const parsedMessage = await PostalMime.parse(message.raw)
  const html = inlineCidImages(parsedMessage.html || '', parsedMessage.attachments)

  console.log("parsedMessage:", parsedMessage)

  try {
    const targetEmail = await db.query.emails.findFirst({
      where: eq(sql`LOWER(${emails.address})`, message.to.toLowerCase())
    })

    if (!targetEmail) {
      console.error(`Email not found: ${message.to}`)
      return
    }

    const savedMessage = await db.insert(messages).values({
      emailId: targetEmail.id,
      fromAddress: message.from,
      subject: parsedMessage.subject || '(无主题)',
      content: parsedMessage.text || '',
      html,
      type: 'received',
    }).returning().get()

    const webhook = await db.query.webhooks.findFirst({
      where: eq(webhooks.userId, targetEmail!.userId!)
    })

    if (webhook?.enabled) {
      try {
        await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Event': WEBHOOK_CONFIG.EVENTS.NEW_MESSAGE
          },
          body: JSON.stringify({
            emailId: targetEmail.id,
            messageId: savedMessage.id,
            fromAddress: savedMessage.fromAddress,
            subject: savedMessage.subject,
            content: savedMessage.content,
            html: savedMessage.html,
            receivedAt: savedMessage.receivedAt.toISOString(),
            toAddress: targetEmail.address
          } as EmailMessage)
        })
      } catch (error) {
        console.error('Failed to send webhook:', error)
      }
    }

    console.log(`Email processed: ${parsedMessage.subject}`)
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

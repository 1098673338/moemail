import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { deletedMessages, messages, emails } from "@/lib/schema"
import { deleteExternalMailMessage, getExternalMailErrorMessage } from "@/lib/external-mail"
import { and, eq } from "drizzle-orm"
import { getUserId } from "@/lib/apiKey"
export const runtime = "edge"

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const userId = await getUserId()

  try {
    const db = createDb()
    const { id, messageId } = await params
    const email = await db.query.emails.findFirst({
      where: and(
          eq(emails.id, id),
          eq(emails.userId, userId!)
      )
    })

    if (!email) {
      return NextResponse.json(
          { error: "Email not found or no permission to view" },
          { status: 403 }
      )
    }

    const message = await db.query.messages.findFirst({
      where: and(
          eq(messages.emailId, id),
          eq(messages.id, messageId)
      )
    })

    if(!message) {
      return NextResponse.json(
          { error: "Message not found or already deleted" },
          { status: 404 }
      )
    }

    const messageType = new URL(request.url).searchParams.get("type") || message.type
    const externalDeleted = await deleteExternalMailMessage(userId!, id, messageId, messageType)

    if (externalDeleted) {
      await db.insert(deletedMessages)
        .values({
          emailId: id,
          messageId,
          deletedAt: new Date(),
        })
        .onConflictDoNothing()
    }

    await db.delete(messages)
      .where(eq(messages.id, messageId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete email:', error)
    return NextResponse.json(
        { error: getExternalMailErrorMessage(error, "删除邮件失败") },
        { status: 500 }
    )
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const { id, messageId } = await params
    const db = createDb()
    const userId = await getUserId()

    const [message] = await db
      .select({
        id: messages.id,
        fromAddress: messages.fromAddress,
        toAddress: messages.toAddress,
        subject: messages.subject,
        content: messages.content,
        html: messages.html,
        receivedAt: messages.receivedAt,
        sentAt: messages.sentAt,
        type: messages.type,
        emailIsCustom: emails.isCustom,
      })
      .from(messages)
      .innerJoin(emails, eq(messages.emailId, emails.id))
      .where(and(
        eq(messages.id, messageId),
        eq(messages.emailId, id),
        eq(emails.userId, userId!)
      ))
      .limit(1)
    
    if (!message || message.emailIsCustom) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ 
      message: {
        id: message.id,
        from_address: message.fromAddress,
        to_address: message.toAddress,
        subject: message.subject,
        content: message.content,
        html: message.html,
        received_at: message.receivedAt.getTime(),
        sent_at: message.sentAt?.getTime(),
        type: message.type as 'received' | 'sent'
      }
    })
  } catch (error) {
    console.error('Failed to fetch message:', error)
    return NextResponse.json(
      { error: "Failed to fetch message" },
      { status: 500 }
    )
  }
} 

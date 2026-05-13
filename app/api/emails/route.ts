import { createDb } from "@/lib/db"
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { emails } from "@/lib/schema"
import { encodeCursor, decodeCursor } from "@/lib/cursor"
import { getUserId } from "@/lib/apiKey"

export const runtime = "edge"

const PAGE_SIZE = 20

export async function GET(request: Request) {
  const userId = await getUserId()

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')
  const groupId = searchParams.get('groupId')
  
  const db = createDb()

  try {
    const baseConditions = and(
      eq(emails.userId, userId!),
      gt(emails.expiresAt, new Date())
    )

    const conditions = [baseConditions]

    if (groupId === "none") {
      conditions.push(isNull(emails.groupId))
    } else if (groupId) {
      conditions.push(eq(emails.groupId, groupId))
    }

    const totalResult = await db.select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(and(...conditions))
    const totalCount = Number(totalResult[0].count)

    if (cursor) {
      const { timestamp, id } = decodeCursor(cursor)
      conditions.push(
        or(
          lt(emails.createdAt, new Date(timestamp)),
          and(
            eq(emails.createdAt, new Date(timestamp)),
            lt(emails.id, id)
          )
        )
      )
    }

    const results = await db.query.emails.findMany({
      where: and(...conditions),
      orderBy: (emails, { desc }) => [
        desc(emails.createdAt),
        desc(emails.id)
      ],
      limit: PAGE_SIZE + 1
    })
    
    const hasMore = results.length > PAGE_SIZE
    const nextCursor = hasMore 
      ? encodeCursor(
          results[PAGE_SIZE - 1].createdAt.getTime(),
          results[PAGE_SIZE - 1].id
        )
      : null
    const emailList = hasMore ? results.slice(0, PAGE_SIZE) : results

    return NextResponse.json({ 
      emails: emailList,
      nextCursor,
      total: totalCount
    })
  } catch (error) {
    console.error('Failed to fetch user emails:', error)
    return NextResponse.json(
      { error: "Failed to fetch emails" },
      { status: 500 }
    )
  }
} 

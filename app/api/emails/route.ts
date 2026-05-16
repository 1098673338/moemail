import { createDb } from "@/lib/db"
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { emails } from "@/lib/schema"
import { getUserId } from "@/lib/apiKey"

export const runtime = "edge"

const PAGE_SIZE = 20

export async function GET(request: Request) {
  const userId = await getUserId()

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')
  const groupId = searchParams.get('groupId')
  const offset = cursor ? Math.max(Number(cursor) || 0, 0) : 0
  
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

    const results = await db.select()
      .from(emails)
      .where(and(...conditions))
      .orderBy(
        asc(sql`case when ${emails.sortOrder} is null then 1 else 0 end`),
        asc(emails.sortOrder),
        desc(emails.createdAt),
        desc(emails.id)
      )
      .limit(PAGE_SIZE + 1)
      .offset(offset)
    
    const hasMore = results.length > PAGE_SIZE
    const nextCursor = hasMore ? String(offset + PAGE_SIZE) : null
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

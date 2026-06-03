import { createDb } from "@/lib/db"
import { and, asc, desc, eq, gt, inArray, isNull, notInArray, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { emails, externalMailAccounts } from "@/lib/schema"
import { getUserId } from "@/lib/apiKey"
import { EXTERNAL_EMAIL_GROUP_ID } from "@/lib/email-group-constants"

export const runtime = "edge"

const PAGE_SIZE = 20
const ICLOUD_MAIL_PROVIDER = "icloud"

export async function GET(request: Request) {
  const userId = await getUserId()

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')
  const groupId = searchParams.get('groupId')
  const loadAll = searchParams.get('all') === '1'
  const offset = cursor ? Math.max(Number(cursor) || 0, 0) : 0
  
  const db = createDb()

  try {
    const baseConditions = and(
      eq(emails.userId, userId!),
      gt(emails.expiresAt, new Date())
    )
    const externalMailEmailIds = (await db
      .select({ emailId: externalMailAccounts.emailId })
      .from(externalMailAccounts)
      .where(and(
        eq(externalMailAccounts.userId, userId!),
        eq(externalMailAccounts.provider, ICLOUD_MAIL_PROVIDER)
      )))
      .map(account => account.emailId)
    const externalMailEmailIdSet = new Set(externalMailEmailIds)

    const conditions = [baseConditions]

    if (groupId === "none") {
      conditions.push(isNull(emails.groupId))
      if (externalMailEmailIds.length > 0) {
        conditions.push(notInArray(emails.id, externalMailEmailIds))
      }
    } else if (groupId === EXTERNAL_EMAIL_GROUP_ID) {
      conditions.push(externalMailEmailIds.length > 0
        ? inArray(emails.id, externalMailEmailIds)
        : sql`0 = 1`
      )
    } else if (groupId) {
      conditions.push(eq(emails.groupId, groupId))
      if (externalMailEmailIds.length > 0) {
        conditions.push(notInArray(emails.id, externalMailEmailIds))
      }
    }

    const totalResult = await db.select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(and(...conditions))
    const totalCount = Number(totalResult[0].count)

    const query = db.select()
      .from(emails)
      .where(and(...conditions))
      .orderBy(
        asc(sql`case when ${emails.sortOrder} is null then 1 else 0 end`),
        asc(emails.sortOrder),
        desc(emails.createdAt),
        desc(emails.id)
      )

    const results = loadAll
      ? await query
      : await query.limit(PAGE_SIZE + 1).offset(offset)
    
    const hasMore = !loadAll && results.length > PAGE_SIZE
    const nextCursor = hasMore ? String(offset + PAGE_SIZE) : null
    const emailList = hasMore ? results.slice(0, PAGE_SIZE) : results
    return NextResponse.json({ 
      emails: emailList.map(email => ({
        ...email,
        isIcloudMail: externalMailEmailIdSet.has(email.id),
      })),
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

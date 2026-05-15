import { createDb } from "@/lib/db"
import { emails } from "@/lib/schema"
import { and, asc, eq, gt, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { getUserId } from "@/lib/apiKey"

export const runtime = "edge"

export async function GET() {
  const userId = await getUserId()
  const db = createDb()

  try {
    const results = await db
      .selectDistinct({ tag: emails.tag })
      .from(emails)
      .where(
        and(
          eq(emails.userId, userId!),
          gt(emails.expiresAt, new Date()),
          sql`${emails.tag} IS NOT NULL`,
          sql`TRIM(${emails.tag}) <> ''`
        )
      )
      .orderBy(asc(emails.tag))
    const tags = Array.from(new Set(
      results
        .map(result => result.tag?.trim())
        .filter((tag): tag is string => Boolean(tag))
    ))

    return NextResponse.json({
      tags
    })
  } catch (error) {
    console.error("Failed to fetch email tags:", error)
    return NextResponse.json(
      { error: "Failed to fetch email tags" },
      { status: 500 }
    )
  }
}

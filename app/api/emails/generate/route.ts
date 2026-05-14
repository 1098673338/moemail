import { NextResponse } from "next/server"
import { nanoid } from "nanoid"
import { createDb } from "@/lib/db"
import { emailGroups, emails, users } from "@/lib/schema"
import { eq, and, gt, sql } from "drizzle-orm"
import { EXPIRY_OPTIONS } from "@/types/email"
import { EMAIL_CONFIG } from "@/config"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getUserId } from "@/lib/apiKey"
import { getUserRole } from "@/lib/auth"
import { ROLES } from "@/lib/permissions"

export const runtime = "edge"

const getEmailNamePrefix = (value: string) => value.split("@")[0]

const getEmailNameError = (value: string) => {
  if (/\s/.test(value)) return "邮箱前缀不能包含空格"
  if (value.includes(".")) return "邮箱前缀不能包含点号"
  return null
}

export async function POST(request: Request) {
  const db = createDb()
  const env = getRequestContext().env

  const userId = await getUserId()
  const userRole = await getUserRole(userId!)

  try {
    if (userRole !== ROLES.EMPEROR) {
      const siteMaxEmails = Number(await env.SITE_CONFIG.get("MAX_EMAILS"))
      const defaultMaxEmails = Number.isFinite(siteMaxEmails) && siteMaxEmails > 0
        ? siteMaxEmails
        : EMAIL_CONFIG.MAX_ACTIVE_EMAILS
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId!),
        columns: {
          maxEmails: true,
        },
      })
      const maxEmails = user?.maxEmails && user.maxEmails > 0 ? user.maxEmails : defaultMaxEmails
      const activeEmailsCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(emails)
        .where(
          and(
            eq(emails.userId, userId!),
            gt(emails.expiresAt, new Date())
          )
        )
      
      if (Number(activeEmailsCount[0].count) >= maxEmails) {
        return NextResponse.json(
          { error: `已达到最大邮箱数量限制 (${maxEmails})` },
          { status: 403 }
        )
      }
    }

    const { name, expiryTime, domain, groupId } = await request.json<{
      name?: string
      expiryTime: number
      domain: string
      groupId?: string | null
    }>()

    if (!EXPIRY_OPTIONS.some(option => option.value === expiryTime)) {
      return NextResponse.json(
        { error: "无效的过期时间" },
        { status: 400 }
      )
    }

    const domainString = await env.SITE_CONFIG.get("EMAIL_DOMAINS")
    const domains = domainString ? domainString.split(',') : ["moemail.app"]

    if (!domains || !domains.includes(domain)) {
      return NextResponse.json(
        { error: "无效的域名" },
        { status: 400 }
      )
    }

    const emailName = name ? getEmailNamePrefix(name) || nanoid(8) : nanoid(8)
    const emailNameError = getEmailNameError(emailName)

    if (emailNameError) {
      return NextResponse.json(
        { error: emailNameError },
        { status: 400 }
      )
    }

    const address = `${emailName}@${domain}`
    const selectedGroupId = typeof groupId === "string" && groupId.trim()
      ? groupId.trim()
      : null

    if (selectedGroupId) {
      const group = await db.query.emailGroups.findFirst({
        where: and(
          eq(emailGroups.id, selectedGroupId),
          eq(emailGroups.userId, userId!)
        ),
        columns: {
          id: true,
        },
      })

      if (!group) {
        return NextResponse.json(
          { error: "无效的分组" },
          { status: 400 }
        )
      }
    }

    const existingEmail = await db.query.emails.findFirst({
      where: eq(sql`LOWER(${emails.address})`, address.toLowerCase())
    })

    if (existingEmail) {
      return NextResponse.json(
        { error: "已经有这个邮箱地址了，请换一个名称或域名" },
        { status: 409 }
      )
    }

    const now = new Date()
    const expires = expiryTime === 0 
      ? new Date('9999-01-01T00:00:00.000Z')
      : new Date(now.getTime() + expiryTime)
    
    const emailData: typeof emails.$inferInsert = {
      address,
      createdAt: now,
      expiresAt: expires,
      userId: userId!,
      groupId: selectedGroupId
    }
    
    const result = await db.insert(emails)
      .values(emailData)
      .returning({ id: emails.id, address: emails.address })
    
    return NextResponse.json({ 
      id: result[0].id,
      email: result[0].address 
    })
  } catch (error) {
    console.error('Failed to generate email:', error)
    return NextResponse.json(
      { error: "创建邮箱失败" },
      { status: 500 }
    )
  }
} 

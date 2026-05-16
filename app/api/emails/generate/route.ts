import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { emailGroups, emails, users } from "@/lib/schema"
import { eq, and, gt, sql } from "drizzle-orm"
import { EXPIRY_OPTIONS } from "@/types/email"
import { EMAIL_CONFIG } from "@/config"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getUserId } from "@/lib/apiKey"
import { getUserRole } from "@/lib/auth"
import { ROLES } from "@/lib/permissions"
import { generateEmailName, getEmailNamePrefix, isValidEmailNamePrefix } from "@/lib/email-name"

export const runtime = "edge"

const MAX_TAG_LENGTH = 32

const getEmailNameError = (value: string) => {
  if (!isValidEmailNamePrefix(value)) {
    return "邮箱前缀只能包含字母、数字、下划线和连字符"
  }
  return null
}

export async function POST(request: Request) {
  const db = createDb()
  const env = getRequestContext().env

  const userId = await getUserId()
  const userRole = await getUserRole(userId!)

  try {
    if (userRole !== ROLES.EMPEROR) {
      const siteMaxEmailsValue = await env.SITE_CONFIG.get("MAX_EMAILS")
      const siteMaxEmails = siteMaxEmailsValue && siteMaxEmailsValue.trim() !== "" ? Number(siteMaxEmailsValue) : NaN
      const defaultMaxEmails = Number.isInteger(siteMaxEmails) && siteMaxEmails >= 0
        ? siteMaxEmails
        : EMAIL_CONFIG.MAX_ACTIVE_EMAILS
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId!),
        columns: {
          maxEmails: true,
        },
      })
      const maxEmails = user?.maxEmails != null && user.maxEmails >= 0 ? user.maxEmails : defaultMaxEmails
      const activeEmailsCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(emails)
        .where(
          and(
            eq(emails.userId, userId!),
            gt(emails.expiresAt, new Date())
          )
        )
      
      if (maxEmails !== EMAIL_CONFIG.UNLIMITED_LIMIT && Number(activeEmailsCount[0].count) >= maxEmails) {
        return NextResponse.json(
          { error: `已达到最大邮箱数量限制 (${maxEmails})` },
          { status: 403 }
        )
      }
    }

    const { name, expiryTime, domain, groupId, tag, isCustom, address: customAddress } = await request.json<{
      name?: string
      expiryTime?: number
      domain?: string
      groupId?: string | null
      tag?: string | null
      isCustom?: boolean
      address?: string
    }>()

    const createCustomEmail = isCustom === true

    if (!createCustomEmail && !EXPIRY_OPTIONS.some(option => option.value === expiryTime)) {
      return NextResponse.json(
        { error: "无效的过期时间" },
        { status: 400 }
      )
    }

    let address: string

    if (createCustomEmail) {
      address = typeof customAddress === "string" ? customAddress : ""

      if (address.length === 0) {
        return NextResponse.json(
          { error: "请输入自定义邮箱" },
          { status: 400 }
        )
      }
    } else {
      const domainString = await env.SITE_CONFIG.get("EMAIL_DOMAINS")
      const domains = domainString ? domainString.split(',') : ["moemail.app"]

      if (!domain || !domains.includes(domain)) {
        return NextResponse.json(
          { error: "无效的域名" },
          { status: 400 }
        )
      }

      const emailName = name ? getEmailNamePrefix(name) || generateEmailName() : generateEmailName()
      const emailNameError = getEmailNameError(emailName)

      if (emailNameError) {
        return NextResponse.json(
          { error: emailNameError },
          { status: 400 }
        )
      }

      address = `${emailName}@${domain}`
    }

    const selectedGroupId = typeof groupId === "string" && groupId.trim()
      ? groupId.trim()
      : null
    const normalizedTag = typeof tag === "string" && tag.trim()
      ? tag.trim()
      : null

    if (normalizedTag && normalizedTag.length > MAX_TAG_LENGTH) {
      return NextResponse.json(
        { error: `标签不能超过 ${MAX_TAG_LENGTH} 个字符` },
        { status: 400 }
      )
    }

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
    const expires = createCustomEmail || expiryTime === 0
      ? new Date('9999-01-01T00:00:00.000Z')
      : new Date(now.getTime() + expiryTime!)
    const [minSortOrderRow] = await db.select({
      sortOrder: sql<number>`coalesce(min(${emails.sortOrder}), 0)`,
    })
      .from(emails)
      .where(eq(emails.userId, userId!))
    
    const emailData: typeof emails.$inferInsert = {
      address,
      isCustom: createCustomEmail,
      sortOrder: Number(minSortOrderRow?.sortOrder ?? 0) - 1,
      createdAt: now,
      expiresAt: expires,
      userId: userId!,
      groupId: selectedGroupId,
      tag: normalizedTag
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

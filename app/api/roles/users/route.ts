import { createDb } from "@/lib/db"
import {
  accounts,
  apiKeys,
  emailGroups,
  emailShares,
  emails,
  messages,
  messageShares,
  roles,
  userRoles,
  users,
  webhooks,
} from "@/lib/schema"
import { and, asc, eq, gte, sql } from "drizzle-orm"
import { checkPermission, ensureUserRoleRecords } from "@/lib/auth"
import { PERMISSIONS, ROLES } from "@/lib/permissions"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { EMAIL_CONFIG } from "@/config"
import { getUserId } from "@/lib/apiKey"

export const runtime = "edge"

const getDefaultSendLimitForRole = (roleName?: string | null) => {
  if (roleName === ROLES.EMPEROR) return EMAIL_CONFIG.DEFAULT_DAILY_SEND_LIMITS.emperor
  if (roleName === ROLES.DUKE) return EMAIL_CONFIG.DEFAULT_DAILY_SEND_LIMITS.duke
  if (roleName === ROLES.KNIGHT) return EMAIL_CONFIG.DEFAULT_DAILY_SEND_LIMITS.knight
  return EMAIL_CONFIG.DEFAULT_DAILY_SEND_LIMITS.civilian
}

export async function GET() {
  try {
    const canAccess = await checkPermission(PERMISSIONS.PROMOTE_USER)
    if (!canAccess) {
      return Response.json({ error: "权限不足" }, { status: 403 })
    }

    const currentUserId = await getUserId()
    const siteMaxEmailsValue = await getRequestContext().env.SITE_CONFIG.get("MAX_EMAILS")
    const siteMaxEmails = siteMaxEmailsValue && siteMaxEmailsValue.trim() !== "" ? Number(siteMaxEmailsValue) : NaN
    const defaultMaxEmails = Number.isInteger(siteMaxEmails) && siteMaxEmails >= 0
      ? siteMaxEmails
      : EMAIL_CONFIG.MAX_ACTIVE_EMAILS
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const db = createDb()
    const userRows = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        maxEmails: users.maxEmails,
        sendLimit: users.sendLimit,
        role: roles.name,
        emailCount: sql<number>`count(distinct ${emails.id})`,
        sentCount: sql<number>`count(distinct ${messages.id})`,
      })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .leftJoin(emails, eq(emails.userId, users.id))
      .leftJoin(
        messages,
        and(
          eq(messages.emailId, emails.id),
          eq(messages.type, "sent"),
          gte(messages.receivedAt, today)
        )
      )
      .groupBy(users.id)
      .orderBy(asc(users.username), asc(users.email), asc(users.name))

    const normalizedUsers = userRows.map(user => {
      const roleName = user.role ?? ROLES.CIVILIAN
      return {
        ...user,
        role: roleName,
        emailCount: Number(user.emailCount ?? 0),
        sentCount: Number(user.sentCount ?? 0),
        maxEmails: user.maxEmails != null && user.maxEmails >= 0
          ? user.maxEmails
          : defaultMaxEmails,
        sendLimit: user.sendLimit ?? getDefaultSendLimitForRole(roleName),
      }
    })

    return Response.json({
      currentUserId,
      users: normalizedUsers.filter(user => user.role !== ROLES.EMPEROR),
    })
  } catch (error) {
    console.error("Failed to list users:", error)
    return Response.json(
      { error: "获取用户列表失败" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const canAccess = await checkPermission(PERMISSIONS.PROMOTE_USER)
    if (!canAccess) {
      return Response.json({ error: "权限不足" }, { status: 403 })
    }

    const json = await request.json()
    const { searchText } = json as { searchText: string }
    const search = searchText?.trim()

    if (!search) {
      return Response.json({ error: "请提供用户名或邮箱地址" }, { status: 400 })
    }

    const db = createDb()

    const user = await db.query.users.findFirst({
      where: search.includes('@') ? eq(users.email, search) : eq(users.username, search),
      with: {
        userRoles: {
          with: {
            role: true
          }
        }
      }
    });

    if (!user) {
      return Response.json({ error: "未找到用户" }, { status: 404 })
    }

    const siteMaxEmailsValue = await getRequestContext().env.SITE_CONFIG.get("MAX_EMAILS")
    const siteMaxEmails = siteMaxEmailsValue && siteMaxEmailsValue.trim() !== "" ? Number(siteMaxEmailsValue) : NaN
    const defaultMaxEmails = Number.isInteger(siteMaxEmails) && siteMaxEmails >= 0
      ? siteMaxEmails
      : EMAIL_CONFIG.MAX_ACTIVE_EMAILS

    const userRoleRecords = user.userRoles.length
      ? user.userRoles
      : await ensureUserRoleRecords(db, user.id)
    const roleName = userRoleRecords[0]?.role.name

    return Response.json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: roleName,
        maxEmails: roleName === ROLES.EMPEROR
          ? 0
          : user.maxEmails != null && user.maxEmails >= 0 ? user.maxEmails : defaultMaxEmails,
        sendLimit: roleName === ROLES.EMPEROR ? 0 : user.sendLimit ?? null
      }
    })
  } catch (error) {
    console.error("Failed to find user:", error)
    return Response.json(
      { error: "查询用户失败" },
      { status: 500 }
    )
  }
} 

export async function DELETE(request: Request) {
  try {
    const canAccess = await checkPermission(PERMISSIONS.PROMOTE_USER)
    if (!canAccess) {
      return Response.json({ error: "权限不足" }, { status: 403 })
    }

    const currentUserId = await getUserId()
    if (!currentUserId) {
      return Response.json({ error: "未授权" }, { status: 401 })
    }

    const { userId } = await request.json().catch(() => ({})) as { userId?: string }
    if (!userId) {
      return Response.json({ error: "缺少用户 ID" }, { status: 400 })
    }

    if (userId === currentUserId) {
      return Response.json({ error: "不能删除当前登录用户" }, { status: 400 })
    }

    const db = createDb()
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: {
        userRoles: {
          with: {
            role: true,
          },
        },
      },
    })

    if (!targetUser) {
      return Response.json({ error: "用户不存在" }, { status: 404 })
    }

    if (targetUser.userRoles.some(record => record.role.name === ROLES.EMPEROR)) {
      return Response.json({ error: "不能删除皇帝用户" }, { status: 400 })
    }

    await db.delete(messageShares)
      .where(sql`${messageShares.messageId} in (
        select ${messages.id}
        from ${messages}
        where ${messages.emailId} in (
          select ${emails.id}
          from ${emails}
          where ${emails.userId} = ${userId}
        )
      )`)

    await db.delete(emailShares)
      .where(sql`${emailShares.emailId} in (
        select ${emails.id}
        from ${emails}
        where ${emails.userId} = ${userId}
      )`)

    await db.delete(messages)
      .where(sql`${messages.emailId} in (
        select ${emails.id}
        from ${emails}
        where ${emails.userId} = ${userId}
      )`)

    await db.delete(emails)
      .where(eq(emails.userId, userId))

    await Promise.all([
      db.delete(emailGroups).where(eq(emailGroups.userId, userId)),
      db.delete(webhooks).where(eq(webhooks.userId, userId)),
      db.delete(apiKeys).where(eq(apiKeys.userId, userId)),
      db.delete(accounts).where(eq(accounts.userId, userId)),
      db.delete(userRoles).where(eq(userRoles.userId, userId)),
    ])

    await db.delete(users)
      .where(eq(users.id, userId))

    return Response.json({ success: true })
  } catch (error) {
    console.error("Failed to delete user:", error)
    return Response.json(
      { error: "删除用户失败" },
      { status: 500 }
    )
  }
}

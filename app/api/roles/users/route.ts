import { createDb } from "@/lib/db"
import { users } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS } from "@/lib/permissions"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { EMAIL_CONFIG } from "@/config"

export const runtime = "edge"

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

    const siteMaxEmails = Number(await getRequestContext().env.SITE_CONFIG.get("MAX_EMAILS"))
    const defaultMaxEmails = Number.isFinite(siteMaxEmails) && siteMaxEmails >= 0
      ? siteMaxEmails
      : EMAIL_CONFIG.MAX_ACTIVE_EMAILS

    return Response.json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.userRoles[0]?.role.name,
        maxEmails: user.maxEmails ?? defaultMaxEmails
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

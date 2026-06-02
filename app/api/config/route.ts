import { PERMISSIONS, Role, ROLES } from "@/lib/permissions"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { EMAIL_CONFIG } from "@/config"
import { checkPermission } from "@/lib/auth"
import { createDb } from "@/lib/db"
import { getUserId } from "@/lib/apiKey"
import { users } from "@/lib/schema"
import { eq } from "drizzle-orm"

export const runtime = "edge"

export async function GET() {
  const env = getRequestContext().env
  const canManageConfig = await checkPermission(PERMISSIONS.MANAGE_CONFIG)

  const [
    defaultRole,
    emailDomains,
    adminContact,
    maxEmails,
    registrationEnabled,
    turnstileEnabled,
    turnstileSiteKey,
    turnstileSecretKey
  ] = await Promise.all([
    env.SITE_CONFIG.get("DEFAULT_ROLE"),
    env.SITE_CONFIG.get("EMAIL_DOMAINS"),
    env.SITE_CONFIG.get("ADMIN_CONTACT"),
    env.SITE_CONFIG.get("MAX_EMAILS"),
    env.SITE_CONFIG.get("REGISTRATION_ENABLED"),
    env.SITE_CONFIG.get("TURNSTILE_ENABLED"),
    env.SITE_CONFIG.get("TURNSTILE_SITE_KEY"),
    env.SITE_CONFIG.get("TURNSTILE_SECRET_KEY")
  ])

  const parsedMaxEmails = maxEmails && maxEmails.trim() !== "" ? Number(maxEmails) : NaN
  const globalMaxEmails = Number.isInteger(parsedMaxEmails) && parsedMaxEmails >= 0
    ? parsedMaxEmails
    : EMAIL_CONFIG.MAX_ACTIVE_EMAILS
  const userId = await getUserId()
  let effectiveMaxEmails = globalMaxEmails

  if (userId) {
    const db = createDb()
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        maxEmails: true,
      },
    })
    effectiveMaxEmails = user?.maxEmails != null && user.maxEmails >= 0 ? user.maxEmails : globalMaxEmails
  }

  return Response.json({
    defaultRole: defaultRole || ROLES.CIVILIAN,
    emailDomains: emailDomains || "moemail.app",
    adminContact: adminContact || "",
    maxEmails: globalMaxEmails.toString(),
    effectiveMaxEmails,
    registrationEnabled: registrationEnabled !== "false",
    turnstile: canManageConfig ? {
      enabled: turnstileEnabled === "true",
      siteKey: turnstileSiteKey || "",
      secretKey: turnstileSecretKey || "",
    } : undefined
  })
}

export async function POST(request: Request) {
  const canAccess = await checkPermission(PERMISSIONS.MANAGE_CONFIG)

  if (!canAccess) {
    return Response.json({
      error: "权限不足"
    }, { status: 403 })
  }

  const {
    defaultRole,
    emailDomains,
    adminContact,
    maxEmails,
    registrationEnabled,
    turnstile
  } = await request.json() as { 
    defaultRole: Exclude<Role, typeof ROLES.EMPEROR>,
    emailDomains: string,
    adminContact: string,
    maxEmails: string,
    registrationEnabled?: boolean,
    turnstile?: {
      enabled: boolean,
      siteKey: string,
      secretKey: string
    }
  }
  
  if (![ROLES.DUKE, ROLES.KNIGHT, ROLES.CIVILIAN].includes(defaultRole)) {
    return Response.json({ error: "无效的角色" }, { status: 400 })
  }

  const turnstileConfig = turnstile ?? {
    enabled: false,
    siteKey: "",
    secretKey: ""
  }

  if (turnstileConfig.enabled && (!turnstileConfig.siteKey || !turnstileConfig.secretKey)) {
    return Response.json({ error: "Turnstile 启用时需要提供 Site Key 和 Secret Key" }, { status: 400 })
  }

  const normalizedMaxEmails = (maxEmails ?? "").trim()
  const parsedMaxEmails = normalizedMaxEmails ? Number(normalizedMaxEmails) : 0
  if (
    !Number.isInteger(parsedMaxEmails)
    || parsedMaxEmails < 0
    || parsedMaxEmails > EMAIL_CONFIG.MAX_CONFIGURABLE_LIMIT
  ) {
    return Response.json({
      error: "每个用户最大邮箱数必须留空或填写 0 到 9999 之间的整数，留空表示不能创建，9999 表示无限制"
    }, { status: 400 })
  }

  const env = getRequestContext().env
  await Promise.all([
    env.SITE_CONFIG.put("DEFAULT_ROLE", defaultRole),
    env.SITE_CONFIG.put("EMAIL_DOMAINS", emailDomains),
    env.SITE_CONFIG.put("ADMIN_CONTACT", adminContact),
    env.SITE_CONFIG.put("MAX_EMAILS", parsedMaxEmails.toString()),
    env.SITE_CONFIG.put("REGISTRATION_ENABLED", (registrationEnabled ?? true).toString()),
    env.SITE_CONFIG.put("TURNSTILE_ENABLED", turnstileConfig.enabled.toString()),
    env.SITE_CONFIG.put("TURNSTILE_SITE_KEY", turnstileConfig.siteKey),
    env.SITE_CONFIG.put("TURNSTILE_SECRET_KEY", turnstileConfig.secretKey)
  ])

  return Response.json({ success: true })
} 

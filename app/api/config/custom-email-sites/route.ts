import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { checkPermission } from "@/lib/auth"
import { CUSTOM_EMAIL_SITES_CONFIG_KEY, CustomEmailSite, parseCustomEmailSites, serializeCustomEmailSites } from "@/lib/custom-email-sites"
import { PERMISSIONS } from "@/lib/permissions"

export const runtime = "edge"

export async function GET() {
  const canAccess = await checkPermission(PERMISSIONS.MANAGE_CONFIG)

  if (!canAccess) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 })
  }

  try {
    const value = await getRequestContext().env.SITE_CONFIG.get(CUSTOM_EMAIL_SITES_CONFIG_KEY)

    return NextResponse.json({
      sites: parseCustomEmailSites(value),
    })
  } catch (error) {
    console.error("Failed to get custom email sites config:", error)
    return NextResponse.json(
      { error: "获取自定义邮箱配置失败" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const canAccess = await checkPermission(PERMISSIONS.MANAGE_CONFIG)

  if (!canAccess) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 })
  }

  try {
    const data = await request.json() as { sites?: CustomEmailSite[] }
    const sites = serializeCustomEmailSites(Array.isArray(data.sites) ? data.sites : [])

    await getRequestContext().env.SITE_CONFIG.put(CUSTOM_EMAIL_SITES_CONFIG_KEY, sites)

    return NextResponse.json({
      sites: parseCustomEmailSites(sites),
    })
  } catch (error) {
    console.error("Failed to save custom email sites config:", error)
    return NextResponse.json(
      { error: "保存自定义邮箱配置失败" },
      { status: 500 }
    )
  }
}

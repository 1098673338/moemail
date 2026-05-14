import { getRequestContext } from "@cloudflare/next-on-pages"

export async function getRegistrationEnabled() {
  const value = await getRequestContext().env.SITE_CONFIG.get("REGISTRATION_ENABLED")
  return value !== "false"
}

export interface CustomEmailSite {
  domain: string
  url: string
}

export const CUSTOM_EMAIL_SITES_CONFIG_KEY = "CUSTOM_EMAIL_SITES"

export function normalizeCustomEmailDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/\.+$/, "")
}

export function isValidEmbeddedUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export function normalizeCustomEmailSites(sites: CustomEmailSite[]) {
  const normalizedSites: CustomEmailSite[] = []
  const usedDomains = new Set<string>()

  for (const site of sites) {
    const domain = normalizeCustomEmailDomain(site.domain)
    const url = site.url.trim()

    if (!domain || !url || usedDomains.has(domain) || !isValidEmbeddedUrl(url)) {
      continue
    }

    usedDomains.add(domain)
    normalizedSites.push({ domain, url })
  }

  return normalizedSites
}

export function parseCustomEmailSites(value?: string | null) {
  if (!value) return []

  try {
    const parsedValue = JSON.parse(value)
    if (!Array.isArray(parsedValue)) return []

    return normalizeCustomEmailSites(parsedValue.filter((item): item is CustomEmailSite => (
      typeof item?.domain === "string" && typeof item?.url === "string"
    )))
  } catch {
    return []
  }
}

export function serializeCustomEmailSites(sites: CustomEmailSite[]) {
  return JSON.stringify(normalizeCustomEmailSites(sites))
}

export function getEmailDomainFromCustomContent(value?: string | null) {
  if (!value) return null

  const content = value.trim()
  const atIndex = content.lastIndexOf("@")
  if (atIndex <= 0 || atIndex === content.length - 1) return null

  const domain = normalizeCustomEmailDomain(content.slice(atIndex + 1))
  if (!domain || !domain.includes(".") || /\s/.test(domain)) return null

  return domain
}

export function findCustomEmailSiteForContent(
  value: string | undefined,
  sites: CustomEmailSite[]
) {
  const domain = getEmailDomainFromCustomContent(value)
  if (!domain) return null

  return sites.find(site => (
    domain === site.domain || domain.endsWith(`.${site.domain}`)
  )) ?? null
}

import common from "@/i18n/messages/zh-CN/common.json"
import home from "@/i18n/messages/zh-CN/home.json"
import auth from "@/i18n/messages/zh-CN/auth.json"
import metadata from "@/i18n/messages/zh-CN/metadata.json"
import emails from "@/i18n/messages/zh-CN/emails.json"
import profile from "@/i18n/messages/zh-CN/profile.json"
import type { Locale } from "@/i18n/config"

const messagesByLocale = {
  "zh-CN": {
    common,
    home,
    auth,
    metadata,
    emails,
    profile,
  },
} satisfies Record<Locale, {
  common: typeof common
  home: typeof home
  auth: typeof auth
  metadata: typeof metadata
  emails: typeof emails
  profile: typeof profile
}>

export function getMessages(locale: Locale) {
  return messagesByLocale[locale]
}

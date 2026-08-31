import {getRequestConfig} from 'next-intl/server'
import {i18n} from '@/i18n/config'
import {getMessages} from '@/i18n/messages'

export default getRequestConfig(async ({locale}) => {
  const safeLocale = i18n.locales.includes(locale as typeof i18n.locales[number])
    ? locale as typeof i18n.locales[number]
    : i18n.defaultLocale

  return {locale: safeLocale, messages: getMessages(safeLocale)}
})

import { HomePage } from "@/components/home/home-page"
import type { Locale } from "@/i18n/config"

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: localeFromParams } = await params
  const locale = localeFromParams as Locale
  return <HomePage locale={locale} />
}

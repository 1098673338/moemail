import { notFound } from "next/navigation"
import { i18n } from "@/i18n/config"

export const runtime = "edge"

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  if (!i18n.locales.includes(locale as typeof i18n.locales[number])) {
    notFound()
  }

  return children
}

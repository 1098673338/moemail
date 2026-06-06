import { NextIntlClientProvider } from "next-intl"
import { getTranslations } from "next-intl/server"
import type { Metadata, Viewport } from "next"
import { Toaster } from "@/components/ui/toaster"
import { i18n, type Locale } from "@/i18n/config"
import "./globals.css"
import { Providers } from "./providers"

export const runtime = "edge"

export const viewport: Viewport = {
  themeColor: '#826DD9',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

async function getMessages(locale: Locale) {
  try {
    const common = (await import(`@/i18n/messages/${locale}/common.json`)).default
    const home = (await import(`@/i18n/messages/${locale}/home.json`)).default
    const auth = (await import(`@/i18n/messages/${locale}/auth.json`)).default
    const metadata = (await import(`@/i18n/messages/${locale}/metadata.json`)).default
    const emails = (await import(`@/i18n/messages/${locale}/emails.json`)).default
    const profile = (await import(`@/i18n/messages/${locale}/profile.json`)).default
    return { common, home, auth, metadata, emails, profile }
  } catch (error) {
    console.error(`Failed to load messages for locale ${locale}:`, error)
    return { common: {}, home: {}, auth: {}, metadata: {}, emails: {}, profile: {} }
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = i18n.defaultLocale
  const t = await getTranslations({ locale, namespace: "metadata" })
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://moemail.app"

  return {
    title: t("title"),
    description: t("description"),
    keywords: t("keywords"),
    authors: [{ name: "SoftMoe Studio" }],
    creator: "SoftMoe Studio",
    publisher: "SoftMoe Studio",
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
      },
    },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      url: baseUrl,
      title: t("title"),
      description: t("description"),
      siteName: "MoeMail",
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
    },
    alternates: {
      canonical: baseUrl,
    },
    manifest: '/manifest.json',
    icons: [
      { rel: 'apple-touch-icon', url: '/icons/icon-192x192.png' },
    ],
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = i18n.defaultLocale
  const messages = await getMessages(locale)

  return (
    <html lang={locale}>
      <head>
        <meta name="application-name" content="MoeMail" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="MoeMail" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased transition-colors duration-300">
        <Providers>
          <NextIntlClientProvider locale={locale} messages={messages}>
            {children}
          </NextIntlClientProvider>
        </Providers>
        <Toaster />
      </body>
    </html>
  )
}

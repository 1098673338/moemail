import { NextIntlClientProvider } from "next-intl"
import type { Metadata, Viewport } from "next"
import { Toaster } from "@/components/ui/toaster"
import { i18n } from "@/i18n/config"
import { getMessages } from "@/i18n/messages"
import metadataMessages from "@/i18n/messages/zh-CN/metadata.json"
import "./globals.css"

export const viewport: Viewport = {
  themeColor: '#826DD9',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://moemail.app"

export const metadata: Metadata = {
  title: metadataMessages.title,
  description: metadataMessages.description,
  keywords: metadataMessages.keywords,
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
    title: metadataMessages.title,
    description: metadataMessages.description,
    siteName: "MoeMail",
  },
  twitter: {
    card: "summary_large_image",
    title: metadataMessages.title,
    description: metadataMessages.description,
  },
  alternates: {
    canonical: baseUrl,
  },
  manifest: '/manifest.json',
  icons: [
    { rel: 'apple-touch-icon', url: '/icons/icon-192x192.png' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = i18n.defaultLocale
  const messages = getMessages(locale)

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
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
        <Toaster />
      </body>
    </html>
  )
}

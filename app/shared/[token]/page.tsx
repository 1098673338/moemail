import SharedEmailPage from "../../[locale]/shared/[token]/page"
import { i18n } from "@/i18n/config"

export const runtime = "edge"

interface PageProps {
  params: Promise<{
    token: string
  }>
}

export default async function Page({ params }: PageProps) {
  const { token } = await params

  return (
    <SharedEmailPage
      params={Promise.resolve({
        locale: i18n.defaultLocale,
        token,
      })}
    />
  )
}

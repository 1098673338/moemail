import { HomePage } from "@/components/home/home-page"
import { i18n } from "@/i18n/config"

export default function Page() {
  return <HomePage locale={i18n.defaultLocale} />
}

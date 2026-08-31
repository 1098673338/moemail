import Home from "./[locale]/page"
import { i18n } from "@/i18n/config"

export const runtime = "edge"

export default function Page() {
  return <Home params={Promise.resolve({ locale: i18n.defaultLocale })} />
}

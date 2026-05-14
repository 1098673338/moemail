import { LoginForm } from "@/components/auth/login-form"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getTurnstileConfig } from "@/lib/turnstile"
import { getRegistrationEnabled } from "@/lib/registration"

export const runtime = "edge"

export default async function LoginPage() {
  const session = await auth()
  
  if (session?.user) {
    redirect("/moe")
  }

  const [turnstile, registrationEnabled] = await Promise.all([
    getTurnstileConfig(),
    getRegistrationEnabled(),
  ])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100">
      <LoginForm
        registrationEnabled={registrationEnabled}
        turnstile={{ enabled: turnstile.enabled, siteKey: turnstile.siteKey }}
      />
    </div>
  )
}

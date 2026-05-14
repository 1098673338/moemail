"use client"

import { Button } from "@/components/ui/button"
import { Mail } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { SignButton } from "../auth/sign-button"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"

export function ActionButton() {
  const router = useRouter()
  const t = useTranslations("home")
  const { data: session, status } = useSession()
  const isLoggedIn = !!session?.user

  if (status === "loading") {
    return (
      <Button
        aria-hidden="true"
        tabIndex={-1}
        size="lg"
        className={cn("pointer-events-none gap-2 bg-primary px-8 opacity-0")}
      >
        <Mail className="w-5 h-5" />
        {t("actions.enterMailbox")}
      </Button>
    )
  }

  if (isLoggedIn) {
    return (
      <Button 
        size="lg" 
        onClick={() => router.push("/moe")}
        className="gap-2 bg-primary hover:bg-primary/90 text-white px-8"
      >
        <Mail className="w-5 h-5" />
        {t("actions.enterMailbox")}
      </Button>
    )
  }

  return <SignButton size="lg" />
} 

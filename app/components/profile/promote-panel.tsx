"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Crown, Gem, Sword, User2, Loader2, Users } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useEffect, useState } from "react"
import { useToast } from "@/components/ui/use-toast"
import { ROLES, Role } from "@/lib/permissions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EMAIL_CONFIG } from "@/config"
import { normalizeConfigurableLimitInput } from "@/lib/validation"

type RoleWithoutEmperor = Exclude<Role, typeof ROLES.EMPEROR>

interface TargetUser {
  id: string
  name?: string
  username?: string
  email?: string
  role?: string
  maxEmails: number
  sendLimit: number | null
}

export function PromotePanel() {
  const t = useTranslations("profile.promote")
  const tCard = useTranslations("profile.card")
  const [searchText, setSearchText] = useState("")
  const [targetUser, setTargetUser] = useState<TargetUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [targetRole, setTargetRole] = useState<Role>(ROLES.KNIGHT)
  const [maxEmails, setMaxEmails] = useState("")
  const [sendLimit, setSendLimit] = useState("")
  const { toast } = useToast()
  const hasTargetUser = targetUser !== null
  const isTargetEmperor = targetUser?.role === ROLES.EMPEROR
  const isUserFormDisabled = !targetUser || searching || isTargetEmperor
  
  const roleNames = {
    [ROLES.EMPEROR]: tCard("roles.EMPEROR"),
    [ROLES.DUKE]: tCard("roles.DUKE"),
    [ROLES.KNIGHT]: tCard("roles.KNIGHT"),
    [ROLES.CIVILIAN]: tCard("roles.CIVILIAN"),
  } as const

  useEffect(() => {
    const search = searchText.trim()
    if (!search) {
      setTargetUser(null)
      setTargetRole(ROLES.KNIGHT)
      setMaxEmails("")
      setSendLimit("")
      return
    }

    setTargetUser(null)
    setTargetRole(ROLES.KNIGHT)
    setMaxEmails("")
    setSendLimit("")

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch("/api/roles/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ searchText: search })
        })
        const data = await res.json() as {
          user?: TargetUser
        }

        if (cancelled) return

        if (!res.ok || !data.user) {
          setTargetUser(null)
          setTargetRole(ROLES.KNIGHT)
          setMaxEmails("")
          setSendLimit("")
          return
        }

        setTargetUser(data.user)
        setMaxEmails(data.user.maxEmails.toString())
        setSendLimit(data.user.sendLimit == null ? "" : data.user.sendLimit.toString())
        if ([ROLES.EMPEROR, ROLES.DUKE, ROLES.KNIGHT, ROLES.CIVILIAN].includes(data.user.role as Role)) {
          setTargetRole(data.user.role as Role)
        } else {
          setTargetRole(ROLES.KNIGHT)
        }
      } catch {
        if (!cancelled) {
          setTargetUser(null)
          setTargetRole(ROLES.KNIGHT)
          setMaxEmails("")
          setSendLimit("")
        }
      } finally {
        if (!cancelled) {
          setSearching(false)
        }
      }
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [searchText])

  const handleAction = async () => {
    if (!targetUser) return

    const normalizedMaxEmails = maxEmails.trim()
    const parsedMaxEmails = isTargetEmperor ? 0 : normalizedMaxEmails ? Number(normalizedMaxEmails) : 0
    if (
      !isTargetEmperor
      && (
        !Number.isInteger(parsedMaxEmails)
        || parsedMaxEmails < 0
        || parsedMaxEmails > EMAIL_CONFIG.MAX_CONFIGURABLE_LIMIT
      )
    ) {
      toast({
        title: t("updateFailed"),
        description: t("maxEmailsInvalid"),
        variant: "destructive"
      })
      return
    }

    const normalizedSendLimit = sendLimit.trim()
    const parsedSendLimit = isTargetEmperor ? 0 : normalizedSendLimit ? Number(normalizedSendLimit) : null
    if (
      !isTargetEmperor
      && parsedSendLimit !== null
      && (
        !Number.isInteger(parsedSendLimit)
        || parsedSendLimit < 0
        || parsedSendLimit > EMAIL_CONFIG.MAX_CONFIGURABLE_LIMIT
      )
    ) {
      toast({
        title: t("updateFailed"),
        description: t("sendLimitInvalid"),
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const promoteRes = await fetch("/api/roles/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: targetUser.id,
          roleName: targetRole === ROLES.EMPEROR ? ROLES.CIVILIAN : targetRole,
          maxEmails: parsedMaxEmails,
          sendLimit: parsedSendLimit
        })
      })

      if (!promoteRes.ok) {
        const error = await promoteRes.json() as { error: string }
        throw new Error(error.error || t("updateFailed"))
      }

      toast({
        title: t("updateSuccess"),
        description: `${targetUser.username || targetUser.email} - ${roleNames[targetRole]}`,
      })
      setSearchText("")
      setTargetUser(null)
      setTargetRole(ROLES.KNIGHT)
      setMaxEmails("")
      setSendLimit("")
    } catch (error) {
      toast({
        title: t("updateFailed"),
        description: error instanceof Error ? error.message : t("updateFailed"),
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-background rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">{t("title")}</h2>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-[180px_minmax(0,1fr)] items-center gap-4">
          <span className="text-left text-sm">{t("search")}:</span>
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t("searchPlaceholder")}
          />
        </div>

        <div className="grid grid-cols-[180px_minmax(0,1fr)] items-center gap-4">
          <span className="text-left text-sm">{t("role")}:</span>
          <Select
            value={hasTargetUser ? targetRole : undefined}
            onValueChange={(value) => setTargetRole(value as RoleWithoutEmperor)}
            disabled={isUserFormDisabled}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder={!hasTargetUser ? t("searchFirst") : undefined} />
            </SelectTrigger>
            <SelectContent>
              {targetUser?.role === ROLES.EMPEROR && (
                <SelectItem value={ROLES.EMPEROR}>
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4" />
                    {roleNames[ROLES.EMPEROR]}
                  </div>
                </SelectItem>
              )}
              <SelectItem value={ROLES.DUKE}>
                <div className="flex items-center gap-2">
                  <Gem className="w-4 h-4" />
                  {roleNames[ROLES.DUKE]}
                </div>
              </SelectItem>
              <SelectItem value={ROLES.KNIGHT}>
                <div className="flex items-center gap-2">
                  <Sword className="w-4 h-4" />
                  {roleNames[ROLES.KNIGHT]}
                </div>
              </SelectItem>
              <SelectItem value={ROLES.CIVILIAN}>
                <div className="flex items-center gap-2">
                  <User2 className="w-4 h-4" />
                  {roleNames[ROLES.CIVILIAN]}
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-[180px_minmax(0,1fr)] items-center gap-4">
          <span className="text-left text-sm">{t("maxEmails")}:</span>
          <Input
            id="user-max-emails"
            type="text"
            inputMode={isTargetEmperor || !hasTargetUser ? undefined : "numeric"}
            pattern={isTargetEmperor || !hasTargetUser ? undefined : "[0-9]*"}
            value={isTargetEmperor ? t("unlimited") : hasTargetUser ? maxEmails : ""}
            onChange={(e) => setMaxEmails(normalizeConfigurableLimitInput(e.target.value))}
            placeholder={hasTargetUser ? t("maxEmailsPlaceholder") : t("searchFirst")}
            disabled={isUserFormDisabled}
          />
        </div>

        <div className="grid grid-cols-[180px_minmax(0,1fr)] items-center gap-4">
          <span className="text-left text-sm">{t("sendLimit")}:</span>
          <Input
            id="user-send-limit"
            type="text"
            inputMode={isTargetEmperor || !hasTargetUser ? undefined : "numeric"}
            pattern={isTargetEmperor || !hasTargetUser ? undefined : "[0-9]*"}
            value={isTargetEmperor ? t("unlimited") : hasTargetUser ? sendLimit : ""}
            onChange={(e) => setSendLimit(normalizeConfigurableLimitInput(e.target.value))}
            placeholder={hasTargetUser ? t("sendLimitPlaceholder") : t("searchFirst")}
            disabled={isUserFormDisabled}
          />
        </div>
        <Button
          onClick={handleAction}
          disabled={loading || isUserFormDisabled}
          className="w-full"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            t("saveConfig")
          )}
        </Button>
      </div>
    </div>
  )
} 

"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Crown, Gem, Sword, User2, Loader2, Users } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useEffect, useState } from "react"
import { useToast } from "@/components/ui/use-toast"
import { ROLES, Role } from "@/lib/permissions"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type RoleWithoutEmperor = Exclude<Role, typeof ROLES.EMPEROR>

interface TargetUser {
  id: string
  name?: string
  username?: string
  email?: string
  role?: string
  maxEmails: number
}

export function PromotePanel() {
  const t = useTranslations("profile.promote")
  const tCard = useTranslations("profile.card")
  const userNotFoundText = t("noUsers")
  const [searchText, setSearchText] = useState("")
  const [searchError, setSearchError] = useState("")
  const [targetUser, setTargetUser] = useState<TargetUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [targetRole, setTargetRole] = useState<Role>(ROLES.KNIGHT)
  const [maxEmails, setMaxEmails] = useState("")
  const { toast } = useToast()
  
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
      setSearchError("")
      setMaxEmails("")
      return
    }

    setTargetUser(null)
    setSearchError("")
    setMaxEmails("")

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
          setSearchError(res.status === 404 ? userNotFoundText : "")
          setMaxEmails("")
          return
        }

        setSearchError("")
        setTargetUser(data.user)
        setMaxEmails(data.user.maxEmails.toString())
        if ([ROLES.EMPEROR, ROLES.DUKE, ROLES.KNIGHT, ROLES.CIVILIAN].includes(data.user.role as Role)) {
          setTargetRole(data.user.role as Role)
        }
      } catch {
        if (!cancelled) {
          setTargetUser(null)
          setSearchError("")
          setMaxEmails("")
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
  }, [searchText, userNotFoundText])

  const handleAction = async () => {
    if (!targetUser) return

    const parsedMaxEmails = Number(maxEmails)
    if (!maxEmails.trim() || !Number.isInteger(parsedMaxEmails) || parsedMaxEmails < 0) {
      toast({
        title: t("updateFailed"),
        description: t("maxEmailsInvalid"),
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
          maxEmails: parsedMaxEmails
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
      setMaxEmails("")
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
        <div className="grid grid-cols-[minmax(0,1fr)_8rem_9rem] gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("search")}</Label>
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-invalid={!!searchError}
              aria-describedby={searchError ? "user-search-error" : undefined}
            />
            {searchError && (
              <p id="user-search-error" className="text-xs text-destructive text-right">
                {searchError}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("role")}</Label>
            <Select
              value={targetRole}
              onValueChange={(value) => setTargetRole(value as RoleWithoutEmperor)}
              disabled={targetUser?.role === ROLES.EMPEROR}
            >
              <SelectTrigger>
                <SelectValue />
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
          <div className="space-y-2">
            <Label htmlFor="user-max-emails" className="text-sm font-medium">
              {t("maxEmails")}
            </Label>
            <Input
              id="user-max-emails"
              type="number"
              min="0"
              value={maxEmails}
              onChange={(e) => setMaxEmails(e.target.value)}
              placeholder="0"
              disabled={targetUser?.role === ROLES.EMPEROR}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {searching ? t("loading") : t("maxEmailsHint")}
        </p>

        <Button
          onClick={handleAction}
          disabled={loading || searching || !targetUser || targetUser.role === ROLES.EMPEROR}
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

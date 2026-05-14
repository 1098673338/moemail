"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Crown, Gem, Sword, User2, Loader2, Users, List, Trash2 } from "lucide-react"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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

interface UserListItem {
  id: string
  name?: string | null
  username?: string | null
  email?: string | null
  role?: string | null
  emailCount: number
  sentCount: number
  maxEmails: number
  sendLimit: number | null
}

const OPEN_DIALOG_SELECTOR = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'

const restoreBodyPointerEventsIfNoDialog = () => {
  if (typeof window === "undefined") return

  window.setTimeout(() => {
    if (document.querySelector(OPEN_DIALOG_SELECTOR)) return
    if (document.body.style.pointerEvents === "none") {
      document.body.style.removeProperty("pointer-events")
    }
  }, 260)
}

export function PromotePanel() {
  const t = useTranslations("profile.promote")
  const tCard = useTranslations("profile.card")
  const tCommon = useTranslations("common.actions")
  const tFeedback = useTranslations("common.feedback")
  const [searchText, setSearchText] = useState("")
  const [targetUser, setTargetUser] = useState<TargetUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [targetRole, setTargetRole] = useState<Role>(ROLES.KNIGHT)
  const [maxEmails, setMaxEmails] = useState("")
  const [sendLimit, setSendLimit] = useState("")
  const [userListOpen, setUserListOpen] = useState(false)
  const [userList, setUserList] = useState<UserListItem[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [deleteUserTarget, setDeleteUserTarget] = useState<UserListItem | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
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

  const getUserDisplayName = (user: UserListItem) => (
    user.username || user.name || t("usernameUnset")
  )

  const getUserSubtitle = (user: UserListItem) => (
    user.email || user.id
  )

  const getRoleName = (role?: string | null) => {
    if (role && role in roleNames) {
      return roleNames[role as keyof typeof roleNames]
    }
    return role || "-"
  }

  const getMailboxLimitDisplay = (limit?: number | null) => {
    if (limit === EMAIL_CONFIG.UNLIMITED_LIMIT) return t("unlimited")
    return typeof limit === "number" ? limit.toString() : "-"
  }

  const getMailboxUsageDisplay = (user: UserListItem) => (
    `${user.emailCount} / ${getMailboxLimitDisplay(user.maxEmails)}`
  )

  const getSendLimitDisplay = (limit?: number | null) => {
    if (limit === EMAIL_CONFIG.UNLIMITED_LIMIT) return t("unlimited")
    if (limit == null || limit < 0) return t("sendDisabled")
    return limit.toString()
  }

  const getSendUsageDisplay = (user: UserListItem) => (
    `${user.sentCount} / ${getSendLimitDisplay(user.sendLimit)}`
  )

  const fetchUserList = async () => {
    setLoadingUsers(true)
    try {
      const res = await fetch("/api/roles/users")
      const data = await res.json() as {
        currentUserId?: string | null
        users?: UserListItem[]
        error?: string
      }

      if (!res.ok) {
        throw new Error(data.error || t("loadUsersFailed"))
      }

      setCurrentUserId(data.currentUserId ?? null)
      setUserList(data.users || [])
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : t("loadUsersFailed"),
        variant: "destructive",
      })
    } finally {
      setLoadingUsers(false)
    }
  }

  const openUserList = () => {
    setUserListOpen(true)
    void fetchUserList()
  }

  const handleUserListOpenChange = (nextOpen: boolean) => {
    setUserListOpen(nextOpen)
    if (!nextOpen) {
      setDeleteUserTarget(null)
      setDeletingUserId(null)
      restoreBodyPointerEventsIfNoDialog()
    }
  }

  const handleDeleteUserOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !deletingUserId) {
      setDeleteUserTarget(null)
    }
  }

  const deleteUser = async (user: UserListItem) => {
    setDeletingUserId(user.id)
    try {
      const res = await fetch("/api/roles/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json().catch(() => null) as { error?: string } | null

      if (!res.ok) {
        throw new Error(data?.error || t("deleteUserFailed"))
      }

      setUserList(prev => prev.filter(item => item.id !== user.id))
      if (targetUser?.id === user.id) {
        setTargetUser(null)
        setSearchText("")
        setTargetRole(ROLES.KNIGHT)
        setMaxEmails("")
        setSendLimit("")
      }

      toast({
        title: tFeedback("deleteSuccess"),
      })
    } catch {
      toast({
        title: tFeedback("deleteFailed"),
        variant: "destructive",
      })
    } finally {
      setDeletingUserId(null)
      setDeleteUserTarget(null)
      restoreBodyPointerEventsIfNoDialog()
    }
  }

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
      })
      setSearchText("")
      setTargetUser(null)
      setTargetRole(ROLES.KNIGHT)
      setMaxEmails("")
      setSendLimit("")
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : t("updateFailed"),
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-background rounded-lg border border-gray-200 p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">{t("title")}</h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-2"
          onClick={openUserList}
        >
          <List className="h-4 w-4" />
          {t("userList")}
        </Button>
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

      <Dialog open={userListOpen} onOpenChange={handleUserListOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("userListTitle")}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[520px] overflow-y-auto">
            {loadingUsers ? (
              <div className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 className="mb-3 h-6 w-6 animate-spin text-primary/50" />
                {t("loadingUsers")}
              </div>
            ) : userList.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {t("noUsers")}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-[minmax(0,1fr)_96px_108px_84px_56px] items-center gap-3 px-3 text-xs text-muted-foreground">
                  <span>{t("userColumn")}</span>
                  <span>{t("roleColumn")}</span>
                  <span className="text-right">{t("emailCountColumn")}</span>
                  <span className="text-right">{t("sendLimitColumn")}</span>
                  <span className="text-right">{t("actionsColumn")}</span>
                </div>
                {userList.map(user => (
                  <div
                    key={user.id}
                    className="grid grid-cols-[minmax(0,1fr)_96px_108px_84px_56px] items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {getUserDisplayName(user)}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {getUserSubtitle(user)}
                      </div>
                    </div>
                    <div className="truncate text-sm text-muted-foreground">
                      {getRoleName(user.role)}
                    </div>
                    <div className="text-right text-sm">
                      {getMailboxUsageDisplay(user)}
                    </div>
                    <div className="text-right text-sm">
                      {getSendUsageDisplay(user)}
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={
                          user.role === ROLES.EMPEROR
                          || user.id === currentUserId
                          || deletingUserId === user.id
                        }
                        onClick={() => setDeleteUserTarget(user)}
                      >
                        {deletingUserId === user.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteUserTarget} onOpenChange={handleDeleteUserOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteUserConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteUserTarget
                ? t("deleteUserDescription", {
                  name: getUserDisplayName(deleteUserTarget),
                  count: deleteUserTarget.emailCount,
                })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingUserId)}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={Boolean(deletingUserId)}
              onClick={(event) => {
                event.preventDefault()
                if (deleteUserTarget) {
                  void deleteUser(deleteUserTarget)
                }
              }}
            >
              {deletingUserId ? t("deletingUser") : tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
} 

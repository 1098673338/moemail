"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Cloud, Eye, EyeOff, Loader2, MailCheck, PlugZap, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"

interface ExternalMailAccount {
  id: string
  emailId: string
  provider: string
  emailAddress: string
  username: string
  enabled: boolean
  lastUid: number
  lastSyncAt: number | null
  createdAt: number
  updatedAt: number
  email: {
    address: string
    createdAt: number
    expiresAt: number
  } | null
}

const emptyForm = {
  emailAddress: "",
  username: "",
  password: "",
}

export function ExternalMailPanel() {
  const t = useTranslations("profile.externalMail")
  const { toast } = useToast()
  const [accounts, setAccounts] = useState<ExternalMailAccount[]>([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const loadAccounts = async () => {
    setLoading(true)

    try {
      const response = await fetch("/api/external-mail/accounts")
      const data = await response.json().catch(() => ({})) as {
        accounts?: ExternalMailAccount[]
        error?: string
      }

      if (!response.ok) {
        throw new Error(data.error || t("loadFailed"))
      }

      setAccounts(data.accounts ?? [])
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : t("loadFailed"),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAccounts()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateForm = (field: keyof typeof emptyForm, value: string) => {
    setForm(prev => ({
      ...prev,
      [field]: value,
      ...(field === "emailAddress" && !prev.username ? { username: value } : {}),
    }))
  }

  const validateForm = () => {
    const emailAddress = form.emailAddress.trim()
    const username = form.username.trim() || emailAddress
    const password = form.password

    if (!emailAddress || !username || !password) {
      throw new Error(t("missingFields"))
    }

    return {
      emailAddress,
      username,
      password,
    }
  }

  const testConnection = async () => {
    let payload: ReturnType<typeof validateForm>

    try {
      payload = validateForm()
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : t("testFailed"),
        variant: "destructive",
      })
      return
    }

    setTesting(true)

    try {
      const response = await fetch("/api/external-mail/accounts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({})) as { error?: string }

      if (!response.ok) {
        throw new Error(data.error || t("testFailed"))
      }

      toast({ title: t("testSuccess") })
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : t("testFailed"),
        variant: "destructive",
      })
    } finally {
      setTesting(false)
    }
  }

  const createAccount = async () => {
    let payload: ReturnType<typeof validateForm>

    try {
      payload = validateForm()
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : t("createFailed"),
        variant: "destructive",
      })
      return
    }

    setSaving(true)

    try {
      const response = await fetch("/api/external-mail/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          provider: "icloud",
        }),
      })
      const data = await response.json().catch(() => ({})) as {
        account?: ExternalMailAccount
        error?: string
      }

      if (!response.ok || !data.account) {
        throw new Error(data.error || t("createFailed"))
      }

      setAccounts(prev => [data.account!, ...prev])
      setForm(emptyForm)
      setShowPassword(false)
      toast({ title: t("createSuccess") })
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : t("createFailed"),
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const syncAccount = async (accountId: string) => {
    setSyncingId(accountId)

    try {
      const response = await fetch(`/api/external-mail/accounts/${accountId}/sync?rescan=1`, {
        method: "POST",
      })
      const data = await response.json().catch(() => ({})) as {
        imported?: number
        fetched?: number
        error?: string
      }

      if (!response.ok) {
        throw new Error(data.error || t("syncFailed"))
      }

      toast({
        title: t("syncSuccess", {
          imported: data.imported ?? 0,
          fetched: data.fetched ?? 0,
        }),
      })
      await loadAccounts()
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : t("syncFailed"),
        variant: "destructive",
      })
    } finally {
      setSyncingId(null)
    }
  }

  const deleteAccount = async (accountId: string) => {
    setDeletingId(accountId)

    try {
      const response = await fetch(`/api/external-mail/accounts/${accountId}`, {
        method: "DELETE",
      })
      const data = await response.json().catch(() => ({})) as { error?: string }

      if (!response.ok) {
        throw new Error(data.error || t("deleteFailed"))
      }

      setAccounts(prev => prev.filter(account => account.id !== accountId))
      toast({ title: t("deleteSuccess") })
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : t("deleteFailed"),
        variant: "destructive",
      })
    } finally {
      setDeletingId(null)
    }
  }

  const formatSyncTime = (value: number | null) => {
    if (!value) return t("neverSynced")
    return new Date(value).toLocaleString()
  }

  return (
    <div className="bg-background rounded-lg border border-gray-200 p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Cloud className="h-5 w-5 shrink-0 text-primary" />
          <h2 className="truncate text-lg font-semibold">{t("title")}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-2"
            onClick={testConnection}
            disabled={saving || testing}
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            {testing ? t("testing") : t("test")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 gap-2"
            onClick={createAccount}
            disabled={saving || testing}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
            {saving ? t("creating") : t("create")}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-[180px_minmax(0,1fr)] items-center gap-4">
          <span className="text-left text-sm">{t("emailAddress")}:</span>
          <Input
            id="external-email-address"
            value={form.emailAddress}
            onChange={(event) => updateForm("emailAddress", event.target.value)}
            placeholder={t("emailAddressPlaceholder")}
            disabled={saving || testing}
          />
        </div>
        <div className="grid grid-cols-[180px_minmax(0,1fr)] items-center gap-4">
          <span className="text-left text-sm">{t("username")}:</span>
          <Input
            id="external-username"
            value={form.username}
            onChange={(event) => updateForm("username", event.target.value)}
            placeholder={t("usernamePlaceholder")}
            disabled={saving || testing}
          />
        </div>
        <div className="grid grid-cols-[180px_minmax(0,1fr)] items-center gap-4">
          <span className="text-left text-sm">{t("password")}:</span>
          <div className="relative">
            <Input
              id="external-password"
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(event) => updateForm("password", event.target.value)}
              placeholder={t("passwordPlaceholder")}
              disabled={saving || testing}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowPassword(prev => !prev)}
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {loading ? (
          <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("loading")}
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          accounts.map(account => (
            <div
              key={account.id}
              className="flex flex-col gap-3 rounded-md border border-gray-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{account.emailAddress}</span>
                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    iCloud
                  </span>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {t("lastSyncAt")}: {formatSyncTime(account.lastSyncAt)}
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-2"
                  onClick={() => syncAccount(account.id)}
                  disabled={syncingId === account.id || deletingId === account.id}
                >
                  {syncingId === account.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {syncingId === account.id ? t("syncing") : t("sync")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => deleteAccount(account.id)}
                  disabled={deletingId === account.id || syncingId === account.id}
                  aria-label={t("delete")}
                >
                  {deletingId === account.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

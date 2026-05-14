"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Eye, EyeOff, Gem, Settings, Sword, User2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useState } from "react"
import { Role, ROLES } from "@/lib/permissions"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EMAIL_CONFIG } from "@/config"

export interface WebsiteConfigData {
  defaultRole: Exclude<Role, typeof ROLES.EMPEROR>
  emailDomains: string
  adminContact: string
  maxEmails: string
  turnstile?: {
    enabled: boolean
    siteKey: string
    secretKey?: string
  }
}

interface WebsiteConfigPanelProps {
  initialConfig: WebsiteConfigData
}

export function WebsiteConfigPanel({ initialConfig }: WebsiteConfigPanelProps) {
  const t = useTranslations("profile.website")
  const tCard = useTranslations("profile.card")
  const [defaultRole, setDefaultRole] = useState<string>(initialConfig.defaultRole)
  const [emailDomains, setEmailDomains] = useState<string>(initialConfig.emailDomains)
  const [adminContact, setAdminContact] = useState<string>(initialConfig.adminContact)
  const [maxEmails, setMaxEmails] = useState<string>(initialConfig.maxEmails || EMAIL_CONFIG.MAX_ACTIVE_EMAILS.toString())
  const [turnstileEnabled, setTurnstileEnabled] = useState(Boolean(initialConfig.turnstile?.enabled))
  const [turnstileSiteKey, setTurnstileSiteKey] = useState(initialConfig.turnstile?.siteKey ?? "")
  const [turnstileSecretKey, setTurnstileSecretKey] = useState(initialConfig.turnstile?.secretKey ?? "")
  const [showSecretKey, setShowSecretKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const roleNames = {
    [ROLES.DUKE]: tCard("roles.DUKE"),
    [ROLES.KNIGHT]: tCard("roles.KNIGHT"),
    [ROLES.CIVILIAN]: tCard("roles.CIVILIAN"),
  } as const

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          defaultRole, 
          emailDomains,
          adminContact,
          maxEmails: maxEmails || EMAIL_CONFIG.MAX_ACTIVE_EMAILS.toString(),
          turnstile: {
            enabled: turnstileEnabled,
            siteKey: turnstileSiteKey,
            secretKey: turnstileSecretKey
          }
        }),
      })

      if (!res.ok) throw new Error(t("saveFailed"))

      toast({
        title: t("saveSuccess"),
        description: t("saveSuccess"),
      })
    } catch (error) {
      toast({
        title: t("saveFailed"),
        description: error instanceof Error ? error.message : t("saveFailed"),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-background rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">{t("title")}</h2>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-[180px_minmax(0,1fr)] items-center gap-4">
          <span className="text-left text-sm">{t("defaultRole")}:</span>
          <Select value={defaultRole} onValueChange={setDefaultRole}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
          <span className="text-left text-sm">{t("emailDomains")}:</span>
          <Input 
            value={emailDomains}
            onChange={(e) => setEmailDomains(e.target.value)}
            placeholder={t("emailDomainsPlaceholder")}
          />
        </div>

        <div className="grid grid-cols-[180px_minmax(0,1fr)] items-center gap-4">
          <span className="text-left text-sm">{t("adminContact")}:</span>
          <Input 
            value={adminContact}
            onChange={(e) => setAdminContact(e.target.value)}
            placeholder={t("adminContactPlaceholder")}
          />
        </div>

        <div className="grid grid-cols-[180px_minmax(0,1fr)] items-center gap-4">
          <span className="text-left text-sm">{t("maxEmails")}:</span>
          <Input 
            type="number"
            min="1"
            max="100"
            value={maxEmails}
            onChange={(e) => setMaxEmails(e.target.value)}
            placeholder={`${EMAIL_CONFIG.MAX_ACTIVE_EMAILS}`}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="turnstile-enabled" className="text-sm font-medium">
              {t("turnstile.enable")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("turnstile.enableDescription")}
            </p>
          </div>
          <Switch
            id="turnstile-enabled"
            checked={turnstileEnabled}
            onCheckedChange={setTurnstileEnabled}
          />
        </div>

        {turnstileEnabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="turnstile-site-key" className="text-sm font-medium">
                {t("turnstile.siteKey")}
              </Label>
              <Input
                id="turnstile-site-key"
                value={turnstileSiteKey}
                onChange={(e) => setTurnstileSiteKey(e.target.value)}
                placeholder={t("turnstile.siteKeyPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="turnstile-secret-key" className="text-sm font-medium">
                {t("turnstile.secretKey")}
              </Label>
              <div className="relative">
                <Input
                  id="turnstile-secret-key"
                  type={showSecretKey ? "text" : "password"}
                  value={turnstileSecretKey}
                  onChange={(e) => setTurnstileSecretKey(e.target.value)}
                  placeholder={t("turnstile.secretKeyPlaceholder")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowSecretKey((prev) => !prev)}
                >
                  {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("turnstile.secretKeyDescription")}
              </p>
            </div>
          </>
        )}

        <Button 
          onClick={handleSave}
          disabled={loading}
          className="w-full"
        >
          {t("save")}
        </Button>
      </div>
    </div>
  )
} 

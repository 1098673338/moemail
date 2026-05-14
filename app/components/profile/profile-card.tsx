"use client"

import { User } from "next-auth"
import { useTranslations, useLocale } from "next-intl"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { signOut } from "next-auth/react"
import { Github, Settings, Crown, Sword, User2, Gem, Mail, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { WebhookConfig, type WebhookConfigData } from "./webhook-config"
import { PromotePanel } from "./promote-panel"
import { EmailServiceConfig, type EmailServiceConfigData } from "./email-service-config"
import { hasPermission, PERMISSIONS, Permission, Role, ROLES } from "@/lib/permissions"
import { WebsiteConfigPanel, type WebsiteConfigData } from "./website-config-panel"
import { ApiKeyPanel, type ApiKeyData } from "./api-key-panel"
import { EMAIL_CONFIG } from "@/config"
import { useEffect, useState } from "react"

interface ProfileCardProps {
  user: User
}

const roleConfigs = {
  emperor: { key: 'EMPEROR', icon: Crown },
  duke: { key: 'DUKE', icon: Gem },
  knight: { key: 'KNIGHT', icon: Sword },
  civilian: { key: 'CIVILIAN', icon: User2 },
} as const

const providerConfigs = {
  google: {
    label: "Google",
    className: "text-red-500 bg-red-500/10",
    icon: (props: any) => (
      <svg viewBox="0 0 24 24" {...props}>
        <path
          fill="currentColor"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="currentColor"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="currentColor"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="currentColor"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    ),
  },
  github: {
    label: "GitHub",
    className: "text-primary bg-primary/10",
    icon: Github,
  },
} as const

const defaultWebsiteConfig: WebsiteConfigData = {
  defaultRole: ROLES.CIVILIAN,
  emailDomains: "moemail.app",
  adminContact: "",
  maxEmails: EMAIL_CONFIG.MAX_ACTIVE_EMAILS.toString(),
  registrationEnabled: true,
  turnstile: {
    enabled: false,
    siteKey: "",
    secretKey: "",
  },
}

const defaultEmailServiceConfig: EmailServiceConfigData = {
  enabled: false,
  apiKey: "",
}

const defaultWebhookConfig: WebhookConfigData = {
  enabled: false,
  url: "",
}

const defaultApiKeys: ApiKeyData[] = []

type SettingsData = {
  webhookConfig: WebhookConfigData | null
  websiteConfig: WebsiteConfigData | null
  emailServiceConfig: EmailServiceConfigData | null
  apiKeys: ApiKeyData[]
}

export function ProfileCard({ user }: ProfileCardProps) {
  const t = useTranslations("profile.card")
  const tAuth = useTranslations("auth.signButton")
  const tWebhook = useTranslations("profile.webhook")
  const tNav = useTranslations("common.nav")
  const locale = useLocale()
  const router = useRouter()
  const userRoleNames = user.roles?.map((role) => role.name) as Role[] | undefined
  const checkPermission = (permission: Permission) => {
    return userRoleNames ? hasPermission(userRoleNames, permission) : false
  }
  const canManageWebhook = checkPermission(PERMISSIONS.MANAGE_WEBHOOK)
  const canPromote = checkPermission(PERMISSIONS.PROMOTE_USER)
  const canManageConfig = checkPermission(PERMISSIONS.MANAGE_CONFIG)
  const canManageApiKey = checkPermission(PERMISSIONS.MANAGE_API_KEY)
  const shouldShowApiKeyPanel = canManageWebhook || canManageApiKey
  const shouldLoadSiteConfig = canManageConfig || shouldShowApiKeyPanel
  const shouldLoadSettings = canManageWebhook || canManageConfig || shouldShowApiKeyPanel
  const [settingsLoading, setSettingsLoading] = useState(shouldLoadSettings)
  const [settingsData, setSettingsData] = useState<SettingsData | null>(null)

  useEffect(() => {
    if (!shouldLoadSettings) {
      setSettingsLoading(false)
      setSettingsData(null)
      return
    }

    let cancelled = false

    const fetchSettingsConfig = async () => {
      setSettingsLoading(true)
      setSettingsData(null)

      try {
        const fetchConfig = async <T,>(url: string, fallback: T): Promise<T> => {
          try {
            const res = await fetch(url)
            return res.ok ? await res.json() as T : fallback
          } catch {
            return fallback
          }
        }

        const [webhookData, websiteData, emailServiceData, apiKeyData] = await Promise.all([
          canManageWebhook
            ? fetchConfig<WebhookConfigData>("/api/webhook", defaultWebhookConfig)
            : Promise.resolve<WebhookConfigData | null>(null),
          shouldLoadSiteConfig
            ? fetchConfig<WebsiteConfigData>("/api/config", defaultWebsiteConfig)
            : Promise.resolve<WebsiteConfigData | null>(null),
          canManageConfig
            ? fetchConfig<EmailServiceConfigData>("/api/config/email-service", defaultEmailServiceConfig)
            : Promise.resolve<EmailServiceConfigData | null>(null),
          canManageApiKey
            ? fetchConfig<{ apiKeys: ApiKeyData[] }>("/api/api-keys", { apiKeys: defaultApiKeys })
            : Promise.resolve<{ apiKeys: ApiKeyData[] }>({ apiKeys: defaultApiKeys }),
        ])

        if (!cancelled) {
          setSettingsData({
            webhookConfig: webhookData,
            websiteConfig: websiteData,
            emailServiceConfig: emailServiceData,
            apiKeys: apiKeyData.apiKeys,
          })
        }
      } catch (error) {
        console.error("Failed to fetch settings config:", error)
        if (!cancelled) {
          setSettingsData({
            webhookConfig: canManageWebhook ? defaultWebhookConfig : null,
            websiteConfig: shouldLoadSiteConfig ? defaultWebsiteConfig : null,
            emailServiceConfig: canManageConfig ? defaultEmailServiceConfig : null,
            apiKeys: defaultApiKeys,
          })
        }
      } finally {
        if (!cancelled) {
          setSettingsLoading(false)
        }
      }
    }

    fetchSettingsConfig()

    return () => {
      cancelled = true
    }
  }, [canManageApiKey, canManageConfig, canManageWebhook, shouldLoadSettings, shouldLoadSiteConfig])

  const webhookConfig = settingsData?.webhookConfig ?? null
  const websiteConfig = settingsData?.websiteConfig ?? null
  const emailServiceConfig = settingsData?.emailServiceConfig ?? null
  const apiKeys = settingsData?.apiKeys ?? defaultApiKeys

  if (shouldLoadSettings && (settingsLoading || !settingsData)) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-2xl items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-background rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-6">
          <div className="relative">
            {user.image && (
              <Image
                src={user.image}
                alt={user.name || tAuth("userAvatar")}
                width={80}
                height={80}
                className="rounded-full ring-2 ring-primary/20"
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold truncate">{user.name}</h2>
              {!!user?.providers?.length && (
                <div className="flex gap-2">
                  {user.providers.map((provider) => {
                    const config = providerConfigs[provider as keyof typeof providerConfigs]
                    if (!config) return null
                    const Icon = config.icon
                    return (
                      <div
                        key={provider}
                        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${config.className}`}
                      >
                        <Icon className="w-3 h-3" />
                        {config.label}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate mt-1">
              {
                user.email ? user.email : `${t("name")}: ${user.username}`
              }
            </p>
            {user.roles && (
              <div className="flex gap-2 mt-2">
                {user.roles.map(({ name }) => {
                  const roleConfig = roleConfigs[name as keyof typeof roleConfigs]
                  const Icon = roleConfig.icon
                  const roleName = t(`roles.${roleConfig.key}` as any)
                  return (
                    <div
                      key={name}
                      className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded"
                      title={roleName}
                    >
                      <Icon className="w-3 h-3" />
                      {roleName}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {canManageWebhook && webhookConfig && (
        <div className="bg-background rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Settings className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{tWebhook("title")}</h2>
          </div>
          <WebhookConfig initialConfig={webhookConfig} />
        </div>
      )}

      {canManageConfig && websiteConfig && emailServiceConfig && (
        <>
          <WebsiteConfigPanel initialConfig={websiteConfig} />
          <EmailServiceConfig initialConfig={emailServiceConfig} />
        </>
      )}
      {canPromote && <PromotePanel />}
      {shouldShowApiKeyPanel && websiteConfig && (
        <ApiKeyPanel
          initialApiKeys={apiKeys}
          canManageApiKey={canManageApiKey}
          adminContact={websiteConfig.adminContact}
        />
      )}

      <div className="flex flex-col sm:flex-row gap-4 px-1">
        <Button
          onClick={() => router.push(`/${locale}/moe`)}
          className="flex-1 gap-2"
        >
          <Mail className="w-4 h-4" />
          {tNav("backToMailbox")}
        </Button>
        <Button
          variant="outline"
          onClick={() => signOut({ callbackUrl: `/${locale}` })}
          className="flex-1"
        >
          {tAuth("logout")}
        </Button>
      </div>
    </div>
  )
} 

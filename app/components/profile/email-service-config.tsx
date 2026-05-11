"use client"

import React, { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Zap, Eye, EyeOff } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

export interface EmailServiceConfigData {
  enabled: boolean
  apiKey: string
}

interface EmailServiceConfigProps {
  initialConfig: EmailServiceConfigData
}

export function EmailServiceConfig({ initialConfig }: EmailServiceConfigProps) {
  const t = useTranslations("profile.emailService")
  const tCard = useTranslations("profile.card")
  const [config, setConfig] = useState<EmailServiceConfigData>(initialConfig)
  const [loading, setLoading] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const { toast } = useToast()

  const handleSave = async () => {
    setLoading(true)
    try {
      const saveData = {
        enabled: config.enabled,
        apiKey: config.apiKey,
      }

      const res = await fetch("/api/config/email-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saveData),
      })

      if (!res.ok) {
        const error = await res.json() as { error: string }
        throw new Error(error.error || t("saveFailed"))
      }

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
        <Zap className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">{t("title")}</h2>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enabled" className="text-sm font-medium">
              {t("enable")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("enableDescription")}
            </p>
          </div>
          <Switch
            id="enabled"
            checked={config.enabled}
            onCheckedChange={(checked: boolean) =>
              setConfig((prev: EmailServiceConfigData) => ({ ...prev, enabled: checked }))
            }
          />
        </div>

        {config.enabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="apiKey" className="text-sm font-medium">
                {t("apiKey")}
              </Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showToken ? "text" : "password"}
                  value={config.apiKey}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig((prev: EmailServiceConfigData) => ({ ...prev, apiKey: e.target.value }))}
                  placeholder={t("apiKeyPlaceholder")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("roleLimits")}
              </Label>
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                  <p className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    {t("fixedRoleLimits")}
                  </p>
                  <div className="space-y-2 text-gray-700">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                      <span><strong>{tCard("roles.EMPEROR")}</strong> - {t("emperorLimit")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                      <span><strong>{tCard("roles.DUKE")}</strong> - {t("civilianLimit")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                      <span><strong>{tCard("roles.KNIGHT")}</strong> - {t("civilianLimit")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                      <span><strong>{tCard("roles.CIVILIAN")}</strong> - {t("civilianLimit")}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <Button 
          onClick={handleSave}
          disabled={loading}
          className="w-full"
        >
          {loading ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  )
} 

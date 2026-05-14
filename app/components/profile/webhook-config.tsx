"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, Send, ChevronDown, ChevronUp } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export interface WebhookConfigData {
  enabled: boolean
  url: string
}

interface WebhookConfigProps {
  initialConfig: WebhookConfigData
}

export function WebhookConfig({ initialConfig }: WebhookConfigProps) {
  const t = useTranslations("profile.webhook")
  const tCommon = useTranslations("common.actions")
  const [enabled, setEnabled] = useState(initialConfig.enabled)
  const [url, setUrl] = useState(initialConfig.url)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return

    setLoading(true)
    try {
      const res = await fetch("/api/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, enabled })
      })

      if (!res.ok) throw new Error(t("saveFailed"))

      toast({
        title: t("saveSuccess"),
      })
    } catch {
      toast({
        title: t("saveFailed"),
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleTest = async () => {
    if (!url) return

    setTesting(true)
    try {
      const res = await fetch("/api/webhook/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      })

      if (!res.ok) throw new Error(t("testFailed"))

      toast({
        title: t("testSuccess"),
      })
    } catch {
      toast({
        title: t("testFailed"),
        variant: "destructive"
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">{t("enable")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      {enabled && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook-url">{t("url")}</Label>
            <div className="flex gap-2">
              <Input
                id="webhook-url"
                placeholder={t("urlPlaceholder")}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                type="url"
                required
              />
              <Button type="submit" disabled={loading} className="flex-shrink-0">
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  tCommon("save")
                )}
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTest}
                      disabled={testing || !url}
                    >
                      {testing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("test")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("description2")}
            </p>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowDocs(!showDocs)}
            >
              {showDocs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {t("description3")}
            </button>

            {showDocs && (
              <div className="rounded-md bg-muted p-4 text-sm space-y-3">
                <p>{t("docs.intro")}</p>
                <pre className="bg-background p-2 rounded text-xs">
                  Content-Type: application/json{'\n'}
                  X-Webhook-Event: new_message
                </pre>

                <p>{t("docs.exampleBody")}</p>
                <pre className="bg-background p-2 rounded text-xs overflow-auto">
                  {`{
  "emailId": "email-uuid",
  "messageId": "message-uuid",
  "fromAddress": "sender@example.com",
  "subject": "${t("docs.subject")}",
  "content": "${t("docs.content")}",
  "html": "${t("docs.html")}",
  "receivedAt": "2024-01-01T12:00:00.000Z",
  "toAddress": "your-email@${window.location.host}"
}`}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </form>
  )
} 

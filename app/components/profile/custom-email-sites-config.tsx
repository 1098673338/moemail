"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Globe2, Loader2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"
import { CustomEmailSite, isValidEmbeddedUrl, normalizeCustomEmailSites } from "@/lib/custom-email-sites"

export interface CustomEmailSitesConfigData {
  sites: CustomEmailSite[]
}

interface CustomEmailSitesConfigProps {
  initialConfig: CustomEmailSitesConfigData
}

const createEmptySite = (): CustomEmailSite => ({
  domain: "",
  url: "",
})

export function CustomEmailSitesConfig({ initialConfig }: CustomEmailSitesConfigProps) {
  const t = useTranslations("profile.customEmailSites")
  const [sites, setSites] = useState<CustomEmailSite[]>(
    initialConfig.sites.length > 0 ? initialConfig.sites : [createEmptySite()]
  )
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const updateSite = (index: number, field: keyof CustomEmailSite, value: string) => {
    setSites(prev => prev.map((site, siteIndex) => (
      siteIndex === index ? { ...site, [field]: value } : site
    )))
  }

  const addSite = () => {
    setSites(prev => [...prev, createEmptySite()])
  }

  const removeSite = (index: number) => {
    setSites(prev => {
      const nextSites = prev.filter((_, siteIndex) => siteIndex !== index)
      return nextSites.length > 0 ? nextSites : [createEmptySite()]
    })
  }

  const validateSites = () => {
    const filledSites = sites.filter(site => site.domain.trim() || site.url.trim())

    if (filledSites.some(site => !site.domain.trim() || !site.url.trim())) {
      throw new Error(t("missingFields"))
    }

    for (const site of filledSites) {
      if (!isValidEmbeddedUrl(site.url.trim())) {
        throw new Error(t("invalidUrl"))
      }
    }

    return normalizeCustomEmailSites(filledSites)
  }

  const handleSave = async () => {
    let normalizedSites: CustomEmailSite[]

    try {
      normalizedSites = validateSites()
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : t("saveFailed"),
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const response = await fetch("/api/config/custom-email-sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sites: normalizedSites }),
      })
      const data = await response.json().catch(() => ({})) as { sites?: CustomEmailSite[]; error?: string }

      if (!response.ok) {
        throw new Error(data.error || t("saveFailed"))
      }

      setSites(data.sites?.length ? data.sites : [createEmptySite()])
      toast({
        title: t("saveSuccess"),
      })
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : t("saveFailed"),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-background rounded-lg border border-gray-200 p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Globe2 className="h-5 w-5 shrink-0 text-primary" />
          <h2 className="truncate text-lg font-semibold">{t("title")}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-2"
            onClick={addSite}
            disabled={loading}
          >
            <Plus className="h-4 w-4" />
            {t("add")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading}
            size="sm"
            className="h-8 gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? t("saving") : t("save")}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {sites.map((site, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_32px] items-center gap-2">
            <Input
              value={site.domain}
              onChange={(event) => updateSite(index, "domain", event.target.value)}
              placeholder={t("domainPlaceholder")}
              disabled={loading}
            />
            <Input
              value={site.url}
              onChange={(event) => updateSite(index, "url", event.target.value)}
              placeholder={t("urlPlaceholder")}
              disabled={loading}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => removeSite(index)}
              disabled={loading}
              aria-label={t("remove")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

      </div>
    </div>
  )
}

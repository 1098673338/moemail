"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Copy, Plus, RefreshCw } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { nanoid } from "nanoid"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EXPIRY_OPTIONS } from "@/types/email"
import { useCopy } from "@/hooks/use-copy"
import { useConfig } from "@/hooks/use-config"

interface CreateDialogProps {
  onEmailCreated: () => void
  selectedGroupId?: string | null
  selectedGroupName?: string
}

interface EmailGroup {
  id: string
  name: string
  emailCount: number
}

const DEFAULT_EXPIRY_TIME = "0"
const UNGROUPED_GROUP_VALUE = "__ungrouped__"
const getEmailNamePrefix = (value: string) => value.replace(/\s+/g, "").split("@")[0]

export function CreateDialog({ onEmailCreated, selectedGroupId, selectedGroupName }: CreateDialogProps) {
  const { config } = useConfig()
  const t = useTranslations("emails.create")
  const tGroups = useTranslations("emails.groups")
  const tList = useTranslations("emails.list")
  const tCommon = useTranslations("common.actions")
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [emailName, setEmailName] = useState("")
  const [currentDomain, setCurrentDomain] = useState("")
  const [expiryTime, setExpiryTime] = useState(DEFAULT_EXPIRY_TIME)
  const [groups, setGroups] = useState<EmailGroup[]>([])
  const [createGroupId, setCreateGroupId] = useState(UNGROUPED_GROUP_VALUE)
  const { toast } = useToast()
  const { copyToClipboard } = useCopy()
  const selectedGroupExists = createGroupId === UNGROUPED_GROUP_VALUE
    || groups.some(group => group.id === createGroupId)
  const emailNamePrefix = getEmailNamePrefix(emailName)
  const formLabelClass = "w-24 shrink-0 text-muted-foreground"
  const groupSelectItemClass = "hover:bg-accent hover:text-accent-foreground"

  const generateRandomName = () => setEmailName(nanoid(8))
  const getDefaultGroupId = () => (
    selectedGroupId && selectedGroupId !== "none" ? selectedGroupId : UNGROUPED_GROUP_VALUE
  )

  const fetchGroups = async () => {
    try {
      const response = await fetch("/api/email-groups")
      if (!response.ok) return

      const data = await response.json() as { groups: EmailGroup[] }
      setGroups(data.groups)
    } catch (error) {
      console.error("Failed to fetch email groups:", error)
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      setCreateGroupId(getDefaultGroupId())
      fetchGroups()
    }
    if (!nextOpen) {
      setExpiryTime(DEFAULT_EXPIRY_TIME)
      setCreateGroupId(UNGROUPED_GROUP_VALUE)
    }
  }

  const copyEmailAddress = () => {
    copyToClipboard(`${emailNamePrefix}@${currentDomain}`)
  }

  const createEmail = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/emails/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: emailNamePrefix,
          domain: currentDomain,
          expiryTime: parseInt(expiryTime),
          groupId: createGroupId === UNGROUPED_GROUP_VALUE ? null : createGroupId
        })
      })

      if (!response.ok) {
        const data = await response.json()
        toast({
          title: tList("error"),
          description: (data as { error: string }).error,
          variant: "destructive"
        })
        return
      }

      toast({
        title: tList("success"),
        description: t("success")
      })
      onEmailCreated()
      setOpen(false)
      setEmailName("")
      setExpiryTime(DEFAULT_EXPIRY_TIME)
      setCreateGroupId(UNGROUPED_GROUP_VALUE)
    } catch {
      toast({
        title: tList("error"),
        description: t("failed"),
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if ((config?.emailDomainsArray?.length ?? 0) > 0) {
      setCurrentDomain(config?.emailDomainsArray[0] ?? "")
    }
  }, [config])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-2 text-foreground hover:text-foreground transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t("title")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 gap-2">
              <Input
                value={emailName}
                onChange={(e) => setEmailName(e.target.value)}
                placeholder={t("namePlaceholder")}
                className="min-w-0 flex-1"
              />
              {(config?.emailDomainsArray?.length ?? 0) > 1 && (
                <Select value={currentDomain} onValueChange={setCurrentDomain}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {config?.emailDomainsArray?.map(d => (
                      <SelectItem key={d} value={d}>@{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={generateRandomName}
                type="button"
                className="shrink-0"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            {emailNamePrefix ? (
              <div className="flex h-11 min-w-0 items-center gap-2 rounded-md border border-gray-200 bg-gray-100 px-3 text-foreground">
                <span className="shrink-0 text-xs text-muted-foreground">{t("addressPreview")}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
                  {`${emailNamePrefix}@${currentDomain}`}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="h-7 w-7 shrink-0 hover:bg-black/10"
                  aria-label={tCommon("copy")}
                  onClick={copyEmailAddress}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="flex h-11 items-center rounded-md border border-gray-200 bg-gray-100 px-3">
                <span className="text-sm text-muted-foreground/60">{t("addressPreviewEmpty")}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <Label className={formLabelClass}>{t("group")}</Label>
            <Select value={createGroupId} onValueChange={setCreateGroupId}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value={UNGROUPED_GROUP_VALUE} className={groupSelectItemClass}>
                  {tGroups("ungrouped")}
                </SelectItem>
                {!selectedGroupExists && selectedGroupName && (
                  <SelectItem value={createGroupId} className={groupSelectItemClass}>
                    {selectedGroupName}
                  </SelectItem>
                )}
                {groups.map(group => (
                  <SelectItem key={group.id} value={group.id} className={groupSelectItemClass}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-4">
            <Label className={formLabelClass}>{t("expiryTime")}</Label>
            <RadioGroup
              value={expiryTime}
              onValueChange={setExpiryTime}
              className="flex gap-6"
            >
              {EXPIRY_OPTIONS.map((option, index) => {
                const labels = [t("oneHour"), t("oneDay"), t("threeDays"), t("permanent")]
                return (
                  <div key={option.value} className="flex items-center gap-2">
                    <RadioGroupItem value={option.value.toString()} id={option.value.toString()} />
                    <Label htmlFor={option.value.toString()} className="cursor-pointer text-sm">
                      {labels[index]}
                    </Label>
                  </div>
                )
              })}
            </RadioGroup>
          </div>

        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={createEmail} disabled={loading}>
            {loading ? t("creating") : t("create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
} 

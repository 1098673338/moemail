"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Copy, Plus, RefreshCw } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, SlidingTabsList, SlidingTabsTrigger } from "@/components/ui/tabs"
import { TagCombobox } from "@/components/emails/tag-combobox"
import { EXPIRY_OPTIONS } from "@/types/email"
import { useCopy } from "@/hooks/use-copy"
import { useConfig } from "@/hooks/use-config"
import { cn } from "@/lib/utils"
import { generateEmailName, getEmailNamePrefix, isValidEmailNamePrefix } from "@/lib/email-name"

interface CreateDialogProps {
  onEmailCreated: () => void
  selectedGroupId?: string | null
  selectedGroupName?: string
}

interface EmailGroup {
  id: string
  name: string
  emailCount: number
  sortOrder: number
}

type CreateDropdown = "domain" | "group" | "expiry" | "tag"
type CreateMode = "standard" | "custom"

const DEFAULT_EXPIRY_TIME = "0"
const UNGROUPED_GROUP_VALUE = "__ungrouped__"
const MAX_TAG_LENGTH = 32

export function CreateDialog({ onEmailCreated, selectedGroupId, selectedGroupName }: CreateDialogProps) {
  const { config } = useConfig()
  const t = useTranslations("emails.create")
  const tGroups = useTranslations("emails.groups")
  const tCommon = useTranslations("common.actions")
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [createMode, setCreateMode] = useState<CreateMode>("standard")
  const [emailName, setEmailName] = useState("")
  const [customAddress, setCustomAddress] = useState("")
  const [currentDomain, setCurrentDomain] = useState("")
  const [expiryTime, setExpiryTime] = useState(DEFAULT_EXPIRY_TIME)
  const [groups, setGroups] = useState<EmailGroup[]>([])
  const [createGroupId, setCreateGroupId] = useState(UNGROUPED_GROUP_VALUE)
  const [tag, setTag] = useState("")
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const [openDropdown, setOpenDropdown] = useState<CreateDropdown | null>(null)
  const { toast } = useToast()
  const { copyToClipboard } = useCopy()
  const selectedGroupExists = createGroupId === UNGROUPED_GROUP_VALUE
    || groups.some(group => group.id === createGroupId)
  const emailNamePrefix = getEmailNamePrefix(emailName)
  const emailNameError = createMode === "standard" && emailNamePrefix && !isValidEmailNamePrefix(emailNamePrefix)
    ? t("nameInvalidCharacters")
    : ""
  const formLabelClass = "w-12 shrink-0 whitespace-nowrap text-muted-foreground"
  const formRowClass = "flex items-center gap-2"
  const groupSelectItemClass = "hover:bg-accent hover:text-accent-foreground"

  const generateRandomName = () => setEmailName(generateEmailName())
  const handleDropdownOpenChange = (dropdown: CreateDropdown, nextOpen: boolean) => {
    setOpenDropdown(currentDropdown => (
      nextOpen
        ? dropdown
        : currentDropdown === dropdown ? null : currentDropdown
    ))
  }
  const getDefaultGroupId = () => (
    selectedGroupId && selectedGroupId !== "none" ? selectedGroupId : UNGROUPED_GROUP_VALUE
  )
  const getDefaultDomain = () => config?.emailDomainsArray?.[0] ?? ""

  const resetForm = () => {
    setCreateMode("standard")
    setEmailName("")
    setCustomAddress("")
    setCurrentDomain(getDefaultDomain())
    setExpiryTime(DEFAULT_EXPIRY_TIME)
    setCreateGroupId(getDefaultGroupId())
    setTag("")
    setOpenDropdown(null)
  }

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

  const fetchTags = async () => {
    try {
      const response = await fetch("/api/emails/tags")
      if (!response.ok) return

      const data = await response.json() as { tags: string[] }
      setTagOptions(data.tags)
    } catch (error) {
      console.error("Failed to fetch email tags:", error)
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      resetForm()
      fetchGroups()
      fetchTags()
      return
    }

    setOpenDropdown(null)
  }

  const copyEmailAddress = () => {
    copyToClipboard(`${emailNamePrefix}@${currentDomain}`)
  }

  const createEmail = async () => {
    if (emailNameError) return
    if (createMode === "custom" && customAddress.length === 0) return

    setLoading(true)
    try {
      const requestBody = createMode === "custom"
        ? {
            isCustom: true,
            address: customAddress,
            groupId: createGroupId === UNGROUPED_GROUP_VALUE ? null : createGroupId,
            tag: tag.trim() || null
          }
        : {
            name: emailNamePrefix,
            domain: currentDomain,
            expiryTime: parseInt(expiryTime),
            groupId: createGroupId === UNGROUPED_GROUP_VALUE ? null : createGroupId,
            tag: tag.trim() || null
          }

      const response = await fetch("/api/emails/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const data = await response.json()
        toast({
          title: (data as { error?: string }).error || t("failed"),
          variant: "destructive"
        })
        return
      }

      toast({
        title: t("success")
      })
      onEmailCreated()
      setOpen(false)
      setOpenDropdown(null)
    } catch {
      toast({
        title: t("failed"),
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
          size="sm"
          className="h-8 gap-1"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t("create")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Tabs
            value={createMode}
            onValueChange={(value) => {
              setCreateMode(value as CreateMode)
              setOpenDropdown(null)
            }}
          >
            <SlidingTabsList className="h-9 w-full">
              <SlidingTabsTrigger value="standard" className="h-7">
                {t("standardMode")}
              </SlidingTabsTrigger>
              <SlidingTabsTrigger value="custom" className="h-7">
                {t("customMode")}
              </SlidingTabsTrigger>
            </SlidingTabsList>
          </Tabs>

          {createMode === "custom" ? (
            <Input
              value={customAddress}
              onChange={(e) => setCustomAddress(e.target.value)}
              placeholder={t("customAddressPlaceholder")}
            />
          ) : (
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex min-w-0 gap-2">
                <Input
                  value={emailName}
                  onChange={(e) => setEmailName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                  aria-invalid={Boolean(emailNameError)}
                  className={cn(
                    "min-w-0 flex-1",
                    emailNameError && "border-destructive focus-visible:ring-destructive"
                  )}
                />
                {(config?.emailDomainsArray?.length ?? 0) > 1 && (
                  <Select
                    open={openDropdown === "domain"}
                    onOpenChange={(nextOpen) => handleDropdownOpenChange("domain", nextOpen)}
                    value={currentDomain}
                    onValueChange={(value) => {
                      setCurrentDomain(value)
                      setOpenDropdown(null)
                    }}
                  >
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
              {emailNamePrefix && (
                <div className="flex min-w-0 gap-2">
                  <div
                    className={cn(
                      "flex h-9 min-w-0 flex-1 items-center rounded-md px-3 py-1 text-sm transition-colors",
                      emailNameError
                        ? "bg-destructive text-destructive-foreground"
                        : "bg-muted font-mono text-gray-700"
                    )}
                  >
                    <span className="min-w-0 truncate">
                      {emailNameError || `${emailNamePrefix}@${currentDomain}`}
                    </span>
                  </div>
                  {emailNameError ? (
                    <div className="h-9 w-9 shrink-0" aria-hidden="true" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      className="shrink-0 bg-muted hover:bg-muted/80"
                      aria-label={tCommon("copy")}
                      onClick={copyEmailAddress}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className={formRowClass}>
              <Label className={formLabelClass}>{t("group")}</Label>
              <Select
                open={openDropdown === "group"}
                onOpenChange={(nextOpen) => handleDropdownOpenChange("group", nextOpen)}
                value={createGroupId}
                onValueChange={(value) => {
                  setCreateGroupId(value)
                  setOpenDropdown(null)
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[16.5rem]">
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

            {createMode === "standard" && (
              <div className={formRowClass}>
                <Label className={formLabelClass}>{t("expiryTime")}</Label>
                <Select
                  open={openDropdown === "expiry"}
                  onOpenChange={(nextOpen) => handleDropdownOpenChange("expiry", nextOpen)}
                  value={expiryTime}
                  onValueChange={(value) => {
                    setExpiryTime(value)
                    setOpenDropdown(null)
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map((option, index) => {
                      const labels = [t("oneHour"), t("oneDay"), t("threeDays"), t("permanent")]
                      return (
                        <SelectItem
                          key={option.value}
                          value={option.value.toString()}
                          className={groupSelectItemClass}
                        >
                          {labels[index]}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className={formRowClass}>
              <Label className={formLabelClass} htmlFor="create-email-tag">
                {t("tag")}
              </Label>
              <TagCombobox
                id="create-email-tag"
                value={tag}
                options={tagOptions}
                placeholder={t("tagPlaceholder")}
                open={openDropdown === "tag"}
                onOpenChange={(nextOpen) => handleDropdownOpenChange("tag", nextOpen)}
                onValueChange={setTag}
                maxLength={MAX_TAG_LENGTH}
                aria-label={t("tag")}
              />
            </div>
          </div>

        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={createEmail} disabled={loading || Boolean(emailNameError) || (createMode === "custom" && customAddress.length === 0)}>
            {loading ? t("creating") : t("create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
} 

"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { TagCombobox } from "@/components/emails/tag-combobox"
import { EXPIRY_OPTIONS } from "@/types/email"

interface Email {
  id: string
  address: string
  tag?: string | null
  isCustom?: boolean
  createdAt: number | string | Date
  expiresAt: number | string | Date
  groupId?: string | null
}

interface EmailGroup {
  id: string
  name: string
  emailCount: number
  sortOrder: number
}

interface EditDialogProps {
  email: Email | null
  groups: EmailGroup[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onEmailUpdated: (email: Email) => void
}

type EditDropdown = "group" | "expiry" | "tag"

const DEFAULT_EXPIRY_TIME = "0"
const UNGROUPED_GROUP_VALUE = "__ungrouped__"
const MAX_TAG_LENGTH = 32

const getExpiryValue = (email: Email) => {
  const expiresAt = new Date(email.expiresAt)
  if (expiresAt.getFullYear() === 9999) return DEFAULT_EXPIRY_TIME

  const duration = expiresAt.getTime() - new Date(email.createdAt).getTime()
  const matchedOption = EXPIRY_OPTIONS.find(option => Math.abs(option.value - duration) < 1000)

  return (matchedOption?.value ?? EXPIRY_OPTIONS[0].value).toString()
}

export function EditDialog({ email, groups, open, onOpenChange, onEmailUpdated }: EditDialogProps) {
  const tCreate = useTranslations("emails.create")
  const tEdit = useTranslations("emails.edit")
  const tGroups = useTranslations("emails.groups")
  const tCommon = useTranslations("common.actions")
  const [saving, setSaving] = useState(false)
  const [customAddress, setCustomAddress] = useState("")
  const [expiryTime, setExpiryTime] = useState(DEFAULT_EXPIRY_TIME)
  const [editGroupId, setEditGroupId] = useState(UNGROUPED_GROUP_VALUE)
  const [tag, setTag] = useState("")
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const [openDropdown, setOpenDropdown] = useState<EditDropdown | null>(null)
  const { toast } = useToast()
  const formLabelClass = "w-12 shrink-0 whitespace-nowrap text-muted-foreground"
  const formRowClass = "flex items-center gap-2"
  const groupSelectItemClass = "hover:bg-accent hover:text-accent-foreground"

  const handleDropdownOpenChange = (dropdown: EditDropdown, nextOpen: boolean) => {
    setOpenDropdown(currentDropdown => (
      nextOpen
        ? dropdown
        : currentDropdown === dropdown ? null : currentDropdown
    ))
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

  const resetForm = () => {
    if (!email) return

    setExpiryTime(getExpiryValue(email))
    setCustomAddress(email.address)
    setEditGroupId(email.groupId ?? UNGROUPED_GROUP_VALUE)
    setTag(email.tag ?? "")
    setOpenDropdown(null)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setOpenDropdown(null)
    }
  }

  const updateEmail = async () => {
    if (!email) return

    setSaving(true)

    try {
      const requestBody: {
        address?: string
        expiryTime?: number
        groupId: string | null
        tag: string | null
      } = {
        groupId: editGroupId === UNGROUPED_GROUP_VALUE ? null : editGroupId,
        tag: tag.trim() || null,
      }

      if (!email.isCustom) {
        requestBody.expiryTime = parseInt(expiryTime)
      } else {
        requestBody.address = customAddress
      }

      const response = await fetch(`/api/emails/${email.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })
      const data = await response.json() as { email?: Email; error?: string }

      if (!response.ok || !data.email) {
        toast({
          title: data.error || tEdit("failed"),
          variant: "destructive",
        })
        return
      }

      onEmailUpdated(data.email)
      toast({
        title: tEdit("success"),
      })
      handleOpenChange(false)
    } catch {
      toast({
        title: tEdit("failed"),
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!open || !email) return

    resetForm()
    fetchTags()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, email?.id])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{tEdit("title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {email?.isCustom && (
            <div className={formRowClass}>
              <Label className={formLabelClass} htmlFor="edit-email-address">
                {tEdit("address")}
              </Label>
              <Input
                id="edit-email-address"
                value={customAddress}
                onChange={(event) => setCustomAddress(event.target.value)}
                className="min-w-0 flex-1"
              />
            </div>
          )}

          <div className={formRowClass}>
            <Label className={formLabelClass}>{tCreate("group")}</Label>
            <Select
              open={openDropdown === "group"}
              onOpenChange={(nextOpen) => handleDropdownOpenChange("group", nextOpen)}
              value={editGroupId}
              onValueChange={(value) => {
                setEditGroupId(value)
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
                {groups.map(group => (
                  <SelectItem key={group.id} value={group.id} className={groupSelectItemClass}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!email?.isCustom && (
            <div className={formRowClass}>
              <Label className={formLabelClass}>{tCreate("expiryTime")}</Label>
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
                    const labels = [tCreate("oneHour"), tCreate("oneDay"), tCreate("threeDays"), tCreate("fifteenDays"), tCreate("thirtyDays"), tCreate("permanent")]
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
            <Label className={formLabelClass} htmlFor="edit-email-tag">
              {tCreate("tag")}
            </Label>
            <TagCombobox
              id="edit-email-tag"
              value={tag}
              options={tagOptions}
              placeholder={tCreate("tagPlaceholder")}
              open={openDropdown === "tag"}
              onOpenChange={(nextOpen) => handleDropdownOpenChange("tag", nextOpen)}
              onValueChange={setTag}
              maxLength={MAX_TAG_LENGTH}
              aria-label={tCreate("tag")}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={updateEmail} disabled={saving || Boolean(email?.isCustom && customAddress.length === 0)}>
            {saving ? tEdit("saving") : tCommon("save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

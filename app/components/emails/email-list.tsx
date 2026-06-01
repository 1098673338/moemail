"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useTranslations } from "next-intl"
import { ShareDialog } from "./share-dialog"
import { EditDialog } from "./edit-dialog"
import { AtSign, Check, Copy, Download, Folder, FolderOpen, FolderPlus, GripVertical, Loader2, MoreHorizontal, Pencil, RefreshCw, Share2, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useThrottle } from "@/hooks/use-throttle"
import { useToast } from "@/components/ui/use-toast"
import { useDeferredDialogTarget } from "@/hooks/use-deferred-dialog-target"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { ROLES } from "@/lib/permissions"
import { useUserRole } from "@/hooks/use-user-role"
import { useConfig } from "@/hooks/use-config"
import { useCopy } from "@/hooks/use-copy"
import { EMAIL_CONFIG } from "@/config"
import { formatUtcPlus8Date, formatUtcPlus8DateTime } from "@/lib/date-format"

interface Email {
  id: string
  address: string
  tag?: string | null
  isCustom?: boolean
  sortOrder?: number | null
  createdAt: number | string | Date
  expiresAt: number | string | Date
  groupId?: string | null
}

interface EmailListProps {
  onEmailSelect: (email: Email | null) => void
  onGroupChange?: (groupId: string | null, groupName?: string) => void
  selectedEmailId?: string
  refreshTrigger?: number
  onRefresh?: () => void
}

interface EmailResponse {
  emails: Email[]
  nextCursor: string | null
  total: number
}

interface EmailGroup {
  id: string
  name: string
  emailCount: number
  sortOrder: number
}

type DropPosition = "before" | "after"

const EMPTY_STATE_CLASS = "pointer-events-none absolute inset-0 flex -translate-y-6 flex-col items-center justify-center px-6 text-center"

export function EmailList({ onEmailSelect, onGroupChange, selectedEmailId, refreshTrigger, onRefresh }: EmailListProps) {
  const { data: session } = useSession()
  const { config } = useConfig()
  const { role } = useUserRole()
  const t = useTranslations("emails.list")
  const tGroups = useTranslations("emails.groups")
  const tEdit = useTranslations("emails.edit")
  const tShare = useTranslations("emails.share")
  const tCommon = useTranslations("common.actions")
  const tFeedback = useTranslations("common.feedback")
  const [emails, setEmails] = useState<Email[]>([])
  const [groups, setGroups] = useState<EmailGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [movingEmailId, setMovingEmailId] = useState<string | null>(null)
  const [openMoreGroupId, setOpenMoreGroupId] = useState<string | null>(null)
  const [openMoreEmailId, setOpenMoreEmailId] = useState<string | null>(null)
  const [emailToShare, setEmailToShare] = useState<Email | null>(null)
  const [emailToEdit, setEmailToEdit] = useState<Email | null>(null)
  const [editingGroup, setEditingGroup] = useState<EmailGroup | null>(null)
  const [editGroupName, setEditGroupName] = useState("")
  const [savingGroup, setSavingGroup] = useState(false)
  const [deletingGroup, setDeletingGroup] = useState(false)
  const [groupSortMode, setGroupSortMode] = useState(false)
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null)
  const [dragOverGroup, setDragOverGroup] = useState<{
    groupId: string
    position: DropPosition
  } | null>(null)
  const [savingGroupOrder, setSavingGroupOrder] = useState(false)
  const [draggingEmailId, setDraggingEmailId] = useState<string | null>(null)
  const [dragOverEmail, setDragOverEmail] = useState<{
    emailId: string
    position: DropPosition
  } | null>(null)
  const [savingEmailOrder, setSavingEmailOrder] = useState(false)
  const [exportingEmails, setExportingEmails] = useState(false)
  const { toast } = useToast()
  const { copyToClipboard } = useCopy()
  const maxEmailsLimit = config?.maxEmails
  const emailDeleteDialog = useDeferredDialogTarget<Email>()
  const groupDeleteDialog = useDeferredDialogTarget<EmailGroup>()
  const emailToDelete = emailDeleteDialog.target
  const groupToDelete = groupDeleteDialog.target

  const reorderGroups = (
    groupList: EmailGroup[],
    sourceGroupId: string,
    targetGroupId: string,
    position: DropPosition
  ) => {
    const sourceIndex = groupList.findIndex(group => group.id === sourceGroupId)
    const targetIndex = groupList.findIndex(group => group.id === targetGroupId)

    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return groupList
    }

    const nextGroups = [...groupList]
    const [sourceGroup] = nextGroups.splice(sourceIndex, 1)
    const nextTargetIndex = nextGroups.findIndex(group => group.id === targetGroupId)
    const insertIndex = position === "after" ? nextTargetIndex + 1 : nextTargetIndex
    nextGroups.splice(insertIndex, 0, sourceGroup)

    return nextGroups
  }

  const reorderEmails = (
    emailList: Email[],
    sourceEmailId: string,
    targetEmailId: string,
    position: DropPosition
  ) => {
    const sourceIndex = emailList.findIndex(email => email.id === sourceEmailId)
    const targetIndex = emailList.findIndex(email => email.id === targetEmailId)

    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return emailList
    }

    const nextEmails = [...emailList]
    const [sourceEmail] = nextEmails.splice(sourceIndex, 1)
    const nextTargetIndex = nextEmails.findIndex(email => email.id === targetEmailId)
    const insertIndex = position === "after" ? nextTargetIndex + 1 : nextTargetIndex
    nextEmails.splice(insertIndex, 0, sourceEmail)

    return nextEmails
  }

  const toggleGroupSortMode = () => {
    setGroupSortMode(prev => !prev)
    setOpenMoreGroupId(null)
    setOpenMoreEmailId(null)
    setDraggingGroupId(null)
    setDragOverGroup(null)
    setDraggingEmailId(null)
    setDragOverEmail(null)
  }

  useEffect(() => {
    if (!groupSortMode) return

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (target?.closest("[data-sort-region='true']")) {
        return
      }

      setGroupSortMode(false)
      setDraggingGroupId(null)
      setDragOverGroup(null)
      setDraggingEmailId(null)
      setDragOverEmail(null)
    }

    document.addEventListener("click", handleDocumentClick)

    return () => {
      document.removeEventListener("click", handleDocumentClick)
    }
  }, [groupSortMode])

  const saveGroupOrder = async (orderedGroups: EmailGroup[], previousGroups: EmailGroup[]) => {
    setSavingGroupOrder(true)

    try {
      const response = await fetch("/api/email-groups/order", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          groupIds: orderedGroups.map(group => group.id),
        }),
      })
      const data = await response.json().catch(() => ({})) as { error?: string }

      if (!response.ok) {
        throw new Error(data.error || tGroups("sortFailed"))
      }
    } catch (error) {
      setGroups(previousGroups)
      toast({
        title: error instanceof Error ? error.message : tGroups("sortFailed"),
        variant: "destructive",
      })
    } finally {
      setSavingGroupOrder(false)
    }
  }

  const saveEmailOrder = async (orderedEmails: Email[], previousEmails: Email[]) => {
    setSavingEmailOrder(true)

    try {
      const response = await fetch("/api/emails/order", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          emailIds: orderedEmails.map(email => email.id),
          groupId: selectedGroupId,
        }),
      })
      const data = await response.json().catch(() => ({})) as { error?: string }

      if (!response.ok) {
        throw new Error(data.error || tGroups("sortFailed"))
      }
    } catch (error) {
      setEmails(previousEmails)
      toast({
        title: error instanceof Error ? error.message : tGroups("sortFailed"),
        variant: "destructive",
      })
    } finally {
      setSavingEmailOrder(false)
    }
  }

  const handleGroupDragStart = (event: React.DragEvent<HTMLButtonElement>, groupId: string) => {
    if (!groupSortMode || savingGroupOrder) {
      event.preventDefault()
      return
    }

    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", groupId)
    setDraggingGroupId(groupId)
  }

  const handleGroupDragOver = (event: React.DragEvent<HTMLDivElement>, groupId: string) => {
    if (!groupSortMode || savingGroupOrder) return

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    if (!draggingGroupId || draggingGroupId === groupId) {
      setDragOverGroup(null)
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after"
    setDragOverGroup({ groupId, position })
  }

  const handleGroupDrop = (event: React.DragEvent<HTMLDivElement>, targetGroupId: string) => {
    event.preventDefault()

    if (!groupSortMode) return

    const sourceGroupId = draggingGroupId || event.dataTransfer.getData("text/plain")
    const position = dragOverGroup?.groupId === targetGroupId ? dragOverGroup.position : "before"
    setDraggingGroupId(null)
    setDragOverGroup(null)

    if (!sourceGroupId || sourceGroupId === targetGroupId || savingGroupOrder) return

    const previousGroups = groups
    const orderedGroups = reorderGroups(groups, sourceGroupId, targetGroupId, position)
    if (orderedGroups === groups) return

    setGroups(orderedGroups)
    saveGroupOrder(orderedGroups, previousGroups)
  }

  const handleGroupDragEnd = () => {
    setDraggingGroupId(null)
    setDragOverGroup(null)
  }

  const handleEmailDragStart = (event: React.DragEvent<HTMLButtonElement>, emailId: string) => {
    if (!groupSortMode || savingEmailOrder) {
      event.preventDefault()
      return
    }

    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", emailId)
    setDraggingEmailId(emailId)
  }

  const handleEmailDragOver = (event: React.DragEvent<HTMLDivElement>, emailId: string) => {
    if (!groupSortMode || savingEmailOrder) return

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    if (!draggingEmailId || draggingEmailId === emailId) {
      setDragOverEmail(null)
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after"
    setDragOverEmail({ emailId, position })
  }

  const handleEmailDrop = (event: React.DragEvent<HTMLDivElement>, targetEmailId: string) => {
    event.preventDefault()

    if (!groupSortMode) return

    const sourceEmailId = draggingEmailId || event.dataTransfer.getData("text/plain")
    const position = dragOverEmail?.emailId === targetEmailId ? dragOverEmail.position : "before"
    setDraggingEmailId(null)
    setDragOverEmail(null)

    if (!sourceEmailId || sourceEmailId === targetEmailId || savingEmailOrder) return

    const previousEmails = emails
    const orderedEmails = reorderEmails(emails, sourceEmailId, targetEmailId, position)
    if (orderedEmails === emails) return

    setEmails(orderedEmails)
    saveEmailOrder(orderedEmails, previousEmails)
  }

  const handleEmailDragEnd = () => {
    setDraggingEmailId(null)
    setDragOverEmail(null)
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

  const fetchEmails = async (cursor?: string, groupId = selectedGroupId, replace = false) => {
    try {
      const url = new URL("/api/emails", window.location.origin)
      if (cursor) {
        url.searchParams.set('cursor', cursor)
      }
      if (!cursor) {
        url.searchParams.set('all', '1')
      }
      if (groupId) {
        url.searchParams.set('groupId', groupId)
      }
      const response = await fetch(url)
      const data = await response.json() as EmailResponse
      
      if (!cursor) {
        const newEmails = data.emails
        if (replace) {
          setEmails(newEmails)
          setNextCursor(data.nextCursor)
          setTotal(data.total)
          return
        }

        const oldEmails = emails

        const lastDuplicateIndex = newEmails.findIndex(
          newEmail => oldEmails.some(oldEmail => oldEmail.id === newEmail.id)
        )

        if (lastDuplicateIndex === -1) {
          setEmails(newEmails)
          setNextCursor(data.nextCursor)
          setTotal(data.total)
          return
        }
        const uniqueNewEmails = newEmails.slice(0, lastDuplicateIndex)
        setEmails([...uniqueNewEmails, ...oldEmails])
        setTotal(data.total)
        return
      }
      setEmails(prev => [...prev, ...data.emails])
      setNextCursor(data.nextCursor)
      setTotal(data.total)
    } catch (error) {
      console.error("Failed to fetch emails:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }

  const getSelectedGroupName = () => {
    if (selectedGroupId === null) return tGroups("all")
    if (selectedGroupId === "none") return tGroups("ungrouped")

    return groups.find(group => group.id === selectedGroupId)?.name || tGroups("all")
  }

  const sanitizeFileName = (value: string) => {
    const sanitized = value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-")
    return sanitized || "emails"
  }

  const formatExportAddedTime = (value: Date | string | number) => {
    const formattedTime = formatUtcPlus8DateTime(value)
    return formattedTime ? `${formattedTime} UTC+8` : ""
  }

  const escapeCsvValue = (value: string | number | null | undefined) => {
    const text = String(value ?? "")

    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`
    }

    return text
  }

  const downloadCsv = (filename: string, rows: string[][]) => {
    const csv = rows
      .map(row => row.map(escapeCsvValue).join(","))
      .join("\r\n")
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement("a")

    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  const exportSelectedGroupEmails = async () => {
    setExportingEmails(true)

    try {
      const url = new URL("/api/emails", window.location.origin)
      url.searchParams.set("all", "1")
      if (selectedGroupId) {
        url.searchParams.set("groupId", selectedGroupId)
      }

      const response = await fetch(url)
      const data = await response.json().catch(() => ({})) as Partial<EmailResponse> & { error?: string }

      if (!response.ok || !Array.isArray(data.emails)) {
        throw new Error(data.error || tGroups("exportFailed"))
      }

      const groupName = getSelectedGroupName()
      const hasCustomEmails = data.emails.some(email => email.isCustom)
      const rows = [
        hasCustomEmails
          ? [tGroups("exportHeaderContent"), tGroups("exportHeaderAddedAt")]
          : [tGroups("exportHeaderContent")],
        ...data.emails.map(email => (
          hasCustomEmails
            ? [email.address, email.isCustom ? formatExportAddedTime(email.createdAt) : ""]
            : [email.address]
        )),
      ]
      const timestamp = formatUtcPlus8DateTime(Date.now()).replace(/[: ]/g, "-")
      const filename = `${sanitizeFileName(groupName)}-${timestamp}.csv`

      downloadCsv(filename, rows)
      toast({
        title: tGroups("exportSuccess", { count: data.emails.length }),
      })
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : tGroups("exportFailed"),
        variant: "destructive",
      })
    } finally {
      setExportingEmails(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    onRefresh?.()
    await Promise.all([
      fetchGroups(),
      fetchEmails(undefined, selectedGroupId, true),
    ])
  }

  const resetGroupDialog = () => {
    setGroupName("")
  }

  const handleGroupDialogOpenChange = (open: boolean) => {
    setGroupDialogOpen(open)
    if (!open) {
      resetGroupDialog()
    }
  }

  const closeEditGroupDialog = () => {
    setEditingGroup(null)
    setEditGroupName("")
  }

  const handleEditGroupDialogOpenChange = (open: boolean) => {
    if (!open) {
      closeEditGroupDialog()
    }
  }

  const createGroup = async () => {
    const name = groupName.trim()
    if (!name) return

    setCreatingGroup(true)

    try {
      const response = await fetch("/api/email-groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      })
      const data = await response.json() as { group?: EmailGroup; error?: string }

      if (!response.ok || !data.group) {
        toast({
          title: data.error || tGroups("createFailed"),
          variant: "destructive",
        })
        return
      }

      setGroups(prev => [...prev, data.group!])
      handleGroupDialogOpenChange(false)
      toast({
        title: tGroups("createSuccess"),
      })
    } catch {
      toast({
        title: tGroups("createFailed"),
        variant: "destructive",
      })
    } finally {
      setCreatingGroup(false)
    }
  }

  const handleGroupSelect = (groupId: string | null, groupName?: string) => {
    if (groupId === selectedGroupId) return

    setSelectedGroupId(groupId)
    onGroupChange?.(groupId, groupName)
    onEmailSelect(null)
  }

  const openEditGroupDialog = (group: EmailGroup) => {
    setOpenMoreGroupId(null)
    setEditingGroup(group)
    setEditGroupName(group.name)
  }

  const updateGroup = async () => {
    if (!editingGroup) return

    const name = editGroupName.trim()
    if (!name) return

    setSavingGroup(true)

    try {
      const response = await fetch(`/api/email-groups/${editingGroup.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      })
      const data = await response.json() as { group?: EmailGroup; error?: string }

      if (!response.ok || !data.group) {
        toast({
          title: data.error || tGroups("renameFailed"),
          variant: "destructive",
        })
        return
      }

      setGroups(prev => prev.map(group => (
        group.id === data.group!.id
          ? { ...group, name: data.group!.name }
          : group
      )))
      if (selectedGroupId === data.group.id) {
        onGroupChange?.(data.group.id, data.group.name)
      }
      closeEditGroupDialog()
      toast({
        title: tGroups("renameSuccess"),
      })
    } catch {
      toast({
        title: tGroups("renameFailed"),
        variant: "destructive",
      })
    } finally {
      setSavingGroup(false)
    }
  }

  const deleteGroup = async (group: EmailGroup, deleteEmails: boolean) => {
    setDeletingGroup(true)

    try {
      const response = await fetch(`/api/email-groups/${group.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deleteEmails }),
      })
      const data = await response.json() as { error?: string }

      if (!response.ok) {
        toast({
          title: data.error || tFeedback("deleteFailed"),
          variant: "destructive",
        })
        return
      }

      setGroups(prev => prev.filter(item => item.id !== group.id))

      const selectedEmailWasInGroup = emails.some(email => (
        email.id === selectedEmailId && email.groupId === group.id
      ))
      const nextGroupId = selectedGroupId === group.id ? null : selectedGroupId

      if (deleteEmails) {
        setEmails(prev => prev.filter(email => email.groupId !== group.id))
      } else {
        setEmails(prev => prev.map(email => (
          email.groupId === group.id ? { ...email, groupId: null } : email
        )))
      }

      if (deleteEmails) {
        await fetchEmails(undefined, nextGroupId, true)
      }
      
      if (selectedGroupId === group.id) {
        setSelectedGroupId(null)
        onGroupChange?.(null)
        onEmailSelect(null)
      } else if (deleteEmails && selectedEmailWasInGroup) {
        onEmailSelect(null)
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
      setDeletingGroup(false)
      groupDeleteDialog.close()
    }
  }

  const handleDeleteGroupClick = (group: EmailGroup) => {
    setOpenMoreGroupId(null)

    if (group.emailCount === 0) {
      deleteGroup(group, false)
      return
    }

    groupDeleteDialog.openWithTarget(group)
  }

  const openShareDialog = (email: Email) => {
    setOpenMoreEmailId(null)
    window.setTimeout(() => {
      setEmailToShare(email)
    }, 0)
  }

  const openEditDialog = (email: Email) => {
    setOpenMoreEmailId(null)
    window.setTimeout(() => {
      setEmailToEdit(email)
    }, 0)
  }

  const handleEmailUpdated = (updatedEmail: Email) => {
    const previousEmail = emailToEdit
    const previousGroupId = previousEmail?.groupId ?? null
    const nextGroupId = updatedEmail.groupId ?? null
    const staysVisible = selectedGroupId === null
      || selectedGroupId === nextGroupId
      || (selectedGroupId === "none" && !nextGroupId)

    if (previousGroupId !== nextGroupId) {
      setGroups(prev => prev.map(group => {
        if (group.id === previousGroupId) {
          return { ...group, emailCount: Math.max(group.emailCount - 1, 0) }
        }

        if (group.id === nextGroupId) {
          return { ...group, emailCount: group.emailCount + 1 }
        }

        return group
      }))
    }

    setEmails(prev => {
      const updated = prev.map(item => (
        item.id === updatedEmail.id ? updatedEmail : item
      ))

      return staysVisible ? updated : updated.filter(item => item.id !== updatedEmail.id)
    })

    if (!staysVisible) {
      setTotal(prev => Math.max(prev - 1, 0))
      if (selectedEmailId === updatedEmail.id) {
        onEmailSelect(null)
      }
      return
    }

    if (selectedEmailId === updatedEmail.id) {
      onEmailSelect(updatedEmail)
    }
  }

  const moveEmailToGroup = async (email: Email, groupId: string | null) => {
    setMovingEmailId(email.id)

    try {
      const response = await fetch(`/api/emails/${email.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ groupId }),
      })
      const data = await response.json() as { email?: Email; error?: string }

      if (!response.ok) {
        toast({
          title: data.error || tGroups("moveFailed"),
          variant: "destructive",
        })
        return
      }

      const staysVisible = selectedGroupId === null
        || selectedGroupId === groupId
        || (selectedGroupId === "none" && !groupId)

      setGroups(prev => prev.map(group => {
        if (group.id === email.groupId) {
          return { ...group, emailCount: Math.max(group.emailCount - 1, 0) }
        }

        if (group.id === groupId) {
          return { ...group, emailCount: group.emailCount + 1 }
        }

        return group
      }))

      const updatedEmail = data.email ?? { ...email, groupId }

      setEmails(prev => {
        const updated = prev.map(item => (
          item.id === email.id ? updatedEmail : item
        ))

        return staysVisible ? updated : updated.filter(item => item.id !== email.id)
      })

      if (!staysVisible) {
        setTotal(prev => Math.max(prev - 1, 0))
        if (selectedEmailId === email.id) {
          onEmailSelect(null)
        }
      }

      toast({
        title: tGroups("moveSuccess"),
      })
    } catch {
      toast({
        title: tGroups("moveFailed"),
        variant: "destructive",
      })
    } finally {
      setMovingEmailId(null)
    }
  }

  const handleScroll = useThrottle((e: React.UIEvent<HTMLDivElement>) => {
    if (loadingMore) return

    const { scrollHeight, scrollTop, clientHeight } = e.currentTarget
    const threshold = clientHeight * 1.5
    const remainingScroll = scrollHeight - scrollTop

    if (remainingScroll <= threshold && nextCursor) {
      setLoadingMore(true)
      fetchEmails(nextCursor, selectedGroupId)
    }
  }, 200)

  useEffect(() => {
    if (session) fetchGroups()
  }, [session])

  useEffect(() => {
    if (!session) return

    setLoading(true)
    setNextCursor(null)
    setEmails([])
    fetchEmails(undefined, selectedGroupId, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, selectedGroupId])

  useEffect(() => {
    if (!session || !refreshTrigger) return
    setRefreshing(true)
    Promise.all([
      fetchGroups(),
      fetchEmails(undefined, selectedGroupId, true),
    ])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger])

  const handleDelete = async (email: Email) => {
    try {
      const response = await fetch(`/api/emails/${email.id}`, {
        method: "DELETE"
      })

      if (!response.ok) {
        const data = await response.json()
        toast({
          title: (data as { error?: string }).error || tFeedback("deleteFailed"),
          variant: "destructive"
        })
        return
      }

      setEmails(prev => prev.filter(e => e.id !== email.id))
      if (email.groupId) {
        setGroups(prev => prev.map(group => (
          group.id === email.groupId
            ? { ...group, emailCount: Math.max(group.emailCount - 1, 0) }
            : group
        )))
      }
      setTotal(prev => prev - 1)

      toast({
        title: tFeedback("deleteSuccess")
      })
      
      if (selectedEmailId === email.id) {
        onEmailSelect(null)
      }
    } catch {
      toast({
        title: tFeedback("deleteFailed"),
        variant: "destructive"
      })
    } finally {
      emailDeleteDialog.close()
    }
  }

  const canSortItems = groups.length >= 2 || emails.length >= 2

  if (!session) return null

  return (
    <>
      <div className="relative flex h-full min-h-0 flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              className={cn("h-8 w-8", refreshing && "animate-spin")}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Dialog open={groupDialogOpen} onOpenChange={handleGroupDialogOpenChange}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={tGroups("create")}
                >
                  <FolderPlus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                  <DialogTitle>{tGroups("createTitle")}</DialogTitle>
                </DialogHeader>
                <Input
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      createGroup()
                    }
                  }}
                  placeholder={tGroups("namePlaceholder")}
                  disabled={creatingGroup}
                />
                <DialogFooter>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => handleGroupDialogOpenChange(false)}
                    disabled={creatingGroup}
                  >
                    {tCommon("cancel")}
                  </Button>
                  <Button
                    type="button"
                    onClick={createGroup}
                    disabled={creatingGroup || !groupName.trim()}
                  >
                    {creatingGroup ? tGroups("creating") : tGroups("create")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleGroupSortMode}
              disabled={!canSortItems || savingGroupOrder || savingEmailOrder}
              className={cn(
                "h-8 w-8",
                groupSortMode && "bg-gray-200 hover:bg-gray-200"
              )}
              aria-label={groupSortMode ? tGroups("sortDone") : tGroups("sortMode")}
            >
              {groupSortMode ? (
                <Check className="h-4 w-4" />
              ) : (
                <GripVertical className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={exportSelectedGroupEmails}
              disabled={exportingEmails || loading || refreshing || total === 0}
              className="h-8 w-8"
              aria-label={tGroups("export")}
            >
              {exportingEmails ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
          </div>
          <span className="shrink-0 text-xs text-gray-500">
            {role === ROLES.EMPEROR || maxEmailsLimit === EMAIL_CONFIG.UNLIMITED_LIMIT ? (
              t("emailCountUnlimited", { count: total })
            ) : maxEmailsLimit === undefined ? (
              t("emailCount", { count: total, max: "..." })
            ) : (
              t("emailCount", { count: total, max: maxEmailsLimit })
            )}
          </span>
        </div>

        <div className="shrink-0 border-b border-gray-200 p-2" data-sort-region="true">
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={cn(
                  "flex h-8 min-w-0 items-center gap-2 rounded pl-3 pr-1 text-left text-sm transition-colors",
                  selectedGroupId === null ? "bg-gray-200" : "hover:bg-gray-100"
                )}
                onClick={() => handleGroupSelect(null)}
              >
                <FolderOpen className="h-4 w-4 shrink-0 text-primary/60" />
                <span className="min-w-0 flex-1 truncate">{tGroups("all")}</span>
              </button>
              <button
                type="button"
                className={cn(
                  "flex h-8 min-w-0 items-center gap-2 rounded pl-3 pr-1 text-left text-sm transition-colors",
                  selectedGroupId === "none" ? "bg-gray-200" : "hover:bg-gray-100"
                )}
                onClick={() => handleGroupSelect("none")}
              >
                <FolderOpen className="h-4 w-4 shrink-0 text-primary/60" />
                <span className="min-w-0 flex-1 truncate">{tGroups("ungrouped")}</span>
              </button>
            </div>

            {groups.length > 0 && (
              <div className="max-h-[104px] space-y-1 overflow-auto">
                {groups.map(group => (
                <div
                  key={group.id}
                  onDragOver={(event) => handleGroupDragOver(event, group.id)}
                  onDragLeave={(event) => {
                    const nextTarget = event.relatedTarget as Node | null
                    if (nextTarget && event.currentTarget.contains(nextTarget)) {
                      return
                    }

                    if (dragOverGroup?.groupId === group.id) {
                      setDragOverGroup(null)
                    }
                  }}
	                  onDrop={(event) => handleGroupDrop(event, group.id)}
	                  onClick={() => handleGroupSelect(group.id, group.name)}
	                  className={cn(
	                    "group relative flex h-8 w-full cursor-pointer items-center gap-1 rounded pl-3 pr-1 text-sm transition-colors",
	                    selectedGroupId === group.id ? "bg-gray-200" : "hover:bg-gray-100",
	                    draggingGroupId === group.id && "opacity-50"
	                  )}
                >
                  {dragOverGroup?.groupId === group.id && dragOverGroup.position === "before" && (
                    <div className="pointer-events-none absolute left-2 right-2 top-0 h-0.5 rounded-full bg-gray-500" />
                  )}
                  {dragOverGroup?.groupId === group.id && dragOverGroup.position === "after" && (
                    <div className="pointer-events-none absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gray-500" />
                  )}
                  {groupSortMode && (
                    <button
                      type="button"
                      draggable={!savingGroupOrder}
                      className={cn(
                        "flex h-6 w-4 shrink-0 cursor-grab items-center justify-center rounded text-gray-400 hover:bg-black/10 hover:text-gray-600 active:cursor-grabbing",
                        savingGroupOrder && "cursor-not-allowed opacity-50"
                      )}
                      aria-label={tGroups("sortHandle")}
                      onDragStart={(event) => handleGroupDragStart(event, group.id)}
                      onDragEnd={handleGroupDragEnd}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                  )}
	                  <button
	                    type="button"
	                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
	                  >
                    <Folder className="h-4 w-4 shrink-0 text-primary/60" />
                    <span className="min-w-0 flex-1 truncate">{group.name}</span>
                  </button>
                  {!groupSortMode && (
                    <div
                      className={cn(
                        "shrink-0 items-center justify-center self-center",
                        openMoreGroupId === group.id ? "flex" : "hidden group-hover:flex"
                      )}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <DropdownMenu
                        open={openMoreGroupId === group.id}
                        onOpenChange={(open) => setOpenMoreGroupId(open ? group.id : null)}
                      >
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-sm hover:bg-black/10"
                            aria-label={tGroups("more")}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-40">
                          <DropdownMenuItem onClick={() => openEditGroupDialog(group)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {tGroups("rename")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteGroupClick(group)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            {tGroups("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div
          className="min-h-0 flex-1 overflow-auto p-2"
          data-sort-region="true"
          onScroll={handleScroll}
        >
          {!loading && !refreshing && emails.length > 0 && (
            <div className="space-y-1">
              {emails.map(email => (
                <div
                  key={email.id}
                  className={cn(
                    "relative flex min-h-12 items-center gap-2 rounded py-2 pl-3 pr-2.5 text-sm group",
                    selectedEmailId === email.id
                      ? "bg-gray-200"
                      : "hover:bg-gray-100",
                    groupSortMode ? "cursor-default" : "cursor-pointer",
                    draggingEmailId === email.id && "opacity-50"
                  )}
                  onDragOver={(event) => handleEmailDragOver(event, email.id)}
                  onDragLeave={(event) => {
                    const nextTarget = event.relatedTarget as Node | null
                    if (nextTarget && event.currentTarget.contains(nextTarget)) {
                      return
                    }

                    if (dragOverEmail?.emailId === email.id) {
                      setDragOverEmail(null)
                    }
                  }}
                  onDrop={(event) => handleEmailDrop(event, email.id)}
                  onClick={() => onEmailSelect(email)}
                >
                  {dragOverEmail?.emailId === email.id && dragOverEmail.position === "before" && (
                    <div className="pointer-events-none absolute left-2 right-2 top-0 h-0.5 rounded-full bg-gray-500" />
                  )}
                  {dragOverEmail?.emailId === email.id && dragOverEmail.position === "after" && (
                    <div className="pointer-events-none absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gray-500" />
                  )}
                  {groupSortMode && (
                    <button
                      type="button"
                      draggable={!savingEmailOrder}
                      className={cn(
                        "flex h-8 w-4 shrink-0 cursor-grab items-center justify-center rounded text-gray-400 hover:bg-black/10 hover:text-gray-600 active:cursor-grabbing",
                        savingEmailOrder && "cursor-not-allowed opacity-50"
                      )}
                      aria-label={tGroups("sortHandle")}
                      onDragStart={(event) => handleEmailDragStart(event, email.id)}
                      onDragEnd={handleEmailDragEnd}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5 font-medium">
                      <span className="min-w-0 truncate">{email.address}</span>
                      {email.tag && (
                        <span className="flex h-[18px] max-w-24 shrink-0 items-center rounded border border-primary/20 bg-primary/10 px-1.5 text-[10px] font-medium leading-none text-primary">
                          <span className="min-w-0 truncate">{email.tag}</span>
                        </span>
                      )}
                    </div>
                    {!email.isCustom && (
                      <div className={cn(
                        "truncate text-xs",
                        new Date(email.expiresAt).getFullYear() === 9999
                          ? "text-gray-500"
                          : "text-destructive"
                      )}>
                        {new Date(email.expiresAt).getFullYear() === 9999 ? (
                          t("permanent")
                        ) : (
                          new Date(email.expiresAt).toLocaleString()
                        )}
                      </div>
                    )}
                    {email.isCustom && (
                      <div className="truncate text-xs text-gray-500">
                        {formatUtcPlus8Date(email.createdAt)}
                      </div>
                    )}
                  </div>
                  {!groupSortMode && (
                    <div
                      className={cn(
                        "shrink-0 items-center justify-center gap-1 self-center",
                        openMoreEmailId === email.id ? "flex" : "hidden group-hover:flex"
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-black/10"
                      aria-label={tCommon("copy")}
                      onClick={() => copyToClipboard(email.address)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <DropdownMenu
                      open={openMoreEmailId === email.id}
                      onOpenChange={(open) => setOpenMoreEmailId(open ? email.id : null)}
                    >
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-black/10"
                          aria-label={tGroups("more")}
                          disabled={movingEmailId === email.id}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-48">
                        <DropdownMenuItem onSelect={() => openEditDialog(email)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          {tEdit("menu")}
                        </DropdownMenuItem>
                        {!email.isCustom && (
                          <DropdownMenuItem onSelect={() => openShareDialog(email)}>
                            <Share2 className="mr-2 h-4 w-4" />
                            {tShare("shareButton")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            emailDeleteDialog.openWithTarget(email)
                            setOpenMoreEmailId(null)
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {tCommon("delete")}
                        </DropdownMenuItem>
                        <div className="my-1 h-px bg-border" />
                        <div
                          className="max-h-80 overflow-y-auto"
                          onWheel={(event) => event.stopPropagation()}
                          onTouchMove={(event) => event.stopPropagation()}
                        >
                          {email.groupId && (
                            <DropdownMenuItem className="h-8" onClick={() => moveEmailToGroup(email, null)}>
                              <Check className="mr-2 h-4 w-4 opacity-0" />
                              {tGroups("removeFromGroup")}
                            </DropdownMenuItem>
                          )}
                          {groups.map(group => (
                            <DropdownMenuItem
                              key={group.id}
                              className="h-8"
                              disabled={email.groupId === group.id}
                              onClick={() => moveEmailToGroup(email, group.id)}
                            >
                              <Check className={cn("mr-2 h-4 w-4", email.groupId === group.id ? "opacity-100" : "opacity-0")} />
                              <span className="truncate">{group.name}</span>
                            </DropdownMenuItem>
                          ))}
                          {groups.length === 0 && (
                            <div className="px-2 py-3 text-center text-xs text-gray-500">
                              {tGroups("noGroups")}
                            </div>
                          )}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    </div>
                  )}
                </div>
              ))}
              {loadingMore && (
                <div className="text-center text-sm text-gray-500 py-2">
                  {t("loadingMore")}
                </div>
              )}
            </div>
          )}
        </div>

        {(loading || refreshing) && (
          <div className={cn(EMPTY_STATE_CLASS, "text-sm text-gray-500")}>
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary/40" />
            <p>{t("loading")}</p>
          </div>
        )}

        {!loading && !refreshing && emails.length === 0 && (
          <div className={cn(EMPTY_STATE_CLASS, "text-muted-foreground")}>
            <AtSign className="mb-3 h-8 w-8 text-primary/40" />
            <p className="text-sm">{t("noEmails")}</p>
          </div>
        )}
      </div>

      <AlertDialog open={emailDeleteDialog.open} onOpenChange={emailDeleteDialog.handleOpenChange}>
        <AlertDialogContent className="sm:max-w-[400px]">
          <AlertDialogHeader className="min-w-0">
            <AlertDialogTitle>{t("deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription className="min-w-0 break-words [overflow-wrap:anywhere]">
              {t(emailToDelete?.isCustom ? "customDeleteDescription" : "deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap">
            <AlertDialogCancel className="shrink-0">{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="shrink-0 bg-destructive hover:bg-destructive/90"
              onClick={() => emailToDelete && handleDelete(emailToDelete)}
            >
              {tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {emailToShare && (
        <ShareDialog
          emailId={emailToShare.id}
          emailAddress={emailToShare.address}
          open={!!emailToShare}
          onOpenChange={(open) => {
            if (!open) {
              setEmailToShare(null)
            }
          }}
          trigger={null}
        />
      )}

      <EditDialog
        email={emailToEdit}
        groups={groups}
        open={!!emailToEdit}
        onOpenChange={(open) => {
          if (!open) {
            setEmailToEdit(null)
          }
        }}
        onEmailUpdated={handleEmailUpdated}
      />

      <Dialog open={!!editingGroup} onOpenChange={handleEditGroupDialogOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{tGroups("renameTitle")}</DialogTitle>
          </DialogHeader>
          <Input
            value={editGroupName}
            onChange={(event) => setEditGroupName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                updateGroup()
              }
            }}
            placeholder={tGroups("namePlaceholder")}
            disabled={savingGroup}
          />
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={closeEditGroupDialog}
              disabled={savingGroup}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              onClick={updateGroup}
              disabled={savingGroup || !editGroupName.trim()}
            >
              {savingGroup ? tGroups("saving") : tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={groupDeleteDialog.open} onOpenChange={groupDeleteDialog.handleOpenChange}>
        <AlertDialogContent className="sm:max-w-[400px]">
          <AlertDialogHeader className="min-w-0">
            <AlertDialogTitle>{tGroups("deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription className="min-w-0 break-words [overflow-wrap:anywhere]">
              {tGroups("deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap">
            <AlertDialogCancel className="shrink-0">{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="shrink-0"
              disabled={deletingGroup}
              onClick={() => groupToDelete && deleteGroup(groupToDelete, false)}
            >
              {tGroups("moveEmailsToUngrouped")}
            </AlertDialogAction>
            <AlertDialogAction
              className="shrink-0 bg-destructive hover:bg-destructive/90"
              disabled={deletingGroup}
              onClick={() => groupToDelete && deleteGroup(groupToDelete, true)}
            >
              {tGroups("deleteWithEmails")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

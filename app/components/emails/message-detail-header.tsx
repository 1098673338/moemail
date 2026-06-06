import type { ReactNode } from "react"

interface MessageDetailHeaderProps {
  subject: string
  fromLabel: string
  toLabel: string
  fromAddress?: string
  toAddress?: string
  action?: ReactNode
}

export function MessageDetailHeader({
  subject,
  fromLabel,
  toLabel,
  fromAddress,
  toAddress,
  action,
}: MessageDetailHeaderProps) {
  return (
    <div className="flex flex-col gap-0 border-b border-gray-200 p-4">
      <div className="flex min-h-7 items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-base font-bold leading-7">{subject}</h3>
        {action ? (
          <div className="flex size-7 shrink-0 items-center justify-center">
            {action}
          </div>
        ) : (
          <div aria-hidden="true" className="size-7 shrink-0" />
        )}
      </div>
      <div className="flex flex-col gap-[3px] text-xs leading-4 text-gray-500">
        <p>{fromLabel}: {fromAddress || "-"}</p>
        <p>{toLabel}: {toAddress || "-"}</p>
      </div>
    </div>
  )
}

import type { ReactNode } from "react"

interface MessageDetailHeaderProps {
  subject: string
  fromLabel: string
  toLabel: string
  timeLabel: string
  fromAddress?: string
  toAddress?: string
  timestamp?: number
  action?: ReactNode
}

export function MessageDetailHeader({
  subject,
  fromLabel,
  toLabel,
  timeLabel,
  fromAddress,
  toAddress,
  timestamp,
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
        {fromAddress && (
          <p>{fromLabel}: {fromAddress}</p>
        )}
        {toAddress && (
          <p>{toLabel}: {toAddress}</p>
        )}
        <p>{timeLabel}: {new Date(timestamp || 0).toLocaleString()}</p>
      </div>
    </div>
  )
}

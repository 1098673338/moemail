export interface ExpiryOption {
  label: string
  value: number
}

const DAY_MS = 1000 * 60 * 60 * 24

export const EXPIRY_OPTIONS: ExpiryOption[] = [
  { label: '1小时', value: 1000 * 60 * 60 },
  { label: '24小时', value: DAY_MS },
  { label: '3天', value: DAY_MS * 3 },
  { label: '15天', value: DAY_MS * 15 },
  { label: '30天', value: DAY_MS * 30 },
  { label: '永久', value: 0 }
]

export const SHARE_EXPIRY_OPTIONS: ExpiryOption[] = [
  { label: '1小时', value: 1000 * 60 * 60 },
  { label: '24小时', value: DAY_MS },
  { label: '3天', value: DAY_MS * 3 },
  { label: '永久', value: 0 }
]

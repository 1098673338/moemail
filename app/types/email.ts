export interface ExpiryOption {
  label: string
  value: number
}

const DAY_MS = 1000 * 60 * 60 * 24

export const EXPIRY_OPTIONS: ExpiryOption[] = [
  { label: '24小时', value: DAY_MS },
  { label: '30天', value: DAY_MS * 30 },
  { label: '永久', value: 0 }
]

export const SHARE_EXPIRY_OPTIONS: ExpiryOption[] = [
  { label: '24小时', value: DAY_MS },
  { label: '30天', value: DAY_MS * 30 },
  { label: '永久', value: 0 }
]

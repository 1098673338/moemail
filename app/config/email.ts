export const EMAIL_CONFIG = {
  MAX_ACTIVE_EMAILS: 30, // Maximum number of active emails
  MAX_CONFIGURABLE_LIMIT: 9999,
  UNLIMITED_LIMIT: 9999,
  POLL_INTERVAL: 2_000, // Polling interval in milliseconds
  DEFAULT_DAILY_SEND_LIMITS: {
    emperor: 0,   // 皇帝无限制
    duke: -1,     // 公爵禁止发件
    knight: -1,   // 骑士禁止发件
    civilian: -1, // 平民禁止发件
  },
} as const

export type EmailConfig = typeof EMAIL_CONFIG 

import { z } from "zod"
import { EMAIL_CONFIG } from "@/config"

export const normalizeConfigurableLimitInput = (value: string) => {
  const digits = value.replace(/\D/g, "")
  const normalizedDigits = digits.replace(/^0+(?=\d)/, "")

  if (!normalizedDigits) return ""
  if (normalizedDigits.length > 4) {
    return EMAIL_CONFIG.MAX_CONFIGURABLE_LIMIT.toString()
  }

  const numericValue = Number(normalizedDigits)
  return Math.min(numericValue, EMAIL_CONFIG.MAX_CONFIGURABLE_LIMIT).toString()
}

export const authSchema = z.object({
  username: z.string()
    .min(1, "用户名不能为空")
    .max(20, "用户名不能超过20个字符")
    .regex(/^[a-zA-Z0-9_-]+$/, "用户名只能包含字母、数字、下划线和横杠")
    .refine(val => !val.includes('@'), "用户名不能是邮箱格式"),
  password: z.string()
    .min(8, "密码长度必须大于等于8位"),
  turnstileToken: z.string().optional()
})

export type AuthSchema = z.infer<typeof authSchema>

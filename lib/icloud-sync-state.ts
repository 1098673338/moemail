import type { ICloudAccountDto } from "./types";

export function icloudSyncIssue(message: string | null) {
  if (/无法.*解密|当前同步密钥解密/.test(message || "")) return "credential";
  if (/EXTERNAL_MAIL_SECRET/.test(message || "")) return "configuration";
  if (/authentication\s*failed|LOGIN failed|invalid credentials|用户名或 App 专用密码无效/i.test(message || "")) return "authentication";
  return "temporary";
}

export function canSyncIcloudAccount(account: Pick<ICloudAccountDto, "status" | "syncError">, manual = false) {
  if (account.status === "disabled") return false;
  return manual || account.status === "active" || icloudSyncIssue(account.syncError) === "temporary";
}

export function icloudRetryDelay(failures: number) {
  return Math.min(30_000 * 2 ** Math.min(Math.max(failures - 1, 0), 4), 5 * 60_000);
}

export function icloudSyncErrorMessage(message: string) {
  const issue = icloudSyncIssue(message);
  if (issue === "credential") return "已保存的邮箱密码无法解密。请检查部署密钥是否与更新前一致，恢复后可重试连接。";
  if (issue === "configuration") return "邮箱加密密钥配置异常，请检查部署中的 EXTERNAL_MAIL_SECRET。";
  if (issue === "authentication") return "iCloud 未通过身份验证。请先重试连接；若持续失败，再检查 App 专用密码。";
  return `${message}；稍后会自动重试，也可重试连接。`;
}

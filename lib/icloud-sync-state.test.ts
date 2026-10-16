import assert from "node:assert/strict";
import test from "node:test";
import { canSyncIcloudAccount, icloudRetryDelay, icloudSyncErrorMessage, icloudSyncIssue } from "./icloud-sync-state";

test("temporary sync errors can recover automatically or manually", () => {
  for (const syncError of ["iCloud IMAP 服务器响应超时，请稍后重试", "ECONNRESET", "iCloud IMAP 服务器提前关闭了连接", null]) {
    assert.equal(canSyncIcloudAccount({ status: "sync_error", syncError }), true);
    assert.equal(canSyncIcloudAccount({ status: "sync_error", syncError }, true), true);
  }
});

test("credential and authentication failures pause background attempts but allow manual retry", () => {
  for (const syncError of ["已保存的 App 专用密码无法使用当前同步密钥解密。", "请先配置至少 32 个字符的 EXTERNAL_MAIL_SECRET Secret", "iCloud 用户名或 App 专用密码无效", "AUTHENTICATIONFAILED"]) {
    assert.equal(canSyncIcloudAccount({ status: "sync_error", syncError }), false);
    assert.equal(canSyncIcloudAccount({ status: "sync_error", syncError }, true), true);
  }
});

test("disabled accounts cannot be synced by either path", () => {
  assert.equal(canSyncIcloudAccount({ status: "disabled", syncError: null }), false);
  assert.equal(canSyncIcloudAccount({ status: "disabled", syncError: null }, true), false);
});

test("mentioning an App password does not itself mean authentication failed", () => {
  assert.equal(icloudSyncIssue("App 专用密码验证请求超时"), "temporary");
});

test("background retries back off from 30 seconds to a five minute cap", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 99].map(icloudRetryDelay), [30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
});

test("old saved decryption errors no longer instruct users to change their password", () => {
  const message = icloudSyncErrorMessage("已保存的 App 专用密码无法使用当前同步密钥解密。请在账号设置中更新 App 专用密码后重试。");
  assert.match(message, /部署密钥/);
  assert.doesNotMatch(message, /更新.*密码/);
});

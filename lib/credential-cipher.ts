import crypto from "node:crypto";

export class StoredIcloudCredentialError extends Error {
  constructor() {
    super("已保存的 App 专用密码无法使用当前同步密钥解密。请检查部署前后的 EXTERNAL_MAIL_SECRET 是否一致；恢复原密钥后可重试连接。");
    this.name = "StoredIcloudCredentialError";
  }
}

function getKey(secret: string | undefined) {
  if (!secret || secret.length < 32) {
    throw new Error("请先配置至少 32 个字符的 EXTERNAL_MAIL_SECRET Secret");
  }
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

function encode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

export function encryptWithSecret(value: string, secret: string | undefined) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", encode(iv), encode(tag), encode(encrypted)].join(":");
}

export function decryptWithSecret(value: string, secret: string | undefined) {
  // Configuration errors must not be reported as a bad saved password.
  const key = getKey(secret);
  try {
    const [version, ivEncoded, tagEncoded, encryptedEncoded] = value.split(":");
    if (version !== "v1" || !ivEncoded || !tagEncoded || !encryptedEncoded) {
      throw new StoredIcloudCredentialError();
    }
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, decode(ivEncoded));
    decipher.setAuthTag(decode(tagEncoded));
    return Buffer.concat([
      decipher.update(decode(encryptedEncoded)),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof StoredIcloudCredentialError) throw error;
    throw new StoredIcloudCredentialError();
  }
}

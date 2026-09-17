import crypto from "node:crypto";
import { getEnv } from "@/lib/env";

function getKey() {
  const secret = getEnv().EXTERNAL_MAIL_SECRET;
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

export function encryptCredential(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", encode(iv), encode(tag), encode(encrypted)].join(":");
}

export function decryptCredential(value: string) {
  const [version, ivEncoded, tagEncoded, encryptedEncoded] = value.split(":");
  if (version !== "v1" || !ivEncoded || !tagEncoded || !encryptedEncoded) {
    throw new Error("凭据格式无效，请重新连接账号");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), decode(ivEncoded));
  decipher.setAuthTag(decode(tagEncoded));
  return Buffer.concat([
    decipher.update(decode(encryptedEncoded)),
    decipher.final(),
  ]).toString("utf8");
}

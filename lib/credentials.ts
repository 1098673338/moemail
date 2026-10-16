import { getEnv } from "@/lib/env";
import { decryptWithSecret, encryptWithSecret } from "@/lib/credential-cipher";

export function encryptCredential(value: string) {
  return encryptWithSecret(value, getEnv().EXTERNAL_MAIL_SECRET);
}

export function decryptCredential(value: string) {
  return decryptWithSecret(value, getEnv().EXTERNAL_MAIL_SECRET);
}

import { decryptWithSecret, encryptWithSecret } from "../../lib/credential-cipher";

export function verifyDeploymentCredentialKey(secret: string | undefined, query: (sql: string) => Record<string, unknown>[]) {
  // Validate the configuration even on the first deployment with an empty DB.
  encryptWithSecret("deployment-key-check", secret);
  const tables = query("SELECT name FROM sqlite_master WHERE type='table' AND name='mail_account'");
  if (!tables.length) return;
  const accounts = query("SELECT encrypted_password FROM mail_account");
  for (const account of accounts) {
    try {
      if (typeof account.encrypted_password !== "string") throw new Error("Invalid credential");
      decryptWithSecret(account.encrypted_password, secret);
    } catch {
      // Never expose ciphertext, plaintext, or raw command output in CI logs.
      throw new Error("EXTERNAL_MAIL_SECRET cannot decrypt existing iCloud credentials. Deployment stopped before changing Worker secrets or D1 data. Restore the original EXTERNAL_MAIL_SECRET in GitHub Secrets; do not generate a new key for a version update.");
    }
  }
}

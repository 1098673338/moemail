import { getCloudflareContext } from "@opennextjs/cloudflare";

export type RuntimeEnv = {
  DB: D1Database;
  SITE_CONFIG: KVNamespace;
  CREDENTIAL_ENCRYPTION_KEY: string;
  ICLOUD_BRIDGE_TOKEN?: string;
};

export function getEnv(): RuntimeEnv {
  return getCloudflareContext().env as unknown as RuntimeEnv;
}

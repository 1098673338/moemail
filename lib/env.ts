import { getCloudflareContext } from "@opennextjs/cloudflare";

export type RuntimeEnv = {
  DB: D1Database;
  EXTERNAL_MAIL_SECRET: string;
};

export function getEnv(): RuntimeEnv {
  return getCloudflareContext().env as unknown as RuntimeEnv;
}

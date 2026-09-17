import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const required = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "DATABASE_NAME", "DATABASE_ID", "KV_NAMESPACE_ID", "EXTERNAL_MAIL_SECRET"] as const;
const failPreflight = (title: string, message: string): never => {
  // Render the actual cause in GitHub Actions' annotations, rather than only
  // the generic exit-code annotation that GitHub emits for a failed shell step.
  console.error(`::error title=${title}::${message}`);
  throw new Error(message);
};
for (const key of required) if (!process.env[key]) failPreflight("Missing GitHub Secret", `Required GitHub Secret ${key} is empty or unavailable.`);

// Main Workers service name. "moemail" is the project's original service name;
// allow a repository secret to override it without making that secret mandatory.
const mainWorkerName = process.env.WORKER_NAME?.trim() || "moemail";

// These are the legacy Worker service names already targeted by Email Routing
// and the existing cleanup cron. They must be deployed in place, never renamed
// from the new main application's Worker name. Deployments may override them
// when a pre-existing account used different names.
const emailReceiverWorkerName = process.env.EMAIL_RECEIVER_WORKER_NAME?.trim() || "email-receiver-worker";
const cleanupWorkerName = process.env.CLEANUP_WORKER_NAME?.trim() || "cleanup-worker";

const replace = (file: string, target: string, name: string) => {
  const contents = readFileSync(file, "utf8")
    .replace(/"name": "[^"\n]+"/, `"name": "${name}"`)
    .replace(/"database_name": "[^"\n]+"/, `"database_name": "${process.env.DATABASE_NAME}"`)
    .replace(/"database_id": "[^"\n]+"/, `"database_id": "${process.env.DATABASE_ID}"`)
    .replace(/"id": "[^"\n]+"/, (value) => value.includes("database_id") ? value : `"id": "${process.env.KV_NAMESPACE_ID}"`);
  writeFileSync(target, contents);
};
const run = (label: string, command: string, args: string[]) => {
  try {
    execFileSync(command, args, { stdio: "inherit", env: process.env });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? String(error.status ?? "unknown") : "unknown";
    failPreflight("Deployment command failed", `${label} failed (exit ${status}). Open the ${label} output in the Run deploy script step for Cloudflare's detailed error.`);
  }
};

async function requireExistingWorker(name: string) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/services/${name}`, {
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
  });
  if (!response.ok) {
    failPreflight(
      "Cloudflare Worker preflight failed",
      `Required existing Worker ${name} was not found or cannot be read (HTTP ${response.status}). Check its name and that CLOUDFLARE_API_TOKEN has Workers Scripts:Read permission.`,
    );
  }
}

// The main application Worker is the approved replacement for Pages and may be
// created by its first deployment. The two routing/cleanup Workers must already
// exist so that deployment can never silently change Email Routing targets.
await requireExistingWorker(emailReceiverWorkerName);
await requireExistingWorker(cleanupWorkerName);

mkdirSync("artifacts/d1-backup", { recursive: true });
replace("wrangler.jsonc", "wrangler.release.jsonc", mainWorkerName);
replace("wrangler.email.example.json", "wrangler.email.release.json", emailReceiverWorkerName);
replace("wrangler.cleanup.example.json", "wrangler.cleanup.release.json", cleanupWorkerName);

const config = "wrangler.release.jsonc";
run("D1 backup export", "pnpm", ["exec", "wrangler", "d1", "export", process.env.DATABASE_NAME!, "--remote", "--output", resolve("artifacts/d1-backup", `${process.env.DATABASE_NAME}-before-migration.sql`), "--config", config]);
run("D1 migrations", "pnpm", ["exec", "wrangler", "d1", "migrations", "apply", process.env.DATABASE_NAME!, "--remote", "--config", config]);
run("Workers build", "pnpm", ["run", "build:worker"]);
const secretFile = ".release-secrets.json";
writeFileSync(secretFile, JSON.stringify({ EXTERNAL_MAIL_SECRET: process.env.EXTERNAL_MAIL_SECRET }));
run("Main Worker secret update", "pnpm", ["exec", "wrangler", "secret", "bulk", secretFile, "--config", config]);
unlinkSync(secretFile);
// OpenNext has already emitted .open-next/worker.js. Deploy it with Wrangler so
// existing dashboard variables and bindings that are outside this repository are
// retained when the Pages application is replaced by the Worker.
run("Main Worker deployment", "pnpm", ["exec", "wrangler", "deploy", "--config", config, "--keep-vars"]);
run("Email receiver Worker deployment", "pnpm", ["exec", "wrangler", "deploy", "--config", "wrangler.email.release.json"]);
run("Cleanup Worker deployment", "pnpm", ["exec", "wrangler", "deploy", "--config", "wrangler.cleanup.release.json"]);

for (const generated of ["wrangler.release.jsonc", "wrangler.email.release.json", "wrangler.cleanup.release.json"]) {
  if (existsSync(generated)) writeFileSync(generated, "");
}

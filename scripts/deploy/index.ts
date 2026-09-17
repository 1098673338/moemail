import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const required = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "DATABASE_NAME", "DATABASE_ID", "EXTERNAL_MAIL_SECRET"] as const;
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

const replace = (file: string, target: string, name: string) => {
  const contents = readFileSync(file, "utf8")
    .replace(/"name": "[^"\n]+"/, `"name": "${name}"`)
    .replace(/"database_name": "[^"\n]+"/, `"database_name": "${process.env.DATABASE_NAME}"`)
    .replace(/"database_id": "[^"\n]+"/, `"database_id": "${process.env.DATABASE_ID}"`);
  writeFileSync(target, contents);
};
const run = (label: string, command: string, args: string[]) => {
  try {
    // Capture build output so a Linux-only bundling failure is visible as an
    // Actions annotation. Other commands retain streaming output and never
    // risk printing the temporary secret payload.
    if (label === "Workers build") {
      const output = execFileSync(command, args, { encoding: "utf8", env: process.env, maxBuffer: 10 * 1024 * 1024 });
      process.stdout.write(output);
    } else {
      execFileSync(command, args, { stdio: "inherit", env: process.env });
    }
  } catch (error) {
    const processError = error as { status?: number | null; stdout?: Buffer | string; stderr?: Buffer | string };
    const status = String(processError.status ?? "unknown");
    const output = [processError.stdout, processError.stderr]
      .filter((value): value is Buffer | string => Boolean(value))
      .map((value) => value.toString())
      .join("\n")
      .slice(-1_500)
      .replace(/[%\r\n]/g, " ");
    failPreflight("Deployment command failed", `${label} failed (exit ${status}).${output ? ` Build output: ${output}` : ` Open the ${label} output in the Run deploy script step for Cloudflare's detailed error.`}`);
  }
};

mkdirSync("artifacts/d1-backup", { recursive: true });
replace("wrangler.jsonc", "wrangler.release.jsonc", mainWorkerName);

const config = "wrangler.release.jsonc";
// Build before making any remote D1 change. A bad Linux/Workers bundle must
// never leave the production database migrated without a matching deployment.
run("Workers build", "pnpm", ["run", "build:worker"]);
run("D1 backup export", "pnpm", ["exec", "wrangler", "d1", "export", process.env.DATABASE_NAME!, "--remote", "--skip-confirmation", "--output", resolve("artifacts/d1-backup", `${process.env.DATABASE_NAME}-before-migration.sql`), "--config", config]);
run("D1 migrations", "pnpm", ["exec", "wrangler", "d1", "migrations", "apply", process.env.DATABASE_NAME!, "--remote", "--config", config]);
const secretFile = ".release-secrets.json";
writeFileSync(secretFile, JSON.stringify({ EXTERNAL_MAIL_SECRET: process.env.EXTERNAL_MAIL_SECRET }));
run("Main Worker secret update", "pnpm", ["exec", "wrangler", "secret", "bulk", secretFile, "--config", config]);
unlinkSync(secretFile);
// OpenNext has already emitted .open-next/worker.js. Deploy it with Wrangler so
// existing dashboard variables and bindings that are outside this repository are
// retained when the Pages application is replaced by the Worker.
run("Main Worker deployment", "pnpm", ["exec", "wrangler", "deploy", "--config", config, "--keep-vars"]);

for (const generated of ["wrangler.release.jsonc"]) {
  if (existsSync(generated)) writeFileSync(generated, "");
}

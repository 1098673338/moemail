import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { encryptWithSecret } from "../../lib/credential-cipher";
import { verifyDeploymentCredentialKey } from "./credential-preflight";

const secret = "original-deployment-secret-32-characters";
const stored = encryptWithSecret("unchanged-app-password", secret);
const query = (sql: string) => sql.includes("sqlite_master") ? [{ name: "mail_account" }] : [{ encrypted_password: stored }];

test("a normal update accepts the original credential key", () => {
  assert.doesNotThrow(() => verifyDeploymentCredentialKey(secret, query));
});

test("a mismatched release key blocks deployment without exposing credentials", () => {
  assert.throws(() => verifyDeploymentCredentialKey("wrong-release-secret-32-characters", query), (error) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Deployment stopped/);
    assert.ok(!error.message.includes(stored));
    assert.ok(!error.message.includes("unchanged-app-password"));
    return true;
  });
});

test("all saved accounts are checked, including disabled accounts", () => {
  const other = encryptWithSecret("other-password", "a-different-old-secret-32-characters");
  assert.throws(() => verifyDeploymentCredentialKey(secret, (sql) => sql.includes("sqlite_master") ? [{ name: "mail_account" }] : [{ encrypted_password: stored }, { encrypted_password: other }]), /cannot decrypt/);
});

test("first deployment and a DB with no accounts allow a valid key", () => {
  assert.doesNotThrow(() => verifyDeploymentCredentialKey(secret, () => []));
  assert.doesNotThrow(() => verifyDeploymentCredentialKey(secret, (sql) => sql.includes("sqlite_master") ? [{ name: "mail_account" }] : []));
  assert.throws(() => verifyDeploymentCredentialKey("short", () => []), /EXTERNAL_MAIL_SECRET/);
});

test("a D1 read failure blocks verification", () => {
  assert.throws(() => verifyDeploymentCredentialKey(secret, () => { throw new Error("D1 unavailable"); }), /D1 unavailable/);
});

test("the release script stops on a wrong key before build, migrations, or secret upload", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "moemail-release-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const trace = join(directory, "commands.jsonl");
  writeFileSync(join(directory, "wrangler.jsonc"), readFileSync(new URL("../../wrangler.jsonc", import.meta.url)));
  // A fake pnpm records commands and returns only synthetic D1 credentials.
  writeFileSync(join(directory, "pnpm"), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DEPLOY_TEST_TRACE, JSON.stringify(args) + '\\n');
if (!args.includes('execute')) process.exit(99);
console.log(JSON.stringify([{success:true,results:args.some(arg => arg.includes('sqlite_master')) ? [{name:'mail_account'}] : [{encrypted_password:${JSON.stringify(stored)}}]}]));
`, { mode: 0o700 });
  const result = spawnSync(resolve("node_modules/.bin/tsx"), [resolve("scripts/deploy/index.ts")], {
    cwd: directory,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${directory}${delimiter}${process.env.PATH}`,
      DEPLOY_TEST_TRACE: trace,
      CLOUDFLARE_API_TOKEN: "synthetic-test-token",
      CLOUDFLARE_ACCOUNT_ID: "synthetic-account",
      DATABASE_NAME: "test-db",
      DATABASE_ID: "synthetic-database-id",
      EXTERNAL_MAIL_SECRET: "wrong-release-secret-32-characters",
      DASHBOARD_LOGIN_SECRET: "synthetic-login-secret-32-characters",
    },
  });
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Deployment stopped/);
  assert.doesNotMatch(result.stderr + result.stdout, new RegExp(stored));
  const commands = readFileSync(trace, "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[]);
  assert.equal(commands.length, 2);
  assert.ok(commands.every((args) => args.slice(0, 4).join(" ") === "exec wrangler d1 execute"));
});

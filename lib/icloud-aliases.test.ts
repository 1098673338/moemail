import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { syncIcloudAliasSnapshot, syncIcloudAccount, type IcloudAliasSnapshotItem } from "./icloud";
import { createAddress, deleteIcloudMailAliasAfterAppleDeletion, ingestMessage, listAddresses, listMessages, updateAddress } from "./mail-store";
import { icloudAliasSnapshotSchema } from "./validation";
import { encryptWithSecret } from "./credential-cipher";
import { IcloudImapClient } from "./icloud-imap";

const migration = await readFile(new URL("../drizzle/0029_merge-icloud-temporary-message.sql", import.meta.url), "utf8");
const alias = (address = "alternate@icloud.com", status: "active" | "disabled" = "active"): IcloudAliasSnapshotItem => ({ address, providerId: `mail-alias:123:${address}`, status });
const hidden: IcloudAliasSnapshotItem = { address: "hidden@icloud.com", providerId: "hme-1", status: "active" };

async function setup(t: TestContext) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE email (id TEXT PRIMARY KEY);");
  for (const match of migration.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? `(mail_account|mail_address|icloud_mailbox_state|message|message_recipient|address_event)` \([\s\S]*?\n\);/g)) db.exec(match[0]);
  db.exec("CREATE UNIQUE INDEX recipient_unique ON message_recipient(message_id,address_id);");
  const prepare = (sql: string) => ({
    bind(...params: (string | number | null)[]) {
      const statement = db.prepare(sql);
      return {
        first: async () => statement.get(...params) || null,
        all: async () => ({ results: statement.all(...params) }),
        run: async () => ({ meta: statement.run(...params) }),
      };
    },
  });
  const contextSymbol = Symbol.for("__cloudflare-context__");
  const previous = Reflect.get(globalThis, contextSymbol);
  const secret = "test-only-aliases-deployment-secret-32-characters";
  Reflect.set(globalThis, contextSymbol, { env: {
    EXTERNAL_MAIL_SECRET: secret,
    DB: {
      prepare,
      async batch(statements: ReturnType<ReturnType<typeof prepare>["bind"]>[]) {
        db.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
          db.exec("COMMIT");
          return results;
        } catch (error) { db.exec("ROLLBACK"); throw error; }
      },
    },
  } });
  t.after(() => {
    if (previous === undefined) Reflect.deleteProperty(globalThis, contextSymbol);
    else Reflect.set(globalThis, contextSymbol, previous);
    db.close();
  });
  db.prepare("INSERT INTO mail_account (id,email_address,username,encrypted_password,created_at,updated_at) VALUES (?,?,?,?,1,1)")
    .run("account-1", "primary@icloud.com", "primary@icloud.com", encryptWithSecret("test-app-password", secret));
  db.exec("INSERT INTO icloud_mailbox_state(account_id,mailbox_path,last_uid,created_at,updated_at) VALUES ('account-1','INBOX',500,1,1)");
  const primary = await createAddress({ address: "primary@icloud.com", type: "icloud_primary", accountId: "account-1" });
  return { db, primary };
}

test("ordinary aliases sync alongside hidden addresses, become visible, and trigger historical mail import once", async (t) => {
  const { db } = await setup(t);
  const result = await syncIcloudAliasSnapshot("account-1", [hidden], true, "active", [alias()]);
  assert.equal(result.activeCount, 2);
  assert.equal((await listAddresses()).find(item => item.address === alias().address)?.type, "icloud_alias");
  assert.equal(db.prepare("SELECT last_uid FROM icloud_mailbox_state").get()?.last_uid, 0);
  db.exec("UPDATE icloud_mailbox_state SET last_uid=600");
  await syncIcloudAliasSnapshot("account-1", [hidden], true, "active", [alias()]);
  assert.equal(db.prepare("SELECT last_uid FROM icloud_mailbox_state").get()?.last_uid, 600);
});

test("legacy hidden-address snapshots preserve mail aliases, but a complete empty mail snapshot removes them", async (t) => {
  await setup(t);
  await syncIcloudAliasSnapshot("account-1", [hidden], true, "active", [alias()]);
  await syncIcloudAliasSnapshot("account-1", [], true, "active");
  assert.deepEqual((await listAddresses()).map(item => item.address).sort(), ["alternate@icloud.com", "primary@icloud.com"]);
  await syncIcloudAliasSnapshot("account-1", [], true, "active", []);
  assert.deepEqual((await listAddresses()).map(item => item.address), ["primary@icloud.com"]);
});

test("disabled mail aliases remain disabled and do not trigger mail import", async (t) => {
  const { db } = await setup(t);
  const result = await syncIcloudAliasSnapshot("account-1", [], true, "active", [alias(undefined, "disabled")]);
  assert.equal(result.activeCount, 0);
  assert.equal(result.inactiveCount, 1);
  assert.equal((await listAddresses()).find(item => item.type === "icloud_alias")?.status, "disabled");
  assert.equal(db.prepare("SELECT last_uid FROM icloud_mailbox_state").get()?.last_uid, 500);
});

test("invalid snapshots are rejected before valid entries can change local data", async (t) => {
  await setup(t);
  await assert.rejects(syncIcloudAliasSnapshot("account-1", [hidden], true, "active", [alias("primary@icloud.com")]), /不是受支持/);
  assert.equal((await listAddresses()).length, 1);
  const shared = alias();
  await assert.rejects(syncIcloudAliasSnapshot("account-1", [], true, "active", [shared, shared]), /重复/);
  assert.equal((await listAddresses()).length, 1);
});

test("alias deletion removes legacy-domain variants but preserves primary, hidden addresses, shared mail, and other accounts", async (t) => {
  const { db, primary } = await setup(t);
  await syncIcloudAliasSnapshot("account-1", [hidden], true, "active", [alias(), alias("alternate@me.com")]);
  const ordinary = (await listAddresses()).find(item => item.address === "alternate@icloud.com")!;
  db.exec("INSERT INTO mail_account(id,email_address,username,encrypted_password,created_at,updated_at) VALUES ('account-2','other@icloud.com','other@icloud.com','unused',1,1)");
  await createAddress({ address: "alternate@mac.com", type: "icloud_alias", accountId: "account-2" });
  const mail = { source: "icloud" as const, accountId: "account-1", senderAddress: "sender@example.com", subject: "Hello", textBody: "Hello", receivedAt: new Date() };
  await ingestMessage({ ...mail, providerUid: 1, recipients: [ordinary.address] });
  await ingestMessage({ ...mail, providerUid: 2, recipients: [ordinary.address, primary.address] });
  const result = await deleteIcloudMailAliasAfterAppleDeletion(ordinary.id);
  assert.equal(result.removedAddresses, 2);
  assert.equal(result.removedMessages, 1);
  assert.deepEqual((await listAddresses()).map(item => item.address).sort(), ["alternate@mac.com", "hidden@icloud.com", "primary@icloud.com"]);
  assert.equal((await listMessages(primary.id)).length, 1);
  assert.equal(db.prepare("SELECT aliases_active_count FROM mail_account WHERE id='account-1'").get()?.aliases_active_count, 1);
});

test("mail-alias deletion refuses a primary or hidden address and PATCH cannot bypass Apple deletion", async (t) => {
  const { primary } = await setup(t);
  await syncIcloudAliasSnapshot("account-1", [hidden], true, "active", [alias()]);
  const addresses = await listAddresses();
  const hiddenAddress = addresses.find(item => item.type === "icloud_hide")!;
  const ordinary = addresses.find(item => item.type === "icloud_alias")!;
  await assert.rejects(deleteIcloudMailAliasAfterAppleDeletion(primary.id), /只有 iCloud 邮箱别名/);
  await assert.rejects(deleteIcloudMailAliasAfterAppleDeletion(hiddenAddress.id), /只有 iCloud 邮箱别名/);
  await assert.rejects(updateAddress(ordinary.id, { status: "deleted" }), /先从 Apple/);
  assert.equal((await listAddresses()).length, 3);
});

test("IMAP imports historical mail sent to the newly synced ordinary alias", async (t) => {
  await setup(t);
  await syncIcloudAliasSnapshot("account-1", [], true, "active", [alias()]);
  t.mock.method(IcloudImapClient.prototype, "connect", async () => {});
  t.mock.method(IcloudImapClient.prototype, "examineInbox", async () => ({ uidValidity: "123", uidNext: 2 }));
  t.mock.method(IcloudImapClient.prototype, "searchUids", async () => [1]);
  t.mock.method(IcloudImapClient.prototype, "fetchMessages", async () => [{ uid: 1, source: "From: sender@example.com\r\nTo: alternate@icloud.com\r\nSubject: Confirmation code\r\nMessage-ID: <alias-test@example.com>\r\n\r\nConfirmation code: 891885", internalDate: new Date() }]);
  t.mock.method(IcloudImapClient.prototype, "logout", async () => {});
  assert.equal((await syncIcloudAccount("account-1")).imported, 1);
  const ordinary = (await listAddresses()).find(item => item.type === "icloud_alias")!;
  assert.equal((await listMessages(ordinary.id))[0].subject, "Confirmation code");
});

test("snapshot validation accepts ordinary aliases and rejects duplicated cross-type addresses", () => {
  assert.equal(icloudAliasSnapshotSchema.safeParse({ authoritative: true, scope: "active", aliases: [hidden], mailAliases: [alias()] }).success, true);
  assert.equal(icloudAliasSnapshotSchema.safeParse({ authoritative: true, scope: "active", aliases: [hidden], mailAliases: [alias(hidden.address)] }).success, false);
});

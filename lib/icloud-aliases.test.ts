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
  const calls = { reads: 0, writes: 0, batches: 0, maxBatchSize: 0 };
  const prepare = (sql: string) => ({
    bind(...params: (string | number | null)[]) {
      const statement = db.prepare(sql);
      return {
        first: async () => { calls.reads++; return statement.get(...params) || null; },
        all: async () => { calls.reads++; return { results: statement.all(...params) }; },
        run: async () => { calls.writes++; return { meta: statement.run(...params) }; },
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
        calls.batches++;
        calls.maxBatchSize = Math.max(calls.maxBatchSize, statements.length);
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
  return { db, primary, calls };
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

test("mail sync fetches and saves one message at a time instead of buffering the whole batch", async (t) => {
  const { db, primary } = await setup(t);
  db.exec("UPDATE icloud_mailbox_state SET last_uid=0");
  t.mock.method(IcloudImapClient.prototype, "connect", async () => {});
  t.mock.method(IcloudImapClient.prototype, "examineInbox", async () => ({ uidValidity: "123", uidNext: 4 }));
  t.mock.method(IcloudImapClient.prototype, "searchUids", async () => [1, 2, 3]);
  const requested: number[][] = [];
  t.mock.method(IcloudImapClient.prototype, "fetchMessages", async (uids: number[]) => {
    requested.push(uids);
    assert.equal(uids.length, 1, "Only one raw mail may be downloaded at a time");
    assert.equal(db.prepare("SELECT COUNT(*) count FROM message").get()?.count, uids[0] - 1, "The preceding message is stored before downloading another");
    return [{ uid: uids[0], source: `From: sender@example.com\r\nTo: ${primary.address}\r\nSubject: Message ${uids[0]}\r\nMessage-ID: <sequential-${uids[0]}@example.com>\r\n\r\nMessage body`, internalDate: new Date() }];
  });
  t.mock.method(IcloudImapClient.prototype, "logout", async () => {});
  const result = await syncIcloudAccount("account-1");
  assert.equal(result.imported, 3);
  assert.equal(result.remaining, 0);
  assert.deepEqual(requested, [[1], [2], [3]]);
  assert.equal((await listMessages(primary.id)).length, 3);
});

test("a 177-address snapshot uses bounded batch writes and repeated syncs do not rewrite unchanged rows", async (t) => {
  const { calls, db } = await setup(t);
  const aliases = Array.from({ length: 176 }, (_, index) => ({ ...hidden, address: `hidden-${index}@icloud.com`, providerId: `hme-${index}` }));
  const before = { ...calls };
  const first = await syncIcloudAliasSnapshot("account-1", aliases, true, "active", [alias()]);
  assert.equal(first.created, 177);
  assert.equal(first.activeCount, 177);
  assert.ok(calls.reads - before.reads <= 12, `Initial snapshot reads: ${calls.reads - before.reads}`);
  assert.ok(calls.batches - before.batches <= 8);
  assert.ok(calls.maxBatchSize <= 50);
  db.exec("UPDATE mail_address SET updated_at=1");
  const afterFirst = { ...calls };
  const repeated = await syncIcloudAliasSnapshot("account-1", aliases, true, "active", [alias()]);
  assert.equal(repeated.activeCount, 177);
  assert.ok(calls.reads - afterFirst.reads <= 8, `Repeated snapshot reads: ${calls.reads - afterFirst.reads}`);
  assert.equal(calls.batches - afterFirst.batches, 0);
  assert.equal(calls.writes - afterFirst.writes, 1, "Only the account sync timestamp/counts should be written");
  assert.equal(db.prepare("SELECT COUNT(*) count FROM mail_address WHERE updated_at<>1").get()?.count, 0);
});

test("unchanged snapshots preserve completed automatic-tag scans on already linked messages", async (t) => {
  const { db, calls } = await setup(t);
  await syncIcloudAliasSnapshot("account-1", [hidden], true, "active", [alias()]);
  const stored = await ingestMessage({ source: "icloud", accountId: "account-1", providerUid: 1, senderAddress: "sender@example.com", recipients: [hidden.address], subject: "Hello", textBody: "Hello", receivedAt: new Date() });
  db.prepare("UPDATE message SET automatic_tag_scanned_at=123 WHERE id=?").run(stored.id);
  const before = { ...calls };
  const result = await syncIcloudAliasSnapshot("account-1", [hidden], true, "active", [alias()]);
  assert.equal(result.linkedMessages, 0);
  assert.equal(result.automaticTagScanned, 0);
  assert.equal(db.prepare("SELECT automatic_tag_scanned_at FROM message WHERE id=?").get(stored.id)?.automatic_tag_scanned_at, 123);
  assert.equal(calls.batches - before.batches, 0);
});

test("changing one provider label updates only that address and preserves local fields", async (t) => {
  const { calls, db } = await setup(t);
  await syncIcloudAliasSnapshot("account-1", [hidden], true, "active", [alias()]);
  db.exec("UPDATE mail_address SET updated_at=1,phone_number='example',tags_json='[\"work\"]'");
  const before = { ...calls };
  await syncIcloudAliasSnapshot("account-1", [{ ...hidden, providerLabel: "Updated" }], true, "active", [alias()]);
  assert.equal(calls.batches - before.batches, 1);
  assert.equal(calls.writes - before.writes, 2, "One address update and one account update");
  const changed = db.prepare("SELECT address,provider_label,phone_number,tags_json FROM mail_address WHERE updated_at<>1").all();
  assert.equal(changed.length, 1);
  assert.equal(changed[0].provider_label, "Updated");
  assert.equal(changed[0].phone_number, "example");
  assert.equal(changed[0].tags_json, '["work"]');
});

test("a conflicting Apple identity is rejected before either address can be changed", async (t) => {
  await setup(t);
  await syncIcloudAliasSnapshot("account-1", [hidden], true, "active", [alias()]);
  await assert.rejects(syncIcloudAliasSnapshot("account-1", [{ ...hidden, address: "different@icloud.com" }], true, "active", [alias()]), /Apple 标识与项目记录不匹配/);
  assert.equal((await listAddresses()).filter(item => item.status === "active").length, 3);
});

test("ordinary alias labels follow Apple changes and clear on the next sync without rewriting unchanged labels", async (t) => {
  const { calls } = await setup(t);
  const labelled = { ...alias(), providerLabel: "Personal" };
  await syncIcloudAliasSnapshot("account-1", [], true, "active", [labelled]);
  assert.equal((await listAddresses()).find(item => item.type === "icloud_alias")?.providerLabel, "Personal");
  const batches = calls.batches;
  await syncIcloudAliasSnapshot("account-1", [], true, "active", [labelled]);
  assert.equal(calls.batches, batches);
  await syncIcloudAliasSnapshot("account-1", [], true, "active", [{ ...labelled, providerLabel: "Work" }]);
  assert.equal((await listAddresses()).find(item => item.type === "icloud_alias")?.providerLabel, "Work");
  await syncIcloudAliasSnapshot("account-1", [], true, "active", [{ ...labelled, providerLabel: null }]);
  assert.equal((await listAddresses()).find(item => item.type === "icloud_alias")?.providerLabel, null);
});

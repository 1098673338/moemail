import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { encryptWithSecret } from "./credential-cipher";
import { IcloudImapClient } from "./icloud-imap";
import { syncIcloudAccount } from "./icloud";

test("retry restores a failed account when the inbox has no new messages", async (t) => {
  const secret = "original-deployment-secret-32-characters";
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE mail_account (id TEXT PRIMARY KEY, email_address TEXT, username TEXT, encrypted_password TEXT, status TEXT, sync_error TEXT, uid_validity TEXT, last_uid INTEGER, last_sync_at INTEGER, updated_at INTEGER);
    CREATE TABLE icloud_mailbox_state (account_id TEXT, mailbox_path TEXT, uid_validity TEXT, last_uid INTEGER);
    INSERT INTO icloud_mailbox_state VALUES ('account-1', 'INBOX', '123', 5);
  `);
  db.prepare("INSERT INTO mail_account VALUES (?,?,?,?,?,?,?,?,?,?)").run("account-1", "test@icloud.com", "test@icloud.com", encryptWithSecret("unchanged-app-password", secret), "sync_error", "ECONNRESET", "123", 5, 1, 1);

  const contextSymbol = Symbol.for("__cloudflare-context__");
  const previous = Reflect.get(globalThis, contextSymbol);
  Reflect.set(globalThis, contextSymbol, { env: {
    EXTERNAL_MAIL_SECRET: secret,
    DB: { prepare(sql: string) {
      const statement = db.prepare(sql);
      return { bind(...params: (string | number | null)[]) {
        return {
          first: async () => statement.get(...params) || null,
          run: async () => ({ meta: statement.run(...params) }),
        };
      } };
    } },
  } });
  t.after(() => {
    if (previous === undefined) Reflect.deleteProperty(globalThis, contextSymbol);
    else Reflect.set(globalThis, contextSymbol, previous);
    db.close();
  });
  t.mock.method(IcloudImapClient.prototype, "connect", async (username: string, password: string) => {
    assert.equal(username, "test@icloud.com");
    assert.equal(password, "unchanged-app-password");
  });
  t.mock.method(IcloudImapClient.prototype, "examineInbox", async () => ({ uidValidity: "123", uidNext: 6 }));
  t.mock.method(IcloudImapClient.prototype, "fetchMessages", async (uids: number[]) => {
    assert.deepEqual(uids, []);
    return [];
  });
  t.mock.method(IcloudImapClient.prototype, "logout", async () => {});

  const result = await syncIcloudAccount("account-1");
  assert.equal(result.imported, 0);
  assert.equal(result.synced, 0);
  assert.equal(result.lastUid, 5);
  const account = db.prepare("SELECT status,sync_error,last_sync_at FROM mail_account").get();
  assert.equal(account?.status, "active");
  assert.equal(account?.sync_error, null);
  assert.ok(Number(account?.last_sync_at) > 1);
});

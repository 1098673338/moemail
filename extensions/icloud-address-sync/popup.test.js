import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./popup.js", import.meta.url), "utf8");
const created = { ok: true, created: true };
const limit = { ok: true, created: false, limitReached: true };
const aliases = [{ address: "alias@icloud.com", providerId: "apple-1", status: "active", providerLabel: "Label123" }];

async function setup({ outcomes = [created, limit], readError, snapshotError, mailError, reloadError, tabs } = {}) {
  const elements = new Map();
  const calls = [];
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {
        value: "", textContent: "", className: "", dataset: {}, disabled: false,
        addEventListener() {}, removeAttribute() {},
      });
      return elements.get(selector);
    },
  };
  const controls = ["#serverUrl", "#token", "#sync", "#createAliases", "#deleteDisabled"];
  const assertBusy = () => {
    for (const selector of controls) assert.equal(elements.get(selector).disabled, true, selector);
  };
  const context = vm.createContext({
    document, URL, Error, crypto: webcrypto, setTimeout: () => 1, clearTimeout() {},
    chrome: {
      permissions: { contains: async () => true },
      storage: { local: { get: async () => ({}), set: async () => {} } },
      runtime: {
        async sendMessage(message) {
          if (message.type === "MOEMAIL_ENSURE_APP_BRIDGE") return { ok: true, matched: 0 };
          assertBusy();
          calls.push(message.type);
          if (message.type === "MOEMAIL_CREATE_APPLE_ALIAS") {
            const result = outcomes.shift();
            assert.ok(result, "Unexpected extra create request");
            if (result instanceof Error) throw result;
            return result;
          }
          assert.equal(message.type, "MOEMAIL_READ_APPLE_ALIASES");
          return readError ? { ok: false, error: readError } : { ok: true, aliases };
        },
      },
      tabs: {
        query: async () => tabs ?? [
          { id: 1, url: "https://project.example/" },
          { id: 2, url: "https://other.example/" },
          { id: 3, url: "https://project.example/addresses" },
        ],
        async reload(id, options) {
          assertBusy();
          assert.equal(options.bypassCache, true);
          calls.push(`reload:${id}`);
          if (reloadError) throw new Error("Tab unavailable");
        },
      },
    },
    async fetch(url, options) {
      const path = new URL(url).pathname;
      if (path === "/api/icloud/bridge/accounts") return { ok: true, json: async () => ({ accounts: [{ id: "account-1" }] }) };
      assertBusy();
      calls.push(path);
      assert.equal(options.method, "POST");
      assert.equal(options.headers.authorization, "Bearer test-token");
      if (path.endsWith("/aliases/snapshot")) {
        assert.deepEqual(JSON.parse(options.body), { authoritative: true, scope: "active", aliases });
        return { ok: !snapshotError, json: async () => snapshotError ? { error: snapshotError } : { activeCount: aliases.length } };
      }
      assert.equal(path, "/api/icloud/bridge/accounts/account-1/sync");
      return { ok: !mailError, json: async () => mailError ? { error: mailError } : { imported: 2, synced: 3 } };
    },
  });
  vm.runInContext(source, context);
  elements.get("#serverUrl").value = "https://project.example";
  elements.get("#token").value = "test-token";
  elements.get("#createAliases").textContent = "创建隐私邮箱";
  await vm.runInContext("connectCloud(false)", context);
  return {
    calls, elements,
    async run(action = "batchCreateAliases") {
      await vm.runInContext(`${action}()`, context);
      for (const selector of controls) assert.equal(elements.get(selector).disabled, false, selector);
      assert.equal(elements.get("#createAliases").textContent, "创建隐私邮箱");
    },
    status: () => elements.get("#status").textContent,
  };
}

test("batch creation syncs one complete snapshot after reaching the limit, then refreshes only project tabs", async () => {
  const app = await setup({ outcomes: [created, created, limit] });
  await app.run();
  assert.deepEqual(app.calls, [
    "MOEMAIL_CREATE_APPLE_ALIAS", "MOEMAIL_CREATE_APPLE_ALIAS", "MOEMAIL_CREATE_APPLE_ALIAS",
    "MOEMAIL_READ_APPLE_ALIASES", "/api/icloud/accounts/account-1/aliases/snapshot", "reload:1", "reload:3",
  ]);
  assert.match(app.status(), /本次成功创建 2 个.*已自动同步 1 个地址.*项目页面已自动刷新/);
  assert.equal(app.elements.get("#createProgress").dataset.state, "success");
});

test("an already full account still syncs and refreshes existing addresses", async () => {
  const app = await setup({ outcomes: [limit] });
  await app.run();
  assert.match(app.status(), /本次成功创建 0 个.*已自动同步/);
  assert.ok(app.calls.includes("reload:1"));
});

test("partial creation is synced after a provider failure while preserving the failure message", async () => {
  const app = await setup({ outcomes: [created, { ok: false, error: "Apple unavailable" }] });
  await app.run();
  assert.match(app.status(), /创建已中断：Apple unavailable.*本次成功创建 1 个.*已自动同步/);
  assert.equal(app.elements.get("#status").className, "error");
  assert.ok(app.calls.includes("reload:1"));
});

test("failure before any successful creation does not overwrite the project snapshot", async () => {
  const app = await setup({ outcomes: [new Error("Disconnected")] });
  await app.run();
  assert.deepEqual(app.calls, ["MOEMAIL_CREATE_APPLE_ALIAS"]);
  assert.match(app.status(), /Disconnected.*本次成功创建 0 个/);
});

for (const failure of [{ readError: "Read failed" }, { snapshotError: "Save failed" }]) {
  test(`automatic sync failure (${Object.keys(failure)[0]}) retains creation count and offers retry without refreshing`, async () => {
    const app = await setup(failure);
    await app.run();
    assert.match(app.status(), /本次成功创建 1 个.*地址自动同步失败.*同步地址.*重试/);
    assert.ok(!app.calls.some((call) => call.startsWith("reload:")));
    assert.equal(app.elements.get("#createProgress").dataset.state, "error");
  });
}

test("page reload failure is reported separately from a successful address sync", async () => {
  const app = await setup({ reloadError: true });
  await app.run();
  assert.match(app.status(), /已自动同步 1 个地址.*页面刷新失败/);
  assert.doesNotMatch(app.status(), /地址自动同步失败/);
});

test("sync succeeds when no project page is open", async () => {
  const app = await setup({ tabs: [] });
  await app.run();
  assert.match(app.status(), /已自动同步 1 个地址.*未找到已打开的项目页面/);
});

test("manual sync still imports mail and refreshes even when mail import fails", async () => {
  const app = await setup({ mailError: "Mail unavailable" });
  await app.run("syncAliases");
  assert.deepEqual(app.calls, [
    "MOEMAIL_READ_APPLE_ALIASES", "/api/icloud/accounts/account-1/aliases/snapshot",
    "/api/icloud/bridge/accounts/account-1/sync", "reload:1", "reload:3",
  ]);
  assert.match(app.status(), /地址已同步，但邮箱同步失败：Mail unavailable.*项目页面已自动刷新/);
});

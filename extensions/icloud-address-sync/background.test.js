import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./background.js", import.meta.url), "utf8");
const alias = (emailId = "alternate", supportedDomains = [{ domain: "icloud.com" }]) => ({ emailId, supportedDomains, isActive: true, label: "Personal" });

function setup({ accountId = "primary", aliases = [alias()], deleteError = false, retainAfterDelete = false, malformed = false } = {}) {
  const calls = [];
  let handler;
  let currentAliases = aliases;
  const context = vm.createContext({
    URL, Error, crypto: webcrypto,
    chrome: {
      sidePanel: { setPanelBehavior: async () => {} },
      runtime: {
        id: "test-extension", getURL: (path) => `chrome-extension://test-extension/${path}`,
        onInstalled: { addListener() {} }, onStartup: { addListener() {} },
        onMessage: { addListener(value) { handler = value; } },
      },
      storage: { local: { get: async () => ({ serverUrl: "https://project.example" }) } },
      cookies: { getAll: async () => [] },
      tabs: { query: async () => [{ id: 1, url: "https://www.icloud.com/mail/" }], onUpdated: { addListener() {} } },
    },
    async fetch(input, options) {
      const url = new URL(input);
      calls.push({ url: url.href, method: options.method });
      if (url.pathname === "/setup/ws/1/validate") return { ok: true, status: 200, json: async () => ({ dsInfo: { dsid: "123" }, webservices: { mcc: { url: "https://p01-mailws.icloud.com" }, premiummailsettings: { url: "https://p01-maildomainws.icloud.com" } } }) };
      if (url.pathname.endsWith("/preference/web/all")) return { ok: true, status: 200, json: async () => malformed ? {} : ({ account: { emailId: accountId, supportedDomains: [{ domain: "icloud.com" }], aliases: currentAliases } }) };
      if (url.pathname === "/v2/hme/list") return { ok: true, status: 200, json: async () => ({ success: true, result: { hmeEmails: [{ hme: "hidden@icloud.com", anonymousId: "hme-1", isActive: true }] } }) };
      assert.equal(options.method, "DELETE");
      assert.equal(url.pathname, "/cc/mail/v1/account/123/aliases/alternate");
      if (!deleteError && !retainAfterDelete) currentAliases = [];
      return { ok: !deleteError, status: deleteError ? 403 : 200, json: async () => deleteError ? { errorCode: "DENIED" } : { message: "OK" } };
    },
  });
  vm.runInContext(source, context);
  return {
    calls,
    send(message, sender = { id: "test-extension", url: "https://project.example/" }) {
      return new Promise((resolve) => { assert.equal(handler(message, sender, resolve), true); });
    },
  };
}

const deletion = { type: "MOEMAIL_DELETE_APPLE_MAIL_ALIAS", accountAddress: "primary@icloud.com", address: "alternate@icloud.com", providerId: "mail-alias:123:alternate@icloud.com" };

test("snapshot reads hidden addresses and ordinary aliases from the same Apple account", async () => {
  const app = setup({ aliases: [alias("alternate", [{ domain: "icloud.com" }, { domain: "me.com" }])] });
  const result = await app.send({ type: "MOEMAIL_READ_APPLE_ALIASES", accountAddress: "primary@icloud.com" }, { id: "test-extension", url: "chrome-extension://test-extension/popup.html" });
  assert.equal(result.ok, true);
  assert.equal(result.aliases[0].address, "hidden@icloud.com");
  assert.deepEqual(Array.from(result.mailAliases, item => item.address), ["alternate@icloud.com", "alternate@me.com"]);
  assert.equal(result.mailAliases[0].providerId, "mail-alias:123:alternate@icloud.com");
});

test("ordinary alias deletion uses the Apple Mail API and verifies removal before success", async () => {
  const app = setup();
  assert.equal((await app.send(deletion)).ok, true);
  assert.equal(app.calls.filter(call => call.method === "DELETE").length, 1);
  assert.equal(app.calls.filter(call => call.url.includes("/preference/web/all")).length, 2);
  assert.ok(!app.calls.some(call => call.url.includes("/hme/")));
});

for (const [name, options, changes] of [
  ["wrong Apple account", { accountId: "someone-else" }, {}],
  ["wrong provider identity", {}, { providerId: "mail-alias:999:alternate@icloud.com" }],
  ["primary address", {}, { address: "primary@icloud.com", providerId: "mail-alias:123:primary@icloud.com" }],
  ["incomplete account response", { malformed: true }, {}],
]) {
  test(`deletion refuses ${name} without sending a delete request`, async () => {
    const app = setup(options);
    assert.equal((await app.send({ ...deletion, ...changes })).ok, false);
    assert.ok(!app.calls.some(call => call.method === "DELETE"));
  });
}

test("only the configured MoeMail origin can request deletion", async () => {
  const app = setup();
  assert.equal((await app.send(deletion, { id: "test-extension", url: "https://other.example/" })).ok, false);
  assert.equal(app.calls.length, 0);
});

test("deletion is safely retryable when Apple already removed the alias", async () => {
  const app = setup({ aliases: [] });
  assert.equal((await app.send(deletion)).ok, true);
  assert.ok(!app.calls.some(call => call.method === "DELETE"));
});

test("a changed legacy-domain variant cannot be mistaken for an already deleted alias", async () => {
  const app = setup({ aliases: [alias("alternate", [{ domain: "me.com" }])] });
  assert.equal((await app.send(deletion)).ok, false);
  assert.ok(!app.calls.some(call => call.method === "DELETE"));
});

for (const options of [{ deleteError: true }, { retainAfterDelete: true }]) {
  test(`deletion reports failure when Apple ${options.deleteError ? "rejects deletion" : "still lists the alias"}`, async () => {
    const app = setup(options);
    assert.equal((await app.send(deletion)).ok, false);
  });
}

test("snapshot refuses a different Apple account before reading hidden addresses", async () => {
  const app = setup({ accountId: "someone-else" });
  const result = await app.send({ type: "MOEMAIL_READ_APPLE_ALIASES", accountAddress: "primary@icloud.com" }, { id: "test-extension", url: "chrome-extension://test-extension/popup.html" });
  assert.equal(result.ok, false);
  assert.ok(!app.calls.some(call => call.url.includes("/hme/")));
});

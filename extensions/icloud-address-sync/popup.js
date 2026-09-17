const serverInput = document.querySelector("#serverUrl");
const tokenInput = document.querySelector("#token");
const connectButton = document.querySelector("#connect");
const syncButton = document.querySelector("#sync");
const createButton = document.querySelector("#createAliases");
const deleteDisabledButton = document.querySelector("#deleteDisabled");
const accountSection = document.querySelector("#accountSection");
const statusBox = document.querySelector("#status");

let accountId = "";
let timer;

function serverOrigin() {
  try {
    const url = new URL(serverInput.value.trim());
    if (!["https:", "http:"].includes(url.protocol)) throw new Error();
    return url.origin;
  } catch { throw new Error("请填写有效的 MoeMail 云端地址，例如 https://moemail.你的账号.workers.dev"); }
}

function status(message, tone = "") {
  clearTimeout(timer);
  statusBox.textContent = message;
  statusBox.className = tone;
  if (message) timer = setTimeout(() => { statusBox.textContent = ""; statusBox.className = ""; }, tone === "error" ? 6000 : 3600);
}

function setConnection(state) {
  const labels = { idle: "连接云端项目", connecting: "正在连接…", connected: "云端项目已连接" };
  connectButton.textContent = labels[state];
  connectButton.disabled = state !== "idle";
}

function setActionsBusy(busy) {
  syncButton.disabled = busy;
  createButton.disabled = busy;
  deleteDisabledButton.disabled = busy;
}

async function allowOrigin(origin) {
  const pattern = `${origin}/*`;
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) throw new Error("需要允许同步助手访问这个 MoeMail 云端地址，才能同步隐藏地址");
}

async function api(path, options = {}) {
  const origin = serverOrigin();
  const response = await fetch(`${origin}${path}`, {
    ...options,
    headers: { "content-type": "application/json", authorization: `Bearer ${tokenInput.value.trim()}`, ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `MoeMail 云端请求失败 (${response.status})`);
  return data;
}

async function connectCloud() {
  setConnection("connecting");
  accountSection.hidden = true;
  try {
    const origin = serverOrigin();
    if (!tokenInput.value.trim()) throw new Error("请填写 EXTERNAL_MAIL_SECRET 的值");
    await allowOrigin(origin);
    const data = await api("/api/icloud/bridge/accounts");
    if (!Array.isArray(data.accounts) || !data.accounts.length) throw new Error("云端项目还没有连接 iCloud 账号");
    if (data.accounts.length !== 1) throw new Error("云端项目存在多个 iCloud 账号，当前同步助手无法自动选择账号");
    accountId = data.accounts[0].id;
    await chrome.storage.local.set({ serverUrl: origin, bridgeToken: tokenInput.value.trim() });
    const bridge = await chrome.runtime.sendMessage({ type: "MOEMAIL_ENSURE_APP_BRIDGE" });
    if (!bridge?.ok) throw new Error(bridge?.error || "无法连接当前 MoeMail 页面");
    accountSection.hidden = false;
    setConnection("connected");
    status("云端项目已连接", "success");
  } catch (error) {
    accountId = "";
    setConnection("idle");
    status(error instanceof Error ? error.message : "连接失败", "error");
  }
}

async function syncAliases() {
  if (!accountId) return status("请先连接云端项目", "error");
  setActionsBusy(true);
  status("正在读取 iCloud+ 中的使用中地址…");
  let imported = null;
  try {
    const response = await chrome.runtime.sendMessage({ type: "MOEMAIL_READ_APPLE_ALIASES" });
    if (!response?.ok) throw new Error(response?.error || "无法读取 Apple 地址");
    const aliases = response.aliases || [];
    const ids = new Set(aliases.map((item) => item.providerId));
    const addresses = new Set(aliases.map((item) => item.address));
    if (ids.size !== aliases.length || addresses.size !== aliases.length) throw new Error("Apple 返回了重复地址，已取消覆盖同步");
    imported = await api(`/api/icloud/accounts/${accountId}/aliases/snapshot`, {
      method: "POST",
      body: JSON.stringify({ authoritative: true, scope: "active", aliases }),
    });
    const synced = await api(`/api/icloud/accounts/${accountId}/sync`, { method: "POST" });
    const tabs = await chrome.tabs.query({});
    const origin = serverOrigin();
    await Promise.all(tabs.filter((tab) => { try { return Number.isInteger(tab.id) && new URL(tab.url || "").origin === origin; } catch { return false; } }).map((tab) => chrome.tabs.reload(tab.id)));
    status(`同步完成：${imported.activeCount} 个隐藏地址；邮件新增 ${synced.imported || 0} 封。`, "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步失败";
    status(imported ? `隐藏地址已同步，但邮件同步失败：${message}` : message, "error");
  } finally { setActionsBusy(false); }
}

function randomLabel(existing) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  do {
    result = "";
    while (result.length < 8) {
      for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
        if (byte < 248) result += alphabet[byte % alphabet.length];
        if (result.length === 8) break;
      }
    }
  } while (existing.has(result));
  existing.add(result);
  return result;
}

async function appleRequest(target, method, path, body) {
  const response = await chrome.runtime.sendMessage({ type: "MOEMAIL_APPLE_REQUEST", target, method, path, body });
  if (!response?.ok) {
    const error = new Error(response?.error || "Apple 请求失败");
    error.code = String(response?.code || "");
    throw error;
  }
  return response.payload;
}

async function createAliases() {
  setActionsBusy(true);
  createButton.textContent = "正在创建…";
  let created = 0;
  try {
    const targetResponse = await chrome.runtime.sendMessage({ type: "MOEMAIL_APPLE_TARGET" });
    const target = targetResponse?.target;
    if (!targetResponse?.ok || !target) throw new Error(targetResponse?.error || "无法连接 Apple iCloud");
    const used = new Set();
    for (;;) {
      status(`正在创建第 ${created + 1} 个隐私邮箱…`);
      const generated = await appleRequest(target, "POST", "/v1/hme/generate", { langCode: target.region === "china" ? "zh-cn" : "en-us" });
      const hme = String(generated?.hme || "").trim();
      if (!hme) throw new Error("Apple 没有返回待创建的地址");
      try {
        await appleRequest(target, "POST", "/v1/hme/reserve", { hme, label: randomLabel(used), note: "" });
        created += 1;
      } catch (error) {
        if (error?.code === "-41015") { status(`已达到 Apple 创建上限；本次成功创建 ${created} 个地址。`, "success"); return; }
        throw error;
      }
    }
  } catch (error) { status(error instanceof Error ? error.message : "创建失败", "error"); }
  finally { createButton.textContent = "创建隐私邮箱"; setActionsBusy(false); }
}

async function deleteDisabledAliases() {
  setActionsBusy(true);
  try {
    const targetResponse = await chrome.runtime.sendMessage({ type: "MOEMAIL_APPLE_TARGET" });
    const target = targetResponse?.target;
    if (!targetResponse?.ok || !target) throw new Error(targetResponse?.error || "无法连接 Apple iCloud");
    const list = await appleRequest(target, "GET", "/v2/hme/list");
    const aliases = Array.isArray(list?.hmeEmails) ? list.hmeEmails : Array.isArray(list?.items) ? list.items : Array.isArray(list) ? list : [];
    const disabled = aliases.filter((item) => item?.isActive === false).map((item) => String(item.anonymousId || "")).filter(Boolean);
    if (!disabled.length) return status("Apple 账号中没有已停用的隐藏地址。", "success");
    let deleted = 0;
    for (const anonymousId of disabled) { await appleRequest(target, "POST", "/v1/hme/delete", { anonymousId }); deleted += 1; }
    status(`已从 Apple 账号永久删除 ${deleted} 个已停用地址。`, "success");
  } catch (error) { status(error instanceof Error ? error.message : "删除失败", "error"); }
  finally { setActionsBusy(false); }
}

function resetConnection() { accountId = ""; accountSection.hidden = true; setConnection("idle"); }
connectButton.addEventListener("click", () => void connectCloud());
serverInput.addEventListener("input", resetConnection);
tokenInput.addEventListener("input", resetConnection);
syncButton.addEventListener("click", () => void syncAliases());
createButton.addEventListener("click", () => void createAliases());
deleteDisabledButton.addEventListener("click", () => void deleteDisabledAliases());
chrome.storage.local.get(["serverUrl", "bridgeToken"]).then((saved) => {
  if (saved.serverUrl) serverInput.value = saved.serverUrl;
  if (saved.bridgeToken) tokenInput.value = saved.bridgeToken;
  if (saved.serverUrl && saved.bridgeToken) void connectCloud();
});

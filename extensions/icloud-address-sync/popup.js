const serverInput = document.querySelector("#serverUrl");
const tokenInput = document.querySelector("#token");
const connectButton = document.querySelector("#connect");
const syncButton = document.querySelector("#sync");
const createButton = document.querySelector("#createAliases");
const deleteDisabledButton = document.querySelector("#deleteDisabled");
const accountSection = document.querySelector("#accountSection");
const statusBox = document.querySelector("#status");
const createProgress = document.querySelector("#createProgress");
const createProgressText = document.querySelector("#createProgressText");
const createProgressCount = document.querySelector("#createProgressCount");
const createProgressBar = document.querySelector("#createProgressBar");

let statusTimer;
let createProgressTimer;
let connectedAccountId = "";

function setConnectButtonState(state) {
  const labels = {
    idle: "连接云端项目",
    connecting: "正在连接…",
    connected: "云端项目已连接",
  };
  connectButton.textContent = labels[state];
  connectButton.disabled = state !== "idle";
}

function serverOrigin() {
  try {
    const url = new URL(serverInput.value.trim());
    if (!/^https?:$/.test(url.protocol)) throw new Error();
    return url.origin;
  } catch {
    throw new Error("请填写有效的 MoeMail 云端地址，例如 https://moemail.你的账号.workers.dev");
  }
}

function setStatus(message, tone = "", duration = tone === "error" ? 5000 : 3200) {
  clearTimeout(statusTimer);
  statusBox.textContent = message;
  statusBox.className = tone;
  if (!message || duration <= 0) return;
  statusTimer = setTimeout(() => {
    statusBox.textContent = "";
    statusBox.className = "";
  }, duration);
}

function setCreateProgress({ visible = true, state = "running", message = "正在准备创建…", created = 0 } = {}) {
  clearTimeout(createProgressTimer);
  createProgress.hidden = !visible;
  if (!visible) return;
  createProgress.dataset.state = state;
  createProgressText.textContent = message;
  createProgressCount.textContent = state === "running" ? `已创建 ${created}` : `本次创建 ${created}`;
  if (state === "running") createProgressBar.removeAttribute("value");
  else {
    createProgressBar.max = 1;
    createProgressBar.value = 1;
  }
  if (state !== "running") {
    createProgressTimer = setTimeout(() => { createProgress.hidden = true; }, state === "error" ? 5000 : 3200);
  }
}

function setAccountActionsDisabled(disabled) {
  syncButton.disabled = disabled;
  createButton.disabled = disabled;
  deleteDisabledButton.disabled = disabled;
}

async function ensureCloudPermission(origin, interactive) {
  const origins = [`${origin}/*`];
  if (await chrome.permissions.contains({ origins })) return;
  if (!interactive) throw new Error("请点击“连接云端项目”以授权访问已保存的 MoeMail 地址。");
  const granted = await chrome.permissions.request({ origins });
  if (!granted) throw new Error("需要允许同步助手访问这个 MoeMail 云端地址，才能同步隐藏地址。");
}

async function cloudRequest(path, options = {}) {
  const response = await fetch(`${serverOrigin()}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tokenInput.value.trim()}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `MoeMail 云端请求失败 (${response.status})`);
  return data;
}

async function notifyCloudPages(result) {
  const origin = serverOrigin();
  const tabs = await chrome.tabs.query({});
  let notified = 0;
  await Promise.all(tabs.map(async (tab) => {
    try {
      if (!Number.isInteger(tab.id) || new URL(tab.url || "").origin !== origin) return;
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "MOEMAIL_ALIAS_SNAPSHOT_SYNCED",
        result,
      });
      if (response?.ok) notified += 1;
    } catch {
      // The project page can close or navigate while the sync is completing.
    }
  }));
  return notified;
}

async function ensureAppBridge() {
  const response = await chrome.runtime.sendMessage({ type: "MOEMAIL_ENSURE_APP_BRIDGE" });
  if (!response?.ok) throw new Error(response?.error || "无法连接当前 MoeMail 页面");
  if (response.matched > 0 && response.injected === 0) {
    throw new Error("同步助手无法连接已打开的 MoeMail 页面，请刷新项目页面后重试。");
  }
}

async function connectCloud(interactive = true) {
  setConnectButtonState("connecting");
  setStatus("正在连接 MoeMail 云端项目…", "", 0);
  try {
    const origin = serverOrigin();
    if (!tokenInput.value.trim()) throw new Error("请填写 EXTERNAL_MAIL_SECRET 的值");
    await ensureCloudPermission(origin, interactive);
    const data = await cloudRequest("/api/icloud/bridge/accounts");
    if (!data.accounts?.length) throw new Error("云端项目还没有连接 iCloud 账号");
    if (data.accounts.length !== 1) throw new Error("云端项目存在多个 iCloud 账号，无法自动确定同步账号");
    connectedAccountId = data.accounts[0].id;
    await chrome.storage.local.set({ serverUrl: origin, bridgeToken: tokenInput.value.trim() });
    await ensureAppBridge();
    accountSection.hidden = false;
    setConnectButtonState("connected");
    setStatus("");
  } catch (error) {
    connectedAccountId = "";
    accountSection.hidden = true;
    setConnectButtonState("idle");
    setStatus(error instanceof Error ? error.message : "连接失败", "error");
  }
}

function validateCompleteList(aliases, expectedActive) {
  const ids = new Set(aliases.map((item) => item.providerId));
  const addresses = new Set(aliases.map((item) => item.address));
  if (!aliases.length && expectedActive !== 0) throw new Error("没有读取到任何使用中的隐藏邮件地址");
  if (ids.size !== aliases.length || addresses.size !== aliases.length) throw new Error("读取到重复地址，已取消覆盖同步");
  if (aliases.some((item) => item.status !== "active")) throw new Error("读取结果包含已停用地址，已取消同步");
  if (expectedActive !== null && aliases.length !== expectedActive) {
    throw new Error(`使用中地址未加载完整：页面显示 ${expectedActive}，实际读取 ${aliases.length}`);
  }
  return { active: aliases.length };
}

async function readIcloudAliases() {
  const response = await chrome.runtime.sendMessage({ type: "MOEMAIL_READ_APPLE_ALIASES" });
  if (!response?.ok) throw new Error(response?.error || "无法读取 Apple 地址");
  const aliases = response.aliases || [];
  validateCompleteList(aliases, aliases.length);
  return aliases;
}

async function syncAliases() {
  if (!connectedAccountId) return setStatus("请先连接云端项目", "error");
  setAccountActionsDisabled(true);
  setStatus("正在获取 iCloud+ 中的使用中地址…");
  let addressResult = null;
  try {
    const aliases = await readIcloudAliases();
    const labelCount = aliases.filter((alias) => alias.providerLabel).length;
    addressResult = await cloudRequest(`/api/icloud/accounts/${connectedAccountId}/aliases/snapshot`, {
      method: "POST",
      body: JSON.stringify({ authoritative: true, scope: "active", aliases }),
    });
    setStatus(`地址已同步 ${addressResult.activeCount} 个，已关联 ${addressResult.linkedMessages || 0} 封历史邮件，自动标记 ${addressResult.automaticTagApplied || 0} 个地址，正在同步邮箱…`);
    const mailResult = await cloudRequest(`/api/icloud/accounts/${connectedAccountId}/sync`, { method: "POST" });
    const updatedPages = await notifyCloudPages(addressResult);
    const pageStatus = updatedPages > 0 ? "；项目页面已更新" : "";
    setStatus(`同步完成：${addressResult.activeCount} 个地址，${labelCount} 个带标签；邮件新增 ${mailResult.imported || 0} 封，已处理 ${mailResult.synced || 0} 封${pageStatus}。`, "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步失败";
    setStatus(addressResult ? `地址已同步，但邮箱同步失败：${message}` : message, "error");
  } finally {
    setAccountActionsDisabled(false);
  }
}

function randomAlphanumericLabel(usedLabels) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const maxAcceptedByte = 256 - (256 % alphabet.length);
  let label = "";
  do {
    label = "";
    while (label.length < 8) {
      for (const byte of crypto.getRandomValues(new Uint8Array((8 - label.length) * 2))) {
        if (byte >= maxAcceptedByte) continue;
        label += alphabet[byte % alphabet.length];
        if (label.length === 8) break;
      }
    }
  } while (usedLabels.has(label));
  usedLabels.add(label);
  return label;
}

async function batchCreateAliases() {
  setAccountActionsDisabled(true);
  const originalButtonText = createButton.textContent;
  let created = 0;
  createButton.textContent = "正在创建…";
  setCreateProgress({ visible: false });
  try {
    setStatus("创建进行中，请保持侧边栏打开。达到账号上限时自动停止。", "", 0);
    const usedLabels = new Set();
    while (true) {
      const index = created + 1;
      const label = randomAlphanumericLabel(usedLabels);
      setCreateProgress({ message: `正在创建第 ${index} 个地址…`, created });
      const result = await chrome.runtime.sendMessage({ type: "MOEMAIL_CREATE_APPLE_ALIAS", label });
      if (!result?.ok && !result?.limitReached) throw new Error(result?.error || "创建失败");
      if (result.limitReached) {
        setCreateProgress({ state: "success", message: "已达到 Apple 账号上限，创建已停止", created });
        setStatus(`已达到 Apple 账号可创建上限并停止；本次成功创建 ${created} 个隐藏邮件地址。`, "success");
        return;
      }
      if (!result.created) throw new Error(`第 ${index} 个创建失败`);
      created += 1;
      setCreateProgress({ message: `第 ${created} 个已创建，正在继续…`, created });
    }
  } catch (error) {
    setCreateProgress({ state: "error", message: "创建流程异常中断", created });
    setStatus(error instanceof Error ? error.message : "批量创建失败", "error");
  } finally {
    createButton.textContent = originalButtonText;
    setAccountActionsDisabled(false);
  }
}

async function deleteDisabledAliases() {
  setAccountActionsDisabled(true);
  setStatus("正在读取 Apple 账号中的已停用地址…", "", 0);
  try {
    const result = await chrome.runtime.sendMessage({ type: "MOEMAIL_DELETE_DISABLED_APPLE_ALIASES" });
    if (!result?.ok) throw new Error(result?.error || "删除失败");
    if (result.failures?.length) {
      throw new Error(`已删除 ${result.deleted} 个；${result.failures.length} 个失败。第 ${result.failures[0].index} 个：${result.failures[0].message}`);
    }
    setStatus(result.total ? `已从 Apple 账号永久删除 ${result.deleted} 个已停用地址。` : "Apple 账号中没有已停用的隐藏邮件地址。", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "删除失败", "error");
  } finally {
    setAccountActionsDisabled(false);
  }
}

function resetConnection() {
  connectedAccountId = "";
  accountSection.hidden = true;
  setConnectButtonState("idle");
}

connectButton.addEventListener("click", () => void connectCloud(true));
serverInput.addEventListener("input", resetConnection);
tokenInput.addEventListener("input", resetConnection);
syncButton.addEventListener("click", () => void syncAliases());
createButton.addEventListener("click", () => void batchCreateAliases());
deleteDisabledButton.addEventListener("click", () => void deleteDisabledAliases());

chrome.storage.local.get(["serverUrl", "bridgeToken"]).then((saved) => {
  if (saved.serverUrl) serverInput.value = saved.serverUrl;
  if (saved.bridgeToken) tokenInput.value = saved.bridgeToken;
  if (saved.serverUrl && saved.bridgeToken) void connectCloud(false);
});

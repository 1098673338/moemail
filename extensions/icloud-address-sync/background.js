const ICLOUD_PAGE_PATTERN = /^https:\/\/(?:[^/]+\.)?icloud\.com(?:\.cn)?\//;
const REGIONS = {
  china: {
    setupUrl: "https://setup.icloud.com.cn/setup/ws/1/validate",
    origin: "https://www.icloud.com.cn",
    maildomainHost: "p217-maildomainws.icloud.com.cn",
  },
  global: {
    setupUrl: "https://setup.icloud.com/setup/ws/1/validate",
    origin: "https://www.icloud.com",
    maildomainHost: "p68-maildomainws.icloud.com",
  },
};

function regionForUrl(url) {
  return new URL(url).hostname.endsWith(".icloud.com.cn") ? "china" : "global";
}

function configuredOrigin(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["https:", "http:"].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function getConfiguredOrigin() {
  const { serverUrl } = await chrome.storage.local.get("serverUrl");
  return configuredOrigin(serverUrl);
}

async function configureSidePanel() {
  if (chrome.sidePanel?.setPanelBehavior) await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

async function ensureAppBridge() {
  const origin = await getConfiguredOrigin();
  if (!origin) return { matched: 0, injected: 0, failed: 0 };
  const tabs = await chrome.tabs.query({});
  const matchingTabs = tabs.filter((tab) => {
    try { return Number.isInteger(tab.id) && new URL(tab.url || "").origin === origin; } catch { return false; }
  });
  let injected = 0;
  let failed = 0;
  for (const tab of matchingTabs) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: ["content.js"] });
      injected += 1;
    } catch { failed += 1; }
  }
  return { matched: matchingTabs.length, injected, failed };
}

async function injectBridgeIntoTab(tab) {
  const origin = await getConfiguredOrigin();
  try {
    if (!origin || !Number.isInteger(tab.id) || new URL(tab.url || "").origin !== origin) return;
    await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: ["content.js"] });
  } catch {
    // The configured tab can disappear or navigate while the extension is waking up.
  }
}

void configureSidePanel();
chrome.runtime.onInstalled.addListener(() => void configureSidePanel());
chrome.runtime.onStartup.addListener(() => void configureSidePanel());
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") void injectBridgeIntoTab(tab);
});

async function extensionFetchJson(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "*/*", "Content-Type": "text/plain", ...(options.headers || {}) },
    });
    return { ok: response.ok, status: response.status, payload: await response.json().catch(() => null) };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : "扩展后台请求失败" };
  }
}

function providerError(payload, fallback = "Apple 拒绝请求") {
  const item = payload?.error;
  const message = typeof item === "string" ? item : item?.errorMessage || item?.errorCode || payload?.reason || fallback;
  const error = new Error(message);
  error.code = String(typeof item === "object" ? item?.errorCode || "" : "");
  return error;
}

function appleTargetFromValidate(payload, region) {
  const data = payload?.result?.webservices ? payload.result : payload;
  const service = data?.webservices?.premiummailsettings || data?.webservices?.maildomainws;
  const apiBase = String(typeof service === "string" ? service : service?.url || "").replace(/\/+$/, "");
  const dsid = String(data?.dsInfo?.dsid || data?.dsid || "").trim();
  if (!apiBase || !dsid) return null;
  return {
    apiBase,
    region,
    query: { clientBuildNumber: "2626Build17", clientMasteringNumber: "2626Build17", clientId: crypto.randomUUID(), dsid },
  };
}

async function sessionTarget(region) {
  const config = REGIONS[region];
  const cookieLists = await Promise.all([
    chrome.cookies.getAll({ url: config.origin }),
    chrome.cookies.getAll({ url: config.setupUrl }),
    chrome.cookies.getAll({ url: `https://${config.maildomainHost}` }),
  ]);
  const cookies = new Map(cookieLists.flat().map((cookie) => [cookie.name, cookie.value]));
  const user = String(cookies.get("X-APPLE-WEBAUTH-USER") || "").replace(/^"|"$/g, "");
  const dsid = user.match(/(?:^|[:;])d=([^:;]+)/i)?.[1] || cookies.get("X-APPLE-DSID") || "";
  if (!cookies.get("X-APPLE-WEBAUTH-TOKEN") || !dsid) return null;
  return {
    apiBase: `https://${config.maildomainHost}`,
    region,
    query: { clientBuildNumber: "2626Build17", clientMasteringNumber: "2626Build17", clientId: crypto.randomUUID(), dsid: String(dsid) },
  };
}

async function locateAppleTarget() {
  const tabs = await chrome.tabs.query({ url: ["https://*.icloud.com/*", "https://*.icloud.com.cn/*"] });
  const regions = [...new Set(tabs.filter((tab) => ICLOUD_PAGE_PATTERN.test(tab.url || "")).map((tab) => regionForUrl(tab.url)))];
  for (const region of regions.length ? regions : ["china", "global"]) {
    const direct = await extensionFetchJson(REGIONS[region].setupUrl);
    if (direct.ok) {
      const target = appleTargetFromValidate(direct.payload, region);
      if (target) return target;
    }
    const fallback = await sessionTarget(region);
    if (fallback) return fallback;
  }
  throw new Error("Chrome 中未找到有效的 iCloud 登录会话。请先登录 iCloud.com 并完成验证后重试。");
}

async function appleRequest(target, method, path, body) {
  const endpoint = new URL(`${target.apiBase}${path}`);
  for (const [key, value] of Object.entries(target.query)) endpoint.searchParams.set(key, String(value));
  const response = await extensionFetchJson(endpoint, { method, body: body == null ? undefined : JSON.stringify(body) });
  if (!response.ok || response.payload?.success === false) throw providerError(response.payload, `Apple 请求失败 (${response.status || "网络错误"})`);
  return response.payload?.success === true ? response.payload.result : response.payload;
}

async function readAppleAliases() {
  const target = await locateAppleTarget();
  const payload = await appleRequest(target, "GET", "/v2/hme/list");
  const list = Array.isArray(payload?.hmeEmails) ? payload.hmeEmails : Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : null;
  if (!list) throw new Error("Apple 地址清单格式无法识别");
  const aliases = list.filter((item) => item?.isActive === true).map((item) => ({
    address: String(item.hme || item.address || "").trim().toLowerCase(),
    providerId: String(item.anonymousId || item.id || "").trim(),
    status: "active",
    providerLabel: String(item.label || "").trim() || null,
    providerOrigin: String(item.origin || item.originAppName || "").trim() || null,
    providerCreatedAt: Number.isFinite(item.createTimestamp) ? new Date(item.createTimestamp < 10_000_000_000 ? item.createTimestamp * 1000 : item.createTimestamp).toISOString() : null,
  }));
  if (aliases.some((item) => !item.address || !item.providerId)) throw new Error("Apple 地址清单中有记录缺少地址或 Apple 标识");
  return aliases;
}

async function updateAppleLabel(providerId, label) {
  if (!providerId) throw new Error("这个 iCloud 地址缺少 Apple 标识，请先同步地址");
  if (String(label || "").trim().length > 500) throw new Error("Apple 标签不能超过 500 个字符");
  const target = await locateAppleTarget();
  await appleRequest(target, "POST", "/v1/hme/updateMetaData", { anonymousId: providerId, label: String(label || "").trim() });
}

async function deactivateAppleAlias(providerId) {
  if (!providerId) throw new Error("这个 iCloud 地址缺少 Apple 标识，请先同步地址");
  const target = await locateAppleTarget();
  await appleRequest(target, "POST", "/v1/hme/deactivate", { anonymousId: providerId });
}

async function createAppleAlias(label) {
  if (!/^[A-Za-z0-9]{8}$/.test(String(label || ""))) throw new Error("隐藏邮箱标签格式无效");
  const target = await locateAppleTarget();
  try {
    const generated = await appleRequest(target, "POST", "/v1/hme/generate", { langCode: target.region === "china" ? "zh-cn" : "en-us" });
    const hme = typeof generated?.hme === "string" ? generated.hme.trim() : "";
    if (!hme) throw new Error("Apple 没有返回待创建的地址");
    await appleRequest(target, "POST", "/v1/hme/reserve", { hme, label, note: "" });
    return { created: true, limitReached: false };
  } catch (error) {
    if (error?.code === "-41015") return { created: false, limitReached: true };
    throw error;
  }
}

async function deleteDisabledAppleAliases() {
  const target = await locateAppleTarget();
  const payload = await appleRequest(target, "GET", "/v2/hme/list");
  const aliases = Array.isArray(payload?.hmeEmails) ? payload.hmeEmails : Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : null;
  if (!aliases) throw new Error("Apple 地址清单格式无法识别");
  const providerIds = aliases.filter((alias) => alias?.isActive === false).map((alias) => String(alias?.anonymousId || alias?.id || "").trim());
  if (providerIds.some((providerId) => !providerId)) throw new Error("有已停用地址缺少 Apple 标识");
  if (new Set(providerIds).size !== providerIds.length) throw new Error("Apple 已停用地址清单包含重复记录");
  let deleted = 0;
  const failures = [];
  for (const [index, anonymousId] of providerIds.entries()) {
    try {
      await appleRequest(target, "POST", "/v1/hme/delete", { anonymousId });
      deleted += 1;
    } catch (error) {
      failures.push({ index: index + 1, message: error instanceof Error ? error.message : "未知错误" });
    }
  }
  return { total: providerIds.length, deleted, failures };
}

async function senderIsConfiguredApp(sender) {
  const origin = await getConfiguredOrigin();
  try { return Boolean(origin && new URL(sender.url || "").origin === origin); } catch { return false; }
}

function senderIsExtension(sender) {
  return sender.id === chrome.runtime.id && String(sender.url || "").startsWith(`chrome-extension://${chrome.runtime.id}/`);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const respond = (work) => {
    Promise.resolve().then(work).then((result) => sendResponse({ ok: true, ...result })).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "同步助手操作失败", code: error?.code || "" }));
    return true;
  };
  if (message?.type === "MOEMAIL_ENSURE_APP_BRIDGE") return respond(ensureAppBridge);
  if (message?.type === "MOEMAIL_READ_APPLE_ALIASES") return respond(async () => ({ aliases: await readAppleAliases() }));
  if (!["MOEMAIL_UPDATE_APPLE_LABEL", "MOEMAIL_DEACTIVATE_APPLE_ALIAS", "MOEMAIL_CREATE_APPLE_ALIAS", "MOEMAIL_DELETE_DISABLED_APPLE_ALIASES"].includes(message?.type)) return;
  return respond(async () => {
    if (["MOEMAIL_UPDATE_APPLE_LABEL", "MOEMAIL_DEACTIVATE_APPLE_ALIAS"].includes(message.type)) {
      if (!await senderIsConfiguredApp(sender)) throw new Error("只允许从已连接的 MoeMail 页面发起 Apple 地址操作");
      if (message.type === "MOEMAIL_UPDATE_APPLE_LABEL") await updateAppleLabel(String(message.providerId || ""), message.label);
      else await deactivateAppleAlias(String(message.providerId || ""));
      return {};
    }
    if (!senderIsExtension(sender)) throw new Error("只允许从 MoeMail 同步助手发起 Apple 地址操作");
    if (message.type === "MOEMAIL_CREATE_APPLE_ALIAS") return createAppleAlias(message.label);
    return deleteDisabledAppleAliases();
  });
});

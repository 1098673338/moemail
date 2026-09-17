(() => {
  const bridgeVersion = 1;
  const bridgeStateKey = "__moemailIcloudBridge";
  const actions = new Map([
    ["MOEMAIL_UPDATE_APPLE_LABEL", "MOEMAIL_UPDATE_APPLE_LABEL_RESULT"],
    ["MOEMAIL_DEACTIVATE_APPLE_ALIAS", "MOEMAIL_DEACTIVATE_APPLE_ALIAS_RESULT"],
  ]);

  const previousBridge = window[bridgeStateKey];
  if (previousBridge?.handler) window.removeEventListener("message", previousBridge.handler);

  const postResult = (resultType, requestId, response) => {
    window.postMessage({
      type: resultType,
      requestId,
      bridgeVersion,
      ok: response?.ok === true,
      error: response?.error || null,
    }, "*");
  };

  const handler = (event) => {
    const resultType = actions.get(event.data?.type);
    if (event.source !== window || !resultType) return;
    const requestId = String(event.data.requestId || "");
    if (!requestId) return;
    try {
      if (typeof chrome === "undefined" || !chrome.runtime?.id || typeof chrome.runtime.sendMessage !== "function") {
        throw new Error("同步助手已更新，请刷新当前 MoeMail 页面后重试");
      }
      chrome.runtime.sendMessage({
        type: event.data.type,
        providerId: event.data.providerId,
        label: event.data.label,
      }, (response) => {
        const runtimeError = chrome.runtime.lastError;
        postResult(resultType, requestId, {
          ok: !runtimeError && response?.ok === true,
          error: runtimeError?.message || response?.error || null,
        });
      });
    } catch (error) {
      postResult(resultType, requestId, {
        ok: false,
        error: error instanceof Error ? error.message : "同步助手连接已失效，请刷新当前 MoeMail 页面后重试",
      });
    }
  };

  window[bridgeStateKey] = { version: bridgeVersion, handler };
  window.addEventListener("message", handler);
})();

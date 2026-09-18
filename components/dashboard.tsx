"use client";

import "./dashboard.css";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  AtSign,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Cloud,
  Copy,
  DatabaseX,
  ExternalLink,
  LoaderCircle,
  Mail,
  Menu,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { ICloudAccountDto, MailAddressDto, MailMessageDto } from "@/lib/types";
import { messageSummary } from "@/lib/message-content";

type View = "icloud" | "settings";
type AddressSortKey = "addedAt" | "receivedAt" | "tag";
type AddressSort = { key: AddressSortKey; direction: "asc" | "desc" };
type ContentFilter = "all" | "empty" | "filled";
type TagFilter = string;
type AddressTag = { name: string; color: string };
type TagEditorState = { addressId: string; top: number; left: number; trigger: HTMLButtonElement };
type IcloudSyncResponse = { imported: number; removed: number; synced: number; remaining?: number; automaticTagApplied?: number; primaryUnlinkedMessages?: number };
type IcloudSyncProgress = { accountId: string; completed: number; total: number; remaining: number };
type Modal = "edit_address" | "icloud" | "icloud_password" | null;
type Notice = { tone: "success" | "error"; text: string };
const ADDRESS_PAGE_SIZE = 20;
const DEFAULT_ADDRESS_SORT: AddressSort = { key: "receivedAt", direction: "desc" };
const ICLOUD_FAST_SYNC_INTERVAL = 2_000;
const ICLOUD_FAST_SYNC_DURATION = 2 * 60_000;
const ICLOUD_SYNC_INTERVAL = 5 * 60_000;
const DEFAULT_TAG_COLOR = "#475569";
const ICLOUD_BRIDGE_VERSION = 1;
const TAG_COLOR_OPTIONS = [
  "#475569", "#dc2626", "#eab308", "#00a63e", "#2563eb", "#db2777", "#111827",
];
const LEGACY_TAG_COLOR_ALIASES: Record<string, string> = {
  "#6b7280": "#475569", "#9f1239": "#dc2626", "#9a3412": "#eab308", "#ea580c": "#eab308",
  "#a16207": "#eab308", "#ca8a04": "#eab308", "#4d7c0f": "#00a63e", "#16a34a": "#00a63e", "#15803d": "#00a63e", "#0f766e": "#00a63e",
  "#0e7490": "#2563eb", "#4338ca": "#2563eb", "#6d28d9": "#db2777", "#7c3aed": "#db2777", "#a21caf": "#db2777",
};
type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  actionKey: string;
  action: () => Promise<void>;
  success: string;
  refresh?: boolean;
  closeOnStart?: boolean;
};

async function requestJson<T>(url: string, init?: RequestInit, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: init?.signal || controller.signal, cache: "no-store" });
    const body = await response.text();
    let data: (T & { error?: string }) | null = null;
    if (body.trim()) {
      try {
        data = JSON.parse(body) as T & { error?: string };
      } catch {
        // Cloudflare error documents are HTML. Keep their source out of the UI.
      }
    }
    if (!response.ok) throw new Error(data?.error || `请求失败（HTTP ${response.status}）`);
    if (!data) throw new Error(`接口返回了非 JSON 数据（HTTP ${response.status}）。请确认当前域名已更新到最新 Workers 后重试`);
    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(url.endsWith("/sync") ? "同步请求超时，请检查 iCloud 连接后重试" : "请求超时，请稍后重试");
    }
    if (error instanceof TypeError && /failed to fetch/i.test(error.message)) {
      throw new Error("无法连接云端接口，请检查网络后刷新页面重试");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function relativeTime(value: string | null) {
  if (!value) return "暂无";
  return formatDistanceToNow(new Date(value), { addSuffix: true, locale: zhCN });
}

const tableReceivedAtFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const tableAddedAtFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatTableReceivedAt(value: string) {
  return tableReceivedAtFormatter.format(new Date(value));
}

function formatTableAddedAt(value: string) {
  return tableAddedAtFormatter.format(new Date(value));
}

function dateInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("请选择有效的添加时间");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("请选择有效的添加时间");
  }
  return date.toISOString();
}

function parseCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return dateInputValue(date.toISOString()) === value ? date : null;
}

function calendarDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

const calendarMonthFormatter = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" });
const calendarDateFormatter = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

function addressRemark(address: MailAddressDto) {
  return address.type === "icloud_primary" ? "主号" : address.providerLabel;
}

function addressTag(address: MailAddressDto): AddressTag | null {
  const name = address.tags[0]?.trim();
  return name ? { name, color: address.tagColor || DEFAULT_TAG_COLOR } : null;
}

function canonicalTagColor(color?: string | null) {
  const normalized = color?.toLowerCase();
  if (!normalized) return DEFAULT_TAG_COLOR;
  return TAG_COLOR_OPTIONS.includes(normalized) ? normalized : LEGACY_TAG_COLOR_ALIASES[normalized] || DEFAULT_TAG_COLOR;
}

function tagStyle(color: string): CSSProperties {
  const tagColor = canonicalTagColor(color);
  return {
    "--tag-color": tagColor,
    "--tag-foreground": tagColor === "#eab308" ? "#1f2937" : "#fff",
  } as CSSProperties;
}

function restoreMessageAt(messages: MailMessageDto[], message: MailMessageDto, index: number) {
  if (messages.some((item) => item.id === message.id)) return messages;
  const restored = [...messages];
  restored.splice(Math.min(Math.max(index, 0), restored.length), 0, message);
  return restored;
}

function plainTextEmailHtml(value: string) {
  const escaped = value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
  return `<!doctype html><html><body><pre style="margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.75 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${escaped || "没有可显示的邮件正文。"}</pre></body></html>`;
}

function requestAppleLabelUpdate(address: MailAddressDto, label: string) {
  return new Promise<void>((resolve, reject) => {
    if (!address.providerId) {
      reject(new Error("这个 iCloud 地址缺少 Apple 标识，请先在插件中同步邮箱地址"));
      return;
    }
    const requestId = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(new Error("未检测到同步助手，请重新加载插件并刷新当前 MoeMail 页面"));
    }, 15_000);
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data?.type !== "MOEMAIL_UPDATE_APPLE_LABEL_RESULT" || event.data.requestId !== requestId || event.data.bridgeVersion !== ICLOUD_BRIDGE_VERSION) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
      if (event.data.ok) resolve();
      else reject(new Error(event.data.error || "Apple 标签更新失败"));
    };
    window.addEventListener("message", handleMessage);
    window.postMessage({
      type: "MOEMAIL_UPDATE_APPLE_LABEL",
      requestId,
      providerId: address.providerId,
      label,
    }, "*");
  });
}

function requestAppleAliasDeactivation(address: MailAddressDto) {
  return new Promise<void>((resolve, reject) => {
    if (!address.providerId) {
      reject(new Error("这个 iCloud 地址缺少 Apple 标识，请先在插件中同步邮箱地址"));
      return;
    }
    const requestId = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(new Error("未检测到同步助手，请重新加载插件并刷新当前 MoeMail 页面"));
    }, 30_000);
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data?.type !== "MOEMAIL_DEACTIVATE_APPLE_ALIAS_RESULT" || event.data.requestId !== requestId || event.data.bridgeVersion !== ICLOUD_BRIDGE_VERSION) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
      if (event.data.ok) resolve();
      else reject(new Error(event.data.error || "Apple 邮箱停用失败"));
    };
    window.addEventListener("message", handleMessage);
    window.postMessage({
      type: "MOEMAIL_DEACTIVATE_APPLE_ALIAS",
      requestId,
      providerId: address.providerId,
    }, "*");
  });
}

const otpContextPattern = /(?:验证码|校验码|动态码|安全码|登录码|确认码|授权码|一次性密码|临时密码|短信码|verification\s+code|security\s+code|one[-\s]?time\s+password|authentication\s+code|validation\s+code|temporary\s+code|access\s+code|security\s+token|login\s+code|passcode|verify|otp|\b(?:code|pin|token)\b)/giu;

function verificationCode(message: MailMessageDto) {
  if (message.verificationCodeIgnored) return null;
  const source = `${message.subject}\n${messageSummary(message)}`.normalize("NFKC");
  const contexts = Array.from(source.matchAll(otpContextPattern)).map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
  const candidates: Array<{ display: string; value: string; score: number; index: number }> = [];

  const addCandidate = (raw: string, index: number, grouped: boolean) => {
    const display = raw.replace(/\u00a0/g, " ").trim();
    const value = display.replace(/[\s-]/g, "");
    if (!/^\d{6}$/.test(value)) return;

    const end = index + raw.length;
    if (contexts.some((context) => index < context.end && end > context.start)) return;
    const nearestContext = contexts.reduce((distance, context) => {
      if (end < context.start) return Math.min(distance, context.start - end);
      if (index > context.end) return Math.min(distance, index - context.end);
      return 0;
    }, Number.POSITIVE_INFINITY);
    const hasContext = nearestContext <= 120;
    const score = (hasContext ? 1000 - nearestContext : 0)
      + 80
      + 40
      + (grouped ? 5 : 0);
    if (!candidates.some((candidate) => candidate.value === value && candidate.index === index)) {
      candidates.push({ display, value, score, index });
    }
  };

  for (const match of source.matchAll(/(?<![A-Za-z0-9#])(\d{1,3}(?:[\s-]+\d{1,3})+)(?![A-Za-z0-9])/g)) {
    addCandidate(match[1], match.index ?? 0, true);
  }
  for (const match of source.matchAll(/(?<![A-Za-z0-9#])\d{6}(?![A-Za-z0-9])/g)) {
    addCandidate(match[0], match.index ?? 0, false);
  }

  candidates.sort((left, right) => right.score - left.score || left.index - right.index);
  const best = candidates[0];
  return best ? { display: best.display, value: best.value } : null;
}

function messageMatchesAddress(message: MailMessageDto, address: MailAddressDto) {
  if (!message.addressIds.includes(address.id)) return false;
  return address.type !== "icloud_primary" || message.recipients.some((recipient) => recipient.trim().toLowerCase() === address.address.toLowerCase());
}

export function Dashboard() {
  const [view, setView] = useState<View>("icloud");
  const [addressSort, setAddressSort] = useState<AddressSort>({ ...DEFAULT_ADDRESS_SORT });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [credentialAccountId, setCredentialAccountId] = useState<string | null>(null);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<MailAddressDto[]>([]);
  const [messages, setMessages] = useState<MailMessageDto[]>([]);
  const [accounts, setAccounts] = useState<ICloudAccountDto[]>([]);
  const [drawerAddressId, setDrawerAddressId] = useState<string | null>(null);
  const [drawerMessages, setDrawerMessages] = useState<MailMessageDto[]>([]);
  const [drawerMessageId, setDrawerMessageId] = useState<string | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const drawerRequestRef = useRef(0);
  const drawerAddressIdRef = useRef<string | null>(null);
  const readRequestsRef = useRef<Set<string>>(new Set());
  const htmlRefreshRequestsRef = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pendingActions, setPendingActions] = useState<Set<string>>(() => new Set());
  const pendingActionsRef = useRef<Set<string>>(new Set());
  const accountsRef = useRef<ICloudAccountDto[]>([]);
  const dataRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const icloudSyncInFlightRef = useRef<Promise<IcloudSyncResponse[]> | null>(null);
  const icloudFastSyncUntilRef = useRef(0);
  const icloudSyncRequestIdRef = useRef(0);
  const backgroundSyncNoticeAtRef = useRef(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [icloudSyncProgress, setIcloudSyncProgress] = useState<IcloudSyncProgress | null>(null);

  const fetchData = useCallback(async () => {
    const [addressData, messageData, accountData] = await Promise.all([
      requestJson<{ addresses: MailAddressDto[] }>("/api/addresses"),
      requestJson<{ messages: MailMessageDto[] }>("/api/messages"),
      requestJson<{ accounts: ICloudAccountDto[] }>("/api/icloud/accounts"),
    ]);
    setAddresses(addressData.addresses);
    setMessages(messageData.messages);
    const activeDrawerAddressId = drawerAddressIdRef.current;
    if (activeDrawerAddressId) {
      const activeDrawerAddress = addressData.addresses.find((address) => address.id === activeDrawerAddressId);
      const nextDrawerMessages = messageData.messages.filter((message) => activeDrawerAddress ? messageMatchesAddress(message, activeDrawerAddress) : message.addressIds.includes(activeDrawerAddressId));
      setDrawerMessages(nextDrawerMessages.map((message) => readRequestsRef.current.has(message.id) ? { ...message, isRead: true } : message));
      setDrawerMessageId((current) => nextDrawerMessages.some((message) => message.id === current) ? current : nextDrawerMessages[0]?.id || null);
    }
    setAccounts(accountData.accounts);
  }, []);

  const refreshData = useCallback(async () => {
    if (dataRefreshInFlightRef.current) return dataRefreshInFlightRef.current;
    const request = fetchData().finally(() => {
      dataRefreshInFlightRef.current = null;
    });
    dataRefreshInFlightRef.current = request;
    return request;
  }, [fetchData]);

  useEffect(() => {
    const handleAliasSnapshot = (event: MessageEvent) => {
      if (event.source !== window || event.data?.type !== "MOEMAIL_ALIAS_SNAPSHOT_SYNCED" || event.data.bridgeVersion !== ICLOUD_BRIDGE_VERSION) return;
      void refreshData().then(() => {
        setNotice({ tone: "success", text: "iCloud 隐藏地址已同步，项目列表已更新" });
      }).catch((error) => {
        setNotice({ tone: "error", text: error instanceof Error ? error.message : "地址已同步，但项目列表刷新失败" });
      });
    };
    window.addEventListener("message", handleAliasSnapshot);
    return () => window.removeEventListener("message", handleAliasSnapshot);
  }, [refreshData]);

  const loadData = useCallback(async () => {
    try {
      await refreshData();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "加载失败" });
      throw error;
    } finally {
      setLoading(false);
    }
  }, [refreshData]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData().catch(() => undefined); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), notice.tone === "error" ? 6000 : 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const recordIcloudSyncProgress = useCallback((accountId: string, result: IcloudSyncResponse) => {
    const remaining = result.remaining || 0;
    if (remaining === 0) {
      setIcloudSyncProgress((current) => current?.accountId === accountId ? null : current);
      return;
    }
    setIcloudSyncProgress((current) => {
      const previous = current?.accountId === accountId ? current : null;
      const completed = (previous?.completed || 0) + result.synced;
      const total = Math.max(previous?.total || 0, completed + remaining);
      return { accountId, completed, total, remaining };
    });
  }, []);

  const openIcloudFastSyncWindow = useCallback(() => {
    icloudFastSyncUntilRef.current = Date.now() + ICLOUD_FAST_SYNC_DURATION;
  }, []);

  useEffect(() => {
    if (view === "icloud") openIcloudFastSyncWindow();
  }, [view, openIcloudFastSyncWindow]);

  const syncIcloudAccounts = useCallback(async (options: { reconcile?: boolean } = {}) => {
    while (icloudSyncInFlightRef.current) {
      const inFlight = icloudSyncInFlightRef.current;
      if (!options.reconcile) return inFlight;
      await inFlight;
    }
    // A failed IMAP login is persisted as sync_error by the API. It requires a
    // new App-specific password, so retrying it in the background only creates
    // repeated requests and repeated error toasts.
    const syncableAccounts = accountsRef.current.filter((account) => account.status === "active");
    if (syncableAccounts.length === 0) return null;

    const requestId = ++icloudSyncRequestIdRef.current;
    const request = (async () => {
      try {
        const results = await Promise.all(syncableAccounts.map(async (account) => {
          const result = await requestJson<IcloudSyncResponse>(
            `/api/icloud/accounts/${account.id}/sync${options.reconcile ? "?reconcile=1" : ""}`,
            { method: "POST" },
            75_000,
          );
          recordIcloudSyncProgress(account.id, result);
          return result;
        }));
        if (results.some((result) => result.imported > 0 || result.removed > 0 || result.primaryUnlinkedMessages || result.automaticTagApplied)) await refreshData();
        return results;
      } catch (error) {
        await refreshData().catch(() => undefined);
        throw error;
      } finally {
        if (icloudSyncRequestIdRef.current === requestId) icloudSyncInFlightRef.current = null;
      }
    })();
    icloudSyncInFlightRef.current = request;
    return request;
  }, [recordIcloudSyncProgress, refreshData]);

  const notifyBackgroundSyncError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : "自动同步失败，请稍后重试";
    if (/当前同步密钥解密/.test(message)) {
      setNotice({
        tone: "error",
        text: "已保存的 App 专用密码无法解密，自动同步已暂停。请在“账号设置”中更新 App 专用密码。",
      });
      return;
    }
    if (/\bauthentication failed\b|authenticationfailed|app 专用密码|用户名或 app/i.test(message)) {
      setNotice({
        tone: "error",
        text: "iCloud 身份验证失败，自动同步已暂停。请在“账号设置”中断开当前账号，再使用新的 Apple App 专用密码重新连接。",
      });
      return;
    }
    const now = Date.now();
    if (now - backgroundSyncNoticeAtRef.current < 15_000) return;
    backgroundSyncNoticeAtRef.current = now;
    setNotice({ tone: "error", text: message });
  }, []);

  useEffect(() => {
    if (view !== "icloud" && !icloudSyncProgress) return;
    let cancelled = false;
    let timer: number | null = null;

    const scheduleNext = () => {
      if (!cancelled && document.visibilityState === "visible") {
        const interval = Date.now() < icloudFastSyncUntilRef.current ? ICLOUD_FAST_SYNC_INTERVAL : ICLOUD_SYNC_INTERVAL;
        timer = window.setTimeout(tick, interval);
      }
    };
    const tick = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        await syncIcloudAccounts();
      } catch (error) {
        notifyBackgroundSyncError(error);
      } finally {
        scheduleNext();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
        return;
      }
      openIcloudFastSyncWindow();
      if (!icloudSyncInFlightRef.current && accountsRef.current.some((account) => account.status === "active")) void tick();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (document.visibilityState === "visible" && accountsRef.current.some((account) => account.status === "active")) {
      void tick();
    } else if (document.visibilityState === "visible") {
      scheduleNext();
    }
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [view, accounts.length, icloudSyncProgress, syncIcloudAccounts, notifyBackgroundSyncError, openIcloudFastSyncWindow]);

  const drawerAddress = addresses.find((address) => address.id === drawerAddressId) || null;
  const editingAddress = addresses.find((address) => address.id === editingAddressId) || null;
  const drawerMessage = drawerMessages.find((message) => message.id === drawerMessageId) || drawerMessages[0] || null;
  const isPending = (key: string) => pendingActions.has(key);

  const runAction = async (key: string, action: () => Promise<void | string>, success: string, refresh = true) => {
    if (pendingActionsRef.current.has(key)) return false;
    pendingActionsRef.current.add(key);
    setPendingActions(new Set(pendingActionsRef.current));
    try {
      const actionNotice = await action();
      if (refresh) await loadData();
      setNotice({ tone: "success", text: actionNotice || success });
      return true;
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "操作失败" });
      return false;
    } finally {
      pendingActionsRef.current.delete(key);
      setPendingActions(new Set(pendingActionsRef.current));
    }
  };

  const markMessageRead = async (message: MailMessageDto) => {
    if (!message.isRead && !readRequestsRef.current.has(message.id)) {
      readRequestsRef.current.add(message.id);
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, isRead: true } : item));
      setDrawerMessages((current) => current.map((item) => item.id === message.id ? { ...item, isRead: true } : item));
      try {
        await requestJson(`/api/messages/${message.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ isRead: true }),
        });
      } catch (error) {
        setMessages((current) => current.map((item) => item.id === message.id ? { ...item, isRead: false } : item));
        setDrawerMessages((current) => current.map((item) => item.id === message.id ? { ...item, isRead: false } : item));
        setNotice({ tone: "error", text: error instanceof Error ? error.message : "邮件未能标记为已读" });
      } finally {
        readRequestsRef.current.delete(message.id);
      }
    }
  };

  const dismissVerificationCode = async (message: MailMessageDto) => {
    if (message.verificationCodeIgnored) return;
    const update = (items: MailMessageDto[], ignored: boolean) => items.map((item) => item.id === message.id ? { ...item, verificationCodeIgnored: ignored } : item);
    setMessages((current) => update(current, true));
    setDrawerMessages((current) => update(current, true));
    try {
      await requestJson(`/api/messages/${message.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verificationCodeIgnored: true }),
      });
    } catch (error) {
      setMessages((current) => update(current, false));
      setDrawerMessages((current) => update(current, false));
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "无法移除验证码模块" });
    }
  };

  const refreshMessageHtml = async (message: MailMessageDto) => {
    if (!needsSourceHtmlRepair(message.htmlBody) || htmlRefreshRequestsRef.current.has(message.id)) return;
    htmlRefreshRequestsRef.current.add(message.id);
    try {
      const { content } = await requestJson<{ content: Pick<MailMessageDto, "textBody" | "htmlBody"> }>(`/api/messages/${message.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshHtml: true }),
      }, 75_000);
      const update = (items: MailMessageDto[]) => items.map((item) => item.id === message.id ? { ...item, ...content } : item);
      setMessages(update);
      setDrawerMessages(update);
    } catch {
      // Keep the locally stored body visible if iCloud is temporarily unavailable.
    }
  };

  const openAddressMail = async (address: MailAddressDto) => {
    const requestId = ++drawerRequestRef.current;
    const cachedMessages = messages.filter((message) => messageMatchesAddress(message, address));
    drawerAddressIdRef.current = address.id;
    setDrawerAddressId(address.id);
    setDrawerMessages(cachedMessages.map((message) => readRequestsRef.current.has(message.id) ? { ...message, isRead: true } : message));
    setDrawerMessageId(cachedMessages[0]?.id || null);
    setDrawerLoading(true);
    if (cachedMessages[0]) {
      void markMessageRead(cachedMessages[0]);
      void refreshMessageHtml(cachedMessages[0]);
    }
    try {
      const data = await requestJson<{ messages: MailMessageDto[] }>(`/api/messages?addressId=${encodeURIComponent(address.id)}`);
      if (drawerRequestRef.current !== requestId) return;
      setDrawerMessages((current) => data.messages.map((message) => {
        const refreshed = current.find((item) => item.id === message.id);
        const hasRepairedHtml = refreshed?.htmlBody && /<(?:html|head|body)\b/i.test(refreshed.htmlBody);
        const incomingHasRepairedHtml = message.htmlBody && /<(?:html|head|body)\b/i.test(message.htmlBody);
        const body = hasRepairedHtml && !incomingHasRepairedHtml
          ? { textBody: refreshed.textBody, htmlBody: refreshed.htmlBody }
          : {};
        return { ...message, ...body, ...(readRequestsRef.current.has(message.id) ? { isRead: true } : {}) };
      }));
      setDrawerMessageId((current) => data.messages.some((message) => message.id === current) ? current : data.messages[0]?.id || null);
      if (data.messages[0] && !cachedMessages.some((message) => message.id === data.messages[0].id)) {
        void markMessageRead(data.messages[0]);
        void refreshMessageHtml(data.messages[0]);
      }
    } catch (error) {
      if (drawerRequestRef.current === requestId) setNotice({ tone: "error", text: error instanceof Error ? error.message : "历史邮件加载失败" });
    } finally {
      if (drawerRequestRef.current === requestId) setDrawerLoading(false);
    }
  };

  const closeMailDrawer = () => {
    drawerRequestRef.current += 1;
    drawerAddressIdRef.current = null;
    setDrawerAddressId(null);
    setDrawerMessages([]);
    setDrawerMessageId(null);
    setDrawerLoading(false);
  };

  const confirmDeleteMessage = (message: MailMessageDto) => {
    const deletedIndex = drawerMessages.findIndex((item) => item.id === message.id);
    const globalIndex = messages.findIndex((item) => item.id === message.id);
    const wasInGlobalList = globalIndex >= 0;
    const remainingMessages = drawerMessages.filter((item) => item.id !== message.id);
    const nextMessage = remainingMessages[Math.min(Math.max(deletedIndex, 0), remainingMessages.length - 1)] || null;
    const wasSelected = drawerMessageId === message.id;
    const deletesFromApple = message.source === "icloud";
    setConfirmation({
      title: "删除邮件",
      description: deletesFromApple
        ? "邮件将移入 iCloud 废纸篓，并从当前设备移除。"
        : "邮件将从当前设备删除，且无法撤销。",
      confirmLabel: "删除邮件",
      actionKey: `message:delete:${message.id}`,
      action: async () => {
        setMessages((current) => current.filter((item) => item.id !== message.id));
        setDrawerMessages((current) => current.filter((item) => item.id !== message.id));
        setDrawerMessageId((current) => current === message.id ? nextMessage?.id || null : current);
        if (drawerMessageId === message.id && nextMessage) await markMessageRead(nextMessage);
        try {
          await requestJson(`/api/messages/${message.id}`, { method: "DELETE" }, 75_000);
        } catch (error) {
          if (wasInGlobalList) setMessages((current) => restoreMessageAt(current, message, globalIndex));
          if (drawerAddressIdRef.current && message.addressIds.includes(drawerAddressIdRef.current)) {
            setDrawerMessages((current) => restoreMessageAt(current, message, deletedIndex));
            if (wasSelected) {
              setDrawerMessageId((current) => current === null ? message.id : current);
            }
          }
          throw error;
        }
      },
      success: deletesFromApple ? "邮件已从 Apple 邮箱和当前设备删除" : "邮件已从当前设备删除",
      refresh: false,
      closeOnStart: true,
    });
  };

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><AtSign size={21} /></div>
          <div><strong>MAILBOX</strong></div>
          <button className="mobile-nav-toggle" type="button" aria-label={mobileNavOpen ? "关闭导航" : "打开导航"} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((current) => !current)}>
            {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        <nav className="main-nav">
          <button className={view === "icloud" ? "active" : ""} onClick={() => { setView("icloud"); setMobileNavOpen(false); }}>
            <Cloud size={19} /><span>iCloud 邮箱</span><em>{addresses.length}</em>
          </button>
          <button className={view === "settings" ? "active" : ""} onClick={() => { setView("settings"); setMobileNavOpen(false); }}>
            <Settings size={19} /><span>账号设置</span>
          </button>
        </nav>
      </aside>

      <section className="main-area">
        {loading ? <LoadingState /> : view === "icloud" ? (
          <AddressView
            addresses={addresses}
            messages={messages}
            sort={addressSort}
            onSortChange={setAddressSort}
            canManualSync={accounts.some((account) => account.status === "active")}
            manualSyncing={isPending("icloud:manual-sync")}
            onManualSync={() => void runAction("icloud:manual-sync", async () => {
              openIcloudFastSyncWindow();
              const results = await syncIcloudAccounts({ reconcile: true });
              if (!results?.length) return "没有可同步的 iCloud 账号";
              const imported = results.reduce((total, result) => total + result.imported, 0);
              const removed = results.reduce((total, result) => total + result.removed, 0);
              const primaryUnlinked = results.reduce((total, result) => total + (result.primaryUnlinkedMessages || 0), 0);
              const remaining = results.reduce((total, result) => total + (result.remaining || 0), 0);
              if (remaining) return `本次已同步邮件，新增 ${imported} 封；剩余 ${remaining} 封将继续同步`;
              return imported || removed || primaryUnlinked
                ? `邮件同步完成：新增 ${imported} 封，移除 ${removed} 封远端已删除邮件${primaryUnlinked ? `；已从主号移除 ${primaryUnlinked} 封隐藏地址邮件` : ""}`
                : "邮件已同步，暂无变化";
            }, "邮件同步完成")}
            onOpen={openAddressMail}
            onMarkRead={markMessageRead}
            onEdit={(address) => { setEditingAddressId(address.id); setModal("edit_address"); }}
            onDelete={(address) => {
              setConfirmation({
                title: "停用 iCloud 邮箱",
                description: `${address.address} 将在 Apple 停用，并清空当前项目中这个邮箱的资料和邮件。此操作无法撤销。`,
                confirmLabel: "停用并删除",
                actionKey: `address:delete:${address.id}`,
                action: async () => {
                  await requestAppleAliasDeactivation(address);
                  await requestJson(`/api/addresses/${address.id}/apple-deactivated`, { method: "POST" });
                },
                success: "iCloud 邮箱已在 Apple 停用，本地数据已清空",
              });
            }}
            onUpdateTag={(address, tag) => runAction(`address:tag:${address.id}`, async () => {
              await requestJson(`/api/addresses/${address.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ tags: tag ? [tag.name] : [], tagColor: tag?.color || null }),
              });
            }, tag ? `标签“${tag.name}”的颜色已更新` : "标签已清除")}
            onCopyAddress={async (value) => {
              try {
                await navigator.clipboard.writeText(value);
                setNotice({ tone: "success", text: "邮箱地址已复制" });
              } catch {
                setNotice({ tone: "error", text: "无法复制邮箱地址，请检查浏览器权限" });
              }
            }}
            onCopyRemark={async (value) => {
              try {
                await navigator.clipboard.writeText(value);
                setNotice({ tone: "success", text: "备注已复制" });
              } catch {
                setNotice({ tone: "error", text: "无法复制备注，请检查浏览器权限" });
              }
            }}
            onCopyPhone={async (value) => {
              try {
                await navigator.clipboard.writeText(value);
                setNotice({ tone: "success", text: "手机号已复制" });
              } catch {
                setNotice({ tone: "error", text: "无法复制手机号，请检查浏览器权限" });
              }
            }}
            onCopyCode={async (value) => {
              try {
                await navigator.clipboard.writeText(value);
                setNotice({ tone: "success", text: "验证码已复制" });
              } catch {
                setNotice({ tone: "error", text: "无法复制验证码，请检查浏览器权限" });
              }
            }}
          />
        ) : (
          <SettingsView
            accounts={accounts}
            syncProgress={icloudSyncProgress}
            onConnectIcloud={() => setModal("icloud")}
            onUpdateCredentials={(account) => { setCredentialAccountId(account.id); setModal("icloud_password"); }}
            onClearAliases={(account) => setConfirmation({
              title: "清空所有 iCloud 邮箱",
              description: "将删除当前项目中的全部 iCloud 隐藏邮箱，只保留主邮箱。邮件会保留，之后可以重新同步地址。",
              confirmLabel: "清空所有邮箱",
              actionKey: `icloud:clear:${account.id}`,
              action: async () => {
                await requestJson(`/api/icloud/accounts/${account.id}/aliases`, { method: "DELETE" });
              },
              success: "iCloud 邮箱地址已清空，仅保留主邮箱",
            })}
            onClearAliasData={(account) => setConfirmation({
              title: "清空所有 iCloud 邮箱数据",
              description: "将永久删除当前项目中的全部 iCloud 隐藏邮箱及其添加时间、标签、备注、手机号、链接和操作记录。主邮箱连接、邮件和 Apple 端数据会保留；重新同步只能恢复 Apple 地址，手动填写的资料无法恢复。",
              confirmLabel: "清空所有数据",
              actionKey: `icloud:clear-data:${account.id}`,
              action: async () => {
                await requestJson(`/api/icloud/accounts/${account.id}/aliases/data`, { method: "DELETE" });
              },
              success: "该账号的隐藏邮箱及全部手填数据已永久清空",
            })}
            onDisconnect={(account) => setConfirmation({
              title: "断开 iCloud 连接",
              description: "将删除当前设备上的连接凭据和 iCloud 主邮箱记录。隐藏邮箱会保留，但不再关联此账号。",
              confirmLabel: "断开连接",
              actionKey: `icloud:disconnect:${account.id}`,
              action: async () => {
                await requestJson(`/api/icloud/accounts/${account.id}`, { method: "DELETE" });
              },
              success: "iCloud 连接已断开",
            })}
            isPending={isPending}
          />
        )}
      </section>

      {notice && (
        <div className={`toast ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"} aria-live="polite">
          {notice.tone === "success" ? <Check size={17} /> : <CircleAlert size={17} />}
          <span>{notice.text}</span>
        </div>
      )}

      {modal && (
        <ModalShell
          title={{ edit_address: "编辑邮箱", icloud: "连接 iCloud", icloud_password: "更新 App 专用密码" }[modal]}
          subtitle={modal === "edit_address" ? editingAddress?.address : undefined}
          onClose={() => { setModal(null); setEditingAddressId(null); setCredentialAccountId(null); }}
        >
          {modal === "edit_address" && editingAddress && <EditAddressForm address={editingAddress} onDone={() => { setModal(null); setEditingAddressId(null); }} onSave={async (input) => {
            const isHiddenAddress = editingAddress.type === "icloud_hide";
            if (isHiddenAddress && input.remark !== (editingAddress.providerLabel || "")) await requestAppleLabelUpdate(editingAddress, input.remark);
            await requestJson(`/api/addresses/${editingAddress.id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                addedAt: input.addedAt,
                phoneNumber: input.phoneNumber,
                phoneUrl: input.phoneUrl,
                ...(isHiddenAddress ? { providerLabel: input.remark } : {}),
              }),
            });
            await loadData();
            setNotice({ tone: "success", text: "邮箱资料已保存" });
          }} />}
          {modal === "icloud" && <IcloudForm onDone={() => { setModal(null); void loadData().catch(() => undefined); }} setNotice={setNotice} />}
          {modal === "icloud_password" && credentialAccountId && <IcloudPasswordForm account={accounts.find((account) => account.id === credentialAccountId) || null} onDone={() => { setModal(null); setCredentialAccountId(null); void loadData().catch(() => undefined); }} setNotice={setNotice} />}
        </ModalShell>
      )}
      {confirmation && (
        <ConfirmDialog
          confirmation={confirmation}
          pending={isPending(confirmation.actionKey)}
          onCancel={() => setConfirmation(null)}
          onConfirm={async () => {
            const activeConfirmation = confirmation;
            if (activeConfirmation.closeOnStart) setConfirmation(null);
            const completed = await runAction(activeConfirmation.actionKey, activeConfirmation.action, activeConfirmation.success, activeConfirmation.refresh !== false);
            if (completed) setConfirmation(null);
          }}
        />
      )}
      {drawerAddress && (
        <MailDrawer
          address={drawerAddress}
          messages={drawerMessages}
          message={drawerMessage}
          loading={drawerLoading}
          onSelectMessage={(message) => { setDrawerMessageId(message.id); void markMessageRead(message); void refreshMessageHtml(message); }}
          onDeleteMessage={confirmDeleteMessage}
          onClose={closeMailDrawer}
          onDismissVerificationCode={dismissVerificationCode}
          onCopyCode={async (value) => {
            try {
              await navigator.clipboard.writeText(value);
              setNotice({ tone: "success", text: "验证码已复制" });
            } catch {
              setNotice({ tone: "error", text: "无法复制验证码，请检查浏览器权限" });
            }
          }}
        />
      )}
    </main>
  );
}

function LoadingState() {
  return <div className="loading-state" role="status"><LoaderCircle className="spin" size={28} /><span>正在加载邮箱数据…</span></div>;
}

function AddressView(props: {
  addresses: MailAddressDto[];
  messages: MailMessageDto[];
  sort: AddressSort;
  onSortChange: (sort: AddressSort) => void;
  canManualSync: boolean;
  manualSyncing: boolean;
  onManualSync: () => void;
  onOpen: (address: MailAddressDto) => void;
  onMarkRead: (message: MailMessageDto) => Promise<void>;
  onEdit: (address: MailAddressDto) => void;
  onDelete: (address: MailAddressDto) => void;
  onUpdateTag: (address: MailAddressDto, tag: AddressTag | null) => Promise<boolean>;
  onCopyAddress: (value: string) => Promise<void>;
  onCopyRemark: (value: string) => Promise<void>;
  onCopyPhone: (value: string) => Promise<void>;
  onCopyCode: (value: string) => Promise<void>;
}) {
  const sort = props.sort;
  const [contentFilter, setContentFilter] = useState<ContentFilter>("all");
  const [filledAtEmptyFilterStart, setFilledAtEmptyFilterStart] = useState<Set<string> | null>(null);
  const [tagFilter, setTagFilter] = useState<TagFilter>("all");
  const [addressQuery, setAddressQuery] = useState("");
  const [page, setPage] = useState(1);
  const [tagEditor, setTagEditor] = useState<TagEditorState | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const visibleAddresses = props.addresses;
  const existingTags = Array.from(props.addresses.reduce((tags, address) => {
    const tag = addressTag(address);
    if (tag && !tags.has(tag.name)) tags.set(tag.name, tag);
    return tags;
  }, new Map<string, AddressTag>()).values()).sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true, sensitivity: "base" }));
  const availableTags = Array.from(new Set(visibleAddresses.map((address) => addressTag(address)?.name).filter((tag): tag is string => Boolean(tag))))
    .sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" }));
  const activeTagFilter = tagFilter === "all" || tagFilter === "untagged" || availableTags.includes(tagFilter) ? tagFilter : "all";
  const latestMessage = (address: MailAddressDto) => props.messages
    .filter((message) => messageMatchesAddress(message, address))
    .reduce<MailMessageDto | null>((latest, message) => !latest || Date.parse(message.receivedAt) > Date.parse(latest.receivedAt) ? message : latest, null);
  const rows = visibleAddresses.map((address) => ({ address, message: latestMessage(address) }));
  const tagValue = (address: MailAddressDto) => addressTag(address)?.name || "";
  const resetTableScroll = () => tableScrollRef.current?.scrollTo({ top: 0 });
  const closeTagEditor = (restoreFocus = false) => {
    if (restoreFocus) tagEditor?.trigger.focus();
    setTagEditor(null);
  };
  const openTagEditor = (event: MouseEvent<HTMLButtonElement>, address: MailAddressDto) => {
    event.stopPropagation();
    if (tagEditor?.addressId === address.id) {
      closeTagEditor();
      return;
    }
    const trigger = event.currentTarget;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 272;
    const menuHeight = existingTags.length > 0 ? 340 : 244;
    const gutter = 8;
    const left = Math.min(Math.max(gutter, rect.left), window.innerWidth - menuWidth - gutter);
    const top = rect.bottom + 6 + menuHeight <= window.innerHeight - gutter
      ? rect.bottom + 6
      : Math.max(gutter, rect.top - menuHeight - 6);
    setTagEditor({ addressId: address.id, top, left, trigger });
  };
  const updateAddressQuery = (value: string) => {
    setAddressQuery(value);
    setPage(1);
    resetTableScroll();
  };
  const sortRows = (key: AddressSortKey) => {
    setPage(1);
    resetTableScroll();
    props.onSortChange(sort.key === key
      ? { key, direction: sort.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "tag" ? "asc" : "desc" });
  };
  rows.sort((left, right) => {
    let comparison = 0;
    if (sort.key === "tag") {
      const leftTag = tagValue(left.address);
      const rightTag = tagValue(right.address);
      if (!leftTag && rightTag) return 1;
      if (leftTag && !rightTag) return -1;
      comparison = leftTag.localeCompare(rightTag, "zh-CN", { numeric: true, sensitivity: "base" });
    } else if (sort.key === "receivedAt") {
      const leftDate = left.message?.receivedAt;
      const rightDate = right.message?.receivedAt;
      if (!leftDate && rightDate) return 1;
      if (leftDate && !rightDate) return -1;
      comparison = (leftDate ? Date.parse(leftDate) : 0) - (rightDate ? Date.parse(rightDate) : 0);
    } else {
      const leftDate = left.address.addedAt;
      const rightDate = right.address.addedAt;
      if (!leftDate && rightDate) return 1;
      if (leftDate && !rightDate) return -1;
      comparison = (leftDate ? Date.parse(leftDate) : 0) - (rightDate ? Date.parse(rightDate) : 0);
      if (comparison === 0) {
        comparison = Date.parse(left.address.createdAt) - Date.parse(right.address.createdAt);
      }
    }
    return sort.direction === "asc" ? comparison : -comparison;
  });
  const normalizedQuery = addressQuery.trim().toLowerCase();
  const searchedRows = normalizedQuery
    ? rows.filter((row) => row.address.address.toLowerCase().includes(normalizedQuery)
      || (addressRemark(row.address) || "").toLowerCase().includes(normalizedQuery))
    : rows;
  const filterOptions: Array<{ value: ContentFilter; label: string }> = [
    { value: "all", label: "全部" },
    { value: "empty", label: "无内容" },
    { value: "filled", label: "有内容" },
  ];
  const filteredRows = searchedRows.filter((row) => {
    const matchesContent = contentFilter === "all"
      || (contentFilter === "filled"
        ? row.message !== null
        : filledAtEmptyFilterStart
          ? !filledAtEmptyFilterStart.has(row.address.id)
          : row.message === null);
    const rowTag = tagValue(row.address);
    const matchesTag = activeTagFilter === "all" || (activeTagFilter === "untagged" ? rowTag === "" : rowTag === activeTagFilter);
    return matchesContent && matchesTag;
  });
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ADDRESS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStartIndex = (currentPage - 1) * ADDRESS_PAGE_SIZE;
  const pagedRows = filteredRows.slice(pageStartIndex, pageStartIndex + ADDRESS_PAGE_SIZE);
  const pageStart = filteredRows.length === 0 ? 0 : pageStartIndex + 1;
  const pageEnd = Math.min(pageStartIndex + ADDRESS_PAGE_SIZE, filteredRows.length);
  const changePage = (nextPage: number) => {
    setPage(nextPage);
    resetTableScroll();
  };
  const sortIndicator = (key: AddressSortKey) => sort.key !== key
    ? <ArrowUpDown className="sort-idle" size={13} aria-hidden="true" />
    : sort.direction === "asc"
      ? <ArrowUp size={13} aria-hidden="true" />
      : <ArrowDown size={13} aria-hidden="true" />;
  const sortAria = (key: AddressSortKey) => sort.key === key ? sort.direction === "asc" ? "升序" : "降序" : "未排序";

  return (
    <section className="address-table-section">
      <div className="address-table-toolbar">
        {(props.canManualSync || visibleAddresses.length > 0) && <div className="table-toolbar-controls">
          {props.canManualSync && <button className="button secondary compact manual-mail-sync" type="button" disabled={props.manualSyncing} onClick={props.onManualSync}>
            {props.manualSyncing ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
            {props.manualSyncing ? "正在同步…" : "手动同步邮件"}
          </button>}
          {visibleAddresses.length > 0 && <>
          <div className="content-filter" role="group" aria-label="按邮件内容筛选">
            {filterOptions.map((option) => <button key={option.value} type="button" aria-pressed={contentFilter === option.value} className={contentFilter === option.value ? "active" : ""} onClick={() => {
              setFilledAtEmptyFilterStart(option.value === "empty"
                ? new Set(rows.filter((row) => row.message !== null).map((row) => row.address.id))
                : null);
              setContentFilter(option.value);
              setPage(1);
              resetTableScroll();
            }}>{option.label}</button>)}
          </div>
          <div className="tag-filter">
            <select aria-label="按标签筛选" value={activeTagFilter} onChange={(event) => {
              setTagFilter(event.target.value as TagFilter);
              setPage(1);
              resetTableScroll();
            }}>
              <option value="all">全部标签</option>
              {availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              <option value="untagged">无标签</option>
            </select>
          </div>
          <div className="address-search">
            <Search size={15} aria-hidden="true" />
            <label className="sr-only" htmlFor="address-search-input">搜索邮箱地址或备注</label>
            <input id="address-search-input" type="search" value={addressQuery} placeholder="搜索" autoComplete="off" onChange={(event) => updateAddressQuery(event.target.value)} />
            {addressQuery && <button type="button" aria-label="清除邮箱地址或备注搜索" onClick={() => updateAddressQuery("")}><X size={14} aria-hidden="true" /></button>}
          </div>
          </>}
        </div>}
      </div>
      {visibleAddresses.length === 0 ? (
        <div className="address-table-panel panel">
          <EmptyState compact title="还没有 iCloud 邮箱" description="连接 iCloud 并同步地址后，会在这里显示地址资料和最近一封邮件。" />
        </div>
      ) : (
        <div className="address-table-panel panel">
            {filteredRows.length === 0 ? (
              <EmptyState
                compact
                title={normalizedQuery && searchedRows.length === 0 ? "没有匹配的邮箱地址或备注" : "没有符合条件的邮箱"}
                description={normalizedQuery && searchedRows.length === 0 ? "尝试输入其他邮箱地址或备注，或清除搜索条件。" : "调整标签或内容筛选条件查看邮箱地址。"}
              />
            ) : <>
            <div ref={tableScrollRef} className="address-table-scroll">
              <table className="address-table">
            <thead><tr>
              <th aria-sort={sort.key === "addedAt" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" className="table-sort" aria-label={`按添加时间${sortAria("addedAt")}`} onClick={() => sortRows("addedAt")}>邮箱地址 {sortIndicator("addedAt")}</button></th>
              <th>备注</th>
              <th aria-sort={sort.key === "tag" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" className="table-sort" aria-label={`按标签${sortAria("tag")}`} onClick={() => sortRows("tag")}>标签 {sortIndicator("tag")}</button></th>
              <th>手机号</th>
              <th>邮件摘要</th>
              <th aria-sort={sort.key === "receivedAt" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" className="table-sort" aria-label={`按邮件时间${sortAria("receivedAt")}`} onClick={() => sortRows("receivedAt")}>邮件时间 {sortIndicator("receivedAt")}</button></th>
              <th>操作</th>
            </tr></thead>
            <tbody>
              {pagedRows.map(({ address, message }) => {
                const code = message ? verificationCode(message) : null;
                const accountTag = addressTag(address);
                const remark = addressRemark(address);
                const unread = Boolean(message && !message.isRead);
                return (
                  <tr key={address.id} className={unread ? "unread" : undefined} tabIndex={0} onClickCapture={() => {
                    if (message) void props.onMarkRead(message);
                  }} onClick={() => props.onOpen(address)} onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      if (message) void props.onMarkRead(message);
                      props.onOpen(address);
                    }
                  }}>
                    <td className="address-value">
                      <div className="address-cell-content">
                        <span className="address-cell-text" title={address.address}>{address.address}</span>
                        {address.addedAt && <span className="address-added-time">{formatTableAddedAt(address.addedAt)}</span>}
                        <button type="button" className="icon-button address-table-action table-copy-button address-cell-copy" title="复制邮箱地址" aria-label={`复制邮箱地址 ${address.address}`} onClick={(event) => { event.stopPropagation(); void props.onCopyAddress(address.address); }} onKeyDown={(event) => event.stopPropagation()}><Copy size={14} aria-hidden="true" /></button>
                      </div>
                    </td>
                    <td className="remark-value" title={remark || undefined}>
                      <div className="remark-cell-content">
                        <span>{remark || "-"}</span>
                        {remark && <button type="button" className="icon-button address-table-action table-copy-button" title="复制备注" aria-label={`复制 ${address.address} 的备注`} onClick={(event) => { event.stopPropagation(); void props.onCopyRemark(remark); }} onKeyDown={(event) => event.stopPropagation()}><Copy size={14} aria-hidden="true" /></button>}
                      </div>
                    </td>
                    <td className="account-tag-cell">
                      <button
                        type="button"
                        className={`account-tag-trigger${accountTag ? " account-tag" : " account-tag-empty"}`}
                        style={accountTag ? tagStyle(accountTag.color) : undefined}
                        aria-label={`${accountTag ? "修改" : "添加"} ${address.address} 的标签`}
                        aria-haspopup="menu"
                        aria-expanded={tagEditor?.addressId === address.id}
                        onClick={(event) => openTagEditor(event, address)}
                        onKeyDown={(event) => event.stopPropagation()}
                      >{accountTag?.name || "添加标签"}</button>
                    </td>
                    <td className="phone-value-cell">
                      <div className="phone-value-content">
                        <span title={address.phoneNumber || undefined}>{address.phoneNumber || "-"}</span>
                        {(address.phoneUrl || address.phoneNumber) && <div className="phone-actions">
                          {address.phoneUrl && <a
                            className="icon-button address-table-action phone-link-button"
                            href={address.phoneUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="打开手机号链接"
                            aria-label={`在新标签页打开 ${address.address} 的手机号链接`}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          ><ExternalLink size={14} aria-hidden="true" /></a>}
                          {address.phoneNumber && <button
                            type="button"
                            className="icon-button address-table-action table-copy-button"
                            title="复制手机号"
                            aria-label={`复制 ${address.address} 的手机号`}
                            onClick={(event) => { event.stopPropagation(); void props.onCopyPhone(address.phoneNumber!); }}
                            onKeyDown={(event) => event.stopPropagation()}
                          ><Copy size={14} aria-hidden="true" /></button>}
                        </div>}
                      </div>
                    </td>
                    <td className="mail-summary-cell">
                      {message ? code ? <div className="verification-inline"><strong>{code.display}</strong><button className="button outline compact" type="button" aria-label={`复制验证码 ${code.display}`} onClick={(event) => { event.stopPropagation(); void props.onCopyCode(code.value); }}><Copy size={14} />复制</button></div> : <span title={`${message.subject} · ${messageSummary(message)}`}>{messageSummary(message)}</span> : "-"}
                    </td>
                    <td className="time-value">{message ? formatTableReceivedAt(message.receivedAt) : "-"}</td>
                    <td className={`address-actions-cell${address.type === "icloud_primary" ? " primary-only" : ""}`}>
                      <button type="button" className="icon-button address-table-action" title="编辑邮箱资料" aria-label={`编辑 ${address.address} 的邮箱资料`} onClick={(event) => { event.stopPropagation(); props.onEdit(address); }} onKeyDown={(event) => event.stopPropagation()}><PencilLine size={14} aria-hidden="true" /></button>
                      {address.type === "icloud_hide" && <button type="button" className="icon-button address-table-action address-delete-button" title="删除邮箱" aria-label={`删除邮箱 ${address.address}`} onClick={(event) => { event.stopPropagation(); props.onDelete(address); }} onKeyDown={(event) => event.stopPropagation()}><Trash2 size={14} aria-hidden="true" /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
              </table>
            </div>
            <div className="table-pagination">
              <span>第 {pageStart}–{pageEnd} 条，共 {filteredRows.length} 条</span>
              <div className="pagination-controls">
                <button type="button" aria-label="上一页" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}><ChevronLeft size={16} aria-hidden="true" /></button>
                <span>第 {currentPage} / {totalPages} 页</span>
                <button type="button" aria-label="下一页" disabled={currentPage === totalPages} onClick={() => changePage(currentPage + 1)}><ChevronRight size={16} aria-hidden="true" /></button>
              </div>
            </div>
            </>}
        </div>
      )}
      {tagEditor && (() => {
        const address = props.addresses.find((item) => item.id === tagEditor.addressId);
        if (!address) return null;
        const currentTag = addressTag(address);
        return <TagEditor
          address={address}
          currentTag={currentTag}
          existingTags={existingTags}
          position={{ top: tagEditor.top, left: tagEditor.left }}
          trigger={tagEditor.trigger}
          onClose={(restoreFocus) => closeTagEditor(restoreFocus)}
          onSave={async (tag) => {
            if (tag?.name === currentTag?.name && tag?.color === currentTag?.color) {
              closeTagEditor(true);
              return;
            }
            const saved = await props.onUpdateTag(address, tag);
            if (saved) closeTagEditor(true);
          }}
        />;
      })()}
    </section>
  );
}

function TagColorPicker({ value, disabled = false, onChange }: { value: string; disabled?: boolean; onChange: (color: string) => void }) {
  return <fieldset className="account-tag-colors" disabled={disabled}>
    <legend>标签颜色</legend>
    <div>{TAG_COLOR_OPTIONS.map((option) => <button key={option} type="button" aria-label={`选择颜色 ${option}`} aria-pressed={value.toLowerCase() === option} className={value.toLowerCase() === option ? "active" : ""} style={{ color: option === "#eab308" ? "#1f2937" : "#fff", backgroundColor: option }} onClick={() => onChange(option)}>{value.toLowerCase() === option && <Check size={13} aria-hidden="true" />}</button>)}</div>
  </fieldset>;
}

function TagEditor({ address, currentTag, existingTags, position, trigger, onClose, onSave }: {
  address: MailAddressDto;
  currentTag: AddressTag | null;
  existingTags: AddressTag[];
  position: { top: number; left: number };
  trigger: HTMLButtonElement;
  onClose: (restoreFocus?: boolean) => void;
  onSave: (tag: AddressTag | null) => Promise<void>;
}) {
  const editorRef = useRef<HTMLFormElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentTag?.name || "");
  const [color, setColor] = useState(canonicalTagColor(currentTag?.color));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!editorRef.current?.contains(target) && !trigger.contains(target)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose(true);
      }
    };
    const handleViewportChange = () => onClose();
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [onClose, trigger]);

  const saveTag = async (tag: AddressTag | null) => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(tag);
    } finally {
      setSaving(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) return;
    await saveTag({ name: nextName, color });
  };

  return createPortal(
    <form
      ref={editorRef}
      className="account-tag-menu"
      role="dialog"
      aria-labelledby={currentTag ? `tag-editor-title-${address.id}` : undefined}
      aria-label={currentTag ? undefined : "添加标签"}
      aria-busy={saving}
      style={{ top: position.top, left: position.left }}
      onSubmit={submit}
      onClick={(event) => event.stopPropagation()}
    >
      {currentTag && <div className="account-tag-menu-title" id={`tag-editor-title-${address.id}`}>修改标签</div>}
      {existingTags.length > 0 && <div className="account-tag-existing">
        <span>已有标签</span>
        <div>{existingTags.map((tag) => <button
          key={tag.name}
          type="button"
          className="account-tag account-tag-existing-option"
          style={tagStyle(tag.color)}
          aria-pressed={currentTag?.name === tag.name && currentTag.color === tag.color}
          disabled={saving}
          onClick={() => { setName(tag.name); setColor(tag.color); void saveTag(tag); }}
        >{tag.name}</button>)}</div>
      </div>}
      <label className="account-tag-name">标签名称<input ref={nameInputRef} value={name} maxLength={24} required disabled={saving} placeholder="输入标签名称" onChange={(event) => setName(event.target.value)} /></label>
      <TagColorPicker value={color} disabled={saving} onChange={setColor} />
      <div className="account-tag-menu-actions">
        {currentTag && <button className="button ghost compact" type="button" disabled={saving} onClick={() => void saveTag(null)}>清除</button>}
        <span />
        <button className="button ghost compact" type="button" disabled={saving} onClick={() => onClose(true)}>取消</button>
        <button className="button primary compact" disabled={saving || !name.trim()}>{saving && <LoaderCircle className="spin" size={14} aria-hidden="true" />}{saving ? "保存中" : "保存"}</button>
      </div>
    </form>,
    document.body,
  );
}

function MailDrawer(props: {
  address: MailAddressDto;
  messages: MailMessageDto[];
  message: MailMessageDto | null;
  loading: boolean;
  onSelectMessage: (message: MailMessageDto) => void;
  onDeleteMessage: (message: MailMessageDto) => void;
  onClose: () => void;
  onDismissVerificationCode: (message: MailMessageDto) => Promise<void>;
  onCopyCode: (value: string) => Promise<void>;
}) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(props.onClose);
  useEffect(() => { onCloseRef.current = props.onClose; }, [props.onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.focus();
    const focusable = () => Array.from(drawerRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), select:not([disabled]), a[href]") || []);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        drawerRef.current?.focus();
        return;
      }
      const first = items[0];
      const last = items.at(-1)!;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === drawerRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);

  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
    <aside ref={drawerRef} className="mail-drawer" role="dialog" aria-modal="true" aria-label="邮件详情" tabIndex={-1}>
      <div className="drawer-workspace">
        <aside className="drawer-history" aria-label="历史邮件">
          <div className={`history-list ${props.messages.length === 0 ? "is-empty" : ""}`}>
            {props.loading && props.messages.length === 0 ? <div className="history-loading"><LoaderCircle className="spin" size={18} />正在加载…</div> : props.messages.length === 0 ? <div className="history-empty">还没有收到邮件</div> : props.messages.map((message) => (
              <div key={message.id} className={`history-row ${props.message?.id === message.id ? "active" : ""} ${message.isRead ? "" : "unread"}`}>
                <button className="history-row-select" type="button" onClick={() => props.onSelectMessage(message)}>
                  <span><strong>{message.subject}</strong><time>{new Date(message.receivedAt).toLocaleString("zh-CN")}</time></span>
                </button>
                <button className="icon-button history-row-delete" type="button" title="删除邮件" aria-label={`删除邮件：${message.subject}`} onClick={() => props.onDeleteMessage(message)}>
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </aside>
        <section className={`drawer-reader ${props.message ? "" : "is-empty"}`}>
          {props.message ? <MailReadingPane key={props.message.id} message={props.message} onDismissVerificationCode={props.onDismissVerificationCode} onCopyCode={props.onCopyCode} /> : <EmptyState title="这个地址还没有邮件" description="收到第一封邮件后，可以在这里查看完整正文。" />}
        </section>
      </div>
    </aside>
  </div>;
}

function needsSourceHtmlRepair(htmlBody: string | null) {
  if (!htmlBody) return false;
  const hasDocumentStructure = /<(?:html|head|body)\b/i.test(htmlBody);
  const isAppleDualLayout = /aapl-desktop-div/i.test(htmlBody) && /aapl-mobile-div/i.test(htmlBody);
  // Older sanitized Apple receipts lost colspan/rowspan. Those attributes keep
  // header, content, and footer in the same table row, so re-fetch this narrow
  // legacy shape once after the sanitizer has been corrected.
  const lostTableSpans = isAppleDualLayout && !/\b(?:colspan|rowspan)\s*=/i.test(htmlBody);
  return !hasDocumentStructure || lostTableSpans;
}

function MailReadingPane({ message, onDismissVerificationCode, onCopyCode }: { message: MailMessageDto; onDismissVerificationCode: (message: MailMessageDto) => Promise<void>; onCopyCode: (value: string) => Promise<void> }) {
  const code = verificationCode(message);
  const emailHtml = message.htmlBody || plainTextEmailHtml(message.textBody);

  return <>
    <div className="drawer-message-meta"><div><h3>{message.subject}</h3><p>{message.senderName || message.senderAddress} · {message.senderAddress}</p><p>收件人 · {message.recipients.join("、") || "未提供"}</p></div></div>
    <div className="reader-scroll">
      {code && <div className="drawer-code"><div><strong>{code.display}</strong></div><div className="drawer-code-actions"><button className="button secondary compact" type="button" onClick={() => void onCopyCode(code.value)}><Copy size={15} />复制验证码</button><button className="button secondary compact" type="button" onClick={() => void onDismissVerificationCode(message)}>非验证码</button></div></div>}
      <article className="drawer-mail-content">
        <iframe
          className="mail-html-frame"
          title="邮件 HTML 正文"
          sandbox="allow-same-origin"
          srcDoc={emailHtml}
          onLoad={(event) => {
            const frame = event.currentTarget;
            const document = frame.contentDocument;
            if (!document) return;
            frame.style.height = `${Math.max(240, document.documentElement.scrollHeight, document.body?.scrollHeight || 0)}px`;
          }}
        />
      </article>
    </div>
  </>;
}

function SettingsView(props: {
  accounts: ICloudAccountDto[];
  syncProgress: IcloudSyncProgress | null;
  onConnectIcloud: () => void;
  onUpdateCredentials: (account: ICloudAccountDto) => void;
  onClearAliases: (account: ICloudAccountDto) => void;
  onClearAliasData: (account: ICloudAccountDto) => void;
  onDisconnect: (account: ICloudAccountDto) => void;
  isPending: (key: string) => boolean;
}) {
  return (
    <div className="settings-grid">
      <section className="settings-card panel full">
        <div className="settings-card-head"><div className="settings-icon apple">●</div><div><h2>iCloud 账号</h2><p>IMAP 用于同步邮件，浏览器同步助手用于读取账号中的完整隐藏邮件地址清单。</p></div><button className="button primary" onClick={props.onConnectIcloud}><Plus size={16} />连接 iCloud</button></div>
        {props.accounts.length === 0 ? (
          <div className="empty-inline"><div><Mail size={22} /></div><p><strong>还没有连接 iCloud 账号</strong><span>连接后，可以同步邮件和账号中的隐藏邮件地址。</span></p></div>
        ) : props.accounts.map((account) => {
          const syncProgress = props.syncProgress?.accountId === account.id ? props.syncProgress : null;
          const syncPercent = syncProgress ? Math.round((syncProgress.completed / Math.max(syncProgress.total, 1)) * 100) : 0;
          const accountBusy = props.isPending("icloud:manual-sync") || props.isPending(`icloud:clear:${account.id}`) || props.isPending(`icloud:clear-data:${account.id}`) || props.isPending(`icloud:disconnect:${account.id}`);
          return <div className="connection-row" key={account.id}>
            <div><strong>{account.emailAddress}</strong><span>{account.syncError || `邮件上次同步：${relativeTime(account.lastSyncAt)} · 地址：${account.aliasesActiveCount} 个使用中 · 地址清单更新于 ${relativeTime(account.aliasesLastSyncAt)}`}</span></div>
            <span className={`status-pill ${account.status}`}>{account.status === "active" ? "已连接" : account.status === "sync_error" ? "需要检查" : "已停用"}</span>
            {syncProgress && <div className="connection-sync-progress" role="status">
              <div className="connection-sync-progress-copy"><span>正在分批同步历史邮件</span><strong>{syncProgress.completed} / {syncProgress.total} 封</strong></div>
              <div className="connection-sync-progress-track" role="progressbar" aria-label="邮件同步进度" aria-valuemin={0} aria-valuemax={syncProgress.total} aria-valuenow={syncProgress.completed}><span style={{ width: `${syncPercent}%` }} /></div>
              <p>本次已同步 {syncProgress.completed} 封，剩余 {syncProgress.remaining} 封将继续同步。</p>
            </div>}
            <div className="connection-actions">
              <button className="button secondary compact" disabled={accountBusy} onClick={() => props.onUpdateCredentials(account)}><ShieldCheck size={15} />更新密码</button>
              <button className="button destructive compact" disabled={accountBusy} onClick={() => props.onClearAliases(account)}>{props.isPending(`icloud:clear:${account.id}`) ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}{props.isPending(`icloud:clear:${account.id}`) ? "正在清空…" : "清空所有邮箱"}</button>
              <button className="button destructive compact" disabled={accountBusy} onClick={() => props.onClearAliasData(account)}>{props.isPending(`icloud:clear-data:${account.id}`) ? <LoaderCircle className="spin" size={15} /> : <DatabaseX size={15} />}{props.isPending(`icloud:clear-data:${account.id}`) ? "正在清除…" : "清空所有数据"}</button>
              <button className="button destructive compact" disabled={accountBusy} onClick={() => props.onDisconnect(account)}>{props.isPending(`icloud:disconnect:${account.id}`) ? <LoaderCircle className="spin" size={15} /> : <Unplug size={15} />}{props.isPending(`icloud:disconnect:${account.id}`) ? "正在断开…" : "断开连接"}</button>
            </div>
          </div>;
        })}
      </section>
    </div>
  );
}

function ModalShell({ title, subtitle, variant = "form", onClose, children }: { title: string; subtitle?: string; variant?: "form" | "confirm"; onClose: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]") || []);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1)!;
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  return <div className="modal-backdrop"><div ref={dialogRef} className={`modal-card ${variant === "confirm" ? "confirm-dialog" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby={subtitle ? "modal-subtitle" : undefined}><div className="modal-head"><div><h2 id="modal-title">{title}</h2>{subtitle && <p id="modal-subtitle">{subtitle}</p>}</div><button type="button" aria-label={`关闭“${title}”`} onClick={onClose}><X size={18} /></button></div>{children}</div></div>;
}

function ConfirmDialog({ confirmation, pending, onCancel, onConfirm }: { confirmation: Confirmation; pending: boolean; onCancel: () => void; onConfirm: () => Promise<void> }) {
  return <ModalShell title={confirmation.title} variant="confirm" onClose={pending ? () => undefined : onCancel}><div className="confirm-body"><CircleAlert size={20} /><p>{confirmation.description}</p></div><div className="modal-form-footer"><button className="button ghost" type="button" disabled={pending} onClick={onCancel}>取消</button><button className="button destructive" type="button" disabled={pending} onClick={() => void onConfirm()}>{pending && <LoaderCircle className="spin" size={16} />}{pending ? "正在处理…" : confirmation.confirmLabel}</button></div></ModalShell>;
}

function FormError({ message }: { message: string | null }) {
  return message ? <div className="form-error" role="alert"><CircleAlert size={16} /><span>{message}</span></div> : null;
}

function DatePicker({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const selectedDate = parseCalendarDate(value);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = selectedDate || new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gutter = 8;
    const width = Math.min(304, window.innerWidth - gutter * 2);
    const panelHeight = panelRef.current?.offsetHeight || 354;
    const top = rect.bottom + gutter + panelHeight <= window.innerHeight - gutter
      ? rect.bottom + gutter
      : Math.max(gutter, rect.top - panelHeight - gutter);
    const left = Math.min(Math.max(gutter, rect.left), window.innerWidth - width - gutter);
    setPosition({ top, left, width });
  }, []);
  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);
  const show = () => {
    if (disabled) return;
    const date = selectedDate || new Date();
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setOpen(true);
    updatePosition();
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const focusTimer = window.setTimeout(() => {
      (panelRef.current?.querySelector<HTMLButtonElement>("[data-selected='true']")
        || panelRef.current?.querySelector<HTMLButtonElement>(".date-picker-day:not(.is-outside)"))?.focus();
    }, 0);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [close, open, updatePosition]);

  const days = calendarDays(visibleMonth);
  const todayValue = calendarDateValue(new Date());
  const displayValue = selectedDate
    ? `${selectedDate.getFullYear()}年${String(selectedDate.getMonth() + 1).padStart(2, "0")}月${String(selectedDate.getDate()).padStart(2, "0")}日`
    : "选择日期";
  return <div className="date-picker-field">
    <span className="date-picker-label">添加时间</span>
    <input name="addedAt" type="hidden" value={value} />
    <button
      ref={triggerRef}
      className="date-picker-trigger"
      type="button"
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => open ? close() : show()}
    >
      <span>{displayValue}</span>
      <CalendarDays size={17} aria-hidden="true" />
    </button>
    {open && position && typeof document !== "undefined" && createPortal(
      <div
        ref={panelRef}
        className="date-picker-popover"
        role="dialog"
        aria-label="选择添加时间"
        style={{ top: position.top, left: position.left, width: position.width }}
      >
        <div className="date-picker-head">
          <button type="button" aria-label="上个月" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={17} /></button>
          <strong aria-live="polite">{calendarMonthFormatter.format(visibleMonth)}</strong>
          <button type="button" aria-label="下个月" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={17} /></button>
        </div>
        <div className="date-picker-weekdays" aria-hidden="true">{["日", "一", "二", "三", "四", "五", "六"].map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
        <div className="date-picker-grid">
          {days.map((date) => {
            const dateValue = calendarDateValue(date);
            const selected = dateValue === value;
            const outside = date.getMonth() !== visibleMonth.getMonth();
            return <button
              className={`date-picker-day ${outside ? "is-outside" : ""} ${dateValue === todayValue ? "is-today" : ""} ${selected ? "is-selected" : ""}`}
              type="button"
              key={dateValue}
              data-selected={selected ? "true" : undefined}
              aria-label={calendarDateFormatter.format(date)}
              aria-pressed={selected}
              aria-current={dateValue === todayValue ? "date" : undefined}
              onClick={() => {
                onChange(dateValue);
                close(true);
              }}
            >{date.getDate()}</button>;
          })}
        </div>
        <div className="date-picker-actions">
          <button
            className="button ghost compact"
            type="button"
            disabled={!value}
            onClick={() => {
              onChange("");
              close(true);
            }}
          >清空时间</button>
        </div>
      </div>,
      document.body,
    )}
  </div>;
}

function EditAddressForm({ address, onDone, onSave }: {
  address: MailAddressDto;
  onDone: () => void;
  onSave: (input: {
    remark: string;
    addedAt: string | null;
    phoneNumber: string | null;
    phoneUrl: string | null;
  }) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [addedAt, setAddedAt] = useState(() => dateInputValue(address.addedAt));
  const [remark, setRemark] = useState(() => addressRemark(address) || "");
  const requiresRemark = address.type === "icloud_hide";
  const remarkIsEmpty = !remark.trim();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (requiresRemark && remarkIsEmpty) {
      setFormError(null);
      return;
    }
    setSaving(true);
    setFormError(null);
    const form = new FormData(event.currentTarget);
    const normalizedRemark = remark.trim();
    const phoneNumber = String(form.get("phoneNumber") || "").trim();
    const phoneUrl = String(form.get("phoneUrl") || "").trim();
    try {
      const addedAtValue = String(form.get("addedAt") || "");
      const addedAt = addedAtValue === dateInputValue(address.addedAt)
        ? address.addedAt
        : addedAtValue ? localDateIso(addedAtValue) : null;
      await onSave({
        remark: normalizedRemark,
        addedAt,
        phoneNumber: phoneNumber || null,
        phoneUrl: phoneUrl || null,
      });
      onDone();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "无法保存邮箱资料");
    } finally {
      setSaving(false);
    }
  };
  return <form className="modal-form" onSubmit={submit}>
    <div className="modal-form-body">
      <DatePicker value={addedAt} disabled={saving} onChange={setAddedAt} />
      <div className="form-two">
        <label>手机号<input name="phoneNumber" type="tel" maxLength={50} defaultValue={address.phoneNumber || ""} /></label>
        <label>链接<input name="phoneUrl" type="url" maxLength={2048} defaultValue={address.phoneUrl || ""} /></label>
      </div>
      {requiresRemark && <label>备注（iCloud 标签）<textarea name="remark" rows={5} maxLength={500} required value={remark} onChange={(event) => { setRemark(event.target.value); if (formError) setFormError(null); }} /></label>}
      <FormError message={formError} />
    </div>
    <div className="modal-form-footer"><button className="button ghost" type="button" disabled={saving} onClick={onDone}>取消</button><button className="button primary" disabled={saving || (requiresRemark && remarkIsEmpty)}>{saving && <LoaderCircle className="spin" size={17} />}{saving ? "正在保存…" : "保存"}</button></div>
  </form>;
}

function IcloudForm({ onDone, setNotice }: { onDone: () => void; setNotice: (notice: Notice) => void }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setFormError(null); const form = new FormData(event.currentTarget); try { await requestJson("/api/icloud/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) }); setNotice({ tone: "success", text: "iCloud 账号已连接，IMAP 验证通过" }); onDone(); } catch (error) { setFormError(error instanceof Error ? error.message : "无法连接 iCloud 账号"); } finally { setSaving(false); } };
  return <form className="modal-form" onSubmit={submit}><div className="modal-form-body"><div className="form-hint warning"><ShieldCheck size={18} /><p>请输入 Apple 账户生成的 App 专用密码。不要在这里输入 Apple 账户密码。</p></div><label>iCloud 主邮箱<input name="emailAddress" type="email" required autoComplete="email" placeholder="name@icloud.com" /></label><label>IMAP 用户名<input name="username" required autoComplete="username" placeholder="通常与 Apple 账户邮箱相同" /></label><label>App 专用密码<input name="appPassword" type="password" required autoComplete="current-password" placeholder="xxxx-xxxx-xxxx-xxxx" /></label><FormError message={formError} /></div><div className="modal-form-footer"><button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={17} />}{saving ? "正在验证连接…" : "验证并连接"}</button></div></form>;
}

function IcloudPasswordForm({ account, onDone, setNotice }: { account: ICloudAccountDto | null; onDone: () => void; setNotice: (notice: Notice) => void }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  if (!account) return null;
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setFormError(null); const form = new FormData(event.currentTarget); try { await requestJson(`/api/icloud/accounts/${account.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) }, 75_000); setNotice({ tone: "success", text: "App 专用密码已验证并更新，可以重新同步邮箱" }); onDone(); } catch (error) { setFormError(error instanceof Error ? error.message : "无法更新 App 专用密码"); } finally { setSaving(false); } };
  return <form className="modal-form" onSubmit={submit}><div className="modal-form-body"><div className="form-hint warning"><ShieldCheck size={18} /><p>仅更新此账号的 App 专用密码，不会删除已同步的邮件、隐藏地址或资料。</p></div><label>iCloud 主邮箱<input value={account.emailAddress} readOnly /></label><label>IMAP 用户名<input value={account.username} readOnly /></label><label>新的 App 专用密码<input name="appPassword" type="password" required autoComplete="current-password" placeholder="xxxx-xxxx-xxxx-xxxx" /></label><FormError message={formError} /></div><div className="modal-form-footer"><button className="button ghost" type="button" disabled={saving} onClick={onDone}>取消</button><button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={17} />}{saving ? "正在验证…" : "验证并更新"}</button></div></form>;
}

function EmptyState({ compact = false, title, description }: { compact?: boolean; title: string; description: string }) {
  return <div className={`empty-state ${compact ? "compact" : ""}`}><div><Mail size={compact ? 20 : 28} /></div><strong>{title}</strong><p>{description}</p></div>;
}

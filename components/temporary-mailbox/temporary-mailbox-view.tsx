"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Mail, Plus, RefreshCw, Trash2 } from "lucide-react";
import "./temporary-mailbox.css";

type Mailbox = { id: string; address: string; tag: string | null; expiresAt: string | Date };
type Message = { id: string; from_address: string | null; subject: string; content?: string; html?: string; received_at: number; is_read: boolean };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "请求失败");
  return body;
}

export function TemporaryMailboxView() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [selected, setSelected] = useState<Mailbox | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeMessage, setActiveMessage] = useState<Message | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [prefix, setPrefix] = useState("");
  const [domain, setDomain] = useState("");
  const [expiryTime, setExpiryTime] = useState(3_600_000);
  const [notice, setNotice] = useState<string | null>(null);

  const loadMailboxes = useCallback(async () => {
    try {
      const data = await request<{ emails: Mailbox[]; domains: string[] }>("/api/emails?all=1");
      setMailboxes(data.emails);
      setDomains(data.domains); setDomain((value) => value || data.domains[0] || "");
      setSelected((current) => data.emails.find((item) => item.id === current?.id) || data.emails[0] || null);
    } catch (error) { setNotice(error instanceof Error ? error.message : "加载临时邮箱失败"); }
  }, []);
  useEffect(() => { void loadMailboxes(); }, [loadMailboxes]);
  useEffect(() => {
    if (!selected) { setMessages([]); setActiveMessage(null); return; }
    void request<{ messages: Message[] }>(`/api/emails/${selected.id}`).then((data) => {
      setMessages(data.messages); setActiveMessage(data.messages[0] || null);
    }).catch((error) => setNotice(error instanceof Error ? error.message : "加载邮件失败"));
  }, [selected]);

  const create = async () => {
    try {
      await request("/api/emails/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: prefix, domain, expiryTime }) });
      setPrefix(""); await loadMailboxes();
    } catch (error) { setNotice(error instanceof Error ? error.message : "创建失败"); }
  };
  const removeMailbox = async () => { if (selected) { await request(`/api/emails/${selected.id}`, { method: "DELETE" }); await loadMailboxes(); } };
  const removeMessage = async (message: Message) => { if (selected) { await request(`/api/emails/${selected.id}/${message.id}`, { method: "DELETE" }); setMessages((items) => items.filter((item) => item.id !== message.id)); setActiveMessage(null); } };

  return <div className="temporary-mailbox">
    <header><div><h1>临时邮箱</h1><p>地址、邮件和到期清理与 iCloud 邮箱完全独立。</p></div><button onClick={() => void loadMailboxes()}><RefreshCw size={16} />刷新</button></header>
    <section className="temporary-create"><input value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder="留空随机生成" /><select value={domain} onChange={(event) => setDomain(event.target.value)}>{domains.map((item) => <option key={item}>{item}</option>)}</select><select value={expiryTime} onChange={(event) => setExpiryTime(Number(event.target.value))}><option value={3_600_000}>1 小时</option><option value={86_400_000}>1 天</option><option value={0}>永久</option></select><button disabled={!domain} onClick={() => void create()}><Plus size={16} />创建</button></section>
    <div className="temporary-columns"><aside>{mailboxes.map((mailbox) => <button key={mailbox.id} className={selected?.id === mailbox.id ? "selected" : ""} onClick={() => setSelected(mailbox)}><Mail size={16} /><span>{mailbox.address}</span></button>)}</aside><section>{selected ? <><div className="temporary-title"><strong>{selected.address}</strong><button onClick={() => void navigator.clipboard.writeText(selected.address)}><Copy size={15} />复制</button><button onClick={() => void removeMailbox()}><Trash2 size={15} />删除</button></div>{messages.map((message) => <button key={message.id} className={activeMessage?.id === message.id ? "selected" : ""} onClick={() => setActiveMessage(message)}><strong>{message.subject}</strong><span>{message.from_address || "未知发件人"}</span></button>)}</> : <p>创建或选择一个临时邮箱。</p>}</section><article>{activeMessage ? <><div><h2>{activeMessage.subject}</h2><p>{activeMessage.from_address}</p><button onClick={() => void removeMessage(activeMessage)}><Trash2 size={15} />删除邮件</button></div><pre>{activeMessage.content || "（无纯文本内容）"}</pre></> : <p>选择一封邮件查看内容。</p>}</article></div>{notice && <div className="temporary-notice">{notice}</div>}
  </div>;
}

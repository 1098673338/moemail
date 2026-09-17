import { all, batch, one, run } from "@/lib/db";
import { isOpenAiAccessDeactivatedMessage } from "@/lib/message-content";
import type { AddressStatus, AddressType, ICloudAccountDto, MailAddressDto, MailMessageDto } from "@/lib/types";

type AddressRow = Record<string, unknown> & { id: string; address: string; type: AddressType; status: AddressStatus; provider: "icloud"; tags_json: string; created_at: number; message_count: number };
type MessageRow = Record<string, unknown> & { id: string; source: "icloud"; sender_address: string; recipients_json: string; subject: string; text_body: string; received_at: number; is_read: number; address_ids: string | null };

export class MailStoreError extends Error {
  constructor(message: string, public readonly code: "not_found" | "conflict" | "invalid_transition" | "address_not_found") { super(message); }
}

const now = () => Date.now();
const iso = (value: unknown) => value == null ? null : new Date(Number(value)).toISOString();
const strings = (value: unknown) => { try { const data: unknown = JSON.parse(String(value || "[]")); return Array.isArray(data) ? data.filter((item): item is string => typeof item === "string") : []; } catch { return []; } };
const tags = (value: unknown) => strings(value).map((tag) => tag === "免费资格" ? "试用资格" : tag === "免费账号" ? "Free" : tag);

function addressDto(row: AddressRow): MailAddressDto {
  return { id: row.id, address: row.address, type: row.type, status: row.status, provider: row.provider, providerId: String(row.provider_id || "") || null, providerLabel: String(row.provider_label || "") || null, providerOrigin: String(row.provider_origin || "") || null, accountId: String(row.account_id || "") || null, label: String(row.label || "") || null, note: String(row.note || "") || null, phoneNumber: String(row.phone_number || "") || null, phoneUrl: String(row.phone_url || "") || null, tags: tags(row.tags_json), tagColor: String(row.tag_color || "") || null, addedAt: iso(row.added_at), createdAt: new Date(row.created_at).toISOString(), providerCreatedAt: iso(row.provider_created_at), lastReceivedAt: iso(row.last_received_at), disabledAt: iso(row.disabled_at), deletedAt: iso(row.deleted_at), messageCount: Number(row.message_count || 0) };
}

function messageDto(row: MessageRow): MailMessageDto {
  return { id: row.id, source: row.source, senderAddress: row.sender_address, senderName: String(row.sender_name || "") || null, recipients: strings(row.recipients_json), subject: row.subject, textBody: row.text_body, htmlBody: String(row.html_body || "") || null, receivedAt: new Date(row.received_at).toISOString(), isRead: Boolean(row.is_read), addressIds: row.address_ids ? row.address_ids.split(",") : [] };
}

export async function listAddresses(includeDeleted = false) {
  const rows = await all<AddressRow>(`SELECT a.*, (SELECT COUNT(*) FROM message_recipient mr JOIN message m ON m.id=mr.message_id WHERE mr.address_id=a.id AND m.source='icloud' AND m.deleted_at IS NULL) message_count FROM mail_address a WHERE a.type IN ('icloud_primary','icloud_hide') ${includeDeleted ? "" : "AND a.status <> 'deleted'"} ORDER BY a.added_at DESC, a.created_at DESC`);
  return rows.map(addressDto);
}

export async function getAddress(id: string) {
  const row = await one<AddressRow>(`SELECT a.*, (SELECT COUNT(*) FROM message_recipient mr JOIN message m ON m.id=mr.message_id WHERE mr.address_id=a.id AND m.source='icloud' AND m.deleted_at IS NULL) message_count FROM mail_address a WHERE a.id=? AND a.type IN ('icloud_primary','icloud_hide')`, id);
  return row ? addressDto(row) : null;
}

async function event(addressId: string, action: string, detail?: string) { await run("INSERT INTO address_event (id,address_id,action,detail,created_at) VALUES (?,?,?,?,?)", crypto.randomUUID(), addressId, action, detail || null, now()); }

export async function createAddress(input: { address: string; type: AddressType; accountId?: string | null; label?: string | null; note?: string | null; tags?: string[]; tagColor?: string | null; providerCreatedAt?: Date | null; addedAt?: Date | null }) {
  const address = input.address.trim().toLowerCase();
  if (await one("SELECT id FROM mail_address WHERE address=? COLLATE NOCASE", address)) throw new MailStoreError("这个邮箱地址已经存在", "conflict");
  if (input.type === "icloud_primary" && !input.accountId) throw new MailStoreError("iCloud 主邮箱必须关联一个账号", "conflict");
  const id = crypto.randomUUID(); const created = now();
  await batch([{ query: `INSERT INTO mail_address (id,address,type,status,provider,account_id,label,note,tags_json,tag_color,provider_created_at,added_at,created_at,updated_at) VALUES (?,? ,?,'active','icloud',?,?,?,?,?,?,?,?,?)`, params: [id,address,input.type,input.accountId || null,input.label || null,input.note || null,JSON.stringify(input.tags || []),input.tagColor || null,input.providerCreatedAt?.getTime() || null,input.addedAt === undefined ? created : input.addedAt?.getTime() || null,created,created] }, { query: "INSERT INTO address_event (id,address_id,action,detail,created_at) VALUES (?,?,?,?,?)", params: [crypto.randomUUID(),id,"created",`创建 ${input.type} 地址`,created] }]);
  return (await getAddress(id))!;
}

export async function updateAddress(id: string, input: { label?: string | null; note?: string | null; providerLabel?: string | null; phoneNumber?: string | null; phoneUrl?: string | null; tags?: string[]; tagColor?: string | null; status?: AddressStatus; addedAt?: Date | null; providerCreatedAt?: Date | null }) {
  const current = await getAddress(id); if (!current) throw new MailStoreError("邮箱地址不存在", "not_found");
  if (current.status === "deleted" && input.status && input.status !== "active") throw new MailStoreError("已删除地址只能恢复为启用状态", "invalid_transition");
  if (current.type === "icloud_hide" && input.status === "deleted" && current.status === "active") throw new MailStoreError("iCloud 隐藏地址必须先在 Apple 停用，再确认永久删除", "invalid_transition");
  if (current.type === "icloud_primary" && input.status === "deleted") throw new MailStoreError("请在 iCloud 连接设置中断开主邮箱", "invalid_transition");
  if ("providerLabel" in input && current.type !== "icloud_hide") throw new MailStoreError("只有 iCloud 隐藏地址可以修改 Apple 标签", "conflict");
  const fields: string[] = []; const values: unknown[] = [];
  const set = (key: string, column: string, value: unknown) => { if (key in input) { fields.push(`${column}=?`); values.push(value); } };
  set("label","label",input.label || null); set("note","note",input.note || null); set("providerLabel","provider_label",input.providerLabel || null); set("phoneNumber","phone_number",input.phoneNumber || null); set("phoneUrl","phone_url",input.phoneUrl || null); if (input.tags) { fields.push("tags_json=?"); values.push(JSON.stringify(input.tags)); } set("tagColor","tag_color",input.tagColor || null); if ("addedAt" in input) { fields.push("added_at=?"); values.push(input.addedAt?.getTime() || null); } if ("providerCreatedAt" in input) { fields.push("provider_created_at=?"); values.push(input.providerCreatedAt?.getTime() || null); }
  if (input.status) { fields.push("status=?"); values.push(input.status); if (["disabled","pending_delete"].includes(input.status)) { fields.push("disabled_at=?"); values.push(now()); } if (input.status === "active") fields.push("disabled_at=NULL", "deleted_at=NULL"); if (input.status === "deleted") { fields.push("deleted_at=?"); values.push(now()); } }
  if (!fields.length) return current; fields.push("updated_at=?"); values.push(now(), id); await run(`UPDATE mail_address SET ${fields.join(",")} WHERE id=?`, ...values); await event(id,input.status ? `status:${input.status}` : "updated",input.providerLabel || input.note || input.label || undefined); return (await getAddress(id))!;
}

export async function deleteIcloudAddressAfterAppleDeactivation(id: string) {
  const current = await getAddress(id); if (!current || current.type !== "icloud_hide") throw new MailStoreError("只有 iCloud 隐藏地址可以确认 Apple 停用", "conflict");
  const removed = await run(`DELETE FROM message WHERE id IN (SELECT message_id FROM message_recipient WHERE address_id=?) AND NOT EXISTS (SELECT 1 FROM message_recipient mr WHERE mr.message_id=message.id AND mr.address_id<>?)`,id,id); await run("DELETE FROM mail_address WHERE id=?",id); if (current.accountId && current.status === "active") await run("UPDATE mail_account SET aliases_active_count=MAX(aliases_active_count-1,0),updated_at=? WHERE id=?",now(),current.accountId); return { id, removedMessages: Number(removed.meta.changes || 0) };
}

export async function listMessages(addressId?: string | null) { const rows = await all<MessageRow>(`SELECT m.*,GROUP_CONCAT(mr.address_id) address_ids FROM message m JOIN message_recipient mr ON mr.message_id=m.id WHERE m.source='icloud' AND m.deleted_at IS NULL ${addressId ? "AND mr.address_id=?" : ""} GROUP BY m.id ORDER BY m.received_at DESC ${addressId ? "" : "LIMIT 200"}`, ...(addressId ? [addressId] : [])); return rows.map(messageDto); }
export async function getMessage(id: string) { const row=await one<MessageRow>("SELECT m.*,GROUP_CONCAT(mr.address_id) address_ids FROM message m JOIN message_recipient mr ON mr.message_id=m.id WHERE m.id=? AND m.source='icloud' GROUP BY m.id",id); return row ? messageDto(row) : null; }

export async function ingestMessage(input: { source: "icloud"; accountId?: string | null; providerUid?: number | null; providerMailbox?: string | null; providerMessageId?: string | null; senderAddress: string; senderName?: string | null; recipients: string[]; subject: string; textBody: string; htmlBody?: string | null; addressIds?: string[]; receivedAt: Date }) {
  const recipients=Array.from(new Set(input.recipients.map(v=>v.trim().toLowerCase()).filter(Boolean))); let ids=input.addressIds || [];
  if (!ids.length && recipients.length) { const marks=recipients.map(()=>"?").join(","); ids=(await all<{id:string}>(`SELECT id FROM mail_address WHERE lower(address) IN (${marks}) AND type IN ('icloud_primary','icloud_hide') AND status='active'`,...recipients)).map(row=>row.id); }
  ids=Array.from(new Set(ids)); if (!ids.length) throw new MailStoreError("没有找到可接收这封邮件的启用地址", "address_not_found");
  const existing=await one<{id:string}>("SELECT id FROM message WHERE source='icloud' AND account_id=? AND provider_mailbox=? AND (provider_uid=? OR provider_message_id=?) LIMIT 1",input.accountId || null,input.providerMailbox || "INBOX",input.providerUid || null,input.providerMessageId || null); const id=existing?.id || crypto.randomUUID(); const timestamp=now(); const received=input.receivedAt.getTime();
  const statements=[{query: existing ? "UPDATE message SET provider_uid=?,provider_mailbox=?,provider_message_id=?,sender_address=?,sender_name=?,recipients_json=?,subject=?,text_body=?,html_body=?,received_at=?,deleted_at=NULL,updated_at=? WHERE id=?" : "INSERT INTO message (id,source,account_id,provider_uid,provider_mailbox,provider_message_id,sender_address,sender_name,recipients_json,subject,text_body,html_body,received_at,is_read,created_at,updated_at) VALUES (?,'icloud',?,?,?,?,?,?,?,?,?,?,?,0,?,?)",params: existing ? [input.providerUid || null,input.providerMailbox || "INBOX",input.providerMessageId || null,input.senderAddress,input.senderName || null,JSON.stringify(recipients),input.subject || "（无主题）",input.textBody,input.htmlBody || null,received,timestamp,id] : [id,input.accountId || null,input.providerUid || null,input.providerMailbox || "INBOX",input.providerMessageId || null,input.senderAddress,input.senderName || null,JSON.stringify(recipients),input.subject || "（无主题）",input.textBody,input.htmlBody || null,received,timestamp,timestamp]},{query:"DELETE FROM message_recipient WHERE message_id=?",params:[id]}];
  for (const addressId of ids) { statements.push({query:"INSERT OR IGNORE INTO message_recipient (message_id,address_id,recipient_type,created_at) VALUES (?,?,'to',?)",params:[id,addressId,timestamp]},{query:"UPDATE mail_address SET last_received_at=?,updated_at=? WHERE id=?",params:[received,timestamp,addressId]}); } await batch(statements); return (await getMessage(id))!;
}

export async function setMessageRead(id:string,isRead:boolean){ const result=await run("UPDATE message SET is_read=?,updated_at=? WHERE id=? AND source='icloud' AND deleted_at IS NULL",isRead?1:0,now(),id); if(!result.meta.changes) throw new MailStoreError("邮件不存在","not_found"); return (await getMessage(id))!; }
export async function hideLocalMessage(id:string){ const result=await run("UPDATE message SET deleted_at=?,updated_at=? WHERE id=? AND source='icloud' AND deleted_at IS NULL",now(),now(),id); if(!result.meta.changes) throw new MailStoreError("邮件不存在或已删除","not_found"); }
export async function restoreLocalMessage(id:string){ const result=await run("UPDATE message SET deleted_at=NULL,updated_at=? WHERE id=? AND source='icloud' AND deleted_at IS NOT NULL",now(),id); if(!result.meta.changes) throw new MailStoreError("待恢复的邮件不存在","not_found"); }
export async function purgeLocalMessage(id:string){ const row=await one("SELECT id FROM message WHERE id=? AND source='icloud'",id); if(!row) throw new MailStoreError("邮件不存在或已删除","not_found"); await run("DELETE FROM message WHERE id=?",id); }
export async function reconcileIcloudMessages(accountId:string,mailboxPath:string,remote:Set<number>){ const rows=await all<{id:string;provider_uid:number}>("SELECT id,provider_uid FROM message WHERE source='icloud' AND account_id=? AND provider_mailbox=? AND deleted_at IS NULL AND provider_uid IS NOT NULL",accountId,mailboxPath); const stale=rows.filter(row=>!remote.has(row.provider_uid)); await batch(stale.map(row=>({query:"UPDATE message SET deleted_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL",params:[now(),now(),row.id]}))); return stale.length; }
export async function listIcloudAccounts():Promise<ICloudAccountDto[]>{ const rows=await all<Record<string,unknown>&{id:string;email_address:string;username:string;status:"active"|"disabled"|"sync_error";last_uid:number;created_at:number}>("SELECT * FROM mail_account ORDER BY created_at DESC"); return rows.map(row=>({id:row.id,emailAddress:row.email_address,username:row.username,status:row.status,uidValidity:String(row.uid_validity || "") || null,lastUid:row.last_uid,lastSyncAt:iso(row.last_sync_at),aliasesLastSyncAt:iso(row.aliases_last_sync_at),aliasesActiveCount:Number(row.aliases_active_count || 0),aliasesInactiveCount:Number(row.aliases_inactive_count || 0),syncError:String(row.sync_error || "") || null,createdAt:new Date(row.created_at).toISOString()})); }
export async function scanPendingAutomaticTags(filter:{accountId?:string;messageId?:string}={}) { const conditions=["m.source='icloud'","m.deleted_at IS NULL","m.automatic_tag_scanned_at IS NULL"]; const params:unknown[]=[]; if(filter.accountId){conditions.push("m.account_id=?");params.push(filter.accountId);} if(filter.messageId){conditions.push("m.id=?");params.push(filter.messageId);} const rows=await all<{id:string;subject:string;text_body:string;html_body:string|null;address_ids:string|null}>(`SELECT m.id,m.subject,m.text_body,m.html_body,GROUP_CONCAT(mr.address_id) address_ids FROM message m LEFT JOIN message_recipient mr ON mr.message_id=m.id WHERE ${conditions.join(" AND ")} GROUP BY m.id`,...params); const stamp=now(); let tagged=0; const work=rows.flatMap(row=>{const statements=[{query:"UPDATE message SET automatic_tag_scanned_at=? WHERE id=? AND automatic_tag_scanned_at IS NULL",params:[stamp,row.id]}]; if(isOpenAiAccessDeactivatedMessage({subject:row.subject,textBody:row.text_body,htmlBody:row.html_body})) for(const id of row.address_ids?.split(",") || []) { tagged++; statements.push({query:"UPDATE mail_address SET tags_json='[\"封号\"]',tag_color='#dc2626',updated_at=? WHERE id=? AND type<>'icloud_primary' AND status<>'deleted'",params:[stamp,id]}); } return statements;}); await batch(work); return {scanned:rows.length,tagged}; }

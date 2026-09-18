import PostalMime, { type Address, type Email as ParsedEmail } from "postal-mime";
import { decryptCredential, encryptCredential } from "@/lib/credentials";
import { all, batch, one, run } from "@/lib/db";
import { sanitizeEmailHtml } from "@/lib/email-html";
import { createAddress, hideLocalMessage, ingestMessage, MailStoreError, purgeLocalMessage, reconcileIcloudMessages, restoreLocalMessage, scanPendingAutomaticTags } from "@/lib/mail-store";
import { IcloudImapClient } from "@/lib/icloud-imap";

const domains = new Set(["icloud.com", "me.com", "mac.com"]);
const aliasDomains = new Set(["icloud.com", "me.com", "mac.com", "privaterelay.appleid.com", "icloudprivaterelay.com"]);
const ICLOUD_SYNC_BATCH_SIZE = 20;
const PRIMARY_RECIPIENT_REPAIR_ACTION = "repair:primary-recipient-scope:v3";
type Account = { id:string; email_address:string; username:string; encrypted_password:string; status:"active"|"disabled"|"sync_error"; uid_validity:string|null; last_uid:number };
const normalize=(value:string)=>value.trim().toLowerCase();
const stamp=()=>Date.now();

function assertIcloud(value:string){ if(!domains.has(normalize(value).split("@")[1] || "")) throw new Error("iCloud 邮箱地址必须使用 @icloud.com、@me.com 或 @mac.com"); }
function client(account:Pick<Account,"username"|"encrypted_password">){ return { client:new IcloudImapClient(), username:account.username, password:decryptCredential(account.encrypted_password) }; }
function addAddress(set:Set<string>,value?:string|null){ const item=value ? normalize(value) : ""; if(item.includes("@")) set.add(item); }
function addParsed(set:Set<string>,values?:Address[]|null){ for(const item of values || []) { if(item.group?.length) addParsed(set,item.group); addAddress(set,item.address); } }
function recipients(parsed:ParsedEmail){ const values=new Set<string>(); addParsed(values,parsed.to); addParsed(values,parsed.cc); addParsed(values,parsed.bcc); addAddress(values,parsed.deliveredTo); for(const header of parsed.headers){ if(!new Set(["to","cc","bcc","delivered-to","x-original-to","x-envelope-to","envelope-to","resent-to","resent-cc","x-forwarded-to"]).has(String(header.key || "").toLowerCase())) continue; for(const found of String(header.value || "").matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) addAddress(values,found[0]); } return [...values]; }

export async function testIcloudConnection(input:{username:string;appPassword:string}){ const active=new IcloudImapClient(); try { await active.connect(input.username,input.appPassword); await active.examineInbox(); } finally { await active.logout(); } }

export async function connectIcloudAccount(input:{emailAddress:string;username:string;appPassword:string}){ const emailAddress=normalize(input.emailAddress); assertIcloud(emailAddress); if(await one("SELECT id FROM mail_account WHERE email_address=? COLLATE NOCASE",emailAddress)) throw new MailStoreError("这个 iCloud 邮箱已经连接","conflict"); const encrypted=encryptCredential(input.appPassword); await testIcloudConnection(input); const id=crypto.randomUUID(); const now=stamp(); await run("INSERT INTO mail_account (id,provider,email_address,username,encrypted_password,status,last_uid,created_at,updated_at) VALUES (?,'icloud',?,?,?,'active',0,?,?)",id,emailAddress,input.username.trim(),encrypted,now,now); try { await createAddress({address:emailAddress,type:"icloud_primary",accountId:id,label:"iCloud 主邮箱",note:"通过 IMAP 接入，用于同步隐藏邮件地址收到的邮件。"}); } catch(error) { await run("DELETE FROM mail_account WHERE id=?",id); throw error; } return id; }

export async function updateIcloudAppPassword(accountId:string,appPassword:string){
  const account=await one<Account>("SELECT * FROM mail_account WHERE id=?",accountId);
  if(!account) throw new MailStoreError("iCloud 账号不存在","not_found");
  await testIcloudConnection({username:account.username,appPassword});
  await run("UPDATE mail_account SET encrypted_password=?,status='active',sync_error=NULL,updated_at=? WHERE id=?",encryptCredential(appPassword),stamp(),accountId);
}

export type IcloudAliasSnapshotItem={address:string;providerId:string;status:"active"|"disabled";providerLabel?:string|null;providerOrigin?:string|null;providerCreatedAt?:string|null};
const D1_MUTATION_BATCH_SIZE = 50;
function chunks<T>(values: T[], size = D1_MUTATION_BATCH_SIZE) { const result: T[][] = []; for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size)); return result; }

async function linkExistingMessagesToAliases(accountId: string) {
  const aliases = await all<{ id: string; address: string }>("SELECT id,address FROM mail_address WHERE account_id=? AND type='icloud_hide' AND status='active'", accountId);
  if (!aliases.length) return 0;
  const aliasIds = new Map(aliases.map((alias) => [normalize(alias.address), alias.id]));
  const messages = await all<{ id: string; recipients_json: string }>("SELECT id,recipients_json FROM message WHERE source='icloud' AND account_id=? AND deleted_at IS NULL", accountId);
  const timestamp = stamp();
  const statements: Array<{ query: string; params: unknown[] }> = [];
  const affectedMessageIds = new Set<string>();
  for (const message of messages) {
    let recipients: unknown = [];
    try { recipients = JSON.parse(message.recipients_json); } catch { continue; }
    if (!Array.isArray(recipients)) continue;
    for (const recipient of recipients) {
      const addressId = aliasIds.get(normalize(String(recipient || "")));
      if (addressId) {
        affectedMessageIds.add(message.id);
        statements.push({ query: "INSERT OR IGNORE INTO message_recipient (message_id,address_id,recipient_type,created_at) VALUES (?,?,'to',?)", params: [message.id, addressId, timestamp] });
      }
    }
  }
  for (const group of chunks(statements)) {
    await batch(group);
  }
  for (const group of chunks([...affectedMessageIds])) {
    await batch(group.map((messageId) => ({ query: "UPDATE message SET automatic_tag_scanned_at=NULL WHERE id=?", params: [messageId] })));
  }
  return affectedMessageIds.size;
}

async function repairPrimaryMessageRecipients(accountId: string) {
  const primary = await one<{ id: string; address: string }>("SELECT id,address FROM mail_address WHERE account_id=? AND type='icloud_primary'", accountId);
  if (!primary) return 0;
  const repaired = await one("SELECT id FROM address_event WHERE address_id=? AND action=? LIMIT 1", primary.id, PRIMARY_RECIPIENT_REPAIR_ACTION);
  if (repaired) return 0;
  const messages = await all<{ id: string; recipients_json: string }>("SELECT m.id,m.recipients_json FROM message m JOIN message_recipient mr ON mr.message_id=m.id WHERE m.source='icloud' AND m.account_id=? AND m.deleted_at IS NULL AND mr.address_id=?", accountId, primary.id);
  const primaryAddress = normalize(primary.address);
  const staleMessageIds = messages.flatMap((message) => {
    try {
      const recipients = JSON.parse(message.recipients_json);
      if (!Array.isArray(recipients)) return [message.id];
      const recipientAddresses = recipients.map((recipient) => normalize(String(recipient || "")));
      return recipientAddresses.includes(primaryAddress) ? [] : [message.id];
    } catch {
      return [message.id];
    }
  });
  for (const group of chunks(staleMessageIds)) {
    await batch(group.map((messageId) => ({ query: "DELETE FROM message_recipient WHERE message_id=? AND address_id=?", params: [messageId, primary.id] })));
  }
  await run("INSERT INTO address_event (id,address_id,action,detail,created_at) VALUES (?,?,?,?,?)", crypto.randomUUID(), primary.id, PRIMARY_RECIPIENT_REPAIR_ACTION, `修正 ${staleMessageIds.length} 封隐藏地址邮件的主号关联`, stamp());
  return staleMessageIds.length;
}

export async function syncIcloudAliasSnapshot(accountId:string,aliases:IcloudAliasSnapshotItem[],authoritative:boolean,scope:"all"|"active"="all") {
  const account=await one<Account>("SELECT * FROM mail_account WHERE id=?",accountId);
  if(!account) throw new MailStoreError("iCloud 账号不存在","not_found");
  let created=0,updated=0;
  const ids=new Set<string>();

  for(const alias of aliases){
    if(scope==="active" && alias.status!=="active") throw new MailStoreError("使用中地址快照不能包含已停用记录","conflict");
    const address=normalize(alias.address);
    if(!aliasDomains.has(address.split("@")[1] || "") || address===account.email_address) throw new MailStoreError(`地址 ${address} 不是受支持的 iCloud 隐藏地址`,"conflict");
    let existing=await one<{id:string;type:string;account_id:string|null}>("SELECT id,type,account_id FROM mail_address WHERE (provider='icloud' AND provider_id=?) OR address=? COLLATE NOCASE LIMIT 1",alias.providerId,address);
    if(existing && existing.type!=="icloud_hide") throw new MailStoreError(`地址 ${address} 已被其他邮箱类型占用`,"conflict");
    if(existing?.account_id && existing.account_id!==accountId) throw new MailStoreError(`地址 ${address} 已属于另一个 iCloud 账号`,"conflict");
    if(!existing){
      const item=await createAddress({address,type:"icloud_hide",accountId,note:"从 iCloud+ 账号地址清单同步。",providerCreatedAt:alias.providerCreatedAt ? new Date(alias.providerCreatedAt) : null,addedAt:null});
      existing={id:item.id,type:item.type,account_id:accountId};
      created++;
    } else updated++;
    const now=stamp();
    await run("UPDATE mail_address SET account_id=?,provider='icloud',provider_id=?,provider_label=COALESCE(?,provider_label),provider_origin=?,provider_created_at=COALESCE(?,provider_created_at),status=?,disabled_at=CASE WHEN ?='disabled' THEN COALESCE(disabled_at,?) ELSE NULL END,deleted_at=NULL,updated_at=? WHERE id=?",accountId,alias.providerId,alias.providerLabel || null,alias.providerOrigin || null,alias.providerCreatedAt ? new Date(alias.providerCreatedAt).getTime() : null,alias.status,alias.status,now,now,existing.id);
    ids.add(existing.id);
  }

  let removed=0;
  if(authoritative){
    // D1/SQLite rejects a large NOT IN (?, ?, ...) list. Fetch the small ID-only
    // local set and mark omissions in bounded batches instead, with the same
    // authoritative snapshot semantics and no schema change.
    const current=await all<{id:string}>("SELECT id FROM mail_address WHERE account_id=? AND type='icloud_hide' AND status<>'deleted'",accountId);
    const omitted=current.map(row=>row.id).filter(id=>!ids.has(id));
    const now=stamp();
    for(const group of chunks(omitted)){
      const results=await batch(group.map(id=>({ query:"UPDATE mail_address SET status='deleted',deleted_at=COALESCE(deleted_at,?),updated_at=? WHERE id=? AND status<>'deleted'", params:[now,now,id] })));
      removed+=results.reduce((total,result)=>total+Number(result.meta.changes || 0),0);
    }
  }

  const count=await one<{active_count:number;inactive_count:number}>("SELECT SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active_count,SUM(CASE WHEN status='disabled' THEN 1 ELSE 0 END) inactive_count FROM mail_address WHERE account_id=? AND type='icloud_hide'",accountId);
  const linkedMessages=await linkExistingMessagesToAliases(accountId);
  const primaryUnlinkedMessages=await repairPrimaryMessageRecipients(accountId);
  const automatic=linkedMessages ? await scanPendingAutomaticTags({accountId}) : {scanned:0,tagged:0};
  const now=stamp();
  await run("UPDATE mail_account SET aliases_last_sync_at=?,aliases_active_count=?,aliases_inactive_count=?,updated_at=? WHERE id=?",now,Number(count?.active_count || 0),Number(count?.inactive_count || 0),now,accountId);
  return {created,updated,removed,disabled:0,activeCount:Number(count?.active_count || 0),inactiveCount:Number(count?.inactive_count || 0),linkedMessages,primaryUnlinkedMessages,automaticTagScanned:automatic.scanned,automaticTagApplied:automatic.tagged};
}

export async function clearIcloudAliases(accountId:string){ if(!await one("SELECT id FROM mail_account WHERE id=?",accountId)) throw new MailStoreError("iCloud 账号不存在","not_found"); const now=stamp(); const result=await run("UPDATE mail_address SET status='deleted',deleted_at=COALESCE(deleted_at,?),updated_at=? WHERE account_id=? AND type='icloud_hide' AND status<>'deleted'",now,now,accountId); await run("UPDATE mail_account SET aliases_active_count=0,aliases_inactive_count=0,updated_at=? WHERE id=?",now,accountId); return {removed:Number(result.meta.changes || 0)}; }
export async function purgeIcloudAliasData(accountId:string){ if(!await one("SELECT id FROM mail_account WHERE id=?",accountId)) throw new MailStoreError("iCloud 账号不存在","not_found"); const result=await run("DELETE FROM mail_address WHERE account_id=? AND type='icloud_hide'",accountId); await run("UPDATE mail_account SET aliases_last_sync_at=NULL,aliases_active_count=0,aliases_inactive_count=0,updated_at=? WHERE id=?",stamp(),accountId); return {removed:Number(result.meta.changes || 0)}; }

type ActiveIcloudAddress = { id: string; address: string; type: "icloud_primary" | "icloud_hide" };

async function listActiveIcloudAddresses(accountId: string) {
  return all<ActiveIcloudAddress>("SELECT id,address,type FROM mail_address WHERE status='active' AND ((type='icloud_primary' AND account_id=?) OR (type='icloud_hide' AND account_id=?))", accountId, accountId);
}

function matchingIds(addresses: ActiveIcloudAddress[], list: string[]) {
  const values = new Set(list.map(normalize));
  const matched = addresses.filter((row) => values.has(normalize(row.address)));
  return matched.map((row) => row.id);
}

export async function syncIcloudAccount(accountId:string, options:{reconcile?:boolean}={}) {
  const account=await one<Account>("SELECT * FROM mail_account WHERE id=?",accountId);
  if(!account) throw new MailStoreError("iCloud 账号不存在","not_found");
  if(account.status==="disabled") throw new Error("这个 iCloud 账号已停用");
  let active:ReturnType<typeof client>|null=null; let imported=0,removed=0,synced=0,primaryUnlinkedMessages=0,uidValidityChanged=false,maxUid=0;
  try {
    active=client(account);
    await active.client.connect(active.username,active.password);
    const mailboxPath="INBOX";
    const mailbox=await active.client.examineInbox();
    const validity=mailbox.uidValidity;
    const state=await one<{uid_validity:string|null;last_uid:number}>("SELECT uid_validity,last_uid FROM icloud_mailbox_state WHERE account_id=? AND mailbox_path=?",accountId,mailboxPath);
    uidValidityChanged=Boolean(state?.uid_validity && validity && state.uid_validity!==validity);
    const previousUid=uidValidityChanged ? 0 : state?.last_uid || 0;
    const needsFullList=options.reconcile || uidValidityChanged || !state || previousUid===0;
    const remoteList=needsFullList ? await active.client.searchUids() : null;
    if(options.reconcile || uidValidityChanged) removed=await reconcileIcloudMessages(accountId,mailboxPath,new Set(remoteList || []));
    const fetch=remoteList
      ? remoteList.filter(uid=>uid>previousUid)
      : mailbox.uidNext !== null && mailbox.uidNext-1<=previousUid
        ? []
        : await active.client.searchUids(previousUid+1);
    const batchToImport=fetch.slice(0,ICLOUD_SYNC_BATCH_SIZE);
    const remaining=Math.max(fetch.length-batchToImport.length,0);
    maxUid=previousUid;
    const activeAddresses = batchToImport.length ? await listActiveIcloudAddresses(accountId) : [];
    const fetchedMessages=await active.client.fetchMessages(batchToImport);
    for(const item of fetchedMessages){
      maxUid=Math.max(maxUid,item.uid);
      const parsed=await PostalMime.parse(item.source);
      const delivered=recipients(parsed); const addressIds=matchingIds(activeAddresses,delivered);
      if(!addressIds.length) continue;
      const stored=await ingestMessage({source:"icloud",accountId,providerUid:item.uid,providerMailbox:mailboxPath,providerMessageId:parsed.messageId || `uid:${mailboxPath}:${item.uid}`,senderAddress:parsed.from?.address || "unknown@invalid.local",senderName:parsed.from?.name || null,recipients:delivered.length ? delivered : [account.email_address],subject:parsed.subject || "（无主题）",textBody:parsed.text || "",htmlBody:sanitizeEmailHtml(parsed.html),addressIds,receivedAt:parsed.date ? new Date(parsed.date) : item.internalDate || new Date()});
      if(stored.created) imported++;
      synced++;
    }
    if(remaining===0 && mailbox.uidNext!==null) maxUid=Math.max(maxUid,mailbox.uidNext-1);
    const needsStateUpdate=!state || uidValidityChanged || maxUid!==previousUid;
    const current=stamp();
    if(needsStateUpdate){
      await run("INSERT INTO icloud_mailbox_state (account_id,mailbox_path,uid_validity,last_uid,last_sync_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(account_id,mailbox_path) DO UPDATE SET uid_validity=excluded.uid_validity,last_uid=excluded.last_uid,last_sync_at=excluded.last_sync_at,updated_at=excluded.updated_at",accountId,mailboxPath,validity,maxUid,current,current,current);
      await run("UPDATE mail_account SET uid_validity=?,last_uid=?,last_sync_at=?,sync_error=NULL,status='active',updated_at=? WHERE id=?",validity,maxUid,current,current,accountId);
    }
    if(options.reconcile) primaryUnlinkedMessages=await repairPrimaryMessageRecipients(accountId);
    const automatic=fetchedMessages.length ? await scanPendingAutomaticTags({accountId}) : {scanned:0,tagged:0};
    return {imported,removed,synced,primaryUnlinkedMessages,lastUid:maxUid,uidValidity:validity,uidValidityChanged,mailboxes:1,remaining,automaticTagScanned:automatic.scanned,automaticTagApplied:automatic.tagged};
  } catch(error) { const message=error instanceof Error ? error.message : "iCloud 同步失败"; await run("UPDATE mail_account SET status='sync_error',sync_error=?,updated_at=? WHERE id=?",message,stamp(),accountId); throw error; }
  finally { await active?.client.logout(); }
}

export async function deleteIcloudMessage(messageId:string) { const local=await one<Account & {provider_uid:number;provider_mailbox:string|null;provider_message_id:string|null;account_status:string}>("SELECT m.*,a.username,a.encrypted_password,a.status account_status FROM message m JOIN mail_account a ON a.id=m.account_id WHERE m.id=? AND m.source='icloud' AND m.deleted_at IS NULL",messageId); if(!local) throw new MailStoreError("iCloud 邮件不存在","not_found"); if(local.account_status==="disabled") throw new Error("iCloud 账号已停用，无法删除远端邮件"); await hideLocalMessage(messageId); const active=client(local); try { await active.client.connect(active.username,active.password); await active.client.examineInbox(); const remote=await active.client.fetchMessage(local.provider_uid); if(remote){ const parsed=await PostalMime.parse(remote.source); if(local.provider_message_id && parsed.messageId && local.provider_message_id!==parsed.messageId) throw new Error("远端邮件身份发生变化，已取消删除"); await active.client.deleteMessage(local.provider_uid); } await purgeLocalMessage(messageId); } catch(error) { await restoreLocalMessage(messageId); throw error; } finally { await active.client.logout(); } }
export async function refreshIcloudMessageHtml(messageId:string) {
  const local=await one<Account & {provider_uid:number|null;provider_mailbox:string|null;provider_message_id:string|null;account_status:string}>("SELECT m.*,a.username,a.encrypted_password,a.status account_status FROM message m JOIN mail_account a ON a.id=m.account_id WHERE m.id=? AND m.source='icloud' AND m.deleted_at IS NULL",messageId);
  if(!local) throw new MailStoreError("iCloud 邮件不存在","not_found");
  if(local.account_status==="disabled") throw new Error("iCloud 账号已停用，无法读取远端邮件");
  const providerUid=local.provider_uid;
  if(typeof providerUid !== "number" || !Number.isSafeInteger(providerUid) || providerUid <= 0 || (local.provider_mailbox && local.provider_mailbox !== "INBOX")) throw new Error("这封邮件缺少可用的 iCloud 同步标识，无法修复格式");
  const active=client(local);
  try {
    await active.client.connect(active.username,active.password);
    await active.client.examineInbox();
    const remote=await active.client.fetchMessage(providerUid);
    if(!remote) throw new Error("iCloud 中找不到这封邮件，无法修复格式");
    const parsed=await PostalMime.parse(remote.source);
    if(local.provider_message_id && parsed.messageId && local.provider_message_id!==parsed.messageId) throw new Error("远端邮件身份发生变化，已取消修复格式");
    const textBody=parsed.text || "";
    const htmlBody=sanitizeEmailHtml(parsed.html);
    await run("UPDATE message SET text_body=?,html_body=?,updated_at=? WHERE id=? AND source='icloud' AND deleted_at IS NULL",textBody,htmlBody,stamp(),messageId);
    return {textBody,htmlBody};
  } finally {
    await active.client.logout();
  }
}
export async function disconnectIcloudAccount(accountId:string){ if(!await one("SELECT id FROM mail_account WHERE id=?",accountId)) throw new MailStoreError("iCloud 账号不存在","not_found"); const now=stamp(); await batch([{query:"UPDATE mail_address SET status='deleted',deleted_at=?,updated_at=? WHERE account_id=? AND type='icloud_primary'",params:[now,now,accountId]},{query:"UPDATE mail_address SET account_id=NULL,updated_at=? WHERE account_id=? AND type='icloud_hide'",params:[now,accountId]},{query:"DELETE FROM mail_account WHERE id=?",params:[accountId]}]); }

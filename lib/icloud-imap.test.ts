import assert from "node:assert/strict";
import test from "node:test";
import { IcloudImapClient } from "./icloud-imap";
import { ImapReceiveBuffer } from "./imap-receive-buffer";

const encoder = new TextEncoder();

function clientWithReply(reply: (tag: string) => Uint8Array, chunkSize = 7) {
  const client = new IcloudImapClient();
  const pending: ImapReceiveBuffer = Reflect.get(client, "pending");
  const socket = {
    destroyed: false,
    write(value: Uint8Array, done: () => void) {
      const tag = new TextDecoder().decode(value).split(" ")[0];
      const response = reply(tag);
      done();
      let offset = 0;
      const deliver = () => {
        if (offset >= response.length) return;
        pending.append(response.subarray(offset, offset + chunkSize));
        offset += chunkSize;
        Reflect.get(client, "wakeReaders").call(client);
        queueMicrotask(deliver);
      };
      queueMicrotask(deliver);
    },
  };
  Reflect.set(client, "socket", socket);
  return client;
}

test("fragmented IMAP replies parse the full mail and ignore command-like text within its literal body", async () => {
  const source = "Subject: Test\r\n\r\nA0001 OK not the end of this message\r\n" + "Hello\r\n".repeat(1000);
  const encoded = encoder.encode(source);
  const client = clientWithReply(tag => encoder.encode(`* 1 FETCH (UID 7 INTERNALDATE "21-Oct-2026 00:00:00 +0000" BODY[] {${encoded.length}}\r\n${source})\r\n${tag} OK done\r\n`));
  const message = await client.fetchMessage(7);
  assert.equal(message?.uid, 7);
  assert.equal(new TextDecoder().decode(message?.source), source);
  assert.ok(message?.internalDate instanceof Date);
});

test("a server NO response still produces the authentication error", async () => {
  const client = clientWithReply(tag => encoder.encode(`${tag} NO [AUTHENTICATIONFAILED] LOGIN failed\r\n`), 1);
  await assert.rejects(client.examineInbox(), /用户名或 App 专用密码无效/);
});

test("a missing remote mail produces null without confusing the following tagged completion", async () => {
  const client = clientWithReply(tag => encoder.encode(`${tag} OK no matching messages\r\n`), 1);
  assert.equal(await client.fetchMessage(8), null);
});

test("multiple FETCH literals in a response preserve both messages", async () => {
  const client = clientWithReply(tag => encoder.encode(`* 1 FETCH (UID 1 INTERNALDATE "21-Oct-2026 00:00:00 +0000" BODY[] {3}\r\none)\r\n* 2 FETCH (UID 2 INTERNALDATE "21-Oct-2026 00:00:00 +0000" BODY[] {3}\r\ntwo)\r\n${tag} OK done\r\n`), 2);
  const messages = await client.fetchMessages([1, 2]);
  assert.deepEqual(messages.map(message => new TextDecoder().decode(message.source)), ["one", "two"]);
});

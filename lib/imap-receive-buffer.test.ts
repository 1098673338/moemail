import assert from "node:assert/strict";
import test from "node:test";
import { ImapReceiveBuffer } from "./imap-receive-buffer";

const encode = (value: string) => new TextEncoder().encode(value);
const decode = (value: Uint8Array) => new TextDecoder().decode(value);

test("receiving many chunks grows geometrically and releases the large allocation after consumption", () => {
  const buffer = new ImapReceiveBuffer();
  const chunk = new Uint8Array(8192).fill(65);
  let previous = Reflect.get(buffer, "storage");
  let growths = 0;
  for (let index = 0; index < 1024; index++) {
    buffer.append(chunk);
    const storage = Reflect.get(buffer, "storage");
    if (previous !== storage) growths++;
    previous = storage;
  }
  assert.equal(buffer.length, 8 * 1024 * 1024);
  assert.ok(growths <= 12, `Buffer reallocations: ${growths}`);
  const body = buffer.take(buffer.length);
  assert.equal(body.length, 8 * 1024 * 1024);
  assert.equal(body[0], 65);
  assert.equal(body.at(-1), 65);
  assert.equal(buffer.length, 0);
  assert.ok(Reflect.get(buffer, "storage").length <= 65_536);
});

test("partial consumption preserves the following response when more bytes arrive", () => {
  const buffer = new ImapReceiveBuffer();
  buffer.append(encode("first\r\nsecond"));
  assert.equal(decode(buffer.take(7)), "first\r\n");
  buffer.append(encode("\r\nthird\r\n"));
  assert.equal(decode(buffer.take(8)), "second\r\n");
  assert.equal(decode(buffer.take(buffer.length)), "third\r\n");
});

test("compacting a partly consumed allocation retains byte order", () => {
  const buffer = new ImapReceiveBuffer();
  buffer.append(new Uint8Array(3000).fill(1));
  buffer.take(2000);
  buffer.append(new Uint8Array(2500).fill(2));
  const result = buffer.take(buffer.length);
  assert.equal(result.length, 3500);
  assert.ok(result.subarray(0, 1000).every(value => value === 1));
  assert.ok(result.subarray(1000).every(value => value === 2));
});

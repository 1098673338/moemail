/** Grow geometrically so incoming chunks do not repeatedly copy the whole mail. */
export class ImapReceiveBuffer {
  private storage = new Uint8Array(4096);
  private start = 0;
  private end = 0;

  get length() { return this.end - this.start; }

  view() { return this.storage.subarray(this.start, this.end); }

  append(chunk: Uint8Array) {
    const size = this.length + chunk.length;
    if (size > this.storage.length) {
      let capacity = this.storage.length;
      while (capacity < size) capacity *= 2;
      const next = new Uint8Array(capacity);
      next.set(this.view());
      this.end = this.length;
      this.start = 0;
      this.storage = next;
    } else if (this.end + chunk.length > this.storage.length) {
      this.storage.copyWithin(0, this.start, this.end);
      this.end = this.length;
      this.start = 0;
    }
    this.storage.set(chunk, this.end);
    this.end += chunk.length;
  }

  take(size: number) {
    if (size < 0 || size > this.length) throw new RangeError("Incomplete IMAP response");
    const result = this.storage.slice(this.start, this.start + size);
    this.start += size;
    if (this.start === this.end) {
      this.start = this.end = 0;
      if (this.storage.length > 65_536) this.storage = new Uint8Array(4096);
    }
    return result;
  }
}

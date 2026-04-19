/**
 * Async codec for shareable URL-hash payloads.
 *
 * Used by the Compose feature (#17) to round-trip the entire competition
 * plan (boards + config + overrides) through the URL hash so a fully
 * static deploy can still produce shareable links. The payload is JSON
 * → DEFLATE-RAW → base64url, giving us ~4× size reduction over plain
 * `encodeURIComponent(JSON.stringify(...))` for the kinds of payloads
 * the plan store produces.
 *
 * Returns plain primitives (string for encode, T | null for decode) so
 * call sites can layer their own validation and versioning on top.
 */

const VERSION = 1;

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]!);
  }
  // btoa works on byte-equivalent strings; trim padding and convert to
  // the URL-safe alphabet so the result survives address bars + the
  // hash util's percent-encoder (which is a no-op for these chars).
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(input: string): Uint8Array | null {
  try {
    const padded =
      input.replace(/-/g, "+").replace(/_/g, "/") +
      "===".slice(0, (4 - (input.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value !== undefined) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function compress(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  // Cast through BufferSource: tsc 5.7+ narrows Uint8Array's buffer to
  // ArrayBufferLike, which the WritableStreamDefaultWriter typings reject.
  void writer.write(bytes as unknown as BufferSource);
  void writer.close();
  return streamToBytes(cs.readable);
}

async function decompress(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    void writer.write(bytes as unknown as BufferSource);
    void writer.close();
    return await streamToBytes(ds.readable);
  } catch {
    return null;
  }
}

/**
 * Encode a JSON-serializable value to a hash-safe `v{N}.{base64url}`
 * string. Resolved value is empty string when input serializes to empty
 * (callers should treat that as "skip").
 */
export async function encodeShareable<T>(value: T): Promise<string> {
  const json = JSON.stringify(value);
  const enc = new TextEncoder();
  const compressed = await compress(enc.encode(json));
  return `v${VERSION}.${bytesToBase64Url(compressed)}`;
}

/**
 * Decode a `v{N}.{base64url}` payload. Returns `null` when the prefix,
 * base64, decompression, or JSON step fails — callers should treat that
 * as "no payload" rather than surface an error.
 */
export async function decodeShareable<T>(raw: string): Promise<T | null> {
  const dot = raw.indexOf(".");
  if (dot < 0) return null;
  const tag = raw.slice(0, dot);
  if (tag !== `v${VERSION}`) return null;
  const bytes = base64UrlToBytes(raw.slice(dot + 1));
  if (bytes === null) return null;
  const decompressed = await decompress(bytes);
  if (decompressed === null) return null;
  try {
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decompressed)) as T;
  } catch {
    return null;
  }
}

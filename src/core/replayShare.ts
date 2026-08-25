import type { ReplayFile } from "./replayFile";

const MAX_ENCODED_CHARS = 4_000_000;
const MAX_DECODED_BYTES = 8_000_000;

/**
 * Encodes a replay file into a compact URL-hash payload.
 * Prefers deflate-raw compression when the runtime provides CompressionStream,
 * falling back to raw UTF-8 bytes. Output is URL-safe (base64url, no padding).
 */
export async function encodeReplayPayload(
  file: ReplayFile,
  opts: { preferRaw?: boolean } = {},
): Promise<string> {
  const json = JSON.stringify(file);
  const bytes = new TextEncoder().encode(json);
  if (!opts.preferRaw && typeof CompressionStream === "function") {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      const deflated = await readWithCap(stream, MAX_DECODED_BYTES);
      return "z" + base64Url(deflated);
    } catch (err) {
      if (err instanceof Error && err.message.includes("exceeds")) throw err;
      // fall through to raw encoding
    }
  }
  return "p" + base64Url(bytes);
}

/** Decodes a share payload back into unvalidated JSON data for parsing. */
export async function decodeReplayPayloadData(payload: string): Promise<unknown> {
  if (payload.length > MAX_ENCODED_CHARS) {
    throw new Error(`share payload too large (${payload.length} chars)`);
  }
  if (payload.length < 2) throw new Error("share payload too short");
  const mode = payload[0];
  const bytes = base64UrlDecode(payload.slice(1));
  if (bytes.byteLength > MAX_DECODED_BYTES) {
    throw new Error(`decoded replay exceeds ${MAX_DECODED_BYTES} bytes`);
  }
  if (mode === "z") {
    if (typeof DecompressionStream !== "function") {
      throw new Error("compressed replay requires CompressionStream support");
    }
    const inflated = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const jsonBytes = await readWithCap(inflated, MAX_DECODED_BYTES);
    return JSON.parse(new TextDecoder().decode(jsonBytes));
  }
  if (mode === "p") {
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  throw new Error(`unknown share payload mode: ${mode}`);
}

async function readWithCap(stream: ReadableStream<Uint8Array>, cap: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      void reader.cancel().catch(() => undefined);
      throw new Error(`decompressed replay exceeds ${cap} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/** Builds a full share URL for the given replay. */
export async function buildReplayShareUrl(file: ReplayFile, originPath: string): Promise<string> {
  const payload = await encodeReplayPayload(file);
  return `${originPath}#r=${payload}`;
}

/** Extracts a share payload from a location hash, if one is present. */
export function payloadFromHash(hash: string): string | null {
  if (!hash.startsWith("#r=")) return null;
  return hash.slice(3);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "===".slice((b64.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

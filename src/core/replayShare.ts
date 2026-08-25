import type { ReplayFile } from "./replayFile";

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
      const deflated = new Uint8Array(await new Response(stream).arrayBuffer());
      return "z" + base64Url(deflated);
    } catch {
      // fall through to raw encoding
    }
  }
  return "p" + base64Url(bytes);
}

/** Decodes a payload produced by encodeReplayPayload back into a replay file. */
export async function decodeReplayPayload(payload: string): Promise<ReplayFile> {
  if (payload.length < 2) throw new Error("share payload too short");
  const mode = payload[0];
  const bytes = base64UrlDecode(payload.slice(1));
  if (mode === "z") {
    if (typeof DecompressionStream !== "function") {
      throw new Error("compressed replay requires CompressionStream support");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const jsonText = await new Response(stream).text();
    return JSON.parse(jsonText) as ReplayFile;
  }
  if (mode === "p") {
    return JSON.parse(new TextDecoder().decode(bytes)) as ReplayFile;
  }
  throw new Error(`unknown share payload mode: ${mode}`);
}

/** Builds a full share URL for the given replay. */
export async function buildReplayShareUrl(file: ReplayFile, originPath: string): Promise<string> {
  const payload = await encodeReplayPayload(file);
  return `${originPath}#r=${payload}`;
}

/** Extracts and decodes a replay from a location hash, if one is present. */
export async function replayFromHash(hash: string): Promise<ReplayFile | null> {
  if (!hash.startsWith("#r=")) return null;
  return decodeReplayPayload(hash.slice(3));
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

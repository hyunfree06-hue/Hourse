/**
 * Image byte / Content-Type helpers for generated-asset insertion.
 * Never log raw image contents — only signatures / sizes / types.
 */

export type ImageKind = "png" | "jpeg" | "webp";

function asUint8Array(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

export function detectImageKindFromBytes(
  bytes: ArrayBuffer | Uint8Array,
): ImageKind | null {
  const view = asUint8Array(bytes);

  if (
    view.length >= 8 &&
    view[0] === 0x89 &&
    view[1] === 0x50 &&
    view[2] === 0x4e &&
    view[3] === 0x47
  ) {
    return "png";
  }
  if (view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) {
    return "jpeg";
  }
  if (
    view.length >= 12 &&
    view[0] === 0x52 &&
    view[1] === 0x49 &&
    view[2] === 0x46 &&
    view[3] === 0x46 &&
    view[8] === 0x57 &&
    view[9] === 0x45 &&
    view[10] === 0x42 &&
    view[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function mimeFromImageKind(kind: ImageKind): string {
  switch (kind) {
    case "png":
      return "image/png";
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
  }
}

export function signatureHexPreview(
  bytes: ArrayBuffer | Uint8Array,
  length = 4,
): string {
  const view = asUint8Array(bytes);
  return Array.from(view.slice(0, length))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ")
    .toUpperCase();
}

export function isProbablyJsonOrText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  let i = 0;
  while (
    i < bytes.length &&
    (bytes[i] === 0x20 ||
      bytes[i] === 0x0a ||
      bytes[i] === 0x0d ||
      bytes[i] === 0x09)
  ) {
    i += 1;
  }
  const c = bytes[i];
  return c === 0x7b || c === 0x5b || c === 0x3c || c === 0x22;
}

export function normalizeImageContentType(
  header: string | null | undefined,
): string {
  if (!header) return "";
  return header.split(";")[0]?.trim().toLowerCase() ?? "";
}

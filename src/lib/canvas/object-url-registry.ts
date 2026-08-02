import { revokeObjectUrlSafe } from "@/lib/canvas/fetch-signed-image";

/**
 * Runtime-only registry of blob: object URLs attached to Fabric objects.
 * Never serialize these URLs into canvas JSON.
 */
const urlsByObjectId = new Map<string, string>();

export function registerObjectUrl(objectId: string, objectUrl: string) {
  const previous = urlsByObjectId.get(objectId);
  if (previous && previous !== objectUrl) {
    revokeObjectUrlSafe(previous);
  }
  urlsByObjectId.set(objectId, objectUrl);
}

export function revokeObjectUrlForObject(objectId: string | undefined | null) {
  if (!objectId) return;
  const url = urlsByObjectId.get(objectId);
  if (!url) return;
  revokeObjectUrlSafe(url);
  urlsByObjectId.delete(objectId);
}

/** Drop a registry key without revoking the underlying blob URL. */
export function releaseObjectUrlKey(objectId: string | undefined | null) {
  if (!objectId) return;
  urlsByObjectId.delete(objectId);
}

export function revokeAllObjectUrls() {
  for (const url of urlsByObjectId.values()) {
    revokeObjectUrlSafe(url);
  }
  urlsByObjectId.clear();
}

export function hasRegisteredObjectUrl(objectId: string): boolean {
  return urlsByObjectId.has(objectId);
}

import { testerApi } from '../api';

// Gallery avatar images, fetched one at a time and kept as object URLs.
//
// The gallery listing used to include every image inline as base64 — up to
// 2.8 MB each, unpaginated, in one JSON response every time the picker
// opened. The listing carries only ids now, and this fetches the bytes for
// the ones actually on screen.
//
// A module-level cache rather than component state because the picker
// mounts and unmounts as the modal opens and closes, and the same handful
// of avatars would otherwise be re-fetched every time. Concurrent callers
// for the same id share one request.

const urls = new Map<number, string>();
const inflight = new Map<number, Promise<string | null>>();

export function cachedGalleryImage(id: number): string | undefined {
  return urls.get(id);
}

export function loadGalleryImage(id: number): Promise<string | null> {
  const cached = urls.get(id);
  if (cached) return Promise.resolve(cached);

  let pending = inflight.get(id);
  if (!pending) {
    pending = testerApi.getGalleryImage(id)
      .then(res => {
        const url = URL.createObjectURL(res.data as Blob);
        urls.set(id, url);
        return url;
      })
      .catch(() => null)
      .finally(() => { inflight.delete(id); });
    inflight.set(id, pending);
  }
  return pending;
}

/** Call after deleting a gallery entry, so its object URL isn't leaked. */
export function forgetGalleryImage(id: number) {
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
}

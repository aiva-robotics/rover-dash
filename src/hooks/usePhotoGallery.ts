import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addPhoto as storeAdd,
  clearPhotos as storeClear,
  listPhotos,
  removePhoto as storeRemove,
  type StoredPhoto,
} from "@/lib/photoStore";

export type GalleryPhoto = StoredPhoto & { url: string };

/**
 * Håller galleriet av tagna bilder och object-URL:er för varje thumbnail.
 * URL:er återkallas när bilden tas bort eller komponenten avmonteras.
 */
export function usePhotoGallery(enabled: boolean) {
  const [photos, setPhotos] = useState<StoredPhoto[]>([]);
  const urlsRef = useRef(new Map<string, string>());
  const [urlVersion, setUrlVersion] = useState(0);

  const syncUrls = useCallback((next: StoredPhoto[]) => {
    const map = urlsRef.current;
    const keep = new Set(next.map((p) => p.id));
    for (const [id, url] of map) {
      if (!keep.has(id)) {
        URL.revokeObjectURL(url);
        map.delete(id);
      }
    }
    for (const p of next) {
      if (!map.has(p.id)) map.set(p.id, URL.createObjectURL(p.blob));
    }
    setUrlVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void listPhotos().then((list) => {
      if (cancelled) return;
      setPhotos(list);
      syncUrls(list);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, syncUrls]);

  // Städa alla object-URL:er vid unmount.
  useEffect(() => {
    const map = urlsRef.current;
    return () => {
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, []);

  const refresh = useCallback(async () => {
    const list = await listPhotos();
    setPhotos(list);
    syncUrls(list);
  }, [syncUrls]);

  const addPhoto = useCallback(
    async (blob: Blob, takenAt = Date.now()) => {
      const photo = await storeAdd(blob, takenAt);
      await refresh();
      return photo;
    },
    [refresh],
  );

  const removePhoto = useCallback(
    async (id: string) => {
      await storeRemove(id);
      await refresh();
    },
    [refresh],
  );

  const clearAll = useCallback(async () => {
    await storeClear();
    await refresh();
  }, [refresh]);

  const items = useMemo<GalleryPhoto[]>(
    () =>
      photos.map((p) => ({ ...p, url: urlsRef.current.get(p.id) ?? "" })),
    // urlVersion triggar omberäkning när URL-mappen ändrats
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [photos, urlVersion],
  );

  return { photos: items, addPhoto, removePhoto, clearAll };
}

/**
 * Lokalt bildlager för tagna stillbilder.
 *
 * Bilderna sparas som Blob i IndexedDB så att galleriet överlever omladdning.
 * Om IndexedDB saknas (SSR, privat läge, blockerad lagring) faller vi tillbaka
 * på ett minneslager som lever så länge fliken är öppen.
 */

export type StoredPhoto = {
  id: string;
  takenAt: number;
  blob: Blob;
};

export const MAX_PHOTOS = 30;

const DB_NAME = "rc-photos";
const STORE = "photos";
const DB_VERSION = 1;

let memoryFallback: StoredPhoto[] | null = null;

function useMemory(): StoredPhoto[] {
  if (!memoryFallback) memoryFallback = [];
  return memoryFallback;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const done = (db: IDBDatabase | null) => {
      if (settled) return;
      settled = true;
      resolve(db);
    };
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("takenAt", "takenAt");
        }
      };
      req.onsuccess = () => done(req.result);
      req.onerror = () => done(null);
      req.onblocked = () => done(null);
      // Om webbläsaren aldrig svarar (t.ex. blockerad lagring) – ge upp.
      setTimeout(() => done(null), 2000);
    } catch {
      done(null);
    }
  });
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE, mode);
      const req = run(transaction.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB-fel"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB avbröts"));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

function sortNewestFirst(photos: StoredPhoto[]): StoredPhoto[] {
  return [...photos].sort((a, b) => b.takenAt - a.takenAt);
}

export async function listPhotos(): Promise<StoredPhoto[]> {
  const db = await openDb();
  if (!db) return sortNewestFirst(useMemory());
  try {
    const all = await tx<StoredPhoto[]>(db, "readonly", (store) => store.getAll() as IDBRequest<StoredPhoto[]>);
    return sortNewestFirst(all ?? []);
  } catch {
    return sortNewestFirst(useMemory());
  } finally {
    db.close();
  }
}

export async function addPhoto(blob: Blob, takenAt = Date.now()): Promise<StoredPhoto> {
  const photo: StoredPhoto = {
    id: `${takenAt}-${Math.random().toString(36).slice(2, 8)}`,
    takenAt,
    blob,
  };

  const db = await openDb();
  if (!db) {
    const mem = useMemory();
    mem.push(photo);
    memoryFallback = sortNewestFirst(mem).slice(0, MAX_PHOTOS);
    return photo;
  }

  try {
    await tx(db, "readwrite", (store) => store.put(photo));
    // Trimma till de senaste MAX_PHOTOS.
    const all = await tx<StoredPhoto[]>(db, "readonly", (store) => store.getAll() as IDBRequest<StoredPhoto[]>);
    const excess = sortNewestFirst(all ?? []).slice(MAX_PHOTOS);
    for (const old of excess) {
      await tx(db, "readwrite", (store) => store.delete(old.id));
    }
  } catch {
    const mem = useMemory();
    mem.push(photo);
    memoryFallback = sortNewestFirst(mem).slice(0, MAX_PHOTOS);
  } finally {
    db.close();
  }
  return photo;
}

export async function removePhoto(id: string): Promise<void> {
  memoryFallback = (memoryFallback ?? []).filter((p) => p.id !== id);
  const db = await openDb();
  if (!db) return;
  try {
    await tx(db, "readwrite", (store) => store.delete(id));
  } catch {
    /* redan borttagen ur minneslagret */
  } finally {
    db.close();
  }
}

export async function clearPhotos(): Promise<void> {
  memoryFallback = [];
  const db = await openDb();
  if (!db) return;
  try {
    await tx(db, "readwrite", (store) => store.clear());
  } catch {
    /* inget att rensa */
  } finally {
    db.close();
  }
}

/** Filnamn i formatet rc-bild-ÅÅÅÅMMDD-HHMMSS.jpg */
export function photoFileName(takenAt: number): string {
  const d = new Date(takenAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `rc-bild-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
}

/** Laddar ner en blob till enheten. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

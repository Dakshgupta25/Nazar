/**
 * NAZAR Local Model Storage (Phase 8)
 *
 * Persists downloaded model assets securely on the user's device using IndexedDB,
 * with an in-memory fallback for test runners or environments where IndexedDB is unavailable.
 * Guarantees zero cloud egress: assets are loaded exclusively from local storage.
 */

import { StoredModelAsset } from '../types/models';

const DB_NAME = 'nazar_model_store';
const STORE_NAME = 'models';
const DB_VERSION = 1;

// In-memory fallback cache (used in Vitest / Node test runners)
const inMemoryStore = new Map<string, StoredModelAsset>();

/**
 * Opens or initializes the IndexedDB database.
 */
function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Saves a verified model asset to local storage.
 */
export async function saveModelAsset(asset: StoredModelAsset): Promise<void> {
  inMemoryStore.set(asset.id, asset);

  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(asset);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Retrieves a model asset from local storage.
 */
export async function loadModelAsset(modelId: string): Promise<StoredModelAsset | null> {
  if (inMemoryStore.has(modelId)) {
    return inMemoryStore.get(modelId) || null;
  }

  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(modelId);

      request.onsuccess = () => {
        const result = request.result as StoredModelAsset | undefined;
        if (result) {
          inMemoryStore.set(modelId, result);
          resolve(result);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Deletes a model asset (e.g. if corrupted or user uninstalled).
 */
export async function deleteModelAsset(modelId: string): Promise<void> {
  inMemoryStore.delete(modelId);

  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(modelId);

      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Lists all stored model asset IDs and metadata.
 */
export async function listStoredModelIds(): Promise<string[]> {
  const db = await openDatabase();
  if (!db) {
    return Array.from(inMemoryStore.keys());
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        const dbKeys = (request.result as string[]) || [];
        const memKeys = Array.from(inMemoryStore.keys());
        const unique = Array.from(new Set([...dbKeys, ...memKeys]));
        resolve(unique);
      };
      request.onerror = () => resolve(Array.from(inMemoryStore.keys()));
    } catch {
      resolve(Array.from(inMemoryStore.keys()));
    }
  });
}

/**
 * Clears all model assets from local storage.
 */
export async function clearAllModelAssets(): Promise<void> {
  inMemoryStore.clear();

  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Persistent-storage helpers. Browsers may evict IndexedDB under storage pressure unless persistence is granted. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export interface StorageStatus {
  supported: boolean;
  persisted: boolean;
  usage?: number;
  quota?: number;
}

export async function getStorageStatus(): Promise<StorageStatus> {
  if (!navigator.storage) return { supported: false, persisted: false };
  try {
    const [persisted, est] = await Promise.all([
      navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false),
      navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve({} as StorageEstimate),
    ]);
    return { supported: true, persisted, usage: est.usage, quota: est.quota };
  } catch {
    return { supported: true, persisted: false };
  }
}

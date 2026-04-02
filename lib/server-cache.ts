import { getAdminDb } from "@/lib/firebase-admin";

const CACHE_COLLECTION = "dashboard_cache";
const CACHE_EXPIRATION_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface ServerCacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Retrieves cached data from Firestore.
 */
export async function getServerCache<T>(panelId: string): Promise<T | null> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(CACHE_COLLECTION).doc(panelId).get();
    
    if (doc.exists) {
      const entry = doc.data() as ServerCacheEntry<T>;
      const now = Date.now();
      
      if (now - entry.timestamp < CACHE_EXPIRATION_MS) {
        return entry.data;
      }
    }
    return null;
  } catch (error) {
    console.error(`Error reading server cache for ${panelId}:`, error);
    return null;
  }
}

/**
 * Updates cached data in Firestore.
 */
export async function setServerCache<T>(panelId: string, data: T): Promise<void> {
  try {
    const db = getAdminDb();
    await db.collection(CACHE_COLLECTION).doc(panelId).set({
      data,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error(`Error updating server cache for ${panelId}:`, error);
  }
}

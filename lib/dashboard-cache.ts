import { db } from "@/lib/firebase"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"

export interface CacheEntry<T> {
  data: T
  lastUpdated: number
}

// 3 hours in milliseconds
const CACHE_DURATION_MS = 3 * 60 * 60 * 1000

/**
 * Retrieves cached data for a specific dashboard panel.
 * If the cache is expired or missing, it returns null.
 */
export async function getDashboardCache<T>(userId: string, panelId: string): Promise<T | null> {
  try {
    const docRef = doc(db, `users/${userId}/dashboard_cache`, panelId)
    const snapshot = await getDoc(docRef)

    if (snapshot.exists()) {
      const entry = snapshot.data() as CacheEntry<T>
      const now = Date.now()

      // Check if cache is still valid
      if (now - entry.lastUpdated < CACHE_DURATION_MS) {
        return entry.data
      }
    }
    return null
  } catch (error) {
    console.error(`Error reading cache for panel ${panelId}:`, error)
    return null
  }
}

/**
 * Saves fresh data into the dashboard cache for a specific panel.
 */
export async function updateDashboardCache<T>(userId: string, panelId: string, data: T): Promise<void> {
  try {
    const docRef = doc(db, `users/${userId}/dashboard_cache`, panelId)
    await setDoc(docRef, {
      data,
      lastUpdated: Date.now(),
      _serverTime: serverTimestamp() // For database reference if needed
    })
  } catch (error) {
    console.error(`Error updating cache for panel ${panelId}:`, error)
  }
}

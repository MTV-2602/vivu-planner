import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'vivu_cache_';
const TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry<T> {
  data: T;
  ts: number;
}

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.ts > TTL_MS) {
      AsyncStorage.removeItem(PREFIX + key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, ts: Date.now() };
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {}
}

export async function clearCache(key?: string): Promise<void> {
  try {
    if (key) {
      await AsyncStorage.removeItem(PREFIX + key);
    } else {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = (keys as string[]).filter(k => k.startsWith(PREFIX));
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch {}
}

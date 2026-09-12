import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Storage adapter chuẩn:
 * - Native (iOS/Android): expo-secure-store (mã hóa AES)
 * - Web: AsyncStorage (localStorage wrapper)
 */
const SecureStoreAdapter = {
  getItem:    (key: string)               => SecureStore.getItemAsync(key),
  setItem:    (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string)               => SecureStore.deleteItemAsync(key),
};

const storage = Platform.OS === 'web' ? AsyncStorage : SecureStoreAdapter;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

/**
 * supabase client CHUẨN — không override, không custom wrapper.
 * Auth hook (custom_access_token_hook) tự động gắn user_role vào JWT.
 * isAdmin: đọc từ JWT claim user_role === 'admin'
 */
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage,
      autoRefreshToken:  true,
      persistSession:    true,
      detectSessionInUrl: false,
    },
  }
);

/**
 * Utility: đọc role từ JWT access_token
 * Supabase Auth Hook đã gán user_role vào JWT claim khi login
 */
export function getRoleFromToken(accessToken: string): string {
  try {
    const base64 = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    return payload.user_role || 'user';
  } catch {
    return 'user';
  }
}

export const decodeJwtRole = getRoleFromToken;

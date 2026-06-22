import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
export const isMockAuth = false;

// Native: SecureStore | Web browser: localStorage | SSR (Node.js): no-op
const canUseLocalStorage = Platform.OS === 'web' && typeof localStorage !== 'undefined';
const MOCK_TOKEN = 'mock-token';
const MOCK_USER_KEY = 'vivu_mock_user';
const MOCK_TOKEN_KEY = 'vivu_mock_token';

const SecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS !== 'web') return SecureStore.getItemAsync(key);
    if (!canUseLocalStorage) return Promise.resolve(null);
    return Promise.resolve(localStorage.getItem(key));
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS !== 'web') return SecureStore.setItemAsync(key, value);
    if (!canUseLocalStorage) return Promise.resolve();
    localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    if (Platform.OS !== 'web') return SecureStore.deleteItemAsync(key);
    if (!canUseLocalStorage) return Promise.resolve();
    localStorage.removeItem(key);
    return Promise.resolve();
  },
};

async function getStoredMockUser() {
  const raw = await SecureStoreAdapter.getItem(MOCK_USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function setStoredMockUser(email: string, fullName?: string) {
  const user = {
    id: '00000000-0000-0000-0000-000000000000',
    email,
    user_metadata: fullName ? { full_name: fullName } : {},
  };

  await SecureStoreAdapter.setItem(MOCK_USER_KEY, JSON.stringify(user));
  await SecureStoreAdapter.setItem(MOCK_TOKEN_KEY, MOCK_TOKEN);
  return user;
}

async function clearStoredMockUser() {
  await SecureStoreAdapter.removeItem(MOCK_USER_KEY);
  await SecureStoreAdapter.removeItem(MOCK_TOKEN_KEY);
}

function createMockSession(user: any) {
  if (!user) return null;
  return {
    access_token: MOCK_TOKEN,
    token_type: 'bearer',
    user,
  };
}

const mockSupabase = {
  auth: {
    getSession: async () => {
      const user = await getStoredMockUser();
      return { data: { session: createMockSession(user) }, error: null };
    },
    getUser: async () => {
      const user = await getStoredMockUser();
      return { data: { user }, error: null };
    },
    signUp: async ({ email, options }: any) => {
      const user = await setStoredMockUser(email, options?.data?.full_name);
      return { data: { user, session: createMockSession(user) }, error: null };
    },
    signInWithPassword: async ({ email }: any) => {
      const user = await setStoredMockUser(email);
      return { data: { user, session: createMockSession(user) }, error: null };
    },
    signOut: async () => {
      await clearStoredMockUser();
      return { error: null };
    },
    onAuthStateChange: () => ({
      data: {
        subscription: {
          unsubscribe: () => {},
        },
      },
    }),
  },
};

const realSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

export const supabase = realSupabase;

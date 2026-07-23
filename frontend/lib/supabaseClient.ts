import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from './apiClient';
import { clearCache } from './cache';

const canUseLocalStorage = Platform.OS === 'web' && typeof localStorage !== 'undefined';
const SESSION_KEY = 'vivu_user_session';

const SecureStoreAdapter = {
  getItem: (key: string): Promise<string | null> => {
    if (Platform.OS !== 'web') return SecureStore.getItemAsync(key);
    if (!canUseLocalStorage) return Promise.resolve(null);
    return Promise.resolve(localStorage.getItem(key));
  },
  setItem: (key: string, value: string): Promise<void> => {
    if (Platform.OS !== 'web') return SecureStore.setItemAsync(key, value);
    if (!canUseLocalStorage) return Promise.resolve();
    localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string): Promise<void> => {
    if (Platform.OS !== 'web') return SecureStore.deleteItemAsync(key);
    if (!canUseLocalStorage) return Promise.resolve();
    localStorage.removeItem(key);
    return Promise.resolve();
  },
};

type AuthChangeListener = (event: string, session: any) => void;
const listeners = new Set<AuthChangeListener>();
let currentSession: any = null;
let isSessionLoaded = false;

// Async initializer
async function initializeSession() {
  try {
    const stored = await SecureStoreAdapter.getItem(SESSION_KEY);
    if (stored) {
      currentSession = JSON.parse(stored);
      // Validate session with backend
      const res = await apiClient.get('/auth/me', {
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`
        }
      });
      if (res.data?.user) {
        currentSession.user = res.data.user;
        await SecureStoreAdapter.setItem(SESSION_KEY, JSON.stringify(currentSession));
        notifyListeners('SIGNED_IN', currentSession);
      } else {
        currentSession = null;
        await SecureStoreAdapter.removeItem(SESSION_KEY);
        notifyListeners('SIGNED_OUT', null);
      }
    } else {
      notifyListeners('SIGNED_OUT', null);
    }
  } catch (err) {
    currentSession = null;
    await SecureStoreAdapter.removeItem(SESSION_KEY);
    notifyListeners('SIGNED_OUT', null);
  } finally {
    isSessionLoaded = true;
  }
}

// Call session initialization
initializeSession();

function notifyListeners(event: string, session: any) {
  listeners.forEach(cb => {
    try {
      cb(event, session);
    } catch (e) {
      console.error(e);
    }
  });
}

export const isMockAuth = false;

export const supabase: {
  auth: {
    getSession: () => Promise<{ data: { session: any }; error: any }>;
    getUser: () => Promise<{ data: { user: any }; error: any }>;
    signInWithPassword: (credentials: any) => Promise<{ data: { session: any; user: any }; error: any }>;
    signUp: (credentials: any) => Promise<{ data: { user: any; session: any }; error: any }>;
    signOut: () => Promise<{ error: any }>;
    onAuthStateChange: (cb: (event: any, session: any) => void) => { data: { subscription: { unsubscribe: () => void } } };
  }
} = {
  auth: {
    getSession: async () => {
      if (isSessionLoaded) {
        return { data: { session: currentSession }, error: null };
      }
      try {
        const stored = await SecureStoreAdapter.getItem(SESSION_KEY);
        const session = stored ? JSON.parse(stored) : null;
        currentSession = session;
        return { data: { session }, error: null };
      } catch {
        return { data: { session: null }, error: null };
      }
    },
    getUser: async () => {
      if (currentSession?.user) {
        return { data: { user: currentSession.user }, error: null };
      }
      try {
        const stored = await SecureStoreAdapter.getItem(SESSION_KEY);
        const session = stored ? JSON.parse(stored) : null;
        currentSession = session;
        return { data: { user: session?.user || null }, error: null };
      } catch {
        return { data: { user: null }, error: null };
      }
    },
     signInWithPassword: async ({ email, password }: any) => {
      try {
        const res = await apiClient.post('/auth/login', { email, password });
        if (res.data?.session) {
          currentSession = res.data.session;
          await SecureStoreAdapter.setItem(SESSION_KEY, JSON.stringify(currentSession));
          await clearCache(); // Clear old cached trips immediately
          notifyListeners('SIGNED_IN', currentSession);
          return { data: { session: currentSession, user: currentSession.user }, error: null };
        }
        throw new Error(res.data?.error || 'Đăng nhập không thành công');
      } catch (err: any) {
        const message = err.response?.data?.error || err.message || 'Đăng nhập không thành công';
        return { data: { session: null, user: null }, error: new Error(message) };
      }
    },
    signUp: async ({ email, password, options }: any) => {
      try {
        const fullName = options?.data?.full_name || '';
        const res = await apiClient.post('/auth/signup', { email, password, fullName });
        if (res.data?.success) {
          return { data: { user: res.data.user, session: null }, error: null };
        }
        throw new Error(res.data?.error || 'Đăng ký không thành công');
      } catch (err: any) {
        const message = err.response?.data?.error || err.message || 'Đăng ký không thành công';
        return { data: { user: null, session: null }, error: new Error(message) };
      }
    },
    signOut: async () => {
      try {
        await apiClient.post('/auth/logout');
      } catch (_) {}
      currentSession = null;
      await SecureStoreAdapter.removeItem(SESSION_KEY);
      await clearCache(); // Clear old cached trips on sign out
      notifyListeners('SIGNED_OUT', null);
      return { error: null };
    },
    onAuthStateChange: (cb: AuthChangeListener) => {
      listeners.add(cb);
      if (isSessionLoaded) {
        cb(currentSession ? 'SIGNED_IN' : 'SIGNED_OUT', currentSession);
      }
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              listeners.delete(cb);
            }
          }
        }
      };
    }
  }
};

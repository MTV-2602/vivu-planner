import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const isMockMode = !supabaseUrl || !supabaseAnonKey;

let supabaseInstance: any;

if (isMockMode) {
  console.warn('[ViVu Client] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. Operating in client-side Mock Auth mode.');
  
  const authListeners = new Set<any>();

  const mockAuth = {
    signUp: async ({ email }: { email: string }) => {
      const mockUser = { id: '00000000-0000-0000-0000-000000000000', email };
      localStorage.setItem('vivu_mock_user', JSON.stringify(mockUser));
      localStorage.setItem('vivu_mock_token', 'mock-token');
      
      authListeners.forEach(listener => 
        listener('SIGNED_IN', { user: mockUser, session: { access_token: 'mock-token', user: mockUser } })
      );
      
      return { data: { user: mockUser, session: { access_token: 'mock-token' } }, error: null };
    },

    signInWithPassword: async ({ email }: { email: string }) => {
      const mockUser = { id: '00000000-0000-0000-0000-000000000000', email };
      localStorage.setItem('vivu_mock_user', JSON.stringify(mockUser));
      localStorage.setItem('vivu_mock_token', 'mock-token');
      
      authListeners.forEach(listener => 
        listener('SIGNED_IN', { user: mockUser, session: { access_token: 'mock-token', user: mockUser } })
      );
      
      return { data: { user: mockUser, session: { access_token: 'mock-token' } }, error: null };
    },

    signOut: async () => {
      localStorage.removeItem('vivu_mock_user');
      localStorage.removeItem('vivu_mock_token');
      
      authListeners.forEach(listener => listener('SIGNED_OUT', null));
      return { error: null };
    },

    getSession: async () => {
      const userStr = localStorage.getItem('vivu_mock_user');
      const token = localStorage.getItem('vivu_mock_token');
      if (userStr && token) {
        const user = JSON.parse(userStr);
        return { data: { session: { access_token: token, user } }, error: null };
      }
      return { data: { session: null }, error: null };
    },

    getUser: async () => {
      const userStr = localStorage.getItem('vivu_mock_user');
      if (userStr) {
        return { data: { user: JSON.parse(userStr) }, error: null };
      }
      return { data: { user: null }, error: new Error('No user found in local storage') };
    },

    onAuthStateChange: (callback: any) => {
      authListeners.add(callback);
      
      // Fire current session state immediately
      const userStr = localStorage.getItem('vivu_mock_user');
      const token = localStorage.getItem('vivu_mock_token');
      if (userStr && token) {
        callback('SIGNED_IN', { user: JSON.parse(userStr), session: { access_token: token } });
      } else {
        callback('INITIAL_SESSION', null);
      }

      return {
        data: {
          subscription: {
            unsubscribe: () => {
              authListeners.delete(callback);
            }
          }
        }
      };
    }
  };

  supabaseInstance = {
    auth: mockAuth,
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          single: () => Promise.resolve({ data: null, error: null }),
          then: (cb: any) => cb({ data: [], error: null })
        }),
        order: () => Promise.resolve({ data: [], error: null }),
        then: (cb: any) => cb({ data: [], error: null })
      }),
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: {}, error: null })
        })
      }),
      update: () => ({
        eq: () => Promise.resolve({ data: {}, error: null })
      }),
      delete: () => ({
        eq: () => Promise.resolve({ data: {}, error: null })
      })
    })
  };
} else {
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = supabaseInstance;
export const isMockAuth = isMockMode;

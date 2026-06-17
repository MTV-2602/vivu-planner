import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey && !!supabaseServiceKey;

let supabaseInstance: any;
let supabaseAdminInstance: any;

if (isSupabaseConfigured) {
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  supabaseAdminInstance = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
} else {
  console.warn('WARNING: SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY are missing.');
  console.warn('Backend is running in mock database mode.');

  const mockDbQuery = {
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
        single: () => Promise.resolve({ data: { id: '00000000-0000-0000-0000-000000000000' }, error: null }),
        then: (cb: any) => cb({ data: [{ id: '00000000-0000-0000-0000-000000000000', day_number: 1 }], error: null })
      }),
      then: (cb: any) => cb({ data: [{ id: '00000000-0000-0000-0000-000000000000' }], error: null })
    }),
    update: () => ({
      eq: () => ({
        eq: () => Promise.resolve({ data: {}, error: null }),
        then: (cb: any) => cb({ data: {}, error: null })
      }),
      in: () => ({
        eq: () => Promise.resolve({ data: {}, error: null }),
        then: (cb: any) => cb({ data: {}, error: null })
      }),
      then: (cb: any) => cb({ data: {}, error: null })
    }),
    delete: () => ({
      eq: () => Promise.resolve({ data: {}, error: null }),
      then: (cb: any) => cb({ data: {}, error: null })
    })
  };

  const mockDbClient = {
    from: () => mockDbQuery
  };

  supabaseInstance = mockDbClient;
  supabaseAdminInstance = mockDbClient;
}

export const supabase = supabaseInstance;
export const supabaseAdmin = supabaseAdminInstance;

// Helper to create a request-scoped client using the user's JWT
export function getSupabaseUserClient(token: string) {
  if (isSupabaseConfigured) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });
  }
  return supabaseInstance;
}
export const isDbMocked = !isSupabaseConfigured;

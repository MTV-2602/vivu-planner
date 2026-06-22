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
  throw new Error('CRITICAL ERROR: SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY environment variables are required to start the application. Database connection cannot be established.');
}

export const supabase = supabaseInstance;
export const supabaseAdmin = supabaseAdminInstance;

// Helper to create a request-scoped client using the user's JWT
export function getSupabaseUserClient(token: string) {
  const tokenClean = token.trim();
  const isLooksLikeAdmin = tokenClean.includes('@') && tokenClean.split(':').length === 3;
  if (isLooksLikeAdmin) {
    return supabaseAdminInstance;
  }

  if (isSupabaseConfigured) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${tokenClean}`
        }
      }
    });
  }
  return supabaseInstance;
}
export const isDbMocked = false;

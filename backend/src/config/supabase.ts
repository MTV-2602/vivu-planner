import { createClient } from '@supabase/supabase-js';
import { ENV } from './env';

const url = ENV.SUPABASE_URL || 'https://placeholder.supabase.co';
const anonKey = ENV.SUPABASE_ANON_KEY || 'placeholder-anon-key';
const serviceKey = ENV.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key';

export const supabaseAuth = createClient(url, anonKey);
export const supabaseAdmin = createClient(url, serviceKey);
export const isDbMocked = !ENV.SUPABASE_URL;

export function getSupabaseUserClient(token?: string) {
  const tokenClean = token?.trim();
  if (tokenClean) {
    return createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${tokenClean}`,
        },
      },
    });
  }
  return supabaseAdmin;
}

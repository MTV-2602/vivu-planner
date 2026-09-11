import dotenv from 'dotenv';
import { SERVER_CONFIG } from '../constants';
dotenv.config();

export const ENV = {
  PORT: process.env.PORT || SERVER_CONFIG.DEFAULT_PORT,
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  PAYOS_CLIENT_ID: process.env.PAYOS_CLIENT_ID || '',
  PAYOS_API_KEY: process.env.PAYOS_API_KEY || '',
  PAYOS_CHECKSUM_KEY: process.env.PAYOS_CHECKSUM_KEY || '',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  MOMO_PARTNER_CODE: process.env.MOMO_PARTNER_CODE || '',
  MOMO_ACCESS_KEY: process.env.MOMO_ACCESS_KEY || '',
  MOMO_SECRET_KEY: process.env.MOMO_SECRET_KEY || '',
  SITE_URL: process.env.SITE_URL || ''
};

if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY || !ENV.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('Missing Supabase environment variables!');
}

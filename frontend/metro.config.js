// Auto-map Vercel environment variables for Expo Web build
if (process.env.SUPABASE_URL && !process.env.EXPO_PUBLIC_SUPABASE_URL) {
  process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
}
if (process.env.SUPABASE_ANON_KEY && !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
}
if (process.env.ADMIN_EMAIL && !process.env.EXPO_PUBLIC_ADMIN_EMAIL) {
  process.env.EXPO_PUBLIC_ADMIN_EMAIL = process.env.ADMIN_EMAIL;
}
if (process.env.API_BASE_URL && !process.env.EXPO_PUBLIC_API_BASE_URL) {
  process.env.EXPO_PUBLIC_API_BASE_URL = process.env.API_BASE_URL;
}

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });

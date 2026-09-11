const fs = require('fs');
const path = require('path');

// Tự động map SUPABASE_URL -> EXPO_PUBLIC_SUPABASE_URL để người dùng không phải điền lặp lại 2 lần trên Vercel
const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnon = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (supabaseUrl && supabaseAnon) {
  const envContent = `EXPO_PUBLIC_SUPABASE_URL=${supabaseUrl}\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${supabaseAnon}\n`;
  const targetDir = path.join(__dirname, '..', 'frontend');
  fs.writeFileSync(path.join(targetDir, '.env.local'), envContent, 'utf8');
  console.log('[prebuild] Đã tự động kết nối SUPABASE_URL và SUPABASE_ANON_KEY vào Frontend Expo thành công!');
} else {
  console.warn('[prebuild] Lưu ý: Chưa phát hiện SUPABASE_URL hoặc SUPABASE_ANON_KEY trong môi trường.');
}

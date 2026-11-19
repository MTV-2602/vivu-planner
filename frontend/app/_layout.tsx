import { Stack } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { useEffect } from 'react';
import {
  useFonts,
  BeVietnamPro_400Regular,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  BeVietnamPro_800ExtraBold,
} from '@expo-google-fonts/be-vietnam-pro';
import { Lora_400Regular, Lora_700Bold } from '@expo-google-fonts/lora';
import {
  Roboto_400Regular,
  Roboto_400Regular_Italic,
  Roboto_500Medium,
  Roboto_700Bold,
} from '@expo-google-fonts/roboto';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BrandSplash from '../components/loading/BrandSplash';
import { AuthProvider } from '../hooks/useAuth';
import ToastHost from '../components/ToastHost';
import '../global.css';

if (typeof (StyleSheet as any).setFlag === 'function') {
  (StyleSheet as any).setFlag('darkMode', 'class');
}

const queryClient = new QueryClient();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    BeVietnamPro_800ExtraBold,
    Lora_400Regular,
    Lora_700Bold,
    Roboto_400Regular,
    Roboto_400Regular_Italic,
    Roboto_500Medium,
    Roboto_700Bold,
  });

  // Xóa boot splash CSS (#vivu-boot) khỏi DOM sau khi React tree mount lần đầu trên web
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = typeof document !== 'undefined' ? document.getElementById('vivu-boot') : null;
    if (el) el.remove();
  }, []);

  // AuthProvider bọc cả splash và Stack để khởi tạo session song song khi tải font
  // ToastHost render một lần duy nhất bên ngoài Stack để hiển thị toast toàn cục
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {fontsLoaded ? <Stack screenOptions={{ headerShown: false }} /> : <BrandSplash />}
        <ToastHost />
      </AuthProvider>
    </QueryClientProvider>
  );
}

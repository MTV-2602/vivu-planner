import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import {
  useFonts,
  BeVietnamPro_400Regular,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  BeVietnamPro_800ExtraBold,
} from '@expo-google-fonts/be-vietnam-pro';
import { Lora_400Regular, Lora_700Bold } from '@expo-google-fonts/lora';
import '../global.css';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    BeVietnamPro_800ExtraBold,
    Lora_400Regular,
    Lora_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View className="flex-1 bg-brand-bg items-center justify-center">
        <ActivityIndicator color="#1F6F54" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}

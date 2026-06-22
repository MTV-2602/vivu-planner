import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Clock } from 'lucide-react-native';
import { BRAND_COLORS } from '../constants';

export default function SystemClock() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        new Intl.DateTimeFormat('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(now)
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-primary/10 border border-brand-primary/25">
      <Clock size={14} color={BRAND_COLORS.primary} />
      <Text className="text-brand-primary text-xs font-bold">{time} (VN)</Text>
    </View>
  );
}

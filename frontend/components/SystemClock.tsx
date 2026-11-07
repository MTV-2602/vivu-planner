import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Clock } from 'lucide-react-native';
import { BRAND_COLORS } from '../constants';

export default function SystemClock({ variant = 'dark' }: { variant?: 'light' | 'dark' }) {
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

  const isLight = variant === 'light';

  return (
    <View
      className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full ${
        isLight
          ? 'bg-white/10 border border-white/20'
          : 'bg-brand-primary/10 border border-brand-primary/25'
      }`}
    >
      <Clock size={14} color={isLight ? '#A3C2BB' : BRAND_COLORS.primary} />
      <Text
        className={`text-xs font-bold ${
          isLight ? 'text-[#E0EFEA]' : 'text-brand-primary'
        }`}
      >
        {time} (VN)
      </Text>
    </View>
  );
}

import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Clock } from 'lucide-react-native';

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

  const iconColor = isLight ? '#BAE6FD' : '#0f4c5c';
  const textColor = isLight ? '#F0F9FF' : '#0f4c5c';

  return (
    <View
      className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full ${
        isLight
          ? 'bg-white/10 border border-white/20'
          : 'bg-[#0f4c5c]/10 border border-[#0f4c5c]/25'
      }`}
    >
      <Clock size={14} color={iconColor} />
      <Text
        className="text-xs font-bold"
        style={{ color: textColor }}
      >
        {time} (VN)
      </Text>
    </View>
  );
}

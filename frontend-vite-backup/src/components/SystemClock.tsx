import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

export default function SystemClock() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      setTime(formatter.format(now));
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-primary/10 border border-brand-primary/25 text-brand-primary text-xs font-bold font-mono shadow-sm transition hover:scale-102">
      <Clock className="w-3.5 h-3.5 animate-pulse text-brand-primary" />
      <span>Giờ hệ thống: {time} (VN)</span>
    </div>
  );
}

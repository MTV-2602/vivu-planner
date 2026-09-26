import React from 'react';
import { View, Text } from 'react-native';
import { ShieldCheck, AlertTriangle, AlertCircle } from 'lucide-react-native';

interface LiveBudgetBarProps {
  totalBudget: number;
  currentCartTotal: number;
}

export default function LiveBudgetBar({ totalBudget, currentCartTotal }: LiveBudgetBarProps) {
  const percentage = totalBudget > 0 ? (currentCartTotal / totalBudget) * 100 : 0;

  let statusColor = '#1F6F54'; // 🟢 Green (Safe)
  let statusBg = 'rgba(31,111,84,0.1)';
  let statusText = 'An toàn trong ngân sách';
  let StatusIcon = ShieldCheck;

  if (percentage >= 100) {
    statusColor = '#B23B3B'; // 🔴 Red (Over Budget)
    statusBg = 'rgba(178,59,59,0.1)';
    statusText = 'Đã vượt ngân sách dự kiến!';
    StatusIcon = AlertCircle;
  } else if (percentage >= 80) {
    statusColor = '#F0B255'; // 🟡 Yellow (Warning)
    statusBg = 'rgba(240,178,85,0.15)';
    statusText = 'Cảnh báo: Sắp chạm trần ngân sách';
    StatusIcon = AlertTriangle;
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN').format(val) + ' đ';
  };

  return (
    <View
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(27,36,32,0.08)',
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100, backgroundColor: statusBg, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <StatusIcon size={13} color={statusColor} />
            <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 11, color: statusColor }}>
              {statusText}
            </Text>
          </View>
        </View>

        <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 13, color: statusColor }}>
          {percentage.toFixed(0)}%
        </Text>
      </View>

      {/* Progress Bar Container */}
      <View style={{ height: 10, borderRadius: 5, backgroundColor: 'rgba(27,36,32,0.08)', overflow: 'hidden' }}>
        <View
          style={{
            height: '100%',
            width: `${Math.min(percentage, 100)}%`,
            backgroundColor: statusColor,
            borderRadius: 5,
          }}
        />
      </View>

      {/* Total Breakdown */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 2 }}>
        <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 12, color: '#6E7B70' }}>
          Đã chọn: <Text style={{ fontFamily: 'BeVietnamPro_700Bold', color: '#1B2420' }}>{formatCurrency(currentCartTotal)}</Text>
        </Text>
        <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 12, color: '#6E7B70' }}>
          Trần: <Text style={{ fontFamily: 'BeVietnamPro_700Bold', color: '#1B2420' }}>{formatCurrency(totalBudget)}</Text>
        </Text>
      </View>
    </View>
  );
}

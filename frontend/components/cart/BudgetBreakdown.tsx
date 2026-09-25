import React from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Truck, Home, Utensils, Coffee, Ticket } from 'lucide-react-native';

export interface BudgetBreakdownData {
  transport: number;
  accommodation: number;
  dining: number;
  cafe: number;
  entertainment: number;
}

interface BudgetBreakdownProps {
  totalBudget: number;
  breakdown: BudgetBreakdownData;
  onChange: (newBreakdown: BudgetBreakdownData) => void;
}

const CATEGORIES = [
  { key: 'transport' as const, label: 'Di chuyển', icon: Truck, color: '#3B82F6', defaultPercent: 20 },
  { key: 'accommodation' as const, label: 'Khách sạn', icon: Home, color: '#2563EB', defaultPercent: 30 },
  { key: 'dining' as const, label: 'Ăn uống', icon: Utensils, color: '#B23B3B', defaultPercent: 25 },
  { key: 'cafe' as const, label: 'Cafe & View', icon: Coffee, color: '#F0B255', defaultPercent: 10 },
  { key: 'entertainment' as const, label: 'Vui chơi & Vé', icon: Ticket, color: '#8B5CF6', defaultPercent: 15 },
];

export default function BudgetBreakdown({ totalBudget, breakdown, onChange }: BudgetBreakdownProps) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN').format(val) + ' đ';
  };

  const handleAutoDistribute = () => {
    const updated: BudgetBreakdownData = {
      transport: Math.round((totalBudget * 0.20) / 1000) * 1000,
      accommodation: Math.round((totalBudget * 0.30) / 1000) * 1000,
      dining: Math.round((totalBudget * 0.25) / 1000) * 1000,
      cafe: Math.round((totalBudget * 0.10) / 1000) * 1000,
      entertainment: Math.round((totalBudget * 0.15) / 1000) * 1000,
    };
    onChange(updated);
  };

  const handleValueChange = (key: keyof BudgetBreakdownData, textVal: string) => {
    const num = parseInt(textVal.replace(/\D/g, ''), 10) || 0;
    onChange({
      ...breakdown,
      [key]: num,
    });
  };

  const allocatedTotal =
    (breakdown.transport || 0) +
    (breakdown.accommodation || 0) +
    (breakdown.dining || 0) +
    (breakdown.cafe || 0) +
    (breakdown.entertainment || 0);

  const isOverBudget = allocatedTotal > totalBudget;

  return (
    <View
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 18,
        borderWidth: 1,
        borderColor: 'rgba(27,36,32,0.08)',
        gap: 16,
        marginVertical: 12,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 15, color: '#1B2420' }}>
            Phân Bổ Ngân Sách Theo Tag
          </Text>
          <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 12, color: '#6E7B70', marginTop: 2 }}>
            Phân chia hạn mức chi tiêu dự kiến cho 5 mục chính
          </Text>
        </View>

        <Pressable
          onPress={handleAutoDistribute}
          style={({ pressed }) => [{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 100,
            backgroundColor: 'rgba(31,111,84,0.1)',
            opacity: pressed ? 0.8 : 1,
          }]}
        >
          <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 12, color: '#1F6F54' }}>
            ⚡ Tự động chia
          </Text>
        </Pressable>
      </View>

      {/* Allocated progress bar */}
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 12, color: isOverBudget ? '#B23B3B' : '#1F6F54' }}>
            Đã phân bổ: {formatCurrency(allocatedTotal)}
          </Text>
          <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 12, color: '#6E7B70' }}>
            Tổng trần: {formatCurrency(totalBudget)}
          </Text>
        </View>

        <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(27,36,32,0.08)', overflow: 'hidden', flexDirection: 'row' }}>
          {CATEGORIES.map((cat) => {
            const val = breakdown[cat.key] || 0;
            const pct = totalBudget > 0 ? (val / totalBudget) * 100 : 0;
            return (
              <View
                key={cat.key}
                style={{
                  width: `${Math.min(pct, 100)}%`,
                  height: '100%',
                  backgroundColor: cat.color,
                }}
              />
            );
          })}
        </View>
      </View>

      {/* Input list */}
      <View style={{ gap: 10 }}>
        {CATEGORIES.map((cat) => {
          const IconComp = cat.icon;
          const val = breakdown[cat.key] || 0;
          return (
            <View
              key={cat.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 10,
                backgroundColor: 'rgba(243,236,220,0.4)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: `${cat.color}15`, alignItems: 'center', justifyContent: 'center' }}>
                  <IconComp size={16} color={cat.color} />
                </View>
                <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 13, color: '#1B2420' }}>
                  {cat.label}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TextInput
                  value={val > 0 ? val.toString() : ''}
                  onChangeText={(text) => handleValueChange(cat.key, text)}
                  placeholder="0"
                  keyboardType="numeric"
                  style={{
                    fontFamily: 'BeVietnamPro_700Bold',
                    fontSize: 13,
                    color: '#1B2420',
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1,
                    borderColor: 'rgba(27,36,32,0.12)',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    minWidth: 90,
                    textAlign: 'right',
                  }}
                />
                <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 12, color: '#6E7B70' }}>đ</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

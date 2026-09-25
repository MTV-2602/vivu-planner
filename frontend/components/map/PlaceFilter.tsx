import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Utensils, Coffee, Home, Ticket, Filter } from 'lucide-react-native';

export type CategoryFilter = 'all' | 'dining' | 'cafe' | 'hotel' | 'attraction';

interface PlaceFilterProps {
  selectedCategory: CategoryFilter;
  onSelectCategory: (cat: CategoryFilter) => void;
  maxPrice: number;
  onChangeMaxPrice: (price: number) => void;
}

const CATEGORIES: { key: CategoryFilter; label: string; icon: any; color: string }[] = [
  { key: 'all', label: 'Tất cả', icon: Filter, color: '#1B2420' },
  { key: 'dining', label: '🔴 Ăn uống', icon: Utensils, color: '#B23B3B' },
  { key: 'cafe', label: '🟡 Cafe & View', icon: Coffee, color: '#F0B255' },
  { key: 'hotel', label: '🔵 Khách sạn', icon: Home, color: '#2563EB' },
  { key: 'attraction', label: '🟣 Vui chơi', icon: Ticket, color: '#8B5CF6' },
];

const PRICE_STEPS = [
  { label: 'Tất cả giá', value: 2000000 },
  { label: '< 100k', value: 100000 },
  { label: '< 300k', value: 300000 },
  { label: '< 500k', value: 500000 },
];

export default function PlaceFilter({
  selectedCategory,
  onSelectCategory,
  maxPrice,
  onChangeMaxPrice,
}: PlaceFilterProps) {
  return (
    <View
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.92)',
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(27,36,32,0.08)',
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      }}
    >
      {/* Category Pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.key;
          return (
            <Pressable
              key={cat.key}
              onPress={() => onSelectCategory(cat.key)}
              style={({ pressed }) => [{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 100,
                backgroundColor: isSelected ? '#1F6F54' : '#F3ECDC',
                borderWidth: 1,
                borderColor: isSelected ? '#1F6F54' : 'rgba(27,36,32,0.08)',
                opacity: pressed ? 0.8 : 1,
              }]}
            >
              <Text
                style={{
                  fontFamily: isSelected ? 'BeVietnamPro_700Bold' : 'BeVietnamPro_600SemiBold',
                  fontSize: 12,
                  color: isSelected ? '#FFFFFF' : '#1B2420',
                }}
              >
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Price Filter Chips */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 11, color: '#6E7B70' }}>
          Mức giá:
        </Text>
        {PRICE_STEPS.map((step) => {
          const isSelected = maxPrice === step.value;
          return (
            <Pressable
              key={step.value}
              onPress={() => onChangeMaxPrice(step.value)}
              style={({ pressed }) => [{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 8,
                backgroundColor: isSelected ? 'rgba(31,111,84,0.12)' : 'transparent',
                borderWidth: 1,
                borderColor: isSelected ? '#1F6F54' : 'rgba(27,36,32,0.12)',
                opacity: pressed ? 0.8 : 1,
              }]}
            >
              <Text
                style={{
                  fontFamily: isSelected ? 'BeVietnamPro_700Bold' : 'BeVietnamPro_400Regular',
                  fontSize: 11,
                  color: isSelected ? '#1F6F54' : '#6E7B70',
                }}
              >
                {step.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

import React, { useState, useEffect } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { BRAND_COLORS } from '../../../constants';

export interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

export default function SearchInput({
  value,
  onChangeText,
  placeholder = 'Tìm kiếm...',
  debounceMs = 300,
  className = '',
}: SearchInputProps) {
  const [innerValue, setInnerValue] = useState(value);

  // Sync internal state when controlled prop changes
  useEffect(() => {
    setInnerValue(value);
  }, [value]);

  // Debounced propagation
  useEffect(() => {
    const handler = setTimeout(() => {
      if (innerValue !== value) {
        onChangeText(innerValue);
      }
    }, debounceMs);

    return () => clearTimeout(handler);
  }, [innerValue, debounceMs]);

  const handleClear = () => {
    setInnerValue('');
    onChangeText('');
  };

  return (
    <View
      className={`flex-row items-center bg-white border border-brand-line/50 rounded-xl px-3 py-2 gap-2 shadow-xs ${className}`}
      style={{ borderColor: BRAND_COLORS.line }}
    >
      <Search size={16} color={BRAND_COLORS.textMuted} />
      <TextInput
        value={innerValue}
        onChangeText={setInnerValue}
        placeholder={placeholder}
        placeholderTextColor={BRAND_COLORS.textMuted}
        className="flex-1 text-xs text-brand-text p-0 outline-none"
        style={{
          fontSize: 13,
          color: BRAND_COLORS.text,
          borderWidth: 0,
        }}
      />
      {innerValue ? (
        <Pressable onPress={handleClear} hitSlop={8} style={{ cursor: 'pointer' as any }}>
          <X size={15} color={BRAND_COLORS.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

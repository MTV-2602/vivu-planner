import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Platform, ActivityIndicator } from 'react-native';
import { Sparkles, ArrowRight } from 'lucide-react-native';

interface HeroAISearchProps {
  onGenerate?: (promptText: string) => void;
}

const QUICK_TAGS = [
  '🌿 Du lịch chữa lành',
  '🛵 Phượt Hà Giang',
  '💎 Hidden gems Phú Quốc',
  '💰 Dưới 2 triệu',
];

export default function HeroAISearch({ onGenerate }: HeroAISearchProps) {
  const [promptText, setPromptText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleGenerate = () => {
    if (!promptText.trim() && !isLoading) return;
    setIsLoading(true);
    setIsSuccess(false);

    setTimeout(() => {
      setIsLoading(false);
      setIsSuccess(true);
      if (onGenerate) {
        onGenerate(promptText);
      }
      setTimeout(() => setIsSuccess(false), 3000);
    }, 1500);
  };

  const handleTagClick = (tag: string) => {
    const cleanTagText = tag.replace(/^[^\w\s\u00C0-\u1EF9]+/, '').trim();
    if (!promptText) {
      setPromptText(`Lập lịch trình ${cleanTagText}`);
    } else if (!promptText.includes(cleanTagText)) {
      setPromptText((prev) => `${prev}, ${cleanTagText}`);
    }
  };

  return (
    <View style={{
      width: '100%',
      maxWidth: 860,
      alignSelf: 'center',
      borderRadius: 28,
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderWidth: 1,
      borderColor: 'rgba(229, 231, 235, 0.9)',
      padding: 16,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.12,
      shadowRadius: 32,
      elevation: 10,
      ...(Platform.OS === 'web' ? {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      } as any : {}),
    }}>
      {/* Input Bar Container */}
      <View style={{
        flexDirection: Platform.OS === 'web' ? 'row' : 'column',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}>
        {/* Left Glowing Sparkles Icon */}
        <View style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: 'rgba(16, 185, 129, 0.25)',
        }}>
          <Sparkles size={22} color="#059669" />
        </View>

        {/* Center Text Input */}
        <TextInput
          value={promptText}
          onChangeText={setPromptText}
          onSubmitEditing={handleGenerate}
          placeholder="Lên lịch trình: '3 ngày ở Đà Lạt tìm quán cà phê yên tĩnh, ngân sách 2 triệu'..."
          placeholderTextColor="#9CA3AF"
          style={{
            flex: 1,
            width: '100%',
            color: '#111827',
            fontSize: 15,
            fontWeight: '500',
            fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
            paddingVertical: 10,
            paddingHorizontal: 6,
            outlineStyle: 'none',
          } as any}
        />

        {/* Right CTA Button - Signature Layla AI Black Pill Button */}
        <Pressable
          onPress={handleGenerate}
          disabled={isLoading}
          style={({ pressed }) => [{
            backgroundColor: '#111827',
            paddingHorizontal: 24,
            paddingVertical: 13,
            borderRadius: 100,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: Platform.OS === 'web' ? 'auto' : '100%',
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
            ...(Platform.OS === 'web' ? {
              boxShadow: '0 4px 14px rgba(17, 24, 39, 0.25)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            } as any : {}),
          }]}
        >
          {isLoading ? (
            <>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 14 }}>Đang xử lý AI...</Text>
            </>
          ) : (
            <>
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Lập lịch ngay</Text>
              <ArrowRight size={17} color="#FFFFFF" />
            </>
          )}
        </Pressable>
      </View>

      {/* Quick Context Tags (Below the input bar) */}
      <View style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        marginTop: 14,
        paddingHorizontal: 4,
      }}>
        <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: '600', marginRight: 4 }}>
          Gợi ý nhanh:
        </Text>

        {QUICK_TAGS.map((tag, idx) => (
          <Pressable
            key={idx}
            onPress={() => handleTagClick(tag)}
            style={({ pressed }) => [{
              backgroundColor: '#F3F4F6',
              borderWidth: 1,
              borderColor: '#E5E7EB',
              borderRadius: 100,
              paddingHorizontal: 14,
              paddingVertical: 6,
              opacity: pressed ? 0.75 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
              ...(Platform.OS === 'web' ? {
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              } as any : {}),
            }]}
          >
            <Text style={{ color: '#374151', fontSize: 12, fontWeight: '600' }}>
              {tag}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Loading Skeleton Simulation Overlay */}
      {isLoading && (
        <View style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 16,
          backgroundColor: '#F9FAFB',
          borderWidth: 1,
          borderColor: '#10B981',
          gap: 12,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#059669' }} />
            <Text style={{ color: '#059669', fontSize: 13, fontWeight: '700' }}>
              Gemini AI đang phân tích địa điểm & dự báo thời tiết...
            </Text>
          </View>
          {/* Skeleton bars */}
          <View style={{ height: 12, width: '85%', borderRadius: 6, backgroundColor: '#E5E7EB' }} />
          <View style={{ height: 12, width: '60%', borderRadius: 6, backgroundColor: '#F3F4F6' }} />
        </View>
      )}

      {/* Success Notification Feedback */}
      {isSuccess && (
        <View style={{
          marginTop: 14,
          padding: 12,
          borderRadius: 14,
          backgroundColor: '#ECFDF5',
          borderWidth: 1,
          borderColor: '#A7F3D0',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}>
          <Sparkles size={16} color="#059669" />
          <Text style={{ color: '#047857', fontSize: 13, fontWeight: '700' }}>
            Đã khởi tạo lịch trình thành công! Đang đồng bộ tới Workspace...
          </Text>
        </View>
      )}
    </View>
  );
}

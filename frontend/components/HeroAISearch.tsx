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
      backgroundColor: 'rgba(15, 23, 42, 0.78)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.25)',
      padding: 16,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.35,
      shadowRadius: 36,
      elevation: 12,
      ...(Platform.OS === 'web' ? {
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
      } as any : {}),
    }}>
      {/* Input Bar Container */}
      <View style={{
        flexDirection: Platform.OS === 'web' ? 'row' : 'column',
        alignItems: 'center',
        gap: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}>
        {/* Left Glowing Sparkles Icon */}
        <View style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          backgroundColor: 'rgba(56, 189, 248, 0.2)',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: 'rgba(56, 189, 248, 0.4)',
          ...(Platform.OS === 'web' ? {
            boxShadow: '0 0 16px rgba(56, 189, 248, 0.35)',
          } as any : {}),
        }}>
          <Sparkles size={22} color="#38BDF8" />
        </View>

        {/* Center Text Input */}
        <TextInput
          value={promptText}
          onChangeText={setPromptText}
          onSubmitEditing={handleGenerate}
          placeholder="Lên lịch trình: '3 ngày ở Đà Lạt tìm quán cà phê yên tĩnh, ngân sách 2 triệu'..."
          placeholderTextColor="rgba(255, 255, 255, 0.6)"
          style={{
            flex: 1,
            width: '100%',
            color: '#FFFFFF',
            fontSize: 15,
            fontWeight: '500',
            fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
            paddingVertical: 10,
            paddingHorizontal: 6,
            outlineStyle: 'none',
          } as any}
        />

        {/* Right CTA Button */}
        <Pressable
          onPress={handleGenerate}
          disabled={isLoading}
          style={({ pressed }) => [{
            backgroundColor: '#0284C7',
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
              boxShadow: '0 4px 20px rgba(2, 132, 199, 0.45)',
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
        <Text style={{ color: 'rgba(255, 255, 255, 0.75)', fontSize: 12, fontWeight: '600', marginRight: 4 }}>
          Gợi ý nhanh:
        </Text>

        {QUICK_TAGS.map((tag, idx) => (
          <Pressable
            key={idx}
            onPress={() => handleTagClick(tag)}
            style={({ pressed }) => [{
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.22)',
              borderRadius: 100,
              paddingHorizontal: 14,
              paddingVertical: 6,
              opacity: pressed ? 0.75 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
              ...(Platform.OS === 'web' ? {
                backdropFilter: 'blur(8px)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              } as any : {}),
            }]}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>
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
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          borderWidth: 1,
          borderColor: '#38BDF8',
          gap: 12,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#38BDF8' }} />
            <Text style={{ color: '#38BDF8', fontSize: 13, fontWeight: '700' }}>
              Gemini AI đang phân tích địa điểm & dự báo thời tiết...
            </Text>
          </View>
          {/* Skeleton bars */}
          <View style={{ height: 12, width: '85%', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.15)' }} />
          <View style={{ height: 12, width: '60%', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.1)' }} />
        </View>
      )}

      {/* Success Notification Feedback */}
      {isSuccess && (
        <View style={{
          marginTop: 14,
          padding: 12,
          borderRadius: 14,
          backgroundColor: 'rgba(56, 189, 248, 0.2)',
          borderWidth: 1,
          borderColor: 'rgba(56, 189, 248, 0.4)',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}>
          <Sparkles size={16} color="#38BDF8" />
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
            Đã khởi tạo lịch trình thành công! Đang đồng bộ tới Workspace...
          </Text>
        </View>
      )}
    </View>
  );
}

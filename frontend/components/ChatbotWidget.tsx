import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, Platform, Dimensions
} from 'react-native';
import { MessageSquare, Send, Sparkles, X, Bot, User } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useChatbot } from '../context/ChatbotContext';
import { apiClient } from '../lib/apiClient';
import { BRAND_COLORS } from '../constants';

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  adaptedItinerary?: any;
  diff?: string;
  previousSnapshot?: any;
  isCreateTrip?: boolean;
  createTripParams?: any;
}

export function ChatbotWidget() {
  const { tripId, triggerPreview } = useChatbot();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);
  
  const scrollViewRef = useRef<ScrollView>(null);

  const setDefaultWelcomeMessage = () => {
    if (tripId) {
      setMessages([
        {
          role: 'model',
          content: 'Xin chào! Tôi là ViVu AI. Tôi đã nhận diện được chuyến đi của bạn. Bạn muốn tôi giúp điều chỉnh hoạt động nào, thêm địa điểm ăn uống hay thay đổi chỗ nghỉ không?'
        }
      ]);
    } else {
      setMessages([
        {
          role: 'model',
          content: 'Xin chào! Tôi là ViVu AI, trợ lý du lịch Việt Nam của bạn. Tôi có thể tư vấn hành trình, gợi ý điểm ăn chơi hoặc giải đáp thắc mắc về du lịch cho bạn.'
        }
      ]);
    }
  };

  const loadChatHistory = async () => {
    try {
      const endpoint = tripId ? `/trips/${tripId}/chat` : '/trips/chat';
      const response = await apiClient.get(endpoint);
      if (response.data?.success && response.data?.messages) {
        const loadedMessages = response.data.messages.map((m: any) => ({
          role: m.role,
          content: m.content,
          adaptedItinerary: m.adapted_itinerary,
          diff: m.diff,
          previousSnapshot: m.previous_snapshot,
          isCreateTrip: m.is_create_trip,
          createTripParams: m.create_trip_params
        }));
        
        if (loadedMessages.length > 0) {
          setMessages(loadedMessages);
          return;
        }
      }
      setDefaultWelcomeMessage();
    } catch (err) {
      console.warn('[ChatbotWidget] Failed to load chat history:', err);
      setDefaultWelcomeMessage();
    }
  };

  // Reset messages when tripId changes, and load history if widget is open
  useEffect(() => {
    setDefaultWelcomeMessage();
    if (isOpen) {
      loadChatHistory();
    }
  }, [tripId]);

  // Load history when chatbot is opened and it hasn't loaded yet
  useEffect(() => {
    if (isOpen && messages.length <= 1) {
      loadChatHistory();
    }
  }, [isOpen]);

  // Scroll to bottom whenever messages list updates
  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage = inputText.trim();
    setInputText('');
    
    // Add user message to state
    const newMessages = [...messages, { role: 'user', content: userMessage } as ChatMessage];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Map messages history to format requested by backend
      // Backend expects: history: Array<{ role: 'user' | 'model', content: string }>
      // Excluding the last user message which is sent in the body.
      // Skip the first static welcome message (role: 'model') to ensure history starts with a user message.
      const history = messages
        .slice(1)
        .map(m => ({
          role: m.role,
          content: m.content
        }));

      const endpoint = tripId ? `/trips/${tripId}/chat` : '/trips/chat';
      const response = await apiClient.post(endpoint, {
        message: userMessage,
        history
      });

      if (response.data?.success) {
        const { responseText, hasChanges, adaptedItinerary, diff, previousSnapshot, isCreateTrip, createTripParams } = response.data;
        
        setMessages(prev => [
          ...prev,
          {
            role: 'model',
            content: responseText,
            adaptedItinerary: hasChanges ? adaptedItinerary : undefined,
            diff: hasChanges ? diff : undefined,
            previousSnapshot: hasChanges ? previousSnapshot : undefined,
            isCreateTrip: isCreateTrip ? true : undefined,
            createTripParams: isCreateTrip ? createTripParams : undefined
          }
        ]);
      } else {
        throw new Error('Response unsuccessful');
      }
    } catch (error: any) {
      console.error('[Chatbot] Error sending message:', error);
      const errorMsg = error.response?.data?.error || error.response?.data?.details || error.message || 'Lỗi không xác định';
      setMessages(prev => [
        ...prev,
        {
          role: 'model',
          content: `Xin lỗi, tôi đã gặp lỗi khi xử lý tin nhắn của bạn. Chi tiết: ${errorMsg}`
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTripFromChat = async (params: any) => {
    if (isCreatingTrip) return;
    setIsCreatingTrip(true);
    try {
      const response = await apiClient.post('/trips', {
        title: params.title || `Du hí ${params.destination_city}`,
        destination_city: params.destination_city,
        start_date: params.start_date,
        end_date: params.end_date,
        budget_total: Number(params.budget_total) || 5000000,
        traveler_count: Number(params.traveler_count) || 1,
        traveler_type: params.traveler_type || 'solo',
        special_requirements: params.special_requirements || '',
        preferences: { food: true, nature: true, culture: true, entertainment: true } // default preferences
      });

      if (response.status === 201 && response.data?.id) {
        setIsOpen(false); // Close chatbot
        router.push(`/chuyen-di/${response.data.id}`); // Redirect to details page
      } else {
        alert(response.data?.error || 'Không thể tạo chuyến đi. Vui lòng kiểm tra lại ngân sách.');
      }
    } catch (err: any) {
      console.error('[ChatbotWidget] Create trip failed:', err);
      const errMsg = err.response?.data?.error || err.message || 'Lỗi kết nối';
      alert(`Lỗi tạo chuyến đi: ${errMsg}`);
    } finally {
      setIsCreatingTrip(false);
    }
  };

  if (!isOpen) {
    return (
      <Pressable
        onPress={() => setIsOpen(true)}
        className="bg-brand-primary items-center justify-center shadow-lg"
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          position: 'absolute',
          bottom: 24,
          right: 24,
          zIndex: 1000,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 6,
          elevation: 8
        }}
      >
        <MessageSquare size={24} color="white" />
      </Pressable>
    );
  }

  return (
    <View
      className="bg-brand-bgDark border border-brand-line/50 flex-col shadow-2xl"
      style={{
        width: Platform.OS === 'web' ? 360 : Dimensions.get('window').width * 0.9,
        height: 500,
        borderRadius: 24,
        position: 'absolute',
        bottom: 24,
        right: Platform.OS === 'web' ? 24 : Dimensions.get('window').width * 0.05,
        zIndex: 1000,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 10,
        overflow: 'hidden',
        backgroundColor: '#14201B' // brand-bgDark
      }}
    >
      {/* Header */}
      <View
        className="flex-row justify-between items-center px-4 py-3.5"
        style={{ backgroundColor: '#134A37', borderBottomWidth: 1, borderBottomColor: 'rgba(27,36,32,0.2)' }}
      >
        <View className="flex-row items-center gap-2.5">
          <View className="bg-brand-primary p-1.5 rounded-full">
            <Sparkles size={16} color="white" />
          </View>
          <View>
            <Text className="text-white font-display font-extrabold text-sm">Trợ lý ảo ViVu AI</Text>
            <Text className="text-white/70 text-[10px] font-semibold">
              {tripId ? 'Đang hỗ trợ sửa lịch trình' : 'Tư vấn du lịch Việt Nam'}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => setIsOpen(false)} className="p-1 rounded-full bg-white/10 hover:bg-white/20">
          <X size={16} color="white" />
        </Pressable>
      </View>

      {/* Active Trip Banner Indicator */}
      {tripId && (
        <View 
          className="flex-row items-center justify-center py-2 px-3 gap-1.5"
          style={{ backgroundColor: '#1F6F54' }}
        >
          <Sparkles size={11} color="#FFF2E0" />
          <Text className="text-[10px] text-white font-bold" style={{ color: '#FFF2E0' }}>
            Chế độ tự động sửa lịch trình đang bật cho chuyến đi này
          </Text>
        </View>
      )}

      {/* Message List */}
      <ScrollView
        ref={scrollViewRef}
        className="flex-1 p-4"
        contentContainerStyle={{ gap: 16, paddingBottom: 16 }}
      >
        {messages.map((msg, index) => {
          const isModel = msg.role === 'model';
          return (
            <View
              key={index}
              className={`max-w-[85%] flex-row gap-2 ${isModel ? 'self-start' : 'self-end'}`}
            >
              {isModel && (
                <View className="w-6 h-6 rounded-full bg-brand-primary/20 items-center justify-center self-end mb-1">
                  <Bot size={12} color={BRAND_COLORS.primary} />
                </View>
              )}
              <View
                className={`p-3 rounded-2xl ${
                  isModel
                    ? 'bg-brand-bgAlt rounded-bl-none'
                    : 'bg-brand-primary rounded-br-none'
                }`}
                style={isModel ? { backgroundColor: '#F3ECDC', flexShrink: 1 } : { backgroundColor: '#1F6F54', flexShrink: 1 }}
              >
                <Text
                  className="font-sans"
                  style={isModel ? { color: '#090F0C', fontSize: 14, lineHeight: 20 } : { color: '#ffffff', fontSize: 14, lineHeight: 20 }}
                >
                  {msg.content}
                </Text>

                {/* If changes are proposed, show the action button */}
                {isModel && msg.adaptedItinerary && msg.diff && (
                  <Pressable
                    onPress={() => triggerPreview(msg.adaptedItinerary, msg.diff!, msg.previousSnapshot)}
                    className="mt-3.5 bg-brand-accent px-3 py-2 rounded-xl flex-row items-center gap-1.5 align-middle self-start"
                    style={{ backgroundColor: '#E2703A' }}
                  >
                    <Sparkles size={12} color="white" />
                    <Text className="text-white text-[10px] font-bold">Xem thay đổi & Áp dụng</Text>
                  </Pressable>
                )}

                {/* If it's a create trip recommendation, show the creation button */}
                {isModel && msg.isCreateTrip && msg.createTripParams && (
                  <Pressable
                    onPress={() => handleCreateTripFromChat(msg.createTripParams)}
                    disabled={isCreatingTrip}
                    className="mt-3.5 bg-brand-primary px-3 py-2 rounded-xl flex-row items-center gap-1.5 align-middle self-start"
                    style={{ backgroundColor: '#1F6F54', opacity: isCreatingTrip ? 0.6 : 1 }}
                  >
                    {isCreatingTrip ? (
                      <ActivityIndicator size="small" color="white" style={{ marginRight: 2 }} />
                    ) : (
                      <Sparkles size={12} color="white" />
                    )}
                    <Text className="text-white text-[10px] font-bold">
                      {isCreatingTrip ? 'Đang tạo...' : `Tạo chuyến đi: ${msg.createTripParams.destination_city}`}
                    </Text>
                  </Pressable>
                )}
              </View>
              {!isModel && (
                <View className="w-6 h-6 rounded-full bg-brand-accent/20 items-center justify-center self-end mb-1">
                  <User size={12} color={BRAND_COLORS.accent} />
                </View>
              )}
            </View>
          );
        })}

        {isLoading && (
          <View className="self-start flex-row gap-2 items-center">
            <View className="w-6 h-6 rounded-full bg-brand-primary/20 items-center justify-center">
              <Bot size={12} color={BRAND_COLORS.primary} />
            </View>
            <View className="p-3 rounded-2xl bg-brand-bgAlt rounded-bl-none flex-row gap-1.5 items-center" style={{ backgroundColor: '#F3ECDC', flexShrink: 1 }}>
              <ActivityIndicator size="small" color={BRAND_COLORS.primary} />
              <Text className="text-[10px] text-brand-textMuted font-serif italic">ViVu AI đang xử lý...</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input area */}
      <View
        className="flex-row items-center p-3 gap-2"
        style={{ borderTopWidth: 1, borderTopColor: 'rgba(27,36,32,0.12)', backgroundColor: '#14201B' }}
      >
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
          placeholder="Nhập tin nhắn..."
          placeholderTextColor="#6E7B70"
          className="flex-1 px-4 py-2.5 rounded-full border border-brand-line/30 text-white text-sm"
          style={{
            backgroundColor: '#1b2d26',
            borderColor: 'rgba(27,36,32,0.3)',
            height: 38,
            paddingVertical: 0,
            fontSize: 13.5
          }}
        />
        <Pressable
          onPress={handleSend}
          disabled={!inputText.trim() || isLoading}
          className="w-9 h-9 bg-brand-primary rounded-full items-center justify-center"
          style={(!inputText.trim() || isLoading) ? { opacity: 0.5 } : undefined}
        >
          <Send size={16} color="white" />
        </Pressable>
      </View>
    </View>
  );
}

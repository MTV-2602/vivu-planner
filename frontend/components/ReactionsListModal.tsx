import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, Modal, Pressable, ActivityIndicator, Image, ScrollView, Platform } from 'react-native';
import { X } from 'lucide-react-native';
import { api } from '../lib/api';

interface ReactionUser {
  user_id: string;
  reaction_type: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
}

interface ReactionsListModalProps {
  visible: boolean;
  onClose: () => void;
  postId: string | null;
  totalReactions?: number;
}

const REACTION_ICONS: Record<string, string> = {
  LIKE: '👍',
  LOVE: '❤️',
  CARE: '🥰',
  HAHA: '😆',
  WOW: '😮',
  SAD: '😢',
  ANGRY: '😡'
};

const REACTION_LABELS: Record<string, string> = {
  LIKE: 'Thích',
  LOVE: 'Yêu thích',
  CARE: 'Thương thương',
  HAHA: 'Haha',
  WOW: 'Wow',
  SAD: 'Buồn',
  ANGRY: 'Phẫn nộ'
};

export default function ReactionsListModal({
  visible,
  onClose,
  postId,
  totalReactions = 0
}: ReactionsListModalProps) {
  const [loading, setLoading] = useState(false);
  const [reactions, setReactions] = useState<ReactionUser[]>([]);
  const [activeTab, setActiveTab] = useState<string>('ALL'); // 'ALL' or reaction type

  useEffect(() => {
    if (visible && postId) {
      loadReactions();
    } else {
      setReactions([]);
      setActiveTab('ALL');
    }
  }, [visible, postId]);

  const loadReactions = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/posts/${postId}/reactions`);
      if (res.data && res.data.reactions) {
        const list = res.data.reactions.map((r: any) => ({
          ...r,
          reaction_type: String(r.reaction_type || r.reaction || 'LIKE').toUpperCase(),
        }));
        setReactions(list);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách cảm xúc:', err);
    } finally {
      setLoading(false);
    }
  };

  const isWeb = Platform.OS === 'web';

  // Extract unique reaction types present in the reactions data
  const availableTabs = useMemo(() => {
    const counts: Record<string, number> = {};
    reactions.forEach(r => {
      counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1;
    });
    
    const tabs = Object.keys(counts).map(type => ({
      type,
      count: counts[type]
    }));
    
    // Sort tabs by count descending
    return tabs.sort((a, b) => b.count - a.count);
  }, [reactions]);

  const filteredReactions = useMemo(() => {
    if (activeTab === 'ALL') return reactions;
    return reactions.filter(r => r.reaction_type === activeTab);
  }, [reactions, activeTab]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'flex-end',
        }}
      >
        <Pressable 
          style={{ flex: 1, cursor: isWeb ? 'default' : undefined } as any} 
          onPress={onClose} 
        />
        
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            height: '75%',
            width: '100%',
            maxWidth: 600,
            alignSelf: 'center',
            paddingBottom: 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.1,
            shadowRadius: 10,
            elevation: 10,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: '#F1F5F9',
            }}
          >
            <View style={{ width: 32 }} />
            <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 16, color: '#1B2420' }}>
              Người đã bày tỏ cảm xúc
            </Text>
            <Pressable
              onPress={onClose}
              style={{
                width: 32,
                height: 32,
                backgroundColor: '#F1F5F9',
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isWeb ? 'pointer' : undefined,
              } as any}
            >
              <X size={18} color="#64748B" />
            </Pressable>
          </View>

          {loading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#1F6F54" />
            </View>
          ) : reactions.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🤔</Text>
              <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 15, color: '#64748B' }}>
                Chưa có ai bày tỏ cảm xúc
              </Text>
            </View>
          ) : (
            <>
              {/* Tabs */}
              <View>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 12 }}
                  style={{ borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}
                >
                  <Pressable
                    onPress={() => setActiveTab('ALL')}
                    style={{
                      paddingBottom: 8,
                      borderBottomWidth: activeTab === 'ALL' ? 2 : 0,
                      borderBottomColor: '#1F6F54',
                      cursor: isWeb ? 'pointer' : undefined,
                    } as any}
                  >
                    <Text
                      style={{
                        fontFamily: activeTab === 'ALL' ? 'BeVietnamPro_700Bold' : 'BeVietnamPro_600SemiBold',
                        fontSize: 14,
                        color: activeTab === 'ALL' ? '#1F6F54' : '#64748B',
                      }}
                    >
                      Tất cả {reactions.length > 0 ? reactions.length : totalReactions}
                    </Text>
                  </Pressable>
                  
                  {availableTabs.map((tab) => (
                    <Pressable
                      key={tab.type}
                      onPress={() => setActiveTab(tab.type)}
                      style={{
                        paddingBottom: 8,
                        borderBottomWidth: activeTab === tab.type ? 2 : 0,
                        borderBottomColor: '#1F6F54',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        cursor: isWeb ? 'pointer' : undefined,
                      } as any}
                    >
                      <Text style={{ fontSize: 14 }}>{REACTION_ICONS[tab.type] || '👍'}</Text>
                      <Text
                        style={{
                          fontFamily: activeTab === tab.type ? 'BeVietnamPro_700Bold' : 'BeVietnamPro_600SemiBold',
                          fontSize: 14,
                          color: activeTab === tab.type ? '#1F6F54' : '#64748B',
                        }}
                      >
                        {tab.count}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* List */}
              <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
                {filteredReactions.map((reaction, index) => (
                  <View key={reaction.user_id + '_' + index} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ position: 'relative' }}>
                      {reaction.avatar_url ? (
                        <Image
                          source={{ uri: reaction.avatar_url }}
                          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9' }}
                        />
                      ) : (
                        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={{ fontSize: 16, color: '#64748B', fontWeight: 'bold' }}>
                            {reaction.full_name?.charAt(0)?.toUpperCase() || '?'}
                          </Text>
                        </View>
                      )}
                      
                      {/* Emoji Badge */}
                      <View style={{ 
                        position: 'absolute', 
                        bottom: -2, 
                        right: -2, 
                        backgroundColor: '#FFFFFF', 
                        borderRadius: 10, 
                        width: 20, 
                        height: 20, 
                        justifyContent: 'center', 
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: '#FFFFFF',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.2,
                        shadowRadius: 1,
                        elevation: 2,
                      }}>
                        <Text style={{ fontSize: 12 }}>{REACTION_ICONS[reaction.reaction_type] || '👍'}</Text>
                      </View>
                    </View>
                    
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 14, color: '#1B2420' }}>
                        {reaction.full_name}
                      </Text>
                      <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 12, color: '#64748B' }}>
                        {REACTION_LABELS[reaction.reaction_type] || 'Thích'}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

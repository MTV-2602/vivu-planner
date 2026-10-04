import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable, Platform } from 'react-native';

export interface OnlineMember {
  user_id: string;
  display_name?: string;
  avatar_url?: string;
  current_action?: string;  // "Đang kéo Cà phê Trung Nguyên...", "Đang xem lịch trình"
  cursor_color?: string;    // màu cursor riêng mỗi user
}

export const CURSOR_COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6'];

interface AvatarStackProps {
  members: OnlineMember[];
  max?: number;
  size?: number;
  tooltipPosition?: 'top' | 'bottom';
}

export default function AvatarStack({
  members,
  max = 5,
  size = 28,
  tooltipPosition = 'top',
}: AvatarStackProps) {
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null);
  const [activeTooltipIndex, setActiveTooltipIndex] = useState<number>(0);

  const visible = members.slice(0, max);
  const overflow = members.length - max;

  if (members.length === 0) return null;

  const isBottom = tooltipPosition === 'bottom';

  return (
    <View style={styles.container}>
      {visible.map((member, index) => {
        const cursorColor = member.cursor_color || CURSOR_COLORS[index % CURSOR_COLORS.length];
        const isTooltipActive = activeTooltipId === member.user_id;

        return (
          <View
            key={member.user_id}
            style={[
              styles.avatarItem,
              {
                width: size,
                height: size,
                marginLeft: index === 0 ? 0 : -(size * 0.3),
                zIndex: isTooltipActive ? 9999 : visible.length - index,
              },
            ]}
          >
            <Pressable
              onHoverIn={() => {
                setActiveTooltipId(member.user_id);
                setActiveTooltipIndex(index);
              }}
              onHoverOut={() => setActiveTooltipId(null)}
              onLongPress={() => {
                setActiveTooltipId(isTooltipActive ? null : member.user_id);
                setActiveTooltipIndex(index);
              }}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  setActiveTooltipId(isTooltipActive ? null : member.user_id);
                  setActiveTooltipIndex(index);
                }
              }}
              style={[
                styles.avatarWrapper,
                {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  borderColor: cursorColor,
                  borderWidth: 2,
                },
              ]}
            >
              {member.avatar_url ? (
                <Image
                  source={{ uri: member.avatar_url }}
                  style={{
                    width: size - 4,
                    height: size - 4,
                    borderRadius: (size - 4) / 2,
                  }}
                />
              ) : (
                <View
                  style={[
                    styles.avatarPlaceholder,
                    {
                      width: size - 4,
                      height: size - 4,
                      borderRadius: (size - 4) / 2,
                      backgroundColor: cursorColor,
                    },
                  ]}
                >
                  <Text style={[styles.avatarInitial, { fontSize: size * 0.38 }]}>
                    {(member.display_name || '?')[0].toUpperCase()}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        );
      })}

      {activeTooltipId && (() => {
        const m = visible.find((x) => x.user_id === activeTooltipId);
        if (!m) return null;
        const step = size * 0.7;
        const leftCenter = activeTooltipIndex * step + size / 2;
        return (
          <View
            pointerEvents="none"
            style={[
              styles.tooltipContainer,
              {
                left: leftCenter - 60, // 60 = half of minWidth 120
              },
              isBottom ? { top: size + 8 } : { bottom: size + 8 },
            ]}
          >
            {isBottom && (
              <View style={[styles.tooltipArrowUp, { borderBottomColor: '#1E293B' }]} />
            )}
            <View style={styles.tooltipBubble}>
              <Text style={styles.tooltipName} numberOfLines={1}>
                {m.display_name || 'Thành viên'}
              </Text>
              {Boolean(m.current_action) && (
                <Text style={styles.tooltipAction} numberOfLines={2}>
                  {m.current_action}
                </Text>
              )}
            </View>
            {!isBottom && (
              <View style={[styles.tooltipArrowDown, { borderTopColor: '#1E293B' }]} />
            )}
          </View>
        );
      })()}

      {overflow > 0 && (
        <View
          style={[
            styles.overflowBadge,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: -(size * 0.3),
              zIndex: 0,
            },
          ]}
        >
          <Text style={[styles.overflowText, { fontSize: size * 0.35 }]}>
            +{overflow}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'visible',
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarItem: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrapper: {
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontWeight: '700',
  },
  overflowBadge: {
    backgroundColor: '#6B7280',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  overflowText: {
    color: '#fff',
    fontWeight: '700',
  },
  tooltipContainer: {
    position: 'absolute',
    minWidth: 120,
    maxWidth: 200,
    zIndex: 10000,
    alignItems: 'center',
  },
  tooltipBubble: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    minWidth: 80,
    maxWidth: 220,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 8,
  },
  tooltipArrowDown: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#1E293B',
  },
  tooltipArrowUp: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#1E293B',
  },
  tooltipName: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  tooltipAction: {
    color: '#94A3B8',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
    fontWeight: '500',
  },
});

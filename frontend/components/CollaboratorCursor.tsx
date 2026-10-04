import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, StyleProp, ViewStyle } from 'react-native';
import { OnlineMember } from './AvatarStack';

export interface CollaboratorCursorProps {
  member: OnlineMember;
  color: string;
  style?: StyleProp<ViewStyle>;
}

export default function CollaboratorCursor({
  member,
  color,
  style,
}: CollaboratorCursorProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();

    return () => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    };
  }, [member?.current_action, member?.user_id]);

  if (!member) return null;

  const cursorColor = color || member.cursor_color || '#7C3AED';

  return (
    <Animated.View
      style={[
        styles.badge,
        {
          borderColor: cursorColor,
          opacity: fadeAnim,
        },
        style,
      ]}
      pointerEvents="none"
    >
      <View style={[styles.dot, { backgroundColor: cursorColor }]} />
      <Text style={styles.name} numberOfLines={1}>
        {member.display_name || 'Thành viên'}
      </Text>
      {Boolean(member.current_action) && (
        <Text style={styles.action} numberOfLines={1}>
          {' '}{member.current_action}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  name: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1B2420',
  },
  action: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '500',
  },
});

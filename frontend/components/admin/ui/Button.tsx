import React from 'react';
import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import { BRAND_COLORS } from '../../../constants';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label?: string;
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  onPress?: () => void;
  className?: string;
  testID?: string;
}

export default function Button({
  label,
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconRight,
  onPress,
  className = '',
  testID,
}: ButtonProps) {
  const isSm = size === 'sm';
  const isLg = size === 'lg';

  // Base size padding
  const sizeClass = isSm
    ? 'px-3 py-1.5 rounded-lg'
    : isLg
    ? 'px-5 py-3 rounded-xl'
    : 'px-4 py-2 rounded-xl';

  const textSizeClass = isSm
    ? 'text-xs'
    : isLg
    ? 'text-base font-bold'
    : 'text-sm font-semibold';

  // Variant styling
  let containerStyle: { backgroundColor?: string; borderColor?: string; borderWidth?: number } = {};
  let textColor = '#FFFFFF';
  let spinnerColor = '#FFFFFF';

  if (variant === 'primary') {
    containerStyle = { backgroundColor: BRAND_COLORS.primary };
    textColor = '#FFFFFF';
    spinnerColor = '#FFFFFF';
  } else if (variant === 'secondary') {
    containerStyle = { backgroundColor: 'rgba(31, 111, 84, 0.08)' };
    textColor = BRAND_COLORS.primary;
    spinnerColor = BRAND_COLORS.primary;
  } else if (variant === 'danger') {
    containerStyle = { backgroundColor: BRAND_COLORS.danger };
    textColor = '#FFFFFF';
    spinnerColor = '#FFFFFF';
  } else if (variant === 'outline') {
    containerStyle = {
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: BRAND_COLORS.line,
    };
    textColor = BRAND_COLORS.text;
    spinnerColor = BRAND_COLORS.primary;
  } else if (variant === 'ghost') {
    containerStyle = { backgroundColor: 'transparent' };
    textColor = BRAND_COLORS.textSoft;
    spinnerColor = BRAND_COLORS.textSoft;
  }

  const isInteractive = !disabled && !loading;

  return (
    <Pressable
      testID={testID}
      onPress={isInteractive ? onPress : undefined}
      disabled={!isInteractive}
      style={[
        containerStyle,
        {
          opacity: disabled ? 0.5 : 1,
          cursor: isInteractive ? 'pointer' : 'default',
        } as any,
      ]}
      className={`flex-row items-center justify-center gap-1.5 select-none ${sizeClass} ${className}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        <>
          {icon && <View className="shrink-0">{icon}</View>}
          {label ? (
            <Text
              className={`${textSizeClass}`}
              style={{ color: textColor }}
              numberOfLines={1}
            >
              {label}
            </Text>
          ) : (
            children
          )}
          {iconRight && <View className="shrink-0">{iconRight}</View>}
        </>
      )}
    </Pressable>
  );
}

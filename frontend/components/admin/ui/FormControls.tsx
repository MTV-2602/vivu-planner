import React from 'react';
import { View, Text, TextInput, Pressable, Switch as RNSwitch, TextInputProps } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { BRAND_COLORS } from '../../../constants';

export interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Field({
  label,
  error,
  hint,
  required = false,
  children,
  className = '',
}: FieldProps) {
  return (
    <View className={`gap-1.5 w-full ${className}`}>
      {label && (
        <View className="flex-row items-center gap-1">
          <Text className="text-xs font-semibold text-brand-textSoft">
            {label}
          </Text>
          {required && <Text className="text-xs font-bold text-red-500">*</Text>}
        </View>
      )}
      {children}
      {error ? (
        <Text className="text-[11px] font-medium text-red-600 mt-0.5">
          {error}
        </Text>
      ) : hint ? (
        <Text className="text-[11px] text-brand-textMuted mt-0.5">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export interface InputProps extends TextInputProps {
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  className?: string;
}

export function Input({
  error,
  prefix,
  suffix,
  className = '',
  style,
  ...props
}: InputProps) {
  return (
    <View
      className={`flex-row items-center bg-white border rounded-xl px-3 py-2 gap-2 ${className}`}
      style={{
        borderColor: error ? BRAND_COLORS.danger : BRAND_COLORS.line,
      }}
    >
      {prefix && <View className="shrink-0">{prefix}</View>}
      <TextInput
        placeholderTextColor={BRAND_COLORS.textMuted}
        className="flex-1 text-xs text-brand-text p-0 outline-none"
        style={[
          {
            fontSize: 13,
            color: BRAND_COLORS.text,
            borderWidth: 0,
          },
          style,
        ]}
        {...props}
      />
      {suffix && <View className="shrink-0">{suffix}</View>}
    </View>
  );
}

export interface TextareaProps extends TextInputProps {
  error?: string;
  rows?: number;
  className?: string;
}

export function Textarea({
  error,
  rows = 3,
  className = '',
  style,
  ...props
}: TextareaProps) {
  return (
    <View
      className={`bg-white border rounded-xl p-3 ${className}`}
      style={{
        borderColor: error ? BRAND_COLORS.danger : BRAND_COLORS.line,
        minHeight: rows * 24 + 16,
      }}
    >
      <TextInput
        multiline
        numberOfLines={rows}
        placeholderTextColor={BRAND_COLORS.textMuted}
        className="text-xs text-brand-text p-0 outline-none w-full"
        style={[
          {
            fontSize: 13,
            color: BRAND_COLORS.text,
            textAlignVertical: 'top',
            borderWidth: 0,
          },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

export interface SwitchProps {
  value: boolean;
  onValueChange: (val: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}

export function Switch({
  value,
  onValueChange,
  disabled = false,
  label,
  description,
}: SwitchProps) {
  return (
    <View className="flex-row items-center justify-between py-1">
      {(label || description) && (
        <View className="flex-1 mr-3">
          {label && (
            <Text className="text-xs font-semibold text-brand-text">
              {label}
            </Text>
          )}
          {description && (
            <Text className="text-[11px] text-brand-textMuted mt-0.5">
              {description}
            </Text>
          )}
        </View>
      )}
      <RNSwitch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#E2E8F0', true: BRAND_COLORS.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (val: string) => void;
  error?: string;
  className?: string;
}

export function Select({
  options,
  value,
  onChange,
  error,
  className = '',
}: SelectProps) {
  const currentLabel = options.find((o) => o.value === value)?.label || value;

  // On web, we can render a native select element for standard accessibility, or styled pills
  return (
    <View
      className={`relative bg-white border rounded-xl px-3 py-2 flex-row items-center justify-between ${className}`}
      style={{ borderColor: error ? BRAND_COLORS.danger : BRAND_COLORS.line }}
    >
      {/* Web standard select overlay */}
      {typeof window !== 'undefined' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            zIndex: 10,
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : null}

      <Text className="text-xs text-brand-text font-medium" numberOfLines={1}>
        {currentLabel}
      </Text>
      <ChevronDown size={14} color={BRAND_COLORS.textMuted} />
    </View>
  );
}

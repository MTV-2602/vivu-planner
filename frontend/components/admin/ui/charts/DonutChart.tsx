import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { formatCompactVND } from '../format';

export interface DonutChartItem {
  label: string;
  value: number;
  color: string;
  subtext?: string;
}

export interface DonutChartProps {
  data: DonutChartItem[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerSublabel?: string;
  formatValue?: (val: number) => string;
  showLegend?: boolean;
  className?: string;
}

export default function DonutChart({
  data = [],
  size = 170,
  strokeWidth = 24,
  centerLabel,
  centerSublabel,
  formatValue = formatCompactVND,
  showLegend = true,
  className = '',
}: DonutChartProps) {
  const total = data.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Compute segments with stroke-dasharray and stroke-dashoffset
  let accumulatedPercent = 0;
  const segments = data.map((item) => {
    const val = Number(item.value) || 0;
    const percent = total > 0 ? (val / total) * 100 : 0;
    const strokeDash = (percent / 100) * circumference;
    const strokeOffset = -(accumulatedPercent / 100) * circumference;
    accumulatedPercent += percent;

    return {
      ...item,
      percent: Math.round(percent * 10) / 10,
      strokeDash,
      strokeOffset,
    };
  });

  return (
    <View className={`flex-col md:flex-row items-center gap-5 ${className}`}>
      {/* SVG Donut Circle */}
      <View
        style={{ width: size, height: size }}
        className="relative items-center justify-center shrink-0"
      >
        <Svg width={size} height={size}>
          <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {/* Background Track */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#F1F5F9"
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* Value Segments */}
            {total > 0 &&
              segments.map((seg, idx) => (
                <Circle
                  key={idx}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${seg.strokeDash} ${circumference}`}
                  strokeDashoffset={seg.strokeOffset}
                  fill="none"
                />
              ))}
          </G>
        </Svg>

        {/* Center Text (if provided or fallback to total) */}
        <View className="absolute items-center justify-center px-2">
          <Text className="font-display font-bold text-sm md:text-base text-brand-text text-center" numberOfLines={1}>
            {centerLabel || formatValue(total)}
          </Text>
          {centerSublabel && (
            <Text className="text-[10px] text-brand-textMuted uppercase tracking-wider text-center" numberOfLines={1}>
              {centerSublabel}
            </Text>
          )}
        </View>
      </View>

      {/* Legend List */}
      {showLegend && (
        <View className="flex-1 w-full gap-2">
          {segments.map((seg, idx) => (
            <View
              key={idx}
              className="flex-row items-center justify-between py-1 border-b border-brand-line/10 gap-2"
            >
              <View className="flex-row items-center gap-2 flex-1 min-w-0">
                <View
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <Text
                  className="text-xs text-brand-text font-medium"
                  numberOfLines={1}
                >
                  {seg.label}
                </Text>
              </View>

              <View className="flex-row items-center gap-2 shrink-0">
                <Text className="text-xs font-bold text-brand-textSoft">
                  {formatValue(seg.value)}
                </Text>
                <View className="bg-slate-100 px-1.5 py-0.5 rounded-md">
                  <Text className="text-[10px] font-bold text-brand-textMuted">
                    {seg.percent}%
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

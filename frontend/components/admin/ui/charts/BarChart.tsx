import React, { useState } from 'react';
import { View, Text, LayoutChangeEvent, Platform } from 'react-native';
import Svg, { Rect, Line, G } from 'react-native-svg';
import { BRAND_COLORS } from '../../../../constants';
import { formatCompactVND } from '../format';

export interface BarChartItem {
  label: string;
  value: number;
  color?: string;
  sublabel?: string;
}

export interface BarChartProps {
  data: BarChartItem[];
  horizontal?: boolean;
  height?: number;
  formatValue?: (val: number) => string;
  color?: string;
  className?: string;
}

export default function BarChart({
  data = [],
  horizontal = false,
  height = 220,
  formatValue = formatCompactVND,
  color = BRAND_COLORS.primary,
  className = '',
}: BarChartProps) {
  const [containerWidth, setContainerWidth] = useState(500);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setContainerWidth(w);
  };

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  // 1. Horizontal Rank Bar Mode
  if (horizontal) {
    return (
      <View onLayout={handleLayout} className={`gap-2.5 w-full ${className}`}>
        {data.map((item, idx) => {
          const ratio = Math.max(0, Math.min(1, item.value / maxValue));
          const barColor = item.color || color;

          return (
            <View key={idx} className="gap-1">
              <View className="flex-row items-center justify-between text-xs">
                <Text
                  className="font-medium text-xs text-brand-text flex-1 mr-2"
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
                <Text className="font-bold text-xs text-brand-textSoft">
                  {formatValue(item.value)}
                  {item.sublabel ? (
                    <Text className="font-normal text-brand-textMuted text-[10px]">
                      {' '}({item.sublabel})
                    </Text>
                  ) : null}
                </Text>
              </View>
              {/* Bar track & fill */}
              <View className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, ratio * 100)}%`,
                    backgroundColor: barColor,
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  // 2. Vertical Column Bar Chart Mode
  const padLeft = 50;
  const padRight = 10;
  const padTop = 15;
  const padBottom = 26;

  const chartWidth = Math.max(80, containerWidth - padLeft - padRight);
  const chartHeight = Math.max(60, height - padTop - padBottom);

  const barCount = data.length;
  const slotWidth = barCount > 0 ? chartWidth / barCount : 0;
  const barWidth = Math.max(4, Math.min(22, slotWidth * 0.65));

  const yTicks = [1, 0.5, 0].map((ratio) => ({
    value: maxValue * ratio,
    y: padTop + chartHeight * (1 - ratio),
  }));

  const activeItem = hoverIndex !== null && data[hoverIndex] ? data[hoverIndex] : null;

  return (
    <View
      onLayout={handleLayout}
      className={`relative w-full select-none ${className}`}
      style={{ height }}
    >
      <Svg width={containerWidth} height={height}>
        {/* Horizontal grid lines */}
        {yTicks.map((tick, i) => (
          <G key={i}>
            <Line
              x1={padLeft}
              y1={tick.y}
              x2={padLeft + chartWidth}
              y2={tick.y}
              stroke="rgba(27,36,32,0.07)"
              strokeDasharray={i === yTicks.length - 1 ? undefined : '3,3'}
              strokeWidth="1"
            />
          </G>
        ))}

        {/* Bars */}
        {data.map((item, idx) => {
          const ratio = Math.max(0, item.value / maxValue);
          const barH = Math.max(item.value > 0 ? 3 : 0, ratio * chartHeight);
          const x = padLeft + idx * slotWidth + (slotWidth - barWidth) / 2;
          const y = padTop + chartHeight - barH;
          const isHovered = hoverIndex === idx;

          return (
            <Rect
              key={idx}
              x={x}
              y={y}
              width={barWidth}
              height={barH}
              rx={3}
              fill={item.color || color}
              opacity={hoverIndex === null || isHovered ? 1 : 0.45}
              {...((Platform.OS === 'web'
                ? {
                    onMouseEnter: () => setHoverIndex(idx),
                    onMouseLeave: () => setHoverIndex(null),
                  }
                : {}) as any)}
            />
          );
        })}
      </Svg>

      {/* Y-Axis text */}
      {yTicks.map((tick, i) => (
        <View
          key={i}
          className="absolute"
          style={{
            left: 2,
            top: tick.y - 7,
            width: padLeft - 8,
            alignItems: 'flex-end',
          }}
        >
          <Text className="text-[10px] text-brand-textMuted font-mono">
            {formatValue(tick.value)}
          </Text>
        </View>
      ))}

      {/* X-Axis labels (sparse) */}
      {data.map((item, idx) => {
        // Show only subset if too many
        const step = Math.max(1, Math.ceil(barCount / 6));
        if (idx % step !== 0 && idx !== barCount - 1) return null;

        const xCenter = padLeft + idx * slotWidth + slotWidth / 2;
        const parts = item.label.split('-');
        const dateStr = parts.length === 3 ? `${parts[2]}/${parts[1]}` : item.label;

        return (
          <View
            key={idx}
            className="absolute"
            style={{
              left: Math.max(0, xCenter - 20),
              top: height - padBottom + 6,
              width: 40,
              alignItems: 'center',
            }}
          >
            <Text className="text-[10px] text-brand-textMuted font-mono">
              {dateStr}
            </Text>
          </View>
        );
      })}

      {/* Hover tooltip */}
      {activeItem && hoverIndex !== null && (
        <View
          className="absolute pointer-events-none bg-brand-text/90 backdrop-blur-xs px-2.5 py-1 rounded-lg shadow-md border border-white/10"
          style={{
            left: Math.min(
              containerWidth - 110,
              Math.max(padLeft, padLeft + hoverIndex * slotWidth - 30)
            ),
            top: 2,
            zIndex: 50,
          }}
        >
          <Text className="text-[10px] text-white/70 font-mono">
            {activeItem.label}
          </Text>
          <Text className="text-xs font-bold text-white mt-0.5">
            {formatValue(activeItem.value)}
          </Text>
        </View>
      )}
    </View>
  );
}

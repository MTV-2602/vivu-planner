import React, { useState, useMemo } from 'react';
import { View, Text, LayoutChangeEvent, Platform } from 'react-native';
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Line,
  Circle,
  G,
} from 'react-native-svg';
import { BRAND_COLORS } from '../../../../constants';
import { formatCompactVND, formatCompactNumber } from '../format';

export interface AreaChartPoint {
  date: string;
  value: number;
  secondaryValue?: number;
}

export interface AreaChartProps {
  data: AreaChartPoint[];
  height?: number;
  seriesName?: string;
  secondarySeriesName?: string;
  showSecondary?: boolean;
  formatValue?: (val: number) => string;
  formatSecondaryValue?: (val: number) => string;
  color?: string;
  secondaryColor?: string;
  className?: string;
}

export default function AreaChart({
  data = [],
  height = 240,
  seriesName = 'Doanh thu',
  secondarySeriesName,
  showSecondary = false,
  formatValue = formatCompactVND,
  formatSecondaryValue = formatCompactNumber,
  color = BRAND_COLORS.primary,
  secondaryColor = BRAND_COLORS.accent,
  className = '',
}: AreaChartProps) {
  const [containerWidth, setContainerWidth] = useState(600);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setContainerWidth(w);
  };

  const padLeft = 55;
  const padRight = 15;
  const padTop = 15;
  const padBottom = 28;

  const chartWidth = Math.max(100, containerWidth - padLeft - padRight);
  const chartHeight = Math.max(80, height - padTop - padBottom);

  const {
    points,
    secondaryPoints,
    maxValue,
    maxSecondaryValue,
    yGridTicks,
    xTicks,
  } = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        points: [],
        secondaryPoints: [],
        maxValue: 0,
        maxSecondaryValue: 0,
        yGridTicks: [] as { ratio: number; value: number; y: number }[],
        xTicks: [],
      };
    }

    const maxVal = Math.max(...data.map((d) => d.value), 10);
    const maxSec = showSecondary
      ? Math.max(...data.map((d) => d.secondaryValue || 0), 10)
      : 0;

    const count = data.length;
    const stepX = count > 1 ? chartWidth / (count - 1) : 0;

    const pts = data.map((d, i) => {
      const x = padLeft + (count === 1 ? chartWidth / 2 : i * stepX);
      const y = padTop + chartHeight - (d.value / maxVal) * chartHeight;
      return { x, y, ...d };
    });

    const secPts = showSecondary
      ? data.map((d, i) => {
          const x = padLeft + (count === 1 ? chartWidth / 2 : i * stepX);
          const y =
            padTop +
            chartHeight -
            ((d.secondaryValue || 0) / maxSec) * chartHeight;
          return { x, y, ...d };
        })
      : [];

    const yGrid = [1, 0.66, 0.33, 0].map((ratio) => ({
      ratio,
      value: maxVal * ratio,
      y: padTop + chartHeight * (1 - ratio),
    }));

    // Sparse x-ticks (show max 5-6 dates)
    const tickCount = Math.min(count, 6);
    const stepIndex = Math.max(1, Math.floor(count / (tickCount - 1 || 1)));
    const ticks: { index: number; date: string; x: number }[] = [];

    for (let i = 0; i < count; i += stepIndex) {
      ticks.push({
        index: i,
        date: data[i].date,
        x: pts[i].x,
      });
    }
    // Ensure the last date is shown if not already included
    if (ticks.length > 0 && ticks[ticks.length - 1].index !== count - 1) {
      ticks[ticks.length - 1] = {
        index: count - 1,
        date: data[count - 1].date,
        x: pts[count - 1].x,
      };
    }

    return {
      points: pts,
      secondaryPoints: secPts,
      maxValue: maxVal,
      maxSecondaryValue: maxSec,
      yGridTicks: yGrid,
      xTicks: ticks,
    };
  }, [data, chartWidth, chartHeight, showSecondary, padLeft, padTop]);

  // Construct smooth bezier curve path
  const makeSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cp1x = p0.x + (p1.x - p0.x) / 2;
      const cp1y = p0.y;
      const cp2x = p0.x + (p1.x - p0.x) / 2;
      const cp2y = p1.y;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  const linePath = useMemo(() => makeSmoothPath(points), [points]);
  const areaPath = useMemo(() => {
    if (points.length < 2) return '';
    const bottom = padTop + chartHeight;
    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    return `${linePath} L ${lastX} ${bottom} L ${firstX} ${bottom} Z`;
  }, [linePath, points, padTop, chartHeight]);

  const secLinePath = useMemo(
    () => (showSecondary ? makeSmoothPath(secondaryPoints) : ''),
    [showSecondary, secondaryPoints]
  );

  // Mouse hover event handler for Web
  const handleMouseMove = (e: any) => {
    if (!data.length) return;
    const rect = e.currentTarget?.getBoundingClientRect?.();
    if (!rect) return;
    const clientX = e.clientX;
    const relX = clientX - rect.left - padLeft;
    const ratio = Math.max(0, Math.min(1, relX / chartWidth));
    const idx = Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1))));
    setHoverIndex(idx);
  };

  const activePoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;
  const activeSecPoint =
    hoverIndex !== null && secondaryPoints[hoverIndex] ? secondaryPoints[hoverIndex] : null;

  return (
    <View
      onLayout={handleLayout}
      className={`relative w-full select-none ${className}`}
      style={{ height }}
      {...((Platform.OS === 'web'
        ? {
            onMouseMove: handleMouseMove,
            onMouseLeave: () => setHoverIndex(null),
          }
        : {}) as any)}
    >
      <Svg width={containerWidth} height={height}>
        <Defs>
          <LinearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <Stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </LinearGradient>
        </Defs>

        {/* Horizontal Grid lines & Y labels */}
        {yGridTicks.map((tick, i) => (
          <G key={i}>
            <Line
              x1={padLeft}
              y1={tick.y}
              x2={padLeft + chartWidth}
              y2={tick.y}
              stroke="rgba(27,36,32,0.07)"
              strokeDasharray={i === yGridTicks.length - 1 ? undefined : '3,3'}
              strokeWidth="1"
            />
          </G>
        ))}

        {/* Area fill */}
        {areaPath ? <Path d={areaPath} fill="url(#areaGradient)" /> : null}

        {/* Main Line */}
        {linePath ? (
          <Path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {/* Secondary Line */}
        {showSecondary && secLinePath ? (
          <Path
            d={secLinePath}
            fill="none"
            stroke={secondaryColor}
            strokeWidth="2"
            strokeDasharray="4,3"
            strokeLinecap="round"
          />
        ) : null}

        {/* Active hover vertical cursor line */}
        {activePoint && (
          <G>
            <Line
              x1={activePoint.x}
              y1={padTop}
              x2={activePoint.x}
              y2={padTop + chartHeight}
              stroke="rgba(27,36,32,0.25)"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            <Circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="4.5"
              fill={color}
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            {activeSecPoint && (
              <Circle
                cx={activeSecPoint.x}
                cy={activeSecPoint.y}
                r="4.5"
                fill={secondaryColor}
                stroke="#FFFFFF"
                strokeWidth="2"
              />
            )}
          </G>
        )}
      </Svg>

      {/* Y-Axis Label Overlays (Clean DOM Text) */}
      {yGridTicks.map((tick, i) => (
        <View
          key={i}
          className="absolute"
          style={{
            left: 4,
            top: tick.y - 7,
            width: padLeft - 10,
            alignItems: 'flex-end',
          }}
        >
          <Text className="text-[10px] text-brand-textMuted font-mono">
            {formatValue(tick.value)}
          </Text>
        </View>
      ))}

      {/* X-Axis Date Overlays */}
      {xTicks.map((tick, i) => {
        // Format date: dd/mm or MM/yyyy
        const parts = tick.date.split('-');
        const displayDate =
          parts.length === 3 ? `${parts[2]}/${parts[1]}` : tick.date;

        return (
          <View
            key={i}
            className="absolute"
            style={{
              left: Math.max(0, tick.x - 22),
              top: height - padBottom + 6,
              width: 44,
              alignItems: 'center',
            }}
          >
            <Text className="text-[10px] text-brand-textMuted font-mono">
              {displayDate}
            </Text>
          </View>
        );
      })}

      {/* Tooltip Overlay */}
      {activePoint && (
        <View
          className="absolute pointer-events-none bg-brand-text/90 backdrop-blur-xs px-2.5 py-1.5 rounded-lg shadow-md border border-white/10"
          style={{
            left: Math.min(
              containerWidth - 140,
              Math.max(padLeft, activePoint.x - 65)
            ),
            top: Math.max(0, activePoint.y - 65),
            minWidth: 120,
            zIndex: 50,
          }}
        >
          <Text className="text-[10px] text-white/70 font-mono">
            {activePoint.date}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-0.5">
            <View
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <Text className="text-xs font-bold text-white">
              {seriesName}: {formatValue(activePoint.value)}
            </Text>
          </View>
          {showSecondary && activeSecPoint && secondarySeriesName && (
            <View className="flex-row items-center gap-1.5 mt-0.5">
              <View
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: secondaryColor }}
              />
              <Text className="text-[11px] font-semibold text-white/90">
                {secondarySeriesName}:{' '}
                {formatSecondaryValue(activeSecPoint.secondaryValue || 0)}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

import React, { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { GripVertical, Trash2, Wallet, Leaf, Sparkles, Navigation } from 'lucide-react-native';

interface TimelineItem {
  id: string;
  time: string;
  title: string;
  category: string;
  detail: string;
  lat: number;
  lng: number;
  pinNumber: number;
  mapX: number;
  mapY: number;
}

const INITIAL_TIMELINE: Record<number, TimelineItem[]> = {
  1: [
    {
      id: 'item-1',
      time: '08:00',
      title: 'Phở bò Bát Đàn',
      category: 'Ẩm thực bản địa',
      detail: '50.000đ · Phở gia truyền ngõ nhỏ',
      lat: 21.033,
      lng: 105.847,
      pinNumber: 1,
      mapX: 30,
      mapY: 35,
    },
    {
      id: 'item-2',
      time: '10:30',
      title: 'Check-in Quán Cà phê ẩn ngõ nhỏ',
      category: 'Cà phê & Check-in',
      detail: 'Scenic Score: 9.2 · Cà phê trứng phố cổ',
      lat: 21.035,
      lng: 105.850,
      pinNumber: 2,
      mapX: 58,
      mapY: 48,
    },
    {
      id: 'item-3',
      time: '14:00',
      title: 'Tham quan bảo tàng & Làng nghề truyền thống',
      category: 'Văn hóa & Lịch sử',
      detail: 'Vé: 40.000đ · Workshop làm gốm',
      lat: 21.028,
      lng: 105.839,
      pinNumber: 3,
      mapX: 78,
      mapY: 72,
    },
  ],
  2: [
    {
      id: 'item-4',
      time: '09:00',
      title: 'Sáng ngoại ô Ba Vì',
      category: 'Du lịch thiên nhiên',
      detail: 'Không khí trong lành',
      lat: 21.06,
      lng: 105.8,
      pinNumber: 1,
      mapX: 25,
      mapY: 40,
    },
  ],
  3: [
    {
      id: 'item-5',
      time: '10:00',
      title: 'Mua sắm đặc sản Hàng Gai',
      category: 'Mua sắm & Quà lưu niệm',
      detail: 'Đồ thủ công mỹ nghệ',
      lat: 21.03,
      lng: 105.85,
      pinNumber: 1,
      mapX: 45,
      mapY: 60,
    },
  ],
};

const DAY_TABS = [
  { day: 1, label: 'Ngày 1: Phố cổ & Ẩm thực' },
  { day: 2, label: 'Ngày 2: Chữa lành ngoại ô' },
  { day: 3, label: 'Ngày 3: Mua sắm' },
];

export default function TripWorkspaceSplitView() {
  const [activeDay, setActiveDay] = useState(1);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>(INITIAL_TIMELINE[1]);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

  const handleTabChange = (dayNum: number) => {
    setActiveDay(dayNum);
    setTimelineItems(INITIAL_TIMELINE[dayNum] || []);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const next = [...timelineItems];
    const temp = next[index];
    next[index] = next[index - 1];
    next[index - 1] = temp;
    setTimelineItems(next);
  };

  const handleMoveDown = (index: number) => {
    if (index === timelineItems.length - 1) return;
    const next = [...timelineItems];
    const temp = next[index];
    next[index] = next[index + 1];
    next[index + 1] = temp;
    setTimelineItems(next);
  };

  const handleRemove = (id: string) => {
    setTimelineItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <View style={{ width: '100%', maxWidth: 1240, alignSelf: 'center', gap: 20 }}>
      {/* Header Info */}
      <View style={{ gap: 6 }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          alignSelf: 'flex-start',
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 100,
          backgroundColor: '#E6F0F3',
          borderWidth: 1,
          borderColor: '#CBE0E6',
        }}>
          <Sparkles size={14} color="#3B7A8C" />
          <Text style={{ color: '#3B7A8C', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
            Màn hình Quản trị Lịch trình (Split-View Workspace)
          </Text>
        </View>

        <Text style={{
          fontSize: Platform.OS === 'web' ? 30 : 22,
          fontWeight: '800',
          color: '#2D4B54',
          letterSpacing: -0.5,
        }}>
          Lịch trình cá nhân hóa + Bản đồ Mapbox Dark tương tác
        </Text>
      </View>

      {/* Main Split View Container */}
      <View style={{
        flexDirection: Platform.OS === 'web' ? 'row' : 'column',
        gap: 20,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#D4E3E8',
        borderRadius: 28,
        padding: Platform.OS === 'web' ? 24 : 14,
        ...(Platform.OS === 'web' ? {
          boxShadow: '0 10px 40px rgba(74, 112, 125, 0.08)',
        } as any : {}),
      }}>
        
        {/* LEFT PANEL (60% width on desktop) */}
        <View style={{
          flex: Platform.OS === 'web' ? 1.5 : undefined,
          gap: 20,
        }}>
          {/* Day Navigation Tabs - Misty Slate Cyan Active Tab */}
          <View style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 10,
            backgroundColor: '#E6F0F3',
            padding: 6,
            borderRadius: 100,
            borderWidth: 1,
            borderColor: '#CBE0E6',
          }}>
            {DAY_TABS.map((tab) => {
              const isActive = activeDay === tab.day;
              return (
                <Pressable
                  key={tab.day}
                  onPress={() => handleTabChange(tab.day)}
                  style={({ pressed }) => [{
                    paddingHorizontal: 18,
                    paddingVertical: 10,
                    borderRadius: 100,
                    backgroundColor: isActive ? '#3B7A8C' : 'transparent',
                    opacity: pressed ? 0.85 : 1,
                    ...(Platform.OS === 'web' ? {
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: isActive ? '0 4px 12px rgba(59, 122, 140, 0.25)' : 'none',
                    } as any : {}),
                  }]}
                >
                  <Text style={{
                    color: isActive ? '#FFFFFF' : '#4B6E79',
                    fontSize: 13,
                    fontWeight: isActive ? '700' : '600',
                  }}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Timeline Item List */}
          <View style={{ gap: 14 }}>
            {timelineItems.length === 0 ? (
              <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#769FA9' }}>Chưa có điểm dừng nào cho ngày này.</Text>
              </View>
            ) : (
              timelineItems.map((item, idx) => {
                const isHovered = hoveredCardId === item.id;
                const hoverHandlers = Platform.OS === 'web' ? {
                  onMouseEnter: () => setHoveredCardId(item.id),
                  onMouseLeave: () => setHoveredCardId(null),
                } : {};

                return (
                  <View
                    key={item.id}
                    {...(hoverHandlers as any)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      padding: 16,
                      borderRadius: 18,
                      backgroundColor: isHovered ? '#E6F0F3' : '#FFFFFF',
                      borderWidth: 1,
                      borderColor: isHovered ? '#9BBEC8' : '#D4E3E8',
                      ...(Platform.OS === 'web' ? {
                        transition: 'all 0.2s ease',
                        boxShadow: isHovered ? '0 4px 16px rgba(59, 122, 140, 0.15)' : '0 2px 8px rgba(74, 112, 125, 0.04)',
                      } as any : {}),
                    }}
                  >
                    {/* Drag Handle Icon & Pin Number */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ cursor: 'grab' } as any}>
                        <GripVertical size={18} color="#769FA9" />
                      </View>
                      <View style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: isHovered ? '#3B7A8C' : '#2D4B54',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>
                          {item.pinNumber}
                        </Text>
                      </View>
                    </View>

                    {/* Timeline Item Details */}
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: '#3B7A8C', fontSize: 12, fontWeight: '700' }}>
                          {item.time}
                        </Text>
                        <Text style={{ color: '#9BBEC8', fontSize: 11 }}>•</Text>
                        <Text style={{ color: '#4B6E79', fontSize: 11, fontWeight: '600' }}>
                          {item.category}
                        </Text>
                      </View>

                      <Text style={{ color: '#2D4B54', fontSize: 15, fontWeight: '700' }}>
                        {item.title}
                      </Text>
                      <Text style={{ color: '#4B6E79', fontSize: 12 }}>
                        {item.detail}
                      </Text>
                    </View>

                    {/* Reorder & Action Buttons */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Pressable
                        onPress={() => handleMoveUp(idx)}
                        style={({ pressed }) => [{
                          padding: 6,
                          borderRadius: 8,
                          backgroundColor: '#E6F0F3',
                          opacity: pressed ? 0.7 : 1,
                        }]}
                      >
                        <Text style={{ color: '#2D4B54', fontSize: 10, fontWeight: '800' }}>▲</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => handleMoveDown(idx)}
                        style={({ pressed }) => [{
                          padding: 6,
                          borderRadius: 8,
                          backgroundColor: '#E6F0F3',
                          opacity: pressed ? 0.7 : 1,
                        }]}
                      >
                        <Text style={{ color: '#2D4B54', fontSize: 10, fontWeight: '800' }}>▼</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => handleRemove(item.id)}
                        style={({ pressed }) => [{
                          padding: 6,
                          borderRadius: 8,
                          backgroundColor: '#FEE2E2',
                          opacity: pressed ? 0.7 : 1,
                        }]}
                      >
                        <Trash2 size={15} color="#DC2626" />
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Summary Widget Card at Bottom of Left Panel */}
          <View style={{
            padding: 18,
            borderRadius: 20,
            backgroundColor: '#F4F8FA',
            borderWidth: 1,
            borderColor: '#D4E3E8',
            gap: 16,
            marginTop: 6,
          }}>
            {/* Budget Progress Bar */}
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Wallet size={15} color="#3B7A8C" />
                  <Text style={{ color: '#2D4B54', fontSize: 13, fontWeight: '700' }}>
                    Ngân sách chuyến đi
                  </Text>
                </View>
                <Text style={{ color: '#3B7A8C', fontSize: 12, fontWeight: '700' }}>
                  Đã chi 850.000đ / Dự toán 2.000.000đ
                </Text>
              </View>

              {/* Progress Bar Container */}
              <View style={{
                height: 8,
                width: '100%',
                borderRadius: 4,
                backgroundColor: '#D4E3E8',
                overflow: 'hidden',
              }}>
                <View style={{
                  height: '100%',
                  width: '42.5%',
                  borderRadius: 4,
                  backgroundColor: '#3B7A8C',
                }} />
              </View>
            </View>

            {/* Carbon Footprint Meter */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: '#D4E3E8' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Leaf size={15} color="#3B7A8C" />
                <Text style={{ color: '#2D4B54', fontSize: 12, fontWeight: '600' }}>
                  Dấu chân Carbon dự toán
                </Text>
              </View>
              <View style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 100,
                backgroundColor: '#E6F0F3',
                borderWidth: 1,
                borderColor: '#CBE0E6',
              }}>
                <Text style={{ color: '#2D4B54', fontSize: 11, fontWeight: '700' }}>
                  ~8.5 kg CO2e (Mức thấp)
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* RIGHT PANEL: INTERACTIVE OCEANIC MAP (40% width on desktop) */}
        <View style={{
          flex: Platform.OS === 'web' ? 1 : undefined,
          minHeight: 380,
          borderRadius: 22,
          backgroundColor: '#0E1B22',
          borderWidth: 1,
          borderColor: '#1C323D',
          position: 'relative',
          overflow: 'hidden',
          padding: 16,
          justifyContent: 'space-between',
        }}>
          {/* Map Header Bar */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 100,
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.2)',
            }}>
              <Navigation size={13} color="#38BDF8" />
              <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                Mapbox Oceanic · Hà Nội
              </Text>
            </View>

            <View style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 8,
              backgroundColor: 'rgba(56, 189, 248, 0.25)',
            }}>
              <Text style={{ color: '#38BDF8', fontSize: 10, fontWeight: '800' }}>LIVE ROUTE</Text>
            </View>
          </View>

          {/* SVG Map Canvas with Curved Route & Markers */}
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            {/* Grid Line Decoration simulating dark map tiles */}
            <View style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              opacity: 0.15,
              borderWidth: 1,
              borderColor: '#38BDF8',
            }} />

            {/* Simulated SVG Route Lines & Pins */}
            {Platform.OS === 'web' && (
              <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
                {/* Curved connecting route line */}
                <path
                  d="M 120 130 Q 220 180 310 260"
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="3"
                  strokeDasharray="6 4"
                  style={{ opacity: 0.8 }}
                />
              </svg>
            )}

            {/* Interactive Pins */}
            {timelineItems.map((item) => {
              const isHighlighted = hoveredCardId === item.id;
              const pinHoverHandlers = Platform.OS === 'web' ? {
                onMouseEnter: () => setHoveredCardId(item.id),
                onMouseLeave: () => setHoveredCardId(null),
              } : {};

              return (
                <Pressable
                  key={item.id}
                  {...(pinHoverHandlers as any)}
                  style={{
                    position: 'absolute',
                    left: `${item.mapX}%`,
                    top: `${item.mapY}%`,
                    transform: [{ translateX: -18 }, { translateY: -18 }],
                    zIndex: isHighlighted ? 30 : 20,
                  } as any}
                >
                  <View style={{
                    width: isHighlighted ? 44 : 36,
                    height: isHighlighted ? 44 : 36,
                    borderRadius: 22,
                    backgroundColor: isHighlighted ? '#38BDF8' : '#1C323D',
                    borderWidth: 2,
                    borderColor: '#38BDF8',
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...(Platform.OS === 'web' ? {
                      boxShadow: isHighlighted ? '0 0 24px #38BDF8' : '0 4px 12px rgba(0,0,0,0.5)',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                    } as any : {}),
                  }}>
                    <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: isHighlighted ? 15 : 13 }}>
                      {item.pinNumber}
                    </Text>
                  </View>

                  {/* Tooltip on hover */}
                  {isHighlighted && (
                    <View style={{
                      position: 'absolute',
                      bottom: 50,
                      left: -50,
                      width: 140,
                      backgroundColor: '#1C323D',
                      borderWidth: 1,
                      borderColor: '#38BDF8',
                      padding: 8,
                      borderRadius: 10,
                      alignItems: 'center',
                    }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700', textAlign: 'center' }}>
                        {item.title}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Map Footer Note */}
          <View style={{ zIndex: 10, alignSelf: 'flex-start' }}>
            <Text style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 11 }}>
              💡 Rê chuột vào Timeline hoặc Marker để xem liên kết trực quan.
            </Text>
          </View>
        </View>

      </View>
    </View>
  );
}

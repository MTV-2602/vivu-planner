import { useState } from 'react';
import { View, Text, Pressable, Modal, Platform } from 'react-native';
import { X, Link, Copy, Check } from 'lucide-react-native';
import { BRAND_COLORS } from '../constants';

interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  tripTitle: string;
}

export default function ShareModal({ visible, onClose, tripId, tripTitle }: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://vivu-planner.vercel.app'}/share?id=${tripId}`;

  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}&color=1F6F54&bgcolor=FFFFFF&qzone=2&format=png`;

  const handleCopy = async () => {
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      alert('Không thể sao chép. Vui lòng copy thủ công: ' + shareUrl);
    }
  };

  const handleNativeShare = async () => {
    if (Platform.OS === 'web' && navigator.share) {
      try {
        await navigator.share({ title: `ViVu Planner - ${tripTitle}`, url: shareUrl });
      } catch {}
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 24, width: '100%', maxWidth: 400, overflow: 'hidden' }}>
          {/* Header */}
          <View style={{ backgroundColor: BRAND_COLORS.primary, padding: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 32, marginBottom: 6 }}>🗺️</Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff' }}>Chia sẻ chuyến đi</Text>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 4, textAlign: 'center' }}>{tripTitle}</Text>
            <Pressable onPress={onClose} style={{ position: 'absolute', top: 16, right: 16 }}>
              <X size={22} color="rgba(255,255,255,0.8)" />
            </Pressable>
          </View>

          <View style={{ padding: 24, alignItems: 'center', gap: 16 }}>
            {/* QR Code */}
            <View style={{ padding: 12, backgroundColor: '#f8f4ec', borderRadius: 16 }}>
              {Platform.OS === 'web' ? (
                // @ts-ignore
                <img src={qrApiUrl} alt="QR Code" width={180} height={180} style={{ borderRadius: 8 }} />
              ) : (
                <View style={{ width: 180, height: 180, backgroundColor: '#e8f5f0', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 40 }}>📱</Text>
                  <Text style={{ color: '#888', fontSize: 12, marginTop: 8, textAlign: 'center', padding: 8 }}>Quét QR trên trình duyệt</Text>
                </View>
              )}
            </View>

            <Text style={{ color: '#888', fontSize: 13, textAlign: 'center' }}>
              Bạn bè quét mã QR hoặc mở link bên dưới để xem lịch trình và bản đồ mà không cần đăng nhập
            </Text>

            {/* Share URL */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: '#f8f4ec', borderRadius: 12, padding: 12, width: '100%'
            }}>
              <Link size={16} color="#888" />
              <Text style={{ flex: 1, fontSize: 12, color: '#555' }} numberOfLines={1}>{shareUrl}</Text>
            </View>

            {/* Copy Button */}
            <Pressable
              onPress={handleCopy}
              style={{
                width: '100%', borderRadius: 14, padding: 16, alignItems: 'center',
                backgroundColor: copied ? '#e8f5f0' : BRAND_COLORS.primary,
                flexDirection: 'row', justifyContent: 'center', gap: 8,
              }}
            >
              {copied ? <Check size={18} color={BRAND_COLORS.primary} /> : <Copy size={18} color="#fff" />}
              <Text style={{ fontWeight: '800', fontSize: 15, color: copied ? BRAND_COLORS.primary : '#fff' }}>
                {copied ? 'Đã sao chép!' : 'Sao chép liên kết chia sẻ'}
              </Text>
            </Pressable>

            {/* Native Share (mobile web) */}
            {Platform.OS === 'web' && typeof navigator !== 'undefined' && 'share' in navigator && (
              <Pressable
                onPress={handleNativeShare}
                style={{ width: '100%', borderRadius: 14, padding: 14, alignItems: 'center', backgroundColor: '#f0ebe0' }}
              >
                <Text style={{ fontWeight: '700', color: '#555', fontSize: 14 }}>📤 Chia sẻ qua ứng dụng khác</Text>
              </Pressable>
            )}

            <Text style={{ color: '#bbb', fontSize: 11, textAlign: 'center' }}>
              👁️ Người xem không thể chỉnh sửa lịch trình của bạn
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Compass } from 'lucide-react-native';

// Trang 404 — hiển thị khi không tìm thấy đường dẫn trong ứng dụng
export default function NotFound() {
  const router = useRouter();

  return (
    <View
      testID="screen-not-found"
      style={{
        flex: 1,
        backgroundColor: '#FBF5EA',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 32,
      }}
    >
      {/* Biểu tượng la bàn trong ô vuông bo góc — nhất quán với BrandSplash */}
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          backgroundColor: '#0f4c5c',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
        }}
      >
        <Compass size={32} color="#FFFFFF" />
      </View>

      <Text
        style={{
          fontSize: 22,
          fontWeight: '700',
          color: '#0f4c5c',
          marginBottom: 12,
          textAlign: 'center',
          fontFamily: 'BeVietnamPro_700Bold',
        }}
      >
        Không tìm thấy trang
      </Text>

      <Text
        style={{
          fontSize: 14,
          color: '#5A6E65',
          textAlign: 'center',
          lineHeight: 22,
          marginBottom: 32,
          maxWidth: 320,
        }}
      >
        Trang bạn tìm không tồn tại hoặc đã được chuyển đi. Hãy quay về trang chủ để tiếp tục.
      </Text>

      <Pressable
        testID="btn-go-home"
        onPress={() => router.replace('/')}
        style={{
          backgroundColor: '#0c77b0',
          paddingHorizontal: 32,
          paddingVertical: 13,
          borderRadius: 14,
        }}
      >
        <Text
          style={{
            color: '#FFFFFF',
            fontWeight: '700',
            fontSize: 14,
            fontFamily: 'BeVietnamPro_700Bold',
          }}
        >
          Về trang chủ
        </Text>
      </Pressable>
    </View>
  );
}

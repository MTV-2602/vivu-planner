import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../../../lib/api';
import { useAuth } from '../../../hooks/useAuth';
import { parseErrorMessage } from '../../../lib/error';
import BrandSplash from '../../../components/loading/BrandSplash';

export default function JoinTripPage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'full' | 'already_member'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [tripId, setTripId] = useState('');
  // Ref để clear timeout chuyển hướng khi component bị unmount
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dọn timer chuyển hướng khi component bị unmount (tránh setState sau unmount)
  useEffect(() => {
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      // Chưa đăng nhập — redirect về login
      // Lưu token để sau khi đăng nhập có thể join lại
      if (token) {
        AsyncStorage.setItem('redirect_after_login', `/join/${token}`).catch(() => {});
      }
      router.replace(`/dang-nhap?redirect=${encodeURIComponent(`/join/${token}`)}`);
      return;
    }
    if (!token) {
      setStatus('error');
      setErrorMsg('Link mời không hợp lệ');
      return;
    }
    joinTrip();
  }, [authLoading, session, token]);

  const joinTrip = async () => {
    try {
      const res = await api.put(`/trips/join/${token}`);
      const data = res.data;
      if (data.already_member) {
        setTripId(data.trip_id);
        setStatus('already_member');
        return;
      }
      setTripId(data.trip_id);
      setStatus('success');
      // Auto navigate sau 1.5s — dùng ref để có thể cancel khi unmount
      navTimerRef.current = setTimeout(() => {
        router.replace(`/chuyen-di/${data.trip_id}`);
      }, 1500);
    } catch (e: any) {
      const parsed = parseErrorMessage(e, 'Không thể tham gia lịch trình');
      if (parsed.includes('đủ')) {
        setStatus('full');
      } else {
        setStatus('error');
        setErrorMsg(parsed);
      }
    }
  };

  const handleGoHome = () => router.replace('/');

  const handleGoToTrip = () => {
    if (tripId) router.replace(`/chuyen-di/${tripId}`);
  };

  if (status === 'loading') {
    return <BrandSplash message="Đang xử lý lời mời tham gia chuyến đi" />;
  }

  return (
    <View style={styles.container}>
      {status === 'success' && (
        <>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>Tham gia thành công!</Text>
          <Text style={styles.subtitle}>Đang chuyển đến lịch trình...</Text>
          <ActivityIndicator size="small" color="#0c77b0" style={{ marginTop: 16 }} />
        </>
      )}
      {status === 'already_member' && (
        <>
          <Text style={styles.emoji}>👋</Text>
          <Text style={styles.title}>Bạn đã là thành viên</Text>
          <Text style={styles.subtitle}>Bạn đã tham gia lịch trình này rồi.</Text>
          <TouchableOpacity style={styles.btn} onPress={handleGoToTrip}>
            <Text style={styles.btnText}>Xem lịch trình</Text>
          </TouchableOpacity>
        </>
      )}
      {status === 'full' && (
        <>
          <Text style={styles.emoji}>😔</Text>
          <Text style={styles.title}>Chuyến đi đã đầy</Text>
          <Text style={styles.subtitle}>Lịch trình này đã đủ 5 thành viên tối đa.</Text>
          <TouchableOpacity style={styles.btnOutline} onPress={handleGoHome}>
            <Text style={styles.btnOutlineText}>Về trang chủ</Text>
          </TouchableOpacity>
        </>
      )}
      {status === 'error' && (
        <>
          <Text style={styles.emoji}>❌</Text>
          <Text style={styles.title}>Không thể tham gia</Text>
          <Text style={styles.subtitle}>{typeof errorMsg === 'string' && errorMsg ? errorMsg : (typeof (errorMsg as any)?.message === 'string' ? (errorMsg as any).message : 'Link mời không hợp lệ hoặc đã hết hạn.')}</Text>
          <TouchableOpacity style={styles.btnOutline} onPress={handleGoHome}>
            <Text style={styles.btnOutlineText}>Về trang chủ</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emoji: { fontSize: 64 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  btn: { marginTop: 16, backgroundColor: '#0c77b0', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnOutline: { marginTop: 16, borderWidth: 1.5, borderColor: '#0c77b0', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 },
  btnOutlineText: { color: '#0c77b0', fontSize: 14, fontWeight: '700' },
});

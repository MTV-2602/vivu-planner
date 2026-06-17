import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIF_KEY = (tripId: string) => `vivu_notif_${tripId}`;

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function scheduleTripReminder(
  tripId: string,
  tripTitle: string,
  startDate: string,
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const triggerDate = new Date(startDate);
    triggerDate.setDate(triggerDate.getDate() - 1);
    triggerDate.setHours(8, 0, 0, 0); // 8:00 AM the day before

    if (triggerDate <= new Date()) return;

    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🧭 Chuyến đi sắp bắt đầu!',
        body: `"${tripTitle}" bắt đầu vào ngày mai. Hãy chuẩn bị hành lý nhé!`,
        data: { tripId },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });

    await AsyncStorage.setItem(NOTIF_KEY(tripId), notifId);
  } catch {}
}

export async function cancelTripReminder(tripId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const notifId = await AsyncStorage.getItem(NOTIF_KEY(tripId));
    if (notifId) {
      await Notifications.cancelScheduledNotificationAsync(notifId);
      await AsyncStorage.removeItem(NOTIF_KEY(tripId));
    }
  } catch {}
}

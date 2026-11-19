import { supabaseAdmin } from '../config/supabase';

/**
 * Phát broadcast Realtime từ server qua REST (httpSend) — không cần subscribe kênh.
 * Luôn gỡ kênh sau khi gửi để tránh rò rỉ channel object. Không bao giờ throw.
 */
export async function broadcastRealtime(topic: string, event: string, payload: Record<string, any>): Promise<void> {
  let ch: any = null;
  try {
    ch = supabaseAdmin.channel(topic);
    const result: any = await ch.httpSend(event, payload);
    if (result && result.success === false) {
      console.warn(`[Realtime] Broadcast ${topic}/${event} thất bại:`, result.status, result.error);
    }
  } catch (e: any) {
    console.warn(`[Realtime] Lỗi broadcast ${topic}/${event}:`, e?.message || e);
  } finally {
    if (ch) {
      try {
        await supabaseAdmin.removeChannel(ch);
      } catch (_) {
        // bỏ qua lỗi gỡ kênh
      }
    }
  }
}

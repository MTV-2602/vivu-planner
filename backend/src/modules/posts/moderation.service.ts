import { supabaseAdmin } from '../../config/supabase';

// Danh sách biểu thức chính quy phát hiện từ ngữ vi phạm, tục tĩu, cờ bạc, lừa đảo, spam
export const BLACKLIST_PATTERNS: { pattern: RegExp; reason: string }[] = [
  // 1. Tục tĩu, chửi bậy, lăng mạ thô thiển
  {
    pattern: /(?:^|[^\p{L}\p{N}])(đụ|địt|đm|đkm|vcl|đcl|clgt|lồn|buồi|cặc|chó đẻ|óc chó|mẹ mày|bà mẹ mày|đồ ngu)(?=[^\p{L}\p{N}]|$)/iu,
    reason: 'ngôn từ xúc phạm, thiếu văn minh',
  },
  // 2. Cờ bạc, cá độ, lừa đảo, tài xỉu, lô đề
  {
    pattern: /(?:^|[^\p{L}\p{N}])(cá độ|đánh bạc|lô đề|tài xỉu|casino|kubet|thabet|nổ hũ|bắn cá đổi thưởng|cho vay nặng lãi|bốc bát họ|tiền ảo lừa đảo)(?=[^\p{L}\p{N}]|$)/iu,
    reason: 'nội dung cờ bạc, cá độ hoặc tài chính bất hợp pháp',
  },
  // 3. Spam số điện thoại rác quảng cáo
  {
    pattern: /(?:liên hệ|zalo|hotline|sđt|call|inbox)\s*(?:ngay|qua|số)?\s*:?\s*(?:0|\+84)[3|5|7|8|9]\d{8}\b/iu,
    reason: 'chứa số điện thoại quảng cáo hoặc spam',
  },
  // 4. Link lừa đảo, cá cược, kiếm tiền nhanh
  {
    pattern: /(?:t\.me\/|bit\.ly\/|cacuoc|gamebai|kiemtiennhanh|nhacai)/i,
    reason: 'chứa liên kết quảng cáo hoặc cờ bạc trái phép',
  },
];

export interface ViolationCheckResult {
  isViolated: boolean;
  reason?: string;
  matchedWord?: string;
}

/**
 * Quét nội dung văn bản tìm từ ngữ vi phạm
 * LƯU Ý: Không giới hạn độ dài ngắn, các câu ngắn như "Quán ngon", "Rất thích" được phép 100%.
 */
export function checkContentViolation(text: string): ViolationCheckResult {
  if (!text || typeof text !== 'string') return { isViolated: false };

  const normalized = text.toLowerCase();
  for (const item of BLACKLIST_PATTERNS) {
    const match = item.pattern.exec(normalized);
    if (match) {
      return {
        isViolated: true,
        reason: item.reason,
        matchedWord: (match[1] || match[0]).trim(),
      };
    }
  }

  return { isViolated: false };
}

export interface UserPenaltyStatus {
  strikeCount: number;
  isBanned: boolean;
  bannedUntil: string | null;
  remainingDays: number;
}

/**
 * Lấy trạng thái phạt và số lần vi phạm của người dùng
 */
export async function getUserPenaltyStatus(userId: string): Promise<UserPenaltyStatus> {
  try {
    const { data: userRes, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !userRes?.user) {
      return { strikeCount: 0, isBanned: false, bannedUntil: null, remainingDays: 0 };
    }

    const meta = userRes.user.user_metadata || {};
    const strikeCount = Number(meta.strike_count) || 0;
    const bannedUntil = meta.posting_banned_until || null;

    let isBanned = false;
    let remainingDays = 0;

    if (bannedUntil) {
      const banDate = new Date(bannedUntil);
      const now = new Date();
      if (banDate > now) {
        isBanned = true;
        remainingDays = Math.ceil((banDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    return {
      strikeCount,
      isBanned,
      bannedUntil,
      remainingDays,
    };
  } catch (err) {
    console.error('[getUserPenaltyStatus] Error:', err);
    return { strikeCount: 0, isBanned: false, bannedUntil: null, remainingDays: 0 };
  }
}

/**
 * Cộng thêm 1 strike vi phạm cho người dùng.
 * Nếu đạt 5 strikes, tự động cấm đăng bài trong 7 ngày.
 */
export async function addStrikeToUser(userId: string, violationReason: string) {
  try {
    const { data: userRes, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !userRes?.user) return null;

    const meta = userRes.user.user_metadata || {};
    const currentStrikes = Number(meta.strike_count) || 0;
    const newStrikes = currentStrikes + 1;

    let bannedUntil = meta.posting_banned_until || null;
    let justBanned = false;

    // Đủ 5 lần vi phạm -> tự động cấm đăng bài 7 ngày
    if (newStrikes >= 5) {
      const banExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      bannedUntil = banExpiry.toISOString();
      justBanned = true;
    }

    const strikeHistory = Array.isArray(meta.strike_history) ? meta.strike_history : [];
    strikeHistory.push({
      date: new Date().toISOString(),
      reason: violationReason,
      strikeNumber: newStrikes,
    });

    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...meta,
        strike_count: newStrikes,
        posting_banned_until: bannedUntil,
        strike_history: strikeHistory,
      },
    });

    return {
      newStrikes,
      isBanned: newStrikes >= 5,
      bannedUntil,
      justBanned,
    };
  } catch (err) {
    console.error('[addStrikeToUser] Error:', err);
    return null;
  }
}

/**
 * Mở khóa cấm đăng bài cho người dùng (nếu Admin muốn khôi phục sớm)
 */
export async function resetUserPenalty(userId: string) {
  try {
    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (!userRes?.user) return false;

    const meta = userRes.user.user_metadata || {};
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...meta,
        strike_count: 0,
        posting_banned_until: null,
      },
    });
    return true;
  } catch (err) {
    console.error('[resetUserPenalty] Error:', err);
    return false;
  }
}

import { Router, Response } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../../middleware/requireAuth';
import { createRateLimiter } from '../../middleware/rateLimiter';
import { getSupabaseUserClient, supabaseAdmin } from '../../config/supabase';
import { getCityCoordinates, searchPlaces, PlaceCandidate, fetchCandidatePlacesForCity } from '../places/places.service';
import { getDefaultPlacesForCity } from '../places/defaultPlaces';
import { geocodeOnline } from '../places/geocoding.service';
import { getWeatherForecast } from '../weather/weather.service';
import { generateItinerary, adaptItinerary, generateAlternatives, chatWithItinerary, generateRichPlacesPool, buildRichPlacesFallback, generateDeterministicPlaceId } from '../ai/gemini.service';
import { getRelevantPartners, convertPartnersToPlaceCandidates, logPartnerEvent } from '../partners/partners.service';
import {
  TripStatus,
  TravelerType,
  UserRole,
  ChatMessageRole,
  BUDGET_ESTIMATION_CONFIG,
  QUOTA_CONFIG,
  AI_CANDIDATE_LIMITS,
  BUDGET_AUTO_SCALE_THRESHOLD,
  BUDGET_AUTO_SCALE_FACTOR,
  isUserPremium,
  getProCredits,
  getFreeQuota
} from '../../constants';

const router = Router();

// State machine transition graph for trip lifecycle
export const VALID_TRIP_TRANSITIONS: Record<string, string[]> = {
  [TripStatus.DRAFT]: [TripStatus.ACTIVE, TripStatus.ARCHIVED],
  [TripStatus.ACTIVE]: [TripStatus.COMPLETED, TripStatus.ARCHIVED],
  [TripStatus.COMPLETED]: [TripStatus.ARCHIVED, TripStatus.ACTIVE],
  [TripStatus.ARCHIVED]: [TripStatus.ACTIVE]
};

// Rate limiter for AI trip generation (10 requests per minute per user/IP)
const aiGenerationLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  message: 'Bạn đã gửi quá nhiều yêu cầu tạo lịch trình. Vui lòng chờ 1 phút trước khi tiếp tục.'
});

// Rate limiter for AI chat and adaptations (30 requests per minute per user/IP)
const aiChatLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Bạn đã gửi tin nhắn quá nhanh. Vui lòng chờ 1 phút trước khi tiếp tục.'
});

// Middleware requirePremium: kiểm tra quyền Pro của user hoặc chuyến đi Pro
const requirePremium = async (req: any, res: any, next: any) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (req.isAdmin) return next();

    // Nếu route có :id (tripId), kiểm tra chuyến đi có phải là chuyến Pro không
    const tripId = req.params?.id;
    if (tripId) {
      const { data: trip } = await supabaseAdmin
        .from('trips')
        .select('preferences')
        .eq('id', tripId)
        .maybeSingle();

      if (trip?.preferences?.is_ai_pro === true || trip?.preferences?.ai_tier === 'pro') {
        return next();
      }
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!isUserPremium(profile)) {
      return res.status(403).json({ error: 'Tính năng chỉ dành cho tài khoản Pro hoặc chuyến đi Pro', requires_premium: true });
    }
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Helper: Trừ quota chuyến đi (Pro hoặc Free)
export async function deductTripQuota(
  userId: string,
  isAiPro: boolean,
  existingDraftTrip: any,
  tripId: string,
  profile: any
): Promise<{ success: boolean; deducted?: boolean; error?: string }> {
  if (isAiPro) {
    const alreadyConsumed = Boolean(existingDraftTrip?.preferences?.pro_credit_consumed);
    if (!alreadyConsumed) {
      // 1. Gọi RPC consume_pro_credit (atomic)
      const { data: remainingAfter, error: rpcErr } = await supabaseAdmin.rpc('consume_pro_credit', {
        p_user_id: userId,
      });

      if (rpcErr) {
        // NẾU RPC báo NO_PRO_CREDIT: coi là hết lượt ngay lập tức, tuyệt đối KHÔNG fallback dùng profile stale!
        if (rpcErr.message?.includes('NO_PRO_CREDIT')) {
          return { success: false, error: 'Bạn không còn lượt Pro khả dụng. Vui lòng mua thêm gói để tạo chuyến đi này!' };
        }

        const isMissingFunction = rpcErr.code === 'PGRST202' || rpcErr.message?.includes('Could not find the function');
        if (!isMissingFunction) {
          console.error('[TripQuota] Unexpected consume_pro_credit RPC error:', rpcErr);
          return { success: false, error: 'Không thể trừ lượt Pro: ' + rpcErr.message };
        }

        console.warn('[TripQuota] consume_pro_credit RPC missing, attempting safe manual deduction:', rpcErr.message);
        // Fallback thủ công an toàn CHỈ khi thiếu hàm: đọc LẠI profile tươi từ DB ngay trước khi trừ,
        // trừ bằng điều kiện tối ưu lạc quan (optimistic concurrency) để không double-spend.
        const { data: currentProf } = await supabaseAdmin
          .from('profiles')
          .select('pro_credits, monthly_credits, premium_until')
          .eq('id', userId)
          .maybeSingle();

        const now = new Date();
        const hasActiveMonthly = Boolean(
          currentProf?.premium_until && new Date(currentProf.premium_until) > now && (currentProf?.monthly_credits ?? 0) > 0
        );

        if (hasActiveMonthly) {
          const currentMonthly = currentProf?.monthly_credits ?? 0;
          const { data: upRes, error: upErr } = await supabaseAdmin
            .from('profiles')
            .update({
              monthly_credits: currentMonthly - 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', userId)
            .eq('monthly_credits', currentMonthly)
            .select();

          if (upErr || !upRes || upRes.length === 0) {
            return { success: false, error: 'Bạn đã hết lượt Pro khả dụng.' };
          }
        } else if ((currentProf?.pro_credits ?? 0) > 0) {
          const currentPro = currentProf?.pro_credits ?? 0;
          const { data: upRes, error: upErr } = await supabaseAdmin
            .from('profiles')
            .update({
              pro_credits: currentPro - 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', userId)
            .eq('pro_credits', currentPro)
            .select();

          if (upErr || !upRes || upRes.length === 0) {
            return { success: false, error: 'Bạn đã hết lượt Pro khả dụng.' };
          }
        } else {
          return { success: false, error: 'Bạn đã hết lượt Pro khả dụng.' };
        }
      }

      // Đánh dấu cờ pro_credit_consumed: true vào preferences của chuyến đi
      const { data: freshTrip } = await supabaseAdmin.from('trips').select('preferences').eq('id', tripId).maybeSingle();
      const updatedPrefs = {
        ...(freshTrip?.preferences || {}),
        is_ai_pro: true,
        ai_tier: 'pro',
        pro_credit_consumed: true,
      };
      await supabaseAdmin.from('trips').update({ preferences: updatedPrefs }).eq('id', tripId);
      return { success: true, deducted: true };
    }
  } else {
    // Chuyến thường (Free): chỉ tăng quota_used khi chưa trừ cho chuyến này
    const alreadyConsumedFree = Boolean(existingDraftTrip?.preferences?.quota_consumed);
    if (!alreadyConsumedFree && profile) {
      const nextUsed = (profile?.quota_used ?? 0) + 1;
      await supabaseAdmin
        .from('profiles')
        .update({
          quota_used: nextUsed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      // Đánh dấu cờ quota_consumed: true vào preferences của chuyến đi
      const { data: freshTrip } = await supabaseAdmin.from('trips').select('preferences').eq('id', tripId).maybeSingle();
      const updatedPrefs = {
        ...(freshTrip?.preferences || {}),
        quota_consumed: true,
      };
      await supabaseAdmin.from('trips').update({ preferences: updatedPrefs }).eq('id', tripId);
      return { success: true, deducted: true };
    }
  }
  return { success: true, deducted: false };
}

// Helper: Hoàn trả lại quota khi xảy ra lỗi tạo chuyến sau khi đã trừ
export async function rollbackTripQuota(
  userId: string,
  isAiPro: boolean,
  tripId?: string | null
): Promise<void> {
  try {
    if (isAiPro) {
      // 1. Hoàn trả Pro: cộng lại 1 vào pro_credits trên DB
      const { data: currentProf } = await supabaseAdmin
        .from('profiles')
        .select('pro_credits')
        .eq('id', userId)
        .maybeSingle();

      const currentPro = currentProf?.pro_credits ?? 0;
      await supabaseAdmin
        .from('profiles')
        .update({
          pro_credits: currentPro + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (tripId) {
        const { data: freshTrip } = await supabaseAdmin
          .from('trips')
          .select('preferences')
          .eq('id', tripId)
          .maybeSingle();

        if (freshTrip?.preferences?.pro_credit_consumed) {
          const updatedPrefs = {
            ...freshTrip.preferences,
            pro_credit_consumed: false,
          };
          await supabaseAdmin.from('trips').update({ preferences: updatedPrefs }).eq('id', tripId);
        }
      }
      console.log(`[RollbackQuota] Đã hoàn trả lại 1 pro_credit cho user ${userId}`);
    } else {
      // 2. Hoàn trả Free: trừ đi 1 ở quota_used trên DB (không giảm dưới 0)
      const { data: currentProf } = await supabaseAdmin
        .from('profiles')
        .select('quota_used')
        .eq('id', userId)
        .maybeSingle();

      const currentUsed = currentProf?.quota_used ?? 0;
      const newUsed = Math.max(0, currentUsed - 1);
      await supabaseAdmin
        .from('profiles')
        .update({
          quota_used: newUsed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (tripId) {
        const { data: freshTrip } = await supabaseAdmin
          .from('trips')
          .select('preferences')
          .eq('id', tripId)
          .maybeSingle();

        if (freshTrip?.preferences?.quota_consumed) {
          const updatedPrefs = {
            ...freshTrip.preferences,
            quota_consumed: false,
          };
          await supabaseAdmin.from('trips').update({ preferences: updatedPrefs }).eq('id', tripId);
        }
      }
      console.log(`[RollbackQuota] Đã hoàn trả lại 1 lượt miễn phí (quota_used: ${currentUsed} -> ${newUsed}) cho user ${userId}`);
    }
  } catch (err: any) {
    console.error('[RollbackQuota] Lỗi hoàn trả quota:', err.message);
  }
}

const logActivity = async (tripId: string, userId: string, actionType: string, itemTitle?: string | null, itemId?: string | null, detail?: any) => {
  try {
    await supabaseAdmin.from('trip_activity_log').insert({
      trip_id: tripId,
      user_id: userId,
      action_type: actionType,
      item_title: itemTitle || null,
      item_id: itemId || null,
      detail: detail || null,
    });
  } catch (e) {
    // silent fail — không để lỗi log break main flow
  }
};

function deduplicatePlaces(places: PlaceCandidate[]): PlaceCandidate[] {
  const seen = new Set<string>();
  return places.filter(p => {
    if (!p.google_place_id) return true;
    if (seen.has(p.google_place_id)) return false;
    seen.add(p.google_place_id);
    return true;
  });
}

function formatTimeForDb(timeStr?: string | null): string | null {
  if (!timeStr) return null;
  const clean = timeStr.trim();
  // Khớp định dạng HH:MM hoặc HH:MM:SS đầu tiên (an toàn với các dải giờ như "18:00-19:00" hoặc "18:00 - 20:00")
  const match = clean.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const hh = match[1].padStart(2, '0');
    const mm = match[2].padStart(2, '0');
    const ss = match[3] ? match[3].padStart(2, '0') : '00';
    return `${hh}:${mm}:${ss}`;
  }
  return null;
}

function parseOptionalCost(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;

  let parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;

  // Tự động quy đổi đơn vị: Nếu AI hoặc người dùng nhập tắt (VD: 50 thay vì 50,000đ), nhân hệ số 1,000
  if (parsed > 0 && parsed < BUDGET_AUTO_SCALE_THRESHOLD) {
    parsed = parsed * BUDGET_AUTO_SCALE_FACTOR;
  }

  return Math.max(0, Math.round(parsed));
}

// GET /api/trips - List all trips of the current user (owned + collaborated)
router.get('/', requireAuth, async (req: any, res: Response) => {
  try {
    const currentUserId = req.user!.id;

    // 1. Lấy danh sách trip_id mà user là collaborator
    const { data: collabRows } = await supabaseAdmin
      .from('trip_collaborators')
      .select('trip_id')
      .eq('user_id', currentUserId);

    const collabTripIds = (collabRows || []).map((c: any) => c.trip_id).filter(Boolean);

    // 2. Query trips: hoặc do user tạo, hoặc nằm trong collabTripIds
    let tripsQuery = supabaseAdmin
      .from('trips')
      .select('*');

    if (collabTripIds.length > 0) {
      tripsQuery = tripsQuery.or(`user_id.eq.${currentUserId},id.in.(${collabTripIds.join(',')})`);
    } else {
      tripsQuery = tripsQuery.eq('user_id', currentUserId);
    }

    const { data: trips, error } = await tripsQuery.order('created_at', { ascending: false });

    if (error) throw error;

    const allTripIds = (trips || []).map((t: any) => t.id);
    const collabsByTripId: Record<string, number> = {};
    if (allTripIds.length > 0) {
      const { data: allCollabs } = await supabaseAdmin
        .from('trip_collaborators')
        .select('trip_id')
        .in('trip_id', allTripIds);

      if (allCollabs) {
        for (const c of allCollabs) {
          collabsByTripId[c.trip_id] = (collabsByTripId[c.trip_id] || 0) + 1;
        }
      }
    }

    const mappedTrips = (trips || []).map((t: any) => {
      const count = collabsByTripId[t.id] || 0;
      return {
        ...t,
        is_ai_pro: Boolean(t.preferences?.is_ai_pro || t.preferences?.ai_tier === 'pro'),
        is_shared: count > 0,
        member_count: count + 1,
        is_owner: t.user_id === currentUserId
      };
    });
    return res.json(mappedTrips);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to retrieve trips', details: error.message });
  }
});

// GET /api/trips/chat - Lấy lịch sử trò chuyện chung
router.get('/chat', requireAuth, async (req: any, res: Response) => {
  try {
    const { data: messages, error } = await supabaseAdmin
      .from('trip_chat_messages')
      .select('*')
      .is('trip_id', null)
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return res.json({
      success: true,
      messages: messages || []
    });
  } catch (err: any) {
    console.warn('[GetGeneralChatHistory] Error:', err.message);
    return res.json({ success: true, messages: [] });
  }
});

// PUT /api/trips/join/:token — Gia nhập qua link mời
router.put('/join/:token', requireAuth, async (req: any, res: Response) => {
  try {
    const token = req.params.token;
    const userId = req.user!.id;

    // 1. Tìm trip có pending_invites chứa :token
    const { data: trips, error: tripsError } = await supabaseAdmin
      .from('trips')
      .select('id, user_id, preferences');

    if (tripsError || !trips) {
      return res.status(500).json({ error: 'Lỗi truy vấn dữ liệu chuyến đi' });
    }

    let foundTrip: any = null;
    let foundInvite: any = null;

    for (const t of trips) {
      const pending = Array.isArray(t.preferences?.pending_invites) ? t.preferences.pending_invites : [];
      const inv = pending.find((p: any) => p.invite_token === token);
      if (inv) {
        foundTrip = t;
        foundInvite = inv;
        break;
      }
    }

    // 2. Nếu không tìm thấy -> 404
    if (!foundTrip || !foundInvite) {
      return res.status(404).json({ error: 'Link mời không hợp lệ hoặc đã hết hạn' });
    }

    // Kiểm tra hết hạn 7 ngày
    if (new Date(foundInvite.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Link mời đã hết hạn' });
    }

    const tripId = foundTrip.id;

    // 3. Check user không phải owner
    if (foundTrip.user_id === userId) {
      return res.status(400).json({ error: 'Bạn là chủ chuyến đi này' });
    }

    // 4. Check user chưa là member
    const { data: existingMember } = await supabaseAdmin
      .from('trip_collaborators')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingMember) {
      return res.json({ already_member: true, trip_id: tripId, message: 'Bạn đã là thành viên của chuyến đi này' });
    }

    // 5. Check trip chưa đủ 5 người: đếm trip_collaborators (tối đa 4 người + 1 owner = 5)
    const { count: acceptedCount, error: countError } = await supabaseAdmin
      .from('trip_collaborators')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', tripId);

    if (countError) throw countError;

    if ((acceptedCount ?? 0) >= 4) {
      return res.status(400).json({ error: 'Chuyến đi đã đủ 5 thành viên' });
    }

    // 6. INSERT vào trip_collaborators
    const { error: insertError } = await supabaseAdmin
      .from('trip_collaborators')
      .insert({
        trip_id: tripId,
        user_id: userId,
        role: foundInvite.role || 'editor',
        invited_by: foundInvite.invited_by || foundTrip.user_id
      });

    if (insertError) throw insertError;

    // 7. Xóa invite_token đã dùng khỏi pending_invites nếu chuyến đi đã đủ 5 người (4 collaborators)
    if ((acceptedCount ?? 0) + 1 >= 4) {
      const updatedInvites = (foundTrip.preferences?.pending_invites || []).filter(
        (inv: any) => inv.invite_token !== token
      );
      await supabaseAdmin
        .from('trips')
        .update({
          preferences: {
            ...(foundTrip.preferences || {}),
            pending_invites: updatedInvites
          }
        })
        .eq('id', tripId);
    }

    // Auto-log activity
    await logActivity(tripId, userId, 'join_trip', null, null, { role: foundInvite.role || 'editor' });

    // 8. Return
    return res.json({
      trip_id: tripId,
      role: foundInvite.role || 'editor',
      message: 'Tham gia thành công'
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to join trip', details: error.message });
  }
});

// POST /api/trips/:id/collaborators — Tạo link mời (owner + Pro only)
router.post('/:id/collaborators', requireAuth, requirePremium, async (req: any, res: Response) => {
  try {
    const tripId = req.params.id;
    const userId = req.user!.id;

    // 1. Lấy trip, check trip.user_id === req.user.id (phải là owner)
    const { data: trip, error: tripError } = await supabaseAdmin
      .from('trips')
      .select('id, user_id, preferences')
      .eq('id', tripId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    if (trip.user_id !== userId) {
      return res.status(403).json({ error: 'Chỉ chủ chuyến đi mới có quyền tạo link mời' });
    }

    // 2. Check quyền Pro: trip là Pro hoặc owner là Pro hoặc admin
    const isTripPro = Boolean(trip.preferences?.is_ai_pro === true || trip.preferences?.ai_tier === 'pro');
    if (!isTripPro && !req.isAdmin) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!isUserPremium(profile)) {
        return res.status(403).json({ error: 'Tính năng chỉ dành cho chuyến đi Pro hoặc tài khoản Pro', requires_premium: true });
      }
    }

    // 3. Đếm số member đã tham gia: count < 4
    const { count: acceptedCount, error: countError } = await supabaseAdmin
      .from('trip_collaborators')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', tripId);

    if (countError) throw countError;

    const currentInvites = Array.isArray(trip.preferences?.pending_invites) ? trip.preferences.pending_invites : [];
    const now = new Date();
    const activeInvites = currentInvites.filter((inv: any) => new Date(inv.expires_at) > now);

    if ((acceptedCount ?? 0) >= 4) {
      return res.status(400).json({ error: 'Chuyến đi đã đạt số lượng thành viên tối đa (5 người bao gồm chủ chuyến đi)' });
    }

    // 4. Sinh invite_token = random hex 16 bytes: crypto.randomBytes(16).toString('hex')
    const invite_token = crypto.randomBytes(16).toString('hex');
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const newInvite = {
      invite_token,
      invited_by: userId,
      role: 'editor',
      created_at: now.toISOString(),
      expires_at
    };

    // 5. Cập nhật vào trip.preferences.pending_invites
    const { error: updateError } = await supabaseAdmin
      .from('trips')
      .update({
        preferences: {
          ...(trip.preferences || {}),
          pending_invites: [...activeInvites, newInvite]
        }
      })
      .eq('id', tripId);

    if (updateError) throw updateError;

    // 6. Return
    const frontendBaseUrl = (process.env.FRONTEND_URL || 'https://vivu-planner.vercel.app').replace(/\/+$/, '');
    return res.json({
      invite_token,
      invite_url: `vivu://join/${invite_token}`,
      invite_web_url: `${frontendBaseUrl}/join/${invite_token}`,
      expires_in_days: 7
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to create collaborator invite', details: error.message });
  }
});

// GET /api/trips/:id/collaborators — Danh sách thành viên
router.get('/:id/collaborators', requireAuth, async (req: any, res: Response) => {
  try {
    const tripId = req.params.id;
    const userId = req.user!.id;
    const isAdmin = req.isAdmin === true || req.user?.role === 'admin';

    // 1. Check user có quyền xem trip (owner hoặc collaborator): query trip + trip_collaborators
    const { data: trip, error: tripError } = await supabaseAdmin
      .from('trips')
      .select('id, user_id, preferences')
      .eq('id', tripId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const isOwner = trip.user_id === userId;
    let isCollaborator = false;

    if (!isOwner && !isAdmin) {
      const { data: collab } = await supabaseAdmin
        .from('trip_collaborators')
        .select('id')
        .eq('trip_id', tripId)
        .eq('user_id', userId)
        .maybeSingle();

      if (collab) isCollaborator = true;
    }

    if (!isOwner && !isAdmin && !isCollaborator) {
      return res.status(403).json({ error: 'Bạn không có quyền xem danh sách thành viên chuyến đi này' });
    }

    // 2. Lấy owner info từ profiles
    const { data: ownerProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url, is_premium, premium_until')
      .eq('id', trip.user_id)
      .maybeSingle();

    const owner = {
      user_id: trip.user_id,
      display_name: ownerProfile?.full_name || 'Chủ chuyến đi',
      avatar_url: ownerProfile?.avatar_url || null,
      is_premium: isUserPremium(ownerProfile)
    };

    // 3. Lấy tất cả collaborators đã tham gia
    const { data: collabs, error: collabsError } = await supabaseAdmin
      .from('trip_collaborators')
      .select('id, user_id, role, created_at')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });

    if (collabsError) throw collabsError;

    const userIds = (collabs || []).map((c: any) => c.user_id).filter(Boolean);
    const profileMap = new Map<string, any>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, avatar_url, is_premium')
        .in('id', userIds);
      (profiles || []).forEach((p: any) => profileMap.set(p.id, p));
    }

    const acceptedMembers = (collabs || []).map((c: any) => {
      const memberProf = profileMap.get(c.user_id);
      return {
        id: c.id,
        user_id: c.user_id,
        display_name: memberProf?.full_name || 'Thành viên',
        avatar_url: memberProf?.avatar_url || null,
        role: c.role || 'editor',
        accepted_at: c.created_at,
        is_pending: false
      };
    });

    // 4. Lấy pending invites từ preferences
    const now = new Date();
    const currentInvites = Array.isArray(trip.preferences?.pending_invites) ? trip.preferences.pending_invites : [];
    const pendingMembers = currentInvites
      .filter((inv: any) => new Date(inv.expires_at) > now)
      .map((inv: any) => ({
        id: inv.invite_token,
        user_id: null,
        display_name: null,
        avatar_url: null,
        role: inv.role || 'editor',
        accepted_at: null,
        is_pending: true,
        invite_token: inv.invite_token
      }));

    const allMembers = [...acceptedMembers, ...pendingMembers];

    // 5. Return
    return res.json({
      owner,
      members: allMembers,
      total_count: 1 + acceptedMembers.length,
      max_members: 5
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to retrieve collaborators', details: error.message });
  }
});

// DELETE /api/trips/:id/collaborators/:uid — Kick hoặc tự rời (hỗ trợ xóa theo user_id, collaborator id hoặc invite_token)
router.delete('/:id/collaborators/:uid', requireAuth, async (req: any, res: Response) => {
  try {
    const tripId = req.params.id;
    const targetUid = req.params.uid;
    const currentUserId = req.user!.id;
    const isAdmin = req.isAdmin === true || req.user?.role === 'admin';

    // 1. Cho phép nếu: owner của trip (trip.user_id === req.user.id) HOẶC user tự rời (:uid === req.user.id) HOẶC admin
    const { data: trip, error: tripError } = await supabaseAdmin
      .from('trips')
      .select('id, user_id, preferences')
      .eq('id', tripId)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const isOwner = trip.user_id === currentUserId;
    const isSelf = targetUid === currentUserId;

    // Check nếu targetUid là invite_token trong pending_invites
    const currentInvites = Array.isArray(trip.preferences?.pending_invites) ? trip.preferences.pending_invites : [];
    const matchInvite = currentInvites.find((inv: any) => inv.invite_token === targetUid);

    if (matchInvite) {
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: 'Chỉ chủ chuyến đi mới có quyền hủy link mời' });
      }
      const updatedInvites = currentInvites.filter((inv: any) => inv.invite_token !== targetUid);
      await supabaseAdmin
        .from('trips')
        .update({
          preferences: {
            ...(trip.preferences || {}),
            pending_invites: updatedInvites
          }
        })
        .eq('id', tripId);

      return res.json({ message: 'Đã hủy link mời' });
    }

    // 2. Nếu không có quyền -> 403
    if (!isOwner && !isSelf && !isAdmin) {
      return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này' });
    }

    // 3. DELETE FROM trip_collaborators WHERE trip_id = :id AND (user_id = :uid OR id = :uid)
    const { error: deleteError } = await supabaseAdmin
      .from('trip_collaborators')
      .delete()
      .eq('trip_id', tripId)
      .or(`user_id.eq.${targetUid},id.eq.${targetUid}`);

    if (deleteError) throw deleteError;

    // Auto-log activity
    await logActivity(tripId, currentUserId, 'leave_trip');

    // 4. Return
    return res.json({ message: 'Đã xóa thành viên' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to remove collaborator', details: error.message });
  }
});

// POST /api/trips/:id/activity — Ghi log một hành động
router.post('/:id/activity', requireAuth, async (req: any, res: Response) => {
  try {
    const tripId = req.params.id;
    const userId = req.user.id;
    const { action_type, item_title, item_id, detail } = req.body;

    // Validate action_type
    const VALID_ACTIONS = ['drag_item','edit_item','add_item','delete_item','join_trip','leave_trip','save_schedule','apply_ai','view_trip'];
    if (!VALID_ACTIONS.includes(action_type)) {
      return res.status(400).json({ error: 'Invalid action_type' });
    }

    // Lấy display_name của user
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email, avatar_url')
      .eq('id', userId)
      .maybeSingle();

    const displayName = profile?.full_name || profile?.email?.split('@')[0] || 'Thành viên';

    // Insert log
    const { data: log, error } = await supabaseAdmin
      .from('trip_activity_log')
      .insert({
        trip_id: tripId,
        user_id: userId,
        action_type,
        item_title: item_title || null,
        item_id: item_id || null,
        detail: detail || null,
      })
      .select()
      .single();

    if (error) throw error;

    return res.json({
      ...log,
      display_name: displayName,
      avatar_url: profile?.avatar_url || null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to log activity', details: err.message });
  }
});

// GET /api/trips/:id/activity — Lấy lịch sử activity (50 log gần nhất)
router.get('/:id/activity', requireAuth, async (req: any, res: Response) => {
  try {
    const tripId = req.params.id;
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    const { data: logs, error } = await supabaseAdmin
      .from('trip_activity_log')
      .select('id, trip_id, user_id, action_type, item_title, item_id, detail, created_at')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const userIds = [...new Set((logs || []).map((l: any) => l.user_id).filter(Boolean))];
    const profileMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', userIds);
      (profiles || []).forEach((p: any) => {
        profileMap[p.id] = p;
      });
    }

    return res.json({
      logs: (logs || []).map(log => {
        const prof = profileMap[log.user_id];
        return {
          ...log,
          display_name: prof?.full_name || prof?.email?.split('@')[0] || 'Thành viên',
          avatar_url: prof?.avatar_url || null,
        };
      })
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch activity', details: err.message });
  }
});

// GET /api/trips/:id - Get a specific trip detail with days and items
// ─── GET /trips/:id/public ── Public view (no auth required, for share links) ──
router.get('/:id/public', async (req, res: Response) => {
  const tripId = req.params.id;
  try {
    const { data: trip, error: tripError } = await supabaseAdmin
      .from('trips')
      .select('id,title,destination_city,start_date,end_date,budget_total,traveler_count,traveler_type,status,is_public')
      .eq('id', tripId)
      .eq('is_public', true)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({ error: 'Chuyến đi không tồn tại hoặc đang ở chế độ riêng tư' });
    }

    const { data: days } = await supabaseAdmin
      .from('itinerary_days')
      .select('*')
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true });

    let daysWithItems: any[] = [];
    if (days && days.length > 0) {
      const dayIds = days.map(d => d.id);
      const { data: items } = await supabaseAdmin
        .from('itinerary_items')
        .select('id,item_type,title,description,start_time,end_time,estimated_cost,location_lat,location_lng,google_place_id,status,order_index,day_id')
        .in('day_id', dayIds)
        .neq('status', 'replaced')
        .neq('status', 'skipped')
        .order('order_index', { ascending: true });

      daysWithItems = days.map(day => ({
        ...day,
        items: (items || []).filter(i => i.day_id === day.id),
      }));
    }

    return res.json({ ...trip, days: daysWithItems });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requireAuth, async (req: any, res: Response) => {
  const tripId = req.params.id;

  try {
    const [tripResult, collaboratorsResult] = await Promise.all([
      supabaseAdmin
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .single(),
      supabaseAdmin
        .from('trip_collaborators')
        .select('id, user_id, role, invited_by, created_at')
        .eq('trip_id', tripId)
    ]);

    const { data: trip, error: tripError } = tripResult;
    const { data: collaborators } = collaboratorsResult;

    if (tripError || !trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Check authorization: owner, public, collaborator, or admin
    const isOwner = trip.user_id === req.user!.id;
    const isPublic = !!trip.is_public;
    const isAdmin = req.isAdmin === true || req.user?.role === 'admin';
    const isCollaborator = (collaborators || []).some(
      (c: any) => c.user_id === req.user!.id
    );
    if (!isOwner && !isPublic && !isAdmin && !isCollaborator) {
      return res.status(403).json({ error: 'Bạn không có quyền truy cập chuyến đi này' });
    }

    // Gom các query không phụ thuộc nhau vào Promise.all:
    let partnersQuery = supabaseAdmin
      .from('partners')
      .select('id, name, city, category, address, booking_url, active_status')
      .eq('active_status', true);

    if (trip.destination_city) {
      partnersQuery = partnersQuery.ilike('city', `%${trip.destination_city}%`);
    }

    const [
      daysResult,
      partnersResult,
      revisionsResult,
      priorTripsResult
    ] = await Promise.all([
      supabaseAdmin
        .from('itinerary_days')
        .select('*')
        .eq('trip_id', tripId)
        .order('day_number', { ascending: true }),
      partnersQuery.limit(200),
      supabaseAdmin
        .from('itinerary_revisions')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseAdmin
        .from('trips')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', trip.user_id)
        .lte('created_at', trip.created_at)
    ]);

    if (daysResult.error) throw daysResult.error;

    const days = daysResult.data || [];
    const partners = partnersResult.data || [];
    const revisions = revisionsResult.data || [];
    const priorTripsCount = priorTripsResult.count ?? 0;

    let daysWithItems: any[] = [];
    if (days.length > 0) {
      const dayIds = days.map((d: any) => d.id);
      const { data: items, error: itemsError } = await supabaseAdmin
        .from('itinerary_items')
        .select('*')
        .in('day_id', dayIds)
        .order('order_index', { ascending: true });

      if (itemsError) throw itemsError;

      // Dynamically match and enrich partner information for pre-existing itinerary items
      let enrichedItems = items || [];
      try {
        const activePartners = partners || [];

        const normalizeNameForMatching = (name: string): string => {
          if (!name) return '';
          return name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // remove diacritics
            .replace(/[&\/\\#,+()$~%.'\":*?<>{}]/g, '') // remove special chars
            .replace(/\s+/g, ' ') // normalize whitespace
            .trim();
        };

        const matchPartner = (itemTitle: string, partnerName: string): boolean => {
          const normTitle = normalizeNameForMatching(itemTitle);
          const normPartner = normalizeNameForMatching(partnerName);
          
          if (!normTitle || !normPartner) return false;
          if (normTitle === normPartner) return true;
          
          if (normPartner.length >= 6) {
            if (normTitle.includes(normPartner) || normPartner.includes(normTitle)) {
              return true;
            }
          }
          return false;
        };

        enrichedItems = (items || []).map((item: any) => {
          // If it's already a partner item, keep it but ensure booking_url is populated
          if (item.google_place_id && item.google_place_id.startsWith('partner_')) {
            const partnerId = item.google_place_id.replace('partner_', '');
            const matchedPartner = activePartners.find((p: any) => String(p.id) === partnerId);
            if (matchedPartner) {
              return {
                ...item,
                booking_url: item.booking_url || matchedPartner.booking_url || null
              };
            }
          }

          // Otherwise, check name match to enrich retroactively
          const matched = activePartners.find((p: any) => matchPartner(item.title, p.name));
          if (matched) {
            return {
              ...item,
              google_place_id: item.google_place_id || `partner_${matched.id}`,
              booking_url: item.booking_url || matched.booking_url || null
            };
          }

          return item;
        });
      } catch (partnerErr) {
        console.error('[GetTripDetail] Error enriching partner data:', partnerErr);
      }

      daysWithItems = days.map((day: any) => ({
        ...day,
        items: enrichedItems.filter((item: any) => item.day_id === day.id)
      }));
    }

    const isFreeTier = priorTripsCount <= 3;

    return res.json({
      ...trip,
      is_ai_pro: Boolean(trip.preferences?.is_ai_pro || trip.preferences?.ai_tier === 'pro'),
      days: daysWithItems,
      revisions: revisions || [],
      is_free_tier: isFreeTier,
      collaborators: (collaborators || []).map((c: any) => ({
        id: c.id,
        user_id: c.user_id,
        role: c.role,
        accepted_at: c.created_at,
        display_name: c.profiles?.display_name || c.profiles?.full_name,
        avatar_url: c.profiles?.avatar_url,
        is_premium: c.profiles?.is_premium,
      })),
      is_shared: (collaborators || []).length > 0,
      member_count: (collaborators || []).length + 1, // +1 cho owner
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to retrieve trip details', details: error.message });
  }
});

// POST /api/trips/pregen-places - AI sinh động danh sách địa điểm phong phú kèm tọa độ chuẩn theo ngân sách và sở thích
router.post('/pregen-places', requireAuth, async (req: any, res: Response) => {
  try {
    const {
      destination_city,
      days_count,
      budget_total,
      budget_breakdown,
      preferences,
      traveler_type,
      traveler_count,
      special_requirements,
      ai_provider,
      mode,
      cart_items,
      is_cart_mode,
      num_places
    } = req.body;

    if (!destination_city) {
      return res.status(400).json({ error: 'Thiếu thông tin thành phố điểm đến' });
    }

    const isCart = Boolean(mode === 'cart' || (cart_items && Array.isArray(cart_items) && cart_items.length > 0) || is_cart_mode === true);

    const pool = await generateRichPlacesPool({
      destination_city,
      days_count: Number(days_count) || 2,
      budget_total: Number(budget_total) || 5000000,
      traveler_count: Number(traveler_count) || 1,
      budget_breakdown,
      preferences: Array.isArray(preferences) ? preferences : (preferences ? [preferences] : []),
      traveler_type,
      special_requirements,
      ai_provider,
      is_cart_mode: isCart,
      num_places: Number(num_places) || (isCart ? 25 : 20)
    });

    return res.json({
      success: true,
      places: pool.places,
      city_center: pool.city_center
    });
  } catch (error: any) {
    console.error('[pregen-places error]:', error.message);
    const destCity = req.body?.destination_city || 'Hồ Chí Minh';
    const cityCoords = getCityCoordinates(destCity);
    const fallbackPlaces = buildRichPlacesFallback(
      destCity,
      Number(req.body?.days_count) || 2,
      false,
      cityCoords
    );

    return res.json({
      success: true,
      places: fallbackPlaces,
      city_center: cityCoords
    });
  }
});

// POST /api/trips - Create a new trip and generate AI itinerary
router.post('/', requireAuth, aiGenerationLimiter, async (req: any, res: Response) => {
  const client = getSupabaseUserClient(req.token!);
  
  const {
    draft_id,
    draftId,
    title,
    destination_city,
    start_date,
    end_date,
    budget_total,
    traveler_count,
    traveler_type,
    preferences,
    health_conditions,
    special_requirements,
    cart_items,
    creation_mode,
    is_draft,
    is_finalizing
  } = req.body;

  // Check trip creation quota: Free = 3 trips, custom_quota for purchased packs, Admin = unlimited
  const userId = req.user!.id;

  // Xác định rõ bản nháp đang chọn giỏ / mời nhóm (chưa chốt chuyến đi)
  const isFinalizing = Boolean(is_finalizing === true || is_finalizing === 'true');
  const isDraft = Boolean(is_draft === true || is_draft === 'true');
  const isDraftOnly = Boolean(isDraft || (creation_mode === 'manual' && !isFinalizing));

  // Kiểm tra nếu có draft_id: kiểm tra trong DB xem có trip với id === draft_id không
  const targetDraftId = draft_id || draftId;
  let existingDraftTrip: any = null;
  if (targetDraftId) {
    const { data: foundDraftTrip, error: findTripErr } = await supabaseAdmin
      .from('trips')
      .select('*')
      .eq('id', targetDraftId)
      .maybeSingle();

    if (!findTripErr && foundDraftTrip) {
      if (foundDraftTrip.user_id !== userId) {
        return res.status(403).json({
          error: 'Chỉ trưởng nhóm (người khởi tạo) mới có quyền chốt danh sách và tạo lịch trình chuyến đi!'
        });
      }
      existingDraftTrip = foundDraftTrip;
    }
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  const isAdmin = req.isAdmin === true || profile?.role === UserRole.ADMIN;

  // Admin chỉ quản lý nghiệp vụ hệ thống, không tạo chuyến đi cá nhân
  if (isAdmin) {
    return res.status(403).json({
      error: 'Tài khoản Quản trị viên chỉ quản lý nghiệp vụ hệ thống và không tạo chuyến đi cá nhân. Vui lòng đăng nhập tài khoản Người dùng để tạo lịch trình.'
    });
  }

  // Pro là OPT-IN: người dùng chủ động chọn tạo chuyến Pro hoặc dùng tính năng Pro
  // Tuyệt đối KHÔNG tự động ép chuyến đi thành Pro chỉ vì user đang có gói Pro
  const wantsPro = Boolean(
    req.body.ai_provider === 'custom_openai' ||
    req.body.is_ai_pro === true ||
    req.body.use_pro_workspace === true ||
    (creation_mode === 'manual' && req.body.use_pro_workspace === true) ||
    preferences?.is_ai_pro === true ||
    preferences?.use_pro_workspace === true ||
    existingDraftTrip?.preferences?.is_ai_pro === true ||
    existingDraftTrip?.preferences?.ai_tier === 'pro'
  );

  const proInfo = getProCredits(profile, new Date());
  const freeQuota = getFreeQuota(profile);
  const alreadyConsumed = Boolean(existingDraftTrip?.preferences?.pro_credit_consumed);
  const alreadyConsumedFree = Boolean(existingDraftTrip?.preferences?.quota_consumed);

  // Kiểm tra quota theo loại chuyến đi: Không chặn lỗi nếu là bản nháp đang chọn giỏ / mời nhóm (isDraftOnly) hoặc đã trừ quota trước đó
  if (!isDraftOnly) {
    if (wantsPro) {
      if (!alreadyConsumed && proInfo.total <= 0) {
        return res.status(403).json({
          error: 'Bạn đã hết lượt Pro. Vui lòng mua thêm gói để tạo chuyến Pro.',
          requires_premium: true
        });
      }
    } else {
      if (!alreadyConsumedFree && freeQuota.remaining <= 0 && !existingDraftTrip) {
        return res.status(403).json({
          error: `Bạn đã sử dụng hết hạn mức (${freeQuota.total} chuyến đi). Vui lòng nâng cấp gói để tiếp tục sáng tạo chuyến đi!`
        });
      }
    }
  }

  // Kiểm tra phân quyền sử dụng AI Gateway bên thứ 3 (Chỉ dành cho chuyến Pro)
  const requestedAiProvider = req.body.ai_provider;
  if (!isDraftOnly && requestedAiProvider === 'custom_openai' && !alreadyConsumed && proInfo.total <= 0) {
    return res.status(403).json({
      error: 'Mô hình AI Chuyên Sâu (GPT-5.4 / Gemini 3.8 Flash High) là đặc quyền dành riêng cho chuyến Pro. Vui lòng nạp thêm lượt Pro để trải nghiệm!',
      requires_premium: true
    });
  }

  const isAiPro = wantsPro;

  if (!destination_city || !start_date || !end_date || !budget_total) {
    return res.status(400).json({ error: 'Missing required parameters: destination_city, start_date, end_date, budget_total' });
  }

  // Auto-correct year if the date is too far in the past (> 30 days ago)
  // This handles cases where the AI chatbot inferred the wrong year
  const autoCorrectDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const nowUtc = new Date();
    const vietnamNow = new Date(nowUtc.getTime() + 7 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(vietnamNow.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (date < thirtyDaysAgo) {
      date.setFullYear(date.getFullYear() + 1);
      return date.toISOString().split('T')[0];
    }
    return dateStr;
  };

  const correctedStartDate = autoCorrectDate(start_date);
  const correctedEndDate = autoCorrectDate(end_date);

  if (new Date(correctedStartDate) > new Date(correctedEndDate)) {
    return res.status(400).json({
      error: `Ngày bắt đầu (${correctedStartDate}) phải trước ngày kết thúc (${correctedEndDate}). Vui lòng kiểm tra lại ngày du lịch.`
    });
  }

  // Predict realistic minimum cost for trip validation
  const start = new Date(correctedStartDate);
  const end = new Date(correctedEndDate);
  let daysCount = 1;
  if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
    const diffTime = Math.abs(end.getTime() - start.getTime());
    daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }
  const nightsCount = Math.max(0, daysCount - 1);
  const travelers = Math.max(1, parseInt(traveler_count || '1'));
  
  // Real-world estimation using unified budget config
  const minRequiredBudget = BUDGET_ESTIMATION_CONFIG.calculateMinimumBudget(daysCount, nightsCount, travelers);
  
  const parsedBudget = parseFloat(budget_total);
  if (isNaN(parsedBudget) || parsedBudget < minRequiredBudget) {
    return res.status(400).json({
      error: `Ngân sách tối thiểu dự kiến cho chuyến đi ${daysCount} ngày (${nightsCount} đêm) của ${travelers} khách tại ${destination_city} là ${minRequiredBudget.toLocaleString('vi-VN')}đ. Vui lòng tăng ngân sách hợp lệ để tiếp tục.`
    });
  }

  let createdTripId: string | null = null;
  let quotaDeducted = false;

  try {
    // 1. Resolve coordinates
    const { lat, lng } = getCityCoordinates(destination_city);

    // Xử lý chế độ tạo thủ công: creation_mode === 'manual'
    if (creation_mode === 'manual') {
      const pregenPlaces = req.body.pregen_places || preferences?.pregen_places || existingDraftTrip?.preferences?.pregen_places || [];
      const workspaceStage = req.body.workspace_stage || preferences?.workspace_stage || existingDraftTrip?.preferences?.workspace_stage || 'draft_pool';
      const enrichedPreferences = {
        ...(existingDraftTrip?.preferences || {}),
        ...(preferences || {}),
        pregen_places: pregenPlaces,
        workspace_stage: workspaceStage,
        is_ai_pro: isAiPro,
        ai_tier: isAiPro ? 'pro' : 'standard',
        use_pro_workspace: Boolean(req.body.use_pro_workspace || preferences?.use_pro_workspace),
        creation_mode: 'manual',
        pro_credit_consumed: Boolean(existingDraftTrip?.preferences?.pro_credit_consumed || preferences?.pro_credit_consumed),
        quota_consumed: Boolean(existingDraftTrip?.preferences?.quota_consumed || preferences?.quota_consumed)
      };

      let trip: any;
      if (existingDraftTrip) {
        // Tái sử dụng chính bản ghi draft_id: Update thông tin mới, giữ nguyên trip_collaborators 100%
        const { data: updatedTrip, error: updateErr } = await supabaseAdmin
          .from('trips')
          .update({
            title: title || `Chuyến đi ${destination_city}`,
            destination_city,
            destination_province: destination_city,
            start_date: correctedStartDate,
            end_date: correctedEndDate,
            budget_total: parseFloat(budget_total),
            traveler_count: parseInt(traveler_count || '1'),
            traveler_type: traveler_type || TravelerType.SOLO,
            preferences: enrichedPreferences,
            health_conditions: health_conditions || '',
            special_requirements: special_requirements || '',
            status: TripStatus.DRAFT
          })
          .eq('id', existingDraftTrip.id)
          .select()
          .single();

        if (updateErr || !updatedTrip) {
          throw updateErr || new Error('Failed to update draft trip record in manual mode');
        }
        trip = updatedTrip;
        createdTripId = existingDraftTrip.id;

        // Xóa các items và ngày itinerary_days cũ của draft_id (nếu có) để chuẩn bị tạo các ngày mới theo lịch trình vừa chốt
        const { data: oldDays } = await supabaseAdmin
          .from('itinerary_days')
          .select('id')
          .eq('trip_id', existingDraftTrip.id);
        if (oldDays && oldDays.length > 0) {
          const oldDayIds = oldDays.map(d => d.id);
          await supabaseAdmin
            .from('itinerary_items')
            .delete()
            .in('day_id', oldDayIds);
        }
        const { error: delDaysErr } = await supabaseAdmin
          .from('itinerary_days')
          .delete()
          .eq('trip_id', existingDraftTrip.id);

        if (delDaysErr) {
          console.error('[CreateTripManual] Failed to delete old itinerary_days:', delDaysErr.message);
        }
      } else {
        // 1. Tạo bản ghi trips với status: TripStatus.DRAFT, preferences enriched
        const { data: newTrip, error: tripError } = await supabaseAdmin
          .from('trips')
          .insert({
            user_id: req.user!.id,
            title: title || `Chuyến đi ${destination_city}`,
            destination_city,
            destination_province: destination_city,
            start_date: correctedStartDate,
            end_date: correctedEndDate,
            budget_total: parseFloat(budget_total),
            traveler_count: parseInt(traveler_count || '1'),
            traveler_type: traveler_type || TravelerType.SOLO,
            preferences: enrichedPreferences,
            health_conditions: health_conditions || '',
            special_requirements: special_requirements || '',
            status: TripStatus.DRAFT
          })
          .select()
          .single();

        if (tripError || !newTrip) {
          throw tripError || new Error('Failed to create trip record in manual mode');
        }
        trip = newTrip;
        createdTripId = trip.id;
      }

      // Liên kết toàn bộ tin nhắn chat chung cũ (với trip_id IS NULL) sang chuyến đi mới này
      const { error: chatLinkErr } = await supabaseAdmin
        .from('trip_chat_messages')
        .update({ trip_id: trip.id })
        .eq('user_id', req.user!.id)
        .is('trip_id', null);

      if (chatLinkErr) {
        console.error('[CreateTripManual] Failed to associate chat history with new trip:', chatLinkErr.message);
      }

      // 2. Sinh các ngày itinerary_days từ start_date đến end_date
      const manualDaysToInsert: any[] = [];
      const currDate = new Date(correctedStartDate);
      const lastDate = new Date(correctedEndDate);
      let dayIdx = 1;
      while (currDate <= lastDate) {
        manualDaysToInsert.push({
          id: crypto.randomUUID(),
          trip_id: trip.id,
          day_number: dayIdx,
          date: currDate.toISOString().split('T')[0],
          weather_summary: { note: 'Lịch trình tự chọn' }
        });
        currDate.setDate(currDate.getDate() + 1);
        dayIdx++;
      }

      // Fallback nếu có lỗi vòng lặp ngày
      if (manualDaysToInsert.length === 0) {
        manualDaysToInsert.push({
          id: crypto.randomUUID(),
          trip_id: trip.id,
          day_number: 1,
          date: correctedStartDate,
          weather_summary: { note: 'Lịch trình tự chọn' }
        });
      }

      const daysResult = await supabaseAdmin.from('itinerary_days').insert(manualDaysToInsert);
      if (daysResult.error) throw daysResult.error;

      const firstDay = manualDaysToInsert[0];

      // 3. Đưa các cart_items vào từng ngày theo cấu hình của người dùng
      // Phân bổ khung giờ thông minh khoa học theo loại dịch vụ
      const safeCartItems: any[] = Array.isArray(cart_items) ? cart_items : [];
      const manualItemsToInsert: any[] = [];

      const computeSmartTimeSlot = (category: string, orderInDay: number) => {
        if (category === 'accommodation') {
          return { start: '14:00:00', end: '15:00:00' };
        }
        const timeline = [
          { start: '07:30:00', end: '08:45:00' },
          { start: '09:00:00', end: '10:30:00' },
          { start: '10:45:00', end: '12:00:00' },
          { start: '12:15:00', end: '13:30:00' },
          { start: '15:30:00', end: '17:30:00' },
          { start: '18:30:00', end: '20:00:00' },
          { start: '20:15:00', end: '22:00:00' },
        ];
        return timeline[orderInDay % timeline.length];
      };

      safeCartItems.forEach((cItem, index) => {
        const place = cItem.place || cItem;
        const rawCost = cItem.custom_cost !== undefined && cItem.custom_cost !== null && cItem.custom_cost !== ''
          ? cItem.custom_cost
          : (place.estimated_cost !== undefined ? place.estimated_cost : (place.price_level ? place.price_level * 50000 : null));
        const estimatedCost = parseOptionalCost(rawCost);

        const rawCategory = String(place.category || '').toLowerCase();
        let normalizedType: 'accommodation' | 'transport' | 'dining' | 'attraction' | 'rental' | 'experience' = 'attraction';
        if (['accommodation', 'transport', 'dining', 'attraction', 'rental', 'experience'].includes(rawCategory)) {
          normalizedType = rawCategory as any;
        } else if (rawCategory === 'food' || rawCategory === 'restaurant' || rawCategory === 'cafe') {
          normalizedType = 'dining';
        } else if (rawCategory === 'hotel' || rawCategory === 'homestay' || rawCategory === 'resort') {
          normalizedType = 'accommodation';
        } else if (rawCategory === 'rental' || rawCategory === 'transport') {
          normalizedType = 'rental';
        }

        const rawPlaceId = place.id || place.google_place_id || cItem.partner_id || null;
        let itemPartnerId: string | null = null;
        if (rawPlaceId) {
          const cleanId = String(rawPlaceId).replace('partner_', '');
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (uuidRegex.test(cleanId)) {
            itemPartnerId = cleanId;
          }
        }

        const hasManualSchedule = Boolean(cItem.start_time && Number(cItem.day_number) > 0);
        let matchedDay: any;
        let finalStartTime: string | null = null;
        let finalEndTime: string | null = null;

        if (hasManualSchedule) {
          const targetDayNum = Number(cItem.day_number);
          matchedDay = manualDaysToInsert.find(d => d.day_number === targetDayNum) || manualDaysToInsert[manualDaysToInsert.length - 1] || firstDay;
          finalStartTime = formatTimeForDb(cItem.start_time) || cItem.start_time;
          if (cItem.end_time) {
            finalEndTime = formatTimeForDb(cItem.end_time) || cItem.end_time;
          } else {
            const parts = String(cItem.start_time).split(/[-–—]/);
            if (parts.length > 1) {
              finalEndTime = formatTimeForDb(parts[1]) || null;
            } else if (finalStartTime) {
              const [h, m] = finalStartTime.split(':').map(Number);
              const endH = Math.min(23, (h || 0) + 1);
              finalEndTime = `${String(endH).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}:00`;
            }
          }
        } else {
          const targetDayNum = Number(cItem.day_number || cItem.target_day || place.suggested_day) || 1;
          matchedDay = manualDaysToInsert.find(d => d.day_number === targetDayNum) || firstDay;
          const currentCountInDay = manualItemsToInsert.filter(it => it.day_id === matchedDay.id).length;
          const dayTimeSlot = computeSmartTimeSlot(normalizedType, currentCountInDay);
          finalStartTime = dayTimeSlot.start;
          finalEndTime = dayTimeSlot.end;
        }

        const placeTitle = place.name || place.title || cItem.title || 'Địa điểm đã chọn';
        const finalLat = Number(place.lat) || lat;
        const finalLng = Number(place.lng) || lng;
        const finalAddress = place.address || place.description || cItem.notes || '';
        const currentCountInDay = manualItemsToInsert.filter(it => it.day_id === matchedDay.id).length;

        manualItemsToInsert.push({
          day_id: matchedDay.id,
          partner_id: itemPartnerId,
          item_type: normalizedType,
          title: placeTitle,
          description: finalAddress,
          start_time: finalStartTime,
          end_time: finalEndTime,
          location_name: placeTitle,
          location_lat: finalLat,
          location_lng: finalLng,
          google_place_id: rawPlaceId ? String(rawPlaceId) : null,
          estimated_cost: estimatedCost,
          booking_url: place.booking_url || place.google_map_url || null,
          order_index: cItem.order_index !== undefined ? Number(cItem.order_index) : (currentCountInDay + 1),
          status: 'planned'
        });
      });

      if (manualItemsToInsert.length > 0) {
        const itemsResult = await supabaseAdmin.from('itinerary_items').insert(manualItemsToInsert);
        if (itemsResult.error) throw itemsResult.error;
      }

      // 4. Ghi vào bảng trip_cart_items để lưu vết
      if (safeCartItems.length > 0) {
        if (existingDraftTrip) {
          await supabaseAdmin.from('trip_cart_items').delete().eq('trip_id', trip.id);
        }
        const cartPayload = safeCartItems.map((cItem: any) => {
          const place = cItem.place || cItem;
          const rawPlaceId = place.id || place.google_place_id || cItem.partner_id || null;
          let partnerId: string | null = null;
          if (rawPlaceId) {
            const cleanId = String(rawPlaceId).replace('partner_', '');
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(cleanId)) {
              partnerId = cleanId;
            }
          }

          return {
            trip_id: trip.id,
            partner_id: partnerId,
            custom_cost: Number(cItem.custom_cost) || Number(place.estimated_cost) || 0,
            pricing_option: cItem.pricing_option === 'manual' ? 'manual' : 'auto',
            notes: place.name || cItem.notes || place.address || '',
          };
        });

        const { error: cartInsertErr } = await supabaseAdmin
          .from('trip_cart_items')
          .insert(cartPayload);
        if (cartInsertErr) {
          console.error('[CreateTripManual] Failed to save trip_cart_items:', cartInsertErr.message);
        }
      }

      // 5. Cập nhật quota chuyến đi (Pro hoặc Free): CHỈ trừ khi KHÔNG phải bản nháp đang chọn giỏ/mời nhóm (!isDraftOnly)
      if (!isDraftOnly) {
        const deductResult = await deductTripQuota(userId, isAiPro, existingDraftTrip, trip.id, profile);
        if (!deductResult.success) {
          if (!existingDraftTrip) {
            await supabaseAdmin.from('trips').delete().eq('id', trip.id);
          }
          return res.status(403).json({ error: deductResult.error || 'Lỗi cập nhật hạn mức chuyến đi', requires_premium: true });
        }
        if (deductResult.deducted) {
          quotaDeducted = true;
        }
      }

      // 6. Trả về status 201 với dữ liệu trip và days kèm items đã tạo, KHÔNG gọi AI generateItinerary
      const { data: fullTrip } = await supabaseAdmin
        .from('trips')
        .select('*')
        .eq('id', trip.id)
        .single();

      const dbDaysWithItems = manualDaysToInsert
        .sort((a, b) => a.day_number - b.day_number)
        .map(day => ({
          ...day,
          items: manualItemsToInsert.filter(item => item.day_id === day.id)
        }));

      return res.status(201).json({
        ...fullTrip,
        is_ai_pro: Boolean(fullTrip?.preferences?.is_ai_pro || fullTrip?.preferences?.ai_tier === 'pro'),
        days: dbDaysWithItems
      });
    }

    // 2. Fetch weather
    const weatherForecast = await getWeatherForecast(lat, lng, correctedStartDate, correctedEndDate);

    // 3. Quét toàn bộ địa điểm du lịch ứng viên trong 1 truy vấn duy nhất từ cache DB (kèm lọc ngân sách & cân bằng danh mục)
    const batchPlaces = await fetchCandidatePlacesForCity(
      destination_city,
      lat,
      lng,
      preferences,
      special_requirements || '',
      title || '',
      parseFloat(budget_total) || 5000000,
      parseInt(traveler_count || '1') || 1
    );
 
    // Lấy đối tác liên quan
    const relevantPartners = await getRelevantPartners(
      destination_city,
      lat,
      lng,
      preferences || {},
      parseFloat(budget_total) || 0,
      correctedStartDate,
      correctedEndDate,
      parseInt(traveler_count || '1')
    );
    const partnerCandidates = convertPartnersToPlaceCandidates(relevantPartners);

    // Chuyển đổi cart_items thành PlaceCandidate nếu có
    const safeCartItems: any[] = Array.isArray(cart_items) ? cart_items : [];
    const cartPlaceCandidates: PlaceCandidate[] = safeCartItems.map((cItem: any) => {
      const p = cItem.place || cItem;
      const rawPlaceId = p.id || p.google_place_id || cItem.partner_id || `cart_${crypto.randomUUID()}`;
      const rawCategory = String(p.category || '').toLowerCase();
      let candidateCategory: 'accommodation' | 'dining' | 'attraction' | 'rental' = 'attraction';
      if (['hotel', 'homestay', 'resort', 'accommodation'].includes(rawCategory)) {
        candidateCategory = 'accommodation';
      } else if (['restaurant', 'cafe', 'food', 'dining'].includes(rawCategory)) {
        candidateCategory = 'dining';
      } else if (['transport', 'rental'].includes(rawCategory)) {
        candidateCategory = 'rental';
      }

      const rating = Number(p.rating) || Number(p.admin_rating) || 4.8;
      const priceLevel = Number(p.price_level) || 2;

      return {
        google_place_id: String(rawPlaceId),
        name: p.name || p.title || cItem.title || 'Địa điểm đã chọn',
        category: candidateCategory,
        lat: Number(p.lat) || lat,
        lng: Number(p.lng) || lng,
        rating,
        price_level: priceLevel,
        address: p.address || p.description || cItem.notes || '',
        booking_url: p.booking_url || p.google_map_url || undefined
      };
    });

    const cartAccommodations = cartPlaceCandidates.filter(p => p.category === 'accommodation');
    const cartDining = cartPlaceCandidates.filter(p => p.category === 'dining');
    const cartAttractions = cartPlaceCandidates.filter(p => p.category === 'attraction');
    const cartRentals = cartPlaceCandidates.filter(p => p.category === 'rental');

    const mergedAccommodations = deduplicatePlaces([
      ...cartAccommodations,
      ...partnerCandidates.filter(p => p.category === 'accommodation'),
      ...batchPlaces.accommodation
    ]);
    const mergedDining = deduplicatePlaces([
      ...cartDining,
      ...partnerCandidates.filter(p => p.category === 'dining'),
      ...batchPlaces.dining
    ]);
    const mergedAttractions = deduplicatePlaces([
      ...cartAttractions,
      ...partnerCandidates.filter(p => p.category === 'attraction'),
      ...batchPlaces.attraction
    ]);
    const mergedRentals = deduplicatePlaces([
      ...cartRentals,
      ...partnerCandidates.filter(p => p.category === 'rental'),
      ...batchPlaces.rental
    ]);
 
    const totalBudgetVal = parseFloat(budget_total) || 5000000;
    const travelerCountVal = parseInt(traveler_count || '1') || 1;
    const budgetPerPaxVal = totalBudgetVal / travelerCountVal;

    let filteredAccommodations = mergedAccommodations;
    if (budgetPerPaxVal < 8000000) {
      filteredAccommodations = mergedAccommodations.filter(p => {
        if (p.price_level && p.price_level >= 3) return false;
        const name = (p.name || '').toLowerCase();
        if (
          name.includes('resort') ||
          name.includes('5 sao') ||
          name.includes('four seasons') ||
          name.includes('intercontinental') ||
          name.includes('marriott') ||
          name.includes('luxury')
        ) {
          return false;
        }
        return true;
      });
    }

    if (filteredAccommodations.length < 3) {
      const defAccs = getDefaultPlacesForCity(destination_city).accommodation.filter(p =>
        budgetPerPaxVal >= 8000000 || (p.price_level < 3 && !p.name.toLowerCase().includes('resort'))
      );
      defAccs.forEach(da => {
        if (!filteredAccommodations.some(fa => fa.name.toLowerCase() === da.name.toLowerCase())) {
          filteredAccommodations.push(da);
        }
      });
    }

    let enrichedAttractions = [...mergedAttractions];
    if (enrichedAttractions.length < 10) {
      const defAtts = getDefaultPlacesForCity(destination_city).attraction;
      defAtts.forEach(da => {
        if (!enrichedAttractions.some(ea => ea.name.toLowerCase() === da.name.toLowerCase())) {
          enrichedAttractions.push(da);
        }
      });
    }

    const candidatePlaces = {
      accommodation: filteredAccommodations.slice(0, Math.max(5, AI_CANDIDATE_LIMITS.ACCOMMODATION)),
      dining: mergedDining.slice(0, Math.min(20, AI_CANDIDATE_LIMITS.DINING)),
      attraction: enrichedAttractions.slice(0, Math.max(15, AI_CANDIDATE_LIMITS.ATTRACTION)),
      rental: mergedRentals.slice(0, AI_CANDIDATE_LIMITS.RENTAL)
    };

    // Bổ sung vào special_requirements đoạn nhắc bắt buộc nếu có cart_items
    let effectiveSpecialRequirements = special_requirements || '';
    if (safeCartItems.length > 0) {
      const placeNames = safeCartItems.map((cItem: any) => {
        const p = cItem.place || cItem;
        return p.name || p.title || cItem.title;
      }).filter(Boolean).join(', ');

      const mandatoryNotice = `[ĐỊA ĐIỂM BẮT BUỘC TỪ GIỎ HÀNG DU KHÁCH]: Người dùng đã chọn trước các địa điểm: ${placeNames}. Hãy sắp xếp các địa điểm này vào lịch trình.`;
      effectiveSpecialRequirements = effectiveSpecialRequirements
        ? `${effectiveSpecialRequirements}\n\n${mandatoryNotice}`
        : mandatoryNotice;
    }

    // 4. Generate AI itinerary using Gemini
    const itinerary = await generateItinerary(
      {
        ...req.body,
        special_requirements: effectiveSpecialRequirements,
        start_date: correctedStartDate,
        end_date: correctedEndDate
      },
      weatherForecast,
      candidatePlaces
    );

    const enrichedPreferences = {
      ...(existingDraftTrip?.preferences || {}),
      ...(preferences || {}),
      is_ai_pro: isAiPro,
      ai_tier: isAiPro ? 'pro' : 'standard',
      use_pro_workspace: Boolean(req.body.use_pro_workspace || preferences?.use_pro_workspace),
      pro_credit_consumed: Boolean(existingDraftTrip?.preferences?.pro_credit_consumed || preferences?.pro_credit_consumed),
      quota_consumed: Boolean(existingDraftTrip?.preferences?.quota_consumed || preferences?.quota_consumed)
    };

    // 5. Save trip to Supabase
    let trip: any;
    if (existingDraftTrip) {
      // Tái sử dụng chính bản ghi draft_id: Update thông tin mới, giữ nguyên trip_collaborators 100%
      const { data: updatedTrip, error: updateErr } = await supabaseAdmin
        .from('trips')
        .update({
          title: title || `Chuyến đi ${destination_city}`,
          destination_city,
          destination_province: destination_city,
          start_date: correctedStartDate,
          end_date: correctedEndDate,
          budget_total: parseFloat(budget_total),
          traveler_count: parseInt(traveler_count || '1'),
          traveler_type: traveler_type || TravelerType.SOLO,
          preferences: enrichedPreferences,
          health_conditions: health_conditions || '',
          special_requirements: effectiveSpecialRequirements,
          status: TripStatus.DRAFT
        })
        .eq('id', existingDraftTrip.id)
        .select()
        .single();

      if (updateErr || !updatedTrip) {
        throw updateErr || new Error('Failed to update draft trip record in AI mode');
      }
      trip = updatedTrip;
      createdTripId = existingDraftTrip.id;

      // Xóa các items và ngày itinerary_days cũ của draft_id (nếu có) để chuẩn bị tạo các ngày mới theo lịch trình vừa chốt
      const { data: oldDays } = await supabaseAdmin
        .from('itinerary_days')
        .select('id')
        .eq('trip_id', existingDraftTrip.id);
      if (oldDays && oldDays.length > 0) {
        const oldDayIds = oldDays.map(d => d.id);
        await supabaseAdmin
          .from('itinerary_items')
          .delete()
          .in('day_id', oldDayIds);
      }
      const { error: delDaysErr } = await supabaseAdmin
        .from('itinerary_days')
        .delete()
        .eq('trip_id', existingDraftTrip.id);

      if (delDaysErr) {
        console.error('[CreateTripAI] Failed to delete old itinerary_days:', delDaysErr.message);
      }
    } else {
      const { data: newTrip, error: tripError } = await supabaseAdmin
        .from('trips')
        .insert({
          user_id: req.user!.id,
          title: title || `Chuyến đi ${destination_city}`,
          destination_city,
          destination_province: destination_city,
          start_date: correctedStartDate,
          end_date: correctedEndDate,
          budget_total: parseFloat(budget_total),
          traveler_count: parseInt(traveler_count || '1'),
          traveler_type: traveler_type || TravelerType.SOLO,
          preferences: enrichedPreferences,
          health_conditions: health_conditions || '',
          special_requirements: effectiveSpecialRequirements,
          status: TripStatus.DRAFT
        })
        .select()
        .single();

      if (tripError || !newTrip) {
        throw tripError || new Error('Failed to create trip record');
      }
      trip = newTrip;
      createdTripId = trip.id;
    }

    // Liên kết toàn bộ tin nhắn chat chung cũ (với trip_id IS NULL) sang chuyến đi mới này
    const { error: chatLinkErr } = await supabaseAdmin
      .from('trip_chat_messages')
      .update({ trip_id: trip.id })
      .eq('user_id', req.user!.id)
      .is('trip_id', null);

    if (chatLinkErr) {
      console.error('[CreateTrip] Failed to associate chat history with new trip:', chatLinkErr.message);
    } else {
      console.log(`[CreateTrip] Successfully associated general chat history with trip ${trip.id}`);
    }

    // 6. Tối ưu hóa: Sinh UUID client-side và lưu song song các ngày và hoạt động (Parallel DB Writes)
    const validPartnerIds = new Set(relevantPartners.map(p => p.id));

    const daysToInsert = itinerary.days.map((day, idx) => {
      let validDate = day.date;
      if (!validDate || !/^\d{4}-\d{2}-\d{2}$/.test(validDate)) {
        const d = new Date(correctedStartDate);
        d.setDate(d.getDate() + idx);
        validDate = d.toISOString().split('T')[0];
      }
      return {
        id: crypto.randomUUID(),
        trip_id: trip.id,
        day_number: Number(day.day_number) || idx + 1,
        date: validDate,
        weather_summary: { note: day.weather_note || 'Trời đẹp' }
      };
    });

    const itemsToInsert: any[] = [];
    itinerary.days.forEach(day => {
      const dbDay = daysToInsert.find(d => Number(d.day_number) === Number(day.day_number));
      if (!dbDay) return;

      day.items.forEach(item => {
        let itemLat = (item.lat !== undefined && item.lat !== null && item.lat !== 0 && !isNaN(Number(item.lat))) ? Number(item.lat) : null;
        let itemLng = (item.lng !== undefined && item.lng !== null && item.lng !== 0 && !isNaN(Number(item.lng))) ? Number(item.lng) : null;
        let itemAddress = item.address || '';
        let itemBookingUrl = '';

        if (item.google_place_id) {
          const matched = [
            ...mergedAccommodations,
            ...mergedDining,
            ...mergedAttractions,
            ...mergedRentals
          ].find(c => c.google_place_id === item.google_place_id);
          
          if (matched) {
            if (itemLat === null && matched.lat && matched.lat !== 0) itemLat = matched.lat;
            if (itemLng === null && matched.lng && matched.lng !== 0) itemLng = matched.lng;
            if (!itemAddress) itemAddress = matched.address;
            itemBookingUrl = matched.booking_url || '';
          }
        }

        let itemPartnerId: string | null = null;
        if (item.google_place_id && item.google_place_id.startsWith('partner_')) {
          const candidateId = item.google_place_id.replace('partner_', '');
          if (validPartnerIds.has(candidateId)) {
            itemPartnerId = candidateId;
          }
        }

        const rawType = String(item.item_type || '').toLowerCase();
        let normalizedItemType: 'accommodation' | 'transport' | 'dining' | 'attraction' | 'rental' | 'experience' = 'attraction';
        if (['accommodation', 'transport', 'dining', 'attraction', 'rental', 'experience'].includes(rawType)) {
          normalizedItemType = rawType as any;
        } else if (rawType === 'activity' || rawType === 'sightseeing' || rawType === 'entertainment') {
          normalizedItemType = 'attraction';
        } else if (rawType === 'food' || rawType === 'restaurant') {
          normalizedItemType = 'dining';
        } else if (rawType === 'hotel' || rawType === 'stay') {
          normalizedItemType = 'accommodation';
        } else {
          normalizedItemType = 'experience';
        }

        itemsToInsert.push({
          day_id: dbDay.id, // Sử dụng UUID đã sinh ở trên để liên kết
          partner_id: itemPartnerId, // Chỉ lưu khi partner_id thực sự tồn tại trong DB
          item_type: normalizedItemType,
          title: item.title,
          description: item.description || itemAddress || '',
          start_time: formatTimeForDb(item.start_time),
          end_time: formatTimeForDb(item.end_time),
          location_name: item.title,
          location_lat: itemLat,
          location_lng: itemLng,
          google_place_id: item.google_place_id || null,
          estimated_cost: parseOptionalCost(item.estimated_cost),
          booking_url: itemBookingUrl || null,
          order_index: item.order_index,
          status: 'planned'
        });
      });
    });

    // Ghi itinerary_days trước để tránh lỗi vi phạm RLS policy do race condition khi check foreign key ở itinerary_items
    const daysResult = await supabaseAdmin.from('itinerary_days').insert(daysToInsert);
    if (daysResult.error) throw daysResult.error;

    const itemsResult = itemsToInsert.length > 0 
      ? await supabaseAdmin.from('itinerary_items').insert(itemsToInsert) 
      : { error: null };
    if (itemsResult.error) throw itemsResult.error;

    // Lưu các cart_items vào bảng trip_cart_items sau khi tạo trip thành công
    if (safeCartItems.length > 0) {
      if (existingDraftTrip) {
        await supabaseAdmin.from('trip_cart_items').delete().eq('trip_id', trip.id);
      }
      const cartPayload = safeCartItems.map((cItem: any) => {
        const place = cItem.place || cItem;
        const rawPlaceId = place.id || place.google_place_id || cItem.partner_id || null;
        let partnerId: string | null = null;
        if (rawPlaceId) {
          const cleanId = String(rawPlaceId).replace('partner_', '');
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (uuidRegex.test(cleanId)) {
            partnerId = cleanId;
          }
        }

        return {
          trip_id: trip.id,
          partner_id: partnerId,
          custom_cost: Number(cItem.custom_cost) || Number(place.estimated_cost) || 0,
          pricing_option: cItem.pricing_option === 'manual' ? 'manual' : 'auto',
          notes: place.name || cItem.notes || place.address || '',
        };
      });

      const { error: cartInsertErr } = await supabaseAdmin
        .from('trip_cart_items')
        .insert(cartPayload);
      if (cartInsertErr) {
        console.error('[CreateTripAI] Failed to save trip_cart_items:', cartInsertErr.message);
      }
    }

    // Deduct trip quota safely (Pro or Free): CHỈ trừ khi KHÔNG phải bản nháp đang chọn giỏ/mời nhóm (!isDraftOnly)
    if (!isDraftOnly) {
      const deductResult = await deductTripQuota(userId, isAiPro, existingDraftTrip, trip.id, profile);
      if (!deductResult.success) {
        if (!existingDraftTrip) {
          await supabaseAdmin.from('trips').delete().eq('id', trip.id);
        }
        return res.status(403).json({ error: deductResult.error || 'Lỗi cập nhật hạn mức chuyến đi', requires_premium: true });
      }
      if (deductResult.deducted) {
        quotaDeducted = true;
      }
    }

    // Log partner booking events
    for (const item of itemsToInsert) {
      if (item.google_place_id && item.google_place_id.startsWith('partner_')) {
        const partnerId = item.google_place_id.replace('partner_', '');
        await logPartnerEvent(partnerId, 'booking', trip.id, req.user!.id, { item_type: item.item_type });
      }
    }

    // Log impressions for all partner candidates sent to AI
    for (const partner of relevantPartners) {
      await logPartnerEvent(partner.id, 'impression', trip.id, req.user!.id, {});
    }

    // Fetch the full assembled trip details to return
    const { data: fullTrip } = await supabaseAdmin
      .from('trips')
      .select('*')
      .eq('id', trip.id)
      .single();

    const dbDaysWithItems = daysToInsert
      .sort((a, b) => a.day_number - b.day_number)
      .map(day => ({
        ...day,
        items: itemsToInsert.filter(item => item.day_id === day.id)
      }));

    return res.status(201).json({
      ...fullTrip,
      is_ai_pro: Boolean(fullTrip?.preferences?.is_ai_pro || fullTrip?.preferences?.ai_tier === 'pro'),
      days: dbDaysWithItems
    });
  } catch (error: any) {
    console.error('Error generating trip:', error);

    // Rollback quota nếu đã trừ thành công trong phiên này nhưng gặp lỗi xử lý sau đó
    if (quotaDeducted) {
      await rollbackTripQuota(userId, isAiPro, createdTripId);
    }

    // Rollback trip record, itinerary_days mid-generation
    if (createdTripId) {
      try {
        await supabaseAdmin.from('itinerary_days').delete().eq('trip_id', createdTripId);
        if (!existingDraftTrip) {
          await supabaseAdmin.from('trips').delete().eq('id', createdTripId);
          console.log(`[Rollback] Cleaned up orphan trip and days for ${createdTripId}`);
        } else {
          console.log(`[Rollback] Cleaned up newly generated days for draft trip ${createdTripId}, kept draft trip and collaborators intact`);
        }
      } catch (rbErr: any) {
        console.error('[Rollback] Failed to delete orphan trip/days:', rbErr.message);
      }
    }

    const statusCode = error.status || (error.message?.includes('503') ? 503 : (error.message?.includes('429') ? 429 : 500));
    const userMessage = error.message || 'Không thể tạo lịch trình bằng AI lúc này. Vui lòng thử lại sau ít phút.';

    return res.status(statusCode).json({
      success: false,
      error: userMessage,
      code: error.code || (statusCode === 503 ? 'AI_OVERLOADED' : (statusCode === 429 ? 'AI_RATE_LIMIT' : 'AI_SERVICE_ERROR')),
      details: error.message
    });
  }
});

// PUT /api/trips/:id - Edit trip details (e.g. status)
router.put('/:id', requireAuth, async (req: any, res: Response) => {
  const tripId = req.params.id;

  try {
    const { data: currentTrip } = await supabaseAdmin
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .maybeSingle();

    if (!currentTrip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    if (currentTrip.user_id !== req.user!.id && !req.isAdmin) {
      return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa chuyến đi này' });
    }

    const {
      title,
      description,
      destination_city,
      start_date,
      end_date,
      budget_total,
      traveler_count,
      traveler_type,
      is_public,
      status,
      cover_image_url,
      notes
    } = req.body;

    const updatePayload: Record<string, any> = {};
    if (title !== undefined) updatePayload.title = String(title).trim();
    if (description !== undefined) updatePayload.description = description;
    if (destination_city !== undefined) updatePayload.destination_city = destination_city;
    if (start_date !== undefined) updatePayload.start_date = start_date;
    if (end_date !== undefined) updatePayload.end_date = end_date;
    if (budget_total !== undefined) updatePayload.budget_total = parseFloat(budget_total);
    if (traveler_count !== undefined) updatePayload.traveler_count = parseInt(traveler_count);
    if (traveler_type !== undefined) updatePayload.traveler_type = traveler_type;
    if (is_public !== undefined) updatePayload.is_public = !!is_public;
    if (cover_image_url !== undefined) updatePayload.cover_image_url = cover_image_url;
    if (notes !== undefined) updatePayload.notes = notes;

    if (status !== undefined) {
      const allowedStatuses = [TripStatus.DRAFT, TripStatus.ACTIVE, TripStatus.COMPLETED, TripStatus.ARCHIVED];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: `Trạng thái không hợp lệ: ${status}` });
      }

      // State machine validation: fetch current trip status
      if (currentTrip.status !== status) {
        const allowedNext = VALID_TRIP_TRANSITIONS[currentTrip.status] || [];
        if (!allowedNext.includes(status)) {
          return res.status(400).json({
            error: `Không thể chuyển trạng thái từ '${currentTrip.status}' sang '${status}'. Các trạng thái tiếp theo hợp lệ: ${allowedNext.join(', ')}`
          });
        }
      }

      updatePayload.status = status;
    }

    updatePayload.updated_at = new Date().toISOString();

    const { data: trip, error } = await supabaseAdmin
      .from('trips')
      .update(updatePayload)
      .eq('id', tripId)
      .select()
      .single();

    if (error) throw error;

    // Auto-log activity
    await logActivity(tripId, req.user!.id, 'save_schedule', trip?.title || currentTrip.title);

    return res.json(trip);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update trip metadata', details: error.message });
  }
});

// DELETE /api/trips/:id - Delete a trip
router.delete('/:id', requireAuth, async (req: any, res: Response) => {
  const tripId = req.params.id;

  try {
    const { data: currentTrip } = await supabaseAdmin
      .from('trips')
      .select('user_id')
      .eq('id', tripId)
      .maybeSingle();

    if (!currentTrip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    if (currentTrip.user_id !== req.user!.id && !req.isAdmin) {
      return res.status(403).json({ error: 'Bạn không có quyền xóa chuyến đi này' });
    }

    const { error } = await supabaseAdmin
      .from('trips')
      .delete()
      .eq('id', tripId);

    if (error) throw error;
    return res.json({ success: true, message: 'Trip deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to delete trip', details: error.message });
  }
});

// POST /api/trips/:id/upgrade-pro - Nâng cấp 1 chuyến đi hiện có từ Free lên Pro (dùng 1 lượt Pro)
router.post('/:id/upgrade-pro', requireAuth, async (req: any, res: Response) => {
  try {
    const tripId = req.params.id;
    const userId = req.user!.id;

    // Lấy trip theo :id
    const { data: trip, error: tripError } = await supabaseAdmin
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .maybeSingle();

    if (tripError || !trip) {
      return res.status(404).json({ error: 'Không tìm thấy chuyến đi' });
    }

    // Kiểm tra quyền: trip.user_id === req.user.id
    if (trip.user_id !== userId) {
      return res.status(403).json({ error: 'Bạn không phải chủ sở hữu chuyến đi này' });
    }

    // Nếu trip đã là Pro, báo lỗi 400
    if (trip.preferences?.is_ai_pro === true || trip.preferences?.ai_tier === 'pro') {
      return res.status(400).json({ error: 'Chuyến đi này đã được nâng cấp lên Pro trước đó.' });
    }

    // Lấy profile và kiểm tra lượt Pro khả dụng
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    const isAdmin = req.isAdmin === true || profile?.role === UserRole.ADMIN;

    const updatedPreferences = {
      ...(trip.preferences || {}),
      is_ai_pro: true,
      ai_tier: 'pro',
      pro_credit_consumed: true,
    };

    // Nếu là admin: bypass trừ lượt, cập nhật trip trực tiếp
    if (isAdmin) {
      const { error: updateTripErr } = await supabaseAdmin
        .from('trips')
        .update({
          preferences: updatedPreferences,
          updated_at: new Date().toISOString(),
        })
        .eq('id', trip.id);

      if (updateTripErr) {
        throw updateTripErr;
      }

      return res.json({
        success: true,
        message: 'Nâng cấp chuyến đi lên Pro thành công!',
        remainingTrips: 9999,
        trip: { ...trip, preferences: updatedPreferences },
      });
    }

    // Kiểm tra sơ bộ lượt Pro
    const proInfo = getProCredits(profile, new Date());
    if (proInfo.total <= 0) {
      return res.status(403).json({
        error: 'Bạn không còn lượt Pro khả dụng. Vui lòng mua thêm gói để nâng cấp chuyến đi này!',
        requires_premium: true,
      });
    }

    let remainingAfter = proInfo.total;

    // 1. Ưu tiên gọi RPC atomic: upgrade_trip_to_pro (thực hiện tất cả trong 1 transaction trên DB)
    const { data: rpcUpgradeRemaining, error: rpcUpgradeErr } = await supabaseAdmin.rpc('upgrade_trip_to_pro', {
      p_trip_id: tripId,
      p_user_id: userId,
    });

    if (!rpcUpgradeErr) {
      remainingAfter = Number(rpcUpgradeRemaining ?? 0);
      return res.json({
        success: true,
        message: 'Nâng cấp chuyến đi lên Pro thành công!',
        remainingTrips: remainingAfter,
        trip: { ...trip, preferences: updatedPreferences },
      });
    }

    // Xử lý các mã lỗi nghiệp vụ từ upgrade_trip_to_pro
    const upgradeErrMsg = rpcUpgradeErr.message || '';
    if (upgradeErrMsg.includes('NO_PRO_CREDIT')) {
      return res.status(403).json({
        error: 'Bạn không còn lượt Pro khả dụng. Vui lòng mua thêm gói để nâng cấp chuyến đi này!',
        requires_premium: true,
      });
    }
    if (upgradeErrMsg.includes('ALREADY_PRO')) {
      return res.status(400).json({ error: 'Chuyến đi này đã được nâng cấp lên Pro trước đó.' });
    }
    if (upgradeErrMsg.includes('NOT_OWNER')) {
      return res.status(403).json({ error: 'Bạn không phải chủ sở hữu chuyến đi này' });
    }
    if (upgradeErrMsg.includes('TRIP_NOT_FOUND')) {
      return res.status(404).json({ error: 'Không tìm thấy chuyến đi' });
    }

    // Nếu không phải lỗi thiếu hàm (PGRST202), ném 500
    const isUpgradeRpcMissing =
      rpcUpgradeErr.code === 'PGRST202' ||
      upgradeErrMsg.includes('Could not find the function') ||
      upgradeErrMsg.includes('function public.upgrade_trip_to_pro');

    if (!isUpgradeRpcMissing) {
      console.error('[UpgradePro] Unexpected error from upgrade_trip_to_pro:', rpcUpgradeErr);
      return res.status(500).json({ error: 'Lỗi nâng cấp chuyến đi: ' + upgradeErrMsg });
    }

    // 2. NHÁNH AN TOÀN KHI RPC upgrade_trip_to_pro CHƯA CÓ TRÊN DB:
    // (1) Trừ lượt bằng RPC consume_pro_credit (atomic trên profile)
    let wasMonthlyDeducted = false;
    const now = new Date();
    if (profile?.premium_until && new Date(profile.premium_until) > now && (profile?.monthly_credits ?? 0) > 0) {
      wasMonthlyDeducted = true;
    }

    const { data: rpcRemaining, error: rpcErr } = await supabaseAdmin.rpc('consume_pro_credit', {
      p_user_id: userId,
    });

    if (rpcErr) {
      // NẾU RPC ném NO_PRO_CREDIT: trả 403 NGAY LẬP TỨC, TUYỆT ĐỐI KHÔNG FALLBACK DÙNG PROFILE STALE!
      if (rpcErr.message?.includes('NO_PRO_CREDIT')) {
        return res.status(403).json({
          error: 'Bạn không còn lượt Pro khả dụng. Vui lòng mua thêm gói để nâng cấp chuyến đi này!',
          requires_premium: true,
        });
      }

      // Chỉ fallback thủ công khi RPC consume_pro_credit cũng thiếu hàm trong DB
      const isConsumeMissing = rpcErr.code === 'PGRST202' || rpcErr.message?.includes('Could not find the function');
      if (!isConsumeMissing) {
        console.error('[UpgradePro] Unexpected consume_pro_credit error:', rpcErr);
        return res.status(500).json({ error: 'Lỗi nâng cấp chuyến đi: ' + rpcErr.message });
      }

      // Fallback thủ công an toàn: đọc LẠI profile tươi từ DB, trừ bằng optimistic concurrency
      const { data: freshProf } = await supabaseAdmin
        .from('profiles')
        .select('pro_credits, monthly_credits, premium_until')
        .eq('id', userId)
        .maybeSingle();

      const freshNow = new Date();
      const hasActiveMonthly = Boolean(
        freshProf?.premium_until && new Date(freshProf.premium_until) > freshNow && (freshProf?.monthly_credits ?? 0) > 0
      );

      if (hasActiveMonthly) {
        wasMonthlyDeducted = true;
        const currentMonthly = freshProf?.monthly_credits ?? 0;
        const { data: upRes, error: upErr } = await supabaseAdmin
          .from('profiles')
          .update({ monthly_credits: currentMonthly - 1, updated_at: new Date().toISOString() })
          .eq('id', userId)
          .eq('monthly_credits', currentMonthly)
          .select();

        if (upErr || !upRes || upRes.length === 0) {
          return res.status(403).json({
            error: 'Bạn không còn lượt Pro khả dụng. Vui lòng mua thêm gói để nâng cấp chuyến đi này!',
            requires_premium: true,
          });
        }
        remainingAfter = (freshProf?.pro_credits ?? 0) + (currentMonthly - 1);
      } else if ((freshProf?.pro_credits ?? 0) > 0) {
        wasMonthlyDeducted = false;
        const currentPro = freshProf?.pro_credits ?? 0;
        const { data: upRes, error: upErr } = await supabaseAdmin
          .from('profiles')
          .update({ pro_credits: currentPro - 1, updated_at: new Date().toISOString() })
          .eq('id', userId)
          .eq('pro_credits', currentPro)
          .select();

        if (upErr || !upRes || upRes.length === 0) {
          return res.status(403).json({
            error: 'Bạn không còn lượt Pro khả dụng. Vui lòng mua thêm gói để nâng cấp chuyến đi này!',
            requires_premium: true,
          });
        }
        remainingAfter = currentPro - 1;
      } else {
        return res.status(403).json({
          error: 'Bạn không còn lượt Pro khả dụng. Vui lòng mua thêm gói để nâng cấp chuyến đi này!',
          requires_premium: true,
        });
      }
    } else {
      remainingAfter = Number(rpcRemaining ?? 0);
    }

    // (2) Cập nhật preferences của chuyến đi
    const { error: updateTripErr } = await supabaseAdmin
      .from('trips')
      .update({
        preferences: updatedPreferences,
        updated_at: new Date().toISOString(),
      })
      .eq('id', trip.id);

    if (updateTripErr) {
      console.error('[UpgradePro] Update trip failed after credit deduction, refunding credit...', updateTripErr);
      // HOÀN LẠI LƯỢT ĐÃ TRỪ VÀO ĐÚNG VÍ
      const { error: refundRpcErr } = await supabaseAdmin.rpc('refund_pro_credit', {
        p_user_id: userId,
        p_to_monthly: wasMonthlyDeducted,
      });

      if (refundRpcErr) {
        const { data: pRefund } = await supabaseAdmin
          .from('profiles')
          .select('pro_credits, monthly_credits')
          .eq('id', userId)
          .maybeSingle();

        if (wasMonthlyDeducted) {
          await supabaseAdmin
            .from('profiles')
            .update({ monthly_credits: (pRefund?.monthly_credits ?? 0) + 1, is_premium: true })
            .eq('id', userId);
        } else {
          await supabaseAdmin
            .from('profiles')
            .update({ pro_credits: (pRefund?.pro_credits ?? 0) + 1, is_premium: true })
            .eq('id', userId);
        }
      }
      throw updateTripErr;
    }

    return res.json({
      success: true,
      message: 'Nâng cấp chuyến đi lên Pro thành công!',
      remainingTrips: remainingAfter,
      trip: { ...trip, preferences: updatedPreferences },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Lỗi nâng cấp chuyến đi: ' + err.message });
  }
});

async function saveChatMessage(
  tripId: string | null,
  userId: string,
  role: 'user' | 'model',
  content: string,
  meta?: {
    adaptedItinerary?: any;
    diff?: string;
    previousSnapshot?: any;
    isCreateTrip?: boolean;
    createTripParams?: any;
  }
) {
  try {
    await supabaseAdmin.from('trip_chat_messages').insert({
      trip_id: tripId,
      user_id: userId,
      role,
      content,
      adapted_itinerary: meta?.adaptedItinerary || null,
      diff: meta?.diff || null,
      previous_snapshot: meta?.previousSnapshot || null,
      is_create_trip: meta?.isCreateTrip || null,
      create_trip_params: meta?.createTripParams || null
    });
  } catch (err: any) {
    console.warn('[saveChatMessage] Failed to save chat message to DB (table may not exist yet):', err.message);
  }
}


// GET /api/trips/:id/chat - Lấy lịch sử trò chuyện của chuyến đi
router.get('/:id/chat', requireAuth, async (req: any, res: Response) => {
  const tripId = req.params.id;
  try {
    const { data: messages, error } = await supabaseAdmin
      .from('trip_chat_messages')
      .select('*')
      .eq('trip_id', tripId)
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return res.json({
      success: true,
      messages: messages || []
    });
  } catch (err: any) {
    console.warn('[GetTripChatHistory] Error:', err.message);
    return res.json({ success: true, messages: [] });
  }
});

// POST /api/trips/chat - Trò chuyện chung không có ngữ cảnh chuyến đi
router.post('/chat', requireAuth, aiChatLimiter, async (req: any, res: Response) => {
  const { message, history, ai_provider } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  const { data: userProfile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', req.user!.id)
    .maybeSingle();

  const isPremium = isUserPremium(userProfile);
  const isAdmin = req.isAdmin === true || req.user?.role === UserRole.ADMIN || userProfile?.role === UserRole.ADMIN;
  let targetProvider = ai_provider;
  if (targetProvider === 'custom_openai' && !isPremium && !isAdmin) {
    return res.status(403).json({
      error: 'Mô hình AI Pro chỉ dành riêng cho tài khoản Gói Premium.',
      requires_premium: true
    });
  }

  try {
    // Save user message
    await saveChatMessage(null, req.user!.id, ChatMessageRole.USER, message);

    const chatResponse = await chatWithItinerary(message, history || [], undefined, undefined, undefined, targetProvider);

    // Save model response
    await saveChatMessage(null, req.user!.id, ChatMessageRole.MODEL, chatResponse.responseText, {
      isCreateTrip: chatResponse.isCreateTrip,
      createTripParams: chatResponse.createTripParams
    });

    return res.json({
      success: true,
      ...chatResponse
    });
  } catch (error: any) {
    console.error(`[General Chat Route] Error: ${error.message}`, error.stack);
    return res.status(500).json({ error: `Failed to process general chat with AI. Details: ${error.message}` });
  }
});

// POST /api/trips/:id/chat - Trò chuyện trong chuyến đi có ngữ cảnh
router.post('/:id/chat', requireAuth, aiChatLimiter, async (req: any, res: Response) => {
  const client = getSupabaseUserClient(req.token!);
  const tripId = req.params.id;
  const { message, history, ai_provider } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    // 1. Lấy thông tin chuyến đi trước để kiểm tra quyền Pro theo chuyến
    const { data: trip, error: tripError } = await client.from('trips').select('*').eq('id', tripId).single();
    if (tripError || !trip) return res.status(404).json({ error: 'Trip not found' });

    const { data: userProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', req.user!.id)
      .maybeSingle();

    const isTripPro = Boolean(trip.preferences?.is_ai_pro === true || trip.preferences?.ai_tier === 'pro');
    const isAdmin = req.isAdmin === true || req.user?.role === UserRole.ADMIN || userProfile?.role === UserRole.ADMIN;
    let targetProvider = ai_provider;
    if (targetProvider === 'custom_openai' && !isTripPro && !isAdmin) {
      return res.status(403).json({
        error: 'Mô hình AI Pro chỉ dành riêng cho chuyến đi Pro. Hãy nâng cấp chuyến đi này lên Pro (dùng 1 lượt) để sử dụng!',
        requires_premium: true
      });
    }

    // Save user message
    await saveChatMessage(tripId, req.user!.id, 'user', message);

    // 2. Lấy danh sách các ngày
    const { data: dbDays } = await client
      .from('itinerary_days')
      .select('*')
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true });
    
    let previousSnapshot: any = null;
    let weatherForecast: any[] = [];
    if (dbDays && dbDays.length > 0) {
      const dayIds = dbDays.map(d => d.id);
      // Lấy danh sách các hoạt động
      const { data: dbItems, error: itemsError } = await client
        .from('itinerary_items')
        .select('*')
        .in('day_id', dayIds)
        .order('order_index', { ascending: true });

      if (!itemsError && dbItems) {
        previousSnapshot = {
          days: dbDays.map(d => ({
            day_number: d.day_number,
            date: d.date,
            weather_note: d.weather_summary?.note || '',
            items: dbItems.filter(item => item.day_id === d.id)
          })),
          budget_summary: {
            estimated_total: dbItems.reduce((sum, item) => sum + (Number(item.estimated_cost) || 0), 0)
          }
        };
      }
      
      const { lat, lng } = getCityCoordinates(trip.destination_city);
      try {
        weatherForecast = await getWeatherForecast(lat, lng, trip.start_date, trip.end_date);
      } catch (err) {
        console.warn('[Trip Chat Route] Weather fetch failed, continuing without weather:', err);
      }
    }

    const chatResponse = await chatWithItinerary(message, history || [], trip, previousSnapshot, weatherForecast, targetProvider);

    // Save model response
    await saveChatMessage(tripId, req.user!.id, 'model', chatResponse.responseText, {
      adaptedItinerary: chatResponse.hasChanges ? chatResponse.adaptedItinerary : undefined,
      diff: chatResponse.hasChanges ? chatResponse.diff : undefined,
      previousSnapshot: chatResponse.hasChanges ? previousSnapshot : undefined,
      isCreateTrip: chatResponse.isCreateTrip,
      createTripParams: chatResponse.createTripParams
    });

    return res.json({
      success: true,
      ...chatResponse,
      previousSnapshot
    });
  } catch (error: any) {
    console.error(`[Trip Chat Route] Error: ${error.message}`, error.stack);
    return res.status(500).json({ error: `Failed to process chat with AI. Details: ${error.message}` });
  }
});

// 1. POST /api/trips/:id/disruptions/preview - Gợi ý lịch trình thích ứng (Chưa lưu DB)
router.post('/:id/disruptions/preview', requireAuth, aiChatLimiter, async (req: any, res: Response) => {
  const client = getSupabaseUserClient(req.token!);
  const tripId = req.params.id;
  const { disruption_type, description } = req.body;

  if (!disruption_type || !description) {
    return res.status(400).json({ error: 'disruption_type and description are required' });
  }

  try {
    // A. Lấy thông tin chuyến đi và lịch trình hiện tại
    const { data: trip, error: tripError } = await client.from('trips').select('*').eq('id', tripId).single();
    if (tripError || !trip) return res.status(404).json({ error: 'Trip not found' });

    if (trip.end_date) {
      const today = new Date().toISOString().split('T')[0];
      if (trip.end_date < today) {
        return res.status(400).json({
          error: `Chuyến đi này đã hết hạn (ngày kết thúc ${trip.end_date}). AI đã khóa quyền chỉnh sửa chuyến đi này. Bạn vui lòng tạo chuyến đi mới để tiếp tục dùng AI!`
        });
      }
    }

    const { data: dbDays, error: daysError } = await client
      .from('itinerary_days')
      .select('*')
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true });
    
    if (daysError || !dbDays || dbDays.length === 0) {
      return res.status(400).json({ error: 'No itinerary days found for this trip' });
    }

    const dayIds = dbDays.map(d => d.id);
    const { data: dbItems, error: itemsError } = await client
      .from('itinerary_items')
      .select('*')
      .in('day_id', dayIds)
      .order('order_index', { ascending: true });

    if (itemsError || !dbItems) {
      return res.status(400).json({ error: 'No itinerary items found' });
    }

    // B. Xây dựng snapshot hiện tại
    const previousSnapshot = {
      days: dbDays.map(d => ({
        day_number: d.day_number,
        date: d.date,
        weather_note: d.weather_summary?.note || '',
        items: dbItems.filter(item => item.day_id === d.id)
      })),
      budget_summary: {
        estimated_total: dbItems.reduce((sum, item) => sum + (Number(item.estimated_cost) || 0), 0)
      }
    };

    // C. Gọi AI để lấy các phương án thay thế đề xuất
    const { lat, lng } = getCityCoordinates(trip.destination_city);
    const weatherForecast = await getWeatherForecast(lat, lng, trip.start_date, trip.end_date);
    
    // Quét toàn bộ địa điểm du lịch ứng viên trong 1 truy vấn duy nhất từ cache DB cho phương án thay thế
    const combinedRequirements = [trip.special_requirements, description].filter(Boolean).join('\n');
    const batchPlaces = await fetchCandidatePlacesForCity(
      trip.destination_city,
      lat,
      lng,
      trip.preferences,
      combinedRequirements,
      trip.title || '',
      parseFloat(trip.budget_total) || 5000000,
      parseInt(trip.traveler_count || '1') || 1
    );
 
    // Lấy đối tác liên quan
    const relevantPartners = await getRelevantPartners(
      trip.destination_city,
      lat,
      lng,
      trip.preferences || {},
      parseFloat(trip.budget_total) || 0,
      trip.start_date,
      trip.end_date,
      parseInt(trip.traveler_count || '1')
    );
    const partnerCandidates = convertPartnersToPlaceCandidates(relevantPartners);
 
    const mergedAccommodations = deduplicatePlaces([...partnerCandidates.filter(p => p.category === 'accommodation'), ...batchPlaces.accommodation]);
    const mergedDining = deduplicatePlaces([...partnerCandidates.filter(p => p.category === 'dining'), ...batchPlaces.dining]);
    const mergedAttractions = deduplicatePlaces([...partnerCandidates.filter(p => p.category === 'attraction'), ...batchPlaces.attraction]);
    const mergedRentals = deduplicatePlaces([...partnerCandidates.filter(p => p.category === 'rental'), ...batchPlaces.rental]);
 
    const candidatePlaces = { 
      accommodation: mergedAccommodations.slice(0, AI_CANDIDATE_LIMITS.ACCOMMODATION), 
      dining: mergedDining.slice(0, AI_CANDIDATE_LIMITS.DINING), 
      attraction: mergedAttractions.slice(0, AI_CANDIDATE_LIMITS.ATTRACTION), 
      rental: mergedRentals.slice(0, AI_CANDIDATE_LIMITS.RENTAL) 
    };

    const { itinerary: adaptedItinerary, diff } = await adaptItinerary(
      trip,
      previousSnapshot as any,
      disruption_type,
      description,
      weatherForecast,
      candidatePlaces
    );

    return res.json({
      success: true,
      adaptedItinerary,
      diff,
      previousSnapshot
    });
  } catch (error: any) {
    console.error('Preview adaptation failed:', error);
    return res.status(500).json({ error: 'Failed to adapt itinerary preview', details: error.message });
  }
});

// 2. POST /api/trips/:id/disruptions/apply - Lưu các hoạt động thay thế đã chọn
router.post('/:id/disruptions/apply', requireAuth, async (req: any, res: Response) => {
  const client = getSupabaseUserClient(req.token!);
  const tripId = req.params.id;
  const { disruption_type, description, day_id, selected_items, previous_snapshot } = req.body;

  if (!disruption_type || !description || !selected_items || !previous_snapshot) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // A. Lấy thông tin ngày trong database
    const { data: dbDays, error: daysError } = await client
      .from('itinerary_days')
      .select('*')
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true });

    if (daysError || !dbDays || dbDays.length === 0) {
      return res.status(400).json({ error: 'No itinerary days found' });
    }

    // B. Xác định ngày bắt đầu bị ảnh hưởng
    let affectedDayNumber = 1;
    if (day_id) {
      const matchedDay = dbDays.find(d => d.id === day_id);
      if (matchedDay) affectedDayNumber = matchedDay.day_number;
    }

    // C. Lưu sự kiện sự cố (Resolved = true)
    const { data: disruptionEvent, error: disError } = await client
      .from('disruption_events')
      .insert({
        trip_id: tripId,
        day_id: day_id || null,
        disruption_type,
        description,
        resolved: true,
        resolution_summary: `Đã áp dụng các hoạt động thay thế được người dùng chọn.`
      })
      .select()
      .single();

    if (disError || !disruptionEvent) throw disError || new Error('Failed to save disruption event');

    // D. Ghi nhật ký revision
    const newSnapshot = {
      days: dbDays.map(d => ({
        day_number: d.day_number,
        date: d.date,
        weather_note: d.weather_summary?.note || '',
        items: selected_items.filter((item: any) => Number(item.day_number) === Number(d.day_number))
      }))
    };

    await supabaseAdmin
      .from('itinerary_revisions')
      .insert({
        trip_id: tripId,
        disruption_event_id: disruptionEvent.id,
        previous_snapshot,
        new_snapshot: newSnapshot
      });

    // E. Phân tích sự khác biệt (Diffing) để tránh chèn lặp các hoạt động không thay đổi
    const affectedDays = dbDays.filter(d => Number(d.day_number) >= affectedDayNumber);
    const affectedDayIds = affectedDays.map(d => d.id);

    let dbItems: any[] = [];
    if (affectedDayIds.length > 0) {
      const { data, error: itemsError } = await client
        .from('itinerary_items')
        .select('*')
        .in('day_id', affectedDayIds)
        .eq('status', 'planned');
      if (itemsError) throw itemsError;
      dbItems = data || [];
    }

    const normalizeString = (s: string) => {
      if (!s) return '';
      return s.trim().toLowerCase().replace(/\s+/g, ' ');
    };

    // F. Lấy tọa độ để fallback
    const { data: trip } = await client.from('trips').select('*').eq('id', tripId).single();
    const city = trip?.destination_city || 'Da Nang';
    const { lat, lng } = getCityCoordinates(city);

    // Fetch relevant partners to match booking_url
    const relevantPartners = await getRelevantPartners(
      city,
      lat,
      lng,
      trip?.preferences || {},
      parseFloat(trip?.budget_total) || 0,
      trip?.start_date,
      trip?.end_date,
      parseInt(trip?.traveler_count || '1')
    );

    const itemIdsToReplace: string[] = [];
    const dbItemsToUpdate: { dbItem: any; newItem: any }[] = [];
    const remainingItemsToInsert = [...selected_items];

    // 1. Phân loại các hoạt động không thay đổi (giữ nguyên)
    const unmatchedDbItems: any[] = [];
    dbItems.forEach((dbItem: any) => {
      const matchedDay = dbDays.find(d => d.id === dbItem.day_id);
      const dayNum = matchedDay ? matchedDay.day_number : null;

      const matchIndex = remainingItemsToInsert.findIndex((item: any) => 
        Number(item.day_number) === Number(dayNum) &&
        normalizeString(dbItem.title) === normalizeString(item.title)
      );

      if (matchIndex !== -1) {
        // Trùng khớp hoàn toàn -> Bỏ khỏi danh sách chèn mới
        remainingItemsToInsert.splice(matchIndex, 1);
      } else {
        // Không trùng khớp -> Hoạt động cũ bị sửa đổi hoặc xóa bỏ
        unmatchedDbItems.push(dbItem);
      }
    });

    // 2. Phân bổ hoạt động thay thế tại chỗ theo từng ngày
    affectedDayIds.forEach((dayId: string) => {
      const matchedDay = dbDays.find(d => d.id === dayId);
      const dayNum = matchedDay ? matchedDay.day_number : null;
      if (!dayNum) return;

      const dayDbItems = unmatchedDbItems.filter(item => item.day_id === dayId)
        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
      
      const dayNewItems = remainingItemsToInsert.filter(item => Number(item.day_number) === Number(dayNum))
        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

      const minLen = Math.min(dayDbItems.length, dayNewItems.length);

      // Sửa đè trực tiếp (Update in place) cho các slot tương ứng
      for (let i = 0; i < minLen; i++) {
        dbItemsToUpdate.push({
          dbItem: dayDbItems[i],
          newItem: dayNewItems[i]
        });
      }

      // Các hoạt động dư ra ở bản cũ -> Đánh dấu là replaced (đã bị xóa/thay thế)
      for (let i = minLen; i < dayDbItems.length; i++) {
        itemIdsToReplace.push(dayDbItems[i].id);
      }
    });

    // 3. Thực thi cập nhật tại chỗ (Update)
    if (dbItemsToUpdate.length > 0) {
      for (const pair of dbItemsToUpdate) {
        let itemBookingUrl = pair.newItem.booking_url || null;
        if (pair.newItem.google_place_id && pair.newItem.google_place_id.startsWith('partner_')) {
          const matched = relevantPartners.find(p => `partner_${p.id}` === pair.newItem.google_place_id);
          if (matched) {
            itemBookingUrl = matched.booking_url || null;
          }
        }

        const { error: updateErr } = await client
          .from('itinerary_items')
          .update({
            item_type: pair.newItem.item_type,
            title: pair.newItem.title,
            description: pair.newItem.description || '',
            start_time: formatTimeForDb(pair.newItem.start_time),
            end_time: formatTimeForDb(pair.newItem.end_time),
            location_name: pair.newItem.title,
            location_lat: pair.newItem.location_lat || lat,
            location_lng: pair.newItem.location_lng || lng,
            google_place_id: pair.newItem.google_place_id || null,
            estimated_cost: parseOptionalCost(pair.newItem.estimated_cost),
            booking_url: itemBookingUrl,
            order_index: pair.newItem.order_index
          })
          .eq('id', pair.dbItem.id);

        if (updateErr) throw updateErr;

        // Log đối tác nếu có
        if (pair.newItem.google_place_id && pair.newItem.google_place_id.startsWith('partner_')) {
          const partnerId = pair.newItem.google_place_id.replace('partner_', '');
          await logPartnerEvent(partnerId, 'booking', tripId, req.user!.id, { item_type: pair.newItem.item_type, disruption_applied: true });
        }
      }
    }

    // 4. Thực thi đánh dấu các hoạt động bị xóa hẳn
    if (itemIdsToReplace.length > 0) {
      const { error: updateError } = await client
        .from('itinerary_items')
        .update({ status: 'replaced' })
        .in('id', itemIdsToReplace);

      if (updateError) throw updateError;
    }

    // 5. Thực thi chèn các hoạt động mới hoàn toàn (nếu số lượng hoạt động mới nhiều hơn cũ)
    const finalItemsToInsert: any[] = [];
    remainingItemsToInsert.forEach((item: any) => {
      // Bỏ qua các hoạt động đã được update tại chỗ
      const isAlreadyUpdated = dbItemsToUpdate.some(pair => pair.newItem === item);
      if (isAlreadyUpdated) return;

      const dbDay = dbDays.find(d => Number(d.day_number) === Number(item.day_number));
      if (!dbDay) return;

      let itemBookingUrl = item.booking_url || null;
      if (item.google_place_id && item.google_place_id.startsWith('partner_')) {
        const matched = relevantPartners.find(p => `partner_${p.id}` === item.google_place_id);
        if (matched) {
          itemBookingUrl = matched.booking_url || null;
        }
      }

      finalItemsToInsert.push({
        day_id: dbDay.id,
        item_type: item.item_type,
        title: item.title,
        description: item.description || '',
        start_time: formatTimeForDb(item.start_time),
        end_time: formatTimeForDb(item.end_time),
        location_name: item.title,
        location_lat: item.location_lat || lat,
        location_lng: item.location_lng || lng,
        google_place_id: item.google_place_id || null,
        estimated_cost: parseOptionalCost(item.estimated_cost),
        booking_url: itemBookingUrl,
        order_index: item.order_index,
        status: 'planned'
      });
    });

    if (finalItemsToInsert.length > 0) {
      const { error: insertError } = await client
        .from('itinerary_items')
        .insert(finalItemsToInsert);

      if (insertError) throw insertError;

      // Log partner booking events for applied alternative items
      for (const item of finalItemsToInsert) {
        if (item.google_place_id && item.google_place_id.startsWith('partner_')) {
          const partnerId = item.google_place_id.replace('partner_', '');
          await logPartnerEvent(partnerId, 'booking', tripId, req.user!.id, { item_type: item.item_type, disruption_applied: true });
        }
      }
    }

    return res.json({
      success: true,
      message: 'Itinerary adapted and applied successfully'
    });
  } catch (error: any) {
    console.error('Apply adaptation failed:', error);
    return res.status(500).json({ error: 'Failed to apply adapted itinerary', details: error.message });
  }
});

// 2.5 POST /api/trips/days/:dayId/items - Thêm hoạt động mới vào một ngày
router.post('/days/:dayId/items', requireAuth, async (req: any, res: Response) => {
  const client = getSupabaseUserClient(req.token!);
  const dayId = req.params.dayId;
  const { title, description, start_time, end_time, estimated_cost, status, item_type } = req.body;

  try {
    const { data: existingItems } = await client
      .from('itinerary_items')
      .select('order_index')
      .eq('day_id', dayId)
      .order('order_index', { ascending: false })
      .limit(1);

    const nextOrderIndex = (existingItems?.[0]?.order_index ?? -1) + 1;

    const { data: newItem, error } = await client
      .from('itinerary_items')
      .insert({
        day_id: dayId,
        title: title || 'Hoạt động mới',
        description: description || '',
        start_time: formatTimeForDb(start_time),
        end_time: formatTimeForDb(end_time),
        estimated_cost: parseOptionalCost(estimated_cost),
        status: status || 'planned',
        item_type: item_type || 'attraction',
        order_index: nextOrderIndex,
        location_name: title || 'Địa điểm'
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json(newItem);
  } catch (error: any) {
    console.error('[Add Item Route] Error:', error.message);
    return res.status(500).json({ error: 'Failed to add itinerary item', details: error.message });
  }
});

// 2.6 PUT /api/trips/days/:dayId/reorder-items - Cập nhật thứ tự các hoạt động trong ngày (kéo thả Google Maps)
router.put('/days/:dayId/reorder-items', requireAuth, async (req: any, res: Response) => {
  const client = getSupabaseUserClient(req.token!);
  const dayId = req.params.dayId;
  const { item_ids, schedule } = req.body;

  if (!Array.isArray(item_ids)) {
    return res.status(400).json({ error: 'item_ids must be an array of item IDs' });
  }

  const DEFAULT_TIMES = [
    { start: '08:00:00', end: '09:30:00' },
    { start: '09:30:00', end: '11:00:00' },
    { start: '11:30:00', end: '13:00:00' },
    { start: '13:30:00', end: '15:30:00' },
    { start: '15:30:00', end: '17:30:00' },
    { start: '18:00:00', end: '19:30:00' },
    { start: '20:00:00', end: '21:30:00' },
    { start: '21:30:00', end: '23:00:00' },
  ];

  try {
    const updatePromises = item_ids.map((itemId: string, index: number) => {
      const explicit = Array.isArray(schedule) ? schedule.find((s: any) => s.id === itemId) : null;
      const updateData: any = { order_index: index + 1 };
      if (explicit?.start_time) {
        updateData.start_time = formatTimeForDb(explicit.start_time);
        updateData.end_time = formatTimeForDb(explicit.end_time) || null;
      } else if (index < DEFAULT_TIMES.length) {
        updateData.start_time = DEFAULT_TIMES[index].start;
        updateData.end_time = DEFAULT_TIMES[index].end;
      }
      return client
        .from('itinerary_items')
        .update(updateData)
        .eq('id', itemId)
        .eq('day_id', dayId);
    });

    const results = await Promise.all(updatePromises);
    const hasError = results.find(r => r.error);
    if (hasError?.error) throw hasError.error;

    const { data: updatedItems, error: fetchErr } = await client
      .from('itinerary_items')
      .select('*')
      .eq('day_id', dayId)
      .order('order_index', { ascending: true });

    if (fetchErr) throw fetchErr;

    return res.json({
      success: true,
      message: 'Items reordered successfully with updated schedule',
      items: updatedItems || []
    });
  } catch (error: any) {
    console.error('[Reorder Items Route] Error:', error.message);
    return res.status(500).json({ error: 'Failed to reorder itinerary items', details: error.message });
  }
});

// 2.7 PUT /api/trips/:id/sync-calendar - Lưu toàn bộ lịch trình Calendar kéo thả
router.put('/:id/sync-calendar', requireAuth, async (req: any, res: Response) => {
  const client = getSupabaseUserClient(req.token!);
  const tripId = req.params.id;
  const { events } = req.body;

  if (!Array.isArray(events)) {
    return res.status(400).json({ error: 'events must be an array' });
  }

  try {
    // 1. Lấy danh sách các ngày của trip
    const { data: days, error: daysErr } = await client
      .from('itinerary_days')
      .select('id, day_number')
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true });

    if (daysErr) throw daysErr;

    const dayMap = new Map<number, string>();
    const dayIds: string[] = [];
    days?.forEach((d: any) => {
      dayMap.set(Number(d.day_number), d.id);
      dayIds.push(d.id);
    });

    // 2. Lấy toàn bộ existingItems trong itinerary_items thuộc các ngày của trip
    let existingItems: any[] = [];
    if (dayIds.length > 0) {
      const { data: items, error: itemsErr } = await client
        .from('itinerary_items')
        .select('id, day_id, google_place_id')
        .in('day_id', dayIds);

      if (itemsErr) throw itemsErr;
      existingItems = items || [];
    }

    const existingItemMap = new Map<string, any>();
    existingItems.forEach((item: any) => {
      existingItemMap.set(item.id, item);
    });

    // 3. Phân loại an toàn:
    // a) removedItemIds: Những item trong existingItems mà không khớp cả id lẫn google_place_id
    const incomingEventIds = new Set(events.map((ev: any) => ev.id).filter(Boolean));
    const incomingPlaceIds = new Set(events.map((ev: any) => ev.placeId || ev.google_place_id).filter(Boolean));
    const removedItemIds = existingItems
      .filter((item: any) => !incomingEventIds.has(item.id) && (!item.google_place_id || !incomingPlaceIds.has(item.google_place_id)))
      .map((item: any) => item.id);

    if (removedItemIds.length > 0) {
      await client.from('itinerary_items').delete().in('id', removedItemIds);
    }

    // b) existingEvents & c) newEvents:
    const updateOrInsertPromises = events.map(async (ev: any, index: number) => {
      const dayId = dayMap.get(Number(ev.dayNumber));
      if (!dayId) return null;

      const startH = Number(ev.startHour) || 8;
      const startM = Number(ev.startMinute) || 0;
      const dur = Number(ev.durationMinutes) || 90;
      const endTotalM = startH * 60 + startM + dur;
      const endH = Math.floor(endTotalM / 60);
      const endM = endTotalM % 60;

      const startTimeStr = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}:00`;
      const endTimeStr = `${String(Math.min(23, endH)).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;

      const existingMatch = (ev.id && existingItemMap.get(ev.id)) ||
        (ev.placeId && existingItems.find((it: any) => it.google_place_id === ev.placeId));

      if (existingMatch) {
        return client
          .from('itinerary_items')
          .update({
            day_id: dayId,
            start_time: startTimeStr,
            end_time: endTimeStr,
            order_index: index + 1,
            estimated_cost: parseOptionalCost(ev.cost),
          })
          .eq('id', existingMatch.id);
      } else {
        return client
          .from('itinerary_items')
          .insert({
            day_id: dayId,
            item_type: ev.category || 'attraction',
            title: ev.title || 'Địa điểm',
            description: ev.notes || '',
            start_time: startTimeStr,
            end_time: endTimeStr,
            order_index: index + 1,
            estimated_cost: parseOptionalCost(ev.cost),
            location_name: ev.address || ev.title || 'Địa điểm',
            location_lat: ev.lat || null,
            location_lng: ev.lng || null,
            google_place_id: ev.placeId || null,
            status: 'planned'
          });
      }
    });

    await Promise.all(updateOrInsertPromises);

    await client
      .from('trips')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', tripId);

    return res.json({ success: true, message: 'Lịch trình Calendar đã được đồng bộ thành công' });
  } catch (error: any) {
    console.error('[Sync Calendar Route] Error:', error.message);
    return res.status(500).json({ error: 'Failed to sync calendar', details: error.message });
  }
});

// 3. PUT /api/trips/items/:itemId - Sửa hoạt động thủ công (Sửa tay)
router.put('/items/:itemId', requireAuth, async (req: any, res: Response) => {
  const client = getSupabaseUserClient(req.token!);
  const itemId = req.params.itemId;
  const { title, description, start_time, end_time, estimated_cost, status, item_type } = req.body;

  try {
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (start_time !== undefined) updateData.start_time = formatTimeForDb(start_time);
    if (end_time !== undefined) updateData.end_time = formatTimeForDb(end_time);
    if (estimated_cost !== undefined) updateData.estimated_cost = parseOptionalCost(estimated_cost);
    if (status !== undefined) updateData.status = status;
    if (item_type !== undefined) updateData.item_type = item_type;

    const { data: updatedItem, error } = await client
      .from('itinerary_items')
      .update(updateData)
      .eq('id', itemId)
      .select()
      .single();

    if (error) throw error;
    return res.json(updatedItem);
  } catch (error: any) {
    console.error('[Update Item Route] Error:', error.message);
    return res.status(500).json({ error: 'Failed to update itinerary item', details: error.message });
  }
});

// 4. DELETE /api/trips/items/:itemId - Xóa hoạt động thủ công
router.delete('/items/:itemId', requireAuth, async (req: any, res: Response) => {
  const client = getSupabaseUserClient(req.token!);
  const itemId = req.params.itemId;

  try {
    const { error } = await client
      .from('itinerary_items')
      .delete()
      .eq('id', itemId);

    if (error) throw error;
    return res.json({ success: true, message: 'Item deleted successfully' });
  } catch (error: any) {
    console.error('[Delete Item Route] Error:', error.message);
    return res.status(500).json({ error: 'Failed to delete itinerary item', details: error.message });
  }
});

// 5. POST /api/trips/items/:itemId/ai-replace - AI gợi ý thay thế một hoạt động cụ thể
router.post('/items/:itemId/ai-replace', requireAuth, async (req: any, res: Response) => {
  const client = getSupabaseUserClient(req.token!);
  const itemId = req.params.itemId;
  const { user_requirement } = req.body;

  try {
    // A. Lấy thông tin hoạt động gốc
    const { data: item, error: itemError } = await client
      .from('itinerary_items')
      .select('*')
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      return res.status(404).json({ error: 'Itinerary item not found' });
    }

    // B. Lấy thông tin ngày và chuyến đi
    const { data: day, error: dayError } = await client
      .from('itinerary_days')
      .select('*')
      .eq('id', item.day_id)
      .single();

    if (dayError || !day) {
      return res.status(404).json({ error: 'Itinerary day not found' });
    }

    const { data: trip, error: tripError } = await client
      .from('trips')
      .select('*')
      .eq('id', day.trip_id)
      .single();

    if (tripError || !trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // C. Tìm địa điểm gợi ý theo địa danh
    const { lat, lng } = getCityCoordinates(trip.destination_city);
    
    // Tùy thuộc vào loại hoạt động gốc hoặc yêu cầu đặc thù để tìm kiếm địa điểm phù hợp
    let searchQuery = 'địa điểm tham quan';
    let category: 'accommodation' | 'dining' | 'attraction' | 'rental' = 'attraction';

    if (item.item_type === 'accommodation') {
      searchQuery = 'khách sạn';
      category = 'accommodation';
    } else if (item.item_type === 'dining') {
      searchQuery = 'quán ăn ngon đặc sản';
      category = 'dining';
    } else if (item.item_type === 'rental') {
      searchQuery = 'thuê xe máy';
      category = 'rental';
    } else {
      searchQuery = 'địa điểm du lịch';
      category = 'attraction';
    }

    // Nếu người dùng có yêu cầu cụ thể, bổ sung vào từ khóa tìm kiếm
    let customDiningResults: PlaceCandidate[] = [];
    if (user_requirement) {
      customDiningResults = await searchPlaces(user_requirement, category, lat, lng);
      
      // If no result found for the specific requirement, create a dynamic fallback
      if (customDiningResults.length === 0) {
        const cleanName = user_requirement.trim().replace(/^\w/, (c) => c.toUpperCase());
        const candidateName = cleanName.toLowerCase().includes('quán') || cleanName.toLowerCase().includes('nhà hàng') || cleanName.toLowerCase().includes('khu') || cleanName.toLowerCase().includes('khách sạn')
          ? cleanName
          : (category === 'dining' ? `Quán ${cleanName}` : (category === 'attraction' ? `Khu du lịch ${cleanName}` : cleanName));
          
        customDiningResults.push({
          google_place_id: `dynamic-replace-${category}-${trip.destination_city.replace(/\s+/g, '-')}-${Date.now()}`,
          name: candidateName,
          category,
          lat: lat + (Math.random() - 0.5) * 0.02,
          lng: lng + (Math.random() - 0.5) * 0.02,
          rating: parseFloat((4.4 + Math.random() * 0.5).toFixed(1)),
          price_level: 1,
          address: `Địa điểm ${cleanName} tại ${trip.destination_city}`
        });
      }
    }

    if (user_requirement) {
      searchQuery = `${user_requirement} ${searchQuery}`;
    }

    const searchPlacesResults = await searchPlaces(searchQuery, category, lat, lng);

    // Fetch relevant partners and merge them
    const relevantPartners = await getRelevantPartners(
      trip.destination_city,
      lat,
      lng,
      trip.preferences || {},
      parseFloat(trip.budget_total) || 0,
      trip.start_date,
      trip.end_date,
      parseInt(trip.traveler_count || '1')
    );
    const partnerCandidates = convertPartnersToPlaceCandidates(relevantPartners);
    const categoryPartners = partnerCandidates.filter(p => p.category === category);

    const candidatePlaces = deduplicatePlaces([...categoryPartners, ...customDiningResults, ...searchPlacesResults]);

    // D. Gọi AI để tạo 3 phương án thay thế
    const alternatives = await generateAlternatives(trip, item, user_requirement, candidatePlaces);

    return res.json({
      success: true,
      alternatives
    });
  } catch (error: any) {
    console.error('[AI Replace Item Route] Error:', error.message);
    return res.status(500).json({ error: 'Failed to generate AI replacement alternatives', details: error.message });
  }
});

// POST /api/trips/:id/cart - Bulk save cart items to trip_cart_items table
router.post('/:id/cart', requireAuth, async (req: any, res: Response) => {
  const { id } = req.params;
  const { items } = req.body;

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'items must be an array' });
  }

  try {
    const payload = items.map((item: any) => ({
      trip_id: id,
      partner_id: item.partner_id || item.place_id || item.id,
      custom_cost: Number(item.custom_cost) || 0,
      pricing_option: item.pricing_option === 'manual' ? 'manual' : 'auto',
      notes: item.notes || item.name || '',
    }));

    const { data, error } = await supabaseAdmin
      .from('trip_cart_items')
      .upsert(payload);

    if (error) throw error;

    return res.json({ success: true, count: items.length });
  } catch (err: any) {
    console.error('[Trips Cart API] Error:', err.message);
    return res.status(500).json({ error: 'Failed to save cart items', details: err.message });
  }
});

// Helper interfaces and functions for expense tracking and shared cart
export interface ExpenseLogItem {
  id: string;
  user_id: string;
  place_id?: string | null;
  place_name: string;
  category: 'dining' | 'cafe' | 'hotel' | 'attraction' | 'other' | string;
  amount: number;
  note?: string;
  day_number: number;
  created_at: string;
  updated_at?: string;
}

export interface ActualExpenses {
  dining: number;
  cafe: number;
  hotel: number;
  attraction: number;
  other: number;
  total: number;
}

export function normalizeExpenseCategory(cat?: string): string {
  const c = String(cat || '').toLowerCase().trim();
  if (['dining', 'cafe', 'hotel', 'attraction', 'other'].includes(c)) return c;
  if (c === 'food' || c === 'restaurant') return 'dining';
  if (c === 'entertainment') return 'attraction';
  if (c === 'accommodation' || c === 'homestay' || c === 'resort') return 'hotel';
  return 'other';
}

export function calculateActualExpenses(logs: ExpenseLogItem[]): ActualExpenses {
  const result: ActualExpenses = {
    dining: 0,
    cafe: 0,
    hotel: 0,
    attraction: 0,
    other: 0,
    total: 0
  };

  for (const log of logs) {
    const amount = Number(log.amount) || 0;
    const cat = normalizeExpenseCategory(log.category);
    if (cat === 'dining') result.dining += amount;
    else if (cat === 'cafe') result.cafe += amount;
    else if (cat === 'hotel') result.hotel += amount;
    else if (cat === 'attraction') result.attraction += amount;
    else result.other += amount;
    result.total += amount;
  }

  return result;
}

export function sanitizeBudgetBreakdown(raw: any, logs: ExpenseLogItem[]) {
  const base = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const actual = calculateActualExpenses(logs);
  return {
    cafe: Number(base.cafe) || 0,
    entertainment: Number(base.entertainment) || 0,
    food: Number(base.food) || 0,
    hotel: Number(base.hotel) || 0,
    transport: Number(base.transport) || 0,
    ...base,
    expense_logs: logs,
    actual_expenses: actual
  };
}

export async function verifyTripAccess(tripId: string, userId: string, isAdmin = false) {
  const { data: trip, error: tripErr } = await supabaseAdmin
    .from('trips')
    .select('id, user_id, preferences, budget_breakdown')
    .eq('id', tripId)
    .maybeSingle();

  if (tripErr || !trip) {
    return { trip: null, isOwner: false, isCollaborator: false, hasAccess: false, error: 'Trip not found' };
  }

  const isOwner = trip.user_id === userId;
  if (isOwner || isAdmin) {
    return { trip, isOwner, isCollaborator: false, hasAccess: true, error: null };
  }

  const { data: collab } = await supabaseAdmin
    .from('trip_collaborators')
    .select('id, role')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle();

  const isCollaborator = !!collab;
  return {
    trip,
    isOwner: false,
    isCollaborator,
    hasAccess: isCollaborator,
    error: isCollaborator ? null : 'Access denied'
  };
}

// Helper broadcast realtime cho chi tiêu và đồng bộ chuyến đi
export async function broadcastExpenseChange(
  tripId: string,
  action: 'add' | 'edit' | 'delete' | 'clear',
  log?: ExpenseLogItem | null,
  logId?: string,
  budgetBreakdown?: any
) {
  try {
    const expenseChannel = supabaseAdmin.channel(`trip-expenses:${tripId}`);
    await expenseChannel.send({
      type: 'broadcast',
      event: 'expenses_updated',
      payload: {
        action,
        log: log || null,
        logId: logId || '',
      },
    });
  } catch (e: any) {
    console.warn(`[TripRealtime] Error broadcasting to trip-expenses:${tripId}:`, e.message);
  }

  try {
    const tripChannel = supabaseAdmin.channel(`trip:${tripId}`);
    await tripChannel.send({
      type: 'broadcast',
      event: 'trip_updated',
      payload: {
        tripId,
        action: `expense_${action}`,
        budget_breakdown: budgetBreakdown,
        log: log || null,
        logId: logId || '',
        timestamp: Date.now(),
      },
    });
  } catch (e: any) {
    console.warn(`[TripRealtime] Error broadcasting to trip:${tripId}:`, e.message);
  }
}

// GET /api/trips/:id/expenses — lấy danh sách expense log của trip từ budget_breakdown
router.get('/:id/expenses', requireAuth, async (req: any, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const isAdmin = req.isAdmin === true || user.role === 'admin';

  try {
    const access = await verifyTripAccess(id, user.id, isAdmin);
    if (!access.trip) return res.status(404).json({ error: 'Trip not found' });
    if (!access.hasAccess) return res.status(403).json({ error: 'Bạn không có quyền truy cập chuyến đi này' });

    const rawLogs = access.trip.budget_breakdown?.expense_logs;
    const expenseLogs: ExpenseLogItem[] = Array.isArray(rawLogs) ? rawLogs : [];

    return res.json(expenseLogs);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/trips/:id/expenses — thêm expense log vào budget_breakdown
router.post('/:id/expenses', requireAuth, async (req: any, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const isAdmin = req.isAdmin === true || user.role === 'admin';
  const { id: clientLogId, place_name, category, amount, note, day_number, place_id } = req.body;

  try {
    const access = await verifyTripAccess(id, user.id, isAdmin);
    if (!access.trip) return res.status(404).json({ error: 'Trip not found' });
    if (!access.isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Chỉ chủ phòng chuyến đi mới có quyền thêm/sửa/xóa chi tiêu' });
    }

    const newLog: ExpenseLogItem = {
      id: (clientLogId && typeof clientLogId === 'string' && clientLogId.startsWith('log-'))
        ? clientLogId
        : `log-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      user_id: user.id,
      place_id: place_id || null,
      place_name: place_name || 'Chi phí khác',
      category: normalizeExpenseCategory(category),
      amount: Math.max(0, Number(amount) || 0),
      note: note || '',
      day_number: Math.max(1, Number(day_number) || 1),
      created_at: new Date().toISOString()
    };

    const currentLogs: ExpenseLogItem[] = Array.isArray(access.trip.budget_breakdown?.expense_logs)
      ? access.trip.budget_breakdown.expense_logs
      : [];

    const updatedLogs = [newLog, ...currentLogs];
    const newBreakdown = sanitizeBudgetBreakdown(access.trip.budget_breakdown, updatedLogs);

    const { error: updateErr } = await supabaseAdmin
      .from('trips')
      .update({
        budget_breakdown: newBreakdown,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateErr) throw updateErr;

    await logActivity(id, user.id, 'add_item', newLog.place_name, newLog.id, {
      amount: newLog.amount,
      category: newLog.category,
      type: 'expense'
    });

    await broadcastExpenseChange(id, 'add', newLog, newLog.id, newBreakdown);

    return res.status(201).json(newLog);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// PUT /api/trips/:id/expenses/:logId — cập nhật expense log trong budget_breakdown
router.put('/:id/expenses/:logId', requireAuth, async (req: any, res: Response) => {
  const { id, logId } = req.params;
  const user = req.user!;
  const isAdmin = req.isAdmin === true || user.role === 'admin';
  const { place_name, category, amount, note, day_number, place_id } = req.body;

  try {
    const access = await verifyTripAccess(id, user.id, isAdmin);
    if (!access.trip) return res.status(404).json({ error: 'Trip not found' });
    if (!access.isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Chỉ chủ phòng chuyến đi mới có quyền thêm/sửa/xóa chi tiêu' });
    }

    const currentLogs: ExpenseLogItem[] = Array.isArray(access.trip.budget_breakdown?.expense_logs)
      ? access.trip.budget_breakdown.expense_logs
      : [];

    const targetLog = currentLogs.find((l) => l.id === logId);
    if (!targetLog) return res.status(404).json({ error: 'Expense log not found' });

    let updatedLog: ExpenseLogItem = { ...targetLog };
    const updatedLogs = currentLogs.map((l) => {
      if (l.id !== logId) return l;
      updatedLog = {
        ...l,
        place_name: place_name !== undefined ? String(place_name) : l.place_name,
        category: category !== undefined ? normalizeExpenseCategory(category) : l.category,
        amount: amount !== undefined ? Math.max(0, Number(amount) || 0) : l.amount,
        note: note !== undefined ? String(note) : (l.note || ''),
        day_number: day_number !== undefined ? Math.max(1, Number(day_number) || 1) : l.day_number,
        place_id: place_id !== undefined ? (place_id || null) : (l.place_id || null),
        updated_at: new Date().toISOString()
      };
      return updatedLog;
    });

    const newBreakdown = sanitizeBudgetBreakdown(access.trip.budget_breakdown, updatedLogs);

    const { error: updateErr } = await supabaseAdmin
      .from('trips')
      .update({
        budget_breakdown: newBreakdown,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateErr) throw updateErr;

    await logActivity(id, user.id, 'edit_item', updatedLog.place_name, updatedLog.id, {
      amount: updatedLog.amount,
      category: updatedLog.category,
      type: 'expense'
    });

    await broadcastExpenseChange(id, 'edit', updatedLog, logId, newBreakdown);

    return res.json(updatedLog);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// DELETE /api/trips/:id/expenses — xóa toàn bộ nhật ký chi tiêu trong budget_breakdown
router.delete('/:id/expenses', requireAuth, async (req: any, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const isAdmin = req.isAdmin === true || user.role === 'admin';

  try {
    const access = await verifyTripAccess(id, user.id, isAdmin);
    if (!access.trip) return res.status(404).json({ error: 'Trip not found' });
    if (!access.isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Chỉ chủ phòng chuyến đi mới có quyền thêm/sửa/xóa chi tiêu' });
    }

    const newBreakdown = sanitizeBudgetBreakdown(access.trip.budget_breakdown, []);

    const { error: updateErr } = await supabaseAdmin
      .from('trips')
      .update({
        budget_breakdown: newBreakdown,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateErr) throw updateErr;

    await broadcastExpenseChange(id, 'clear');

    return res.json({ success: true, message: 'Đã xóa toàn bộ nhật ký chi tiêu' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// DELETE /api/trips/:id/expenses/:logId — xóa expense log khỏi budget_breakdown
router.delete('/:id/expenses/:logId', requireAuth, async (req: any, res: Response) => {
  const { id, logId } = req.params;
  const user = req.user!;
  const isAdmin = req.isAdmin === true || user.role === 'admin';

  try {
    const access = await verifyTripAccess(id, user.id, isAdmin);
    if (!access.trip) return res.status(404).json({ error: 'Trip not found' });
    if (!access.isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Chỉ chủ phòng chuyến đi mới có quyền thêm/sửa/xóa chi tiêu' });
    }

    const currentLogs: ExpenseLogItem[] = Array.isArray(access.trip.budget_breakdown?.expense_logs)
      ? access.trip.budget_breakdown.expense_logs
      : [];

    const targetLog = currentLogs.find((l) => l.id === logId);
    if (!targetLog) return res.status(404).json({ error: 'Expense log not found' });

    const updatedLogs = currentLogs.filter((l) => l.id !== logId);
    const newBreakdown = sanitizeBudgetBreakdown(access.trip.budget_breakdown, updatedLogs);

    const { error: updateErr } = await supabaseAdmin
      .from('trips')
      .update({
        budget_breakdown: newBreakdown,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateErr) throw updateErr;

    await logActivity(id, user.id, 'delete_item', targetLog.place_name, targetLog.id, {
      amount: targetLog.amount,
      category: targetLog.category,
      type: 'expense'
    });

    await broadcastExpenseChange(id, 'delete', targetLog, logId, newBreakdown);

    return res.json({ success: true, message: 'Expense log deleted' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

function getCartItemKeys(item: any): string[] {
  const keys: string[] = [];
  if (item?.place?.id) keys.push(String(item.place.id));
  if (item?.id) keys.push(String(item.id));
  if (item?.google_place_id) keys.push(String(item.google_place_id));
  if (item?.place_id) keys.push(String(item.place_id));
  const name = item?.place?.name || item?.name || item?.title;
  if (name && typeof name === 'string') {
    const norm = name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
    if (norm) keys.push(`name_${norm}`);
  }
  return keys;
}

// GET /api/trips/:id/shared-cart — lấy danh sách địa điểm trong giỏ hàng chung
router.get('/:id/shared-cart', requireAuth, async (req: any, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const isAdmin = req.isAdmin === true || user.role === 'admin';
  const inviteToken = req.query.invite_token || req.headers['x-invite-token'] || req.headers['invite-token'];

  try {
    const access = await verifyTripAccess(id, user.id, isAdmin);
    if (!access.trip && !inviteToken) return res.status(404).json({ error: 'Trip not found' });

    // Hỗ trợ kiểm tra invite_token nếu chưa là member chính thức
    if (!access.hasAccess && inviteToken) {
      const tripData = access.trip || (await supabaseAdmin
        .from('trips')
        .select('id, user_id, preferences, budget_breakdown')
        .eq('id', id)
        .maybeSingle()).data;

      if (tripData) {
        const pending = Array.isArray(tripData.preferences?.pending_invites) ? tripData.preferences.pending_invites : [];
        const matchedInvite = pending.find((p: any) => p.invite_token === inviteToken);
        const isSharedToken = tripData.preferences?.invite_token === inviteToken;
        if (matchedInvite || isSharedToken) {
          access.trip = tripData;
          access.hasAccess = true;
        }
      }
    }

    if (!access.trip) return res.status(404).json({ error: 'Trip not found' });
    if (!access.hasAccess) return res.status(403).json({ error: 'Bạn không có quyền xem giỏ hàng chung của chuyến đi này' });

    const trip = access.trip;
    const prefDraftCart = (trip.preferences && typeof trip.preferences === 'object' && !Array.isArray(trip.preferences))
      ? trip.preferences.draft_cart
      : null;
    const prefSharedCart = (trip.preferences && typeof trip.preferences === 'object' && !Array.isArray(trip.preferences))
      ? trip.preferences.shared_cart
      : null;
    const breakdownCart = (trip.budget_breakdown && typeof trip.budget_breakdown === 'object' && !Array.isArray(trip.budget_breakdown))
      ? (trip.budget_breakdown.draft_cart || trip.budget_breakdown.shared_cart)
      : null;

    const sharedCart = Array.isArray(prefDraftCart)
      ? prefDraftCart
      : (Array.isArray(prefSharedCart)
        ? prefSharedCart
        : (Array.isArray(breakdownCart) ? breakdownCart : []));

    const workspaceStage = (trip.preferences && typeof trip.preferences === 'object' && !Array.isArray(trip.preferences))
      ? (trip.preferences.workspace_stage || 'collecting')
      : 'collecting';

    const pregenPlaces = (trip.preferences && typeof trip.preferences === 'object' && !Array.isArray(trip.preferences))
      ? (trip.preferences.pregen_places || [])
      : [];

    const tombstones = (trip.preferences && typeof trip.preferences === 'object')
      ? (trip.preferences.cart_tombstones || {})
      : {};

    return res.json({
      success: true,
      draft_cart: sharedCart,
      shared_cart: sharedCart,
      items: sharedCart,
      count: sharedCart.length,
      workspace_stage: workspaceStage,
      pregen_places: pregenPlaces,
      tombstones
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// PUT /api/trips/:id/shared-cart — cập nhật danh sách địa điểm trong giỏ hàng chung (Owner & Collaborators)
router.put('/:id/shared-cart', requireAuth, async (req: any, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const isAdmin = req.isAdmin === true || user.role === 'admin';
  const inviteToken = req.body?.invite_token || req.query.invite_token || req.headers['x-invite-token'] || req.headers['invite-token'];

  try {
    const access = await verifyTripAccess(id, user.id, isAdmin);

    // Hỗ trợ kiểm tra invite_token nếu là collaborator có link mời
    if (!access.hasAccess && inviteToken) {
      const tripData = access.trip || (await supabaseAdmin
        .from('trips')
        .select('id, user_id, preferences, budget_breakdown')
        .eq('id', id)
        .maybeSingle()).data;

      if (tripData) {
        const pending = Array.isArray(tripData.preferences?.pending_invites) ? tripData.preferences.pending_invites : [];
        const matchedInvite = pending.find((p: any) => p.invite_token === inviteToken);
        const isSharedToken = tripData.preferences?.invite_token === inviteToken;
        if (matchedInvite || isSharedToken) {
          access.trip = tripData;
          access.hasAccess = true;
        }
      }
    }

    if (!access.trip) return res.status(404).json({ error: 'Trip not found' });
    if (!access.hasAccess) return res.status(403).json({ error: 'Bạn không có quyền cập nhật giỏ hàng chung của chuyến đi này' });

    const trip = access.trip;
    const currentPrefs = (trip.preferences && typeof trip.preferences === 'object' && !Array.isArray(trip.preferences))
      ? trip.preferences
      : {};

    const rawItems = Array.isArray(req.body)
      ? req.body
      : (Array.isArray(req.body?.draft_cart)
        ? req.body.draft_cart
        : (Array.isArray(req.body?.shared_cart)
          ? req.body.shared_cart
          : (Array.isArray(req.body?.items)
            ? req.body.items
            : (req.body?.pregen_places !== undefined ? (currentPrefs.draft_cart || currentPrefs.shared_cart || []) : null))));

    if (!rawItems) {
      return res.status(400).json({ error: 'Dữ liệu giỏ hàng không hợp lệ. Vui lòng cung cấp draft_cart hoặc shared_cart.' });
    }

    const items = rawItems.map((item: any, idx: number) => {
      const placeName = item.place?.name || item.name || item.title || '';
      const category = item.place?.category || item.category || 'attraction';
      const deterministicFallbackId = placeName ? generateDeterministicPlaceId('', category, placeName, idx) : `cart_item_${idx}`;
      return {
        ...item,
        id: item.id || item.google_place_id || item.place_id || deterministicFallbackId,
        added_by: item.added_by || user.id,
        added_at: item.added_at || new Date().toISOString(),
        updated_at: item.updated_at || Date.now()
      };
    });

    // LWW-Element-Set with explicit Deletion Tracking & Tombstones:
    const now = Date.now();
    const existingTombstones: Record<string, number> = (currentPrefs.cart_tombstones && typeof currentPrefs.cart_tombstones === 'object')
      ? currentPrefs.cart_tombstones
      : {};

    const incomingDeletedKeys: string[] = Array.isArray(req.body?.deleted_place_ids)
      ? req.body.deleted_place_ids.map(String).filter(Boolean)
      : (req.body?.deleted_place_id ? [String(req.body.deleted_place_id)].filter(Boolean) : []);

    const updatedTombstones: Record<string, number> = { ...existingTombstones };
    for (const delKey of incomingDeletedKeys) {
      if (delKey) updatedTombstones[delKey] = now;
    }

    if (req.body?.tombstones && typeof req.body.tombstones === 'object') {
      for (const [k, v] of Object.entries(req.body.tombstones)) {
        const t = Number(v) || now;
        if (t > (updatedTombstones[k] || 0)) {
          updatedTombstones[k] = t;
        }
      }
    }

    const isExplicitAdd = req.body?.action === 'add';
    if (isExplicitAdd) {
      for (const inc of items) {
        const keys = getCartItemKeys(inc);
        keys.forEach(k => {
          delete updatedTombstones[k];
        });
      }
    }

    const currentCart = Array.isArray(currentPrefs.draft_cart)
      ? currentPrefs.draft_cart
      : (Array.isArray(currentPrefs.shared_cart) ? currentPrefs.shared_cart : []);

    const mergedMap = new Map<string, any>();
    // 1. Giữ các item hiện tại trong DB nếu chưa bị tombstone đánh dấu xóa
    for (const it of currentCart) {
      const keys = getCartItemKeys(it);
      const primaryKey = keys[0] || '';
      if (!primaryKey) continue;

      const itemTime = Number(it.updated_at || 0);
      const isTombstoned = keys.some(k => {
        const t = updatedTombstones[k] || 0;
        return t >= itemTime && t > 0;
      });
      if (isTombstoned) {
        continue;
      }
      mergedMap.set(primaryKey, it);
    }

    // 2. Xử lý các item mới gửi lên
    for (const incoming of items) {
      const keys = getCartItemKeys(incoming);
      const primaryKey = keys[0] || '';
      if (!primaryKey) continue;

      const incomingTime = Number(incoming.updated_at || now);
      const maxTombstoneTime = Math.max(0, ...keys.map(k => updatedTombstones[k] || 0));

      if (!isExplicitAdd && maxTombstoneTime >= incomingTime && maxTombstoneTime > 0) {
        // Item này nằm trong danh sách đã bị xóa và không có timestamp mới hơn -> loại bỏ khỏi giỏ
        mergedMap.delete(primaryKey);
        continue;
      }

      // Người dùng cố ý thêm lại hoặc gửi item hợp lệ: xóa tombstone cũ
      keys.forEach(k => {
        delete updatedTombstones[k];
      });

      const existing = mergedMap.get(primaryKey);
      if (!existing) {
        mergedMap.set(primaryKey, incoming);
      } else {
        const existingTime = Number(existing.updated_at || 0);
        if (incomingTime >= existingTime) {
          mergedMap.set(primaryKey, { ...existing, ...incoming });
        } else {
          mergedMap.set(primaryKey, existing);
        }
      }
    }

    // 3. Xóa dứt điểm các key trong deleted_place_ids khỏi mergedMap (nếu có yêu cầu xóa rõ ràng)
    for (const delKey of incomingDeletedKeys) {
      mergedMap.delete(delKey);
      for (const [mKey, item] of mergedMap.entries()) {
        const itemKeys = getCartItemKeys(item);
        if (itemKeys.includes(delKey)) {
          mergedMap.delete(mKey);
        }
      }
    }

    // 4. Nếu action là 'clear': làm trống hoàn toàn
    if (req.body?.action === 'clear') {
      mergedMap.clear();
    }

    const mergedCart = Array.from(mergedMap.values());

    const reqStage = req.body?.workspace_stage;
    const workspaceStage = (reqStage === 'collecting' || reqStage === 'scheduling')
      ? reqStage
      : (reqStage || currentPrefs.workspace_stage || 'collecting');

    const updatedPreferences = {
      ...currentPrefs,
      draft_cart: mergedCart,
      shared_cart: mergedCart,
      cart_tombstones: updatedTombstones,
      workspace_stage: workspaceStage,
      ...(req.body?.pregen_places !== undefined ? { pregen_places: req.body.pregen_places } : {})
    };

    const currentBreakdown = (trip.budget_breakdown && typeof trip.budget_breakdown === 'object' && !Array.isArray(trip.budget_breakdown))
      ? trip.budget_breakdown
      : {};

    const updatedBreakdown = {
      ...currentBreakdown,
      draft_cart: mergedCart,
      shared_cart: mergedCart
    };

    const { error: updateErr } = await supabaseAdmin
      .from('trips')
      .update({
        preferences: updatedPreferences,
        budget_breakdown: updatedBreakdown,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateErr) throw updateErr;

    await logActivity(id, user.id, 'edit_item', 'Giỏ hàng nhóm', null, {
      items_count: mergedCart.length
    });

    return res.json({
      success: true,
      message: 'Cập nhật giỏ hàng nhóm thành công',
      draft_cart: mergedCart,
      shared_cart: mergedCart,
      items: mergedCart,
      count: mergedCart.length,
      workspace_stage: workspaceStage,
      tombstones: updatedTombstones,
      pregen_places: updatedPreferences.pregen_places || []
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;

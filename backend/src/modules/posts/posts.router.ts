import { Router, Response } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../../middleware/requireAuth';
import { supabaseAdmin } from '../../config/supabase';

const router = Router();

export interface PostDetails {
  place_name: string;
  province: string;
  category: string; // 'stay' | 'food_normal' | 'food_local' | 'cafe' | 'entertainment' | 'other'
  content: string;
  media_urls?: string[];
  aspects?: {
    quality?: string;
    service?: string;
    atmosphere?: string;
    waiting_time?: string;
    booking_method?: string;
    parking?: string;
  };
  cost_per_person?: number;
  opening_hours?: string;
  place_status?: 'operating' | 'closed';
  trip_id?: string | null;
}

export function formatPostRow(row: any, profile?: any) {
  let details: PostDetails = {
    place_name: 'Địa điểm',
    province: '',
    category: 'other',
    content: '',
  };

  try {
    if (typeof row.comment === 'string' && row.comment.trim().startsWith('{')) {
      details = JSON.parse(row.comment);
    } else if (typeof row.comment === 'string') {
      details.content = row.comment;
    } else if (row.comment && typeof row.comment === 'object') {
      details = row.comment;
    }
  } catch {
    details.content = row.comment || '';
  }

  return {
    id: row.id,
    user_id: row.user_id,
    author: {
      id: profile?.id || row.user_id,
      full_name: profile?.full_name || 'Người dùng ViVu',
      avatar_url: profile?.avatar_url || null,
      is_premium: !!profile?.is_premium,
    },
    trip_id: row.trip_id || details.trip_id || null,
    place_name: details.place_name || 'Địa điểm không tên',
    province: details.province || '',
    category: details.category || 'other',
    rating: row.rating || 5,
    content: details.content || '',
    media_urls: Array.isArray(details.media_urls) ? details.media_urls : [],
    aspects: {
      quality: details.aspects?.quality || (details as any).aspect_quality || '',
      service: details.aspects?.service || (details as any).aspect_service || '',
      atmosphere: details.aspects?.atmosphere || (details as any).aspect_atmosphere || '',
      waiting_time: details.aspects?.waiting_time || (details as any).aspect_waiting_time || '',
      booking_method: details.aspects?.booking_method || (details as any).aspect_booking_method || '',
      parking: details.aspects?.parking || (details as any).aspect_parking || '',
    },
    cost_per_person: Number(details.cost_per_person) || 0,
    opening_hours: details.opening_hours || '',
    place_status: details.place_status || 'operating',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ── GET /api/posts ────────────────────────────────────────────────────────────
// Lấy danh sách bài đăng có hỗ trợ bộ lọc: province, category, search, rating
router.get('/', async (req: any, res: Response) => {
  try {
    const { province, category, search, rating, page = 1, limit = 30 } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 30));

    // Lấy toàn bộ bài đánh giá mới nhất
    const { data: rows, error } = await supabaseAdmin
      .from('place_reviews')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GetPosts] Supabase error:', error);
      return res.status(500).json({ error: 'Lỗi tải danh sách bài viết', details: error.message });
    }

    if (!rows || rows.length === 0) {
      return res.json({ success: true, posts: [], total: 0, page: pageNum, limit: limitNum });
    }

    // Lấy profile tác giả tương ứng
    const userIds = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)));
    const profileMap: Record<string, any> = {};

    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, avatar_url, is_premium')
        .in('id', userIds);

      (profiles || []).forEach((p: any) => {
        profileMap[p.id] = p;
      });
    }

    // Format và lọc theo tiêu chí
    let formatted = rows.map((r: any) => formatPostRow(r, profileMap[r.user_id]));

    // 1. Lọc theo Tỉnh thành (tag bắt buộc 1)
    if (province && typeof province === 'string' && province.trim() && province !== 'all') {
      const pClean = province.trim().toLowerCase();
      formatted = formatted.filter((p: any) => p.province.toLowerCase().includes(pClean) || pClean.includes(p.province.toLowerCase()));
    }

    // 2. Lọc theo Phân loại (tag bắt buộc 2)
    if (category && typeof category === 'string' && category.trim() && category !== 'all') {
      const catClean = category.trim().toLowerCase();
      if (catClean === 'food') {
        formatted = formatted.filter((p: any) => p.category === 'food_normal' || p.category === 'food_local');
      } else {
        formatted = formatted.filter((p: any) => p.category.toLowerCase() === catClean);
      }
    }

    // 3. Lọc theo Rating
    if (rating) {
      const rNum = parseInt(rating as string, 10);
      if (!isNaN(rNum)) {
        formatted = formatted.filter((p: any) => p.rating >= rNum);
      }
    }

    // 4. Tìm kiếm từ khóa (Tên địa điểm, mô tả, tỉnh thành)
    if (search && typeof search === 'string' && search.trim()) {
      const sClean = search.trim().toLowerCase();
      formatted = formatted.filter((p: any) =>
        p.place_name.toLowerCase().includes(sClean) ||
        p.content.toLowerCase().includes(sClean) ||
        p.province.toLowerCase().includes(sClean)
      );
    }

    const total = formatted.length;
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedPosts = formatted.slice(startIndex, startIndex + limitNum);

    return res.json({
      success: true,
      posts: paginatedPosts,
      total,
      page: pageNum,
      limit: limitNum,
      has_more: startIndex + limitNum < total,
    });
  } catch (err: any) {
    console.error('[GetPosts] Fatal error:', err);
    return res.status(500).json({ error: 'Lỗi server khi lấy bài viết', details: err.message });
  }
});

// ── GET /api/posts/my-posts ───────────────────────────────────────────────────
// Lấy danh sách bài viết do chính user hiện tại đăng
router.get('/my-posts', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const { data: rows, error } = await supabaseAdmin
      .from('place_reviews')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Lỗi lấy bài viết của bạn', details: error.message });
    }

    const { data: myProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url, is_premium')
      .eq('id', userId)
      .maybeSingle();

    const formatted = (rows || []).map((r: any) => formatPostRow(r, myProfile));
    return res.json({ success: true, posts: formatted, count: formatted.length });
  } catch (err: any) {
    return res.status(500).json({ error: 'Lỗi server', details: err.message });
  }
});

// ── GET /api/posts/:id ────────────────────────────────────────────────────────
// Lấy chi tiết bài viết
router.get('/:id', async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { data: row, error } = await supabaseAdmin
      .from('place_reviews')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !row) {
      return res.status(404).json({ error: 'Không tìm thấy bài viết' });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url, is_premium')
      .eq('id', row.user_id)
      .maybeSingle();

    return res.json({ success: true, post: formatPostRow(row, profile) });
  } catch (err: any) {
    return res.status(500).json({ error: 'Lỗi máy chủ', details: err.message });
  }
});

// ── POST /api/posts ───────────────────────────────────────────────────────────
// Đăng bài đánh giá mới (Bắt buộc 2 tag: Tỉnh thành + Phân loại)
router.post('/', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const {
      place_name,
      province,
      category,
      rating,
      content,
      media_urls = [],
      aspects = {},
      cost_per_person = 0,
      opening_hours = '',
      place_status = 'operating',
      trip_id = null,
    } = req.body;

    // Validate 2 tag bắt buộc và các trường bắt buộc
    if (!place_name || typeof place_name !== 'string' || !place_name.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập tên địa điểm bạn muốn đánh giá' });
    }

    if (!province || typeof province !== 'string' || !province.trim()) {
      return res.status(400).json({ error: 'Vui lòng chọn Tag Tỉnh/Thành phố của địa điểm (Bắt buộc)' });
    }

    const VALID_CATEGORIES = ['stay', 'food_normal', 'food_local', 'cafe', 'entertainment', 'other'];
    if (!category || typeof category !== 'string' || !VALID_CATEGORIES.includes(category.trim())) {
      return res.status(400).json({
        error: 'Vui lòng chọn Tag Phân loại hợp lệ: Lưu trú, Ăn uống (thông thường / địa phương), Cà phê, Vui chơi, hoặc Khác'
      });
    }

    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'Xếp hạng sao phải từ 1 đến 5 sao' });
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập nội dung đánh giá chi tiết' });
    }

    const postPayload: PostDetails = {
      place_name: place_name.trim(),
      province: province.trim(),
      category: category.trim(),
      content: content.trim(),
      media_urls: Array.isArray(media_urls) ? media_urls : [],
      aspects: {
        quality: aspects.quality?.trim() || '',
        service: aspects.service?.trim() || '',
        atmosphere: aspects.atmosphere?.trim() || '',
        waiting_time: aspects.waiting_time?.trim() || '',
        booking_method: aspects.booking_method?.trim() || '',
        parking: aspects.parking?.trim() || '',
      },
      cost_per_person: Math.max(0, Number(cost_per_person) || 0),
      opening_hours: opening_hours?.trim() || '',
      place_status: place_status === 'closed' ? 'closed' : 'operating',
      trip_id: trip_id || null,
    };

    const insertPayload: any = {
      user_id: userId,
      rating: ratingNum,
      comment: JSON.stringify(postPayload),
      trip_id: trip_id || null,
    };

    const { data: createdRow, error: insertError } = await supabaseAdmin
      .from('place_reviews')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      console.error('[CreatePost] Insert error:', insertError);
      return res.status(500).json({ error: 'Lỗi lưu bài viết vào cơ sở dữ liệu', details: insertError.message });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url, is_premium')
      .eq('id', userId)
      .maybeSingle();

    return res.status(201).json({
      success: true,
      message: 'Đăng bài đánh giá thành công!',
      post: formatPostRow(createdRow, profile),
    });
  } catch (err: any) {
    console.error('[CreatePost] Fatal error:', err);
    return res.status(500).json({ error: 'Lỗi hệ thống khi tạo bài viết', details: err.message });
  }
});

// ── DELETE /api/posts/:id ─────────────────────────────────────────────────────
// Xóa bài viết (Chỉ tác giả hoặc Admin)
router.delete('/:id', requireAuth, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const { data: post, error: findError } = await supabaseAdmin
      .from('place_reviews')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();

    if (findError || !post) {
      return res.status(404).json({ error: 'Không tìm thấy bài viết cần xóa' });
    }

    if (post.user_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: 'Bạn không có quyền xóa bài viết này' });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('place_reviews')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return res.status(500).json({ error: 'Lỗi khi xóa bài viết', details: deleteError.message });
    }

    return res.json({ success: true, message: 'Đã xóa bài viết thành công' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Lỗi server khi xóa bài viết', details: err.message });
  }
});

// ── POST /api/posts/upload-media ──────────────────────────────────────────────
// Tải ảnh hoặc video đính kèm lên Supabase Storage bucket `post-media`
router.post('/upload-media', requireAuth, async (req: any, res: Response) => {
  try {
    const { fileName, fileType, base64 } = req.body;

    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ error: 'Dữ liệu file tải lên không hợp lệ' });
    }

    // Bóc tách dữ liệu base64
    const cleanBase64 = base64.includes('base64,') ? base64.split('base64,')[1] : base64;
    const buffer = Buffer.from(cleanBase64, 'base64');

    const ext = (fileName ? fileName.split('.').pop() : (fileType?.includes('video') ? 'mp4' : 'jpg')).toLowerCase();
    const uniqueName = `post_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const contentType = fileType || (ext === 'mp4' ? 'video/mp4' : 'image/jpeg');

    const { data, error: uploadError } = await supabaseAdmin.storage
      .from('post-media')
      .upload(uniqueName, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('[UploadMedia] Error:', uploadError);
      return res.status(500).json({ error: 'Lỗi tải tệp lên máy chủ', details: uploadError.message });
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('post-media')
      .getPublicUrl(uniqueName);

    return res.json({
      success: true,
      url: publicUrlData.publicUrl,
      file_name: uniqueName,
    });
  } catch (err: any) {
    console.error('[UploadMedia] Fatal error:', err);
    return res.status(500).json({ error: 'Lỗi xử lý file tải lên', details: err.message });
  }
});

export default router;

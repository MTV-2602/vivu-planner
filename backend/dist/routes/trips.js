"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const supabaseAdmin_1 = require("../services/supabaseAdmin");
const placesService_1 = require("../services/placesService");
const weatherService_1 = require("../services/weatherService");
const geminiService_1 = require("../services/geminiService");
const partnerService_1 = require("../services/partnerService");
const router = (0, express_1.Router)();
function extractSearchQueries(text) {
    const diningQueries = [];
    const attractionQueries = [];
    if (!text)
        return { diningQueries, attractionQueries };
    const cleanAndSplit = (str) => {
        return str
            .split(/\b(?:và|hoặc|cùng|với)\b/gi)
            .map(s => s.replace(/\s+/g, ' ').trim())
            .filter(s => s.length > 2);
    };
    const lower = text.toLowerCase();
    // Dining matches: e.g. "ăn bánh ướt", "thưởng thức lẩu cá đuối"
    const diningRegex = /(?:ăn|thưởng thức|uống|quán|nhà hàng|món)\s+([^,.;!?\(\)]+)/gi;
    let match;
    while ((match = diningRegex.exec(lower)) !== null) {
        const val = match[1].trim();
        cleanAndSplit(val).forEach(q => {
            if (q.length > 2 && q.length < 50) {
                diningQueries.push(q);
            }
        });
    }
    // Attraction matches: e.g. "đi chùa", "tham quan hải đăng"
    const attractionRegex = /(?:tham quan|thăm|đi|ghé|chơi|check[- ]?in|ngắm)\s+([^,.;!?\(\)]+)/gi;
    while ((match = attractionRegex.exec(lower)) !== null) {
        const val = match[1].trim();
        cleanAndSplit(val).forEach(q => {
            if (q.length > 2 && q.length < 50 && !q.startsWith('ăn ') && !q.startsWith('thưởng thức ') && !q.startsWith('uống ')) {
                attractionQueries.push(q);
            }
        });
    }
    // Fallback if nothing matched and string is small
    if (diningQueries.length === 0 && attractionQueries.length === 0 && text.trim().length > 2 && text.trim().length < 60) {
        cleanAndSplit(lower).forEach(q => {
            diningQueries.push(q);
            attractionQueries.push(q);
        });
    }
    return {
        diningQueries: Array.from(new Set(diningQueries)),
        attractionQueries: Array.from(new Set(attractionQueries))
    };
}
function deduplicatePlaces(places) {
    const seen = new Set();
    return places.filter(p => {
        if (!p.google_place_id)
            return true;
        if (seen.has(p.google_place_id))
            return false;
        seen.add(p.google_place_id);
        return true;
    });
}
async function fetchDynamicCandidates(text, title, lat, lng, destinationCity) {
    const customQueries = extractSearchQueries(text);
    if (title && !title.startsWith('Chuyến đi ') && !title.startsWith('Du hí ')) {
        const titleQueries = extractSearchQueries(title);
        customQueries.diningQueries.push(...titleQueries.diningQueries);
        customQueries.attractionQueries.push(...titleQueries.attractionQueries);
    }
    const uniqueDiningQueries = Array.from(new Set(customQueries.diningQueries));
    const uniqueAttractionQueries = Array.from(new Set(customQueries.attractionQueries));
    const customDiningSearches = uniqueDiningQueries.map(q => (0, placesService_1.searchPlaces)(q, 'dining', lat, lng));
    const customAttractionSearches = uniqueAttractionQueries.map(q => (0, placesService_1.searchPlaces)(q, 'attraction', lat, lng));
    const customDiningResults = await Promise.all(customDiningSearches);
    const customAttractionResults = await Promise.all(customAttractionSearches);
    const extraDining = customDiningResults.flat();
    const extraAttractions = customAttractionResults.flat();
    const cityCapitalized = destinationCity.charAt(0).toUpperCase() + destinationCity.slice(1);
    // Dynamic fallback for dining
    uniqueDiningQueries.forEach((q, idx) => {
        const results = customDiningResults[idx] || [];
        if (results.length === 0) {
            const cleanName = q.trim().replace(/^\w/, (c) => c.toUpperCase());
            const candidateName = cleanName.toLowerCase().includes('quán') || cleanName.toLowerCase().includes('nhà hàng')
                ? cleanName
                : `Quán ${cleanName}`;
            extraDining.push({
                google_place_id: `dynamic-dining-${destinationCity.replace(/\s+/g, '-')}-${Date.now()}-${idx}`,
                name: candidateName,
                category: 'dining',
                lat: lat + (Math.random() - 0.5) * 0.02,
                lng: lng + (Math.random() - 0.5) * 0.02,
                rating: parseFloat((4.3 + Math.random() * 0.5).toFixed(1)),
                price_level: 1,
                address: `Địa chỉ quán ${cleanName} tại ${cityCapitalized}`
            });
        }
    });
    // Dynamic fallback for attractions
    uniqueAttractionQueries.forEach((q, idx) => {
        const results = customAttractionResults[idx] || [];
        if (results.length === 0) {
            const cleanName = q.trim().replace(/^\w/, (c) => c.toUpperCase());
            const candidateName = cleanName.toLowerCase().includes('điểm') || cleanName.toLowerCase().includes('khu du lịch') || cleanName.toLowerCase().includes('chùa') || cleanName.toLowerCase().includes('bãi')
                ? cleanName
                : `Khu du lịch ${cleanName}`;
            extraAttractions.push({
                google_place_id: `dynamic-attraction-${destinationCity.replace(/\s+/g, '-')}-${Date.now()}-${idx}`,
                name: candidateName,
                category: 'attraction',
                lat: lat + (Math.random() - 0.5) * 0.02,
                lng: lng + (Math.random() - 0.5) * 0.02,
                rating: parseFloat((4.4 + Math.random() * 0.5).toFixed(1)),
                price_level: 0,
                address: `Địa danh ${cleanName} tại ${cityCapitalized}`
            });
        }
    });
    return { extraDining, extraAttractions };
}
function formatTimeForDb(timeStr) {
    if (!timeStr)
        return null;
    const clean = timeStr.trim();
    const parts = clean.split(':');
    if (parts.length >= 2) {
        const hh = parts[0].padStart(2, '0');
        const mm = parts[1].padStart(2, '0');
        const ss = parts.length >= 3 ? parts[2].substring(0, 2).padStart(2, '0') : '00';
        return `${hh}:${mm}:${ss}`;
    }
    return null;
}
function parseOptionalCost(value) {
    if (value === undefined || value === null || value === '')
        return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return null;
    return Math.max(0, Math.round(parsed));
}
function buildDynamicSearchQueries(preferences) {
    let accommodationQuery = 'khách sạn homestay';
    let diningQuery = 'nhà hàng quán ăn ngon đặc sản';
    let attractionQuery = 'địa điểm tham quan du lịch danh lam thắng cảnh';
    let rentalQuery = 'cho thuê xe máy tự lái';
    if (preferences) {
        if (preferences.food === true) {
            diningQuery = 'quán ăn ngon đặc sản ẩm thực địa phương nhà hàng';
        }
        if (preferences.relax === true) {
            accommodationQuery = 'khách sạn nghỉ dưỡng resort homestay yên bình';
        }
        const attractionKeywords = [];
        if (preferences.history === true) {
            attractionKeywords.push('chùa đền di tích lịch sử bảo tàng cổ kính');
        }
        if (preferences.nature === true) {
            attractionKeywords.push('bãi biển cảnh đẹp thiên nhiên đồi thông thác nước');
        }
        if (preferences.adventure === true) {
            attractionKeywords.push('khu du lịch sinh thái trekking leo núi cắm trại mạo hiểm');
        }
        if (preferences.shopping === true) {
            attractionKeywords.push('chợ đêm trung tâm mua sắm giải trí phố đi bộ');
        }
        if (attractionKeywords.length > 0) {
            attractionQuery = attractionKeywords.join(' ');
        }
    }
    return {
        accommodationQuery,
        diningQuery,
        attractionQuery,
        rentalQuery
    };
}
// GET /api/trips - List all trips of the current user
router.get('/', authMiddleware_1.authMiddleware, async (req, res) => {
    const client = (0, supabaseAdmin_1.getSupabaseUserClient)(req.token);
    try {
        const { data: trips, error } = await client
            .from('trips')
            .select('*')
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return res.json(trips);
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to retrieve trips', details: error.message });
    }
});
// GET /api/trips/chat - Lấy lịch sử trò chuyện chung
router.get('/chat', authMiddleware_1.authMiddleware, async (req, res) => {
    try {
        const { data: messages, error } = await supabaseAdmin_1.supabaseAdmin
            .from('trip_chat_messages')
            .select('*')
            .is('trip_id', null)
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: true });
        if (error)
            throw error;
        return res.json({
            success: true,
            messages: messages || []
        });
    }
    catch (err) {
        console.warn('[GetGeneralChatHistory] Error:', err.message);
        return res.json({ success: true, messages: [] });
    }
});
// GET /api/trips/:id - Get a specific trip detail with days and items
// ─── GET /trips/:id/public ── Public view (no auth required, for share links) ──
router.get('/:id/public', async (req, res) => {
    const tripId = req.params.id;
    try {
        const { data: trip, error: tripError } = await supabaseAdmin_1.supabaseAdmin
            .from('trips')
            .select('id,title,destination_city,start_date,end_date,budget_total,traveler_count,traveler_type,status')
            .eq('id', tripId)
            .single();
        if (tripError || !trip) {
            return res.status(404).json({ error: 'Trip not found or not shared publicly' });
        }
        const { data: days } = await supabaseAdmin_1.supabaseAdmin
            .from('itinerary_days')
            .select('*')
            .eq('trip_id', tripId)
            .order('day_number', { ascending: true });
        let daysWithItems = [];
        if (days && days.length > 0) {
            const dayIds = days.map(d => d.id);
            const { data: items } = await supabaseAdmin_1.supabaseAdmin
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
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
router.get('/:id', authMiddleware_1.authMiddleware, async (req, res) => {
    const client = (0, supabaseAdmin_1.getSupabaseUserClient)(req.token);
    const tripId = req.params.id;
    try {
        const { data: trip, error: tripError } = await client
            .from('trips')
            .select('*')
            .eq('id', tripId)
            .single();
        if (tripError || !trip) {
            return res.status(404).json({ error: 'Trip not found' });
        }
        const { data: days, error: daysError } = await client
            .from('itinerary_days')
            .select('*')
            .eq('trip_id', tripId)
            .order('day_number', { ascending: true });
        if (daysError)
            throw daysError;
        let daysWithItems = [];
        if (days && days.length > 0) {
            const dayIds = days.map(d => d.id);
            const { data: items, error: itemsError } = await client
                .from('itinerary_items')
                .select('*')
                .in('day_id', dayIds)
                .order('order_index', { ascending: true });
            if (itemsError)
                throw itemsError;
            // Dynamically match and enrich partner information for pre-existing itinerary items
            let enrichedItems = items || [];
            try {
                const { data: partners } = await supabaseAdmin_1.supabaseAdmin
                    .from('partners')
                    .select('*')
                    .eq('active_status', true);
                const activePartners = partners || [];
                const normalizeNameForMatching = (name) => {
                    if (!name)
                        return '';
                    return name
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '') // remove diacritics
                        .replace(/[&\/\\#,+()$~%.'\":*?<>{}]/g, '') // remove special chars
                        .replace(/\s+/g, ' ') // normalize whitespace
                        .trim();
                };
                const matchPartner = (itemTitle, partnerName) => {
                    const normTitle = normalizeNameForMatching(itemTitle);
                    const normPartner = normalizeNameForMatching(partnerName);
                    if (!normTitle || !normPartner)
                        return false;
                    if (normTitle === normPartner)
                        return true;
                    if (normPartner.length >= 6) {
                        if (normTitle.includes(normPartner) || normPartner.includes(normTitle)) {
                            return true;
                        }
                    }
                    return false;
                };
                enrichedItems = (items || []).map((item) => {
                    // If it's already a partner item, keep it but ensure booking_url is populated
                    if (item.google_place_id && item.google_place_id.startsWith('partner_')) {
                        const partnerId = item.google_place_id.replace('partner_', '');
                        const matchedPartner = activePartners.find((p) => String(p.id) === partnerId);
                        if (matchedPartner) {
                            return {
                                ...item,
                                booking_url: item.booking_url || matchedPartner.booking_url || null
                            };
                        }
                    }
                    // Otherwise, check name match to enrich retroactively
                    const matched = activePartners.find((p) => matchPartner(item.title, p.name));
                    if (matched) {
                        return {
                            ...item,
                            google_place_id: item.google_place_id || `partner_${matched.id}`,
                            booking_url: item.booking_url || matched.booking_url || null
                        };
                    }
                    return item;
                });
            }
            catch (partnerErr) {
                console.error('[GetTripDetail] Error enriching partner data:', partnerErr);
            }
            daysWithItems = days.map(day => ({
                ...day,
                items: enrichedItems.filter((item) => item.day_id === day.id)
            }));
        }
        // Retrieve revision logs
        const { data: revisions } = await client
            .from('itinerary_revisions')
            .select('*')
            .eq('trip_id', tripId)
            .order('created_at', { ascending: false });
        return res.json({
            ...trip,
            days: daysWithItems,
            revisions: revisions || []
        });
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to retrieve trip details', details: error.message });
    }
});
// POST /api/trips - Create a new trip and generate AI itinerary
router.post('/', authMiddleware_1.authMiddleware, async (req, res) => {
    const client = (0, supabaseAdmin_1.getSupabaseUserClient)(req.token);
    const { title, destination_city, start_date, end_date, budget_total, traveler_count, traveler_type, preferences, health_conditions, special_requirements } = req.body;
    // Check trip creation quota: Free = 3 trips, custom_quota for purchased packs
    const userId = req.user.id;
    const { data: profile } = await supabaseAdmin_1.supabaseAdmin
        .from('profiles')
        .select('is_premium, premium_until, custom_quota, trips_used')
        .eq('id', userId)
        .single();
    const { count: dbTripsCount } = await supabaseAdmin_1.supabaseAdmin
        .from('trips')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
    const isPremium = !!(profile?.is_premium || (profile?.premium_until && new Date(profile.premium_until) > new Date()));
    const allowedQuota = profile?.custom_quota || (isPremium ? 10 : 3);
    const currentUsed = Math.max(profile?.trips_used ?? 0, dbTripsCount || 0);
    if (currentUsed >= allowedQuota) {
        return res.status(403).json({
            error: 'quota_exceeded',
            message: `Bạn đã sử dụng hết ${currentUsed}/${allowedQuota} lượt tạo chuyến đi. Vui lòng nạp thêm lượt để tiếp tục lên kế hoạch!`,
            isQuotaExceeded: true,
            currentCount: currentUsed,
            allowedQuota,
            isPremium,
        });
    }
    if (!destination_city || !start_date || !end_date || !budget_total) {
        return res.status(400).json({ error: 'Missing required parameters: destination_city, start_date, end_date, budget_total' });
    }
    // Auto-correct year if the date is too far in the past (> 30 days ago)
    // This handles cases where the AI chatbot inferred the wrong year
    const autoCorrectDate = (dateStr) => {
        const date = new Date(dateStr);
        if (isNaN(date.getTime()))
            return dateStr;
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
    // Predict absolute minimum cost and validate budget
    const start = new Date(correctedStartDate);
    const end = new Date(correctedEndDate);
    let daysCount = 1;
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const diffTime = Math.abs(end.getTime() - start.getTime());
        daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }
    const nightsCount = Math.max(0, daysCount - 1);
    const travelers = parseInt(traveler_count || '1');
    const minRequiredBudget = travelers * ((nightsCount * 100000) + (daysCount * 120000));
    if (parseFloat(budget_total) < minRequiredBudget) {
        return res.status(400).json({
            error: `Ngân sách tối thiểu dự kiến cho chuyến đi ${daysCount} ngày (${nightsCount} đêm) của ${travelers} khách tại ${destination_city} là ${minRequiredBudget.toLocaleString('vi-VN')}đ. Vui lòng tăng ngân sách để tiếp tục.`
        });
    }
    try {
        // 1. Resolve coordinates
        const { lat, lng } = (0, placesService_1.getCityCoordinates)(destination_city);
        // 2. Fetch weather
        const weatherForecast = await (0, weatherService_1.getWeatherForecast)(lat, lng, correctedStartDate, correctedEndDate);
        // 3. Quét toàn bộ địa điểm du lịch ứng viên trong 1 truy vấn duy nhất từ cache DB
        const batchPlaces = await (0, placesService_1.fetchCandidatePlacesForCity)(destination_city, lat, lng, preferences, special_requirements || '', title || '');
        // Lấy đối tác liên quan
        const relevantPartners = await (0, partnerService_1.getRelevantPartners)(destination_city, lat, lng, preferences || {}, parseFloat(budget_total) || 0, correctedStartDate, correctedEndDate, parseInt(traveler_count || '1'));
        const partnerCandidates = (0, partnerService_1.convertPartnersToPlaceCandidates)(relevantPartners);
        const mergedAccommodations = deduplicatePlaces([...partnerCandidates.filter(p => p.category === 'accommodation'), ...batchPlaces.accommodation]);
        const mergedDining = deduplicatePlaces([...partnerCandidates.filter(p => p.category === 'dining'), ...batchPlaces.dining]);
        const mergedAttractions = deduplicatePlaces([...partnerCandidates.filter(p => p.category === 'attraction'), ...batchPlaces.attraction]);
        const mergedRentals = deduplicatePlaces([...partnerCandidates.filter(p => p.category === 'rental'), ...batchPlaces.rental]);
        const candidatePlaces = {
            accommodation: mergedAccommodations.slice(0, 4),
            dining: mergedDining.slice(0, 8),
            attraction: mergedAttractions.slice(0, 8),
            rental: mergedRentals.slice(0, 3)
        };
        // 4. Generate AI itinerary using Gemini
        const itinerary = await (0, geminiService_1.generateItinerary)({ ...req.body, start_date: correctedStartDate, end_date: correctedEndDate }, weatherForecast, candidatePlaces);
        // 5. Save trip to Supabase
        const { data: trip, error: tripError } = await client
            .from('trips')
            .insert({
            user_id: req.user.id,
            title: title || `Chuyến đi ${destination_city}`,
            destination_city,
            destination_province: destination_city,
            start_date: correctedStartDate,
            end_date: correctedEndDate,
            budget_total: parseFloat(budget_total),
            traveler_count: parseInt(traveler_count || '1'),
            traveler_type: traveler_type || 'solo',
            preferences: preferences || {},
            health_conditions: health_conditions || '',
            special_requirements: special_requirements || '',
            status: 'draft'
        })
            .select()
            .single();
        if (tripError || !trip) {
            throw tripError || new Error('Failed to create trip record');
        }
        // Permanently increment trips_used on profiles so deleting trips later DOES NOT refund credits!
        await supabaseAdmin_1.supabaseAdmin
            .from('profiles')
            .upsert({
            id: userId,
            trips_used: currentUsed + 1,
            updated_at: new Date().toISOString()
        });
        // Liên kết toàn bộ tin nhắn chat chung cũ (với trip_id IS NULL) sang chuyến đi mới này
        const { error: chatLinkErr } = await supabaseAdmin_1.supabaseAdmin
            .from('trip_chat_messages')
            .update({ trip_id: trip.id })
            .eq('user_id', req.user.id)
            .is('trip_id', null);
        if (chatLinkErr) {
            console.error('[CreateTrip] Failed to associate chat history with new trip:', chatLinkErr.message);
        }
        else {
            console.log(`[CreateTrip] Successfully associated general chat history with trip ${trip.id}`);
        }
        // 6. Tối ưu hóa: Sinh UUID client-side và lưu song song các ngày và hoạt động (Parallel DB Writes)
        const daysToInsert = itinerary.days.map(day => ({
            id: crypto_1.default.randomUUID(), // Chủ động sinh UUID để liên kết song song
            trip_id: trip.id,
            day_number: day.day_number,
            date: day.date,
            weather_summary: { note: day.weather_note }
        }));
        const itemsToInsert = [];
        itinerary.days.forEach(day => {
            const dbDay = daysToInsert.find(d => Number(d.day_number) === Number(day.day_number));
            if (!dbDay)
                return;
            day.items.forEach(item => {
                let itemLat = lat;
                let itemLng = lng;
                let itemAddress = '';
                let itemBookingUrl = '';
                if (item.google_place_id) {
                    const matched = [
                        ...mergedAccommodations,
                        ...mergedDining,
                        ...mergedAttractions,
                        ...mergedRentals
                    ].find(c => c.google_place_id === item.google_place_id);
                    if (matched) {
                        itemLat = matched.lat;
                        itemLng = matched.lng;
                        itemAddress = matched.address;
                        itemBookingUrl = matched.booking_url || '';
                    }
                }
                itemsToInsert.push({
                    day_id: dbDay.id, // Sử dụng UUID đã sinh ở trên để liên kết
                    item_type: item.item_type,
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
        // Thực hiện ghi song song cả ngày và hoạt động cùng lúc để giảm 1 vòng roundtrip DB
        const [daysResult, itemsResult] = await Promise.all([
            client.from('itinerary_days').insert(daysToInsert),
            itemsToInsert.length > 0 ? client.from('itinerary_items').insert(itemsToInsert) : Promise.resolve({ error: null })
        ]);
        if (daysResult.error)
            throw daysResult.error;
        if (itemsResult.error)
            throw itemsResult.error;
        // Log partner booking events
        for (const item of itemsToInsert) {
            if (item.google_place_id && item.google_place_id.startsWith('partner_')) {
                const partnerId = item.google_place_id.replace('partner_', '');
                await (0, partnerService_1.logPartnerEvent)(partnerId, 'booking', trip.id, req.user.id, { item_type: item.item_type });
            }
        }
        // Log impressions for all partner candidates sent to AI
        for (const partner of relevantPartners) {
            await (0, partnerService_1.logPartnerEvent)(partner.id, 'impression', trip.id, req.user.id, {});
        }
        // Fetch the full assembled trip details to return
        const { data: fullTrip, error: fetchError } = await client
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
            days: dbDaysWithItems
        });
    }
    catch (error) {
        console.error('Error generating trip:', error);
        return res.status(500).json({ error: 'Failed to create trip and generate itinerary', details: error.message });
    }
});
// PUT /api/trips/:id - Edit trip details (e.g. status)
router.put('/:id', authMiddleware_1.authMiddleware, async (req, res) => {
    const client = (0, supabaseAdmin_1.getSupabaseUserClient)(req.token);
    const tripId = req.params.id;
    try {
        const { data: trip, error } = await client
            .from('trips')
            .update(req.body)
            .eq('id', tripId)
            .select()
            .single();
        if (error)
            throw error;
        return res.json(trip);
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to update trip metadata', details: error.message });
    }
});
// DELETE /api/trips/:id - Delete a trip
router.delete('/:id', authMiddleware_1.authMiddleware, async (req, res) => {
    const client = (0, supabaseAdmin_1.getSupabaseUserClient)(req.token);
    const tripId = req.params.id;
    try {
        const { error } = await client
            .from('trips')
            .delete()
            .eq('id', tripId);
        if (error)
            throw error;
        return res.json({ success: true, message: 'Trip deleted successfully' });
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to delete trip', details: error.message });
    }
});
async function saveChatMessage(tripId, userId, role, content, meta) {
    try {
        await supabaseAdmin_1.supabaseAdmin.from('trip_chat_messages').insert({
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
    }
    catch (err) {
        console.warn('[saveChatMessage] Failed to save chat message to DB (table may not exist yet):', err.message);
    }
}
// GET /api/trips/:id/chat - Lấy lịch sử trò chuyện của chuyến đi
router.get('/:id/chat', authMiddleware_1.authMiddleware, async (req, res) => {
    const tripId = req.params.id;
    try {
        const { data: messages, error } = await supabaseAdmin_1.supabaseAdmin
            .from('trip_chat_messages')
            .select('*')
            .eq('trip_id', tripId)
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: true });
        if (error)
            throw error;
        return res.json({
            success: true,
            messages: messages || []
        });
    }
    catch (err) {
        console.warn('[GetTripChatHistory] Error:', err.message);
        return res.json({ success: true, messages: [] });
    }
});
// POST /api/trips/chat - Trò chuyện chung không có ngữ cảnh chuyến đi
router.post('/chat', authMiddleware_1.authMiddleware, async (req, res) => {
    const { message, history } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'message is required' });
    }
    try {
        // Save user message
        await saveChatMessage(null, req.user.id, 'user', message);
        const chatResponse = await (0, geminiService_1.chatWithItinerary)(message, history || []);
        // Save model response
        await saveChatMessage(null, req.user.id, 'model', chatResponse.responseText, {
            isCreateTrip: chatResponse.isCreateTrip,
            createTripParams: chatResponse.createTripParams
        });
        return res.json({
            success: true,
            ...chatResponse
        });
    }
    catch (error) {
        console.error('[General Chat Route] Error:', error.message);
        try {
            fs_1.default.appendFileSync('error_log.txt', `[${new Date().toISOString()}] [General Chat] Error: ${error.message}\nStack: ${error.stack}\n`);
        }
        catch (_) { }
        return res.status(500).json({ error: `Failed to process general chat with AI. Details: ${error.message}` });
    }
});
// POST /api/trips/:id/chat - Trò chuyện trong chuyến đi có ngữ cảnh
router.post('/:id/chat', authMiddleware_1.authMiddleware, async (req, res) => {
    const client = (0, supabaseAdmin_1.getSupabaseUserClient)(req.token);
    const tripId = req.params.id;
    const { message, history } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'message is required' });
    }
    try {
        // 1. Lấy thông tin chuyến đi
        const { data: trip, error: tripError } = await client.from('trips').select('*').eq('id', tripId).single();
        if (tripError || !trip)
            return res.status(404).json({ error: 'Trip not found' });
        // Save user message
        await saveChatMessage(tripId, req.user.id, 'user', message);
        // 2. Lấy danh sách các ngày
        const { data: dbDays, error: daysError } = await client
            .from('itinerary_days')
            .select('*')
            .eq('trip_id', tripId)
            .order('day_number', { ascending: true });
        let previousSnapshot = null;
        let weatherForecast = [];
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
            const { lat, lng } = (0, placesService_1.getCityCoordinates)(trip.destination_city);
            try {
                weatherForecast = await (0, weatherService_1.getWeatherForecast)(lat, lng, trip.start_date, trip.end_date);
            }
            catch (err) {
                console.warn('[Trip Chat Route] Weather fetch failed, continuing without weather:', err);
            }
        }
        const chatResponse = await (0, geminiService_1.chatWithItinerary)(message, history || [], trip, previousSnapshot, weatherForecast);
        // Save model response
        await saveChatMessage(tripId, req.user.id, 'model', chatResponse.responseText, {
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
    }
    catch (error) {
        console.error('[Trip Chat Route] Error:', error.message);
        try {
            fs_1.default.appendFileSync('error_log.txt', `[${new Date().toISOString()}] [Trip Chat ${tripId}] Error: ${error.message}\nStack: ${error.stack}\n`);
        }
        catch (_) { }
        return res.status(500).json({ error: `Failed to process chat with AI. Details: ${error.message}` });
    }
});
// 1. POST /api/trips/:id/disruptions/preview - Gợi ý lịch trình thích ứng (Chưa lưu DB)
router.post('/:id/disruptions/preview', authMiddleware_1.authMiddleware, async (req, res) => {
    const client = (0, supabaseAdmin_1.getSupabaseUserClient)(req.token);
    const tripId = req.params.id;
    const { disruption_type, description, day_id } = req.body;
    if (!disruption_type || !description) {
        return res.status(400).json({ error: 'disruption_type and description are required' });
    }
    try {
        // A. Lấy thông tin chuyến đi và lịch trình hiện tại
        const { data: trip, error: tripError } = await client.from('trips').select('*').eq('id', tripId).single();
        if (tripError || !trip)
            return res.status(404).json({ error: 'Trip not found' });
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
        const { lat, lng } = (0, placesService_1.getCityCoordinates)(trip.destination_city);
        const weatherForecast = await (0, weatherService_1.getWeatherForecast)(lat, lng, trip.start_date, trip.end_date);
        // Quét toàn bộ địa điểm du lịch ứng viên trong 1 truy vấn duy nhất từ cache DB cho phương án thay thế
        const combinedRequirements = [trip.special_requirements, description].filter(Boolean).join('\n');
        const batchPlaces = await (0, placesService_1.fetchCandidatePlacesForCity)(trip.destination_city, lat, lng, trip.preferences, combinedRequirements, trip.title || '');
        // Lấy đối tác liên quan
        const relevantPartners = await (0, partnerService_1.getRelevantPartners)(trip.destination_city, lat, lng, trip.preferences || {}, parseFloat(trip.budget_total) || 0, trip.start_date, trip.end_date, parseInt(trip.traveler_count || '1'));
        const partnerCandidates = (0, partnerService_1.convertPartnersToPlaceCandidates)(relevantPartners);
        const mergedAccommodations = deduplicatePlaces([...partnerCandidates.filter(p => p.category === 'accommodation'), ...batchPlaces.accommodation]);
        const mergedDining = deduplicatePlaces([...partnerCandidates.filter(p => p.category === 'dining'), ...batchPlaces.dining]);
        const mergedAttractions = deduplicatePlaces([...partnerCandidates.filter(p => p.category === 'attraction'), ...batchPlaces.attraction]);
        const mergedRentals = deduplicatePlaces([...partnerCandidates.filter(p => p.category === 'rental'), ...batchPlaces.rental]);
        const candidatePlaces = {
            accommodation: mergedAccommodations.slice(0, 4),
            dining: mergedDining.slice(0, 8),
            attraction: mergedAttractions.slice(0, 8),
            rental: mergedRentals.slice(0, 3)
        };
        const { itinerary: adaptedItinerary, diff } = await (0, geminiService_1.adaptItinerary)(trip, previousSnapshot, disruption_type, description, weatherForecast, candidatePlaces);
        return res.json({
            success: true,
            adaptedItinerary,
            diff,
            previousSnapshot
        });
    }
    catch (error) {
        console.error('Preview adaptation failed:', error);
        return res.status(500).json({ error: 'Failed to adapt itinerary preview', details: error.message });
    }
});
// 2. POST /api/trips/:id/disruptions/apply - Lưu các hoạt động thay thế đã chọn
router.post('/:id/disruptions/apply', authMiddleware_1.authMiddleware, async (req, res) => {
    const client = (0, supabaseAdmin_1.getSupabaseUserClient)(req.token);
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
            if (matchedDay)
                affectedDayNumber = matchedDay.day_number;
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
        if (disError || !disruptionEvent)
            throw disError || new Error('Failed to save disruption event');
        // D. Ghi nhật ký revision
        const newSnapshot = {
            days: dbDays.map(d => ({
                day_number: d.day_number,
                date: d.date,
                weather_note: d.weather_summary?.note || '',
                items: selected_items.filter((item) => Number(item.day_number) === Number(d.day_number))
            }))
        };
        await supabaseAdmin_1.supabaseAdmin
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
        let dbItems = [];
        if (affectedDayIds.length > 0) {
            const { data, error: itemsError } = await client
                .from('itinerary_items')
                .select('*')
                .in('day_id', affectedDayIds)
                .eq('status', 'planned');
            if (itemsError)
                throw itemsError;
            dbItems = data || [];
        }
        const normalizeString = (s) => {
            if (!s)
                return '';
            return s.trim().toLowerCase().replace(/\s+/g, ' ');
        };
        const normalizeTime = (t) => {
            if (!t)
                return '';
            return t.substring(0, 5);
        };
        const normalizeCost = (c) => {
            if (c === null || c === undefined)
                return 0;
            return Number(c) || 0;
        };
        // F. Lấy tọa độ để fallback
        const { data: trip } = await client.from('trips').select('*').eq('id', tripId).single();
        const city = trip?.destination_city || 'Da Nang';
        const { lat, lng } = (0, placesService_1.getCityCoordinates)(city);
        // Fetch relevant partners to match booking_url
        const relevantPartners = await (0, partnerService_1.getRelevantPartners)(city, lat, lng, trip?.preferences || {}, parseFloat(trip?.budget_total) || 0, trip?.start_date, trip?.end_date, parseInt(trip?.traveler_count || '1'));
        const itemIdsToReplace = [];
        const dbItemsToUpdate = [];
        const remainingItemsToInsert = [...selected_items];
        // 1. Phân loại các hoạt động không thay đổi (giữ nguyên)
        const unmatchedDbItems = [];
        dbItems.forEach((dbItem) => {
            const matchedDay = dbDays.find(d => d.id === dbItem.day_id);
            const dayNum = matchedDay ? matchedDay.day_number : null;
            const matchIndex = remainingItemsToInsert.findIndex((item) => Number(item.day_number) === Number(dayNum) &&
                normalizeString(dbItem.title) === normalizeString(item.title));
            if (matchIndex !== -1) {
                // Trùng khớp hoàn toàn -> Bỏ khỏi danh sách chèn mới
                remainingItemsToInsert.splice(matchIndex, 1);
            }
            else {
                // Không trùng khớp -> Hoạt động cũ bị sửa đổi hoặc xóa bỏ
                unmatchedDbItems.push(dbItem);
            }
        });
        // 2. Phân bổ hoạt động thay thế tại chỗ theo từng ngày
        affectedDayIds.forEach((dayId) => {
            const matchedDay = dbDays.find(d => d.id === dayId);
            const dayNum = matchedDay ? matchedDay.day_number : null;
            if (!dayNum)
                return;
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
                if (updateErr)
                    throw updateErr;
                // Log đối tác nếu có
                if (pair.newItem.google_place_id && pair.newItem.google_place_id.startsWith('partner_')) {
                    const partnerId = pair.newItem.google_place_id.replace('partner_', '');
                    await (0, partnerService_1.logPartnerEvent)(partnerId, 'booking', tripId, req.user.id, { item_type: pair.newItem.item_type, disruption_applied: true });
                }
            }
        }
        // 4. Thực thi đánh dấu các hoạt động bị xóa hẳn
        if (itemIdsToReplace.length > 0) {
            const { error: updateError } = await client
                .from('itinerary_items')
                .update({ status: 'replaced' })
                .in('id', itemIdsToReplace);
            if (updateError)
                throw updateError;
        }
        // 5. Thực thi chèn các hoạt động mới hoàn toàn (nếu số lượng hoạt động mới nhiều hơn cũ)
        const finalItemsToInsert = [];
        remainingItemsToInsert.forEach((item) => {
            // Bỏ qua các hoạt động đã được update tại chỗ
            const isAlreadyUpdated = dbItemsToUpdate.some(pair => pair.newItem === item);
            if (isAlreadyUpdated)
                return;
            const dbDay = dbDays.find(d => Number(d.day_number) === Number(item.day_number));
            if (!dbDay)
                return;
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
            if (insertError)
                throw insertError;
            // Log partner booking events for applied alternative items
            for (const item of finalItemsToInsert) {
                if (item.google_place_id && item.google_place_id.startsWith('partner_')) {
                    const partnerId = item.google_place_id.replace('partner_', '');
                    await (0, partnerService_1.logPartnerEvent)(partnerId, 'booking', tripId, req.user.id, { item_type: item.item_type, disruption_applied: true });
                }
            }
        }
        return res.json({
            success: true,
            message: 'Itinerary adapted and applied successfully'
        });
    }
    catch (error) {
        console.error('Apply adaptation failed:', error);
        return res.status(500).json({ error: 'Failed to apply adapted itinerary', details: error.message });
    }
});
// 3. PUT /api/trips/items/:itemId - Sửa hoạt động thủ công (Sửa tay)
router.put('/items/:itemId', authMiddleware_1.authMiddleware, async (req, res) => {
    const client = (0, supabaseAdmin_1.getSupabaseUserClient)(req.token);
    const itemId = req.params.itemId;
    const { title, description, start_time, end_time, estimated_cost, status, item_type } = req.body;
    try {
        const updateData = {};
        if (title !== undefined)
            updateData.title = title;
        if (description !== undefined)
            updateData.description = description;
        if (start_time !== undefined)
            updateData.start_time = formatTimeForDb(start_time);
        if (end_time !== undefined)
            updateData.end_time = formatTimeForDb(end_time);
        if (estimated_cost !== undefined)
            updateData.estimated_cost = parseOptionalCost(estimated_cost);
        if (status !== undefined)
            updateData.status = status;
        if (item_type !== undefined)
            updateData.item_type = item_type;
        const { data: updatedItem, error } = await client
            .from('itinerary_items')
            .update(updateData)
            .eq('id', itemId)
            .select()
            .single();
        if (error)
            throw error;
        return res.json(updatedItem);
    }
    catch (error) {
        console.error('[Update Item Route] Error:', error.message);
        return res.status(500).json({ error: 'Failed to update itinerary item', details: error.message });
    }
});
// 4. DELETE /api/trips/items/:itemId - Xóa hoạt động thủ công
router.delete('/items/:itemId', authMiddleware_1.authMiddleware, async (req, res) => {
    const client = (0, supabaseAdmin_1.getSupabaseUserClient)(req.token);
    const itemId = req.params.itemId;
    try {
        const { error } = await client
            .from('itinerary_items')
            .delete()
            .eq('id', itemId);
        if (error)
            throw error;
        return res.json({ success: true, message: 'Item deleted successfully' });
    }
    catch (error) {
        console.error('[Delete Item Route] Error:', error.message);
        return res.status(500).json({ error: 'Failed to delete itinerary item', details: error.message });
    }
});
// 5. POST /api/trips/items/:itemId/ai-replace - AI gợi ý thay thế một hoạt động cụ thể
router.post('/items/:itemId/ai-replace', authMiddleware_1.authMiddleware, async (req, res) => {
    const client = (0, supabaseAdmin_1.getSupabaseUserClient)(req.token);
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
        const { lat, lng } = (0, placesService_1.getCityCoordinates)(trip.destination_city);
        // Tùy thuộc vào loại hoạt động gốc hoặc yêu cầu đặc thù để tìm kiếm địa điểm phù hợp
        let searchQuery = 'địa điểm tham quan';
        let category = 'attraction';
        if (item.item_type === 'accommodation') {
            searchQuery = 'khách sạn';
            category = 'accommodation';
        }
        else if (item.item_type === 'dining') {
            searchQuery = 'quán ăn ngon đặc sản';
            category = 'dining';
        }
        else if (item.item_type === 'rental') {
            searchQuery = 'thuê xe máy';
            category = 'rental';
        }
        else {
            searchQuery = 'địa điểm du lịch';
            category = 'attraction';
        }
        // Nếu người dùng có yêu cầu cụ thể, bổ sung vào từ khóa tìm kiếm
        let customDiningResults = [];
        if (user_requirement) {
            customDiningResults = await (0, placesService_1.searchPlaces)(user_requirement, category, lat, lng);
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
        const searchPlacesResults = await (0, placesService_1.searchPlaces)(searchQuery, category, lat, lng);
        // Fetch relevant partners and merge them
        const relevantPartners = await (0, partnerService_1.getRelevantPartners)(trip.destination_city, lat, lng, trip.preferences || {}, parseFloat(trip.budget_total) || 0, trip.start_date, trip.end_date, parseInt(trip.traveler_count || '1'));
        const partnerCandidates = (0, partnerService_1.convertPartnersToPlaceCandidates)(relevantPartners);
        const categoryPartners = partnerCandidates.filter(p => p.category === category);
        const candidatePlaces = deduplicatePlaces([...categoryPartners, ...customDiningResults, ...searchPlacesResults]);
        // D. Gọi AI để tạo 3 phương án thay thế
        const alternatives = await (0, geminiService_1.generateAlternatives)(trip, item, user_requirement, candidatePlaces);
        return res.json({
            success: true,
            alternatives
        });
    }
    catch (error) {
        console.error('[AI Replace Item Route] Error:', error.message);
        return res.status(500).json({ error: 'Failed to generate AI replacement alternatives', details: error.message });
    }
});
exports.default = router;

import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/authMiddleware';
import { getSupabaseUserClient, supabaseAdmin } from '../services/supabaseAdmin';
import { getCityCoordinates, searchPlaces, PlaceCandidate } from '../services/placesService';
import { getWeatherForecast } from '../services/weatherService';
import { generateItinerary, adaptItinerary, generateAlternatives } from '../services/geminiService';
import { getRelevantPartners, convertPartnersToPlaceCandidates, logPartnerEvent } from '../services/partnerService';

const router = Router();

function extractSearchQueries(text: string): { diningQueries: string[], attractionQueries: string[] } {
  const diningQueries: string[] = [];
  const attractionQueries: string[] = [];
  
  if (!text) return { diningQueries, attractionQueries };
  
  const cleanAndSplit = (str: string): string[] => {
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

function deduplicatePlaces(places: PlaceCandidate[]): PlaceCandidate[] {
  const seen = new Set<string>();
  return places.filter(p => {
    if (!p.google_place_id) return true;
    if (seen.has(p.google_place_id)) return false;
    seen.add(p.google_place_id);
    return true;
  });
}

async function fetchDynamicCandidates(
  text: string,
  title: string,
  lat: number,
  lng: number,
  destinationCity: string
): Promise<{ extraDining: PlaceCandidate[], extraAttractions: PlaceCandidate[] }> {
  const customQueries = extractSearchQueries(text);
  
  if (title && !title.startsWith('Chuyến đi ') && !title.startsWith('Du hí ')) {
    const titleQueries = extractSearchQueries(title);
    customQueries.diningQueries.push(...titleQueries.diningQueries);
    customQueries.attractionQueries.push(...titleQueries.attractionQueries);
  }
  
  const uniqueDiningQueries = Array.from(new Set(customQueries.diningQueries));
  const uniqueAttractionQueries = Array.from(new Set(customQueries.attractionQueries));
  
  const customDiningSearches = uniqueDiningQueries.map(q => searchPlaces(q, 'dining', lat, lng));
  const customAttractionSearches = uniqueAttractionQueries.map(q => searchPlaces(q, 'attraction', lat, lng));
  
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

function formatTimeForDb(timeStr?: string | null): string | null {
  if (!timeStr) return null;
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

function parseOptionalCost(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;

  return Math.max(0, Math.round(parsed));
}

function buildDynamicSearchQueries(preferences: any) {
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
    const attractionKeywords: string[] = [];
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
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const client = getSupabaseUserClient(req.token!);
  try {
    const { data: trips, error } = await client
      .from('trips')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json(trips);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to retrieve trips', details: error.message });
  }
});

// GET /api/trips/:id - Get a specific trip detail with days and items
router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const client = getSupabaseUserClient(req.token!);
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

    if (daysError) throw daysError;

    let daysWithItems = [];
    if (days && days.length > 0) {
      const dayIds = days.map(d => d.id);
      const { data: items, error: itemsError } = await client
        .from('itinerary_items')
        .select('*')
        .in('day_id', dayIds)
        .order('order_index', { ascending: true });

      if (itemsError) throw itemsError;

      // Dynamically match and enrich partner information for pre-existing itinerary items
      let enrichedItems = items || [];
      try {
        const { data: partners } = await supabaseAdmin
          .from('partners')
          .select('*')
          .eq('active_status', true);

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

      daysWithItems = days.map(day => ({
        ...day,
        items: enrichedItems.filter((item: any) => item.day_id === day.id)
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
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to retrieve trip details', details: error.message });
  }
});

// POST /api/trips - Create a new trip and generate AI itinerary
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const client = getSupabaseUserClient(req.token!);
  
  const {
    title,
    destination_city,
    start_date,
    end_date,
    budget_total,
    traveler_count,
    traveler_type,
    preferences,
    health_conditions,
    special_requirements
  } = req.body;

  if (!destination_city || !start_date || !end_date || !budget_total) {
    return res.status(400).json({ error: 'Missing required parameters: destination_city, start_date, end_date, budget_total' });
  }

  try {
    // 1. Resolve coordinates
    const { lat, lng } = getCityCoordinates(destination_city);

    // 2. Fetch weather
    const weatherForecast = await getWeatherForecast(lat, lng, start_date, end_date);

    // 3. Search real candidate places in the background
    const queries = buildDynamicSearchQueries(preferences);
    const [accommodations, dining, attractions, rentals, { extraDining, extraAttractions }] = await Promise.all([
      searchPlaces(queries.accommodationQuery, 'accommodation', lat, lng),
      searchPlaces(queries.diningQuery, 'dining', lat, lng),
      searchPlaces(queries.attractionQuery, 'attraction', lat, lng),
      searchPlaces(queries.rentalQuery, 'rental', lat, lng),
      fetchDynamicCandidates(special_requirements || '', title || '', lat, lng, destination_city)
    ]);

    // Fetch relevant partners and merge them
    const relevantPartners = await getRelevantPartners(
      destination_city,
      lat,
      lng,
      preferences || {},
      parseFloat(budget_total) || 0,
      start_date,
      end_date,
      parseInt(traveler_count || '1')
    );
    const partnerCandidates = convertPartnersToPlaceCandidates(relevantPartners);

    const mergedAccommodations = deduplicatePlaces([...partnerCandidates.filter(p => p.category === 'accommodation'), ...accommodations]);
    const mergedDining = deduplicatePlaces([...extraDining, ...partnerCandidates.filter(p => p.category === 'dining'), ...dining]);
    const mergedAttractions = deduplicatePlaces([...extraAttractions, ...partnerCandidates.filter(p => p.category === 'attraction'), ...attractions]);
    const mergedRentals = deduplicatePlaces([...partnerCandidates.filter(p => p.category === 'rental'), ...rentals]);

    const candidatePlaces = {
      accommodation: mergedAccommodations,
      dining: mergedDining,
      attraction: mergedAttractions,
      rental: mergedRentals
    };

    // 4. Generate AI itinerary using Gemini
    const itinerary = await generateItinerary(req.body, weatherForecast, candidatePlaces);

    // 5. Save trip to Supabase
    const { data: trip, error: tripError } = await client
      .from('trips')
      .insert({
        user_id: req.user!.id,
        title: title || `Chuyến đi ${destination_city}`,
        destination_city,
        destination_province: destination_city,
        start_date,
        end_date,
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

    // 6. Save itinerary days
    const daysToInsert = itinerary.days.map(d => ({
      trip_id: trip.id,
      day_number: d.day_number,
      date: d.date,
      weather_summary: { note: d.weather_note }
    }));

    const { data: dbDays, error: daysError } = await client
      .from('itinerary_days')
      .insert(daysToInsert)
      .select();

    if (daysError || !dbDays) {
      throw daysError || new Error('Failed to insert itinerary days');
    }

    // 7. Save itinerary items
    const itemsToInsert: any[] = [];
    itinerary.days.forEach(day => {
      const dbDay = dbDays.find(d => Number(d.day_number) === Number(day.day_number));
      if (!dbDay) return;

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
          day_id: dbDay.id,
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

    if (itemsToInsert.length > 0) {
      const { error: itemsError } = await client
        .from('itinerary_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // Log partner booking events
      for (const item of itemsToInsert) {
        if (item.google_place_id && item.google_place_id.startsWith('partner_')) {
          const partnerId = item.google_place_id.replace('partner_', '');
          await logPartnerEvent(partnerId, 'booking', trip.id, req.user!.id, { item_type: item.item_type });
        }
      }
    }

    // Log impressions for all partner candidates sent to AI
    for (const partner of relevantPartners) {
      await logPartnerEvent(partner.id, 'impression', trip.id, req.user!.id, {});
    }

    // Fetch the full assembled trip details to return
    const { data: fullTrip, error: fetchError } = await client
      .from('trips')
      .select('*')
      .eq('id', trip.id)
      .single();

    const dbDaysWithItems = dbDays
      .sort((a, b) => a.day_number - b.day_number)
      .map(day => ({
        ...day,
        items: itemsToInsert.filter(item => item.day_id === day.id)
      }));

    return res.status(201).json({
      ...fullTrip,
      days: dbDaysWithItems
    });
  } catch (error: any) {
    console.error('Error generating trip:', error);
    return res.status(500).json({ error: 'Failed to create trip and generate itinerary', details: error.message });
  }
});

// PUT /api/trips/:id - Edit trip details (e.g. status)
router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const client = getSupabaseUserClient(req.token!);
  const tripId = req.params.id;

  try {
    const { data: trip, error } = await client
      .from('trips')
      .update(req.body)
      .eq('id', tripId)
      .select()
      .single();

    if (error) throw error;
    return res.json(trip);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update trip metadata', details: error.message });
  }
});

// DELETE /api/trips/:id - Delete a trip
router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const client = getSupabaseUserClient(req.token!);
  const tripId = req.params.id;

  try {
    const { error } = await client
      .from('trips')
      .delete()
      .eq('id', tripId);

    if (error) throw error;
    return res.json({ success: true, message: 'Trip deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to delete trip', details: error.message });
  }
});

// 1. POST /api/trips/:id/disruptions/preview - Gợi ý lịch trình thích ứng (Chưa lưu DB)
router.post('/:id/disruptions/preview', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const client = getSupabaseUserClient(req.token!);
  const tripId = req.params.id;
  const { disruption_type, description, day_id } = req.body;

  if (!disruption_type || !description) {
    return res.status(400).json({ error: 'disruption_type and description are required' });
  }

  try {
    // A. Lấy thông tin chuyến đi và lịch trình hiện tại
    const { data: trip, error: tripError } = await client.from('trips').select('*').eq('id', tripId).single();
    if (tripError || !trip) return res.status(404).json({ error: 'Trip not found' });

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
    
    const queries = buildDynamicSearchQueries(trip.preferences);
    const combinedRequirements = [trip.special_requirements, description].filter(Boolean).join('\n');
    const [accommodations, dining, attractions, rentals, { extraDining, extraAttractions }] = await Promise.all([
      searchPlaces(queries.accommodationQuery, 'accommodation', lat, lng),
      searchPlaces(queries.diningQuery, 'dining', lat, lng),
      searchPlaces(queries.attractionQuery, 'attraction', lat, lng),
      searchPlaces(queries.rentalQuery, 'rental', lat, lng),
      fetchDynamicCandidates(combinedRequirements, trip.title || '', lat, lng, trip.destination_city)
    ]);
    
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

    const mergedAccommodations = deduplicatePlaces([...partnerCandidates.filter(p => p.category === 'accommodation'), ...accommodations]);
    const mergedDining = deduplicatePlaces([...extraDining, ...partnerCandidates.filter(p => p.category === 'dining'), ...dining]);
    const mergedAttractions = deduplicatePlaces([...extraAttractions, ...partnerCandidates.filter(p => p.category === 'attraction'), ...attractions]);
    const mergedRentals = deduplicatePlaces([...partnerCandidates.filter(p => p.category === 'rental'), ...rentals]);

    const candidatePlaces = { 
      accommodation: mergedAccommodations, 
      dining: mergedDining, 
      attraction: mergedAttractions, 
      rental: mergedRentals 
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
router.post('/:id/disruptions/apply', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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

    // E. Đánh dấu hoạt động cũ là replaced
    const affectedDays = dbDays.filter(d => Number(d.day_number) >= affectedDayNumber);
    const affectedDayIds = affectedDays.map(d => d.id);

    if (affectedDayIds.length > 0) {
      const { error: updateError } = await client
        .from('itinerary_items')
        .update({ status: 'replaced' })
        .in('day_id', affectedDayIds)
        .eq('status', 'planned');

      if (updateError) throw updateError;
    }

    // F. Lấy tọa độ để fallback
    const { data: trip } = await client.from('trips').select('*').eq('id', tripId).single();
    const city = trip?.destination_city || 'Da Nang';
    const { lat, lng } = getCityCoordinates(city);

    // Fetch partners list to match booking_url
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

    // G. Chèn các hoạt động thay thế đã chọn
    const itemsToInsert: any[] = [];
    selected_items.forEach((item: any) => {
      // Tìm đúng ngày trong database
      const dbDay = dbDays.find(d => Number(d.day_number) === Number(item.day_number));
      if (!dbDay) return;

      let itemBookingUrl = item.booking_url || null;
      if (item.google_place_id && item.google_place_id.startsWith('partner_')) {
        const matched = relevantPartners.find(p => `partner_${p.id}` === item.google_place_id);
        if (matched) {
          itemBookingUrl = matched.booking_url || null;
        }
      }

      itemsToInsert.push({
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

    if (itemsToInsert.length > 0) {
      const { error: insertError } = await client
        .from('itinerary_items')
        .insert(itemsToInsert);

      if (insertError) throw insertError;

      // Log partner booking events for applied alternative items
      for (const item of itemsToInsert) {
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

// 3. PUT /api/trips/items/:itemId - Sửa hoạt động thủ công (Sửa tay)
router.put('/items/:itemId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
router.delete('/items/:itemId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
router.post('/items/:itemId/ai-replace', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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

export default router;

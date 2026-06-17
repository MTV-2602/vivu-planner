import axios from 'axios';
import { supabaseAdmin } from './supabaseAdmin';

export interface PlaceCandidate {
  google_place_id: string;
  name: string;
  category: 'accommodation' | 'dining' | 'attraction' | 'rental';
  lat: number;
  lng: number;
  rating: number;
  price_level: number;
  address: string;
  booking_url?: string;
}

const VIETNAM_PROVINCES: Record<string, { lat: number; lng: number }> = {
  'hanoi': { lat: 21.0285, lng: 105.8542 },
  'da nang': { lat: 16.0544, lng: 108.2022 },
  'ho chi minh': { lat: 10.8231, lng: 106.6297 },
  'hoi an': { lat: 15.8801, lng: 108.3380 },
  'hue': { lat: 16.4637, lng: 107.5908 },
  'nha trang': { lat: 12.2388, lng: 109.1967 },
  'da lat': { lat: 11.9404, lng: 108.4583 },
  'phu quoc': { lat: 10.2899, lng: 103.9840 },
  'sapa': { lat: 22.3364, lng: 103.8438 },
  'ninh binh': { lat: 20.2506, lng: 105.9745 },
  'vung tau': { lat: 10.3460, lng: 107.0843 }
};

export function getCityCoordinates(city: string): { lat: number; lng: number } {
  const normalized = city.toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  for (const key of Object.keys(VIETNAM_PROVINCES)) {
    const keyNormalized = key.replace(/\s+/g, '');
    if (normalized.includes(keyNormalized)) {
      return VIETNAM_PROVINCES[key];
    }
  }
  return { lat: 16.0544, lng: 108.2022 }; // Fallback to Da Nang
}

async function searchPlacesOSM(
  query: string,
  category: 'accommodation' | 'dining' | 'attraction' | 'rental',
  lat: number,
  lng: number
): Promise<PlaceCandidate[]> {
  try {
    // 1. Try querying Supabase places_cache table first
    const geoDelta = 0.25;
    const { data: cachedItems, error: cacheError } = await supabaseAdmin
      .from('places_cache')
      .select('*')
      .eq('category', category)
      .gte('lat', lat - geoDelta)
      .lte('lat', lat + geoDelta)
      .gte('lng', lng - geoDelta)
      .lte('lng', lng + geoDelta)
      .limit(50);

    if (!cacheError && cachedItems && cachedItems.length > 0) {
      let filtered = cachedItems.map(item => ({
        google_place_id: item.google_place_id,
        name: item.name || 'Địa điểm không tên',
        category: item.category as any,
        lat: item.lat || lat,
        lng: item.lng || lng,
        rating: Number(item.rating) || 4.5,
        price_level: item.price_level || 2,
        address: item.address || ''
      }));

      if (query) {
        const queryClean = query.trim().toLowerCase();
        filtered = filtered.filter(item => 
          item.name.toLowerCase().includes(queryClean) ||
          item.address.toLowerCase().includes(queryClean)
        );
      }

      if (filtered.length >= 3) {
        console.log(`[placesService] Cache HIT (Geo Box) for category ${category}, query: "${query}". Found ${filtered.length} items.`);
        return filtered.slice(0, 10);
      }
    }

    // 2. Try query-name search in Supabase places_cache if query is specific
    if (query && query.trim().length > 2) {
      const queryClean = query.trim().toLowerCase();
      const { data: nameMatches, error: nameError } = await supabaseAdmin
        .from('places_cache')
        .select('*')
        .eq('category', category)
        .ilike('name', `%${queryClean}%`)
        .limit(10);

      if (!nameError && nameMatches && nameMatches.length >= 3) {
        console.log(`[placesService] Cache HIT (Name Search) for category ${category}, query: "${query}". Found ${nameMatches.length} items.`);
        return nameMatches.map(item => ({
          google_place_id: item.google_place_id,
          name: item.name || 'Địa điểm không tên',
          category: item.category as any,
          lat: item.lat || lat,
          lng: item.lng || lng,
          rating: Number(item.rating) || 4.5,
          price_level: item.price_level || 2,
          address: item.address || ''
        }));
      }
    }

    // 3. Cache Miss — Query Nominatim OSM with a low timeout (2000ms)
    console.log(`[placesService] Cache MISS. Querying Nominatim for category ${category}, query: "${query}"...`);
    const delta = 0.15;
    const viewbox = `${lng - delta},${lat + delta},${lng + delta},${lat - delta}`;
    
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: query || category,
        format: 'json',
        addressdetails: 1,
        limit: 10,
        countrycodes: 'vn',
        viewbox: viewbox,
        bounded: 0
      },
      headers: {
        'User-Agent': 'ViVu-Planner-App/1.0 (team89a6@gmail.com)'
      },
      timeout: 2000
    });

    const items = response.data || [];
    const candidates: PlaceCandidate[] = [];

    for (const item of items) {
      const displayName = item.display_name || '';
      const name = displayName.split(',')[0] || 'Địa điểm không tên';
      
      const candidate: PlaceCandidate = {
        google_place_id: `osm-${item.osm_type || 'place'}-${item.osm_id || item.place_id}`,
        name: name.trim(),
        category,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        rating: parseFloat((4.0 + Math.random() * 0.9).toFixed(1)),
        price_level: 2,
        address: displayName
      };

      candidates.push(candidate);

      supabaseAdmin
        .from('places_cache')
        .upsert(
          {
            google_place_id: candidate.google_place_id,
            name: candidate.name,
            category: candidate.category,
            lat: candidate.lat,
            lng: candidate.lng,
            rating: candidate.rating,
            price_level: candidate.price_level,
            address: candidate.address,
            raw_data: item,
            cached_at: new Date().toISOString()
          },
          { onConflict: 'google_place_id' }
        )
        .then(({ error }) => {
          if (error) console.error('Error caching OSM place:', error.message);
        });
    }

    return candidates;
  } catch (error: any) {
    console.warn(`[placesService] OSM search places failed or timed out: ${error.message}. Returning empty list.`);
    return [];
  }
}

export async function searchPlaces(
  query: string,
  category: 'accommodation' | 'dining' | 'attraction' | 'rental',
  lat: number,
  lng: number
): Promise<PlaceCandidate[]> {
  return searchPlacesOSM(query, category, lat, lng);
}

export async function fetchCandidatePlacesForCity(
  city: string,
  lat: number,
  lng: number,
  preferences: any = {},
  specialRequirements: string = '',
  title: string = ''
): Promise<{
  accommodation: PlaceCandidate[];
  dining: PlaceCandidate[];
  attraction: PlaceCandidate[];
  rental: PlaceCandidate[];
}> {
  try {
    // Quét nhanh tất cả các địa điểm thuộc khu vực thành phố này từ cơ sở dữ liệu cache (vùng bán kính geoDelta)
    const geoDelta = 0.25;
    const { data: cachedItems, error } = await supabaseAdmin
      .from('places_cache')
      .select('*')
      .gte('lat', lat - geoDelta)
      .lte('lat', lat + geoDelta)
      .gte('lng', lng - geoDelta)
      .lte('lng', lng + geoDelta)
      .limit(150);

    if (!error && cachedItems && cachedItems.length >= 10) {
      console.log(`[placesService] Batch Cache HIT cho thành phố "${city}". Tìm thấy ${cachedItems.length} địa điểm trong DB.`);
      
      const accommodation: PlaceCandidate[] = [];
      const dining: PlaceCandidate[] = [];
      const attraction: PlaceCandidate[] = [];
      const rental: PlaceCandidate[] = [];

      cachedItems.forEach(item => {
        const candidate: PlaceCandidate = {
          google_place_id: item.google_place_id,
          name: item.name || 'Địa điểm không tên',
          category: (item.category || 'attraction') as any,
          lat: item.lat || lat,
          lng: item.lng || lng,
          rating: Number(item.rating) || 4.5,
          price_level: item.price_level || 2,
          address: item.address || ''
        };

        if (candidate.category === 'accommodation') accommodation.push(candidate);
        else if (candidate.category === 'dining') dining.push(candidate);
        else if (candidate.category === 'attraction') attraction.push(candidate);
        else if (candidate.category === 'rental') rental.push(candidate);
      });

      const lowerReq = (specialRequirements + ' ' + title).toLowerCase();
      if (lowerReq.trim().length > 2) {
        const filterByKeyword = (list: PlaceCandidate[]) => {
          return list.sort((a, b) => {
            const aMatch = a.name.toLowerCase().split(' ').some(w => w.length > 2 && lowerReq.includes(w)) ? 1 : 0;
            const bMatch = b.name.toLowerCase().split(' ').some(w => w.length > 2 && lowerReq.includes(w)) ? 1 : 0;
            return bMatch - aMatch;
          });
        };
        filterByKeyword(dining);
        filterByKeyword(attraction);
      }

      return { accommodation, dining, attraction, rental };
    }
  } catch (err: any) {
    console.warn('[placesService] Failed to load batch cache from DB:', err.message);
  }

  // Nếu không có cache, trả về mảng rỗng để Gemini hoàn toàn tự do thiết kế địa điểm theo thời gian thực
  console.log(`[placesService] Batch Cache MISS cho thành phố "${city}". Trả về mảng trống để Gemini tự do thiết kế lịch trình thực tế...`);
  return {
    accommodation: [],
    dining: [],
    attraction: [],
    rental: []
  };
}

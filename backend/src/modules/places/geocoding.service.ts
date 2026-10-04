import axios from 'axios';
import { supabaseAdmin } from '../../config/supabase';
import { getCityCoordinates } from './places.service';
import { getNextGeminiApiKey } from '../../utils/keyManager';
import { GoogleGenAI } from '@google/genai';

export interface GeocodeResult {
  lat: number;
  lng: number;
  address?: string;
  found: boolean;
  source: 'cache' | 'photon' | 'gemini_geo' | 'city_center';
}

const memoryGeocodeCache = new Map<string, GeocodeResult>();

function cleanSearchTerm(term: string): string {
  return term
    .replace(/^(quán|tiệm|nhà hàng|tiệm cà phê|quán cà phê|cà phê|cafe|bún|phở|bánh mì|khách sạn|hotel|resort|homestay)\s+/i, '')
    .trim();
}

/**
 * Tra cứu tọa độ địa lý trực tuyến động 100% cho bất kỳ địa danh nào ở bất kỳ tỉnh thành nào
 * Tuyệt đối không hard-code danh sách tĩnh
 */
export async function geocodeOnline(name: string, address?: string, cityName?: string): Promise<GeocodeResult> {
  const city = cityName || 'Việt Nam';
  const cityCoords = getCityCoordinates(city);
  const cacheKey = `${name.toLowerCase().trim()}_${(address || '').toLowerCase().trim()}_${city.toLowerCase()}`;

  // 1. Kiểm tra In-memory cache
  if (memoryGeocodeCache.has(cacheKey)) {
    return memoryGeocodeCache.get(cacheKey)!;
  }

  // 2. Kiểm tra database cache
  try {
    const cleanName = name.trim().toLowerCase();
    const { data: cached } = await supabaseAdmin
      .from('places_cache')
      .select('lat, lng, address')
      .ilike('name', `%${cleanName}%`)
      .limit(1);

    if (cached && cached.length > 0 && cached[0].lat && cached[0].lng) {
      const res: GeocodeResult = {
        lat: Number(cached[0].lat),
        lng: Number(cached[0].lng),
        address: cached[0].address || address,
        found: true,
        source: 'cache'
      };
      memoryGeocodeCache.set(cacheKey, res);
      return res;
    }
  } catch (err: any) {
    // ignore
  }

  // 3. Tầng 1: Photon Komoot Geocoder API (Chuyên OpenStreetMap toàn cầu, không bị rate-limit)
  const queriesToTry = [
    `${name} ${city}`,
    `${cleanSearchTerm(name)} ${city}`,
    address ? `${name} ${address}` : '',
  ].filter(Boolean);

  for (const query of queriesToTry) {
    try {
      const resp = await axios.get('https://photon.komoot.io/api/', {
        params: {
          q: query,
          limit: 5,
          lang: 'vi',
          lat: cityCoords.lat,
          lon: cityCoords.lng,
          zoom: 12,
        },
        timeout: 3000
      });

      const features = resp.data?.features || [];
      for (const feat of features) {
        const coords = feat.geometry?.coordinates; // [lng, lat]
        if (Array.isArray(coords) && coords.length >= 2) {
          const lng = Number(coords[0]);
          const lat = Number(coords[1]);

          // Kiểm tra tính hợp lý (nằm trong bán kính ~25km quanh tâm tỉnh/thành)
          const dist = Math.sqrt(Math.pow(lat - cityCoords.lat, 2) + Math.pow(lng - cityCoords.lng, 2));
          if (dist <= 0.25) {
            const props = feat.properties || {};
            const resolvedAddress = [props.street, props.district, props.city, city]
              .filter(Boolean)
              .join(', ') || props.name || address;

            const res: GeocodeResult = {
              lat,
              lng,
              address: resolvedAddress,
              found: true,
              source: 'photon'
            };
            memoryGeocodeCache.set(cacheKey, res);

            // Cache vào Supabase
            supabaseAdmin.from('places_cache').upsert({
              google_place_id: `photon-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              name: name.trim(),
              category: 'attraction',
              lat,
              lng,
              rating: 4.7,
              price_level: 2,
              address: resolvedAddress,
              cached_at: new Date().toISOString()
            }, { onConflict: 'google_place_id' }).then(() => {});

            return res;
          }
        }
      }
    } catch (e: any) {
      // Tiếp tục query kế tiếp
    }
  }

  // 4. Tầng 2: Gemini AI Geocoding Resolver (Dành cho quán xá ngõ hẻm đặc thù Việt Nam)
  try {
    const apiKey = await getNextGeminiApiKey();
    if (apiKey) {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Bạn là hệ thống Geocoding bản đồ Việt Nam.
Hãy cho biết tọa độ GPS chính xác (vĩ độ latitude, kinh độ longitude) và địa chỉ thực tế của địa điểm: "${name}" tại thành phố: "${city}".
Tâm thành phố tham chiếu: lat ${cityCoords.lat}, lng ${cityCoords.lng}.

Yêu cầu:
- Trả về DUY NHẤT một chuỗi JSON hợp lệ theo định dạng:
{ "lat": 12.345678, "lng": 109.123456, "address": "Số nhà, đường, phường, quận/thành phố" }
- Tọa độ BẮT BUỘC PHẢI CHUẨN XÁC theo địa lý thực tế tại ${city}, không bịa đặt, không để 0.`;

      const aiResp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      });

      const parsed = JSON.parse(aiResp.text || '{}');
      const lat = Number(parsed.lat);
      const lng = Number(parsed.lng);

      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        const dist = Math.sqrt(Math.pow(lat - cityCoords.lat, 2) + Math.pow(lng - cityCoords.lng, 2));
        if (dist <= 0.25) {
          const res: GeocodeResult = {
            lat,
            lng,
            address: parsed.address || address,
            found: true,
            source: 'gemini_geo'
          };
          memoryGeocodeCache.set(cacheKey, res);

          supabaseAdmin.from('places_cache').upsert({
            google_place_id: `ai-geo-${Date.now()}`,
            name: name.trim(),
            category: 'attraction',
            lat,
            lng,
            rating: 4.8,
            price_level: 2,
            address: parsed.address || address,
            cached_at: new Date().toISOString()
          }, { onConflict: 'google_place_id' }).then(() => {});

          return res;
        }
      }
    }
  } catch (err: any) {
    // ignore
  }

  // 5. Fallback cuối cùng nếu không tìm thấy bất kỳ nguồn nào
  const fallback: GeocodeResult = {
    lat: cityCoords.lat,
    lng: cityCoords.lng,
    address: address || `${name}, ${city}`,
    found: false,
    source: 'city_center'
  };
  memoryGeocodeCache.set(cacheKey, fallback);
  return fallback;
}

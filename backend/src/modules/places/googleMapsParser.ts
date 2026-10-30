import axios from 'axios';
import { geocodeOnline } from './geocoding.service';

export interface ParsedGoogleMapsLocation {
  name: string;
  lat: number;
  lng: number;
  address?: string;
  category: 'dining' | 'cafe' | 'hotel' | 'attraction' | 'other';
  rawUrl: string;
  resolvedUrl?: string;
}

function detectCategory(name: string): 'dining' | 'cafe' | 'hotel' | 'attraction' | 'other' {
  const lower = name.toLowerCase();
  if (/(cà phê|cafe|coffee|tea|trà sữa|roastery|brew)/i.test(lower)) return 'cafe';
  if (/(quán|nhà hàng|phở|bún|bánh mì|cơm|ẩm thực|lẩu|nướng|bbq|kitchen|restaurant|bistro|eatery)/i.test(lower)) return 'dining';
  if (/(khách sạn|hotel|homestay|resort|hostel|villa|apartment|nhà nghỉ)/i.test(lower)) return 'hotel';
  if (/(chùa|nhà thờ|bảo tàng|công viên|quảng trường|thác|hồ|núi|di tích|tháp|bãi biển|vườn hoa|view|đền)/i.test(lower)) return 'attraction';
  return 'attraction';
}

export async function parseGoogleMapsUrl(inputUrl: string): Promise<ParsedGoogleMapsLocation | null> {
  if (!inputUrl || typeof inputUrl !== 'string') return null;
  const cleanUrl = inputUrl.trim();

  let targetUrl = cleanUrl;

  // Nếu là link rút gọn maps.app.goo.gl hoặc goo.gl/maps, truy vấn để lấy URL redirect cuối cùng
  if (/goo\.gl|maps\.app\.goo\.gl/i.test(cleanUrl)) {
    try {
      const resp = await axios.get(cleanUrl, {
        maxRedirects: 5,
        timeout: 7000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'vi,en;q=0.9',
        },
        validateStatus: () => true, // bắt mọi status code kể cả redirect
      });
      // @ts-ignore
      targetUrl = resp.request?.res?.responseUrl || resp.headers?.location || cleanUrl;
    } catch (e: any) {
      console.warn('[parseGoogleMapsUrl] Could not expand short link:', e.message);
    }
  }

  let lat: number | null = null;
  let lng: number | null = null;
  let extractedName = '';

  // 1. Trích xuất tên từ slug /place/Tên+Địa+Điểm/
  const placeMatch = targetUrl.match(/\/place\/([^/@?]+)/);
  if (placeMatch && placeMatch[1]) {
    try {
      extractedName = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
    } catch (e) {
      extractedName = placeMatch[1].replace(/\+/g, ' ').trim();
    }
  }

  // 2. Trích xuất tọa độ từ chuỗi @lat,lng
  const atCoordsMatch = targetUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atCoordsMatch) {
    lat = parseFloat(atCoordsMatch[1]);
    lng = parseFloat(atCoordsMatch[2]);
  }

  // 3. Nếu chưa có, thử match !3dlat!4dlng (thường có trong Google Maps place detail URLs)
  if (lat === null || lng === null) {
    const dataCoordsMatch = targetUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (dataCoordsMatch) {
      lat = parseFloat(dataCoordsMatch[1]);
      lng = parseFloat(dataCoordsMatch[2]);
    }
  }

  // 4. Nếu chưa có, thử match query params ?q=lat,lng hoặc &ll=lat,lng
  if (lat === null || lng === null) {
    const qCoordsMatch = targetUrl.match(/[?&](?:q|ll|query)=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qCoordsMatch) {
      lat = parseFloat(qCoordsMatch[1]);
      lng = parseFloat(qCoordsMatch[2]);
    }
  }

  // 5. Nếu chưa có tên nhưng có query param q=...
  if (!extractedName) {
    const qNameMatch = targetUrl.match(/[?&]q=([^&]+)/);
    if (qNameMatch && qNameMatch[1] && !/^-?\d+\.\d+,-?\d+\.\d+$/.test(qNameMatch[1])) {
      try {
        extractedName = decodeURIComponent(qNameMatch[1].replace(/\+/g, ' ')).trim();
      } catch (e) {
        extractedName = qNameMatch[1].replace(/\+/g, ' ').trim();
      }
    }
  }

  // Nếu tìm thấy tên nhưng chưa có tọa độ, hoặc ngược lại, gọi geocodeOnline để bổ sung
  let resolvedAddress = '';
  if (extractedName && (lat === null || lng === null)) {
    try {
      const geo = await geocodeOnline(extractedName);
      if (geo.found && geo.lat && geo.lng) {
        lat = geo.lat;
        lng = geo.lng;
        resolvedAddress = geo.address || '';
      }
    } catch (e) {}
  } else if (lat !== null && lng !== null && !resolvedAddress) {
    // Nếu đã có tọa độ nhưng chưa có địa chỉ rõ ràng
    resolvedAddress = extractedName ? `${extractedName}` : `Tọa độ: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }

  if (lat === null || lng === null) {
    if (!extractedName) return null;
    // Tối thiểu có tên
    lat = 21.0285;
    lng = 105.8542; // default HN
  }

  const finalName = extractedName || 'Địa điểm từ Google Maps';

  return {
    name: finalName,
    lat,
    lng,
    address: resolvedAddress,
    category: detectCategory(finalName),
    rawUrl: inputUrl,
    resolvedUrl: targetUrl !== inputUrl ? targetUrl : undefined,
  };
}

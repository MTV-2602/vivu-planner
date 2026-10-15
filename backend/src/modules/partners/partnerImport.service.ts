import axios from 'axios';
import * as xlsx from 'xlsx';
import { supabaseAdmin, isDbMocked } from '../../config/supabase';
import { getCityCoordinates } from '../places/places.service';

export interface PartnerInput {
  name: string;
  category: 'hotel' | 'homestay' | 'resort' | 'restaurant' | 'cafe' | 'attraction' | 'transport' | 'experience';
  city: string;
  district?: string;
  address: string;
  lat: number | null;
  lng: number | null;
  price_level: number;
  admin_rating: number;
  active_status?: boolean;
  priority?: number;
  partner_priority?: number;
  tags?: string[];
  cuisine_tags?: string[];
  amenity_tags?: string[];
  dietary_safe?: string[];
  opening_hours?: string;
  avg_duration_minutes?: number;
  social_review_quote?: string;
  social_review_url?: string;
  website_url?: string;
  booking_url?: string;
  description?: string;
  i18n?: Record<string, any>;
}

export function partnerImportKey(record: { name: string; city: string; address?: string }): string {
  const normalize = (value: string) => value.trim().toLowerCase().normalize('NFC').replace(/\s+/g, ' ');
  return [record.name, record.city, record.address || ''].map(normalize).join(':::');
}

export interface ImportQualityReport {
  total: number;
  verified: number;
  unresolved: number;
  unresolvedReasons: Record<string, number>;
  coordinateSources: {
    google_maps_pin: number;
    unresolved: number;
  };
}

export interface ImportPartnersResult {
  success: number;
  staged: number;
  failed: number;
  skipped: number;
  errors: string[];
  cityCounts: Record<string, number>;
  stagedCityCounts?: Record<string, number>;
  qualityReport: ImportQualityReport;
}

export const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'Hồ Chí Minh': { lat: 10.7769, lng: 106.7009 },
  'Hà Nội': { lat: 21.0285, lng: 105.8542 },
  'Đà Nẵng': { lat: 16.0544, lng: 108.2022 },
  'Hội An': { lat: 15.8801, lng: 108.3380 },
  'Huế': { lat: 16.4637, lng: 107.5908 },
  'Đà Lạt': { lat: 11.9404, lng: 108.4583 },
  'Nha Trang': { lat: 12.2388, lng: 109.1967 },
  'Phú Quốc': { lat: 10.2899, lng: 103.9840 },
  'Sa Pa': { lat: 22.3364, lng: 103.8438 },
  'Vũng Tàu': { lat: 10.3460, lng: 107.0843 },
  'Quy Nhơn': { lat: 13.7820, lng: 109.2190 },
  'Phan Thiết': { lat: 10.9288, lng: 108.1021 },
  'Ninh Bình': { lat: 20.2506, lng: 105.9745 },
  'Phú Yên': { lat: 13.0882, lng: 109.3086 },
  'Lý Sơn': { lat: 15.3789, lng: 109.1172 },
  'Vĩnh Hy': { lat: 11.7144, lng: 109.1936 },
  'Hà Giang': { lat: 22.8233, lng: 104.9839 },
  'Mộc Châu': { lat: 20.8436, lng: 104.6322 },
  'Đắk Lắk': { lat: 12.6667, lng: 108.0500 },
};

export function getFallbackCoordinatesForCity(city: string): { lat: number; lng: number } {
  if (CITY_COORDINATES[city]) {
    return { ...CITY_COORDINATES[city] };
  }
  return getCityCoordinates(city);
}

export function normalizePartnerCity(rawCity: string, address?: string, name?: string): string {
  const c = (rawCity || '').trim();
  const detail = `${address || ''} ${name || ''}`.toLowerCase();

  if (c.includes('Phú Quốc')) return 'Phú Quốc';
  if (c.includes('Quy Nhơn')) return 'Quy Nhơn';
  if (c.includes('Phan Thiết') || c.includes('Mũi Né')) return 'Phan Thiết';

  if (c.includes('Đà Nẵng') && c.includes('Hội An')) {
    if (detail.includes('hội an') || detail.includes('an bàng') || detail.includes('old town')) {
      return 'Hội An';
    }
    return 'Đà Nẵng';
  }
  if (c.includes('Đà Nẵng')) return 'Đà Nẵng';
  if (c.includes('Hội An')) return 'Hội An';
  if (c.includes('Đắk Lắk')) return 'Đắk Lắk';
  if (c.includes('Hà Nội')) return 'Hà Nội';
  if (c.includes('Hồ Chí Minh')) return 'Hồ Chí Minh';
  if (c.includes('Huế')) return 'Huế';
  if (c.includes('Nha Trang')) return 'Nha Trang';
  if (c.includes('Đà Lạt')) return 'Đà Lạt';
  if (c.includes('Sa Pa') || c.includes('Sapa')) return 'Sa Pa';
  if (c.includes('Ninh Bình')) return 'Ninh Bình';
  if (c.includes('Vĩnh Hy')) return 'Vĩnh Hy';
  if (c.includes('Phú Yên')) return 'Phú Yên';
  if (c.includes('Lý Son') || c.includes('Lý Sơn')) return 'Lý Sơn';
  if (c.includes('Mộc Châu')) return 'Mộc Châu';
  if (c.includes('Hà Giang')) return 'Hà Giang';
  if (c.includes('Vũng Tàu')) return 'Vũng Tàu';

  // Fallback map từ detail nếu rawCity không rõ
  if (detail.includes('phú quốc')) return 'Phú Quốc';
  if (detail.includes('quy nhơn')) return 'Quy Nhơn';
  if (detail.includes('phan thiết') || detail.includes('mũi né')) return 'Phan Thiết';
  if (detail.includes('hội an')) return 'Hội An';
  if (detail.includes('đà nẵng')) return 'Đà Nẵng';
  if (detail.includes('hà nội')) return 'Hà Nội';
  if (detail.includes('hồ chí minh') || detail.includes('sài gòn')) return 'Hồ Chí Minh';
  if (detail.includes('huế')) return 'Huế';
  if (detail.includes('nha trang')) return 'Nha Trang';
  if (detail.includes('đà lạt')) return 'Đà Lạt';
  if (detail.includes('sa pa')) return 'Sa Pa';
  if (detail.includes('ninh bình')) return 'Ninh Bình';
  if (detail.includes('vĩnh hy')) return 'Vĩnh Hy';
  if (detail.includes('phú yên')) return 'Phú Yên';
  if (detail.includes('lý sơn')) return 'Lý Sơn';
  if (detail.includes('mộc châu')) return 'Mộc Châu';
  if (detail.includes('hà giang')) return 'Hà Giang';
  if (detail.includes('vũng tàu')) return 'Vũng Tàu';

  return c || 'Đà Nẵng';
}

function formatExcelTime(val: any): string {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'number') {
    const totalMinutes = Math.round(val * 24 * 60);
    const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
    const hours = Math.floor(normalizedMinutes / 60);
    const minutes = normalizedMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  const str = String(val).trim();
  if (!isNaN(Number(str)) && str !== '') {
    const num = Number(str);
    if (num >= 0 && num < 1) {
      const totalMinutes = Math.round(num * 24 * 60);
      const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
      const hours = Math.floor(normalizedMinutes / 60);
      const minutes = normalizedMinutes % 60;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }
  return str;
}

export function parseOpeningHours(openRaw: any, closeRaw: any): string {
  const openStr = formatExcelTime(openRaw);
  const closeStr = formatExcelTime(closeRaw);

  if (openStr && closeStr) {
    if (openStr.includes(':') && closeStr.includes(':') && !openStr.includes('\n')) {
      return `${openStr} - ${closeStr}`;
    }
  }

  if (openStr) {
    return openStr;
  }

  return '07:00 - 22:00';
}

export function parseVndPrice(priceRaw: any): { priceLevel: number; originalText: string } {
  if (priceRaw === undefined || priceRaw === null || priceRaw === '') {
    return { priceLevel: 2, originalText: 'Khoảng giá tiêu chuẩn' };
  }

  const rawStr = String(priceRaw).trim();
  if (rawStr.toLowerCase().includes('không có') || rawStr === '') {
    return { priceLevel: 2, originalText: rawStr };
  }

  // Tách các con số trong chuỗi VNĐ (loại bỏ dấu . và , ngăn cách hàng nghìn)
  const cleanTokens = rawStr.replace(/[.,](?=\d{3})/g, '');
  const numbers = cleanTokens.match(/\d+/g)?.map(Number).filter(n => !isNaN(n)) || [];

  if (numbers.length === 0) {
    return { priceLevel: 2, originalText: rawStr };
  }

  // Lọc ra các số có ý nghĩa (bỏ các số 0, 1, 2 đơn thuần đại diện cho min tượng trưng)
  const significantNumbers = numbers.filter(n => n >= 1000);
  let evalPrice = 0;

  if (significantNumbers.length >= 2) {
    const min = Math.min(...significantNumbers);
    const max = Math.max(...significantNumbers);
    evalPrice = (min + max) / 2;
  } else if (significantNumbers.length === 1) {
    // Nếu có 1 số >= 1000 và có số nhỏ phía trước (ví dụ 1 - 100.000)
    if (numbers.length > 1 && numbers[0] < 1000) {
      evalPrice = significantNumbers[0] / 2;
    } else {
      evalPrice = significantNumbers[0];
    }
  } else {
    // Nếu chỉ có các số nhỏ như 1-100k
    evalPrice = numbers[numbers.length - 1];
  }

  let priceLevel = 2;
  if (evalPrice <= 100000) {
    priceLevel = 1;
  } else if (evalPrice < 300000) {
    priceLevel = 2;
  } else if (evalPrice < 800000) {
    priceLevel = 3;
  } else {
    priceLevel = 4;
  }

  return { priceLevel, originalText: rawStr };
}

export function parseDurationMinutes(durRaw: any): number {
  if (durRaw === undefined || durRaw === null) return 60;
  const rawStr = String(durRaw).trim();
  if (rawStr.toLowerCase().includes('không có') || rawStr === '') return 60;

  // Lấy các số (hỗ trợ số thực như 0.5, 1.5, 2.5)
  const numbers = rawStr.match(/\d+(?:\.\d+)?/g)?.map(Number).filter(n => !isNaN(n)) || [];
  if (numbers.length === 0) return 60;

  // Tránh giá trị lỗi Excel như 46082
  const validHours = numbers.filter(n => n > 0 && n <= 12);
  if (validHours.length === 0) return 60;

  let avgHours = 1;
  if (validHours.length >= 2) {
    avgHours = (Math.min(...validHours) + Math.max(...validHours)) / 2;
  } else {
    avgHours = validHours[0];
  }

  const minutes = Math.round(avgHours * 60);
  return Math.max(30, Math.min(240, minutes));
}

export function parseRating(ratingRaw: any): { rating: number; originalRating: number; reviewCount: number } {
  if (!ratingRaw) {
    return { rating: 4, originalRating: 4.5, reviewCount: 0 };
  }

  const rawStr = String(ratingRaw).trim();
  const match = rawStr.match(/^(\d+(?:[\.,]\d+)?)\s*(?:\(([\d\.,]+)\))?/);
  if (!match) {
    return { rating: 4, originalRating: 4.5, reviewCount: 0 };
  }

  const floatRating = parseFloat(match[1].replace(',', '.'));
  let reviewCount = 0;
  if (match[2]) {
    reviewCount = parseInt(match[2].replace(/[.,]/g, ''), 10) || 0;
  }

  const adminRating = Math.min(5, Math.max(1, Math.round(floatRating)));
  return { rating: adminRating, originalRating: floatRating, reviewCount };
}

export const ALLOWED_GOOGLE_MAPS_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'google.com',
  'www.google.com',
  'maps.google.com',
  'google.com.vn',
  'www.google.com.vn',
  'maps.google.com.vn'
]);

export function isAllowedGoogleMapsHost(hostname: string): boolean {
  if (!hostname || typeof hostname !== 'string') return false;
  const host = hostname.toLowerCase().trim();
  return ALLOWED_GOOGLE_MAPS_HOSTS.has(host);
}

export function isPrivateOrReservedHost(hostname: string): boolean {
  if (!hostname || typeof hostname !== 'string') return true;
  const host = hostname.toLowerCase().trim();
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return true;

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const o1 = Number(ipv4Match[1]);
    const o2 = Number(ipv4Match[2]);
    if (o1 === 127) return true; // Loopback
    if (o1 === 10) return true;  // 10.0.0.0/8
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16.0.0/12
    if (o1 === 192 && o2 === 168) return true; // 192.168.0.0/16
    if (o1 === 169 && o2 === 254) return true; // Link-local
    if (o1 === 0) return true;
  }
  return false;
}

export function hasControlOrEscapedChars(str: string): boolean {
  if (!str || typeof str !== 'string') return false;

  // 1. Ký tự điều khiển thô (ASCII 0x00-0x1F, 0x7F)
  if (/[\x00-\x1f\x7f]/.test(str)) {
    return true;
  }

  // 2. Ký tự điều khiển percent-encoded (%00-%1F, %7F, case-insensitive) và multi-encoded (%2500, etc.)
  if (/%(?:25)*(?:0[0-9a-fA-F]|1[0-9a-fA-F]|7[fF])/i.test(str)) {
    return true;
  }

  // 3. Ký tự điều khiển escaped (\0, \r, \n, \t, \b, \f, \v, \x00-\x1F, \u0000-\u001F, \u007F)
  if (/\\[0bfnrtv]|\\x(?:25)*(?:0[0-9a-fA-F]|1[0-9a-fA-F]|7[fF])|\\u(?:25)*(?:00(?:0[0-9a-fA-F]|1[0-9a-fA-F]|7[fF])|\{(?:[01]?[0-9a-fA-F]|7[fF])\})/i.test(str)) {
    return true;
  }

  return false;
}

export function validateMapsUrl(rawUrl: string): { valid: boolean; urlObj?: URL; error?: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'empty_url' };
  }

  // Chặn ký tự điều khiển thô, escaped hoặc percent-encoded để ngăn ngừa CRLF injection / header injection
  if (hasControlOrEscapedChars(rawUrl)) {
    return { valid: false, error: 'control_characters_not_allowed' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, error: 'invalid_url_format' };
  }

  // Kiểm tra lại các thành phần sau khi parse để tránh bypass
  if (hasControlOrEscapedChars(parsed.href) || hasControlOrEscapedChars(parsed.pathname) || hasControlOrEscapedChars(parsed.search)) {
    return { valid: false, error: 'control_characters_not_allowed' };
  }

  // Chặn giao thức không phải HTTPS
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'non_https_protocol' };
  }

  // Chặn thông tin xác thực userinfo trong URL
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'userinfo_not_allowed' };
  }

  // Chặn IP nội bộ, loopback, metadata cloud
  if (isPrivateOrReservedHost(parsed.hostname)) {
    return { valid: false, error: 'private_ip_blocked' };
  }

  // Chặn cổng không chuẩn (chỉ cho phép cổng 443 hoặc rỗng mặc định)
  if (parsed.port && parsed.port !== '443') {
    return { valid: false, error: 'invalid_port' };
  }

  // Kiểm soát danh sách host Maps được Google sở hữu chính xác
  if (!isAllowedGoogleMapsHost(parsed.hostname)) {
    return { valid: false, error: 'host_not_allowlisted' };
  }

  // Kiểm soát đường dẫn Maps hợp lệ
  const host = parsed.hostname.toLowerCase().trim();
  const pathname = parsed.pathname;

  if (host === 'goo.gl') {
    if (pathname !== '/maps' && !pathname.startsWith('/maps/')) {
      return { valid: false, error: 'invalid_maps_path' };
    }
  } else if (host === 'maps.app.goo.gl') {
    if (!pathname || pathname === '/' || pathname.length < 2) {
      return { valid: false, error: 'missing_shortlink_path' };
    }
  } else if (host === 'google.com' || host === 'www.google.com' || host === 'google.com.vn' || host === 'www.google.com.vn') {
    // Trên google.com / www.google.com, chỉ cho phép đường dẫn /maps với exact segment boundary (chặn /mapsEvil, /search, /drive, /mail)
    if (pathname !== '/maps' && !pathname.startsWith('/maps/')) {
      return { valid: false, error: 'invalid_maps_path' };
    }
  } else if (host === 'maps.google.com' || host === 'maps.google.com.vn') {
    // Trên maps.google.com, chỉ cho phép các path thuộc nền tảng Maps với exact segment boundary:
    // /, /maps, /place, /search, /dir, /timeline, /local, hoặc /@lat,lng
    const isMapsPlatformPath = pathname === '/' ||
      pathname === '/maps' || pathname.startsWith('/maps/') ||
      pathname === '/place' || pathname.startsWith('/place/') ||
      pathname === '/search' || pathname.startsWith('/search/') ||
      pathname === '/dir' || pathname.startsWith('/dir/') ||
      pathname === '/timeline' || pathname.startsWith('/timeline/') ||
      pathname === '/local' || pathname.startsWith('/local/') ||
      pathname.startsWith('/@');
    if (!isMapsPlatformPath) {
      return { valid: false, error: 'invalid_maps_path' };
    }
  }

  return { valid: true, urlObj: parsed };
}

export function extractCoordinatesFromUrl(url: string): { lat: number; lng: number } | null {
  if (!url || typeof url !== 'string') return null;

  // Xác thực URL bằng validateMapsUrl trước khi trích xuất pin
  // Ngăn chặn các URL độc hại/untrusted mang !3d!4d đạt trạng thái verified
  const validation = validateMapsUrl(url);
  if (!validation.valid) {
    return null;
  }

  // Strict PIN-ONLY: pattern !3d... !4d... (chính xác nhất cho venue PIN location)
  // Viewport/camera @lat,lng hoặc query search ?q=lat,lng KHÔNG ĐƯỢC coi là venue pin
  const matches = Array.from(url.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g));
  if (matches.length === 0) {
    return null;
  }

  const firstLat = parseFloat(matches[0][1]);
  const firstLng = parseFloat(matches[0][2]);

  // Kiểm tra hữu hạn và giới hạn tọa độ: lat [-90, 90], lng [-180, 180]
  if (!Number.isFinite(firstLat) || !Number.isFinite(firstLng)) {
    return null;
  }
  if (firstLat < -90 || firstLat > 90 || firstLng < -180 || firstLng > 180) {
    return null;
  }
  // Loại trừ Null Island (0, 0)
  if (firstLat === 0 && firstLng === 0) {
    return null;
  }

  // Nếu có nhiều pin trong URL, từ chối nếu chúng xung đột (khác nhau)
  for (let i = 1; i < matches.length; i++) {
    const curLat = parseFloat(matches[i][1]);
    const curLng = parseFloat(matches[i][2]);
    if (!Number.isFinite(curLat) || !Number.isFinite(curLng)) {
      return null;
    }
    if (curLat < -90 || curLat > 90 || curLng < -180 || curLng > 180) {
      return null;
    }
    if (Math.abs(curLat - firstLat) > 1e-6 || Math.abs(curLng - firstLng) > 1e-6) {
      return null; // Conflicting pins
    }
  }

  return { lat: firstLat, lng: firstLng };
}

export async function resolveGoogleMapsVenuePin(
  rawUrl: string,
  maxHops: number = 5,
  timeoutMs: number = 5000
): Promise<{
  coords: { lat: number; lng: number } | null;
  finalUrl?: string;
  reason?: string;
  pinProvenance?: 'direct_pin' | 'redirect_pin' | 'canonical_pin';
}> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { coords: null, reason: 'missing_url' };
  }

  // 1. Kiểm tra trực tiếp URL đầu vào nếu đã có sẵn venue pin !3d!4d
  const directMatch = extractCoordinatesFromUrl(rawUrl);
  if (directMatch) {
    return { coords: directMatch, finalUrl: rawUrl, pinProvenance: 'direct_pin' };
  }

  const initialValidation = validateMapsUrl(rawUrl);
  if (!initialValidation.valid) {
    return { coords: null, reason: initialValidation.error || 'untrusted_input_url' };
  }

  let currentUrl = rawUrl.trim();

  // 2. Lần lượt theo dõi chuyển hướng (hops) với kiểm tra SSRF nghiêm ngặt ở mỗi chặng
  for (let hop = 0; hop < maxHops; hop++) {
    const validation = validateMapsUrl(currentUrl);
    if (!validation.valid || !validation.urlObj) {
      return { coords: null, reason: validation.error || 'unauthorized_redirect' };
    }

    try {
      const response = await axios.get(currentUrl, {
        maxRedirects: 0,
        timeout: timeoutMs,
        responseType: 'text',
        maxContentLength: 65536, // Giới hạn 64KB tránh cạn kiệt bộ nhớ
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        validateStatus: (status) => (status >= 200 && status < 400)
      });

      // Xử lý HTTP Redirect 3xx
      if (response.status >= 300 && response.status < 400) {
        const rawLocationHeader = response.headers?.location;
        if (!rawLocationHeader) {
          return { coords: null, reason: 'redirect_missing_location' };
        }

        const locationHeader = Array.isArray(rawLocationHeader) ? rawLocationHeader[0] : String(rawLocationHeader);

        // Chặn ký tự điều khiển thô (tab, CR, LF, null byte) hoặc percent-encoded TRƯỚC KHI tạo đối tượng URL,
        // ngăn chặn WHATWG URL constructor tự động loại bỏ / chuẩn hóa ký tự điều khiển
        if (hasControlOrEscapedChars(locationHeader)) {
          return { coords: null, reason: 'redirect_target_invalid: control_characters_not_allowed' };
        }

        let nextUrl: string;
        try {
          nextUrl = new URL(locationHeader, currentUrl).toString();
        } catch {
          return { coords: null, reason: 'redirect_target_invalid: invalid_url_format' };
        }

        const nextValidation = validateMapsUrl(nextUrl);
        if (!nextValidation.valid) {
          return { coords: null, reason: `redirect_target_invalid: ${nextValidation.error}` };
        }

        // Kiểm tra xem pin !3d!4d đã xuất hiện ngay trên header Location chưa
        const locationPin = extractCoordinatesFromUrl(nextUrl);
        if (locationPin) {
          return { coords: locationPin, finalUrl: nextUrl, pinProvenance: 'redirect_pin' };
        }

        currentUrl = nextUrl;
        continue;
      }

      // Xử lý HTTP 200 OK
      const finalUrl = response.config?.url || currentUrl;
      const finalValidation = validateMapsUrl(finalUrl);
      if (finalValidation.valid) {
        const urlPin = extractCoordinatesFromUrl(finalUrl);
        if (urlPin) {
          return { coords: urlPin, finalUrl, pinProvenance: 'redirect_pin' };
        }
      }

      // Chỉ chấp nhận pin từ thẻ canonical hoặc og:url chứa trusted Google Maps URL trong HTML
      if (typeof response.data === 'string') {
        const canonicalMatch = response.data.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
                               response.data.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
        if (canonicalMatch && canonicalMatch[1]) {
          const canonicalUrl = canonicalMatch[1].trim();
          const validCanonical = validateMapsUrl(canonicalUrl);
          if (validCanonical.valid) {
            const canonicalPin = extractCoordinatesFromUrl(canonicalUrl);
            if (canonicalPin) {
              return { coords: canonicalPin, finalUrl: canonicalUrl, pinProvenance: 'canonical_pin' };
            }
          }
        }
      }

      return { coords: null, finalUrl, reason: 'no_venue_pin_found' };
    } catch (err: any) {
      return { coords: null, reason: `fetch_error: ${err.code || err.message}` };
    }
  }

  return { coords: null, reason: 'too_many_redirects' };
}

export function verifyRecordPinEvidence(record: PartnerInput): { verified: boolean; reason?: string } {
  if (!record.i18n?.location_verified) {
    return { verified: false, reason: record.i18n?.unresolved_reason || 'not_marked_verified' };
  }
  if (record.i18n?.coordinate_source !== 'google_maps_pin') {
    return { verified: false, reason: 'invalid_coordinate_source' };
  }

  // Yêu cầu URL tin cậy từ resolved_maps_url, source_maps_url hoặc booking_url
  const targetUrl = record.i18n?.resolved_maps_url || record.i18n?.source_maps_url || record.booking_url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return { verified: false, reason: 'missing_trusted_pin_url' };
  }

  const validation = validateMapsUrl(targetUrl);
  if (!validation.valid) {
    return { verified: false, reason: `untrusted_url: ${validation.error}` };
  }

  // Trích xuất pin từ URL tin cậy
  const pin = extractCoordinatesFromUrl(targetUrl);
  if (!pin) {
    return { verified: false, reason: 'no_matching_pin_in_url' };
  }

  // Tọa độ của bản ghi phải khớp với pin từ URL trong ngưỡng cho phép (khoảng ~11m)
  if (record.lat === null || record.lng === null || !Number.isFinite(record.lat) || !Number.isFinite(record.lng) || Math.abs(pin.lat - record.lat) > 1e-4 || Math.abs(pin.lng - record.lng) > 1e-4) {
    return { verified: false, reason: 'coordinates_mismatch_with_pin' };
  }

  return { verified: true };
}

export async function resolveGoogleMapsCoordinates(url: string): Promise<{ lat: number; lng: number } | null> {
  const result = await resolveGoogleMapsVenuePin(url);
  return result.coords;
}

export async function parsePartnerExcel(
  filePathOrBuffer: string | Buffer,
  options?: { resolveCoords?: boolean; concurrency?: number }
): Promise<PartnerInput[]> {
  let workbook: xlsx.WorkBook;
  if (typeof filePathOrBuffer === 'string') {
    workbook = xlsx.readFile(filePathOrBuffer);
  } else {
    workbook = xlsx.read(filePathOrBuffer, { type: 'buffer' });
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const rawRows: any[] = xlsx.utils.sheet_to_json(sheet);
  const results: PartnerInput[] = [];

  for (const row of rawRows) {
    const name = String(row['Tên'] || '').trim();
    if (!name) continue;

    const rawCity = String(row['Tỉnh/ Thành phố'] || '');
    const address = String(row['Vị trí'] || '').trim() || name;
    const city = normalizePartnerCity(rawCity, address, name);
    const tag = String(row['Tag'] || '').trim();
    const mapUrl = String(row['Google Maps'] || '').trim();

    // Chuẩn hóa danh mục (Category) & Tags
    let category: PartnerInput['category'] = 'attraction';
    let tags: string[] = ['pro'];
    let cuisineTags: string[] = [];
    let amenityTags: string[] = [];

    const lowerTag = tag.toLowerCase();
    const lowerName = name.toLowerCase();

    if (lowerTag.includes('ăn uống local') || lowerTag.includes('local food')) {
      category = 'restaurant';
      tags.push('restaurant', 'local_food', 'am_thuc_dia_phuong');
      cuisineTags.push('local_food', 'am_thuc_dia_phuong');
    } else if (lowerTag.includes('ăn uống') || lowerTag.includes('dining')) {
      category = 'restaurant';
      tags.push('restaurant', 'dining');
      cuisineTags.push('dining');
    } else if (lowerTag.includes('cà phê') || lowerTag.includes('cafe') || lowerTag.includes('coffee')) {
      category = 'cafe';
      tags.push('cafe', 'coffee');
      amenityTags.push('cafe');
    } else if (lowerTag.includes('lưu trú') || lowerTag.includes('hotel') || lowerTag.includes('khách sạn')) {
      if (lowerName.includes('homestay') || address.toLowerCase().includes('homestay')) {
        category = 'homestay';
        tags.push('homestay', 'accommodation');
      } else {
        category = 'hotel';
        tags.push('hotel', 'accommodation');
      }
      amenityTags.push('accommodation');
    } else if (lowerTag.includes('vui chơi') || lowerTag.includes('attraction') || lowerTag.includes('giải trí')) {
      category = 'attraction';
      tags.push('attraction', 'entertainment');
      amenityTags.push('entertainment');
    } else {
      category = 'attraction';
      tags.push('attraction');
    }

    // Giá
    const { priceLevel, originalText: originalPrice } = parseVndPrice(row['Trung bình giá/ pax (VNĐ)']);

    // Giờ mở / đóng cửa
    const openingHours = parseOpeningHours(row['Giờ mở cửa (GMT +7)'], row['Giờ đóng cửa (GMT +7)']);

    // Thời lượng
    const avgDurationMinutes = parseDurationMinutes(row['Thời gian ước lượng (giờ)']);

    // Rating
    const ratingColKey = Object.keys(row).find(k => k.toLowerCase().includes('rating')) || 'Rating';
    const { rating: adminRating, originalRating, reviewCount } = parseRating(row[ratingColKey]);

    // Fallback tọa độ
    const directPin = mapUrl ? extractCoordinatesFromUrl(mapUrl) : null;
    const hasPin = Boolean(directPin);
    const lat = directPin ? directPin.lat : null;
    const lng = directPin ? directPin.lng : null;
    const locationVerified = hasPin;
    const coordinateSource = hasPin ? 'google_maps_pin' : 'unresolved';
    const unresolvedReason = hasPin ? undefined : (mapUrl ? 'coords_not_resolved' : 'no_maps_url');
    const activeStatus = hasPin; // Chỉ kích hoạt khi đã xác minh được venue pin hợp lệ

    // Xây dựng quote và description
    const priceQuote = (originalPrice && !originalPrice.toLowerCase().includes('không có'))
      ? `Giá tham khảo: ${originalPrice} VNĐ/khách`
      : null;

    const description = priceQuote
      ? `${priceQuote}. Địa điểm từ kho dữ liệu địa phương.`
      : 'Địa điểm từ kho dữ liệu địa phương.';

    const menuOnMaps = String(row['Menu trên gg maps'] || '').trim();

    results.push({
      name,
      category,
      city,
      address,
      lat,
      lng,
      price_level: priceLevel,
      admin_rating: adminRating,
      active_status: activeStatus,
      priority: 5,
      partner_priority: 5,
      tags: Array.from(new Set(tags)),
      cuisine_tags: cuisineTags,
      amenity_tags: amenityTags,
      dietary_safe: [],
      opening_hours: openingHours,
      avg_duration_minutes: avgDurationMinutes,
      social_review_quote: priceQuote || undefined,
      social_review_url: mapUrl || undefined,
      booking_url: mapUrl || undefined,
      website_url: mapUrl || undefined,
      description,
      i18n: {
        source_type: 'local_data',
        source_sheet: sheetName,
        source_tag: tag,
        raw_city: rawCity,
        original_price: originalPrice,
        original_rating: originalRating,
        review_count: reviewCount,
        has_menu_on_maps: menuOnMaps === 'Có',
        is_pro_partner: true,
        pro_benefit: 'Dữ liệu địa phương cho AI Pro',
        location_verified: locationVerified,
        coordinate_source: coordinateSource,
        source_maps_url: mapUrl || undefined,
        ...(directPin ? {
          resolved_maps_url: mapUrl,
          resolved_lat: directPin.lat,
          resolved_lng: directPin.lng,
          pin_provenance: 'direct_pin'
        } : {}),
        ...(unresolvedReason ? { unresolved_reason: unresolvedReason } : {})
      }
    });
  }

  // Tùy chọn resolve tọa độ ngay trong bước parse
  if (options?.resolveCoords) {
    const concurrency = options.concurrency || 8;
    const chunks: PartnerInput[][] = [];
    for (let i = 0; i < results.length; i += concurrency) {
      chunks.push(results.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async record => {
          if (record.i18n?.location_verified) return;
          const url = record.i18n?.source_maps_url || record.booking_url;
          if (url) {
            const res = await resolveGoogleMapsVenuePin(url);
            if (res.coords) {
              record.lat = res.coords.lat;
              record.lng = res.coords.lng;
              record.i18n = record.i18n || {};
              record.i18n.location_verified = true;
              record.i18n.coordinate_source = 'google_maps_pin';
              record.i18n.source_maps_url = url;
              record.i18n.resolved_maps_url = res.finalUrl || url;
              record.i18n.resolved_lat = res.coords.lat;
              record.i18n.resolved_lng = res.coords.lng;
              record.i18n.pin_provenance = res.pinProvenance || (res.finalUrl && res.finalUrl !== url ? 'redirect_pin' : 'direct_pin');
              delete record.i18n.unresolved_reason;
              record.active_status = true;
            } else {
              record.i18n = record.i18n || {};
              record.i18n.location_verified = false;
              record.i18n.coordinate_source = 'unresolved';
              record.i18n.unresolved_reason = res.reason || 'no_venue_pin_found';
              if (res.finalUrl) {
                record.i18n.resolved_maps_url = res.finalUrl;
              }
              record.active_status = false;
            }
          }
        })
      );
    }
  }

  return results;
}

export async function importPartners(
  records: PartnerInput[],
  options?: {
    resolveCoords?: boolean;
    concurrency?: number;
    dryRun?: boolean;
    updateExisting?: boolean;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<ImportPartnersResult> {
  const shouldResolve = options?.resolveCoords !== false;
  const concurrency = options?.concurrency || 8;
  const total = records.length;

  // 1. Resolve tọa độ qua Google Maps cho các bản ghi chưa được xác minh
  if (shouldResolve) {
    let completed = 0;
    const chunks: PartnerInput[][] = [];
    for (let i = 0; i < records.length; i += concurrency) {
      chunks.push(records.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async record => {
          if (!record.i18n?.location_verified) {
            const url = record.i18n?.source_maps_url || record.booking_url;
            if (url) {
              const res = await resolveGoogleMapsVenuePin(url);
              if (res.coords) {
                record.lat = res.coords.lat;
                record.lng = res.coords.lng;
                record.i18n = record.i18n || {};
                record.i18n.location_verified = true;
                record.i18n.coordinate_source = 'google_maps_pin';
                record.i18n.source_maps_url = url;
                record.i18n.resolved_maps_url = res.finalUrl || url;
                record.i18n.resolved_lat = res.coords.lat;
                record.i18n.resolved_lng = res.coords.lng;
                record.i18n.pin_provenance = res.pinProvenance || (res.finalUrl && res.finalUrl !== url ? 'redirect_pin' : 'direct_pin');
                delete record.i18n.unresolved_reason;
                record.active_status = true;
              } else {
                record.i18n = record.i18n || {};
                record.i18n.location_verified = false;
                record.i18n.coordinate_source = 'unresolved';
                record.i18n.unresolved_reason = res.reason || 'no_venue_pin_found';
                if (res.finalUrl) {
                  record.i18n.resolved_maps_url = res.finalUrl;
                }
                record.active_status = false;
              }
            } else {
              record.i18n = record.i18n || {};
              record.i18n.location_verified = false;
              record.i18n.coordinate_source = 'unresolved';
              record.i18n.unresolved_reason = 'no_maps_url';
              record.active_status = false;
            }
          }
          completed++;
          if (options?.onProgress) {
            options.onProgress(completed, total);
          }
        })
      );
    }
  }

  // 2. Chống giả mạo cờ xác minh: kiểm chứng bằng chứng pin cho tất cả các bản ghi đánh dấu location_verified
  for (const record of records) {
    if (record.i18n?.location_verified) {
      const check = verifyRecordPinEvidence(record);
      if (!check.verified) {
        record.i18n = record.i18n || {};
        record.i18n.location_verified = false;
        record.i18n.coordinate_source = 'unresolved';
        record.i18n.unresolved_reason = check.reason || 'spoofed_verification_rejected';
        record.active_status = false;
      }
    }
  }

  // 3. Thống kê chất lượng tọa độ
  const verifiedRecords = records.filter(r => r.i18n?.location_verified === true);
  const unresolvedRecords = records.filter(r => r.i18n?.location_verified !== true);
  for (const record of unresolvedRecords) {
    record.lat = null;
    record.lng = null;
    record.active_status = false;
  }

  const unresolvedReasons: Record<string, number> = {};
  for (const r of unresolvedRecords) {
    const reason = r.i18n?.unresolved_reason || 'unresolved';
    unresolvedReasons[reason] = (unresolvedReasons[reason] || 0) + 1;
  }

  const qualityReport: ImportQualityReport = {
    total: records.length,
    verified: verifiedRecords.length,
    unresolved: unresolvedRecords.length,
    unresolvedReasons,
    coordinateSources: {
      google_maps_pin: verifiedRecords.length,
      unresolved: unresolvedRecords.length
    }
  };

  const stagedCityCounts: Record<string, number> = {};
  verifiedRecords.forEach(r => {
    stagedCityCounts[r.city] = (stagedCityCounts[r.city] || 0) + 1;
  });

  // 4. Xử lý Mock DB hoặc Dry Run:
  // success ĐỒNG NGHĨA VỚI SỐ DÒNG THỰC SỰ ĐƯỢC GHI VÀO DB.
  // Khi dryRun = true hoặc isDbMocked = true, KHÔNG CÓ DÒNG NÀO ĐƯỢC GHI VÀO DB -> success = 0!
  // Báo cáo chất lượng cho biết các điểm đã xác minh; cả success và staged đều bằng 0 khi chưa ghi.
  if (isDbMocked || options?.dryRun) {
    return {
      success: 0,
      staged: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      cityCounts: {},
      stagedCityCounts,
      qualityReport
    };
  }

  // 4. So khớp dữ liệu hiện có để nạp lại không ghi đè chỉnh sửa của admin.
  const { data: existingPartners, error: fetchErr } = await supabaseAdmin
    .from('partners')
    .select('id, name, city, address');

  if (fetchErr) {
    throw new Error(`Không thể kiểm tra dữ liệu trùng: ${fetchErr.message}`);
  }

  const existingMap = new Map<string, string>();
  if (existingPartners) {
    existingPartners.forEach((p: any) => {
      const key = partnerImportKey(p);
      existingMap.set(key, p.id);
    });
  }

  let success = 0;
  let staged = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];
  const cityCounts: Record<string, number> = {};

  // 5. Lưu điểm có pin thật; lưu điểm chưa xác minh tắt với tọa độ null để admin sửa.
  const uniqueRecords = [...new Map(records.map(record => [partnerImportKey(record), record])).values()];
  skipped += records.length - uniqueRecords.length;
  const BATCH_SIZE = 8;
  for (let i = 0; i < uniqueRecords.length; i += BATCH_SIZE) {
    const batch = uniqueRecords.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async item => {
      try {
        const key = partnerImportKey(item);
        const existingId = existingMap.get(key);
        if (existingId && options?.updateExisting !== true) { skipped++; return; }

        const payload: any = {
          name: item.name,
          category: item.category,
          city: item.city,
          address: item.address,
          lat: item.lat,
          lng: item.lng,
          price_level: item.price_level,
          admin_rating: item.admin_rating,
          active_status: item.i18n?.location_verified === true && item.active_status !== false,
          priority: item.priority || 5,
          partner_priority: item.partner_priority || 5,
          tags: item.tags || ['pro'],
          cuisine_tags: item.cuisine_tags || [],
          amenity_tags: item.amenity_tags || [],
          dietary_safe: item.dietary_safe || [],
          opening_hours: item.opening_hours || '07:00 - 22:00',
          avg_duration_minutes: item.avg_duration_minutes || 60,
          social_review_quote: item.social_review_quote || null,
          social_review_url: item.social_review_url || null,
          booking_url: item.booking_url || null,
          website_url: item.website_url || null,
          description: item.description || null,
          i18n: item.i18n || {},
          updated_at: new Date().toISOString()
        };

        if (existingId) {
          const { error: updateErr } = await supabaseAdmin
            .from('partners')
            .update(payload)
            .eq('id', existingId);

          if (updateErr) throw updateErr;
        } else {
          const { data: inserted, error: insertErr } = await supabaseAdmin
            .from('partners')
            .insert([payload]).select('id').single();

          if (insertErr) throw insertErr;
          if (inserted) existingMap.set(key, inserted.id);
        }

        if (item.i18n?.location_verified === true) success++;
        else staged++;
        cityCounts[item.city] = (cityCounts[item.city] || 0) + 1;
      } catch (err: any) {
        failed++;
        errors.push(`[${item.name} - ${item.city}]: ${err.message || String(err)}`);
      }
    }));
  }

  return {
    success,
    staged,
    failed,
    skipped,
    errors,
    cityCounts,
    stagedCityCounts,
    qualityReport
  };
}

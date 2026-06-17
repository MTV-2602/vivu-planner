"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCityCoordinates = getCityCoordinates;
exports.searchPlaces = searchPlaces;
const axios_1 = __importDefault(require("axios"));
const supabaseAdmin_1 = require("./supabaseAdmin");
// Rich mock places library for Vietnam cities to run without a Google Maps API Key
const MOCK_PLACES_LIBRARY = {
    'hanoi': {
        accommodation: [
            { name: 'Hanoi La Siesta Hotel & Spa', rating: 4.8, price_level: 3, address: '94 Mã Mây, Hàng Buồm, Hoàn Kiếm, Hà Nội' },
            { name: 'Sofitel Legend Metropole Hanoi', rating: 4.9, price_level: 4, address: '15 Ngô Quyền, Tràng Tiền, Hoàn Kiếm, Hà Nội' },
            { name: 'Little Hanoi Deluxe Hotel', rating: 4.6, price_level: 2, address: '1 Hàng Gai, Hoàn Kiếm, Hà Nội' },
            { name: 'Old Quarter Homestay', rating: 4.4, price_level: 1, address: '36 Hàng Bè, Hàng Bạc, Hoàn Kiếm, Hà Nội' }
        ],
        dining: [
            { name: 'Bún Chả Hương Liên (Obama Bun Cha)', rating: 4.5, price_level: 2, address: '24 Lê Văn Hưu, Phan Chu Trinh, Hai Bà Trưng, Hà Nội' },
            { name: 'Phở Thìn Lò Đúc', rating: 4.3, price_level: 1, address: '13 Lò Đúc, Phạm Đình Hổ, Hai Bà Trưng, Hà Nội' },
            { name: 'Nhà hàng Ngon', rating: 4.4, price_level: 2, address: '26 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội' },
            { name: 'Giang Cafe (Cà phê trứng)', rating: 4.6, price_level: 1, address: '39 Nguyễn Hữu Huân, Lý Thái Tổ, Hoàn Kiếm, Hà Nội' }
        ],
        attraction: [
            { name: 'Hồ Hoàn Kiếm và Đền Ngọc Sơn', rating: 4.7, price_level: 1, address: 'Đinh Tiên Hoàng, Hàng Trống, Hoàn Kiếm, Hà Nội' },
            { name: 'Lăng Chủ tịch Hồ Chí Minh', rating: 4.8, price_level: 1, address: 'Hùng Vương, Điện Biên, Ba Đình, Hà Nội' },
            { name: 'Văn Miếu - Quốc Tử Giám', rating: 4.7, price_level: 1, address: '58 Quốc Tử Giám, Văn Miếu, Đống Đa, Hà Nội' },
            { name: 'Nhà tù Hỏa Lò', rating: 4.6, price_level: 1, address: '1 Hỏa Lò, Trần Hưng Đạo, Hoàn Kiếm, Hà Nội' }
        ],
        rental: [
            { name: 'Thuê xe máy Gia Hưng Hà Nội', rating: 4.5, price_level: 1, address: '41 Ngõ 115 Nguyễn Lương Bằng, Đống Đa, Hà Nội' },
            { name: 'Hanoi Motorbike Rental - Phùng Hưng', rating: 4.7, price_level: 1, address: '135 Phùng Hưng, Cửa Đông, Hoàn Kiếm, Hà Nội' }
        ]
    },
    'da nang': {
        accommodation: [
            { name: 'InterContinental Danang Sun Peninsula Resort', rating: 4.9, price_level: 4, address: 'Bãi Bắc, Bán đảo Sơn Trà, Đà Nẵng' },
            { name: 'Sala Danang Beach Hotel', rating: 4.7, price_level: 2, address: '36 Lâm Hoành, Phước Mỹ, Sơn Trà, Đà Nẵng' },
            { name: 'Haian Beach Hotel & Spa', rating: 4.6, price_level: 2, address: '278 Võ Nguyên Giáp, Mỹ An, Ngũ Hành Sơn, Đà Nẵng' },
            { name: 'Minh House Homestay', rating: 4.5, price_level: 1, address: '104 Tô Hiến Thành, Phước Mỹ, Sơn Trà, Đà Nẵng' }
        ],
        dining: [
            { name: 'Mỳ Quảng Ếch Bếp Trang', rating: 4.4, price_level: 2, address: '24 Lê Hồng Phong, Phước Ninh, Hải Châu, Đà Nẵng' },
            { name: 'Bánh xèo Bà Dưỡng', rating: 4.3, price_level: 1, address: 'K280/23 Hoàng Diệu, Bình Hiên, Hải Châu, Đà Nẵng' },
            { name: 'Hải sản Năm Đảnh', rating: 4.2, price_level: 1, address: 'K139/H59/38 Trần Quang Khải, Thọ Quang, Sơn Trà, Đà Nẵng' },
            { name: 'Nhà hàng Cá Lửa', rating: 4.5, price_level: 3, address: '04 Bình Minh 4, Bình Hiên, Hải Châu, Đà Nẵng' }
        ],
        attraction: [
            { name: 'Bán đảo Sơn Trà & Chùa Linh Ứng', rating: 4.8, price_level: 1, address: 'Sơn Trà, Đà Nẵng' },
            { name: 'Cầu Vàng (Bà Nà Hills)', rating: 4.7, price_level: 4, address: 'Hòa Phú, Hòa Vang, Đà Nẵng' },
            { name: 'Ngũ Hành Sơn', rating: 4.6, price_level: 1, address: '81 Huyền Trân Công Chúa, Hòa Hải, Ngũ Hành Sơn, Đà Nẵng' },
            { name: 'Cầu Rồng Đà Nẵng', rating: 4.8, price_level: 1, address: 'An Hải Tây, Sơn Trà, Đà Nẵng' }
        ],
        rental: [
            { name: 'Cho thuê xe máy Đà Nẵng Gia Huy', rating: 4.6, price_level: 1, address: '126/6 Trần Cao Vân, Tam Thuận, Thanh Khê, Đà Nẵng' },
            { name: 'Thuê xe tự lái Da Nang Travel Car', rating: 4.8, price_level: 2, address: '10 Bùi Tá Hán, Khuê Mỹ, Ngũ Hành Sơn, Đà Nẵng' }
        ]
    },
    'ho chi minh': {
        accommodation: [
            { name: 'The Reverie Saigon', rating: 4.9, price_level: 4, address: '22-36 Nguyễn Huệ, Bến Nghé, Quận 1, TP. HCM' },
            { name: 'Silverland Sakyo Hotel', rating: 4.6, price_level: 2, address: '10A Lê Thánh Tôn, Bến Nghé, Quận 1, TP. HCM' },
            { name: 'Fusion Suites Saigon', rating: 4.5, price_level: 2, address: '3-5 Sương Nguyệt Ánh, Bến Thành, Quận 1, TP. HCM' },
            { name: 'The Common Room Homestay', rating: 4.3, price_level: 1, address: '80/8 Nguyễn Trãi, Phường 3, Quận 5, TP. HCM' }
        ],
        dining: [
            { name: 'Cục Gạch Quán', rating: 4.4, price_level: 3, address: '10 Đặng Tất, Tân Định, Quận 1, TP. HCM' },
            { name: 'Phở Lệ', rating: 4.3, price_level: 1, address: '415 Nguyễn Trãi, Phường 7, Quận 5, TP. HCM' },
            { name: 'Bánh Mì Huỳnh Hoa', rating: 4.5, price_level: 1, address: '26 Lê Thị Riêng, Phạm Ngũ Lão, Quận 1, TP. HCM' },
            { name: 'Nhà hàng ngon SHÂN', rating: 4.4, price_level: 2, address: '88 Nguyễn Huệ, Bến Nghé, Quận 1, TP. HCM' }
        ],
        attraction: [
            { name: 'Dinh Độc Lập', rating: 4.6, price_level: 1, address: '135 Nam Kỳ Khởi Nghĩa, Bến Thành, Quận 1, TP. HCM' },
            { name: 'Bưu điện Trung tâm Thành phố', rating: 4.5, price_level: 1, address: '02 Công xã Paris, Bến Nghé, Quận 1, TP. HCM' },
            { name: 'Bảo tàng Chứng tích Chiến tranh', rating: 4.7, price_level: 1, address: '28 Võ Văn Tần, Võ Thị Sáu, Quận 3, TP. HCM' },
            { name: 'Chợ Bến Thành', rating: 4.2, price_level: 2, address: 'Lê Lợi, Bến Thành, Quận 1, TP. HCM' }
        ],
        rental: [
            { name: 'Thuê xe máy Sài Gòn Biketown', rating: 4.6, price_level: 1, address: '152 Bùi Viện, Phạm Ngũ Lão, Quận 1, TP. HCM' },
            { name: 'Thuê xe du lịch Hùng Dũng', rating: 4.7, price_level: 2, address: '68 Huỳnh Tấn Phát, Tân Thuận Đông, Quận 7, TP. HCM' }
        ]
    }
};
const VIETNAM_PROVINCES = {
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
function getMockPlaces(category, lat, lng) {
    let matchedCity = 'da nang';
    // Check closest city in coordinates
    let minDistance = Infinity;
    for (const [cityName, coords] of Object.entries(VIETNAM_PROVINCES)) {
        const dist = Math.pow(coords.lat - lat, 2) + Math.pow(coords.lng - lng, 2);
        if (dist < minDistance) {
            minDistance = dist;
            matchedCity = cityName;
        }
    }
    const cityKey = MOCK_PLACES_LIBRARY[matchedCity] ? matchedCity : 'da nang';
    const mockList = MOCK_PLACES_LIBRARY[cityKey][category] || [];
    return mockList.map((item, idx) => ({
        google_place_id: `mock-${category}-${cityKey}-${idx}`,
        name: item.name,
        category,
        lat: lat + (Math.random() - 0.5) * 0.05,
        lng: lng + (Math.random() - 0.5) * 0.05,
        rating: item.rating || 4.5,
        price_level: item.price_level || 2,
        address: item.address || 'Địa chỉ thực tế tại Việt Nam'
    }));
}
function getCityCoordinates(city) {
    const normalized = city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
    for (const key of Object.keys(VIETNAM_PROVINCES)) {
        const keyNormalized = key.replace(/\s+/g, '');
        if (normalized.includes(keyNormalized)) {
            return VIETNAM_PROVINCES[key];
        }
    }
    return { lat: 16.0544, lng: 108.2022 }; // Fallback to Da Nang
}
async function searchPlaces(query, category, lat, lng) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        console.warn(`GOOGLE_MAPS_API_KEY is missing. Generating mock places for category: ${category}`);
        return getMockPlaces(category, lat, lng);
    }
    try {
        // 1. Check database cache first using supabaseAdmin client
        const { data: cachedPlaces, error: cacheError } = await supabaseAdmin_1.supabaseAdmin
            .from('places_cache')
            .select('*')
            .eq('category', category)
            .limit(15);
        // If cache has data and is fresh (within last 30 days), we can return a subset or check distance
        // Let's implement simple query match or distance match to keep caching simple.
        // For this MVP, we query directly but cache new discoveries.
        // 2. Call Google Places API (New) Text Search
        const endpoint = 'https://places.googleapis.com/v1/places:searchText';
        const response = await axios_1.default.post(endpoint, {
            textQuery: `${query} in Vietnam`,
            locationBias: {
                circle: {
                    center: { latitude: lat, longitude: lng },
                    radius: 15000.0
                }
            }
        }, {
            timeout: 3500,
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.priceLevel,places.types'
            }
        });
        const places = response.data?.places || [];
        const candidates = [];
        for (const place of places) {
            const priceMap = {
                'PRICE_LEVEL_FREE': 0,
                'PRICE_LEVEL_INEXPENSIVE': 1,
                'PRICE_LEVEL_MODERATE': 2,
                'PRICE_LEVEL_EXPENSIVE': 3,
                'PRICE_LEVEL_VERY_EXPENSIVE': 4
            };
            const priceLevel = priceMap[place.priceLevel] || 2;
            const candidate = {
                google_place_id: place.id,
                name: place.displayName?.text || 'Địa điểm không có tên',
                category,
                lat: place.location?.latitude || lat,
                lng: place.location?.longitude || lng,
                rating: place.rating || 4.2,
                price_level: priceLevel,
                address: place.formattedAddress || 'Địa chỉ đang cập nhật'
            };
            candidates.push(candidate);
            // Save to cache in the background (ignore errors)
            supabaseAdmin_1.supabaseAdmin
                .from('places_cache')
                .upsert({
                google_place_id: candidate.google_place_id,
                name: candidate.name,
                category: candidate.category,
                lat: candidate.lat,
                lng: candidate.lng,
                rating: candidate.rating,
                price_level: candidate.price_level,
                address: candidate.address,
                raw_data: place,
                cached_at: new Date().toISOString()
            }, { onConflict: 'google_place_id' })
                .then(({ error }) => {
                if (error)
                    console.error('Error caching place:', error.message);
            });
        }
        return candidates;
    }
    catch (error) {
        console.error(`Google Places API failure: ${error.response?.data?.error?.message || error.message}. Returning mock data.`);
        // Fallback to mock data on error safely without recursive call
        return getMockPlaces(category, lat, lng);
    }
}

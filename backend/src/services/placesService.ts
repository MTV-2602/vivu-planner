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

// Rich mock places library for Vietnam cities to run without a Google Maps API Key
const MOCK_PLACES_LIBRARY: Record<string, Record<string, Partial<PlaceCandidate>[]>> = {
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
      { name: 'Chả cá Lã Vọng Anh Vũ', rating: 4.6, price_level: 3, address: '120 Giảng Võ, Cát Linh, Đống Đa, Hà Nội' },
      { name: 'Bún đậu mắm tôm Trung Hương', rating: 4.5, price_level: 1, address: '49 Ngõ Phất Lộc, Hàng Bạc, Hoàn Kiếm, Hà Nội' },
      { name: 'Phở cuốn Hương Mai Ngũ Xã', rating: 4.4, price_level: 2, address: '25 Ngũ Xã, Trúc Bạch, Ba Đình, Hà Nội' },
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
      { name: 'Bánh tráng thịt heo Trần', rating: 4.5, price_level: 2, address: '04 Lê Duẩn, Hải Châu, Đà Nẵng' },
      { name: 'Bún chả cá Hờn', rating: 4.3, price_level: 1, address: '113/3 Nguyễn Chí Thanh, Hải Châu, Đà Nẵng' },
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
      { name: 'Cơm tấm Ba Ghiền', rating: 4.5, price_level: 2, address: '84 Đặng Văn Ngữ, Phường 10, Phú Nhuận, TP. HCM' },
      { name: 'Hủ tiếu Nam Vang Thành Đạt', rating: 4.4, price_level: 1, address: '34 Cô Bắc, Cầu Ông Lãnh, Quận 1, TP. HCM' },
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
  },
  'da lat': {
    accommodation: [
      { name: 'Ana Mandara Villas Dalat Resort & Spa', rating: 4.7, price_level: 3, address: 'Lê Lai, Phường 5, Đà Lạt' },
      { name: 'Dalat Palace Heritage Hotel', rating: 4.8, price_level: 4, address: '2 Trần Phú, Phường 3, Đà Lạt' },
      { name: 'Lalaland Homestay Dalat', rating: 4.5, price_level: 1, address: '10A Triệu Việt Vương, Phường 3, Đà Lạt' }
    ],
    dining: [
      { name: 'Lẩu gà lá é Tao Ngộ', rating: 4.4, price_level: 1, address: '5 Đường 3/4, Phường 3, Đà Lạt' },
      { name: 'Bánh ướt lòng gà Long', rating: 4.3, price_level: 1, address: 'Hẻm 202 Phan Đình Phùng, Phường 2, Đà Lạt' },
      { name: 'Bánh căn Lệ', rating: 4.5, price_level: 1, address: '27/44 Yersin, Phường 10, Đà Lạt' },
      { name: 'Nem nướng Bà Hùng', rating: 4.4, price_level: 2, address: '328 Phan Đình Phùng, Phường 2, Đà Lạt' },
      { name: 'Nhà hàng Léguda (Lẩu rau)', rating: 4.5, price_level: 2, address: 'Đồi Robin, Phường 3, Đà Lạt' },
      { name: 'Quán nướng Chu', rating: 4.4, price_level: 2, address: '3 Phạm Ngũ Lão, Phường 3, Đà Lạt' }
    ],
    attraction: [
      { name: 'Hồ Xuân Hương & Vườn hoa Thành phố', rating: 4.7, price_level: 1, address: 'Trần Quốc Toản, Phường 1, Đà Lạt' },
      { name: 'Thung lũng Tình Yêu', rating: 4.5, price_level: 2, address: '3 - 5 - 7 Mai Anh Đào, Phường 8, Đà Lạt' },
      { name: 'Thác Datanla & Máng trượt', rating: 4.6, price_level: 2, address: 'Quốc lộ 20, Phường 3, Đà Lạt' },
      { name: 'Ga Đà Lạt cổ', rating: 4.4, price_level: 1, address: 'Quang Trung, Phường 9, Đà Lạt' }
    ],
    rental: [
      { name: 'Thuê xe máy Khánh Đoan Đà Lạt', rating: 4.6, price_level: 1, address: '15 Trần Bình Trọng, Phường 5, Đà Lạt' },
      { name: 'Thuê xe tự lái Đà Lạt Happy Car', rating: 4.7, price_level: 2, address: '22 Bùi Thị Xuân, Phường 2, Đà Lạt' }
    ]
  },
  'sapa': {
    accommodation: [
      { name: 'Hotel de la Coupole - MGallery', rating: 4.8, price_level: 4, address: '1 Hoàng Liên, Sa Pa' },
      { name: 'Sapa Jade Hill Resort & Spa', rating: 4.6, price_level: 3, address: 'Mường Hoa, Lao Chải, Sa Pa' },
      { name: 'Mountain River Homestay Sapa', rating: 4.5, price_level: 1, address: 'Tả Van, Sa Pa' }
    ],
    dining: [
      { name: 'Nhà hàng Ô Quý Hồ Sapa', rating: 4.4, price_level: 2, address: '8 Thạch Sơn, Sa Pa' },
      { name: 'Quán ẩm thực Tây Bắc A Phủ', rating: 4.3, price_level: 2, address: '15 Fansipan, Sa Pa' },
      { name: 'Thắng cố A Quỳnh', rating: 4.2, price_level: 2, address: '15 Thạch Sơn, Sa Pa' },
      { name: 'Lẩu cá hồi cá tầm Xuân Viên', rating: 4.2, price_level: 2, address: '39 Xuân Viên, Sa Pa' }
    ],
    attraction: [
      { name: 'Đỉnh Fansipan (Cáp treo Sun World)', rating: 4.8, price_level: 4, address: 'Đường Nguyễn Chí Thanh, Sa Pa' },
      { name: 'Bản du lịch Cát Cát', rating: 4.5, price_level: 1, address: 'San Sả Hồ, Sa Pa' },
      { name: 'Thung lũng Mường Hoa', rating: 4.6, price_level: 1, address: 'Mường Hoa, Lao Chải, Sa Pa' }
    ],
    rental: [
      { name: 'Thuê xe máy Motorbike Sapa 365', rating: 4.7, price_level: 1, address: '02 Cầu Mây, Sa Pa' }
    ]
  },
  'hoi an': {
    accommodation: [
      { name: 'Anantara Hoi An Resort', rating: 4.8, price_level: 4, address: '1 Phạm Hồng Thái, Cẩm Châu, Hội An' },
      { name: 'Little Riverside Hoi An Luxury Hotel', rating: 4.7, price_level: 3, address: '09 Phan Bội Châu, Cẩm Châu, Hội An' }
    ],
    dining: [
      { name: 'Cơm gà Bà Buội Hội An', rating: 4.3, price_level: 2, address: '22 Phan Chu Trinh, Minh An, Hội An' },
      { name: 'Bánh mì Phượng', rating: 4.4, price_level: 1, address: '2B Phan Chu Trinh, Cẩm Châu, Hội An' },
      { name: 'Cao lầu Thanh', rating: 4.5, price_level: 1, address: '26 Thái Phiên, Minh An, Hội An' },
      { name: 'Bánh bao bánh vạc Hoa Hồng Trắng', rating: 4.3, price_level: 2, address: '533 Hai Bà Trưng, Cẩm Phô, Hội An' },
      { name: 'Nước Mót Hội An (Trà thảo mộc)', rating: 4.6, price_level: 1, address: '150 Trần Phú, Minh An, Hội An' }
    ],
    attraction: [
      { name: 'Phố cổ Hội An & Chùa Cầu', rating: 4.8, price_level: 1, address: 'Trần Phú, Minh An, Hội An' },
      { name: 'Khu sinh thái Rừng dừa Bảy Mẫu', rating: 4.5, price_level: 2, address: 'Vạn Lăng, Cẩm Thanh, Hội An' }
    ],
    rental: [
      { name: 'Hoi An Motorbike Rental', rating: 4.6, price_level: 1, address: '111 Hùng Vương, Cẩm Phô, Hội An' }
    ]
  },
  'hue': {
    accommodation: [
      { name: 'Azerai La Residence Hue', rating: 4.8, price_level: 4, address: '5 Lê Lợi, Vĩnh Ninh, Huế' },
      { name: 'Silk Path Grand Hue Hotel', rating: 4.7, price_level: 3, address: '2 Lê Lợi, Vĩnh Ninh, Huế' }
    ],
    dining: [
      { name: 'Bún bò Huế O Lâm', rating: 4.4, price_level: 1, address: '71 Nguyễn Công Trứ, Phú Hội, Huế' },
      { name: 'Bánh bèo nậm lọc bà Đỏ', rating: 4.2, price_level: 1, address: '8 Nguyễn Bỉnh Khiêm, Phú Cát, Huế' },
      { name: 'Cơm hến Hoa Đông Vĩ Dạ', rating: 4.3, price_level: 1, address: '64 kiệt 7 Ưng Bình, Vĩ Dạ, Huế' },
      { name: 'Bánh khoái Hồng Mai', rating: 4.4, price_level: 2, address: '110 Đinh Tiên Hoàng, Phú Hậu, Huế' }
    ],
    attraction: [
      { name: 'Đại Nội Huế (Hoàng Thành cổ)', rating: 4.7, price_level: 2, address: 'Đường 23 Tháng 8, Thuận Hòa, Huế' },
      { name: 'Lăng vua Khải Định', rating: 4.8, price_level: 2, address: 'Thủy Bằng, Hương Thủy, Thừa Thiên Huế' },
      { name: 'Chùa Thiên Mụ', rating: 4.6, price_level: 1, address: 'Kim Long, Hương Long, Huế' }
    ],
    rental: [
      { name: 'Thuê xe máy Motorbike Rental Hue', rating: 4.6, price_level: 1, address: '29 Chu Văn An, Phú Hội, Huế' }
    ]
  },
  'nha trang': {
    accommodation: [
      { name: 'Vinpearl Resort & Spa Nha Trang Bay', rating: 4.8, price_level: 4, address: 'Đảo Hòn Tre, Nha Trang' },
      { name: 'Sheraton Nha Trang Hotel & Spa', rating: 4.7, price_level: 3, address: '26-28 Trần Phú, Lộc Thọ, Nha Trang' }
    ],
    dining: [
      { name: 'Bún sứa Năm Beo Chợ Đầm', rating: 4.3, price_level: 1, address: 'B2 Chung cư Phan Bội Châu, Xương Huân, Nha Trang' },
      { name: 'Nem nướng Đặng Văn Quyên', rating: 4.2, price_level: 2, address: '16A Lãn Ông, Xương Huân, Nha Trang' },
      { name: 'Hải sản Thanh Sương', rating: 4.4, price_level: 2, address: '21 Trần Phú, Vĩnh Nguyên, Nha Trang' },
      { name: 'Bánh căn cô Tư Tháp Bà', rating: 4.3, price_level: 1, address: '7A Tháp Bà, Vĩnh Phước, Nha Trang' }
    ],
    attraction: [
      { name: 'VinWonders Nha Trang Amusement Park', rating: 4.8, price_level: 4, address: 'Đảo Hòn Tre, Vĩnh Nguyên, Nha Trang' },
      { name: 'Khu di tích Tháp Bà Ponagar', rating: 4.6, price_level: 1, address: '2 Tháng 4, Vĩnh Phước, Nha Trang' }
    ],
    rental: [
      { name: 'Thuê xe máy Nha Trang San Hô Việt', rating: 4.7, price_level: 1, address: '114/23 Hoàng Hoa Thám, Lộc Thọ, Nha Trang' }
    ]
  },
  'phu quoc': {
    accommodation: [
      { name: 'JW Marriott Phu Quoc Emerald Bay Resort', rating: 4.9, price_level: 4, address: 'Bãi Khem, An Thới, Phú Quốc' },
      { name: 'Sol by Meliá Phu Quoc', rating: 4.6, price_level: 3, address: 'Đường Bào, Dương Tơ, Phú Quốc' }
    ],
    dining: [
      { name: 'Bún quậy Kiến Xây Bạch Đằng', rating: 4.4, price_level: 1, address: '28 Bạch Đằng, Dương Đông, Phú Quốc' },
      { name: 'Nhà hàng hải sản Xin Chào', rating: 4.3, price_level: 3, address: '66 Trần Hưng Đạo, Dương Đông, Phú Quốc' },
      { name: 'Gỏi cá trích Trùng Dương', rating: 4.2, price_level: 2, address: '136 Đường 30 Tháng 4, Dương Đông, Phú Quốc' },
      { name: 'Bánh canh chả cá Phụng', rating: 4.3, price_level: 1, address: '27 Bạch Đằng, Dương Đông, Phú Quốc' }
    ],
    attraction: [
      { name: 'Cáp treo Hòn Thơm Sun World', rating: 4.8, price_level: 3, address: 'Bãi Đất Đỏ, An Thới, Phú Quốc' },
      { name: 'Grand World Phú Quốc (Thành phố không ngủ)', rating: 4.6, price_level: 2, address: 'Gành Dầu, Phú Quốc' }
    ],
    rental: [
      { name: 'Thuê xe máy Phú Quốc Minh Thư', rating: 4.7, price_level: 1, address: 'Đường Trần Hưng Đạo, Dương Đông, Phú Quốc' }
    ]
  },
  'ninh binh': {
    accommodation: [
      { name: 'Emeralda Resort Ninh Binh', rating: 4.7, price_level: 3, address: 'Khu bảo tồn Vân Long, Gia Vân, Gia Viễn, Ninh Bình' },
      { name: 'Tam Coc Garden Resort', rating: 4.8, price_level: 4, address: 'Hải Nham, Ninh Hải, Hoa Lư, Ninh Bình' }
    ],
    dining: [
      { name: 'Thịt dê cơm cháy Thăng Long Ninh Bình', rating: 4.4, price_level: 2, address: 'Tràng An, Trường Yên, Hoa Lư, Ninh Bình' },
      { name: 'Nhà hàng Đức Dê Ninh Bình', rating: 4.2, price_level: 2, address: '446 Nguyễn Huệ, Nam Bình, Ninh Bình' },
      { name: 'Miến lươn Bà Phấn', rating: 4.3, price_level: 1, address: '995 Trần Hưng Đạo, Thanh Bình, Ninh Bình' },
      { name: 'Gỏi cá nhệch Kim Sơn Vũ Gia', rating: 4.5, price_level: 2, address: 'Ngô Quyền, Đông Thành, Ninh Bình' }
    ],
    attraction: [
      { name: 'Khu du lịch sinh thái Tràng An', rating: 4.8, price_level: 2, address: 'Tràng An, Trường Yên, Hoa Lư, Ninh Bình' },
      { name: 'Chùa Bái Đính cổ và mới', rating: 4.7, price_level: 1, address: 'Gia Sinh, Gia Viễn, Ninh Bình' },
      { name: 'Tuyệt Tình Cốc & Động Am Tiên', rating: 4.5, price_level: 1, address: 'Trường Yên, Hoa Lư, Ninh Bình' }
    ],
    rental: [
      { name: 'Thuê xe máy Ninh Bình Khánh Chi', rating: 4.7, price_level: 1, address: '80 Lương Văn Tụy, Tân Thành, Ninh Bình' }
    ]
  },
  'vung tau': {
    accommodation: [
      { name: 'The Imperial Hotel Vung Tau', rating: 4.7, price_level: 3, address: '159 Thùy Vân, Thắng Tam, Vũng Tàu' },
      { name: 'Marina Bay Vung Tau Resort & Spa', rating: 4.6, price_level: 3, address: '115 Trần Phú, Phường 5, Vũng Tàu' }
    ],
    dining: [
      { name: 'Bánh khọt Gốc Vú Sữa', rating: 4.2, price_level: 1, address: '14 Nguyễn Trường Tộ, Phường 2, Vũng Tàu' },
      { name: 'Bánh khọt Cô Ba Vũng Tàu', rating: 4.4, price_level: 2, address: '1 Hoàng Hoa Thám, Phường 3, Vũng Tàu' },
      { name: 'Lẩu cá đuối Hoàng Minh', rating: 4.3, price_level: 2, address: '44 Trương Công Định, Phường 3, Vũng Tàu' },
      { name: 'Hải sản Gành Hào', rating: 4.6, price_level: 3, address: '3 Trần Phú, Phường 5, Vũng Tàu' },
      { name: 'Quán nướng Cô Nên', rating: 4.4, price_level: 2, address: '6 Hạ Long, Phường 2, Vũng Tàu' },
      { name: 'Bánh mì xíu mại Hàng Quyên', rating: 4.3, price_level: 1, address: '37 Phan Chu Trinh, Phường 2, Vũng Tàu' }
    ],
    attraction: [
      { name: 'Tượng Chúa Kitô Vua Vũng Tàu', rating: 4.7, price_level: 1, address: 'Thùy Vân, Phường 2, Vũng Tàu' },
      { name: 'Ngọn Hải Đăng Vũng Tàu', rating: 4.6, price_level: 1, address: 'Núi Nhỏ, Phường 2, Vũng Tàu' }
    ],
    rental: [
      { name: 'Thuê xe máy Vũng Tàu giá rẻ Minh Đức', rating: 4.7, price_level: 1, address: '18 Lương Văn Can, Phường 2, Vũng Tàu' }
    ]
  }
};

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

function getMockPlaces(
  category: 'accommodation' | 'dining' | 'attraction' | 'rental',
  lat: number,
  lng: number,
  query?: string
): PlaceCandidate[] {
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
  
  let candidates = mockList.map((item, idx) => ({
    google_place_id: `mock-${category}-${cityKey}-${idx}`,
    name: item.name!,
    category,
    lat: lat + (Math.random() - 0.5) * 0.05,
    lng: lng + (Math.random() - 0.5) * 0.05,
    rating: item.rating || 4.5,
    price_level: item.price_level || 2,
    address: item.address || 'Địa chỉ thực tế tại Việt Nam'
  }));

  // Prioritize candidates matching the query keywords (e.g. "lẩu cá đuối")
  if (query) {
    const keywords = query.toLowerCase()
      .replace(/đ/g, 'd')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 1); // match words longer than 1 character

    if (keywords.length > 0) {
      candidates.sort((a, b) => {
        const aNorm = a.name.toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const bNorm = b.name.toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        let aScore = 0;
        let bScore = 0;
        
        keywords.forEach(kw => {
          if (aNorm.includes(kw)) aScore += 1;
          if (bNorm.includes(kw)) bScore += 1;
        });
        
        return bScore - aScore; // highest match score first
      });
    }
  }

  return candidates;
}

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
    const delta = 0.15;
    const viewbox = `${lng - delta},${lat + delta},${lng + delta},${lat - delta}`;
    
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: query,
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
      timeout: 5000
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

    if (candidates.length === 0) {
      return getMockPlaces(category, lat, lng, query);
    }

    return candidates;
  } catch (error: any) {
    console.error('OSM search places error:', error.message);
    return getMockPlaces(category, lat, lng, query);
  }
}

export async function searchPlaces(
  query: string,
  category: 'accommodation' | 'dining' | 'attraction' | 'rental',
  lat: number,
  lng: number
): Promise<PlaceCandidate[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.warn(`GOOGLE_MAPS_API_KEY is missing. Using OpenStreetMap Nominatim for free place search.`);
    return searchPlacesOSM(query, category, lat, lng);
  }

  try {
    // 1. Check database cache first using supabaseAdmin client
    const { data: cachedPlaces, error: cacheError } = await supabaseAdmin
      .from('places_cache')
      .select('*')
      .eq('category', category)
      .limit(15);

    // If cache has data and is fresh (within last 30 days), we can return a subset or check distance
    // Let's implement simple query match or distance match to keep caching simple.
    // For this MVP, we query directly but cache new discoveries.
    
    // 2. Call Google Places API (New) Text Search
    const endpoint = 'https://places.googleapis.com/v1/places:searchText';
    const response = await axios.post(
      endpoint,
      {
        textQuery: `${query} in Vietnam`,
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 15000.0
          }
        }
      },
      {
        timeout: 3500,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.priceLevel,places.types'
        }
      }
    );

    const places = response.data?.places || [];
    const candidates: PlaceCandidate[] = [];

    for (const place of places) {
      const priceMap: Record<string, number> = {
        'PRICE_LEVEL_FREE': 0,
        'PRICE_LEVEL_INEXPENSIVE': 1,
        'PRICE_LEVEL_MODERATE': 2,
        'PRICE_LEVEL_EXPENSIVE': 3,
        'PRICE_LEVEL_VERY_EXPENSIVE': 4
      };
      
      const priceLevel = priceMap[place.priceLevel] || 2;
      const candidate: PlaceCandidate = {
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
            raw_data: place,
            cached_at: new Date().toISOString()
          },
          { onConflict: 'google_place_id' }
        )
        .then(({ error }) => {
          if (error) console.error('Error caching place:', error.message);
        });
    }

    return candidates;
  } catch (error: any) {
    console.error(`Google Places API failure: ${error.response?.data?.error?.message || error.message}. Returning mock data.`);
    // Fallback to mock data on error safely without recursive call
    return getMockPlaces(category, lat, lng, query);
  }
}

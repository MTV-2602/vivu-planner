"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCityCoordinates = getCityCoordinates;
exports.searchPlaces = searchPlaces;
exports.fetchCandidatePlacesForCity = fetchCandidatePlacesForCity;
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
            { name: 'Chả cá Lã Vọng Anh Vũ', rating: 4.6, price_level: 3, address: '120 Giảng Võ, Cát Linh, Đống Đa, Hà Nội' },
            { name: 'Bún đậu mắm tôm Trung Hương', rating: 4.5, price_level: 1, address: '49 Ngõ Phất Lộc, Hàng Bạc, Hoàn Kiếm, Hà Nội' },
            { name: 'Phở cuốn Hương Mai Ngũ Xã', rating: 4.4, price_level: 2, address: '25 Ngũ Xã, Trúc Bạch, Ba Đình, Hà Nội' },
            { name: 'Giang Cafe (Cà phê trứng)', rating: 4.6, price_level: 1, address: '39 Nguyễn Hữu Huân, Lý Thái Tổ, Hoàn Kiếm, Hà Nội' }
        ],
        attraction: [
            { name: 'Hồ Hoàn Kiếm và Đền Ngọc Sơn', rating: 4.7, price_level: 1, address: 'Đinh Tiên Hoàng, Hàng Trống, Hoàn Kiếm, Hà Nội' },
            { name: 'Lăng Chủ tịch Hồ Chí Minh', rating: 4.8, price_level: 1, address: 'Hùng Vương, Điện Biên, Ba Đình, Hà Nội' },
            { name: 'Văn Miếu - Quốc Tử Giám', rating: 4.7, price_level: 1, address: '58 Quốc Tử Giám, Văn Miếu, Đống Đa, Hà Nội' },
            { name: 'Nhà tù Hỏa Lò', rating: 4.6, price_level: 1, address: '1 Hỏa Lò, Trần Hưng Đạo, Hoàn Kiếm, Hà Nội' },
            { name: 'Chùa Một Cột', rating: 4.6, price_level: 1, address: 'Chùa Một Cột, Đội Cấn, Ba Đình, Hà Nội' },
            { name: 'Hoàng thành Thăng Long', rating: 4.5, price_level: 1, address: '19C Hoàng Diệu, Điện Biên, Ba Đình, Hà Nội' },
            { name: 'Nhà hát Lớn Hà Nội', rating: 4.7, price_level: 2, address: '1 Tràng Tiền, Phan Chu Trinh, Hoàn Kiếm, Hà Nội' },
            { name: 'Cầu Long Biên', rating: 4.5, price_level: 0, address: 'Cầu Long Biên, Ngọc Lâm, Long Biên, Hà Nội' }
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
            { name: 'Cầu Rồng Đà Nẵng', rating: 4.8, price_level: 1, address: 'An Hải Tây, Sơn Trà, Đà Nẵng' },
            { name: 'Bãi biển Mỹ Khê', rating: 4.8, price_level: 0, address: 'Võ Nguyên Giáp, Phước Mỹ, Sơn Trà, Đà Nẵng' },
            { name: 'Bảo tàng Điêu khắc Chăm', rating: 4.4, price_level: 1, address: 'Số 02 2 Tháng 9, Bình Hiên, Hải Châu, Đà Nẵng' },
            { name: 'Chợ Cồn', rating: 4.3, price_level: 1, address: '290 Hùng Vương, Vĩnh Trung, Hải Châu, Đà Nẵng' },
            { name: 'Công viên Châu Á (Asia Park)', rating: 4.5, price_level: 2, address: '1 Phan Đăng Lưu, Hòa Cường Bắc, Hải Châu, Đà Nẵng' }
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
            { name: 'Chợ Bến Thành', rating: 4.2, price_level: 2, address: 'Lê Lợi, Bến Thành, Quận 1, TP. HCM' },
            { name: 'Nhà thờ Đức Bà Sài Gòn', rating: 4.5, price_level: 0, address: '01 Công xã Paris, Bến Nghé, Quận 1, TP. HCM' },
            { name: 'Thảo Cầm Viên Sài Gòn', rating: 4.3, price_level: 1, address: '2 Nguyễn Bỉnh Khiêm, Bến Nghé, Quận 1, TP. HCM' },
            { name: 'Tòa nhà Landmark 81', rating: 4.7, price_level: 3, address: '208 Nguyễn Hữu Cảnh, Phường 22, Bình Thạnh, TP. HCM' },
            { name: 'Phố đi bộ Nguyễn Huệ', rating: 4.6, price_level: 0, address: 'Đường Nguyễn Huệ, Bến Nghé, Quận 1, TP. HCM' }
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
            { name: 'Ga Đà Lạt cổ', rating: 4.4, price_level: 1, address: 'Quang Trung, Phường 9, Đà Lạt' },
            { name: 'Đồi Chè Cầu Đất', rating: 4.5, price_level: 0, address: 'QL20, Xuân Trường, Thành phố Đà Lạt' },
            { name: 'Dinh I Bảo Đại', rating: 4.4, price_level: 1, address: 'Trần Quang Diệu, Phường 10, Đà Lạt' },
            { name: 'Chùa Linh Phước (Chùa Ve Chai)', rating: 4.7, price_level: 0, address: '120 Tự Phước, Trại Mát, Đà Lạt' },
            { name: 'Quảng trường Lâm Viên', rating: 4.6, price_level: 0, address: 'Đường Trần Quốc Toản, Phường 1, Đà Lạt' }
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
            { name: 'Thung lũng Mường Hoa', rating: 4.6, price_level: 1, address: 'Mường Hoa, Lao Chải, Sa Pa' },
            { name: 'Núi Hàm Rồng', rating: 4.4, price_level: 1, address: 'Đường Hàm Rồng, Sa Pa' },
            { name: 'Nhà thờ Đá Sa Pa', rating: 4.5, price_level: 0, address: 'Phố Hàm Rồng, Sa Pa' },
            { name: 'Thác Bạc Sapa', rating: 4.3, price_level: 1, address: 'QL4D, San Sả Hồ, Sa Pa' },
            { name: 'Bản Tả Phìn', rating: 4.4, price_level: 1, address: 'Xã Tả Phìn, Sa Pa' }
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
            { name: 'Khu sinh thái Rừng dừa Bảy Mẫu', rating: 4.5, price_level: 2, address: 'Vạn Lăng, Cẩm Thanh, Hội An' },
            { name: 'Làng gốm Thanh Hà', rating: 4.4, price_level: 1, address: 'Phạm Phán, Thanh Hà, Hội An' },
            { name: 'Bãi biển An Bàng', rating: 4.6, price_level: 0, address: 'Đường Hai Bà Trưng, Cẩm An, Hội An' },
            { name: 'Làng rau Trà Quế', rating: 4.5, price_level: 1, address: 'Cẩm Hà, Hội An' },
            { name: 'Chợ đêm Hội An', rating: 4.3, price_level: 0, address: 'Đường Nguyễn Hoàng, Minh An, Hội An' }
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
            { name: 'Chùa Thiên Mụ', rating: 4.6, price_level: 1, address: 'Kim Long, Hương Long, Huế' },
            { name: 'Lăng vua Tự Đức', rating: 4.6, price_level: 2, address: 'Thủy Xuân, Thành phố Huế' },
            { name: 'Lăng vua Minh Mạng', rating: 4.7, price_level: 2, address: 'Hương Thọ, Hương Trà, Thừa Thiên Huế' },
            { name: 'Cầu Trường Tiền', rating: 4.7, price_level: 0, address: 'Cầu Trường Tiền, Phú Hội, Huế' },
            { name: 'Chợ Đông Ba', rating: 4.2, price_level: 1, address: 'Trần Hưng Đạo, Phú Hòa, Huế' }
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
            { name: 'Khu di tích Tháp Bà Ponagar', rating: 4.6, price_level: 1, address: '2 Tháng 4, Vĩnh Phước, Nha Trang' },
            { name: 'Chùa Long Sơn', rating: 4.6, price_level: 0, address: '20 Đường 23 Tháng 10, Phương Sơn, Nha Trang' },
            { name: 'Hòn Chồng', rating: 4.4, price_level: 1, address: 'Vĩnh Phước, Nha Trang' },
            { name: 'Viện Hải dương học Nha Trang', rating: 4.4, price_level: 1, address: 'Số 1 Cầu Đá, Vĩnh Nguyên, Nha Trang' },
            { name: 'Bãi Dài Nha Trang', rating: 4.5, price_level: 0, address: 'Cam Hải Đông, Cam Lâm, Khánh Hòa' }
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
            { name: 'Grand World Phú Quốc (Thành phố không ngủ)', rating: 4.6, price_level: 2, address: 'Gành Dầu, Phú Quốc' },
            { name: 'Bãi Sao Phú Quốc', rating: 4.5, price_level: 0, address: 'An Thới, Phú Quốc' },
            { name: 'Nhà tù Phú Quốc', rating: 4.4, price_level: 1, address: 'Đường Nguyễn Văn Cừ, An Thới, Phú Quốc' },
            { name: 'Chợ đêm Phú Quốc', rating: 4.3, price_level: 0, address: 'Đường Nguyễn Trãi, Dương Đông, Phú Quốc' },
            { name: 'Vinpearl Safari Phú Quốc', rating: 4.7, price_level: 4, address: 'Gành Dầu, Phú Quốc' }
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
            { name: 'Tuyệt Tình Cốc & Động Am Tiên', rating: 4.5, price_level: 1, address: 'Trường Yên, Hoa Lư, Ninh Bình' },
            { name: 'Tam Cốc - Bích Động', rating: 4.6, price_level: 2, address: 'Ninh Hải, Hoa Lư, Ninh Bình' },
            { name: 'Hang Múa (Mua Caves)', rating: 4.7, price_level: 1, address: 'Khê Đầu Hạ, Ninh Xuân, Hoa Lư, Ninh Bình' },
            { name: 'Vườn quốc gia Cúc Phương', rating: 4.5, price_level: 1, address: 'Nho Quan, Ninh Bình' },
            { name: 'Cố đô Hoa Lư', rating: 4.4, price_level: 1, address: 'Trường Yên, Hoa Lư, Ninh Bình' }
        ],
        rental: [
            { name: 'Thuê xe máy Ninh Bình Khánh Chi', rating: 4.7, price_level: 1, address: '80 Lương Văn Tụy, Tân Thành, Ninh Bình' }
        ]
    },
    'vung tau': {
        accommodation: [
            { name: 'The Imperial Hotel Vung Tau', rating: 4.7, price_level: 3, address: '159 Thùy Vân, Thắng Tam, Vũng Tàu', lat: 10.3377, lng: 107.0906 },
            { name: 'Marina Bay Vung Tau Resort & Spa', rating: 4.6, price_level: 3, address: '115 Trần Phú, Phường 5, Vũng Tàu', lat: 10.3705, lng: 107.0565 }
        ],
        dining: [
            { name: 'Bánh mì xíu mại Hàng Quyên', rating: 4.3, price_level: 1, address: '268 Trương Công Định, Phường 3, Vũng Tàu', lat: 10.3547, lng: 107.0866 },
            { name: 'Bánh mì xíu mại Hàng Quyên (Chi nhánh 1)', rating: 4.3, price_level: 1, address: '564 Trần Phú, Phường 5, Vũng Tàu', lat: 10.3708, lng: 107.0560 },
            { name: 'Bánh khọt Gốc Vú Sữa', rating: 4.2, price_level: 1, address: '14 Nguyễn Trường Tộ, Phường 2, Vũng Tàu', lat: 10.3402, lng: 107.0784 },
            { name: 'Bánh khọt Cô Ba Vũng Tàu', rating: 4.4, price_level: 2, address: '1 Hoàng Hoa Thám, Phường 3, Vũng Tàu', lat: 10.3440, lng: 107.0805 },
            { name: 'Lẩu cá đuối Hoàng Minh', rating: 4.3, price_level: 2, address: '44 Trương Công Định, Phường 3, Vũng Tàu', lat: 10.3524, lng: 107.0818 },
            { name: 'Hải sản Gành Hào', rating: 4.6, price_level: 3, address: '3 Trần Phú, Phường 5, Vũng Tàu', lat: 10.3621, lng: 107.0658 },
            { name: 'Quán nướng Cô Nên', rating: 4.4, price_level: 2, address: '6 Hạ Long, Phường 2, Vũng Tàu', lat: 10.3408, lng: 107.0740 },
            { name: 'Gỏi cá mai Vườn Xoài', rating: 4.5, price_level: 2, address: '34/5 Hoàng Hoa Thám, Phường 2, Vũng Tàu', lat: 10.3415, lng: 107.0820 },
            { name: 'Bún riêu tôm Thuận Phúc', rating: 4.4, price_level: 1, address: '94 Hoàng Hoa Thám, Thắng Tam, Vũng Tàu', lat: 10.3398, lng: 107.0872 }
        ],
        attraction: [
            { name: 'Tượng Chúa Kitô Vua Vũng Tàu', rating: 4.7, price_level: 1, address: 'Thùy Vân, Phường 2, Vũng Tàu', lat: 10.3259, lng: 107.0847 },
            { name: 'Ngọn Hải Đăng Vũng Tàu', rating: 4.6, price_level: 1, address: 'Núi Nhỏ, Phường 2, Vũng Tàu', lat: 10.3340, lng: 107.0792 },
            { name: 'Mũi Nghinh Phong', rating: 4.6, price_level: 0, address: '1 Đường Hạ Long, Phường 2, Vũng Tàu', lat: 10.3208, lng: 107.0850 },
            { name: 'Khu du lịch Hồ Mây', rating: 4.4, price_level: 3, address: 'Vi Ba, Phường 1, Vũng Tàu', lat: 10.3533, lng: 107.0672 },
            { name: 'Bạch Dinh (Villa Blanche)', rating: 4.5, price_level: 1, address: '4 Trần Phú, Phường 1, Vũng Tàu', lat: 10.3508, lng: 107.0694 },
            { name: 'Đồi Con Heo', rating: 4.3, price_level: 0, address: 'Hẻm 222 Phan Chu Trinh, Phường 2, Vũng Tàu', lat: 10.3325, lng: 107.0881 }
        ],
        rental: [
            { name: 'Thuê xe máy Vũng Tàu giá rẻ Minh Đức', rating: 4.7, price_level: 1, address: '18 Lương Văn Can, Phường 2, Vũng Tàu', lat: 10.3421, lng: 107.0812 }
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
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}
function getMockPlaces(category, lat, lng, query) {
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
    let candidates = mockList.map((item, idx) => {
        const h = hashString(item.name || `item-${idx}`);
        const offsetLat = ((h % 40) - 20) * 0.0006;
        const offsetLng = (((Math.floor(h / 40)) % 40) - 20) * 0.0006;
        return {
            google_place_id: `mock-${category}-${cityKey}-${idx}`,
            name: item.name,
            category,
            lat: item.lat || (lat + offsetLat),
            lng: item.lng || (lng + offsetLng),
            rating: item.rating || 4.5,
            price_level: item.price_level || 2,
            address: item.address || 'Địa chỉ thực tế tại Việt Nam'
        };
    });
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
                    if (aNorm.includes(kw))
                        aScore += 1;
                    if (bNorm.includes(kw))
                        bScore += 1;
                });
                return bScore - aScore; // highest match score first
            });
        }
    }
    return candidates;
}
function getCityCoordinates(city) {
    const normalized = city.toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
    for (const key of Object.keys(VIETNAM_PROVINCES)) {
        const keyNormalized = key.replace(/\s+/g, '');
        if (normalized.includes(keyNormalized)) {
            return VIETNAM_PROVINCES[key];
        }
    }
    return { lat: 16.0544, lng: 108.2022 }; // Fallback to Da Nang
}
async function searchPlacesOSM(query, category, lat, lng) {
    try {
        // 1. Try querying Supabase places_cache table first
        const geoDelta = 0.25;
        const { data: cachedItems, error: cacheError } = await supabaseAdmin_1.supabaseAdmin
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
                category: item.category,
                lat: item.lat || lat,
                lng: item.lng || lng,
                rating: Number(item.rating) || 4.5,
                price_level: item.price_level || 2,
                address: item.address || ''
            }));
            if (query) {
                const queryClean = query.trim().toLowerCase();
                // Look for partial matches in name or address
                filtered = filtered.filter(item => item.name.toLowerCase().includes(queryClean) ||
                    item.address.toLowerCase().includes(queryClean));
            }
            // If we got at least 3 matches, return them!
            if (filtered.length >= 3) {
                console.log(`[placesService] Cache HIT (Geo Box) for category ${category}, query: "${query}". Found ${filtered.length} items.`);
                return filtered.slice(0, 10);
            }
        }
        // 2. Try query-name search in Supabase places_cache if query is specific
        if (query && query.trim().length > 2) {
            const queryClean = query.trim().toLowerCase();
            const { data: nameMatches, error: nameError } = await supabaseAdmin_1.supabaseAdmin
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
                    category: item.category,
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
        const response = await axios_1.default.get('https://nominatim.openstreetmap.org/search', {
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
        const candidates = [];
        for (const item of items) {
            const displayName = item.display_name || '';
            const name = displayName.split(',')[0] || 'Địa điểm không tên';
            const candidate = {
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
                raw_data: item,
                cached_at: new Date().toISOString()
            }, { onConflict: 'google_place_id' })
                .then(({ error }) => {
                if (error)
                    console.error('Error caching OSM place:', error.message);
            });
        }
        if (candidates.length === 0) {
            return getMockPlaces(category, lat, lng, query);
        }
        return candidates;
    }
    catch (error) {
        console.warn(`[placesService] OSM search places failed or timed out: ${error.message}. Returning mock places.`);
        return getMockPlaces(category, lat, lng, query);
    }
}
async function searchPlaces(query, category, lat, lng) {
    return searchPlacesOSM(query, category, lat, lng);
}
async function fetchCandidatePlacesForCity(city, lat, lng, preferences = {}, specialRequirements = '', title = '') {
    try {
        // 1. Quét nhanh tất cả các địa điểm thuộc khu vực thành phố này từ cơ sở dữ liệu cache (vùng bán kính geoDelta)
        const geoDelta = 0.25;
        const { data: cachedItems, error } = await supabaseAdmin_1.supabaseAdmin
            .from('places_cache')
            .select('*')
            .gte('lat', lat - geoDelta)
            .lte('lat', lat + geoDelta)
            .gte('lng', lng - geoDelta)
            .lte('lng', lng + geoDelta)
            .limit(150);
        if (!error && cachedItems && cachedItems.length >= 10) {
            console.log(`[placesService] Batch Cache HIT cho thành phố "${city}". Tìm thấy ${cachedItems.length} địa điểm trong DB.`);
            const accommodation = [];
            const dining = [];
            const attraction = [];
            const rental = [];
            cachedItems.forEach(item => {
                const candidate = {
                    google_place_id: item.google_place_id,
                    name: item.name || 'Địa điểm không tên',
                    category: (item.category || 'attraction'),
                    lat: item.lat || lat,
                    lng: item.lng || lng,
                    rating: Number(item.rating) || 4.5,
                    price_level: item.price_level || 2,
                    address: item.address || ''
                };
                if (candidate.category === 'accommodation')
                    accommodation.push(candidate);
                else if (candidate.category === 'dining')
                    dining.push(candidate);
                else if (candidate.category === 'attraction')
                    attraction.push(candidate);
                else if (candidate.category === 'rental')
                    rental.push(candidate);
            });
            // Nếu có yêu cầu đặc biệt hoặc tiêu đề chứa từ khóa, tìm kiếm và ưu tiên xếp lên đầu các mảng
            const lowerReq = (specialRequirements + ' ' + title).toLowerCase();
            if (lowerReq.trim().length > 2) {
                const filterByKeyword = (list) => {
                    return list.sort((a, b) => {
                        const aMatch = a.name.toLowerCase().split(' ').some(w => w.length > 2 && lowerReq.includes(w)) ? 1 : 0;
                        const bMatch = b.name.toLowerCase().split(' ').some(w => w.length > 2 && lowerReq.includes(w)) ? 1 : 0;
                        return bMatch - aMatch; // xếp cái khớp từ khóa lên trước
                    });
                };
                filterByKeyword(dining);
                filterByKeyword(attraction);
            }
            return {
                accommodation: accommodation.length >= 2 ? accommodation : getMockPlaces('accommodation', lat, lng, ''),
                dining: dining.length >= 4 ? dining : getMockPlaces('dining', lat, lng, ''),
                attraction: attraction.length >= 4 ? attraction : getMockPlaces('attraction', lat, lng, ''),
                rental: rental.length >= 1 ? rental : getMockPlaces('rental', lat, lng, '')
            };
        }
    }
    catch (err) {
        console.warn('[placesService] Failed to load batch cache from DB:', err.message);
    }
    // 2. Cache Miss hoặc thành phố hoàn toàn mới -> Trả về dữ liệu ứng viên từ thư viện địa điểm cao cấp (Instant 0ms)
    console.log(`[placesService] Batch Cache MISS cho thành phố "${city}". Sử dụng kho dữ liệu ứng viên cao cấp tức thì...`);
    return {
        accommodation: getMockPlaces('accommodation', lat, lng, ''),
        dining: getMockPlaces('dining', lat, lng, ''),
        attraction: getMockPlaces('attraction', lat, lng, ''),
        rental: getMockPlaces('rental', lat, lng, '')
    };
}

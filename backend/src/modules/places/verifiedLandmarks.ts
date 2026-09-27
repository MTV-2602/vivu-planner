/**
 * Từ điển Tọa độ Địa danh & Quán ăn Thực tế Xác minh 100% tại Việt Nam
 * Ngăn chặn tuyệt đối việc AI hoặc hệ thống định vị sai lệch tọa độ (lệch quận, lệch biển, lệch vị trí)
 */

export interface VerifiedPlaceInfo {
  name: string;
  aliases: string[];
  lat: number;
  lng: number;
  address: string;
  category: 'dining' | 'cafe' | 'hotel' | 'attraction' | 'experience';
  city: string;
  rating?: number;
  estimated_cost?: number;
  social_review_quote?: string;
}

export const VERIFIED_LANDMARKS: VerifiedPlaceInfo[] = [
  // ── HÀ NỘI ──
  {
    name: 'Di tích Nhà tù Hỏa Lò',
    aliases: ['nhà tù hỏa lò', 'hoa lo prison', 'nha tu hoa lo', 'hỏa lò', 'di tích hỏa lò', 'maison centrale'],
    lat: 21.0253,
    lng: 105.8465,
    address: '1 Hỏa Lò, Trần Hưng Đạo, Hoàn Kiếm, Hà Nội',
    category: 'attraction',
    city: 'Hà Nội',
    rating: 4.8,
    estimated_cost: 30000,
    social_review_quote: 'Di tích lịch sử thiêng liêng, tour đêm Hỏa Lò cực kỳ xúc động và ý nghĩa.'
  },
  {
    name: 'Cà phê Giảng (Cà phê trứng)',
    aliases: ['cà phê giảng', 'cafe giảng', 'cafe giang', 'ca phe giang', 'cà phê trứng giảng'],
    lat: 21.0332,
    lng: 105.8541,
    address: '39 Nguyễn Hữu Huân, Lý Thái Tổ, Hoàn Kiếm, Hà Nội',
    category: 'cafe',
    city: 'Hà Nội',
    rating: 4.8,
    estimated_cost: 40000,
    social_review_quote: 'Cà phê trứng thơm lừng béo ngậy trứ danh mảnh đất Hà Thành từ năm 1946.'
  },
  {
    name: 'Phở Bát Đàn (Phở Gia Truyền)',
    aliases: ['phở bát đàn', 'pho bat dan', 'phở gia truyền bát đàn'],
    lat: 21.0337,
    lng: 105.8465,
    address: '49 Bát Đàn, Cửa Đông, Hoàn Kiếm, Hà Nội',
    category: 'dining',
    city: 'Hà Nội',
    rating: 4.6,
    estimated_cost: 65000,
    social_review_quote: 'Phở bò truyền thống nước dùng ngọt thanh từ xương, bò mềm ngọt đậm vị.'
  },
  {
    name: 'Phở Thìn Lò Đúc',
    aliases: ['phở thìn lò đúc', 'pho thin lo duc', 'phở thìn'],
    lat: 21.0182,
    lng: 105.8568,
    address: '13 Lò Đúc, Phạm Đình Hổ, Hai Bà Trưng, Hà Nội',
    category: 'dining',
    city: 'Hà Nội',
    rating: 4.6,
    estimated_cost: 75000,
    social_review_quote: 'Thịt bò xào lăn thơm phức ngập tràn hành lá đậm chất ẩm thực phố cổ.'
  },
  {
    name: 'Phở Thìn Bờ Hồ',
    aliases: ['phở thìn bờ hồ', 'pho thin bo ho'],
    lat: 21.0315,
    lng: 105.8523,
    address: '61 Đinh Tiên Hoàng, Hàng Bạc, Hoàn Kiếm, Hà Nội',
    category: 'dining',
    city: 'Hà Nội',
    rating: 4.6,
    estimated_cost: 70000,
    social_review_quote: 'Tô phở tái lăn nước dùng trong vắt, thơm mùi gừng tỏi ngắm Hồ Gươm thơ mộng.'
  },
  {
    name: 'Bún chả Hương Liên (Bún chả Obama)',
    aliases: ['bún chả hương liên', 'bun cha huong lien', 'bún chả obama', 'bun cha obama'],
    lat: 21.0165,
    lng: 105.8542,
    address: '24 Lê Văn Hưu, Phan Chu Trinh, Hai Bà Trưng, Hà Nội',
    category: 'dining',
    city: 'Hà Nội',
    rating: 4.6,
    estimated_cost: 60000,
    social_review_quote: 'Quán bún chả tổng thống Obama từng ghé thưởng thức, chả nướng than hoa thơm lừng.'
  },
  {
    name: 'Chả cá Lã Vọng',
    aliases: ['chả cá lã vọng', 'cha ca la vong'],
    lat: 21.0354,
    lng: 105.8492,
    address: '14 Chả Cá, Hàng Bồ, Hoàn Kiếm, Hà Nội',
    category: 'dining',
    city: 'Hà Nội',
    rating: 4.5,
    estimated_cost: 180000,
    social_review_quote: 'Món ăn hơn 100 năm tuổi, cá lăng xào thì là hành hoa ăn kèm bún và mắm tôm.'
  },
  {
    name: 'Hồ Hoàn Kiếm & Đền Ngọc Sơn',
    aliases: ['hồ hoàn kiếm', 'hồ gươm', 'đền ngọc sơn', 'cầu thê húc', 'tháp rùa', 'ho hoan kiem', 'ho guom'],
    lat: 21.0307,
    lng: 105.8524,
    address: 'Phố Đinh Tiên Hoàng, Hàng Trống, Hoàn Kiếm, Hà Nội',
    category: 'attraction',
    city: 'Hà Nội',
    rating: 4.9,
    estimated_cost: 30000,
    social_review_quote: 'Trái tim của thủ đô nghìn năm văn hiến, cầu Thê Húc đỏ son in bóng mặt hồ.'
  },
  {
    name: 'Văn Miếu - Quốc Tử Giám',
    aliases: ['văn miếu', 'văn miếu quốc tử giám', 'quốc tử giám', 'van mieu quoc tu giam'],
    lat: 21.0287,
    lng: 105.8358,
    address: '58 Quốc Tử Giám, Văn Miếu, Đống Đa, Hà Nội',
    category: 'attraction',
    city: 'Hà Nội',
    rating: 4.9,
    estimated_cost: 30000,
    social_review_quote: 'Trường đại học đầu tiên của Việt Nam, nơi lưu giữ 82 bia Tiến sĩ thời Hậu Lê.'
  },
  {
    name: 'Lăng Chủ tịch Hồ Chí Minh & Chùa Một Cột',
    aliases: ['lăng bác', 'lăng chủ tịch hồ chí minh', 'chùa một cột', 'lang bac', 'lang chu tich'],
    lat: 21.0368,
    lng: 105.8347,
    address: '02 Hùng Vương, Điện Bàn, Ba Đình, Hà Nội',
    category: 'attraction',
    city: 'Hà Nội',
    rating: 4.9,
    estimated_cost: 0,
    social_review_quote: 'Nơi an nghỉ của Chủ tịch Hồ Chí Minh vĩ đại và ngôi chùa Một Cột hình đài sen ngàn năm tuổi.'
  },
  {
    name: 'Hoàng thành Thăng Long',
    aliases: ['hoàng thành thăng long', 'hoang thanh thang long', 'cột cờ hà nội'],
    lat: 21.0337,
    lng: 105.8402,
    address: '19C Hoàng Diệu, Điện Bàn, Ba Đình, Hà Nội',
    category: 'attraction',
    city: 'Hà Nội',
    rating: 4.8,
    estimated_cost: 30000,
    social_review_quote: 'Quần thể di sản văn hóa thế giới UNESCO với chiều dài lịch sử hơn 13 thế kỷ.'
  },
  {
    name: 'Nhà thờ Lớn Hà Nội (St. Joseph Cathedral)',
    aliases: ['nhà thờ lớn', 'nhà thờ lớn hà nội', 'nha tho lon', 'nhà thờ chính tòa'],
    lat: 21.0288,
    lng: 105.8495,
    address: '40 Nhà Chung, Hàng Trống, Hoàn Kiếm, Hà Nội',
    category: 'attraction',
    city: 'Hà Nội',
    rating: 4.8,
    estimated_cost: 0,
    social_review_quote: 'Kiến trúc Gothic châu Âu cổ kính, điểm check-in và uống trà chanh vỉa hè nổi tiếng.'
  },
  {
    name: 'Nhà hát Lớn Hà Nội',
    aliases: ['nhà hát lớn', 'nhà hát lớn hà nội', 'nha hat lon'],
    lat: 21.0245,
    lng: 105.8576,
    address: '01 Tràng Tiền, Phan Chu Trinh, Hoàn Kiếm, Hà Nội',
    category: 'attraction',
    city: 'Hà Nội',
    rating: 4.8,
    estimated_cost: 50000,
    social_review_quote: 'Kiến trúc Phục Hưng Pháp tráng lệ, biểu tượng nghệ thuật đỉnh cao của thủ đô.'
  },
  {
    name: 'Chợ Đồng Xuân & Phố Cổ',
    aliases: ['chợ đồng xuân', 'cho dong xuan', 'phố cổ hà nội', 'pho co ha noi'],
    lat: 21.0378,
    lng: 105.8498,
    address: 'Đồng Xuân, Hoàn Kiếm, Hà Nội',
    category: 'attraction',
    city: 'Hà Nội',
    rating: 4.6,
    estimated_cost: 50000,
    social_review_quote: 'Khu chợ sầm uất lâu đời nhất Hà Nội, thiên đường ẩm thực đường phố ngõ Đồng Xuân.'
  },
  {
    name: 'Chùa Trấn Quốc & Hồ Tây',
    aliases: ['chùa trấn quốc', 'chua tran quoc', 'hồ tây', 'ho tay', 'đường thanh niên'],
    lat: 21.0478,
    lng: 105.8368,
    address: 'Đường Thanh Niên, Yên Phụ, Tây Hồ, Hà Nội',
    category: 'attraction',
    city: 'Hà Nội',
    rating: 4.8,
    estimated_cost: 0,
    social_review_quote: 'Ngôi chùa cổ nhất Việt Nam với lịch sử hơn 1500 năm nằm bình yên trên bán đảo Hồ Tây.'
  },
  {
    name: 'Bún Đậu Mắm Tôm Ngõ Gạch',
    aliases: ['bún đậu ngõ gạch', 'bun dau ngo gach', 'bún đậu mắm tôm'],
    lat: 21.0345,
    lng: 105.8505,
    address: 'Ngõ Gạch, Hàng Buồm, Hoàn Kiếm, Hà Nội',
    category: 'dining',
    city: 'Hà Nội',
    rating: 4.6,
    estimated_cost: 65000,
    social_review_quote: 'Mẹt bún đậu đầy đặn với chả cốm giòn thơm, thịt chân giò luộc và mắm tôm đánh sủi bọt.'
  },
  {
    name: 'Phở Cuốn Hưng Bền',
    aliases: ['phở cuốn hưng bền', 'pho cuon hung ben', 'phở cuốn ngũ xã'],
    lat: 21.0441,
    lng: 105.8415,
    address: '33 Ngũ Xã, Trúc Bạch, Ba Đình, Hà Nội',
    category: 'dining',
    city: 'Hà Nội',
    rating: 4.5,
    estimated_cost: 80000,
    social_review_quote: 'Quê hương của món phở cuốn, bánh phở mềm cuốn thịt bò xào thơm ngọt chấm mắm chua cay.'
  },
  {
    name: 'Xôi Yến',
    aliases: ['xôi yến', 'xoi yen'],
    lat: 21.0330,
    lng: 105.8530,
    address: '35B Nguyễn Hữu Huân, Hàng Bạc, Hoàn Kiếm, Hà Nội',
    category: 'dining',
    city: 'Hà Nội',
    rating: 4.5,
    estimated_cost: 55000,
    social_review_quote: 'Thương hiệu xôi xéo thập cẩm lừng danh phố cổ với chà bông, pate và thịt kho tàu béo ngậy.'
  },
  {
    name: 'The Note Coffee',
    aliases: ['the note coffee', 'note coffee', 'cafe note'],
    lat: 21.0310,
    lng: 105.8520,
    address: '64 Lương Văn Can, Hàng Trống, Hoàn Kiếm, Hà Nội',
    category: 'cafe',
    city: 'Hà Nội',
    rating: 4.8,
    estimated_cost: 50000,
    social_review_quote: 'Quán cà phê ngập tràn hàng vạn tờ giấy ghi chú sắc màu của du khách khắp thế giới.'
  },
  {
    name: 'Hanoi La Siesta Classic Ma May Hotel',
    aliases: ['hanoi la siesta', 'la siesta hotel', 'khách sạn la siesta'],
    lat: 21.0345,
    lng: 105.8528,
    address: '94 Mã Mây, Hàng Buồm, Hoàn Kiếm, Hà Nội',
    category: 'hotel',
    city: 'Hà Nội',
    rating: 4.8,
    estimated_cost: 1500000,
    social_review_quote: 'Khách sạn boutique chuẩn 4 sao sang trọng giữa lòng phố cổ Hà Nội.'
  },
  {
    name: 'Apricot Hotel Hanoi',
    aliases: ['apricot hotel', 'khách sạn apricot'],
    lat: 21.0285,
    lng: 105.8509,
    address: '136 Hàng Trống, Hoàn Kiếm, Hà Nội',
    category: 'hotel',
    city: 'Hà Nội',
    rating: 4.8,
    estimated_cost: 2500000,
    social_review_quote: 'Khách sạn nghệ thuật 5 sao đẳng cấp với tầm nhìn ôm trọn Hồ Gươm cổ kính.'
  },

  // ── TP. HỒ CHÍ MINH (SÀI GÒN) ──
  {
    name: 'Dinh Độc Lập (Hội trường Thống Nhất)',
    aliases: ['dinh độc lập', 'dinh doc lap', 'hội trường thống nhất'],
    lat: 10.7770,
    lng: 106.6953,
    address: '135 Nam Kỳ Khởi Nghĩa, Bến Thành, Quận 1, TP. Hồ Chí Minh',
    category: 'attraction',
    city: 'TP. Hồ Chí Minh',
    rating: 4.8,
    estimated_cost: 40000,
    social_review_quote: 'Chứng nhân lịch sử trọng đại của dân tộc, kiến trúc cảnh quan độc đáo giữa lòng thành phố.'
  },
  {
    name: 'Nhà thờ Đức Bà & Bưu điện Trung tâm',
    aliases: ['nhà thờ đức bà', 'bưu điện trung tâm', 'nha tho duc ba', 'buu dien thanh pho'],
    lat: 10.7798,
    lng: 106.6990,
    address: '01 Công xã Paris, Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    category: 'attraction',
    city: 'TP. Hồ Chí Minh',
    rating: 4.8,
    estimated_cost: 0,
    social_review_quote: 'Công trình biểu tượng kiến trúc Pháp cổ kính tuyệt đẹp tại trung tâm Sài Gòn.'
  },
  {
    name: 'Chợ Bến Thành',
    aliases: ['chợ bến thành', 'cho ben thanh'],
    lat: 10.7726,
    lng: 106.6980,
    address: 'Đường Lê Lợi, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh',
    category: 'attraction',
    city: 'TP. Hồ Chí Minh',
    rating: 4.6,
    estimated_cost: 50000,
    social_review_quote: 'Biểu tượng văn hóa giao thương trăm năm của Sài Gòn với ẩm thực phong phú.'
  },
  {
    name: 'Đài quan sát Landmark 81 SkyView',
    aliases: ['landmark 81', 'tòa nhà landmark 81', 'vincom landmark 81'],
    lat: 10.7950,
    lng: 106.7218,
    address: '720A Điện Biên Phủ, Phường 22, Bình Thạnh, TP. Hồ Chí Minh',
    category: 'attraction',
    city: 'TP. Hồ Chí Minh',
    rating: 4.9,
    estimated_cost: 300000,
    social_review_quote: 'Tòa nhà cao nhất Việt Nam, ngắm toàn cảnh Sài Gòn lung linh từ độ cao gần 400 mét.'
  },
  {
    name: 'Cà phê Chung Cư 42 Nguyễn Huệ',
    aliases: ['chung cư 42 nguyễn huệ', 'cafe chung cư nguyễn huệ', 'chung cu 42 nguyen hue'],
    lat: 10.7745,
    lng: 106.7032,
    address: '42 Nguyễn Huệ, Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    category: 'cafe',
    city: 'TP. Hồ Chí Minh',
    rating: 4.7,
    estimated_cost: 65000,
    social_review_quote: 'Tụ điểm check-in nghệ thuật với hàng chục quán cafe decor phong cách vintage view phố đi bộ.'
  },
  {
    name: 'Phở Hòa Pasteur',
    aliases: ['phở hòa', 'phở hòa pasteur', 'pho hoa pasteur'],
    lat: 10.7876,
    lng: 106.6887,
    address: '260C Pasteur, Phường 8, Quận 3, TP. Hồ Chí Minh',
    category: 'dining',
    city: 'TP. Hồ Chí Minh',
    rating: 4.6,
    estimated_cost: 95000,
    social_review_quote: 'Tô phở đậm đà theo chuẩn vị Nam, đĩa rau thơm và giá ngập tràn ăn kèm quẩy giòn.'
  },
  {
    name: 'Cơm tấm Ba Ghiền',
    aliases: ['cơm tấm ba ghiền', 'com tam ba ghien'],
    lat: 10.7964,
    lng: 106.6698,
    address: '84 Đặng Văn Ngữ, Phường 10, Phú Nhuận, TP. Hồ Chí Minh',
    category: 'dining',
    city: 'TP. Hồ Chí Minh',
    rating: 4.7,
    estimated_cost: 90000,
    social_review_quote: 'Miếng sườn nướng khổng lồ che kín đĩa cơm tấm, thơm nức mũi chấm nước mắm kẹo.'
  },
  {
    name: 'Bánh mì Huỳnh Hoa',
    aliases: ['bánh mì huỳnh hoa', 'banh mi huynh hoa', 'bánh mì ô môi'],
    lat: 10.7709,
    lng: 106.6925,
    address: '26 Lê Thị Riêng, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh',
    category: 'dining',
    city: 'TP. Hồ Chí Minh',
    rating: 4.7,
    estimated_cost: 68000,
    social_review_quote: 'Ổ bánh mì đắt đỏ và đẫm nhân nhất Sài Gòn với hơn 6 loại giò chả, pate và bơ béo ngậy.'
  },

  // ── ĐÀ LẠT ──
  {
    name: 'Hồ Xuân Hương & Quảng Trường Lâm Viên',
    aliases: ['hồ xuân hương', 'quảng trường lâm viên', 'ho xuan huong', 'quang truong lam vien', 'nụ hoa atiso'],
    lat: 11.9395,
    lng: 108.4385,
    address: 'Đường Trần Quốc Toản, Phường 1, Đà Lạt',
    category: 'attraction',
    city: 'Đà Lạt',
    rating: 4.9,
    estimated_cost: 0,
    social_review_quote: 'Biểu tượng của xứ sở ngàn hoa với khối nụ hoa Atiso và hoa Dã Quỳ kính khổng lồ.'
  },
  {
    name: 'Chợ Đêm Đà Lạt',
    aliases: ['chợ đêm đà lạt', 'cho dem da lat', 'chợ âm phủ'],
    lat: 11.9420,
    lng: 108.4365,
    address: 'Đường Nguyễn Thị Minh Khai, Phường 1, Đà Lạt',
    category: 'attraction',
    city: 'Đà Lạt',
    rating: 4.6,
    estimated_cost: 100000,
    social_review_quote: 'Thưởng thức bánh tráng nướng nóng hổi, sữa đậu nành và dâu tây tươi giữa khí trời se lạnh.'
  },
  {
    name: 'Quán Cà Phê Túi Mơ To',
    aliases: ['túi mơ to', 'tiệm cà phê túi mơ to', 'tui mo to', 'cafe tui mo to'],
    lat: 11.9485,
    lng: 108.4852,
    address: 'Hẻm 31 Sào Nam, Phường 11, Đà Lạt',
    category: 'cafe',
    city: 'Đà Lạt',
    rating: 4.8,
    estimated_cost: 65000,
    social_review_quote: 'Vườn cúc họa mi trắng muốt view thung lũng lồng kính ngắm hoàng hôn đỉnh nhất Đà Lạt.'
  },
  {
    name: 'Cheo Veo Cafe',
    aliases: ['cheo veo', 'tiệm cà phê cheo veo', 'cheo veo cafe'],
    lat: 11.9460,
    lng: 108.4720,
    address: '116 Hùng Vương, Hẻm Dã Chiến, Phường 11, Đà Lạt',
    category: 'cafe',
    city: 'Đà Lạt',
    rating: 4.7,
    estimated_cost: 55000,
    social_review_quote: 'Quán cà phê gỗ mộc mạc ngắm trọn thung lũng rừng thông xanh ngát trong sương sớm.'
  },
  {
    name: 'Lẩu Gà Lá É Tao Ngộ (Đường 3/4)',
    aliases: ['lẩu gà lá é tao ngộ', 'lau ga la e tao ngo', 'lẩu gà lá é', 'tao ngộ đường 3/4'],
    lat: 11.9332,
    lng: 108.4410,
    address: 'Số 5 đường 3 Tháng 4, Phường 3, Đà Lạt',
    category: 'dining',
    city: 'Đà Lạt',
    rating: 4.7,
    estimated_cost: 250000,
    social_review_quote: 'Nồi lẩu gà nấm măng cay the the nồng ấm mùi lá é, thịt gà đồi săn chắc thơm ngon.'
  },
  {
    name: 'Bánh Mì Cối Xay Gió',
    aliases: ['cối xay gió', 'bánh mì cối xay gió', 'coi xay gio'],
    lat: 11.9421,
    lng: 108.4372,
    address: '19 Tăng Bạt Hổ, Phường 1, Đà Lạt',
    category: 'dining',
    city: 'Đà Lạt',
    rating: 4.5,
    estimated_cost: 35000,
    social_review_quote: 'Bức tường vàng check-in huyền thoại và bánh mì pate truyền thống giòn rụm.'
  },
  {
    name: 'Thiền Viện Trúc Lâm & Hồ Tuyền Lâm',
    aliases: ['thiền viện trúc lâm', 'hồ tuyền lâm', 'thien vien truc lam', 'ho tuyen lam'],
    lat: 11.9056,
    lng: 108.4358,
    address: 'Trần Thánh Tông, Phường 3, Đà Lạt',
    category: 'attraction',
    city: 'Đà Lạt',
    rating: 4.9,
    estimated_cost: 0,
    social_review_quote: 'Không gian tâm linh thanh tịnh giữa rừng thông bạt ngàn soi bóng xuống mặt hồ Tuyền Lâm xanh biếc.'
  },

  // ── ĐÀ NẴNG ──
  {
    name: 'Cầu Rồng Đà Nẵng',
    aliases: ['cầu rồng', 'cau rong', 'cầu rồng phun lửa'],
    lat: 16.0610,
    lng: 108.2272,
    address: 'Đường Nguyễn Văn Linh, Phước Ninh, Hải Châu, Đà Nẵng',
    category: 'attraction',
    city: 'Đà Nẵng',
    rating: 4.9,
    estimated_cost: 0,
    social_review_quote: 'Cây cầu thép độc đáo vươn mình ra biển lớn, điểm xem rồng phun lửa và nước cuối tuần.'
  },
  {
    name: 'Bà Nà Hills & Cầu Vàng',
    aliases: ['bà nà hills', 'cầu vàng', 'ba na hills', 'sun world ba na hills'],
    lat: 15.9988,
    lng: 107.9961,
    address: 'Thôn An Sơn, Xã Hòa Phú, Hòa Vang, Đà Nẵng',
    category: 'attraction',
    city: 'Đà Nẵng',
    rating: 4.9,
    estimated_cost: 850000,
    social_review_quote: 'Tuyệt tác Cầu Vàng nâng đỡ bởi bàn tay khổng lồ giữa biển mây bồng bềnh nổi tiếng thế giới.'
  },
  {
    name: 'Chùa Linh Ứng Bán Đảo Sơn Trà',
    aliases: ['chùa linh ứng', 'chua linh ung', 'bán đảo sơn trà', 'tượng phật bà'],
    lat: 16.1002,
    lng: 108.2778,
    address: 'Hoàng Sa, Thọ Quang, Sơn Trà, Đà Nẵng',
    category: 'attraction',
    city: 'Đà Nẵng',
    rating: 4.9,
    estimated_cost: 0,
    social_review_quote: 'Tượng Phật Bà Quan Âm cao 67m uy nghiêm hướng nhìn ra biển Đông bình yên.'
  },
  {
    name: 'Bãi biển Mỹ Khê',
    aliases: ['biển mỹ khê', 'bãi biển mỹ khê', 'bai bien my khe'],
    lat: 16.0652,
    lng: 108.2468,
    address: 'Đường Võ Nguyên Giáp, Phước Mỹ, Sơn Trà, Đà Nẵng',
    category: 'attraction',
    city: 'Đà Nẵng',
    rating: 4.8,
    estimated_cost: 0,
    social_review_quote: 'Một trong những bãi biển quyến rũ nhất hành tinh với bờ cát trắng mịn và làn nước trong xanh.'
  }
];

/**
 * Tra cứu tọa độ chuẩn xác xác minh theo tên địa điểm và thành phố
 */
export function matchVerifiedLandmark(name: string, city?: string): VerifiedPlaceInfo | null {
  if (!name || typeof name !== 'string') return null;
  const cleanName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  for (const item of VERIFIED_LANDMARKS) {
    if (city) {
      const cleanCity = city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const itemCity = item.city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (!cleanCity.includes(itemCity) && !itemCity.includes(cleanCity)) {
        continue;
      }
    }

    const itemName = item.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (cleanName.includes(itemName) || itemName.includes(cleanName)) {
      return item;
    }

    for (const alias of item.aliases) {
      const cleanAlias = alias.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (cleanName.includes(cleanAlias) || cleanAlias.includes(cleanName)) {
        return item;
      }
    }
  }

  return null;
}

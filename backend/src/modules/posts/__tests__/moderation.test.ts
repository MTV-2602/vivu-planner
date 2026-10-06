import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkContentViolation,
  BLACKLIST_PATTERNS,
} from '../moderation.service';

describe('Post Content Moderation Service', () => {
  describe('checkContentViolation - Valid & Harmless Content (Happy Path)', () => {
    it('cho phép các câu ngắn hợp lệ thông thường', () => {
      const shortSafeTexts = [
        'Quán ngon',
        'Rất thích',
        'Cà phê view đẹp',
        'Địa chỉ ở Hà Nội',
        'Dịch vụ tốt',
        '10/10',
        'Tuyệt vời!',
      ];

      for (const text of shortSafeTexts) {
        const result = checkContentViolation(text);
        assert.equal(
          result.isViolated,
          false,
          `Câu ngắn "${text}" không được đánh dấu vi phạm`
        );
        assert.equal(result.reason, undefined);
        assert.equal(result.matchedWord, undefined);
      }
    });

    it('cho phép các bài đánh giá chi tiết có giá cả, thời gian, địa chỉ', () => {
      const detailedReviews = [
        'Phở bò số 10 Lý Quốc Sư, mở cửa từ 6h sáng đến 22h đêm, giá khoảng 50k một bát.',
        'Chuyến đi Đà Nẵng 3 ngày 2 đêm của nhóm mình hết 2.500.000đ mỗi người.',
        'Không gian quán yên tĩnh, thích hợp ngồi làm việc và đọc sách vào cuối tuần.',
      ];

      for (const text of detailedReviews) {
        const result = checkContentViolation(text);
        assert.equal(result.isViolated, false);
      }
    });

    it('không bắt nhầm các từ ngữ hàng ngày có chứa từ tố tương tự danh sách đen (False Positive Prevention)', () => {
      const trickySafeTexts = [
        'Hôm nay mình ăn cá viên chiên và lẩu cá hồi rất ngon.', // có từ "cá", không phải "cá độ"
        'Tối nay thành phố bắn pháo hoa mừng năm mới.', // có từ "bắn", không phải "bắn cá đổi thưởng"
        'Món bạc xỉu ở đây pha chuẩn vị Sài Gòn.', // có từ "bạc", "xỉu", không phải "đánh bạc" hay "tài xỉu"
        'Quán này có nhiều tài năng trẻ biểu diễn acoustic.', // có từ "tài", không phải "tài xỉu"
        'Hũ sữa chua nếp cẩm mát lạnh ăn cùng hoa quả.', // có từ "hũ", không phải "nổ hũ"
        'Nổ bỏng ngô thơm lừng góc phố cổ.', // có từ "nổ", không phải "nổ hũ"
        'Mẹ nấu ăn rất ngon, luôn chăm sóc cả gia đình.', // có từ "mẹ", không phải "mẹ mày"
        'Đồ nướng và đồ ngọt ở nhà hàng phong phú.', // có từ "đồ", không phải "đồ ngu"
        'Bé nhà mình trông ngu ngơ dễ thương quá.', // không phải cụm "đồ ngu"
        'Quý khách vui lòng liên hệ trực tiếp tại quầy lễ tân để đặt bàn.', // có "liên hệ" nhưng không kèm SĐT
        'Vui lòng inbox fanpage chính thức để xem toàn bộ menu.', // có "inbox" nhưng không kèm SĐT
        'Hotline hỗ trợ khách hàng sẽ được công bố trên website chính thức.', // có "hotline" nhưng không kèm SĐT
        'Món canh này a bit spicy nhưng vẫn ăn được.', // có từ "bit", không phải link bit.ly
      ];

      for (const text of trickySafeTexts) {
        const result = checkContentViolation(text);
        assert.equal(
          result.isViolated,
          false,
          `Văn bản an toàn "${text}" bị bắt nhầm thành vi phạm: ${result.reason} (${result.matchedWord})`
        );
      }
    });
  });

  describe('checkContentViolation - Profanity & Insults (Negative Cases)', () => {
    it('phát hiện các từ ngữ thô tục, chửi thề phổ biến', () => {
      const profanitySamples = [
        { text: 'Quán ăn phục vụ như đồ ngu vậy', expectedWord: 'đồ ngu' },
        { text: 'Đồ ăn chán vcl không quay lại nữa', expectedWord: 'vcl' },
        { text: 'Chờ cả tiếng chưa có đồ ăn clgt', expectedWord: 'clgt' },
        { text: 'Thái độ nhân viên như chó đẻ', expectedWord: 'chó đẻ' },
        { text: 'Nhân viên phục vụ óc chó thật sự', expectedWord: 'óc chó' },
        { text: 'Bảo quản đồ ăn mẹ mày xem có ôi thiu không', expectedWord: 'mẹ mày' },
        { text: 'Cút đm đi đừng có làm phiền tao', expectedWord: 'đm' },
        { text: 'Địt mẹ quán ăn bẩn thỉu', expectedWord: 'địt' },
      ];

      for (const sample of profanitySamples) {
        const result = checkContentViolation(sample.text);
        assert.equal(result.isViolated, true, `Phải phát hiện vi phạm trong: "${sample.text}"`);
        assert.equal(result.reason, 'ngôn từ xúc phạm, thiếu văn minh');
        assert.ok(
          result.matchedWord?.toLowerCase().includes(sample.expectedWord.toLowerCase()),
          `matchedWord "${result.matchedWord}" phải chứa "${sample.expectedWord}"`
        );
      }
    });
  });

  describe('checkContentViolation - Gambling & Illegal Finance (Negative Cases)', () => {
    it('phát hiện nội dung liên quan đến cờ bạc, cá độ, tài xỉu, nổ hũ', () => {
      const gamblingSamples = [
        { text: 'Anh em vào kèo cá độ bóng đá tối nay ăn chắc', expectedWord: 'cá độ' },
        { text: 'Kinh nghiệm đánh bạc online luôn thắng', expectedWord: 'đánh bạc' },
        { text: 'Dự đoán kết quả lô đề miền Bắc hôm nay', expectedWord: 'lô đề' },
        { text: 'Tải app tài xỉu kiếm tiền triệu mỗi ngày', expectedWord: 'tài xỉu' },
        { text: 'Sòng casino trực tuyến uy tín hàng đầu', expectedWord: 'casino' },
        { text: 'Nạp rút kubet cực nhanh không lo bị chặn', expectedWord: 'kubet' },
        { text: 'Đăng ký thabet nhận ngay khuyến mãi 100k', expectedWord: 'thabet' },
        { text: 'Game nổ hũ phát tài giật jackpot siêu khủng', expectedWord: 'nổ hũ' },
        { text: 'Trải nghiệm bắn cá đổi thưởng tiền mặt', expectedWord: 'bắn cá đổi thưởng' },
        { text: 'Cần vốn gấp alo cho vay nặng lãi duyệt 5 phút', expectedWord: 'cho vay nặng lãi' },
        { text: 'Dịch vụ bốc bát họ uy tín tại Hà Nội', expectedWord: 'bốc bát họ' },
        { text: 'Dự án tiền ảo lừa đảo nhà đầu tư hàng trăm tỷ', expectedWord: 'tiền ảo lừa đảo' },
      ];

      for (const sample of gamblingSamples) {
        const result = checkContentViolation(sample.text);
        assert.equal(result.isViolated, true, `Phải phát hiện vi phạm trong: "${sample.text}"`);
        assert.equal(result.reason, 'nội dung cờ bạc, cá độ hoặc tài chính bất hợp pháp');
        assert.ok(
          result.matchedWord?.toLowerCase().includes(sample.expectedWord.toLowerCase()),
          `matchedWord "${result.matchedWord}" phải chứa "${sample.expectedWord}"`
        );
      }
    });
  });

  describe('checkContentViolation - Phone Number & Zalo Spam (Negative Cases)', () => {
    it('phát hiện các hành vi spam số điện thoại quảng cáo qua hotline/zalo/sđt', () => {
      const spamSamples = [
        'Liên hệ: 0912345678 để nhận ưu đãi đặc biệt',
        'Inbox Zalo 0389998877 đặt vé xe giá rẻ',
        'Hotline: +84988776655 tư vấn tour trọn gói',
        'Mọi chi tiết xin SĐT: 0777123456',
        'Call ngay 0581234567 để nhận voucher giảm 50%',
        'Inbox 0855667788 để được hướng dẫn chi tiết',
      ];

      for (const text of spamSamples) {
        const result = checkContentViolation(text);
        assert.equal(result.isViolated, true, `Phải phát hiện spam trong: "${text}"`);
        assert.equal(result.reason, 'chứa số điện thoại quảng cáo hoặc spam');
        assert.ok(result.matchedWord, 'Phải có matchedWord');
      }
    });
  });

  describe('checkContentViolation - Malicious & Illegal Links (Negative Cases)', () => {
    it('phát hiện các liên kết lừa đảo, cờ bạc, kiếm tiền nhanh', () => {
      const linkSamples = [
        { text: 'Tham gia nhóm kéo tại t.me/keotaiXiuVIP để húp lộc', expectedWord: 't.me/' },
        { text: 'Xem tài liệu và nhận quà tại bit.ly/nhanquafree', expectedWord: 'bit.ly/' },
        { text: 'Cổng cacuoc uy tín nhất hiện nay', expectedWord: 'cacuoc' },
        { text: 'Tải gamebai đổi thưởng hot nhất mùa hè', expectedWord: 'gamebai' },
        { text: 'Phương pháp kiemtiennhanh không cần vốn', expectedWord: 'kiemtiennhanh' },
        { text: 'Top nhacai xanh chín nạp rút 1:1', expectedWord: 'nhacai' },
      ];

      for (const sample of linkSamples) {
        const result = checkContentViolation(sample.text);
        assert.equal(result.isViolated, true, `Phải phát hiện link độc hại trong: "${sample.text}"`);
        assert.equal(result.reason, 'chứa liên kết quảng cáo hoặc cờ bạc trái phép');
        assert.ok(
          result.matchedWord?.toLowerCase().includes(sample.expectedWord.toLowerCase()),
          `matchedWord "${result.matchedWord}" phải chứa "${sample.expectedWord}"`
        );
      }
    });
  });

  describe('checkContentViolation - Edge Cases & Robustness', () => {
    it('xử lý an toàn chuỗi rỗng và khoảng trắng', () => {
      assert.deepEqual(checkContentViolation(''), { isViolated: false });
      assert.deepEqual(checkContentViolation('   '), { isViolated: false });
      assert.deepEqual(checkContentViolation('\n\t\r'), { isViolated: false });
    });

    it('xử lý an toàn các kiểu dữ liệu không hợp lệ (null, undefined, number, object)', () => {
      assert.deepEqual(checkContentViolation(null as any), { isViolated: false });
      assert.deepEqual(checkContentViolation(undefined as any), { isViolated: false });
      assert.deepEqual(checkContentViolation(12345 as any), { isViolated: false });
      assert.deepEqual(checkContentViolation({} as any), { isViolated: false });
      assert.deepEqual(checkContentViolation([] as any), { isViolated: false });
    });

    it('không phân biệt chữ hoa, chữ thường (Case Insensitive)', () => {
      const upperCaseViolations = [
        { text: 'ĐỒ NGU HẾT CHỖ NÓI', reason: 'ngôn từ xúc phạm, thiếu văn minh' },
        { text: 'VCL QUÁN ĂN NÀY', reason: 'ngôn từ xúc phạm, thiếu văn minh' },
        { text: 'TÀI XỈU ONLINE UY TÍN', reason: 'nội dung cờ bạc, cá độ hoặc tài chính bất hợp pháp' },
        { text: 'NỔ HŨ ĐỔI THƯỞNG', reason: 'nội dung cờ bạc, cá độ hoặc tài chính bất hợp pháp' },
        { text: 'ZALO 0912345678 LIÊN HỆ', reason: 'chứa số điện thoại quảng cáo hoặc spam' },
        { text: 'TRUY CẬP T.ME/LINK_TELEGRAM', reason: 'chứa liên kết quảng cáo hoặc cờ bạc trái phép' },
      ];

      for (const sample of upperCaseViolations) {
        const result = checkContentViolation(sample.text);
        assert.equal(result.isViolated, true);
        assert.equal(result.reason, sample.reason);
      }
    });

    it('phát hiện từ ngữ vi phạm khi đi liền với dấu câu', () => {
      const punctuatedSamples = [
        'Trời ơi, đồ ngu!',
        'Chán thật đấy...vcl.',
        '(tài xỉu) chơi vui có thưởng',
        'Liên hệ: 0912345678.',
      ];

      for (const text of punctuatedSamples) {
        const result = checkContentViolation(text);
        assert.equal(result.isViolated, true, `Phải phát hiện vi phạm khi có dấu câu: "${text}"`);
      }
    });
  });

  describe('BLACKLIST_PATTERNS Configuration Integrity', () => {
    it('chứa đầy đủ 4 nhóm quy tắc kiểm duyệt với regex hợp lệ và reason rõ ràng', () => {
      assert.equal(BLACKLIST_PATTERNS.length, 4);

      for (const item of BLACKLIST_PATTERNS) {
        assert.ok(item.pattern instanceof RegExp, 'Mỗi item phải có pattern là RegExp');
        assert.ok(typeof item.reason === 'string' && item.reason.length > 0, 'Reason phải là string không rỗng');
      }
    });

    it('đảm bảo các pattern riêng lẻ không match với các từ thông thường', () => {
      const [profanityRule, gamblingRule, spamPhoneRule, linksRule] = BLACKLIST_PATTERNS;

      // Profanity rule không match "ngu ngơ", "đồ dùng", "mẹ hiền"
      assert.equal(profanityRule.pattern.test('ngu ngơ'), false);
      assert.equal(profanityRule.pattern.test('đồ dùng gia đình'), false);
      assert.equal(profanityRule.pattern.test('mẹ hiền'), false);

      // Gambling rule không match "cá kho", "bắn cung", "đánh đàn", "bạc xỉu"
      assert.equal(gamblingRule.pattern.test('cá kho'), false);
      assert.equal(gamblingRule.pattern.test('bắn cung'), false);
      assert.equal(gamblingRule.pattern.test('đánh đàn guitar'), false);
      assert.equal(gamblingRule.pattern.test('uống ly bạc xỉu'), false);

      // Phone spam rule không match SĐT đứng riêng lẻ không có từ khóa liên hệ hoặc từ khóa không có SĐT
      assert.equal(spamPhoneRule.pattern.test('liên hệ trực tiếp'), false);
      assert.equal(spamPhoneRule.pattern.test('gặp nhau lúc 10h'), false);

      // Link spam rule không match các link hoặc từ ngữ bình thường
      assert.equal(linksRule.pattern.test('https://google.com'), false);
      assert.equal(linksRule.pattern.test('kiếm tiền chân chính'), false);
    });
  });
});

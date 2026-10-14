import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import * as xlsx from 'xlsx';
import {
  normalizePartnerCity,
  parseVndPrice,
  parseRating,
  parseOpeningHours,
  parseDurationMinutes,
  extractCoordinatesFromUrl,
  resolveGoogleMapsCoordinates,
  resolveGoogleMapsVenuePin,
  isAllowedGoogleMapsHost,
  isPrivateOrReservedHost,
  validateMapsUrl,
  hasControlOrEscapedChars,
  verifyRecordPinEvidence,
  ALLOWED_GOOGLE_MAPS_HOSTS,
  getFallbackCoordinatesForCity,
  parsePartnerExcel,
  importPartners,
  CITY_COORDINATES
} from '../partnerImport.service';
import { supabaseAdmin } from '../../../config/supabase';
import { previewLocalData, commitLocalData } from '../localDataImport.service';

describe('Partner Excel Import & Geocoding Test Suite', () => {
  it('nạp tối đa 50 dòng mà không gọi Maps kể cả client gửi resolveCoords=true', async () => {
    const originalFrom = supabaseAdmin.from;
    const originalGet = axios.get;
    const stored: any[] = [];
    let dbQueries = 0;
    let mapsRequests = 0;
    try {
      (axios as any).get = () => { mapsRequests++; throw new Error('Không được resolve Maps khi nạp'); };
      (supabaseAdmin as any).from = () => {
        dbQueries++;
        return { select: async () => ({ data: stored, error: null }),
          insert: (payload: any[]) => ({ select: () => ({ single: async () => {
            const saved = { ...payload[0], id: String(stored.length) }; stored.push(saved);
            return { data: { id: saved.id }, error: null };
          } }) }) };
      };
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(Array.from({ length: 51 }, (_, index) => ({
        'Tên': `Địa điểm kiểm thử ${index}`, 'Tỉnh/ Thành phố': index === 50 ? 'Đà Nẵng' : 'Hà Nội',
        'Vị trí': `Địa chỉ ${index}`, 'Tag': 'Cà phê', 'Google Maps': `https://maps.app.goo.gl/testSource${index}`,
        'Trung bình giá/ pax (VNĐ)': '100.000–200.000'
      }))), 'Sheet1');
      const preview = await previewLocalData('admin-fixture', { fileBase64: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }).toString('base64') });
      dbQueries = 0;
      await assert.rejects(commitLocalData('admin-fixture', { previewId: preview.previewId, resolveCoords: true }), /tối đa 50/);
      await assert.rejects(commitLocalData('admin-fixture', { previewId: preview.previewId, selectedIndexes: preview.rows.map(row => row.index), resolveCoords: true }), /tối đa 50/);
      assert.equal(dbQueries, 0);
      assert.equal(mapsRequests, 0);
      const result = await commitLocalData('admin-fixture', { previewId: preview.previewId, cities: ['Hà Nội'], resolveCoords: true });
      assert.equal(result.selected, 50);
      assert.equal(result.staged, 50);
      assert.equal(result.imported, 0);
      assert.equal(result.failed, 0);
      assert.equal(result.verificationDeferred, true);
      assert.equal(mapsRequests, 0);
      assert.equal(stored.length, 50);
      assert.ok(stored.every(record => record.lat === null && record.lng === null && record.active_status === false));
      assert.equal(stored[0].i18n.source_maps_url, 'https://maps.app.goo.gl/testSource0');
      assert.equal(stored[0].i18n.original_price, '100.000–200.000');
    } finally { supabaseAdmin.from = originalFrom; axios.get = originalGet; }
  });

  it('nạp lại lô lỗi một phần chỉ bổ sung dòng còn thiếu và giữ dữ liệu admin', async () => {
    const originalFrom = supabaseAdmin.from;
    const stored: any[] = [];
    let failOnce = true;
    try {
      (supabaseAdmin as any).from = () => ({ select: async () => ({ data: stored, error: null }),
        insert: (payload: any[]) => ({ select: () => ({ single: async () => {
          if (payload[0].name === 'Địa điểm B' && failOnce) { failOnce = false; return { data: null, error: { message: 'Lỗi DB tạm thời' } }; }
          const record = { ...payload[0], id: String(stored.length) }; stored.push(record);
          return { data: { id: record.id }, error: null };
        } }) }) });
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(['A', 'B', 'C'].map(name => ({
        'Tên': `Địa điểm ${name}`, 'Tỉnh/ Thành phố': 'Hà Nội', 'Vị trí': name,
        'Google Maps': `https://maps.app.goo.gl/testSource${name}`
      }))), 'Sheet1');
      const preview = await previewLocalData('admin-fixture', { fileBase64: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }).toString('base64') });
      const first = await commitLocalData('admin-fixture', { previewId: preview.previewId, selectedIndexes: [0, 1, 2], resolveCoords: true });
      assert.equal(first.failed, 1);
      assert.equal(first.staged, 2);
      stored[0].description = 'Ghi chú admin phải giữ';
      const repeated = await commitLocalData('admin-fixture', { previewId: preview.previewId, selectedIndexes: [0, 1, 2], resolveCoords: true });
      assert.equal(repeated.failed, 0);
      assert.equal(repeated.staged, 1);
      assert.equal(repeated.skipped, 2);
      assert.equal(stored.length, 3);
      assert.equal(stored[0].description, 'Ghi chú admin phải giữ');
    } finally { supabaseAdmin.from = originalFrom; }
  });
  it('lưu điểm chưa xác minh trong hàng chờ và nạp lại không ghi đè dữ liệu admin', async () => {
    const originalFrom = supabaseAdmin.from;
    const stored: any[] = [];
    try {
      (supabaseAdmin as any).from = () => ({
        select: () => Promise.resolve({ data: stored, error: null }),
        insert: (payload: any[]) => ({ select: () => ({ single: async () => {
          stored.push({ ...payload[0], id: 'pending-fixture' });
          return { data: { id: 'pending-fixture' }, error: null };
        } }) })
      });
      const records: any[] = [{ name: 'Điểm chờ kiểm thử', city: 'Hà Nội', address: 'Địa chỉ kiểm thử', category: 'cafe', lat: 21, lng: 105, price_level: 2, admin_rating: 3, i18n: { location_verified: false, coordinate_source: 'unresolved' } }];
      const first = await importPartners(records, { resolveCoords: false });
      assert.equal(first.staged, 1);
      assert.equal(first.success, 0);
      assert.equal(stored[0].lat, null);
      assert.equal(stored[0].lng, null);
      assert.equal(stored[0].active_status, false);
      stored[0].description = 'Ghi chú admin cần giữ';
      const repeated = await importPartners(records, { resolveCoords: false });
      assert.equal(repeated.skipped, 1);
      assert.equal(stored.length, 1);
      assert.equal(stored[0].description, 'Ghi chú admin cần giữ');
    } finally { supabaseAdmin.from = originalFrom; }
  });

  it('bản xem trước ký số chỉ cho đúng admin nạp đúng các dòng đã chọn', async () => {
    const originalFrom = supabaseAdmin.from;
    const stored: any[] = [];
    try {
      (supabaseAdmin as any).from = () => ({
        select: () => Promise.resolve({ data: [], error: null }),
        insert: (payload: any[]) => ({ select: () => ({ single: async () => {
          stored.push(payload[0]); return { data: { id: String(stored.length) }, error: null };
        } }) })
      });
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([
        { 'Tên': 'Quán kiểm thử A', 'Tỉnh/ Thành phố': 'Hà Nội', 'Vị trí': 'A', 'Tag': 'Cà phê' },
        { 'Tên': 'Quán kiểm thử B', 'Tỉnh/ Thành phố': 'Đà Nẵng', 'Vị trí': 'B', 'Tag': 'Cà phê' }
      ]), 'Sheet1');
      const fileBase64 = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }).toString('base64');
      const preview = await previewLocalData('admin-a', { fileBase64 });
      await assert.rejects(commitLocalData('admin-b', { previewId: preview.previewId, resolveCoords: false }), /không hợp lệ/);
      await assert.rejects(commitLocalData('admin-a', { previewId: preview.previewId + 'tampered', resolveCoords: false }), /không hợp lệ/);
      const originalNow = Date.now;
      const future = originalNow() + 31 * 60 * 1000;
      try {
        Date.now = () => future;
        await assert.rejects(commitLocalData('admin-a', { previewId: preview.previewId, resolveCoords: false }), /hết hạn/);
      } finally { Date.now = originalNow; }
      const result = await commitLocalData('admin-a', { previewId: preview.previewId, selectedIndexes: [1], resolveCoords: false });
      assert.equal(result.staged, 1);
      assert.equal(result.excluded, 1);
      assert.equal(stored[0].name, 'Quán kiểm thử B');
      assert.equal(stored[0].lat, null);
    } finally { supabaseAdmin.from = originalFrom; }
  });
  // =========================================================================
  // TC-EXCEL-001: Parse đúng 367 đối tác từ LOCATION DATA.xlsx với 19 thành phố chuẩn hóa
  // =========================================================================
  describe('TC-EXCEL-001: Parse đúng 367 đối tác từ LOCATION DATA.xlsx với 19 thành phố chuẩn hóa', () => {
    it('parse đầy đủ 367 dòng đối tác từ LOCATION DATA.xlsx và toàn bộ thành phố thuộc 19 thành phố chuẩn', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const defaultPaths = [
        'C:\\Users\\vinhmt\\Downloads\\LOCATION DATA.xlsx',
        path.resolve(process.cwd(), 'LOCATION DATA.xlsx'),
        path.resolve(process.cwd(), '..', 'LOCATION DATA.xlsx')
      ];
      const testPath = defaultPaths.find(p => fs.existsSync(p));

      // File tồn tại trên môi trường chạy test
      assert.ok(testPath, 'File LOCATION DATA.xlsx phải tồn tại trên máy kiểm thử');

      const records = await parsePartnerExcel(testPath);
      assert.equal(records.length, 367, 'Số lượng đối tác parse từ Excel phải chính xác 367');

      const standardized19Cities = new Set(Object.keys(CITY_COORDINATES));
      assert.equal(standardized19Cities.size, 19, 'Hệ thống phải có đúng 19 thành phố chuẩn hóa trong CITY_COORDINATES');

      const cityCounts: Record<string, number> = {};
      for (const record of records) {
        assert.ok(record.name && record.name.trim().length > 0, 'Tên đối tác không được để trống');
        assert.ok(
          standardized19Cities.has(record.city),
          `Thành phố '${record.city}' của đối tác '${record.name}' phải thuộc danh mục 19 thành phố chuẩn`
        );
        assert.equal(record.lat, null, `Địa điểm ${record.name} chưa xác minh phải để trống vĩ độ`);
        assert.equal(record.lng, null, `Địa điểm ${record.name} chưa xác minh phải để trống kinh độ`);
        assert.ok(record.price_level >= 1 && record.price_level <= 4, `Price level ${record.price_level} phải nằm trong khoảng 1-4`);
        assert.ok(record.admin_rating >= 1 && record.admin_rating <= 5, `Admin rating ${record.admin_rating} phải từ 1-5`);
        assert.equal(record.active_status, false, 'Khi chưa resolve URL, đối tác phải inactive để chống giả mạo tọa độ');
        assert.equal(record.i18n?.location_verified, false, 'Khi chưa resolve, location_verified phải là false');
        assert.equal(record.i18n?.coordinate_source, 'unresolved', 'Khi chưa resolve, coordinate_source phải là unresolved');
        assert.ok(record.tags?.includes('pro'), 'Đối tác nạp từ Excel phải có tag pro');
        cityCounts[record.city] = (cityCounts[record.city] || 0) + 1;
      }

      // Kiểm tra record mẫu đầu tiên
      const first = records[0];
      assert.equal(first.name, 'The Home Pizza Phu Quoc');
      assert.equal(first.city, 'Phú Quốc');
      assert.equal(first.category, 'restaurant');
      assert.ok(first.booking_url?.includes('maps.app.goo.gl'));

      // Kiểm tra có phân bổ qua các tỉnh thành lớn
      assert.ok((cityCounts['Phú Quốc'] || 0) > 0, 'Phú Quốc phải có đối tác');
      assert.ok((cityCounts['Đà Nẵng'] || 0) > 0 || (cityCounts['Hội An'] || 0) > 0, 'Đà Nẵng / Hội An phải có đối tác');
    });

    it('chuẩn hóa chính xác tất cả 19 tên thành phố đầu vào hỗn hợp hoặc có tên cũ', () => {
      const cityTestPairs: [string, string][] = [
        ['An Giang - Phú Quốc', 'Phú Quốc'],
        ['Bình Định (cũ) - Quy Nhơn', 'Quy Nhơn'],
        ['Bình Thuận (cũ) - Mũi Né/ Phan Thiết', 'Phan Thiết'],
        ['Bình Thuận (cũ) - Phan Thiết, Phú Quý', 'Phan Thiết'],
        ['Khánh Hòa - Nha Trang, Bình Hưng', 'Nha Trang'],
        ['Lâm Đồng - Đà Lạt', 'Đà Lạt'],
        ['Lào Cai - Sa Pa', 'Sa Pa'],
        ['Ninh Thuận (cũ) - Vĩnh Hy', 'Vĩnh Hy'],
        ['Phú Yên (cũ)', 'Phú Yên'],
        ['Quảng Ngãi - Lý Son', 'Lý Sơn'],
        ['Quảng Ngãi - Lý Sơn', 'Lý Sơn'],
        ['Sơn La - Mộc Châu', 'Mộc Châu'],
        ['Tuyên Quang - Hà Giang (cũ)', 'Hà Giang'],
        ['Vũng Tàu (cũ)', 'Vũng Tàu'],
        ['Hồ Chí Minh', 'Hồ Chí Minh'],
        ['Hà Nội', 'Hà Nội'],
        ['Huế', 'Huế'],
        ['Đắk Lắk', 'Đắk Lắk'],
        ['Ninh Bình', 'Ninh Bình'],
      ];

      for (const [raw, expected] of cityTestPairs) {
        assert.equal(normalizePartnerCity(raw), expected, `Chuẩn hóa sai cho '${raw}' -> mong đợi '${expected}'`);
      }
    });

    it('phân biệt chính xác giữa Đà Nẵng và Hội An theo địa chỉ và tên', () => {
      assert.equal(
        normalizePartnerCity('Đà Nẵng - Hội An', '166 Trần Phú, Old Town, Hội An', 'Mê Hội An'),
        'Hội An'
      );
      assert.equal(
        normalizePartnerCity('Đà Nẵng - Hội An', 'Biển An Bàng, Hội An', 'Cháo Nghêu Cô Gió'),
        'Hội An'
      );
      assert.equal(
        normalizePartnerCity('Đà Nẵng - Hội An', '114 Bạch Đằng, Hải Châu, Đà Nẵng', 'Ăn Thôi'),
        'Đà Nẵng'
      );
    });
  });

  // =========================================================================
  // TC-EXCEL-002: Chuẩn hóa Tag (Ăn uống, Ăn uống Local, Cà phê, Lưu trú, Vui chơi)
  // =========================================================================
  describe('TC-EXCEL-002: Chuẩn hóa Tag sang Category và Tag chuẩn', () => {
    it('chuẩn hóa Ăn uống -> category: restaurant, tags: restaurant, dining', async () => {
      const rows = [{
        'Tên': 'Quán Cơm Niêu Gia Đình',
        'Tỉnh/ Thành phố': 'Đà Nẵng',
        'Vị trí': '123 Nguyễn Tất Thành, Đà Nẵng',
        'Tag': 'Ăn uống',
        'Google Maps': 'https://maps.google.com/?q=16.0544,108.2022'
      }];
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), 'Sheet1');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const records = await parsePartnerExcel(buf);
      assert.equal(records.length, 1);
      assert.equal(records[0].category, 'restaurant');
      assert.ok(records[0].tags?.includes('pro'));
      assert.ok(records[0].tags?.includes('restaurant'));
      assert.ok(records[0].tags?.includes('dining'));
      assert.ok(records[0].cuisine_tags?.includes('dining'));
    });

    it('chuẩn hóa Ăn uống Local -> category: restaurant, tags: restaurant + local_food + am_thuc_dia_phuong', async () => {
      const rows = [{
        'Tên': 'Bún Bò O Cương',
        'Tỉnh/ Thành phố': 'Huế',
        'Vị trí': '6 Trần Thúc Nhẫn, Huế',
        'Tag': 'Ăn uống Local',
        'Google Maps': 'https://maps.google.com/?q=16.4637,107.5908'
      }];
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), 'Sheet1');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const records = await parsePartnerExcel(buf);
      assert.equal(records.length, 1);
      assert.equal(records[0].category, 'restaurant');
      assert.ok(records[0].tags?.includes('local_food'));
      assert.ok(records[0].tags?.includes('am_thuc_dia_phuong'));
      assert.ok(records[0].cuisine_tags?.includes('local_food'));
    });

    it('chuẩn hóa Cà phê -> category: cafe, tags: cafe, coffee', async () => {
      const rows = [{
        'Tên': 'Tiệm Cà Phê Mùa Hè',
        'Tỉnh/ Thành phố': 'Đà Lạt',
        'Vị trí': '10 Đặng Thái Thân, Đà Lạt',
        'Tag': 'Cà phê',
        'Google Maps': 'https://maps.google.com/?q=11.9404,108.4583'
      }];
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), 'Sheet1');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const records = await parsePartnerExcel(buf);
      assert.equal(records.length, 1);
      assert.equal(records[0].category, 'cafe');
      assert.ok(records[0].tags?.includes('cafe'));
      assert.ok(records[0].tags?.includes('coffee'));
      assert.ok(records[0].amenity_tags?.includes('cafe'));
    });

    it('chuẩn hóa Lưu trú -> category: hotel (hoặc homestay nếu tên chứa homestay)', async () => {
      const rows = [
        {
          'Tên': 'Khách Sạn Biển Xanh',
          'Tỉnh/ Thành phố': 'Nha Trang',
          'Vị trí': '1 Trần Phú, Nha Trang',
          'Tag': 'Lưu trú',
          'Google Maps': 'https://maps.google.com/?q=12.2388,109.1967'
        },
        {
          'Tên': 'Nhà Của Nắng Homestay',
          'Tỉnh/ Thành phố': 'Đà Lạt',
          'Vị trí': '15 Lê Hồng Phong, Đà Lạt',
          'Tag': 'Lưu trú',
          'Google Maps': 'https://maps.google.com/?q=11.9404,108.4583'
        }
      ];
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), 'Sheet1');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const records = await parsePartnerExcel(buf);
      assert.equal(records.length, 2);

      // Hotel thông thường
      assert.equal(records[0].category, 'hotel');
      assert.ok(records[0].tags?.includes('hotel'));
      assert.ok(records[0].tags?.includes('accommodation'));

      // Homestay theo tên
      assert.equal(records[1].category, 'homestay');
      assert.ok(records[1].tags?.includes('homestay'));
      assert.ok(records[1].tags?.includes('accommodation'));
    });

    it('chuẩn hóa Vui chơi -> category: attraction, tags: attraction, entertainment', async () => {
      const rows = [{
        'Tên': 'Công Viên Nước Đầm Sen',
        'Tỉnh/ Thành phố': 'Hồ Chí Minh',
        'Vị trí': 'Số 3 Hòa Bình, Quận 11, Hồ Chí Minh',
        'Tag': 'Vui chơi',
        'Google Maps': 'https://maps.google.com/?q=10.7769,106.7009'
      }];
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), 'Sheet1');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const records = await parsePartnerExcel(buf);
      assert.equal(records.length, 1);
      assert.equal(records[0].category, 'attraction');
      assert.ok(records[0].tags?.includes('attraction'));
      assert.ok(records[0].tags?.includes('entertainment'));
    });
  });

  // =========================================================================
  // TC-EXCEL-003: Parse giá tiền sang price_level (1-4) chính xác theo các ngưỡng
  // =========================================================================
  describe('TC-EXCEL-003: Parse giá tiền sang price_level (1-4) theo ngưỡng định lượng', () => {
    it('ngưỡng dưới 100k (<= 100.000) -> price_level 1', () => {
      assert.equal(parseVndPrice('50.000').priceLevel, 1);
      assert.equal(parseVndPrice('1-100.000').priceLevel, 1);
      assert.equal(parseVndPrice('99.000').priceLevel, 1);
      assert.equal(parseVndPrice('100.000').priceLevel, 1);
      assert.equal(parseVndPrice('100.000 VNĐ').priceLevel, 1);
    });

    it('ngưỡng 100k - 300k (100.000 < x < 300.000) -> price_level 2', () => {
      assert.equal(parseVndPrice('150.000').priceLevel, 2);
      assert.equal(parseVndPrice('200.000-300.000').priceLevel, 2);
      assert.equal(parseVndPrice('250.000đ/pax').priceLevel, 2);
      assert.equal(parseVndPrice('299.000').priceLevel, 2);
    });

    it('ngưỡng 300k - 800k (300.000 <= x < 800.000) -> price_level 3', () => {
      assert.equal(parseVndPrice('300.000').priceLevel, 3);
      assert.equal(parseVndPrice('300.000-500.000').priceLevel, 3);
      assert.equal(parseVndPrice('600.000').priceLevel, 3);
      assert.equal(parseVndPrice('799.000 VNĐ').priceLevel, 3);
    });

    it('ngưỡng trên 800k (>= 800.000) -> price_level 4', () => {
      assert.equal(parseVndPrice('800.000').priceLevel, 4);
      assert.equal(parseVndPrice('850.000').priceLevel, 4);
      assert.equal(parseVndPrice('1,000,000+').priceLevel, 4);
      assert.equal(parseVndPrice('1.500.000 - 3.000.000').priceLevel, 4);
      assert.equal(parseVndPrice('5.000.000').priceLevel, 4);
    });

    it('fallback an toàn: giá rỗng hoặc ghi Không có -> mặc định price_level 2', () => {
      const p1 = parseVndPrice('Không có');
      assert.equal(p1.priceLevel, 2);
      assert.equal(p1.originalText, 'Không có');

      const p2 = parseVndPrice('');
      assert.equal(p2.priceLevel, 2);

      const p3 = parseVndPrice(null);
      assert.equal(p3.priceLevel, 2);
      assert.equal(p3.originalText, 'Khoảng giá tiêu chuẩn');
    });
  });

  // =========================================================================
  // TC-EXCEL-004: Parse rating và giờ mở cửa (cả dạng float Excel và dạng chuỗi)
  // =========================================================================
  describe('TC-EXCEL-004: Parse rating và giờ mở cửa định dạng đa dạng', () => {
    it('parse rating chính xác số nguyên admin_rating (1-5), float originalRating, và reviewCount', () => {
      const r1 = parseRating('4,8(8.498)');
      assert.equal(r1.rating, 5);
      assert.equal(r1.originalRating, 4.8);
      assert.equal(r1.reviewCount, 8498);

      const r2 = parseRating('4.5 (222)');
      assert.equal(r2.rating, 5);
      assert.equal(r2.originalRating, 4.5);
      assert.equal(r2.reviewCount, 222);

      const r3 = parseRating('3.8 (50)');
      assert.equal(r3.rating, 4);
      assert.equal(r3.originalRating, 3.8);
      assert.equal(r3.reviewCount, 50);

      const r4 = parseRating('3.2 (15)');
      assert.equal(r4.rating, 3);
      assert.equal(r4.originalRating, 3.2);
      assert.equal(r4.reviewCount, 15);

      const rEmpty = parseRating(null);
      assert.equal(rEmpty.rating, 4);
      assert.equal(rEmpty.originalRating, 4.5);
      assert.equal(rEmpty.reviewCount, 0);
    });

    it('parse giờ mở cửa chính xác từ số thập phân Excel (fraction of day: 0.0 - 1.0)', () => {
      // 0.25 = 06:00, 0.9583333333333334 = 23:00
      assert.equal(parseOpeningHours(0.25, 0.9583333333333334), '06:00 - 23:00');

      // 0.3333333333333333 = 08:00, 0.9166666666666666 = 22:00
      assert.equal(parseOpeningHours(0.3333333333333333, 0.9166666666666666), '08:00 - 22:00');

      // 0.6875 = 16:30, 0 = 00:00
      assert.equal(parseOpeningHours(0.6875, 0), '16:30 - 00:00');

      // Dạng chuỗi số thực: "0.25", "0.5"
      assert.equal(parseOpeningHours('0.25', '0.5'), '06:00 - 12:00');
    });

    it('parse giờ mở cửa chính xác từ dạng chuỗi văn bản và multi-line', () => {
      assert.equal(parseOpeningHours('07:30', '22:00'), '07:30 - 22:00');

      const multiline = 'Tue - Wed: Closed\nThu - Mon: 11:00 - 22:30';
      const parsedMultiline = parseOpeningHours(multiline, undefined);
      assert.ok(parsedMultiline.includes('11:00 - 22:30'));

      // Fallback khi cả hai trường đều rỗng
      assert.equal(parseOpeningHours(null, null), '07:00 - 22:00');
    });

    it('parse thời gian ước lượng (giờ) sang số phút chuẩn', () => {
      assert.equal(parseDurationMinutes('0.5 - 1.5'), 60);
      assert.equal(parseDurationMinutes('1-3+'), 120);
      assert.equal(parseDurationMinutes('0.5 - 2'), 75);
      assert.equal(parseDurationMinutes('Không có'), 60);
      assert.equal(parseDurationMinutes('46082'), 60); // Giá trị dị thường từ Excel serial bị chặn
    });
  });

  // =========================================================================
  // TC-GEO-001: Trích xuất tọa độ chính xác từ link Google Maps có chứa !3d... và !4d....
  // =========================================================================
  describe('TC-GEO-001: Trích xuất tọa độ chính xác từ link Google Maps có !3d và !4d', () => {
    it('trích xuất đúng lat lng số thực từ URL Google Maps chứa data=!3d... và !4d...', () => {
      const url1 = 'https://www.google.com/maps/place/Foo/@10.0,60.0/data=!4m6!3m5!1s0x0!8m2!3d10.197456!4d103.968635';
      const c1 = extractCoordinatesFromUrl(url1);
      assert.ok(c1);
      assert.equal(c1.lat, 10.197456);
      assert.equal(c1.lng, 103.968635);

      const url2 = 'https://maps.google.com/place/The+Home+Pizza/@10.197456,103.968635,17z/data=!3d10.197456!4d103.968635';
      const c2 = extractCoordinatesFromUrl(url2);
      assert.ok(c2);
      assert.equal(c2.lat, 10.197456);
      assert.equal(c2.lng, 103.968635);

      // Tọa độ âm (bán cầu Nam/Tây nếu có)
      const url3 = 'https://maps.google.com/?data=!3d-12.3456!4d108.9876';
      const c3 = extractCoordinatesFromUrl(url3);
      assert.ok(c3);
      assert.equal(c3.lat, -12.3456);
      assert.equal(c3.lng, 108.9876);
    });
  });

  // =========================================================================
  // TC-GEO-002: Từ chối viewport @ và search ?q, chỉ nhận pin !3d!4d
  // =========================================================================
  describe('TC-GEO-002: Từ chối viewport @ và search ?q, chỉ nhận pin !3d!4d', () => {
    it('từ chối pattern viewport / camera @lat,lng (trả về null vì không phải venue pin)', () => {
      const url = 'https://www.google.com/maps/@21.0285,105.8542,15z';
      const c = extractCoordinatesFromUrl(url);
      assert.equal(c, null, 'Viewport @lat,lng không được chấp nhận làm tọa độ ghim địa điểm');
    });

    it('từ chối pattern tìm kiếm ?q=lat,lng và ?ll=lat,lng (chỉ chấp nhận pin-only !3d!4d)', () => {
      const url1 = 'https://maps.google.com/?q=16.0544,108.2022';
      assert.equal(extractCoordinatesFromUrl(url1), null);

      const url2 = 'https://maps.google.com/search?hl=vi&q=10.7769,106.7009';
      assert.equal(extractCoordinatesFromUrl(url2), null);

      const url3 = 'https://maps.google.com/?ll=12.2388,109.1967';
      assert.equal(extractCoordinatesFromUrl(url3), null);
    });

    it('trả về null an toàn khi URL không có tọa độ', () => {
      assert.equal(extractCoordinatesFromUrl('https://maps.google.com/place/SomePlaceWithoutCoords'), null);
      assert.equal(extractCoordinatesFromUrl(''), null);
      assert.equal(extractCoordinatesFromUrl(null as any), null);
    });

    it('kiểm tra chặt chẽ biên độ tọa độ lat [-90, 90], lng [-180, 180] và loại trừ Null Island', () => {
      assert.equal(extractCoordinatesFromUrl('https://maps.google.com/?data=!3d95.1234!4d106.1234'), null, 'Lat > 90 phải bị từ chối');
      assert.equal(extractCoordinatesFromUrl('https://maps.google.com/?data=!3d-95.1234!4d106.1234'), null, 'Lat < -90 phải bị từ chối');
      assert.equal(extractCoordinatesFromUrl('https://maps.google.com/?data=!3d10.1234!4d185.1234'), null, 'Lng > 180 phải bị từ chối');
      assert.equal(extractCoordinatesFromUrl('https://maps.google.com/?data=!3d10.1234!4d-185.1234'), null, 'Lng < -180 phải bị từ chối');
      assert.equal(extractCoordinatesFromUrl('https://maps.google.com/?data=!3d0!4d0'), null, 'Null Island (0, 0) phải bị từ chối');
    });

    it('từ chối URL chứa nhiều pin xung đột nhau, chấp nhận pin lặp lại giống hệt', () => {
      // 2 pin có tọa độ khác nhau -> xung đột -> null
      const conflictUrl = 'https://maps.google.com/?data=!3d10.1234!4d106.1234!3d20.5678!4d108.5678';
      assert.equal(extractCoordinatesFromUrl(conflictUrl), null);

      // 2 pin có tọa độ giống hệt nhau -> chấp nhận
      const repeatedUrl = 'https://maps.google.com/?data=!3d10.1234!4d106.1234!3d10.1234!4d106.1234';
      const c = extractCoordinatesFromUrl(repeatedUrl);
      assert.ok(c);
      assert.equal(c.lat, 10.1234);
      assert.equal(c.lng, 106.1234);
    });

    it('từ chối trích xuất pin từ URL không thuộc allowlist hoặc không an toàn', () => {
      // URL độc hại mang !3d!4d không được lấy tọa độ
      assert.equal(extractCoordinatesFromUrl('https://evil.com/?data=!3d10.1234!4d106.1234'), null);
      assert.equal(extractCoordinatesFromUrl('https://google.evil.uk/?data=!3d10.1234!4d106.1234'), null);
      assert.equal(extractCoordinatesFromUrl('http://maps.google.com/?data=!3d10.1234!4d106.1234'), null);
      assert.equal(extractCoordinatesFromUrl('https://google.com/drive?data=!3d10.1234!4d106.1234'), null);
    });
  });

  // =========================================================================
  // TC-GEO-003: Fallback an toàn về tọa độ thành phố khi link hỏng/timeout
  // =========================================================================
  describe('TC-GEO-003: Fallback an toàn về tọa độ thành phố khi link hỏng/timeout', () => {
    it('resolveGoogleMapsCoordinates trả về null khi link hỏng, timeout hoặc không hợp lệ', async () => {
      assert.equal(await resolveGoogleMapsCoordinates(''), null);
      assert.equal(await resolveGoogleMapsCoordinates(null as any), null);
      assert.equal(await resolveGoogleMapsCoordinates('https://broken-url-not-found-12345.local/map'), null);
    });

    it('getFallbackCoordinatesForCity trả về tọa độ chính xác cho toàn bộ 19 thành phố chuẩn hóa', () => {
      const cities = [
        'Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Hội An', 'Huế',
        'Đà Lạt', 'Nha Trang', 'Phú Quốc', 'Sa Pa', 'Vũng Tàu',
        'Quy Nhơn', 'Phan Thiết', 'Ninh Bình', 'Phú Yên', 'Lý Sơn',
        'Vĩnh Hy', 'Hà Giang', 'Mộc Châu', 'Đắk Lắk'
      ];

      for (const city of cities) {
        const coords = getFallbackCoordinatesForCity(city);
        assert.ok(coords, `Thiếu tọa độ cho thành phố ${city}`);
        assert.equal(coords.lat, CITY_COORDINATES[city].lat);
        assert.equal(coords.lng, CITY_COORDINATES[city].lng);
        assert.ok(coords.lat >= 8.0 && coords.lat <= 24.0, `Lat ngoài phạm vi Việt Nam cho ${city}`);
        assert.ok(coords.lng >= 102.0 && coords.lng <= 110.0, `Lng ngoài phạm vi Việt Nam cho ${city}`);
      }
    });

    it('khi URL Google Maps hỏng, địa điểm để trống tọa độ và không hoạt động', async () => {
      const rows = [
        {
          'Tên': 'Quán Cà Phê Mây Đồi',
          'Tỉnh/ Thành phố': 'Hà Giang',
          'Vị trí': 'Đồng Văn, Hà Giang',
          'Tag': 'Cà phê',
          'Google Maps': 'https://broken-link.invalid/cafe'
        }
      ];
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), 'Sheet1');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const records = await parsePartnerExcel(buf);
      assert.equal(records.length, 1);
      assert.equal(records[0].city, 'Hà Giang');
      assert.equal(records[0].lat, null);
      assert.equal(records[0].lng, null);
      assert.equal(records[0].active_status, false);
      assert.equal(records[0].i18n?.location_verified, false);
      assert.equal(records[0].i18n?.coordinate_source, 'unresolved');
    });
  });

  // =========================================================================
  // TC-GEO-004: Chống SSRF và kiểm soát Host Google Maps nghiêm ngặt
  // =========================================================================
  describe('TC-GEO-004: Chống SSRF và kiểm soát Host Google Maps nghiêm ngặt', () => {
    it('chỉ chấp nhận các host hợp lệ chính xác của Google Maps, chặn domain mở rộng regex', () => {
      assert.equal(isAllowedGoogleMapsHost('maps.app.goo.gl'), true);
      assert.equal(isAllowedGoogleMapsHost('goo.gl'), true);
      assert.equal(isAllowedGoogleMapsHost('google.com'), true);
      assert.equal(isAllowedGoogleMapsHost('www.google.com'), true);
      assert.equal(isAllowedGoogleMapsHost('maps.google.com'), true);
      assert.equal(isAllowedGoogleMapsHost('google.com.vn'), true);
      assert.equal(isAllowedGoogleMapsHost('www.google.com.vn'), true);
      assert.equal(isAllowedGoogleMapsHost('maps.google.com.vn'), true);

      // Chặn các domain giả mạo, tấn công mở rộng qua regex google.*
      assert.equal(isAllowedGoogleMapsHost('google.evil.uk'), false);
      assert.equal(isAllowedGoogleMapsHost('google.corp.cc'), false);
      assert.equal(isAllowedGoogleMapsHost('google.test.io'), false);
      assert.equal(isAllowedGoogleMapsHost('google.hack.me'), false);
      assert.equal(isAllowedGoogleMapsHost('maps.google.co.uk'), false);
      assert.equal(isAllowedGoogleMapsHost('evil-google.com'), false);
      assert.equal(isAllowedGoogleMapsHost('google.com.attacker.com'), false);
      assert.equal(isAllowedGoogleMapsHost('attacker.com'), false);
    });

    it('chặn triệt để IP riêng tư, loopback và metadata cloud', () => {
      assert.equal(isPrivateOrReservedHost('localhost'), true);
      assert.equal(isPrivateOrReservedHost('127.0.0.1'), true);
      assert.equal(isPrivateOrReservedHost('0.0.0.0'), true);
      assert.equal(isPrivateOrReservedHost('::1'), true);
      assert.equal(isPrivateOrReservedHost('10.0.0.5'), true);
      assert.equal(isPrivateOrReservedHost('172.16.0.1'), true);
      assert.equal(isPrivateOrReservedHost('192.168.1.100'), true);
      assert.equal(isPrivateOrReservedHost('169.254.169.254'), true);
      assert.equal(isPrivateOrReservedHost('server.local'), true);
      assert.equal(isPrivateOrReservedHost('maps.app.goo.gl'), false);
    });

    it('validateMapsUrl từ chối giao thức không phải HTTPS hoặc URL tấn công', () => {
      assert.equal(validateMapsUrl('http://maps.google.com').valid, false);
      assert.equal(validateMapsUrl('http://maps.google.com').error, 'non_https_protocol');

      assert.equal(validateMapsUrl('https://localhost:4000/api').valid, false);
      assert.equal(validateMapsUrl('https://localhost:4000/api').error, 'private_ip_blocked');

      assert.equal(validateMapsUrl('https://169.254.169.254/latest/meta-data').valid, false);
      assert.equal(validateMapsUrl('https://169.254.169.254/latest/meta-data').error, 'private_ip_blocked');

      assert.equal(validateMapsUrl('https://attacker.com/evil').valid, false);
      assert.equal(validateMapsUrl('https://attacker.com/evil').error, 'host_not_allowlisted');

      assert.equal(validateMapsUrl('https://maps.app.goo.gl/abcdef').valid, true);
    });

    it('validateMapsUrl từ chối userinfo, port tùy ý và path không hợp lệ', () => {
      // Từ chối userinfo
      const userinfoRes = validateMapsUrl('https://user:password@maps.google.com/maps?data=!3d10.1!4d106.1');
      assert.equal(userinfoRes.valid, false);
      assert.equal(userinfoRes.error, 'userinfo_not_allowed');

      // Từ chối cổng khác 443
      const portRes = validateMapsUrl('https://maps.google.com:8443/maps?data=!3d10.1!4d106.1');
      assert.equal(portRes.valid, false);
      assert.equal(portRes.error, 'invalid_port');

      // Từ chối đường dẫn không phải Maps trên google.com
      const driveRes = validateMapsUrl('https://google.com/drive');
      assert.equal(driveRes.valid, false);
      assert.equal(driveRes.error, 'invalid_maps_path');

      // Từ chối đường dẫn không phải Maps trên goo.gl
      const googlRes = validateMapsUrl('https://goo.gl/randomlink');
      assert.equal(googlRes.valid, false);
      assert.equal(googlRes.error, 'invalid_maps_path');

      // Từ chối shortlink rỗng trên maps.app.goo.gl
      const emptyShortlinkRes = validateMapsUrl('https://maps.app.goo.gl/');
      assert.equal(emptyShortlinkRes.valid, false);
      assert.equal(emptyShortlinkRes.error, 'missing_shortlink_path');
    });

    it('validateMapsUrl từ chối ký tự điều khiển thô, escaped hoặc percent-encoded (null byte, CRLF, v.v.)', () => {
      // Percent-encoded null byte (%00)
      const nullRes = validateMapsUrl('https://maps.google.com/place/foo%00bar/data=!3d10.7!4d106.7');
      assert.equal(nullRes.valid, false);
      assert.equal(nullRes.error, 'control_characters_not_allowed');

      // CRLF injection (%0d%0a)
      const crlfRes = validateMapsUrl('https://maps.google.com/place/foo%0d%0aSet-Cookie:bad/data=!3d10.7!4d106.7');
      assert.equal(crlfRes.valid, false);
      assert.equal(crlfRes.error, 'control_characters_not_allowed');

      // Raw control characters
      assert.equal(validateMapsUrl('https://maps.google.com/place/foo\x00bar').valid, false);
      assert.equal(validateMapsUrl('https://maps.google.com/place/foo\r\nbar').valid, false);

      // Escaped control characters
      assert.equal(validateMapsUrl('https://maps.google.com/place/foo\\r\\nbar').valid, false);
      assert.equal(validateMapsUrl('https://maps.google.com/place/foo\\u0000bar').valid, false);
      assert.equal(validateMapsUrl('https://maps.google.com/place/foo\\x00bar').valid, false);

      // extractCoordinatesFromUrl từ chối trích xuất từ các URL chứa ký tự điều khiển
      assert.equal(extractCoordinatesFromUrl('https://maps.google.com/place/foo%00bar/data=!3d10.7!4d106.7'), null);
      assert.equal(extractCoordinatesFromUrl('https://maps.google.com/place/foo%0d%0aSet-Cookie:bad/data=!3d10.7!4d106.7'), null);
    });

    it('validateMapsUrl từ chối /search trên google.com và www.google.com, bảo toàn /search trên maps.google.com', () => {
      // /search trên www.google.com là Google Web Search, không phải Maps -> phải bị từ chối
      const webSearchRes = validateMapsUrl('https://www.google.com/search?q=10.77,106.70');
      assert.equal(webSearchRes.valid, false);
      assert.equal(webSearchRes.error, 'invalid_maps_path');
      assert.equal(extractCoordinatesFromUrl('https://www.google.com/search?q=10.77,106.70'), null);

      const googleSearchRes = validateMapsUrl('https://google.com/search?q=10.77,106.70');
      assert.equal(googleSearchRes.valid, false);
      assert.equal(googleSearchRes.error, 'invalid_maps_path');

      // /maps trên www.google.com là hợp lệ
      assert.equal(validateMapsUrl('https://www.google.com/maps?data=!3d10.1!4d106.1').valid, true);

      // /search trên maps.google.com là tính năng search của Maps -> valid: true, nhưng không phải venue pin
      const mapsSearchRes = validateMapsUrl('https://maps.google.com/search?hl=vi&q=10.7769,106.7009');
      assert.equal(mapsSearchRes.valid, true);
      // Venue pin extractor từ chối query search vì không có !3d!4d
      assert.equal(extractCoordinatesFromUrl('https://maps.google.com/search?hl=vi&q=10.7769,106.7009'), null);
    });

    it('validateMapsUrl bảo toàn URL chứa tên Unicode / tiếng Việt encode hợp lệ', () => {
      // Tên địa điểm tiếng Việt có dấu được encode chuẩn
      const validUnicodeUrl = 'https://www.google.com/maps/place/Ph%E1%BB%9F+B%C3%A1t+%C4%90%C3%A0n/@21.0333,105.8488,17z/data=!3d21.0333!4d105.8488';
      const val = validateMapsUrl(validUnicodeUrl);
      assert.equal(val.valid, true);

      const coords = extractCoordinatesFromUrl(validUnicodeUrl);
      assert.ok(coords);
      assert.equal(coords.lat, 21.0333);
      assert.equal(coords.lng, 105.8488);
    });

    it('validateMapsUrl từ chối các tiền tố giả mạo mapsEvil, placeEvil, mapsfoo với exact segment boundary', () => {
      // maps.google.com: từ chối /mapsEvil, /placeEvil, /mapsfoo, /searchEvil
      const evil1 = validateMapsUrl('https://maps.google.com/mapsEvil/data=!3d10.7!4d106.7');
      assert.equal(evil1.valid, false);
      assert.equal(evil1.error, 'invalid_maps_path');
      assert.equal(extractCoordinatesFromUrl('https://maps.google.com/mapsEvil/data=!3d10.7!4d106.7'), null);

      const evil2 = validateMapsUrl('https://maps.google.com/placeEvil/data=!3d10.7!4d106.7');
      assert.equal(evil2.valid, false);
      assert.equal(evil2.error, 'invalid_maps_path');
      assert.equal(extractCoordinatesFromUrl('https://maps.google.com/placeEvil/data=!3d10.7!4d106.7'), null);

      const evil3 = validateMapsUrl('https://maps.google.com/mapsfoo/data=!3d10.7!4d106.7');
      assert.equal(evil3.valid, false);
      assert.equal(evil3.error, 'invalid_maps_path');
      assert.equal(extractCoordinatesFromUrl('https://maps.google.com/mapsfoo/data=!3d10.7!4d106.7'), null);

      const evil4 = validateMapsUrl('https://maps.google.com/searchEvil?q=10.7,106.7');
      assert.equal(evil4.valid, false);
      assert.equal(evil4.error, 'invalid_maps_path');

      // google.com / www.google.com: từ chối /mapsEvil, /mapsfoo
      const evil5 = validateMapsUrl('https://www.google.com/mapsEvil?data=!3d10.7!4d106.7');
      assert.equal(evil5.valid, false);
      assert.equal(evil5.error, 'invalid_maps_path');
      assert.equal(extractCoordinatesFromUrl('https://www.google.com/mapsEvil?data=!3d10.7!4d106.7'), null);

      const evil6 = validateMapsUrl('https://google.com/mapsfoo');
      assert.equal(evil6.valid, false);
      assert.equal(evil6.error, 'invalid_maps_path');

      // goo.gl: từ chối /mapsEvil
      const evil7 = validateMapsUrl('https://goo.gl/mapsEvil');
      assert.equal(evil7.valid, false);
      assert.equal(evil7.error, 'invalid_maps_path');

      // Bảo toàn các segment được phê duyệt hợp lệ
      assert.equal(validateMapsUrl('https://maps.google.com/?data=!3d10.7!4d106.7').valid, true);
      assert.equal(validateMapsUrl('https://maps.google.com/maps?data=!3d10.7!4d106.7').valid, true);
      assert.equal(validateMapsUrl('https://maps.google.com/maps/place/Foo/@10.7,106.7/data=!3d10.7!4d106.7').valid, true);
      assert.equal(validateMapsUrl('https://maps.google.com/place/Foo/@10.7,106.7/data=!3d10.7!4d106.7').valid, true);
      assert.equal(validateMapsUrl('https://maps.google.com/dir/Origin/Dest').valid, true);
      assert.equal(validateMapsUrl('https://maps.google.com/timeline').valid, true);
      assert.equal(validateMapsUrl('https://maps.google.com/local/food').valid, true);
      assert.equal(validateMapsUrl('https://maps.google.com/@10.7,106.7,15z').valid, true);
      assert.equal(validateMapsUrl('https://www.google.com/maps/place/Foo').valid, true);
      assert.equal(validateMapsUrl('https://goo.gl/maps/valid123').valid, true);
    });

    it('resolveGoogleMapsVenuePin từ chối Location header chứa ký tự điều khiển thô (tab, CR, LF, null) trước khi gọi new URL', async () => {
      const originalAxiosGet = axios.get;
      const requestedUrls: string[] = [];
      try {
        (axios as any).get = async (url: string) => {
          requestedUrls.push(url);
          // Trả về redirect 302 có header Location chứa ký tự tab thô (\t)
          return {
            status: 302,
            headers: {
              location: 'https://maps.google.com/place/foo\tbar/data=!3d10.7!4d106.7'
            },
            data: ''
          };
        };

        const res = await resolveGoogleMapsVenuePin('https://maps.app.goo.gl/shortlink1');
        assert.equal(res.coords, null);
        assert.ok(res.reason?.includes('control_characters_not_allowed'), `Reason phải chỉ rõ control_characters_not_allowed: ${res.reason}`);
        // Chứng minh URL đích độc hại không hề được gửi đi yêu cầu ở chặng tiếp theo
        assert.equal(requestedUrls.length, 1);
        assert.equal(requestedUrls[0], 'https://maps.app.goo.gl/shortlink1');
      } finally {
        axios.get = originalAxiosGet;
      }
    });

    it('resolveGoogleMapsVenuePin từ chối Location header chứa CRLF hoặc null byte thô', async () => {
      const originalAxiosGet = axios.get;
      try {
        // Test raw CRLF
        (axios as any).get = async () => ({
          status: 302,
          headers: { location: 'https://maps.google.com/place/foo\r\nbar/data=!3d10.7!4d106.7' }
        });
        const resCrlf = await resolveGoogleMapsVenuePin('https://maps.app.goo.gl/shortlink2');
        assert.equal(resCrlf.coords, null);
        assert.ok(resCrlf.reason?.includes('control_characters_not_allowed'));

        // Test raw null byte
        (axios as any).get = async () => ({
          status: 302,
          headers: { location: 'https://maps.google.com/place/foo\0bar/data=!3d10.7!4d106.7' }
        });
        const resNull = await resolveGoogleMapsVenuePin('https://maps.app.goo.gl/shortlink3');
        assert.equal(resNull.coords, null);
        assert.ok(resNull.reason?.includes('control_characters_not_allowed'));
      } finally {
        axios.get = originalAxiosGet;
      }
    });

    it('resolveGoogleMapsVenuePin chấp nhận redirect tương đối hợp lệ và redirect chứa Unicode tiếng Việt', async () => {
      const originalAxiosGet = axios.get;
      const requestedUrls: string[] = [];
      try {
        (axios as any).get = async (url: string) => {
          requestedUrls.push(url);
          if (url === 'https://maps.app.goo.gl/phohanoi') {
            return {
              status: 302,
              headers: {
                location: '/maps/place/Ph%E1%BB%9F+B%C3%A1t+%C4%90%C3%A0n/@21.0333,105.8488,17z/data=!3d21.0333!4d105.8488'
              }
            };
          }
          return { status: 200, data: '' };
        };

        const res = await resolveGoogleMapsVenuePin('https://maps.app.goo.gl/phohanoi');
        assert.ok(res.coords);
        assert.equal(res.coords.lat, 21.0333);
        assert.equal(res.coords.lng, 105.8488);
        assert.equal(res.pinProvenance, 'redirect_pin');
      } finally {
        axios.get = originalAxiosGet;
      }
    });

    it('resolveGoogleMapsVenuePin giới hạn tối đa maxHops bước nhảy và dừng an toàn khi gặp redirect loop', async () => {
      const originalAxiosGet = axios.get;
      let hopsCount = 0;
      try {
        (axios as any).get = async (url: string) => {
          hopsCount++;
          // Chuyển hướng luân phiên giữa 2 URL hợp lệ để tạo loop
          const nextTarget = url.includes('loop1')
            ? 'https://maps.google.com/maps/place/loop2'
            : 'https://maps.google.com/maps/place/loop1';
          return {
            status: 302,
            headers: { location: nextTarget }
          };
        };

        const res = await resolveGoogleMapsVenuePin('https://maps.google.com/maps/place/loop1', 5);
        assert.equal(res.coords, null);
        assert.equal(res.reason, 'too_many_redirects');
        assert.equal(hopsCount, 5, 'Phải dừng đúng tại giới hạn maxHops = 5, không gây lặp vô hạn');
      } finally {
        axios.get = originalAxiosGet;
      }
    });
  });

  // =========================================================================
  // TC-IMPORT-001: Kế toán import đối tác chuẩn xác, không fake success, skipped unresolved
  // =========================================================================
  describe('TC-IMPORT-001: Kế toán import đối tác chuẩn xác, bỏ qua unresolved, không ghi DB giả lập', () => {
    it('importPartners bỏ qua bản ghi unresolved, dryRun/mockDb trả success=0 và staged đúng số lượng verified', async () => {
      const dummyRecords: any[] = [
        {
          name: 'Verified Partner 1',
          city: 'Đà Nẵng',
          address: '123 Trần Phú',
          lat: 16.0544,
          lng: 108.2022,
          price_level: 2,
          admin_rating: 5,
          active_status: true,
          booking_url: 'https://maps.google.com/?data=!3d16.0544!4d108.2022',
          i18n: {
            location_verified: true,
            coordinate_source: 'google_maps_pin',
            source_maps_url: 'https://maps.google.com/?data=!3d16.0544!4d108.2022',
            resolved_maps_url: 'https://maps.google.com/?data=!3d16.0544!4d108.2022'
          }
        },
        {
          name: 'Verified Partner 2',
          city: 'Hà Nội',
          address: '456 Phố Huế',
          lat: 21.0285,
          lng: 105.8542,
          price_level: 3,
          admin_rating: 4,
          active_status: true,
          booking_url: 'https://maps.google.com/?data=!3d21.0285!4d105.8542',
          i18n: {
            location_verified: true,
            coordinate_source: 'google_maps_pin',
            source_maps_url: 'https://maps.google.com/?data=!3d21.0285!4d105.8542',
            resolved_maps_url: 'https://maps.google.com/?data=!3d21.0285!4d105.8542'
          }
        },
        {
          name: 'Unresolved Partner 3',
          city: 'Huế',
          address: '789 Lê Lợi',
          lat: 16.4637,
          lng: 107.5908,
          price_level: 2,
          admin_rating: 4,
          active_status: false,
          booking_url: 'https://maps.google.com/@16.4637,107.5908', // Camera @ viewport, no pin
          i18n: { location_verified: false, coordinate_source: 'unresolved', unresolved_reason: 'no_venue_pin_found' }
        }
      ];

      // Chạy ở chế độ dryRun để cô lập 100% không ghi DB thật
      const result = await importPartners(dummyRecords, { resolveCoords: false, dryRun: true });

      assert.equal(result.success, 0, 'dryRun hoặc mock DB không ghi DB thật nên success bắt buộc phải là 0');
      assert.equal(result.staged, 0, 'Dry run không lưu hàng chờ nên staged phải là 0');
      assert.equal(result.skipped, 0, 'Dry run chỉ xem chất lượng, chưa bỏ qua khi ghi');
      assert.equal(result.failed, 0, 'Số lượng thất bại phải là 0');
      assert.equal(Object.keys(result.cityCounts).length, 0, 'cityCounts của DB persisted phải rỗng khi dryRun');
      assert.equal(result.stagedCityCounts?.['Đà Nẵng'], 1);
      assert.equal(result.stagedCityCounts?.['Hà Nội'], 1);
      assert.equal(result.stagedCityCounts?.['Huế'], undefined);

      assert.ok(result.qualityReport, 'Phải có qualityReport');
      assert.equal(result.qualityReport.total, 3);
      assert.equal(result.qualityReport.verified, 2);
      assert.equal(result.qualityReport.unresolved, 1);
      assert.equal(result.qualityReport.unresolvedReasons['no_venue_pin_found'], 1);
      assert.equal(result.qualityReport.coordinateSources.google_maps_pin, 2);
      assert.equal(result.qualityReport.coordinateSources.unresolved, 1);
    });
  });

  // =========================================================================
  // TC-IMPORT-002: Chống giả mạo cờ xác minh vị trí (Anti-spoofing) và từ chối cờ inject
  // =========================================================================
  describe('TC-IMPORT-002: Chống giả mạo cờ xác minh vị trí (Anti-spoofing) và từ chối cờ inject', () => {
    it('verifyRecordPinEvidence từ chối bản ghi inject location_verified: true nếu thiếu bằng chứng pin hợp lệ', () => {
      // Bản ghi có host không nằm trong danh sách Maps cho phép
      const fakeHostRecord: any = {
        name: 'Spoofed Partner 1',
        city: 'Hà Nội',
        lat: 16.0544,
        lng: 108.2022,
        booking_url: 'https://evil.com/?data=!3d16.0544!4d108.2022',
        i18n: { location_verified: true, coordinate_source: 'google_maps_pin' }
      };
      assert.equal(verifyRecordPinEvidence(fakeHostRecord).verified, false);

      // Bản ghi có tọa độ lệch so với pin trong URL
      const mismatchCoordRecord: any = {
        name: 'Spoofed Partner 2',
        city: 'Đà Nẵng',
        lat: 10.7769, // Tọa độ giả lập không khớp với pin trong URL
        lng: 106.7009,
        booking_url: 'https://maps.google.com/?data=!3d16.0544!4d108.2022',
        i18n: { location_verified: true, coordinate_source: 'google_maps_pin' }
      };
      assert.equal(verifyRecordPinEvidence(mismatchCoordRecord).verified, false);

      // Bản ghi không có URL Google Maps nào
      const noUrlRecord: any = {
        name: 'Spoofed Partner 3',
        city: 'Đà Nẵng',
        lat: 16.0544,
        lng: 108.2022,
        i18n: { location_verified: true, coordinate_source: 'google_maps_pin' }
      };
      assert.equal(verifyRecordPinEvidence(noUrlRecord).verified, false);
    });

    it('importPartners với resolveCoords: false vẫn từ chối các bản ghi inject cờ giả mạo', async () => {
      const spoofedRecords: any[] = [
        {
          name: 'Spoofed 1',
          city: 'Hà Nội',
          address: '123 Fake',
          lat: 16.0544,
          lng: 108.2022,
          booking_url: 'https://evil.com/?data=!3d16.0544!4d108.2022',
          active_status: true,
          i18n: { location_verified: true, coordinate_source: 'google_maps_pin' }
        },
        {
          name: 'Spoofed 2',
          city: 'Đà Nẵng',
          address: '456 Fake',
          lat: 10.7769,
          lng: 106.7009,
          booking_url: 'https://maps.google.com/?data=!3d16.0544!4d108.2022',
          active_status: true,
          i18n: { location_verified: true, coordinate_source: 'google_maps_pin' }
        }
      ];

      const result = await importPartners(spoofedRecords, { resolveCoords: false, dryRun: true });

      assert.equal(result.success, 0);
      assert.equal(result.staged, 0, 'Không bản ghi giả mạo nào được staged');
      assert.equal(result.skipped, 0, 'Dry run không ghi dữ liệu; bản ghi giả mạo chỉ trở thành unresolved');
      assert.equal(spoofedRecords[0].active_status, false);
      assert.equal(spoofedRecords[0].i18n.location_verified, false);
      assert.equal(spoofedRecords[0].i18n.coordinate_source, 'unresolved');
    });
  });

  // =========================================================================
  // TC-IMPORT-003: Lưu trữ đầy đủ thông tin provenance
  // =========================================================================
  describe('TC-IMPORT-003: Lưu trữ đầy đủ thông tin provenance', () => {
    it('parsePartnerExcel lưu giữ resolved_maps_url và pin_provenance cho bản ghi có pin trực tiếp', async () => {
      const rows = [
        {
          'Tên': 'Quán Phở Chuẩn Pin',
          'Tỉnh/ Thành phố': 'Hà Nội',
          'Vị trí': '10 Lý Quốc Sư',
          'Tag': 'Ăn uống local',
          'Google Maps': 'https://maps.google.com/?data=!3d21.0285!4d105.8542'
        }
      ];
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), 'Sheet1');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const records = await parsePartnerExcel(buf);
      assert.equal(records.length, 1);
      assert.equal(records[0].i18n?.location_verified, true);
      assert.equal(records[0].i18n?.coordinate_source, 'google_maps_pin');
      assert.equal(records[0].i18n?.resolved_maps_url, 'https://maps.google.com/?data=!3d21.0285!4d105.8542');
      assert.equal(records[0].i18n?.resolved_lat, 21.0285);
      assert.equal(records[0].i18n?.resolved_lng, 105.8542);
      assert.equal(records[0].i18n?.pin_provenance, 'direct_pin');
    });
  });

  // =========================================================================
  // TC-IMPORT-004: Kế toán khi thực sự persist vào database (mocked Supabase)
  // =========================================================================
  describe('TC-IMPORT-004: Kế toán khi thực sự persist vào database (mocked Supabase)', () => {
    it('khi dryRun: false và persist thành công, success phản ánh đúng số dòng đã ghi', async () => {
      const recordsToPersist: any[] = [
        {
          name: 'Persisted Partner 1',
          city: 'Đà Nẵng',
          address: '10 Bạch Đằng',
          lat: 16.0544,
          lng: 108.2022,
          price_level: 2,
          admin_rating: 5,
          active_status: true,
          booking_url: 'https://maps.google.com/?data=!3d16.0544!4d108.2022',
          i18n: {
            location_verified: true,
            coordinate_source: 'google_maps_pin',
            source_maps_url: 'https://maps.google.com/?data=!3d16.0544!4d108.2022',
            resolved_maps_url: 'https://maps.google.com/?data=!3d16.0544!4d108.2022'
          }
        },
        {
          name: 'Persisted Partner 2',
          city: 'Hà Nội',
          address: '20 Tràng Tiền',
          lat: 21.0285,
          lng: 105.8542,
          price_level: 3,
          admin_rating: 4,
          active_status: true,
          booking_url: 'https://maps.google.com/?data=!3d21.0285!4d105.8542',
          i18n: {
            location_verified: true,
            coordinate_source: 'google_maps_pin',
            source_maps_url: 'https://maps.google.com/?data=!3d21.0285!4d105.8542',
            resolved_maps_url: 'https://maps.google.com/?data=!3d21.0285!4d105.8542'
          }
        }
      ];

      // Lưu lại hàm from gốc của supabaseAdmin để phục hồi sau test
      const originalFrom = supabaseAdmin.from;
      try {
        // Stub supabaseAdmin.from in-memory
        (supabaseAdmin as any).from = (table: string) => {
          return {
            select: () => Promise.resolve({ data: [], error: null }),
            insert: (payload: any) => ({ select: () => ({ single: () => Promise.resolve({ data: { id: payload[0].name }, error: null }) }) }),
            update: (payload: any) => ({
              eq: () => Promise.resolve({ data: payload, error: null })
            })
          };
        };

        const result = await importPartners(recordsToPersist, { resolveCoords: false, dryRun: false });

        assert.equal(result.success, 2, 'Số lượng success phải phản ánh số dòng được ghi');
        assert.equal(result.staged, 0, 'staged phải là 0 vì đã được persist vào DB');
        assert.equal(result.failed, 0);
        assert.equal(result.cityCounts['Đà Nẵng'], 1);
        assert.equal(result.cityCounts['Hà Nội'], 1);
      } finally {
        supabaseAdmin.from = originalFrom;
      }
    });

    it('khi database báo lỗi trong quá trình persist, failed và errors được ghi nhận chính xác', async () => {
      const recordsToPersist: any[] = [
        {
          name: 'Failing Partner',
          city: 'Đà Nẵng',
          address: '10 Bạch Đằng',
          lat: 16.0544,
          lng: 108.2022,
          booking_url: 'https://maps.google.com/?data=!3d16.0544!4d108.2022',
          i18n: {
            location_verified: true,
            coordinate_source: 'google_maps_pin',
            source_maps_url: 'https://maps.google.com/?data=!3d16.0544!4d108.2022',
            resolved_maps_url: 'https://maps.google.com/?data=!3d16.0544!4d108.2022'
          }
        }
      ];

      const originalFrom = supabaseAdmin.from;
      try {
        (supabaseAdmin as any).from = (table: string) => {
          return {
            select: () => Promise.resolve({ data: [], error: null }),
            insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: new Error('Simulated Database Error') }) }) })
          };
        };

        const result = await importPartners(recordsToPersist, { resolveCoords: false, dryRun: false });

        assert.equal(result.success, 0);
        assert.equal(result.failed, 1, 'Số lượng failed phải tăng lên 1');
        assert.equal(result.errors.length, 1);
        assert.ok(result.errors[0].includes('Simulated Database Error'));
      } finally {
        supabaseAdmin.from = originalFrom;
      }
    });
  });
});

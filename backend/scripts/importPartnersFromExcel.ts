import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load biến môi trường từ backend/.env
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { parsePartnerExcel, importPartners } from '../src/modules/partners/partnerImport.service';

async function main() {
  console.log('='.repeat(65));
  console.log('🚀 ViVu Planner - CLI Import Đối Tác Tuyển Chọn Từ Excel');
  console.log('='.repeat(65));

  // Lấy đường dẫn file từ tham số dòng lệnh hoặc fallback về mặc định
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const skipCoords = process.argv.includes('--no-coords') || process.argv.includes('--quick');
  
  const defaultPath = 'C:\\Users\\vinhmt\\Downloads\\LOCATION DATA.xlsx';
  const filePath = args[0] || defaultPath;

  console.log(`📂 Nguồn dữ liệu: ${filePath}`);
  console.log(`🌐 Chế độ tọa độ: ${skipCoords ? 'Nạp nhanh (--no-coords: không resolve tọa độ, đánh dấu unresolved & inactive, không persist)' : 'Đầy đủ mặc định (Resolve Google Maps venue PIN !3d!4d)'}`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ LỖI: Không tìm thấy file Excel tại đường dẫn "${filePath}".`);
    console.error('Vui lòng kiểm tra lại đường dẫn hoặc truyền đường dẫn vào: npx tsx scripts/importPartnersFromExcel.ts [đường_dẫn_file]');
    process.exit(1);
  }

  try {
    console.log('\n⏳ Đang phân tích file Excel...');
    const records = await parsePartnerExcel(filePath);
    console.log(`✅ Đã đọc thành công ${records.length} đối tác từ sheet.`);

    // Thống kê sơ bộ theo thành phố
    const preliminaryCounts: Record<string, number> = {};
    records.forEach(r => {
      preliminaryCounts[r.city] = (preliminaryCounts[r.city] || 0) + 1;
    });

    console.log('\n📊 Phân bổ địa điểm theo thành phố:');
    Object.entries(preliminaryCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([city, count]) => {
        console.log(`   - ${city.padEnd(20, ' ')}: ${count} địa điểm`);
      });

    console.log('\n🚀 Bắt đầu nạp đối tác vào cơ sở dữ liệu Supabase...');
    const startTime = Date.now();

    let lastReport = 0;
    const result = await importPartners(records, {
      resolveCoords: !skipCoords,
      concurrency: 8,
      onProgress: (current, total) => {
        const percent = Math.floor((current / total) * 100);
        if (percent >= lastReport + 10 || current === total) {
          lastReport = percent;
          process.stdout.write(`\r   [Tiến trình resolve Google Maps]: ${current}/${total} (${percent}%)`);
        }
      }
    });

    if (!skipCoords) {
      console.log('');
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(65));
    console.log('🎉 KẾT QUẢ IMPORT HOÀN TẤT!');
    console.log('='.repeat(65));
    console.log(`⏱️ Thời gian thực thi: ${duration}s`);
    console.log(`✅ Đã lưu (verified) : ${result.success}/${records.length}`);
    console.log(`🕓 Đã lưu hàng chờ    : ${result.staged}`);
    console.log(`⏭️ Bỏ qua (trùng)     : ${result.skipped}`);
    console.log(`❌ Thất bại (lỗi DB)  : ${result.failed}`);

    if (result.qualityReport) {
      console.log('\n🧭 Báo cáo chất lượng tọa độ:');
      console.log(`   - Tổng số bản ghi    : ${result.qualityReport.total}`);
      console.log(`   - Tọa độ pin xác minh: ${result.qualityReport.verified}`);
      console.log(`   - Chưa xác minh      : ${result.qualityReport.unresolved}`);
      if (Object.keys(result.qualityReport.unresolvedReasons).length > 0) {
        console.log('   - Nguyên nhân chưa xác minh:');
        Object.entries(result.qualityReport.unresolvedReasons).forEach(([reason, cnt]) => {
          console.log(`     * ${reason}: ${cnt}`);
        });
      }
    }

    if (result.errors.length > 0) {
      console.log('\n⚠️ Chi tiết lỗi:');
      result.errors.slice(0, 5).forEach(e => console.log(`   - ${e}`));
      if (result.errors.length > 5) {
        console.log(`   ... và ${result.errors.length - 5} lỗi khác.`);
      }
    }

    console.log('\n📊 Thống kê lưu DB theo thành phố:');
    Object.entries(result.cityCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([city, count]) => {
        console.log(`   - ${city.padEnd(20, ' ')}: ${count} đối tác`);
      });

    console.log('='.repeat(65));
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ Xảy ra lỗi nghiêm trọng trong quá trình import:', err);
    process.exit(1);
  }
}

main();

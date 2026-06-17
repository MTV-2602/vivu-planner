const fs = require('fs');

const targetFile = 'd:\\ki7\\EXE\\TK1\\backend\\src\\services\\geminiService.ts';
let content = fs.readFileSync(targetFile, 'utf8');

let normalized = content.replace(/\r\n/g, '\n');

// Replace the systemPrompt beginning to insert coordinate rules
const searchStr = "const systemPrompt = `B";
if (normalized.includes(searchStr)) {
  const replacement = `const systemPrompt = \`0. TOẠ ĐỘ THỰC TẾ TRONG KHI TẠO (REALTIME COORDINATES): Đối với mỗi hoạt động trong lịch trình, bạn PHẢI tìm kiếm trong kiến thức của mình để điền chính xác tọa độ Vĩ độ ("lat") và Kinh độ ("lng") cùng địa chỉ thực tế ("address") của địa điểm đó tại Việt Nam. Không điền tọa độ chung chung giống nhau hay tọa độ giả lập. Phải đảm bảo tọa độ khớp chính xác với địa điểm thực tế (ví dụ: Cầu Rồng Đà Nẵng phải là 16.0612, 108.2268; chợ Bến Thành là 10.7726, 106.6980; Hồ Hoàn Kiếm là 21.0287, 105.8524). Nếu địa điểm là di chuyển (transport) hoặc tự do, bạn có thể để lat/lng là null.

B`;
  normalized = normalized.replace(searchStr, replacement);
  console.log('Replaced systemPrompt beginning successfully!');
} else {
  console.log('Could not find systemPrompt beginning.');
}

content = normalized.replace(/\n/g, '\r\n');
fs.writeFileSync(targetFile, content, 'utf8');
console.log('Done!');

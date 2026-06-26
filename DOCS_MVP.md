# TÀI LIỆU PHÁT TRIỂN & KIỂM THỬ SẢN PHẨM KHẢ DỤNG TỐI THIỂU (MVP DOCUMENTATION)
## VIVU PLANNER - HỆ THỐNG LẬP KẾ HOẠCH DU LỊCH TỐI ƯU AI

---

## 1. YÊU CẦU KỸ THUẬT & THIẾT KẾ (SPECS, INTERFACE, PACKAGING)

### 1.2. Thông số Kỹ thuật (Specs)
#### 1.2.1. Yêu cầu mức độ hiệu năng hoạt động của sản phẩm (Performance Levels)
Để đảm bảo trải nghiệm người dùng mượt mà và tối ưu chi phí vận hành, hệ thống ViVu Planner Web hoạt động dựa trên các chỉ số hiệu năng cụ thể sau:
*   **Thời gian phản hồi giao diện (UI Response Time)**: Các thao tác chuyển bước trong Wizard, chọn thành phố, tích chọn sở thích phải phản hồi dưới **100ms** (gần như tức thì).
*   **Thời gian xử lý của AI (AI Latency)**: 
    *   Tiến trình tạo lịch trình mới bằng Gemini 2.5 Flash kết hợp tìm kiếm OpenStreetMap Nominatim song song có thời gian phản hồi trung bình từ **5s – 8s**. 
    *   Hệ thống hiển thị thanh trạng thái tiến trình (Loading stages) với 5 giai đoạn trực quan giúp giảm cảm giác chờ đợi của khách hàng.
*   **Thời gian phản hồi API thời tiết & Địa điểm**:
    *   API lấy thông tin dự báo thời tiết từ Open-Meteo phản hồi dưới **300ms**.
    *   API tìm kiếm địa điểm OpenStreetMap Nominatim phản hồi dưới **500ms**.
*   **Tốc độ kết xuất PDF (PDF Rendering Speed)**: Kết xuất cẩm nang PDF vector offline (sử dụng thư viện `html2pdf.js` dạng off-screen canvas) hoàn thành dưới **1.5s**, tự động tải trực tiếp về thiết bị mà không làm nhấp nháy màn hình.
*   **Hiệu năng bộ nhớ đệm (Caching & TTL)**:
    *   Lịch trình và kết quả tìm kiếm địa điểm được lưu trữ tạm thời tại local cache (AsyncStorage) với TTL (Time-To-Live) là **30 phút** nhằm tránh việc gọi API trùng lặp và giảm tải cho hệ thống.

---

### 1.3. Giao diện Người dùng (Interface)
#### 1.3.1. Phương thức sử dụng sản phẩm & Độ phức tạp giao diện (UI/UX Complexity)
*   **Luồng sử dụng chính của khách hàng (User Flow)**:
    1.  **Tiếp cận Landing Page**: Tìm hiểu về dịch vụ, bảng giá dự kiến và các điểm đến hỗ trợ.
    2.  **Đăng ký/Đăng nhập**: Cam kết bảo mật thông tin cá nhân và đồng ý điều khoản dịch vụ để tiếp tục.
    3.  ** Wizard Tạo Chuyến Đi (4 Bước đơn giản)**:
        *   *Bước 1*: Chọn 1 trong 11 điểm đến phổ biến tại Việt Nam và nhập ngày đi/ngày về (hệ thống tự động chặn ngày trong quá khứ).
        *   *Bước 2*: Chọn loại thành viên (Solo/Couple/Đoàn đông), số lượng khách và tổng ngân sách (ngăn chặn ngân sách dưới mức sàn tối thiểu).
        *   *Bước 3*: Chọn các nhóm sở thích du lịch (Lịch sử, Thiên nhiên, Mạo hiểm, Nghỉ dưỡng...).
        *   *Bước 4*: Nhập yêu cầu ăn uống/sức khỏe đặc biệt (ví dụ: ăn bánh ướt lòng gà, người già không đi bộ nhiều...) và xác nhận tóm tắt hành trình để tạo lịch trình AI.
    4.  **Tương tác Lịch trình**: Theo dõi thời tiết, lịch trình chi tiết sáng/trưa/chiều/tối, xuất PDF một chạm để xem offline hoặc chia sẻ trực tiếp.
*   **Độ phức tạp giao diện (UI Complexity)**: Giao diện tuân thủ triết lý **Sleek Minimalism (Tối giản cao cấp)**:
    *   *Màu sắc chủ đạo*: Kết hợp hài hòa giữa Dark Theme (Nền tối huyền bí) và Paper Theme (Màu giấy cổ điển dịu mắt cho các khối nội dung lịch trình dài).
    *   *Độ phức tạp*: Giữ ở mức **Trung bình - Thấp** cho khách hàng đại chúng. Các form nhập liệu phức tạp được ẩn đi, thay thế bằng các nút bấm lựa chọn (chọn thành phố, chọn sở thích, slider ngân sách) giúp giảm tải nhận thức và tối ưu hóa việc nhập liệu trên cả máy tính lẫn điện thoại.

---

### 1.4. Đóng gói & Phương thức tiếp cận (Packaging)
#### 1.4.1. Hình thức xuất hiện của sản phẩm (Form & Engagement)
*   **Hình thức vật lý**: Không có sản phẩm vật lý. Đây là một **Dịch vụ trải nghiệm số (Digital Experience Service)**.
*   **Nền tảng phát hành**: Trực tuyến dưới dạng ứng dụng Web đa nền tảng (Web App chạy trên nền Expo/React Native Web), tương thích hoàn hảo với mọi trình duyệt hiện đại (Chrome, Safari, Edge, Firefox) trên cả thiết bị Máy tính (Desktop/PC) và Di động (Mobile Responsive).
*   **Phương thức tương tác của khách hàng**:
    *   Khách hàng tương tác 100% qua môi trường mạng tại địa chỉ trang web của sản phẩm.
    *   Sản phẩm cung cấp khả năng lưu trữ ngoại tuyến bằng cách xuất file PDF cẩm nang du lịch và tính năng chia sẻ văn bản lịch trình nhanh qua các ứng dụng nhắn tin trên di động.
*   **Yêu cầu lưu kho/hạn sử dụng**: Không áp dụng đối với dịch vụ số. Tuy nhiên, hệ thống cần duy trì tính cập nhật liên tục của dữ liệu thời tiết, các địa điểm đối tác thực tế và phiên bản mô hình ngôn ngữ lớn AI Gemini.

---

## 2. KIỂM THỬ SẢN PHẨM KHẢ DỤNG TỐI THIỂU (MVP TESTING)

### 2.1. Quy mô khảo sát người dùng
Chúng tôi đã tiến hành thử nghiệm sản phẩm thực tế với **20 người kiểm thử độc lập (individual testers)**. Dưới đây là phân tích chi tiết dữ liệu khảo sát thu được sau quá trình kiểm thử.

#### Thống kê thiết bị kiểm thử:
*   **Máy tính/Laptop**: 19 người dùng (95%).
*   **Điện thoại di động**: 1 người dùng (5%).

---

### 2.2. Đánh giá & Xác thực tính năng cốt lõi (Core Feature Validation)
#### 2.2.1. Phương pháp thực hiện
Người dùng được cung cấp đường link phiên bản MVP của ViVu Planner tại địa chỉ staging/production để trực tiếp thao tác tự do (tạo tài khoản, thiết lập thông tin chuyến đi, sinh lịch trình AI, trải nghiệm nút báo sự cố để điều chỉnh lịch trình, và tải file PDF). Sau đó, họ điền thông tin đánh giá vào biểu mẫu khảo sát.

#### 2.2.2. Kết quả đánh giá từ người dùng kiểm thử
Hệ thống tính điểm trung bình (trên thang điểm 5) và thu thập phản hồi định tính:

*   **Tính rõ ràng của giao diện**: Đạt điểm trung bình **4.25 / 5**. Hầu hết người dùng đánh giá giao diện đẹp, trực quan và sạch sẽ, tuy nhiên một số ít ở giai đoạn đầu thấy nút hoặc chữ hơi nhỏ.
*   **Độ dễ của luồng tạo chuyến đi**: Đạt điểm trung bình **4.6 / 5**. Luồng wizard 4 bước được đánh giá cực kỳ dễ thao tác, rõ ràng.
*   **Tính hợp lý của thông tin yêu cầu**: **80%** người dùng đánh giá các câu hỏi (điểm đến, ngày, ngân sách, sức khỏe) là hợp lý và vừa đủ. **20%** cho rằng cần thu thập thêm một số thông tin chi tiết khác.
*   **Độ dễ đọc của lịch trình hiển thị**: Đạt điểm trung bình **4.2 / 5**. Trình bày lịch trình sáng/trưa/chiều/tối rõ ràng, dễ theo dõi.
*   **Đánh giá chất lượng lịch trình AI**:
    *   *Rất tốt, có thể dùng gần như ngay*: **25%** (5 người).
    *   *Khá tốt, chỉ cần chỉnh sửa nhẹ*: **55%** (11 người).
    *   *Tạm ổn, cần chỉnh sửa nhiều*: **20%** (4 người).
*   **Độ hữu ích của tính năng AI cá nhân hóa**: Đạt điểm trung bình **4.15 / 5**.

#### Điều người dùng thích nhất ở MVP:
1.  **Tốc độ tạo nhanh**: Lập kế hoạch cả tuần chỉ trong vài giây.
2.  **Đầy đủ thông tin thực tế**: Có thời tiết, ước tính chi phí, gợi ý đúng quán đặc sản địa phương (như lẩu cá đuối, bánh khọt Vũng Tàu).
3.  **Giao diện thẩm mỹ**: Sạch sẽ, chuyển màu sang màu nền giấy dịu mắt khi hiển thị lịch trình dài.
4.  **Tính năng thích ứng sự cố**: Tự động sửa lịch trình khi báo mưa bão hoặc đổi món ăn rất thông minh.

#### Điều người dùng chưa hài lòng và muốn cải thiện:
1.  **AI Latency**: Thời gian chờ AI sinh lịch trình đôi khi hơi lâu (~5-8 giây).
2.  **Bản đồ hiển thị**: Người dùng mong muốn nhìn thấy bản đồ trực quan định vị các địa điểm trong lịch trình.
3.  **Tương tác chatbot**: Mong muốn có khung chat trực tiếp với AI để chỉnh sửa lịch trình bằng ngôn ngữ tự nhiên thay vì chỉ chỉnh sửa thủ công.
4.  **Tích hợp đặt phòng/vé**: Cần thêm tính năng liên kết đặt dịch vụ phòng nghỉ hoặc vé xe trực tiếp.

---

### 2.3. Bảng Dữ liệu Kiểm thử Thô (RAW User Interaction Data)
Dưới đây là bảng dữ liệu thô thu được trực tiếp từ 20 testers (đã được trích xuất phục vụ cho Hội đồng đánh giá):

| Dấu thời gian | Địa chỉ email | Mức độ MVP | Thiết bị | Điểm Giao diện | Điểm Luồng tạo | Tính hợp lý Form | Điểm Lịch trình | Vấn đề gặp phải | Đánh giá chất lượng AI | Tính năng vừa ý nhất | Tính năng chưa vừa ý | Sẵn sàng dùng lại | Điều thích nhất | Điều muốn cải thiện |
| :--- | :--- | :---: | :--- | :---: | :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 26/06/2026 11:26:51 | vinhvip4508@gmail.com | 4 | Laptop/PC | 4 | 5 | Thiếu thông tin hỏi thêm | 4 | Tốc độ AI chậm, hiển thị chưa rõ | Tạm ổn, sửa nhiều | Tạo lịch trình AI cá nhân hóa | Chất lượng lịch trình AI | Có thể có | tạo nhanh theo yêu cầu | thêm đặt phòng cá nhân hóa |
| 26/06/2026 11:32:16 | nhalt2208@gmail.com | 5 | Laptop/PC | 5 | 5 | Hợp lý và vừa đủ | 5 | Không gặp vấn đề đáng kể | Khá tốt, sửa nhẹ | Tạo lịch trình AI cá nhân hóa | Không có phần khó chịu | Chắc chắn có | rõ ràng dễ hiểu | chưa có chatbot với AI |
| 26/06/2026 11:34:58 | nguyennhatnam01012004@gmail.com | 4 | Laptop/PC | 4 | 4 | Thiếu thông tin hỏi thêm | 4 | Khó chỉnh sửa lịch trình | Khá tốt, sửa nhẹ | Tạo lịch trình AI cá nhân hóa | Xử lý sự cố AI | Có thể có | nhanh | chưa có chatbot |
| 26/06/2026 11:39:56 | buimanhquang373@gmail.com | 5 | Laptop/PC | 5 | 5 | Hợp lý và vừa đủ | 4 | Khó chỉnh sửa lịch trình | Khá tốt, sửa nhẹ | Gợi ý địa điểm ăn uống | Chất lượng lịch trình AI | Chắc chắn có | tạo lịch trình nhanh | phát triển thêm tính năng đặt phòng |
| 26/06/2026 11:43:50 | hausieucapvippro13@gmail.com | 4 | Laptop/PC | 4 | 5 | Thiếu thông tin hỏi thêm | 5 | Không gặp vấn đề đáng kể | Tạm ổn, sửa nhiều | Tạo lịch trình AI cá nhân hóa | Chất lượng lịch trình AI | Chắc chắn có | tạo nhanh theo yêu cầu | cần rõ ràng chi phí hơn |
| 26/06/2026 12:31:41 | Khangdang@gmail.com | 4 | Laptop/PC | 4 | 4 | Hợp lý và vừa đủ | 5 | Tốc độ AI chậm | Khá tốt, sửa nhẹ | Gợi ý ăn uống/tham quan | Xử lý sự cố AI | Chắc chắn có | Giao diện đẹp | Hoạt động mượt hơn |
| 26/06/2026 12:32:52 | nguyennhudai05@gmail.com | 4 | Laptop/PC | 4 | 5 | Hợp lý và vừa đủ | 4 | Không gặp vấn đề đáng kể | Khá tốt, sửa nhẹ | AI gợi ý phương án thay thế | Hiển thị ngân sách | Chắc chắn có | Giao diện sạch dễ nhìn | Nâng cấp tính năng AI gợi ý |
| 26/06/2026 12:33:57 | phamnguyenvu110905@gmail.com | 5 | Laptop/PC | 5 | 5 | Hợp lý và vừa đủ | 4 | Không gặp vấn đề đáng kể | Khá tốt, sửa nhẹ | Hiển thị chi tiêu dự kiến | Chỉnh sửa hoạt động | Chắc chắn có | giao diện thân thiện | hiểu những gì mình đang làm |
| 26/06/2026 12:42:18 | doanvanminh05092006@gmail.com | 5 | Laptop/PC | 5 | 5 | Thiếu thông tin hỏi thêm | 4 | Không gặp vấn đề đáng kể | Tạm ổn, sửa nhiều | Gợi ý địa điểm, AI thay thế | Luồng tạo chuyến đi | Chưa chắc | giao diện thân thiện | cải thiện luồng tạo |
| 26/06/2026 12:43:55 | anptpse181955@fpt.edu.vn | 3 | Laptop/PC | 3 | 5 | Hơi nhiều thông tin | 4 | Chữ/nút hơi khó hiểu | Khá tốt, sửa nhẹ | Cảnh báo cần xác nhận giá | Gợi ý địa điểm | Có thể có | Không biết | Không có |
| 26/06/2026 12:46:10 | baopham1372005@gmail.com | 5 | Laptop/PC | 5 | 5 | Hợp lý và vừa đủ | 5 | Không gặp vấn đề đáng kể | Rất tốt, dùng ngay | Tạo lịch trình AI cá nhân hóa | Giao diện xem chi tiết | Chắc chắn có | Rõ ràng dễ hiểu | Làm thêm nhiều tính năng mới |
| 26/06/2026 12:47:08 | buimy1616@gmail.com | 3 | Laptop/PC | 3 | 3 | Khó hiểu, chưa biết nhập gì | 3 | Tốc độ AI chậm | Tạm ổn, sửa nhiều | Tạo lịch trình AI cá nhân hóa | Chất lượng lịch trình AI | Có thể có | nhanh | cải thiện tốc độ tạo |
| 26/06/2026 17:49:15 | ndat8749@gmail.com | 5 | Laptop/PC | 5 | 4 | Hợp lý và vừa đủ | 5 | Giao diện bị rối, chữ khó hiểu | Rất tốt, dùng ngay | Tạo lịch trình AI cá nhân hóa | Gợi ý địa điểm | Chắc chắn có | lên kế hoạch nhanh | chưa có bản đồ |
| 26/06/2026 17:56:45 | ngkth1502@gmail.com | 5 | Laptop/PC | 5 | 5 | Hợp lý và vừa đủ | 5 | Không gặp vấn đề đáng kể | Khá tốt, sửa nhẹ | Tạo lịch trình AI cá nhân hóa | Không có phần khó chịu | Chắc chắn có | tạo nhanh, chuẩn | không có |
| 26/06/2026 18:05:30 | dolevanhai9a4@gmail.com | 4 | Laptop/PC | 4 | 4 | Thiếu thông tin hỏi thêm | 4 | Không rõ bước tiếp theo | Tạm ổn, sửa nhiều | Hiển thị chi tiêu dự kiến | Gợi ý địa điểm | Chưa chắc | nhanh | cải thiện hướng dẫn |
| 26/06/2026 18:31:55 | huynhcamvinh3110@gmail.com | 4 | Laptop/PC | 4 | 4 | Hợp lý và vừa đủ | 4 | Không gặp vấn đề đáng kể | Rất tốt, dùng ngay | Tạo lịch trình AI cá nhân hóa | Không có phần khó chịu | Chắc chắn có | giao diện đẹp | ko |
| 26/06/2026 18:35:50 | phuocsang2021fpt@gmail.com | 4 | Điện thoại | 4 | 4 | Hơi nhiều thông tin | 4 | Không rõ bước tiếp theo | Tạm ổn, sửa nhiều | Cảnh báo cần xác nhận giá | Gợi ý địa điểm | Có thể có | giao diện sạch | thêm gợi ý |
| 26/06/2026 20:52:24 | gio26022004@gmail.com | 4 | Laptop/PC | 4 | 4 | Thiếu thông tin hỏi thêm | 4 | Không gặp vấn đề đáng kể | Khá tốt, sửa nhẹ | Tạo lịch trình AI cá nhân hóa | Luồng tạo chuyến đi | Có thể có | nhanh | thêm tính năng chia sẻ |
| 26/06/2026 20:54:07 | team89a6@gmail.com | 4 | Laptop/PC | 4 | 4 | Hợp lý và vừa đủ | 4 | Khó chỉnh sửa lịch trình | Khá tốt, sửa nhẹ | Tạo lịch trình AI cá nhân hóa | Luồng tạo chuyến đi | Chắc chắn có | Bên đặt phòng | cải thiện nút chỉnh sửa |
| 26/06/2026 21:02:58 | thuhuowg@gmail.com | 3 | Laptop/PC | 3 | 3 | Hơi nhiều thông tin | 3 | Không gặp vấn đề đáng kể | Tạm ổn, sửa nhiều | Điều chỉnh lịch trình khi có sự cố | Chỉnh sửa hoạt động | Có thể có | Giao diện | Không rõ |

---

## 3. QUYẾT ĐỊNH PHÁT TRIỂN TIẾP THEO (ITERATE OR PERSEVERE)

### 3.2. Quyết định chiến lược: Kiên trì định hướng (Persevere) và Cải tiến giải pháp (Iterate)
Dựa trên kết quả kiểm thử thực tế từ 20 người dùng, nhóm phát triển ViVu Planner quyết định **Kiên trì với giải pháp sản phẩm hiện tại (Persevere)**, đồng thời thực hiện **Cải tiến liên tục các tính năng chi tiết (Iterate)** dựa trên góp ý trực tiếp của khách hàng để tối ưu hóa giá trị sản phẩm.

#### Lý do lựa chọn chiến lược này:
*   **Persevere (Kiên trì chiến lược lõi)**:
    *   Tỉ lệ sẵn sàng dùng lại sản phẩm để lập kế hoạch du lịch thật lên tới **90%** (kết hợp giữa *Chắc chắn có* và *Có thể có*). Điều này chứng minh giải pháp giải quyết đúng nỗi đau (pain point) của khách hàng về việc mất thời gian chuẩn bị kế hoạch đi chơi.
    *   Các tính năng cốt lõi như lập lịch trình dựa trên thông tin cá nhân hóa và tự động thay đổi lịch trình khi gặp sự cố thời tiết/sức khỏe hoạt động rất ổn định, được đánh giá cao.
*   **Iterate (Cải tiến giải pháp tính năng)**:
    *   *Khắc phục AI Latency*: Nghiên cứu triển khai cơ chế **Stream kết quả** (Streaming response) từ Gemini API để người dùng thấy lịch trình hiển thị dần dần thay vì phải đợi tải toàn bộ cùng một lúc trong 5-8 giây.
    *   *Tích hợp bản đồ trực quan*: Nghiên cứu tích hợp bản đồ OpenStreetMap/Leaflet hiển thị trực quan các điểm check-in trong ngày giúp người dùng dễ hình dung quãng đường di chuyển.
    *   *Phát triển Chatbot AI hỗ trợ*: Thay vì các nút bấm điều khiển cứng nhắc, bổ sung khung chat đàm thoại tự nhiên với AI ở màn hình chi tiết chuyến đi để người dùng ra lệnh điều chỉnh lịch trình bằng giọng nói hoặc tin nhắn.
    *   *Liên kết thương mại hóa*: Bắt tay hợp tác với các đại lý bán vé/phòng để chèn liên kết trực tiếp vào lịch trình như định hướng gói dịch vụ Premium.

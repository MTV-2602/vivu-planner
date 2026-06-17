# ViVu Planner

Ứng dụng lập kế hoạch du lịch Việt Nam tích hợp AI, giúp tạo lịch trình cá nhân hóa từ thời tiết thực, địa điểm thật và các tình huống phát sinh trong chuyến đi.

Hệ thống được thiết kế tối ưu chạy trên nền tảng **Web** (React Native Web).

---

## Tính Năng Chính

- **Lịch trình AI**: Gemini 2.5 Flash tạo lịch trình chi tiết theo ngày, tối ưu theo ngân sách, loại khách và sở thích.
- **Tìm kiếm địa điểm**: Tích hợp OpenStreetMap Nominatim API miễn phí, không cần cấu hình API key trả phí.
- **Ràng buộc ngân sách tối thiểu**: Dự đoán chi phí sàn tối thiểu (phòng nghỉ dorm & ăn uống cơ bản) dựa trên số khách, số ngày/đêm và tự động cảnh báo, chặn các yêu cầu ngân sách phi thực tế.
- **Đa dạng ẩm thực & Tránh lặp món**: Thuật toán bể chứa cạn kiệt (Depletion Pool) và nới lỏng ngân sách động giúp phân bổ ẩm thực đa dạng, tránh lặp món (ví dụ: bánh khọt Vũng Tàu).
- **Thích ứng sự cố**: AI preview và áp dụng lịch trình mới khi có mưa bão, trễ chuyến, hụt ngân sách hoặc vấn đề sức khỏe.
- **Hỗ trợ 11 điểm đến**: Hà Nội, Đà Nẵng, TP. Hồ Chí Minh, Hội An, Huế, Nha Trang, Đà Lạt, Phú Quốc, Sa Pa, Ninh Bình, Vũng Tàu.
- **Xuất cẩm nang PDF**: Tải trực tiếp cẩm nang lịch trình, chi tiêu và thông tin thời tiết PDF sắc nét dạng vector, tối ưu dàn trang in ấn.
- **Offline cache**: lưu danh sách/chuyến đi đã tải với TTL 30 phút.

---

## Tech Stack

| Layer | Công nghệ |
| --- | --- |
| Frontend | Expo SDK 56 (React Native Web), React 19 |
| Routing | Expo Router |
| Styling | NativeWind v4, Custom CSS variables |
| State/Data | TanStack Query, AsyncStorage cache |
| Backend | Node.js, Express, Vercel Serverless |
| Database/Auth | Supabase PostgreSQL, RLS, Supabase Auth |
| AI | Google Gemini 2.5 Flash |
| Maps/Places | OpenStreetMap Nominatim API (Free) |
| Deploy | Vercel Web |

---

## Cấu Trúc Dự Án

```text
vivu-planner/
├── frontend/                    # Web App (React Native Web)
│   ├── app/
│   │   ├── _layout.tsx          # Root layout, fonts, QueryClient
│   │   ├── index.tsx            # Redirect theo trạng thái đăng nhập
│   │   ├── landing.tsx          # Trang giới thiệu
│   │   ├── (auth)/
│   │   │   ├── dang-nhap.tsx    # Đăng nhập
│   │   │   └── dang-ky.tsx      # Đăng ký
│   │   └── (app)/
│   │       ├── admin.tsx        # Trang quản trị web-only
│   │       └── chuyen-di/
│   │           ├── index.tsx    # Dashboard danh sách chuyến đi
│   │           ├── moi.tsx      # Wizard tạo chuyến đi
│   │           └── [id].tsx     # Chi tiết lịch trình
│   ├── components/              # AuthScreen, Reveal, SystemClock, BackToTop
│   ├── constants/               # Brand colors, cities, traveler/preference options
│   ├── hooks/                   # Location helpers
│   ├── lib/                     # API client, Supabase client, cache, notifications
│   ├── app.json                 # Expo config
│   └── vercel.json              # Vercel config khi deploy riêng frontend
├── backend/                     # Express API
│   └── src/
│       ├── routes/              # trips, places, weather, auth, admin
│       └── services/            # Gemini, Places, Weather, Supabase, key manager
├── supabase/
│   └── schema.sql               # Database schema + RLS policies
└── vercel.json                  # Vercel config khi deploy cả frontend + backend từ root
```

---

## Cài Đặt Local

### Yêu Cầu

- Node.js 18+
- npm 9+

### Frontend

```bash
cd frontend
npm install
npm run web
```

### Backend

```bash
cd backend
npm install
npm run dev
```

Backend local mặc định chạy ở `http://localhost:4000`.

---

## Environment Variables

Tạo file `frontend/.env`:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000/api
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Tạo file `backend/.env`:

```env
PORT=4000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
FRONTEND_ORIGIN=http://localhost:8081,http://localhost:19006
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-this-password
```

---

## Scripts Kiểm Tra

```bash
cd frontend
npx tsc --noEmit
npm run build
```

```bash
cd backend
npm run build
```

---

## Deploy

### Deploy Frontend Riêng Lên Vercel

Nếu deploy từ thư mục `frontend/`, dùng [frontend/vercel.json](frontend/vercel.json):

```bash
cd frontend
npm run build
npx vercel --prod
```

### Deploy Fullstack Từ Root

Nếu deploy từ root repo, Vercel sẽ đọc [vercel.json](vercel.json) để route `/api/*` sang backend và phần còn lại sang frontend. Cần đảm bảo Vercel project có đủ env cho cả frontend và backend.

---

## API Endpoints Chính

| Method | Endpoint | Chức năng |
| --- | --- | --- |
| `POST` | `/api/auth/signup` | Đăng ký tài khoản qua backend |
| `GET` | `/api/trips` | Lấy danh sách chuyến đi |
| `POST` | `/api/trips` | Tạo chuyến đi và sinh lịch trình AI |
| `GET` | `/api/trips/:id` | Xem chi tiết chuyến đi |
| `PUT` | `/api/trips/:id` | Cập nhật metadata chuyến đi |
| `DELETE` | `/api/trips/:id` | Xóa chuyến đi |
| `POST` | `/api/trips/:id/disruptions/preview` | AI preview lịch trình thích ứng sự cố |
| `POST` | `/api/trips/:id/disruptions/apply` | Lưu lịch trình đã chọn |
| `PUT` | `/api/trips/items/:itemId` | Sửa item thủ công |
| `DELETE` | `/api/trips/items/:itemId` | Xóa item |
| `POST` | `/api/trips/items/:itemId/ai-replace` | AI gợi ý phương án thay thế |
| `GET` | `/api/weather` | Lấy dự báo thời tiết |
| `GET` | `/api/places/search` | Tìm địa điểm |
| `POST` | `/api/admin/login` | Đăng nhập admin |

---

## Database Schema

Schema nằm tại [supabase/schema.sql](supabase/schema.sql), gồm:

- `profiles`: thông tin người dùng.
- `trips`: chuyến đi.
- `itinerary_days`: các ngày trong chuyến.
- `itinerary_items`: hoạt động trong từng ngày.
- `disruption_events`: sự cố phát sinh.
- `itinerary_revisions`: lịch sử thay đổi lịch trình.
- `places_cache`: cache địa điểm OpenStreetMap Nominatim.
- `gemini_api_keys`: pool API key Gemini cho backend.

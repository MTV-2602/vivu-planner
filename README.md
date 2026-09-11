# ViVu Planner 🇻🇳

Nền tảng lập kế hoạch du lịch thông minh tại Việt Nam được hỗ trợ bởi AI, tự động xây dựng lịch trình cá nhân hoá dựa trên ngân sách thực tế, dữ liệu thời tiết và khả năng tự động thích ứng sự cố trong suốt chuyến đi.

Hệ thống hoạt động dưới dạng **Vercel Fullstack Monorepo**, tối ưu hoá hoàn toàn cho nền tảng **Web** (React Native Web / Expo).

---

## ✨ Tính Năng Nổi Bật

- **Lịch trình AI tối ưu (Gemini):** Tự động tạo kế hoạch chi tiết theo từng ngày, ràng buộc ngân sách sàn thực tế (phòng nghỉ, ăn uống, di chuyển) và thuật toán chống lặp món ăn.
- **Thích ứng sự cố linh hoạt (Disruption Adapter):** Đề xuất và thay thế lịch trình thông minh khi gặp mưa bão, trễ chuyến, sức khỏe hoặc biến động ngân sách.
- **Trợ lý AI đồng hành (Chatbot 24/7):** Tư vấn điểm đến, điều chỉnh lịch trình và thêm hoạt động trực tiếp qua hội thoại.
- **Bản đồ & Địa điểm tương tác:** Khảo sát hành trình trực quan, tìm kiếm địa điểm qua OpenStreetMap (Nominatim) & Google Places.
- **Thanh toán & Nâng cấp gói:** Tích hợp PayOS (VietQR) và MoMo để nâng cấp gói thành viên mở khóa tính năng cao cấp (Bản đồ chi tiết, Xuất cẩm nang PDF).
- **Trang Quản trị Hệ thống (Admin Portal):** Quản lý người dùng, phân quyền qua Supabase JWT role, xoay vòng tự động API Key (Gemini Key Rotation), thống kê doanh thu và cấu hình đối tác.

---

## 🛠 Tech Stack

| Thành phần | Công nghệ sử dụng |
| :--- | :--- |
| **Frontend** | React Native Web (Expo SDK 56), React 19, Expo Router |
| **Styling & State** | NativeWind (Tailwind CSS v4), TanStack Query, AsyncStorage |
| **Backend** | Node.js, Express (Kiến trúc MVC v2), TypeScript Strict |
| **Database & Auth**| Supabase PostgreSQL, Row Level Security (RLS), Supabase Auth |
| **AI Engine** | Google Gemini (2.5 Flash / Flash-Lite) với cơ chế xoay vòng key từ Database |
| **Thanh toán** | PayOS, MoMo |
| **Triển khai** | Vercel Serverless Fullstack Monorepo |

---

## 📂 Cấu Trúc Dự Án

```text
vivu-planner/
├── api/                    # Vercel Serverless Function entry point
├── frontend/               # Ứng dụng Web Expo (React Native Web)
│   ├── app/                # File-based Routing (Expo Router)
│   │   ├── (auth)/         # Màn hình Đăng nhập / Đăng ký
│   │   ├── (app)/chuyen-di/# Dashboard, Wizard tạo mới & Chi tiết lịch trình
│   │   ├── admin/          # 7 màn hình quản trị module hoá
│   │   ├── premium/        # Nâng cấp tài khoản & xác nhận thanh toán
│   │   └── landing.tsx     # Landing page giới thiệu dự án
│   ├── components/         # UI Components tái sử dụng & AdminNav
│   ├── hooks/              # Custom hooks (useAuth, useTrips, useLocation)
│   ├── lib/                # API Client (Axios), Supabase Client chuẩn hoá
│   └── constants/          # Design Tokens, Business Rules, Enums
├── backend/                # API Server Express MVC
│   └── src/
│       ├── config/         # Cấu hình biến môi trường & Supabase clients
│       ├── constants/      # Enums, Business configs tập trung
│       ├── middleware/     # Auth JWT, Admin Guard, Error Handler chuẩn
│       ├── modules/        # Modular MVC (admin, ai, auth, payment, places, trips, weather)
│       └── utils/          # Key Manager (xoay vòng Gemini keys từ DB)
├── supabase/
│   └── schema.sql          # Database Schema chuan (RLS, Custom Claims Hook, Bang & Indexes)
└── vercel.json             # Cấu hình điều hướng Fullstack Monorepo trên Vercel
```

---

## 🚀 Khởi Chạy Local

### Yêu Cầu Tiên Quyết
- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0

### 1. Cài đặt Dependencies

```bash
# Cài đặt toàn bộ (Root, Backend, Frontend)
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### 2. Thiết lập Biến Môi Trường

Sao chép file mẫu và điền thông tin tương ứng:

```bash
# Frontend (.env)
cp frontend/.env.example frontend/.env

# Backend (.env)
cp backend/.env.example backend/.env
```

**Biến môi trường Frontend (`frontend/.env`):**
```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000/api
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**Biến môi trường Backend (`backend/.env`):**
```env
PORT=4000
FRONTEND_ORIGIN=http://localhost:8081,http://localhost:3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENWEATHER_API_KEY=your-openweather-key

# Cổng thanh toán (Tuỳ chọn cho Local Dev)
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
MOMO_PARTNER_CODE=
MOMO_ACCESS_KEY=
MOMO_SECRET_KEY=
```

> **Lưu ý về Gemini API Key:** Hệ thống **không** đọc key Gemini từ `.env` mà tự động lấy và xoay vòng từ bảng `api_keys` trong Supabase. Quản trị viên thêm key trực tiếp tại giao diện **Admin > Gemini Keys**.

### 3. Chạy Development Server

Mở 2 terminal song song:

```bash
# Terminal 1: Backend (Chạy tại http://localhost:4000)
cd backend
npm run dev

# Terminal 2: Frontend (Chạy tại http://localhost:8081)
cd frontend
npm run web
```

---

## 🧪 Kiểm Tra & Build

```bash
# Kiểm tra Type-check & Code Cleanliness (0 lỗi)
cd backend && npx tsc --noEmit --noUnusedLocals --noUnusedParameters
cd ../frontend && npx tsc --noEmit --noUnusedLocals --noUnusedParameters

# Build Web Bundle
cd ../frontend && npm run build:web
```

---

## 🚢 Triển Khai Lên Vercel

Dự án được đóng gói dạng **Vercel Fullstack Monorepo**:
1. Đẩy mã nguồn lên GitHub.
2. Import repository vào **Vercel Dashboard**.
3. Cấu hình các biến môi trường trong mục **Settings > Environment Variables** (sử dụng các biến từ file `.env.example` ở root).
4. Vercel tự động build frontend tĩnh vào thư mục `dist/` và triển khai backend qua serverless function tại `/api/*`.

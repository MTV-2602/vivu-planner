import { Link } from 'react-router-dom';
import { Compass, Sparkles, AlertTriangle, MapPin, Calendar, Heart, ShieldAlert } from 'lucide-react';
import Reveal from '../components/Reveal';

export function Landing() {
  return (
    <div className="min-h-screen flex flex-col font-label">
      {/* Hero Section - Warm Glow */}
      <header className="relative neon-glow-bg py-20 md:py-32 overflow-hidden flex-grow flex items-center">
        <div className="noise-overlay" aria-hidden="true" />
        
        <div className="max-w-6xl mx-auto px-6 relative z-10 w-full">
          {/* Logo & Header Nav */}
          <div className="flex justify-between items-center mb-16">
            <div className="flex items-center gap-2">
              <Compass className="w-8 h-8 text-brand-primary" />
              <span className="font-display font-bold text-2xl tracking-tight text-brand-primary">
                ViVu Planner
              </span>
            </div>
            <div>
              <Link
                to="/dang-nhap"
                className="px-5 py-2.5 rounded-lg border border-brand-primary text-brand-primary hover:bg-brand-primary/10 transition font-semibold text-sm"
              >
                Đăng Nhập
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Title / Description */}
            <div className="lg:col-span-7 space-y-6">
              <Reveal delay={0}>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-primary/10 text-brand-primary font-semibold text-xs uppercase tracking-wide">
                  <Sparkles className="w-3.5 h-3.5" /> Giải pháp lập lịch trình bằng AI thật
                </div>
              </Reveal>
              
              <Reveal delay={100}>
                <h1 className="text-4xl md:text-6xl font-display font-extrabold tracking-tight text-brand-text leading-[1.15]">
                  Du lịch Việt Nam <br />
                  <span className="text-brand-primary">Không Lo Nghĩ</span> cùng AI
                </h1>
              </Reveal>

              <Reveal delay={200}>
                <p className="text-lg text-brand-textSoft max-w-lg leading-relaxed font-serif italic">
                  "Dành cho những người lười lên kế hoạch nhưng vẫn muốn có một hành trình trọn vẹn, cá nhân hóa sâu sắc và tự động thích ứng khi xảy ra sự cố bất ngờ."
                </p>
              </Reveal>

              <Reveal delay={300}>
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <Link
                    to="/dang-ky"
                    className="px-8 py-4 rounded-xl bg-brand-accent hover:bg-brand-accentStrong text-white font-bold text-center transition shadow-lg hover:shadow-brand-accent/20 transform hover:-translate-y-0.5"
                  >
                    Bắt đầu hành trình miễn phí
                  </Link>
                  <a
                    href="#tinh-nang"
                    className="px-8 py-4 rounded-xl bg-brand-bgAlt border border-brand-line text-brand-textSoft hover:bg-brand-surface font-semibold text-center transition"
                  >
                    Xem tính năng nổi bật
                  </a>
                </div>
              </Reveal>
            </div>

            {/* Premium Mockup Panel */}
            <div className="lg:col-span-5 relative">
              <Reveal delay={200} className="w-full">
                <div className="glass-panel p-6 md:p-8 rounded-3xl shadow-2xl relative border border-white/40">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-brand-text">Gợi ý từ ViVu AI</h3>
                      <p className="text-xs text-brand-textMuted">Hà Nội — 3 ngày 2 đêm</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Item 1 */}
                    <div className="p-4 rounded-xl bg-white/70 border border-brand-line/50 flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center text-brand-primary font-bold text-xs shrink-0">
                        09:00
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm text-brand-text">Đền Ngọc Sơn & Hồ Hoàn Kiếm</h4>
                        <p className="text-xs text-brand-textSoft mt-0.5">Đi bộ dạo hồ mát mẻ, chụp hình cầu Thê Húc đỏ rực cổ kính.</p>
                      </div>
                    </div>

                    {/* Disruption Warning simulation */}
                    <div className="p-4 rounded-xl bg-brand-danger/10 border border-brand-danger/30 flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-brand-danger shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-sm text-brand-danger">Cảnh báo: Thời tiết mưa to bão lớn</h4>
                        <p className="text-xs text-brand-danger/90 mt-0.5">Tự động đề xuất đổi sang tham quan **Bảo Tàng Lịch Sử** trong nhà và thưởng thức cà phê trứng.</p>
                      </div>
                    </div>

                    {/* Item 3 */}
                    <div className="p-4 rounded-xl bg-white/70 border border-brand-line/50 flex gap-3 opacity-60">
                      <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center text-brand-primary font-bold text-xs shrink-0">
                        12:00
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm text-brand-text">Ăn trưa tại Bún Chả Hương Liên</h4>
                        <p className="text-xs text-brand-textSoft mt-0.5">Thưởng thức món bún chả nổi tiếng thế giới.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </header>

      {/* Feature Section - Theme Paper Alternating */}
      <section id="tinh-nang" className="theme-paper py-24 border-y border-brand-line/50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-20 space-y-4">
            <Reveal>
              <h2 className="text-3xl md:text-5xl font-display font-extrabold text-brand-text">
                Giải quyết mọi nỗi lo khi xê dịch
              </h2>
            </Reveal>
            <Reveal delay={100}>
              <p className="text-brand-textSoft font-serif">
                MVP ViVu Planner được thiết kế xoay quanh nhu cầu thực tế của du khách Việt Nam để xử lý các phát sinh khi đang đi tour.
              </p>
            </Reveal>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Reveal delay={0}>
              <div className="bg-brand-bg p-8 rounded-2xl border border-brand-line/50 shadow-sm space-y-4 hover:shadow-md transition">
                <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-4">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-brand-text">AI Sinh Lịch Trình Thật</h3>
                <p className="text-brand-textSoft text-sm leading-relaxed">
                  Lập kế hoạch tối ưu hóa bằng Gemini AI dựa trên thời tiết, sở thích cá nhân, khả năng sức khỏe và túi tiền của bạn.
                </p>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div className="bg-brand-bg p-8 rounded-2xl border border-brand-line/50 shadow-sm space-y-4 hover:shadow-md transition">
                <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-4">
                  <MapPin className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-brand-text">Dữ Liệu Địa Điểm Thực</h3>
                <p className="text-brand-textSoft text-sm leading-relaxed">
                  Không bao giờ gợi ý địa điểm bịa đặt. Toàn bộ thông tin chỗ nghỉ, quán ăn, điểm checkin đều lấy từ Google Places API.
                </p>
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className="bg-brand-bg p-8 rounded-2xl border border-brand-line/50 shadow-sm space-y-4 hover:shadow-md transition">
                <div className="w-12 h-12 rounded-xl bg-brand-danger/10 flex items-center justify-center text-brand-danger mb-4">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-brand-text">Thích Ứng Khi Có Sự Cố</h3>
                <p className="text-brand-textSoft text-sm leading-relaxed">
                  Trễ chuyến bay? Trời đổ bão? Đột ngột hết tiền hay bị cảm cúm? Bấm báo sự cố và AI sẽ thích nghi, tính toán lại phần còn lại tức thì.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* JTBD / Target Users - Dark Theme Alternating */}
      <section className="theme-dark py-24 relative overflow-hidden">
        <div className="noise-overlay" aria-hidden="true" />
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <Reveal>
              <div className="space-y-6">
                <h2 className="text-3xl md:text-5xl font-display font-extrabold text-brand-bg">
                  Được thiết kế cho <br />du lịch thông minh
                </h2>
                <p className="text-brand-textSoft leading-relaxed font-serif">
                  Bạn không cần tốn hàng giờ nghiên cứu các hội nhóm du lịch hay băn khoăn đi đâu ăn gì. ViVu Planner giúp bạn có lịch trình hoàn hảo chỉ với 4 bước điền thông tin nhanh gọn.
                </p>
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-brand-accent flex items-center justify-center text-white text-xs font-bold">✓</div>
                    <span className="text-sm font-semibold text-brand-bg">Đi một mình, đi cặp đôi, gia đình hoặc nhóm bạn</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-brand-accent flex items-center justify-center text-white text-xs font-bold">✓</div>
                    <span className="text-sm font-semibold text-brand-bg">Theo dõi thời tiết trực quan để chuẩn bị trang phục</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-brand-accent flex items-center justify-center text-white text-xs font-bold">✓</div>
                    <span className="text-sm font-semibold text-brand-bg">Đảm bảo ngân sách không bị phát sinh ngoài tầm kiểm soát</span>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={150}>
              <div className="glass-panel p-8 rounded-3xl border border-white/10 space-y-6 text-brand-bg">
                <blockquote className="font-serif italic text-lg leading-relaxed text-brand-textSoft">
                  "Chuyến đi Hội An vừa rồi của mình bất ngờ gặp mưa to, nhờ ViVu Planner thích nghi đổi địa điểm sang học làm đèn lồng và đi cafe trong phố cổ mà tụi mình vẫn có một kỷ niệm tuyệt vời."
                </blockquote>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-primary flex items-center justify-center text-white font-bold text-sm">
                    NL
                  </div>
                  <div>
                    <h5 className="font-bold text-sm">Ngọc Linh</h5>
                    <p className="text-xs text-brand-textSoft">Du khách từ TP. Hồ Chí Minh</p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-brand-bgAlt py-12 text-center border-t border-brand-line/40 text-sm text-brand-textSoft">
        <div className="max-w-6xl mx-auto px-6 space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Compass className="w-6 h-6 text-brand-primary" />
            <span className="font-display font-bold text-lg text-brand-primary">ViVu Planner</span>
          </div>
          <p>© 2026 ViVu Planner. Tất cả các quyền được bảo lưu. Dự án du lịch thông minh Việt Nam.</p>
        </div>
      </footer>
    </div>
  );
}
export default Landing;

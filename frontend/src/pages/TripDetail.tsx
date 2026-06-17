import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Compass, ArrowLeft, AlertTriangle, Calendar, Wallet, MapPin, 
  Sparkles, Clock, Map, Star, Utensils, Home, Bike, Check, X, 
  HelpCircle, ChevronRight, Activity, ThermometerSun 
} from 'lucide-react';
import { apiClient } from '../lib/apiClient';
import Reveal from '../components/Reveal';
import BackToTop from '../components/BackToTop';

interface ItineraryItem {
  id: string;
  item_type: 'accommodation' | 'transport' | 'dining' | 'attraction' | 'rental' | 'experience';
  title: string;
  description: string;
  start_time?: string;
  end_time?: string;
  location_name: string;
  location_lat?: number;
  location_lng?: number;
  google_place_id?: string;
  estimated_cost?: number;
  status: 'planned' | 'confirmed' | 'skipped' | 'replaced';
  order_index: number;
}

interface ItineraryDay {
  id: string;
  day_number: number;
  date: string;
  weather_summary?: {
    note?: string;
  };
  notes?: string;
  items: ItineraryItem[];
}

interface TripDetailData {
  id: string;
  title: string;
  destination_city: string;
  start_date: string;
  end_date: string;
  budget_total: number;
  traveler_count: number;
  traveler_type: string;
  health_conditions?: string;
  special_requirements?: string;
  status: string;
  days: ItineraryDay[];
  revisions?: any[];
}

export function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [isDisruptionModalOpen, setIsDisruptionModalOpen] = useState(false);

  // Disruption Form State
  const [disruptionType, setDisruptionType] = useState('weather_change');
  const [disruptionDesc, setDisruptionDesc] = useState('');
  const [disruptionDayId, setDisruptionDayId] = useState('');
  const [adaptationDiff, setAdaptationDiff] = useState<string>('');

  const { data: trip, isLoading, isError, refetch } = useQuery<TripDetailData>({
    queryKey: ['trip', id],
    queryFn: async () => {
      const res = await apiClient.get(`/trips/${id}`);
      return res.data;
    }
  });

  // Set default active tab once days are loaded
  useEffect(() => {
    if (trip && trip.days && trip.days.length > 0 && !activeTabId) {
      // Find the first day
      const sorted = [...trip.days].sort((a, b) => a.day_number - b.day_number);
      setActiveTabId(sorted[0].id);
      setDisruptionDayId(sorted[0].id);
    }
  }, [trip, activeTabId]);

  const adaptMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.post(`/trips/${id}/disruptions`, payload);
      return res.data;
    },
    onSuccess: (data) => {
      setAdaptationDiff(data.diff);
      setIsDisruptionModalOpen(false);
      setDisruptionDesc('');
      refetch();
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-bg flex justify-center items-center font-label">
        <div className="text-center space-y-4">
          <Loader2Icon className="w-10 h-10 text-brand-primary animate-spin mx-auto" />
          <p className="text-sm font-semibold text-brand-textSoft">Đang tải lịch trình du lịch...</p>
        </div>
      </div>
    );
  }

  if (isError || !trip) {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col justify-center items-center px-6 font-label">
        <div className="text-center max-w-md space-y-6">
          <AlertTriangle className="w-16 h-16 text-brand-danger mx-auto" />
          <h2 className="text-2xl font-bold text-brand-text">Không tìm thấy chuyến đi</h2>
          <p className="text-sm text-brand-textSoft">Lịch trình này không tồn tại hoặc bạn không có quyền truy cập.</p>
          <Link
            to="/chuyen-di"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-primary text-white font-bold"
          >
            <ArrowLeft className="w-4 h-4" /> Quay lại danh sách
          </Link>
        </div>
      </div>
    );
  }

  const activeDay = trip.days.find(d => d.id === activeTabId);
  const activeItems = activeDay 
    ? [...activeDay.items].sort((a, b) => a.order_index - b.order_index) 
    : [];

  const handleReportDisruptionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disruptionDesc) return;
    
    adaptMutation.mutate({
      disruption_type: disruptionType,
      description: disruptionDesc,
      day_id: disruptionDayId || null
    });
  };

  const getItemTypeIcon = (type: string) => {
    switch (type) {
      case 'accommodation': return <Home className="w-4 h-4" />;
      case 'transport': return <Bike className="w-4 h-4" />;
      case 'dining': return <Utensils className="w-4 h-4" />;
      case 'attraction': return <Map className="w-4 h-4" />;
      case 'rental': return <Bike className="w-4 h-4" />;
      case 'experience': return <Sparkles className="w-4 h-4" />;
      default: return <HelpCircle className="w-4 h-4" />;
    }
  };

  const getItemTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      accommodation: 'Chỗ nghỉ',
      transport: 'Di chuyển',
      dining: 'Ăn uống',
      attraction: 'Tham quan',
      rental: 'Thuê xe',
      experience: 'Trải nghiệm'
    };
    return labels[type] || 'Khác';
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    if (dateStr.includes('T')) {
      const date = new Date(dateStr);
      const formatter = new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'Asia/Ho_Chi_Minh'
      });
      return formatter.format(date);
    } else {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}`;
      }
    }
    const date = new Date(dateStr);
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${d}/${m}`;
  };

  return (
    <div className="min-h-screen bg-brand-bg font-label pb-20">
      
      {/* Top navbar */}
      <nav className="glass-panel border-b border-brand-line/40 sticky top-0 z-30 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link
            to="/chuyen-di"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-textSoft hover:text-brand-primary transition"
          >
            <ArrowLeft className="w-4 h-4" /> Bảng điều khiển
          </Link>
          <div className="flex items-center gap-2">
            <Compass className="w-6 h-6 text-brand-primary" />
            <span className="font-display font-extrabold text-lg text-brand-primary">ViVu Planner</span>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        
        {/* Banner: AI adjustment notify log */}
        {adaptationDiff && (
          <Reveal className="p-5 rounded-2xl border border-brand-accent/30 bg-brand-accent/5 flex flex-col md:flex-row justify-between items-start gap-4 shadow-sm animate-pulse">
            <div className="space-y-1">
              <h4 className="font-extrabold text-sm text-brand-accentStrong flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 animate-bounce" /> Lịch trình vừa được AI điều chỉnh
              </h4>
              <p className="text-xs text-brand-textSoft leading-relaxed whitespace-pre-line font-serif italic">
                {adaptationDiff}
              </p>
            </div>
            <button
              onClick={() => setAdaptationDiff('')}
              className="text-[10px] uppercase font-bold text-brand-textSoft hover:text-brand-accent px-3 py-1 rounded bg-brand-line/10 hover:bg-brand-line/25 transition shrink-0"
            >
              Đóng thông báo
            </button>
          </Reveal>
        )}

        {/* Trip Title & Metadata */}
        <header className="flex flex-col md:flex-row md:justify-between md:items-start gap-6 border-b border-brand-line/30 pb-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-primary/10 text-brand-primary font-bold text-xs">
              <MapPin className="w-3.5 h-3.5" /> {trip.destination_city}
            </div>
            <h1 className="text-3xl font-display font-extrabold text-brand-text leading-tight">{trip.title}</h1>
            
            <div className="flex flex-wrap gap-4 text-xs text-brand-textSoft font-semibold pt-1">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-brand-primary" /> {formatDate(trip.start_date)} — {formatDate(trip.end_date)}
              </span>
              <span className="flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-brand-primary" /> Ngân sách: {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(trip.budget_total)}
              </span>
              <span className="flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-brand-primary" /> {trip.traveler_count} khách ({trip.traveler_type})
              </span>
            </div>
          </div>

          <button
            onClick={() => setIsDisruptionModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3.5 rounded-xl bg-brand-danger hover:bg-brand-danger/90 text-white font-bold transition shadow-lg hover:shadow-brand-danger/25 transform hover:-translate-y-0.5 shrink-0"
          >
            <AlertTriangle className="w-4 h-4" />
            Báo sự cố chuyến đi
          </button>
        </header>

        {/* Itinerary body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Switchers & Weather */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Day Switcher */}
            <div className="glass-panel p-5 rounded-2xl border border-brand-line/50 space-y-4">
              <h3 className="font-bold text-brand-text text-sm">Các ngày hành trình</h3>
              <div className="flex flex-col gap-2">
                {[...trip.days]
                  .sort((a, b) => a.day_number - b.day_number)
                  .map(day => {
                    const isSelected = activeTabId === day.id;
                    return (
                      <button
                        key={day.id}
                        onClick={() => setActiveTabId(day.id)}
                        className={`w-full p-4 rounded-xl text-left transition-all border ${
                          isSelected
                            ? 'bg-brand-primary border-brand-primary text-white shadow'
                            : 'bg-brand-bg/50 border-brand-line/30 text-brand-textSoft hover:bg-brand-surfaceStrong/10'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-xs opacity-75 font-semibold">Ngày 0{day.day_number}</span>
                            <h4 className="font-bold text-sm leading-tight mt-0.5">{formatDate(day.date)}</h4>
                          </div>
                          <ChevronRight className={`w-4 h-4 transition ${isSelected ? 'rotate-90' : ''}`} />
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Weather Box */}
            {activeDay && (
              <Reveal key={`weather-${activeDay.id}`} className="glass-panel p-5 rounded-2xl border border-brand-line/50 space-y-3.5">
                <h4 className="font-bold text-brand-text text-sm flex items-center gap-1.5">
                  <ThermometerSun className="w-4 h-4 text-brand-primary" /> Dự báo thời tiết ngày
                </h4>
                <div className="p-4 rounded-xl bg-brand-surface border border-brand-line/30 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs text-brand-textMuted uppercase font-bold tracking-wider">Trạng thái</span>
                    <p className="font-bold text-brand-text text-sm">{activeDay.weather_summary?.note?.split(',')[0] || 'Thời tiết ổn định'}</p>
                  </div>
                  {activeDay.weather_summary?.note?.includes('mưa') || activeDay.weather_summary?.note?.includes('giông') ? (
                    <div className="px-3 py-1.5 rounded-lg bg-brand-danger/10 border border-brand-danger/30 text-brand-danger text-[10px] font-bold uppercase tracking-wider animate-pulse">
                      Mưa bão đề xuất tránh ngoài trời
                    </div>
                  ) : (
                    <div className="px-3 py-1.5 rounded-lg bg-brand-primary/10 border border-brand-primary/30 text-brand-primary text-[10px] font-bold uppercase tracking-wider">
                      Lý tưởng
                    </div>
                  )}
                </div>
                <p className="text-xs text-brand-textSoft italic font-serif leading-relaxed">
                  {activeDay.weather_summary?.note || 'Đang cập nhật thời tiết từ trạm dự báo Open-Meteo...'}
                </p>
              </Reveal>
            )}

            {/* Revision logs if any */}
            {trip.revisions && trip.revisions.length > 0 && (
              <div className="p-5 rounded-2xl bg-brand-bgAlt border border-brand-line/50 space-y-4">
                <h4 className="font-bold text-brand-text text-sm flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-brand-primary" /> Nhật ký điều chỉnh ({trip.revisions.length})
                </h4>
                <div className="space-y-3.5 max-h-48 overflow-y-auto">
                  {trip.revisions.map((rev, rIdx) => (
                    <div key={rev.id} className="text-xs border-l-2 border-brand-accent pl-3 py-1 space-y-1">
                      <span className="text-[10px] text-brand-textMuted font-bold">LẦN {trip.revisions!.length - rIdx} — {new Date(rev.created_at).toLocaleTimeString('vi-VN')}</span>
                      <p className="text-brand-textSoft font-serif italic line-clamp-2">{rev.new_snapshot?.disruption?.description || 'AI điều chỉnh kế hoạch'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Timeline activities */}
          <div className="lg:col-span-8 space-y-6">
            <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-brand-line/50 relative overflow-hidden">
              <h2 className="text-2xl font-display font-extrabold text-brand-text mb-6">Chi tiết hoạt động</h2>

              {activeItems.length === 0 ? (
                <div className="text-center py-12 text-brand-textSoft text-sm">
                  Chưa có hoạt động nào được thêm vào ngày này.
                </div>
              ) : (
                <div className="space-y-6 relative border-l border-brand-line/40 pl-6 ml-3">
                  {activeItems.map((item, idx) => {
                    const isReplaced = item.status === 'replaced';
                    const isSkipped = item.status === 'skipped';
                    return (
                      <div
                        key={item.id}
                        className={`stagger-item relative group ${
                          isReplaced || isSkipped ? 'opacity-40' : ''
                        }`}
                        style={{ animationDelay: `${idx * 60}ms` }}
                      >
                        {/* Timeline dot */}
                        <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                          isReplaced
                            ? 'bg-brand-line border-brand-textMuted'
                            : item.item_type === 'accommodation'
                            ? 'bg-brand-primary border-brand-primary'
                            : 'bg-brand-bg border-brand-primary group-hover:bg-brand-primary'
                        }`}>
                          {isReplaced && <X className="w-2.5 h-2.5 text-brand-textMuted" />}
                        </div>

                        {/* Content Card */}
                        <div className="p-4 rounded-2xl bg-brand-bgAlt border border-brand-line/40 group-hover:border-brand-primary/50 transition">
                          <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                            <div className="space-y-1.5">
                              {/* Header tags */}
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-primary flex items-center gap-1 bg-white border border-brand-line/40 px-2 py-0.5 rounded">
                                  {getItemTypeIcon(item.item_type)}
                                  {getItemTypeBadge(item.item_type)}
                                </span>
                                {item.start_time && (
                                  <span className="text-[10px] font-bold text-brand-textSoft flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {item.start_time.substring(0, 5)} {item.end_time ? `— ${item.end_time.substring(0, 5)}` : ''}
                                  </span>
                                )}
                                {isReplaced && (
                                  <span className="text-[9px] font-bold bg-brand-danger/10 border border-brand-danger/35 text-brand-danger px-1.5 py-0.5 rounded">
                                    ĐÃ THAY THẾ
                                  </span>
                                )}
                              </div>
                              
                              <h4 className={`text-base font-bold text-brand-text ${isReplaced ? 'line-through' : ''}`}>
                                {item.title}
                              </h4>
                              
                              <p className="text-xs text-brand-textSoft leading-relaxed font-serif">
                                {item.description}
                              </p>
                            </div>

                            {/* Estimated Cost */}
                            {item.estimated_cost !== undefined && (
                              <div className="text-right shrink-0">
                                <span className="text-[10px] text-brand-textMuted font-bold block uppercase tracking-wider">Dự tính</span>
                                <span className="text-xs font-extrabold text-brand-text">
                                  {item.estimated_cost === 0 ? 'Miễn phí' : `${item.estimated_cost.toLocaleString('vi-VN')}đ`}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          </div>
        </div>
      </main>

      {/* Back to top button */}
      <BackToTop />

      {/* DISRUPTION MODAL */}
      {isDisruptionModalOpen && (
        <div className="fixed inset-0 bg-brand-bgDark/60 backdrop-blur-sm flex items-center justify-center p-6 z-50 animate-fadeIn font-label">
          <Reveal className="bg-brand-bg p-8 rounded-3xl max-w-md w-full shadow-2xl border border-brand-line/50 space-y-6">
            <div className="flex justify-between items-center border-b border-brand-line/35 pb-4">
              <h3 className="text-lg font-display font-extrabold text-brand-text flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-brand-danger" /> Báo sự cố chuyến đi
              </h3>
              <button
                onClick={() => setIsDisruptionModalOpen(false)}
                className="p-1 rounded bg-brand-line/10 hover:bg-brand-line/25 text-brand-textSoft transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReportDisruptionSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-brand-textSoft mb-1.5">Loại sự cố phát sinh</label>
                <select
                  value={disruptionType}
                  onChange={(e) => setDisruptionType(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold cursor-pointer"
                >
                  <option value="weather_change">Thay đổi thời tiết (Mưa bão lớn...)</option>
                  <option value="budget_shortage">Hụt ngân sách (Mất tiền, chi quá tay...)</option>
                  <option value="health_issue">Vấn đề sức khỏe (Bị ốm, say nắng...)</option>
                  <option value="delay">Trễ chuyến / Giao thông tắc nghẽn</option>
                  <option value="other">Sự cố khác</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-brand-textSoft mb-1.5">Điều chỉnh lịch trình từ ngày</label>
                <select
                  value={disruptionDayId}
                  onChange={(e) => setDisruptionDayId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold cursor-pointer"
                >
                  {[...trip.days]
                    .sort((a, b) => a.day_number - b.day_number)
                    .map(day => (
                      <option key={day.id} value={day.id}>Ngày 0{day.day_number} ({formatDate(day.date)})</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-brand-textSoft mb-1.5">Mô tả chi tiết sự cố</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Ví dụ: Trời mưa bão to từ chiều hôm nay không đi biển được; Bị rơi mất ví tiền thâm hụt 2 triệu chi tiêu..."
                  value={disruptionDesc}
                  onChange={(e) => setDisruptionDesc(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-brand-line/35">
                <button
                  type="button"
                  onClick={() => setIsDisruptionModalOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-brand-line text-xs font-bold text-brand-textSoft hover:bg-brand-surface transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={adaptMutation.isPending}
                  className="px-5 py-3 rounded-xl bg-brand-danger hover:bg-brand-danger/90 text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {adaptMutation.isPending ? (
                    <>
                      <Loader2Icon className="w-4 h-4 animate-spin" />
                      AI đang xử lý...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Yêu cầu AI điều chỉnh
                    </>
                  )}
                </button>
              </div>
            </form>
          </Reveal>
        </div>
      )}

    </div>
  );
}

// Simple loader icon
function Loader2Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export default TripDetail;

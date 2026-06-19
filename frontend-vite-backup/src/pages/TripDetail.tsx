import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Compass, ArrowLeft, AlertTriangle, Calendar, Wallet, MapPin, 
  Sparkles, Clock, Map, Star, Utensils, Home, Bike, Check, X, 
  HelpCircle, ChevronRight, Activity, ThermometerSun, Trash2, PenLine,
  Shield
} from 'lucide-react';
import { apiClient } from '../lib/apiClient';
import Reveal from '../components/Reveal';
import BackToTop from '../components/BackToTop';
import SystemClock from '../components/SystemClock';


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
  estimated_cost?: number | null;
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
  const isAdmin = !!localStorage.getItem('vivu_admin_token');
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [isDisruptionModalOpen, setIsDisruptionModalOpen] = useState(false);

  // Disruption Form State
  const [disruptionType, setDisruptionType] = useState('weather_change');
  const [disruptionDesc, setDisruptionDesc] = useState('');
  const [disruptionDayId, setDisruptionDayId] = useState('');
  const [adaptationDiff, setAdaptationDiff] = useState<string>('');

  // AI Preview & Selection State
  const [proposedItinerary, setProposedItinerary] = useState<any>(null);
  const [proposedDiff, setProposedDiff] = useState<string>('');
  const [previousSnapshot, setPreviousSnapshot] = useState<any>(null);
  const [selectedProposedItems, setSelectedProposedItems] = useState<any[]>([]);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});

  // Manual Edit State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editStatus, setEditStatus] = useState<'planned' | 'confirmed' | 'skipped' | 'replaced'>('planned');
  const [editItemType, setEditItemType] = useState<string>('attraction');

  // AI Replacement States
  const [isAiReplaceModalOpen, setIsAiReplaceModalOpen] = useState(false);
  const [aiReplaceItem, setAiReplaceItem] = useState<any | null>(null);
  const [aiAlternatives, setAiAlternatives] = useState<any[]>([]);
  const [aiReplaceRequirement, setAiReplaceRequirement] = useState('');
  const [isFetchingAlternatives, setIsFetchingAlternatives] = useState(false);

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

  const previewMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.post(`/trips/${id}/disruptions/preview`, payload);
      return res.data;
    },
    onSuccess: (data) => {
      setProposedItinerary(data.adaptedItinerary);
      setProposedDiff(data.diff);
      setPreviousSnapshot(data.previousSnapshot);

      // Select all proposed items by default
      const allNewItems: any[] = [];
      data.adaptedItinerary.days.forEach((day: any) => {
        let affectedDayNumber = 1;
        if (disruptionDayId) {
          const matchedDay = trip?.days.find(d => d.id === disruptionDayId);
          if (matchedDay) affectedDayNumber = matchedDay.day_number;
        }
        if (Number(day.day_number) >= affectedDayNumber) {
          day.items.forEach((item: any, idx: number) => {
            allNewItems.push({
              ...item,
              day_number: day.day_number,
              temp_id: `temp-${day.day_number}-${idx}`
            });
          });
        }
      });
      setSelectedProposedItems(allNewItems);

      setIsDisruptionModalOpen(false);
      setIsPreviewModalOpen(true);
      setQuestionAnswers({});
    },
    onError: (err: any) => {
      alert('Lỗi phân tích sự cố: ' + (err.response?.data?.error || err.message));
    }
  });

  const applyMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.post(`/trips/${id}/disruptions/apply`, payload);
      return res.data;
    },
    onSuccess: () => {
      setIsPreviewModalOpen(false);
      setDisruptionDesc('');
      setProposedItinerary(null);
      setProposedDiff('');
      setSelectedProposedItems([]);
      setAdaptationDiff('Lịch trình đã được điều chỉnh thành công theo lựa chọn của bạn!');
      refetch();
    },
    onError: (err: any) => {
      alert('Lỗi áp dụng lịch trình: ' + (err.response?.data?.error || err.message));
    }
  });

  const editMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.put(`/trips/items/${editingItem.id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      setIsEditModalOpen(false);
      refetch();
    },
    onError: (err: any) => {
      alert('Lỗi cập nhật hoạt động: ' + (err.response?.data?.error || err.message));
    }
  });

  const aiReplaceMutation = useMutation({
    mutationFn: async ({ itemId, payload }: { itemId: string; payload: any }) => {
      const res = await apiClient.put(`/trips/items/${itemId}`, payload);
      return res.data;
    },
    onSuccess: () => {
      setIsAiReplaceModalOpen(false);
      setAiReplaceItem(null);
      setAiAlternatives([]);
      setAiReplaceRequirement('');
      refetch();
    },
    onError: (err: any) => {
      alert('Lỗi áp dụng gợi ý AI: ' + (err.response?.data?.error || err.message));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiClient.delete(`/trips/items/${itemId}`);
    },
    onSuccess: () => {
      refetch();
    },
    onError: (err: any) => {
      alert('Lỗi khi xóa hoạt động: ' + (err.response?.data?.error || err.message));
    }
  });

  const handleEditClick = (item: any) => {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditDesc(item.description || '');
    setEditStartTime(item.start_time ? item.start_time.substring(0, 5) : '');
    setEditEndTime(item.end_time ? item.end_time.substring(0, 5) : '');
    setEditCost(item.estimated_cost === undefined || item.estimated_cost === null ? '' : String(item.estimated_cost));
    setEditStatus(item.status);
    setEditItemType(item.item_type);
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle) return;
    editMutation.mutate({
      title: editTitle,
      description: editDesc,
      start_time: editStartTime || null,
      end_time: editEndTime || null,
      estimated_cost: editCost.trim() === '' ? null : Number(editCost),
      status: editStatus,
      item_type: editItemType
    });
  };

  const handleDeleteClick = (itemId: string, itemTitle: string) => {
    if (confirm(`Bạn có chắc chắn muốn xóa hoạt động "${itemTitle}"?`)) {
      deleteMutation.mutate(itemId);
    }
  };

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
            to={isAdmin ? "/admin" : "/chuyen-di"}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-primary text-white font-bold"
          >
            <ArrowLeft className="w-4 h-4" /> Quay lại {isAdmin ? "Trang quản trị" : "danh sách"}
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
    
    previewMutation.mutate({
      disruption_type: disruptionType,
      description: disruptionDesc,
      day_id: disruptionDayId || null
    });
  };

  const handleResubmitWithAnswers = () => {
    if (!proposedItinerary?.missing_info_questions) return;
    
    const answersStr = proposedItinerary.missing_info_questions
      .map((quest: string, idx: number) => {
        const ans = questionAnswers[idx] || '';
        return ans.trim() ? `- Q: ${quest}\n  A: ${ans.trim()}` : '';
      })
      .filter((text: string) => text !== '')
      .join('\n');

    if (!answersStr) {
      alert('Vui lòng điền câu trả lời cho các câu hỏi trước khi gửi lại.');
      return;
    }

    const fullDescription = `${disruptionDesc}\n\n[Thông tin bổ sung trả lời câu hỏi AI]:\n${answersStr}`;
    
    previewMutation.mutate({
      disruption_type: disruptionType,
      description: fullDescription,
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

  const hasOfficialCost = (cost?: number | null) => {
    return cost !== undefined && cost !== null && Number.isFinite(Number(cost));
  };

  const formatEstimatedCost = (cost?: number | null) => {
    if (!hasOfficialCost(cost)) return 'C\u1ea7n x\u00e1c nh\u1eadn gi\u00e1';
    const normalizedCost = Number(cost);
    return normalizedCost === 0 ? 'Mi\u1ec5n ph\u00ed' : `${normalizedCost.toLocaleString('vi-VN')}\u0111`;
  };

  return (
    <div className="min-h-screen bg-brand-bg font-label pb-20">
      
      {/* Top navbar */}
      <nav className="glass-panel border-b border-brand-line/40 sticky top-0 z-30 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link
            to={isAdmin ? "/admin" : "/chuyen-di"}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-textSoft hover:text-brand-primary transition"
          >
            <ArrowLeft className="w-4 h-4" /> {isAdmin ? "Trang quản trị" : "Bảng điều khiển"}
          </Link>
          <div className="flex items-center gap-4">
            <SystemClock />
            <div className="flex items-center gap-2">
              <Compass className="w-6 h-6 text-brand-primary" />
              <span className="font-display font-extrabold text-lg text-brand-primary">ViVu Planner</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {isAdmin && (
          <div className="p-4 rounded-2xl border border-brand-accent/30 bg-brand-accent/5 text-brand-accentStrong text-xs font-bold flex items-center justify-center gap-2">
            <Shield className="w-4.5 h-4.5" />
            Bạn đang xem chi tiết chuyến đi này với tư cách Quản trị viên (Chế độ chỉ đọc).
          </div>
        )}
        
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

          {!isAdmin && (
            <button
              onClick={() => setIsDisruptionModalOpen(true)}
              className="flex items-center gap-2 px-5 py-3.5 rounded-xl bg-brand-danger hover:bg-brand-danger/90 text-white font-bold transition shadow-lg hover:shadow-brand-danger/25 transform hover:-translate-y-0.5 shrink-0"
            >
              <AlertTriangle className="w-4 h-4" />
              Báo sự cố chuyến đi
            </button>
          )}
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
                          <div className="flex flex-col sm:flex-row justify-between items-start gap-2 w-full">
                            <div className="space-y-1.5 flex-grow">
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

                            {/* Actions & Cost Area */}
                            <div className="text-right shrink-0 flex flex-col items-end justify-between gap-3 h-full min-h-[50px]">
                              {hasOfficialCost(item.estimated_cost) ? (
                                <div>
                                  <span className="text-[10px] text-brand-textMuted font-bold block uppercase tracking-wider">Dự tính</span>
                                  <span className="text-xs font-extrabold text-brand-text">
                                    {formatEstimatedCost(item.estimated_cost)}
                                  </span>
                                </div>
                              ) : (
                                <div>
                                  <span className="text-[10px] text-brand-textMuted font-bold block uppercase tracking-wider">Dự tính</span>
                                  <span className="text-xs font-extrabold text-brand-text">{'C\u1ea7n x\u00e1c nh\u1eadn gi\u00e1'}</span>
                                </div>
                              )}

                              {/* Manual edit, delete and AI replacement buttons */}
                              {!isAdmin && (
                                <div className="flex gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setAiReplaceItem(item);
                                      setIsAiReplaceModalOpen(true);
                                      setAiAlternatives([]);
                                      setAiReplaceRequirement('');
                                    }}
                                    className="p-1 rounded bg-brand-accent/10 hover:bg-brand-accent/25 text-brand-accent transition"
                                    title="AI thay thế hoạt động"
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleEditClick(item);
                                    }}
                                    className="p-1 rounded bg-brand-primary/10 hover:bg-brand-primary/25 text-brand-primary transition"
                                    title="Sửa hoạt động"
                                  >
                                    <PenLine className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleDeleteClick(item.id, item.title);
                                    }}
                                    className="p-1 rounded bg-brand-danger/10 hover:bg-brand-danger/25 text-brand-danger transition"
                                    title="Xóa hoạt động"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
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
                  disabled={previewMutation.isPending}
                  className="px-5 py-3 rounded-xl bg-brand-danger hover:bg-brand-danger/90 text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {previewMutation.isPending ? (
                    <>
                      <Loader2Icon className="w-4 h-4 animate-spin" />
                      AI đang phân tích...
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

      {/* AI PREVIEW & SELECTION MODAL */}
      {isPreviewModalOpen && proposedItinerary && (
        <div className="fixed inset-0 bg-brand-bgDark/60 backdrop-blur-sm flex items-center justify-center p-6 z-50 animate-fadeIn font-label">
          <div className="bg-brand-bg p-8 rounded-3xl max-w-2xl w-full shadow-2xl border border-brand-line/50 space-y-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-brand-line/35 pb-4">
              <h3 className="text-lg font-display font-extrabold text-brand-text flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-brand-primary" /> Đề xuất lịch trình từ AI
              </h3>
              <button
                onClick={() => setIsPreviewModalOpen(false)}
                className="p-1 rounded bg-brand-line/10 hover:bg-brand-line/25 text-brand-textSoft transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {proposedDiff && (
                <div className="p-4 rounded-xl bg-brand-primary/5 border border-brand-primary/20 text-xs text-brand-textSoft font-serif italic whitespace-pre-line">
                  <strong>Các thay đổi dự kiến:</strong><br />
                  {proposedDiff}
                </div>
              )}

              {/* Expert Travel Guide Advice */}
              {proposedItinerary.expert_advice && (
                <div className="p-4 rounded-2xl bg-brand-primary/10 border border-brand-primary/30 text-xs text-brand-text flex gap-3 items-start">
                  <Sparkles className="w-5 h-5 text-brand-primary shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <span className="font-extrabold text-brand-primary block mb-1 uppercase tracking-wider text-[10px]">Tư vấn chuyên gia:</span>
                    <p className="font-serif italic leading-relaxed whitespace-pre-line text-brand-textSoft">
                      {proposedItinerary.expert_advice}
                    </p>
                  </div>
                </div>
              )}

              {/* Travel Safety Warnings */}
              {proposedItinerary.warning_notes && proposedItinerary.warning_notes.length > 0 && (
                <div className="p-4 rounded-2xl bg-brand-danger/10 border border-brand-danger/30 text-xs text-brand-danger flex gap-3 items-start">
                  <AlertTriangle className="w-5 h-5 text-brand-danger shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold text-brand-danger block mb-1 uppercase tracking-wider text-[10px]">Cảnh báo an toàn du lịch:</span>
                    <ul className="list-disc list-inside space-y-1 font-semibold leading-relaxed">
                      {proposedItinerary.warning_notes.map((note: string, idx: number) => (
                        <li key={idx}>{note}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Clarifying / Missing Information Questions */}
              {proposedItinerary.missing_info_questions && proposedItinerary.missing_info_questions.length > 0 && (
                <div className="p-5 rounded-2xl bg-brand-gold/15 border border-brand-gold/40 text-xs text-brand-primaryStrong flex gap-3 items-start">
                  <HelpCircle className="w-5 h-5 text-brand-gold shrink-0 mt-0.5 animate-bounce" />
                  <div className="w-full space-y-3">
                    <div>
                      <span className="font-extrabold text-brand-primaryStrong block mb-1 uppercase tracking-wider text-[10px]">Thông tin cần bổ sung để kế hoạch tốt hơn:</span>
                      <p className="text-brand-textSoft mb-3">Đề xuất này sẽ chuẩn xác và an toàn hơn nếu bạn bổ sung câu trả lời cho các câu hỏi dưới đây:</p>
                    </div>
                    
                    <div className="space-y-4">
                      {proposedItinerary.missing_info_questions.map((quest: string, idx: number) => (
                        <div key={idx} className="space-y-1.5">
                          <label className="block font-semibold text-brand-text text-xs">
                            {idx + 1}. {quest}
                          </label>
                          <textarea
                            rows={2}
                            placeholder="Nhập câu trả lời của bạn..."
                            value={questionAnswers[idx] || ''}
                            onChange={(e) => setQuestionAnswers(prev => ({ ...prev, [idx]: e.target.value }))}
                            className="w-full px-3.5 py-2 rounded-xl border border-brand-line bg-white/70 text-brand-text text-xs focus:ring-1 focus:ring-brand-primary focus:border-brand-primary"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                      <span className="text-[9px] text-brand-textMuted font-serif italic max-w-sm leading-relaxed">
                        (* Hệ thống sẽ tự động ghép các câu trả lời này vào mô tả sự cố để AI phân tích lại lịch trình mới tối ưu nhất cho bạn.)
                      </span>
                      <button
                        type="button"
                        onClick={handleResubmitWithAnswers}
                        disabled={previewMutation.isPending}
                        className="px-4 py-2.5 rounded-xl bg-brand-primary text-white text-[11px] font-bold shadow-md hover:bg-brand-primaryStrong transition flex items-center gap-1.5 disabled:opacity-50 self-end"
                      >
                        {previewMutation.isPending ? (
                          <>
                            <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                            Đang gửi lại...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            Gửi lại cho AI phân tích
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <label className="block text-sm font-bold text-brand-textSoft">
                  Chọn các hoạt động thay thế bạn muốn áp dụng:
                </label>
                
                <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2">
                  {proposedItinerary.days.map((day: any) => {
                    let affectedDayNumber = 1;
                    if (disruptionDayId) {
                      const matchedDay = trip?.days.find(d => d.id === disruptionDayId);
                      if (matchedDay) affectedDayNumber = matchedDay.day_number;
                    }
                    if (Number(day.day_number) < affectedDayNumber) return null;

                    return (
                      <div key={day.day_number} className="space-y-2">
                        <h4 className="text-xs font-bold text-brand-primary uppercase tracking-wider">
                          Ngày {day.day_number} ({formatDate(day.date)})
                        </h4>
                        
                        <div className="space-y-2">
                          {day.items.map((item: any, idx: number) => {
                            const tempId = `temp-${day.day_number}-${idx}`;
                            const isChecked = selectedProposedItems.some(i => i.temp_id === tempId);
                            return (
                              <label
                                key={tempId}
                                className={`flex items-start gap-3 p-3.5 rounded-xl border transition cursor-pointer select-none ${
                                  isChecked
                                    ? 'bg-brand-primary/5 border-brand-primary/45'
                                    : 'bg-brand-bgAlt/50 border-brand-line/30 opacity-70'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setSelectedProposedItems(prev => prev.filter(i => i.temp_id !== tempId));
                                    } else {
                                      setSelectedProposedItems(prev => [...prev, { ...item, day_number: day.day_number, temp_id: tempId }]);
                                    }
                                  }}
                                  className="mt-1 w-4 h-4 rounded text-brand-primary focus:ring-brand-primary"
                                />
                                <div className="space-y-1 text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-brand-text">{item.title}</span>
                                    <span className="text-[9px] uppercase bg-brand-primary/10 text-brand-primary px-1.5 py-0.5 rounded font-bold">
                                      {item.item_type}
                                    </span>
                                    {item.start_time && (
                                      <span className="text-[10px] text-brand-textSoft">
                                        ({item.start_time.substring(0, 5)})
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-brand-textSoft font-serif">{item.description}</p>
                                  {hasOfficialCost(item.estimated_cost) ? (
                                    <p className="text-[10px] font-bold text-brand-textMuted">
                                      Chi phí dự tính: {formatEstimatedCost(item.estimated_cost)}
                                    </p>
                                  ) : (
                                    <p className="text-[10px] font-bold text-brand-textMuted">
                                      Chi phí dự tính: {'C\u1ea7n x\u00e1c nh\u1eadn gi\u00e1'}
                                    </p>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-brand-line/35">
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(false)}
                className="px-4 py-2.5 rounded-lg border border-brand-line text-xs font-bold text-brand-textSoft hover:bg-brand-surface transition"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  applyMutation.mutate({
                    disruption_type: disruptionType,
                    description: disruptionDesc,
                    day_id: disruptionDayId || null,
                    selected_items: selectedProposedItems.map(i => ({
                      item_type: i.item_type,
                      title: i.title,
                      description: i.description,
                      start_time: i.start_time,
                      end_time: i.end_time,
                      estimated_cost: i.estimated_cost ?? null,
                      order_index: i.order_index,
                      day_number: i.day_number
                    })),
                    previous_snapshot: previousSnapshot
                  });
                }}
                disabled={applyMutation.isPending}
                className="px-5 py-3 rounded-xl bg-brand-primary hover:bg-brand-primaryStrong text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {applyMutation.isPending ? (
                  <>
                    <Loader2Icon className="w-4 h-4 animate-spin" />
                    Đang áp dụng...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Áp dụng lịch trình đã chọn
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL EDIT MODAL */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 bg-brand-bgDark/60 backdrop-blur-sm flex items-center justify-center p-6 z-50 animate-fadeIn font-label">
          <div className="bg-brand-bg p-8 rounded-3xl max-w-md w-full shadow-2xl border border-brand-line/50 space-y-6">
            <div className="flex justify-between items-center border-b border-brand-line/35 pb-4">
              <h3 className="text-lg font-display font-extrabold text-brand-text flex items-center gap-2">
                <PenLine className="w-5 h-5 text-brand-primary" /> Chỉnh sửa hoạt động
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded bg-brand-line/10 hover:bg-brand-line/25 text-brand-textSoft transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-brand-textSoft mb-1.5">Tên hoạt động</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-brand-textSoft mb-1.5">Mô tả hoạt động</label>
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-brand-textSoft mb-1.5">Giờ bắt đầu</label>
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-brand-textSoft mb-1.5">Giờ kết thúc</label>
                  <input
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-brand-textSoft mb-1.5">Chi phí (VND)</label>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    placeholder={'\u0110\u1ec3 tr\u1ed1ng n\u1ebfu ch\u01b0a c\u00f3 gi\u00e1 ch\u00ednh th\u1ee9c'}
                    className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-brand-textSoft mb-1.5">Trạng thái</label>
                  <select
                    value={editStatus}
                    onChange={(e: any) => setEditStatus(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl border border-brand-line text-sm font-semibold cursor-pointer"
                  >
                    <option value="planned">Đang lên lịch (Planned)</option>
                    <option value="confirmed">Đã xác nhận (Confirmed)</option>
                    <option value="skipped">Bỏ qua (Skipped)</option>
                    <option value="replaced">Đã thay thế (Replaced)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-brand-textSoft mb-1.5">Loại hoạt động</label>
                <select
                  value={editItemType}
                  onChange={(e: any) => setEditItemType(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl border border-brand-line text-sm font-semibold cursor-pointer"
                >
                  <option value="accommodation">Chỗ nghỉ</option>
                  <option value="transport">Di chuyển</option>
                  <option value="dining">Ăn uống</option>
                  <option value="attraction">Tham quan</option>
                  <option value="rental">Thuê xe</option>
                  <option value="experience">Trải nghiệm</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-brand-line/35">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-brand-line text-xs font-bold text-brand-textSoft hover:bg-brand-surface transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={editMutation.isPending}
                  className="px-5 py-3 rounded-xl bg-brand-primary hover:bg-brand-primaryStrong text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {editMutation.isPending ? (
                    <>
                      <Loader2Icon className="w-4 h-4 animate-spin" />
                      Đang lưu...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Lưu thay đổi
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI SINGLE ITEM REPLACE MODAL */}
      {isAiReplaceModalOpen && aiReplaceItem && (
        <div className="fixed inset-0 bg-brand-bgDark/60 backdrop-blur-sm flex items-center justify-center p-6 z-50 animate-fadeIn font-label">
          <div className="bg-brand-bg p-8 rounded-3xl max-w-xl w-full shadow-2xl border border-brand-line/50 space-y-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-brand-line/35 pb-4">
              <div className="space-y-1">
                <h3 className="text-lg font-display font-extrabold text-brand-text flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-brand-accent animate-pulse" /> AI Thay Thế Hoạt Động
                </h3>
                <p className="text-xs text-brand-textSoft">
                  Đề xuất hoạt động thay thế cho: <strong className="text-brand-text">"{aiReplaceItem.title}"</strong>
                </p>
              </div>
              <button
                onClick={() => setIsAiReplaceModalOpen(false)}
                className="p-1 rounded bg-brand-line/10 hover:bg-brand-line/25 text-brand-textSoft transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-brand-textSoft mb-1.5">
                  Bạn có yêu cầu đặc thù nào cho địa điểm thay thế không? (Tùy chọn)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ví dụ: Đổi quán chay, Điểm tham quan trong nhà, Tiết kiệm chi phí..."
                    value={aiReplaceRequirement}
                    onChange={(e) => setAiReplaceRequirement(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      setIsFetchingAlternatives(true);
                      try {
                        const res = await apiClient.post(`/trips/items/${aiReplaceItem.id}/ai-replace`, {
                          user_requirement: aiReplaceRequirement
                        });
                        setAiAlternatives(res.data.alternatives || []);
                      } catch (err: any) {
                        alert('Lỗi lấy gợi ý từ AI: ' + (err.response?.data?.error || err.message));
                      } finally {
                        setIsFetchingAlternatives(false);
                      }
                    }}
                    disabled={isFetchingAlternatives}
                    className="px-5 py-3 rounded-xl bg-brand-accent hover:bg-brand-accentStrong text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isFetchingAlternatives ? (
                      <>
                        <Loader2Icon className="w-4 h-4 animate-spin" />
                        Đang quét...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Gợi ý
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Alternatives List */}
              {isFetchingAlternatives ? (
                <div className="py-12 text-center space-y-3">
                  <div className="w-8 h-8 rounded-full border-2 border-brand-accent/20 border-t-brand-accent animate-spin mx-auto" />
                  <p className="text-xs text-brand-textSoft font-semibold">Gemini đang đề xuất các lựa chọn tốt nhất...</p>
                </div>
              ) : aiAlternatives.length > 0 ? (
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-brand-textSoft">
                    Chọn 1 trong 3 đề xuất dưới đây từ AI:
                  </label>
                  <div className="space-y-3">
                    {aiAlternatives.map((alt, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-2xl border border-brand-line/50 bg-brand-bgAlt hover:border-brand-accent/50 transition duration-200 space-y-2.5 flex flex-col justify-between"
                      >
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between items-start gap-2">
                            <h4 className="font-extrabold text-sm text-brand-text flex items-center gap-1.5">
                              {alt.title}
                            </h4>
                            <span className="text-[9px] font-bold uppercase bg-brand-accent/10 text-brand-accent px-1.5 py-0.5 rounded">
                              {alt.item_type}
                            </span>
                          </div>
                          
                          <p className="text-brand-textSoft font-serif leading-relaxed">{alt.description}</p>
                          
                          <div className="flex gap-4 text-[10px] font-semibold text-brand-textMuted">
                            <span>⏱️ {alt.start_time.substring(0,5)} - {alt.end_time.substring(0,5)}</span>
                            <span>💰 {formatEstimatedCost(alt.estimated_cost)}</span>
                          </div>

                          <div className="p-2.5 rounded-lg bg-brand-accent/5 border border-brand-accent/20 text-[10px] text-brand-accentStrong font-semibold mt-2">
                            💡 Lý do gợi ý: {alt.reason}
                          </div>
                        </div>

                        <div className="pt-2.5 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              aiReplaceMutation.mutate({
                                itemId: aiReplaceItem.id,
                                payload: {
                                  title: alt.title,
                                  description: alt.description,
                                  start_time: alt.start_time,
                                  end_time: alt.end_time,
                                  estimated_cost: alt.estimated_cost ?? null,
                                  item_type: alt.item_type,
                                  status: 'planned'
                                }
                              });
                            }}
                            disabled={aiReplaceMutation.isPending}
                            className="px-4 py-2 rounded-xl bg-brand-primary hover:bg-brand-primaryStrong text-white text-xs font-bold transition flex items-center gap-1"
                          >
                            {aiReplaceMutation.isPending ? 'Đang áp dụng...' : 'Áp dụng đề xuất này'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center border border-dashed border-brand-line rounded-2xl bg-brand-bgAlt/50">
                  <p className="text-xs text-brand-textSoft font-semibold">Bấm nút "Gợi ý" để AI đề xuất các hoạt động thay thế</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-brand-line/35">
              <button
                type="button"
                onClick={() => setIsAiReplaceModalOpen(false)}
                className="px-4 py-2.5 rounded-lg border border-brand-line text-xs font-bold text-brand-textSoft hover:bg-brand-surface transition"
              >
                Hủy bỏ
              </button>
            </div>
          </div>
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

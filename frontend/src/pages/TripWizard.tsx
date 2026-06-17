import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, Sparkles, ArrowLeft, ArrowRight, Loader2, Calendar, MapPin, DollarSign, Heart, AlertTriangle } from 'lucide-react';
import { apiClient } from '../lib/apiClient';
import Reveal from '../components/Reveal';

const VIETNAMESE_CITIES = [
  'Hà Nội',
  'Đà Nẵng',
  'TP. Hồ Chí Minh',
  'Hội An',
  'Huế',
  'Nha Trang',
  'Đà Lạt',
  'Phú Quốc',
  'Sa Pa',
  'Ninh Bình',
  'Vũng Tàu'
];

const TRAVELER_TYPES = [
  { value: 'solo', label: 'Đi một mình (Solo)' },
  { value: 'couple', label: 'Cặp đôi (Couple)' },
  { value: 'family', label: 'Gia đình (Family)' },
  { value: 'friends', label: 'Nhóm bạn (Friends)' },
  { value: 'other', label: 'Khác' }
];

const PREFERENCE_OPTIONS = [
  { id: 'history', label: 'Lịch sử & Văn hóa' },
  { id: 'nature', label: 'Thiên nhiên & Sinh thái' },
  { id: 'food', label: 'Ẩm thực & Đặc sản' },
  { id: 'relax', label: 'Nghỉ dưỡng & Chill' },
  { id: 'adventure', label: 'Khám phá mạo hiểm' },
  { id: 'shopping', label: 'Mua sắm & Giải trí' }
];

export function TripWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);

  // Form State
  const [title, setTitle] = useState('');
  const [destinationCity, setDestinationCity] = useState(VIETNAMESE_CITIES[0]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [travelerCount, setTravelerCount] = useState(1);
  const [travelerType, setTravelerType] = useState('solo');
  const [budgetTotal, setBudgetTotal] = useState(5000000); // 5 Million VND default
  const [selectedPrefs, setSelectedPrefs] = useState<string[]>([]);
  const [healthConditions, setHealthConditions] = useState('');
  const [specialRequirements, setSpecialRequirements] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handlePrefToggle = (id: string) => {
    setSelectedPrefs(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleTravelerTypeChange = (value: string) => {
    setTravelerType(value);
    if (value === 'solo') {
      setTravelerCount(1);
    } else if (value === 'couple') {
      setTravelerCount(2);
    } else {
      if (travelerCount <= 2) {
        setTravelerCount(4);
      }
    }
  };

  const handleNext = () => {
    if (step === 1) {
      if (!startDate || !endDate) {
        setErrorMsg('Vui lòng chọn ngày đi và ngày về');
        return;
      }
      if (new Date(startDate) > new Date(endDate)) {
        setErrorMsg('Ngày về phải sau ngày đi');
        return;
      }
    }
    setErrorMsg('');
    setStep(prev => prev + 1);
  };

  const handlePrev = () => {
    setErrorMsg('');
    setStep(prev => prev - 1);
  };

  const triggerLoadingAnimation = () => {
    setLoading(true);
    const stages = [
      'Đang tra cứu dự báo thời tiết tại điểm đến...',
      'Đang quét địa điểm lưu trú & ăn uống thực tế (Google Places)...',
      'Đang cá nhân hóa lịch trình tối ưu bằng Gemini AI...',
      'Đang cấu hình các phương án dự phòng sự cố...',
      'Đang khởi tạo cơ sở dữ liệu chuyến đi của bạn...'
    ];

    let currentStage = 0;
    setLoadingStage(0);

    const interval = setInterval(() => {
      currentStage += 1;
      if (currentStage < stages.length) {
        setLoadingStage(currentStage);
      } else {
        clearInterval(interval);
      }
    }, 1800);

    return () => clearInterval(interval);
  };

  const handleSubmit = async () => {
    triggerLoadingAnimation();

    const formattedPrefs = PREFERENCE_OPTIONS.reduce((acc, pref) => {
      acc[pref.id] = selectedPrefs.includes(pref.id);
      return acc;
    }, {} as Record<string, boolean>);

    const payload = {
      title: title || `Du hí ${destinationCity}`,
      destination_city: destinationCity,
      start_date: startDate,
      end_date: endDate,
      budget_total: budgetTotal,
      traveler_count: travelerCount,
      traveler_type: travelerType,
      preferences: formattedPrefs,
      health_conditions: healthConditions,
      special_requirements: specialRequirements
    };

    try {
      const res = await apiClient.post('/trips', payload);
      const trip = res.data;
      navigate(`/chuyen-di/${trip.id}`);
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.response?.data?.error || 'Có lỗi xảy ra khi tạo chuyến đi');
      setStep(4); // Return to summary step to show error
    }
  };

  const loadingStagesText = [
    'Đang tra cứu dự báo thời tiết tại điểm đến...',
    'Đang quét địa điểm lưu trú & ăn uống thực tế (Google Places)...',
    'Đang cá nhân hóa lịch trình tối ưu bằng Gemini AI...',
    'Đang cấu hình các phương án dự phòng sự cố...',
    'Đang khởi tạo cơ sở dữ liệu chuyến đi của bạn...'
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bgDark text-brand-bgAlt flex flex-col justify-center items-center relative overflow-hidden font-label">
        <div className="noise-overlay" aria-hidden="true" />
        
        <div className="max-w-md w-full px-6 text-center space-y-8 z-10">
          <div className="relative flex justify-center">
            <div className="w-24 h-24 rounded-full border-2 border-brand-primary/20 flex items-center justify-center relative">
              <Compass className="w-12 h-12 text-brand-primary animate-spin" style={{ animationDuration: '3s' }} />
              <div className="absolute inset-0 rounded-full border-t-2 border-brand-accent animate-spin" style={{ animationDuration: '1.2s' }} />
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-display font-extrabold tracking-tight">ViVu AI Planner</h2>
            <p className="text-sm text-brand-textSoft italic font-serif">"Lập trình trải nghiệm du lịch thông minh"</p>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-brand-primary/10 rounded-full h-2 overflow-hidden border border-brand-line/10">
            <div 
              className="bg-brand-primary h-full transition-all duration-500 ease-out"
              style={{ width: `${((loadingStage + 1) / loadingStagesText.length) * 100}%` }}
            />
          </div>

          <div className="h-12 flex items-center justify-center">
            <span className="text-sm font-semibold text-brand-primary animate-pulse">
              {loadingStagesText[loadingStage]}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg font-label py-12 px-6 flex flex-col justify-center relative">
      <div className="max-w-xl mx-auto w-full z-10">
        
        {/* Navigation Indicator */}
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={() => navigate('/chuyen-di')}
            className="flex items-center gap-1 text-xs font-bold text-brand-textSoft hover:text-brand-primary transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Quay lại bảng điều khiển
          </button>
          
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map(idx => (
              <div
                key={idx}
                className={`w-8 h-1.5 rounded-full transition-all duration-300 ${
                  step >= idx ? 'bg-brand-primary' : 'bg-brand-line/30'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Form Container */}
        <div className="glass-panel p-8 sm:p-10 rounded-3xl shadow-xl border border-white/40">
          
          {errorMsg && (
            <div className="mb-6 p-4 rounded-xl bg-brand-danger/10 border border-brand-danger/30 text-brand-danger text-sm flex gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: Destination & Dates */}
          {step === 1 && (
            <Reveal className="space-y-6">
              <h2 className="text-2xl font-display font-extrabold text-brand-text">Bạn muốn đi du lịch ở đâu?</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-brand-textSoft mb-1.5">Điểm đến (Chỉ Việt Nam)</label>
                  <div className="relative">
                    <select
                      value={destinationCity}
                      onChange={(e) => setDestinationCity(e.target.value)}
                      className="w-full px-4 py-3.5 rounded-xl border border-brand-line text-sm appearance-none font-semibold cursor-pointer"
                    >
                      {VIETNAMESE_CITIES.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                    <MapPin className="absolute right-4 top-4 w-4 h-4 text-brand-primary pointer-events-none" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-brand-textSoft mb-1.5">Ngày đi</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-brand-textSoft mb-1.5">Ngày về</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-brand-textSoft mb-1.5">Tên chuyến đi (Tùy chọn)</label>
                  <input
                    type="text"
                    placeholder={`Hành trình khám phá ${destinationCity}`}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm"
                  />
                </div>
              </div>
            </Reveal>
          )}

          {/* STEP 2: Travelers & Budget */}
          {step === 2 && (
            <Reveal className="space-y-6">
              <h2 className="text-2xl font-display font-extrabold text-brand-text">Đoàn đi và Ngân sách</h2>
              
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {travelerType !== 'solo' && travelerType !== 'couple' ? (
                    <div>
                      <label className="block text-sm font-bold text-brand-textSoft mb-1.5">Số lượng khách (Tối thiểu 3)</label>
                      <input
                        type="number"
                        min="3"
                        max="50"
                        value={travelerCount}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 3;
                          setTravelerCount(val < 3 ? 3 : val);
                        }}
                        className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold"
                      />
                    </div>
                  ) : null}
                  <div className={travelerType === 'solo' || travelerType === 'couple' ? "col-span-2" : ""}>
                    <label className="block text-sm font-bold text-brand-textSoft mb-1.5">Loại thành viên</label>
                    <select
                      value={travelerType}
                      onChange={(e) => handleTravelerTypeChange(e.target.value)}
                      className="w-full px-4 py-3.5 rounded-xl border border-brand-line text-sm font-semibold cursor-pointer"
                    >
                      {TRAVELER_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    {travelerType === 'solo' && (
                      <span className="text-[11px] font-semibold text-brand-primary mt-1.5 block">
                        ℹ️ Hệ thống đã tự động thiết lập số lượng khách là 1 người (Solo).
                      </span>
                    )}
                    {travelerType === 'couple' && (
                      <span className="text-[11px] font-semibold text-brand-primary mt-1.5 block">
                        ℹ️ Hệ thống đã tự động thiết lập số lượng khách là 2 người (Couple).
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-brand-textSoft mb-1.5 flex justify-between">
                    <span>Tổng ngân sách (VND)</span>
                    <span className="text-xs font-semibold text-brand-primary">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(budgetTotal)}
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="500000"
                      step="500000"
                      value={budgetTotal}
                      onChange={(e) => setBudgetTotal(parseInt(e.target.value) || 0)}
                      className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold pr-12"
                    />
                    <DollarSign className="absolute right-4 top-3.5 w-4 h-4 text-brand-primary pointer-events-none" />
                  </div>
                  <p className="text-[10px] text-brand-textMuted mt-1">Gợi ý: Lịch trình tối thiểu khoảng 1,500,000đ/ngày để có trải nghiệm tốt.</p>
                </div>
              </div>
            </Reveal>
          )}

          {/* STEP 3: Preferences */}
          {step === 3 && (
            <Reveal className="space-y-6">
              <h2 className="text-2xl font-display font-extrabold text-brand-text">Bạn mong muốn trải nghiệm điều gì?</h2>
              
              <div className="space-y-4">
                <label className="block text-sm font-bold text-brand-textSoft">Chọn các sở thích (Chọn nhiều)</label>
                <div className="grid grid-cols-2 gap-3">
                  {PREFERENCE_OPTIONS.map(pref => {
                    const isSelected = selectedPrefs.includes(pref.id);
                    return (
                      <button
                        key={pref.id}
                        type="button"
                        onClick={() => handlePrefToggle(pref.id)}
                        className={`p-4 rounded-xl border text-left text-sm font-semibold transition-all ${
                          isSelected
                            ? 'bg-brand-primary text-white border-brand-primary'
                            : 'bg-brand-bg border-brand-line/50 text-brand-textSoft hover:bg-brand-surface'
                        }`}
                      >
                        {pref.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Reveal>
          )}

          {/* STEP 4: Health Conditions & Confirmation */}
          {step === 4 && (
            <Reveal className="space-y-6">
              <h2 className="text-2xl font-display font-extrabold text-brand-text">Yêu cầu đặc biệt & Xác nhận</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-brand-textSoft mb-1.5 flex items-center gap-1.5">
                    <Heart className="w-4 h-4 text-brand-primary" /> Tình trạng sức khỏe (Nếu có)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ví dụ: Người lớn tuổi không đi bộ leo dốc nhiều, bị say xe nhẹ..."
                    value={healthConditions}
                    onChange={(e) => setHealthConditions(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-brand-textSoft mb-1.5">Lưu ý / Ràng buộc ăn uống, đi lại</label>
                  <textarea
                    rows={2}
                    placeholder="Ví dụ: Ăn chay trường, thích đi các quán ăn vỉa hè bản địa..."
                    value={specialRequirements}
                    onChange={(e) => setSpecialRequirements(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm"
                  />
                </div>

                {/* Final Summary card */}
                <div className="p-4 rounded-xl bg-brand-bgAlt border border-brand-line/50 text-xs space-y-2.5">
                  <h3 className="font-bold text-brand-text text-sm border-b border-brand-line/30 pb-2">Tóm tắt hành trình</h3>
                  <div className="grid grid-cols-2 gap-2 text-brand-textSoft">
                    <div>Điểm đến: <strong>{destinationCity}</strong></div>
                    <div>Thành viên: <strong>{travelerCount} khách ({travelerType})</strong></div>
                    <div>Bắt đầu: <strong>{startDate}</strong></div>
                    <div>Kết thúc: <strong>{endDate}</strong></div>
                    <div className="col-span-2">Ngân sách: <strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(budgetTotal)}</strong></div>
                  </div>
                </div>
              </div>
            </Reveal>
          )}

          {/* Control Buttons */}
          <div className="flex justify-between items-center mt-8 pt-5 border-t border-brand-line/35">
            {step > 1 ? (
              <button
                type="button"
                onClick={handlePrev}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-brand-line text-xs font-bold text-brand-textSoft hover:bg-brand-surface transition"
              >
                Quay lại
              </button>
            ) : (
              <div />
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-1.5 px-5 py-3 rounded-xl bg-brand-primary hover:bg-brand-primaryStrong text-white text-sm font-bold transition shadow-sm"
              >
                Tiếp tục
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-brand-accent hover:bg-brand-accentStrong text-white text-sm font-bold transition shadow-lg hover:shadow-brand-accent/25"
              >
                <Sparkles className="w-4 h-4" />
                Tạo lịch trình AI
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
export default TripWizard;

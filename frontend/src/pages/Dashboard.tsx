import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Compass, Plus, LogOut, Calendar, MapPin, DollarSign, Wallet, RefreshCw, User, GitFork, Shield } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { apiClient } from '../lib/apiClient';
import Reveal from '../components/Reveal';

interface Trip {
  id: string;
  title: string;
  destination_city: string;
  start_date: string;
  end_date: string;
  budget_total: number;
  budget_currency: string;
  traveler_count: number;
  traveler_type: string;
  status: string;
}

export function Dashboard() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult('');
    try {
      const res = await apiClient.post('/dev/sync-repositories');
      alert(res.data.message);
      setSyncResult(res.data.message);
    } catch (err: any) {
      const errorMsg = err.response?.data?.details || err.response?.data?.error || err.message;
      alert('Lỗi đồng bộ: ' + errorMsg);
      setSyncResult('Lỗi: ' + errorMsg);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }: any) => {
      if (!user) {
        navigate('/dang-nhap');
      } else {
        setUserEmail(user.email || '');
      }
    });
  }, [navigate]);

  const { data: trips, isLoading, isError, refetch } = useQuery<Trip[]>({
    queryKey: ['trips'],
    queryFn: async () => {
      const res = await apiClient.get('/trips');
      return res.data;
    }
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('vivu_admin_token');
    localStorage.removeItem('vivu_mock_user');
    localStorage.removeItem('vivu_mock_token');
    navigate('/dang-nhap');
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    if (dateStr.includes('T')) {
      const date = new Date(dateStr);
      const formatter = new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Asia/Ho_Chi_Minh'
      });
      return formatter.format(date);
    } else {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    const date = new Date(dateStr);
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  return (
    <div className="min-h-screen bg-brand-bg font-label">
      {/* Top Navbar */}
      <nav className="glass-panel border-b border-brand-line/40 sticky top-0 z-30 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2">
            <Compass className="w-7 h-7 text-brand-primary" />
            <span className="font-display font-bold text-xl text-brand-primary">ViVu Planner</span>
          </Link>

          <div className="flex items-center gap-4">
            {localStorage.getItem('vivu_admin_token') && (
              <Link
                to="/admin"
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg text-brand-accent bg-brand-accent/10 hover:bg-brand-accent/25 transition"
              >
                <Shield className="w-3.5 h-3.5" />
                Quản trị
              </Link>
            )}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-surface border border-brand-line/30 text-brand-textSoft text-xs font-semibold">
              <User className="w-3.5 h-3.5" />
              {userEmail}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg text-brand-danger bg-brand-danger/10 hover:bg-brand-danger/25 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              Đăng xuất
            </button>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-10">
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-extrabold text-brand-text">Hành Trình Của Bạn</h1>
            <p className="text-sm text-brand-textSoft mt-1">Quản lý và tạo lịch trình du lịch cá nhân hóa bằng AI</p>
          </div>

          <div className="flex gap-3">
            {isLocalhost && (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-brand-primary hover:bg-brand-primaryStrong text-white font-bold transition shadow-md disabled:opacity-50 text-sm"
              >
                {syncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Đang đồng bộ...
                  </>
                ) : (
                  <>
                    <GitFork className="w-4 h-4" />
                    Đồng bộ Git (TK1 ➔ TK2)
                  </>
                )}
              </button>
            )}
            <Link
              to="/chuyen-di/moi"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-brand-accent hover:bg-brand-accentStrong text-white font-bold transition shadow-md hover:shadow-brand-accent/20 text-sm"
            >
              <Plus className="w-4 h-4" />
              Tạo chuyến đi mới
            </Link>
          </div>
        </header>

        {/* Dashboard grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse bg-brand-bgAlt border border-brand-line/40 rounded-2xl h-56" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 rounded-2xl border border-brand-danger/30 bg-brand-danger/5 text-center space-y-4">
            <p className="text-brand-danger font-semibold">Lỗi tải danh sách chuyến đi</p>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-1.5 text-xs bg-brand-primary text-white font-bold px-4 py-2 rounded-lg"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Thử lại
            </button>
          </div>
        ) : trips && trips.length === 0 ? (
          <Reveal>
            <div className="text-center py-16 border border-dashed border-brand-line rounded-2xl bg-brand-bgAlt/50 max-w-xl mx-auto space-y-5">
              <div className="w-16 h-16 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary mx-auto">
                <Compass className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-brand-text">Bạn chưa tạo chuyến đi nào</h3>
                <p className="text-xs text-brand-textSoft mt-1">Hãy để ViVu Planner thiết kế lịch trình du lịch đầu tiên của bạn!</p>
              </div>
              <Link
                to="/chuyen-di/moi"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-brand-primary hover:bg-brand-primaryStrong text-white font-bold transition"
              >
                <Plus className="w-4 h-4" />
                Lên lịch trình ngay
              </Link>
            </div>
          </Reveal>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {trips && trips.map((trip, idx) => (
              <Reveal key={trip.id} delay={idx * 50}>
                <Link
                  to={`/chuyen-di/${trip.id}`}
                  className="block bg-brand-bgAlt hover:bg-brand-surfaceStrong/20 border border-brand-line/50 rounded-2xl p-6 shadow-sm hover:shadow transition-all group duration-250 relative overflow-hidden"
                >
                  <div className="flex flex-col h-full justify-between space-y-6">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-primary/10 text-brand-primary font-bold text-[10px] uppercase tracking-wider">
                          <MapPin className="w-3 h-3" /> {trip.destination_city}
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${
                          trip.status === 'completed' 
                            ? 'bg-brand-surfaceStrong text-brand-textSoft'
                            : 'bg-brand-gold/25 text-brand-primaryStrong'
                        }`}>
                          {trip.status === 'completed' ? 'Hoàn thành' : 'Đang lập kế hoạch'}
                        </span>
                      </div>
                      
                      <h3 className="text-xl font-bold text-brand-text group-hover:text-brand-primary transition">
                        {trip.title}
                      </h3>
                    </div>

                    <div className="space-y-2.5 text-xs text-brand-textSoft pt-3 border-t border-brand-line/40">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-brand-primary" />
                        <span>{formatDate(trip.start_date)} — {formatDate(trip.end_date)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-brand-primary" />
                        <span>Ngân sách: <strong className="text-brand-text">{formatCurrency(trip.budget_total)}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-brand-primary" />
                        <span>Đoàn: <strong className="text-brand-text">{trip.traveler_count} khách</strong> ({trip.traveler_type})</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
export default Dashboard;

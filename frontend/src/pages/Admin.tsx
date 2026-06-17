import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Compass, Users, Map, Trash2, ArrowLeft, Shield, BarChart3, AlertTriangle, RefreshCw, Calendar, MapPin, Wallet, Mail } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { apiClient } from '../lib/apiClient';
import Reveal from '../components/Reveal';

interface AdminStats {
  totalUsers: number;
  totalTrips: number;
  totalDisruptions: number;
  totalPlacesCached: number;
}

interface UserRecord {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
}

interface TripRecord {
  id: string;
  title: string;
  destination_city: string;
  start_date: string;
  end_date: string;
  budget_total: number;
  status: string;
  user_email: string;
  created_at: string;
}

const ADMIN_EMAILS = ['team89a6@gmail.com', 'vinhvip4508@gmail.com', 'mockuser@vivu.vn'];

export function Admin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'trips'>('users');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }: any) => {
      if (!user) {
        navigate('/dang-nhap');
        return;
      }

      const email = user.email || '';
      if (!ADMIN_EMAILS.includes(email)) {
        alert('Bạn không có quyền truy cập trang quản trị!');
        navigate('/chuyen-di');
      } else {
        setIsAdmin(true);
      }
      setCheckingAdmin(false);
    });
  }, [navigate]);

  // Fetch admin stats
  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ['adminStats'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/stats');
      return res.data;
    },
    enabled: isAdmin
  });

  // Fetch all users
  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = useQuery<UserRecord[]>({
    queryKey: ['adminUsers'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/users');
      return res.data;
    },
    enabled: isAdmin
  });

  // Fetch all trips
  const { data: trips, isLoading: tripsLoading, refetch: refetchTrips } = useQuery<TripRecord[]>({
    queryKey: ['adminTrips'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/trips');
      return res.data;
    },
    enabled: isAdmin
  });

  // Delete User Mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.delete(`/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      alert('Đã xóa người dùng thành công!');
    },
    onError: (err: any) => {
      alert('Lỗi khi xóa người dùng: ' + (err.response?.data?.error || err.message));
    }
  });

  // Delete Trip Mutation
  const deleteTripMutation = useMutation({
    mutationFn: async (tripId: string) => {
      await apiClient.delete(`/admin/trips/${tripId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTrips'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      alert('Đã xóa chuyến đi thành công!');
    },
    onError: (err: any) => {
      alert('Lỗi khi xóa chuyến đi: ' + (err.response?.data?.error || err.message));
    }
  });

  const handleDeleteUser = (id: string, email: string) => {
    if (confirm(`Bạn có chắc chắn muốn xóa tài khoản ${email}? Hành động này sẽ xóa toàn bộ các chuyến đi liên quan!`)) {
      deleteUserMutation.mutate(id);
    }
  };

  const handleDeleteTrip = (id: string, title: string) => {
    if (confirm(`Bạn có chắc chắn muốn xóa chuyến đi "${title}"?`)) {
      deleteTripMutation.mutate(id);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  if (checkingAdmin || !isAdmin) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-brand-primary animate-spin" />
          <p className="text-sm font-semibold text-brand-textSoft">Đang kiểm tra quyền quản trị viên...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg font-label text-brand-text">
      {/* Top Navbar */}
      <nav className="glass-panel border-b border-brand-line/40 sticky top-0 z-30 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link to="/chuyen-di" className="flex items-center gap-2">
            <Compass className="w-7 h-7 text-brand-primary" />
            <span className="font-display font-bold text-xl text-brand-primary">ViVu Planner</span>
          </Link>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-accent/10 border border-brand-accent/30 text-brand-accent text-xs font-bold uppercase tracking-wider">
            <Shield className="w-3.5 h-3.5" />
            Trang Quản Trị
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <header className="flex justify-between items-center">
          <div className="space-y-1">
            <h1 className="text-3xl font-display font-extrabold flex items-center gap-2.5">
              <Shield className="w-8 h-8 text-brand-primary" />
              Quản Trị Hệ Thống
            </h1>
            <p className="text-sm text-brand-textSoft">Giám sát người dùng, chuyến đi và dữ liệu AI</p>
          </div>
          <Link
            to="/chuyen-di"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-brand-line hover:bg-brand-surfaceStrong/10 font-bold transition text-xs"
          >
            <ArrowLeft className="w-4 h-4" /> Quay lại bảng điều khiển
          </Link>
        </header>

        {/* Stats Grid */}
        <Reveal>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="glass-panel p-5 rounded-2xl border border-brand-line/40 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-brand-textSoft font-semibold uppercase tracking-wider">Người dùng</p>
                <h3 className="text-2xl font-bold font-display mt-0.5">
                  {statsLoading ? '...' : stats?.totalUsers}
                </h3>
              </div>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-brand-line/40 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-brand-accent/10 flex items-center justify-center text-brand-accent shrink-0">
                <Map className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-brand-textSoft font-semibold uppercase tracking-wider">Chuyến đi</p>
                <h3 className="text-2xl font-bold font-display mt-0.5">
                  {statsLoading ? '...' : stats?.totalTrips}
                </h3>
              </div>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-brand-line/40 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-brand-danger/10 flex items-center justify-center text-brand-danger shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-brand-textSoft font-semibold uppercase tracking-wider">Sự cố AI</p>
                <h3 className="text-2xl font-bold font-display mt-0.5">
                  {statsLoading ? '...' : stats?.totalDisruptions}
                </h3>
              </div>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-brand-line/40 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-brand-gold/10 flex items-center justify-center text-brand-gold shrink-0">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-brand-textSoft font-semibold uppercase tracking-wider">Địa điểm lưu</p>
                <h3 className="text-2xl font-bold font-display mt-0.5">
                  {statsLoading ? '...' : stats?.totalPlacesCached}
                </h3>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Tab Controls */}
        <div className="flex border-b border-brand-line/40">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-5 py-3 font-bold text-sm border-b-2 transition ${
              activeTab === 'users'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-brand-textSoft hover:text-brand-text'
            }`}
          >
            Quản lý Người dùng
          </button>
          <button
            onClick={() => setActiveTab('trips')}
            className={`px-5 py-3 font-bold text-sm border-b-2 transition ${
              activeTab === 'trips'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-brand-textSoft hover:text-brand-text'
            }`}
          >
            Quản lý Chuyến đi
          </button>
        </div>

        {/* Main Content Area */}
        <div className="glass-panel border border-brand-line/40 rounded-3xl overflow-hidden bg-white/40">
          {activeTab === 'users' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-brand-surfaceStrong/5 border-b border-brand-line/40 text-xs font-bold text-brand-textSoft uppercase">
                    <th className="p-4 pl-6">Họ tên / Email</th>
                    <th className="p-4">Ngày đăng ký</th>
                    <th className="p-4">User ID</th>
                    <th className="p-4 pr-6 text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-line/20 text-sm">
                  {usersLoading ? (
                    <tr>
                      <td colSpan={4} className="p-10 text-center text-brand-textSoft">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-primary" />
                        Đang tải danh sách thành viên...
                      </td>
                    </tr>
                  ) : users && users.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-10 text-center text-brand-textSoft">
                        Chưa có người dùng nào.
                      </td>
                    </tr>
                  ) : (
                    users?.map(u => (
                      <tr key={u.id} className="hover:bg-brand-surfaceStrong/5 transition">
                        <td className="p-4 pl-6">
                          <div>
                            <p className="font-bold text-brand-text">{u.full_name || 'Khách Vô Danh'}</p>
                            <p className="text-xs text-brand-textSoft flex items-center gap-1 mt-0.5">
                              <Mail className="w-3.5 h-3.5" />
                              {u.email}
                            </p>
                          </div>
                        </td>
                        <td className="p-4 text-brand-textSoft">{formatDate(u.created_at)}</td>
                        <td className="p-4 font-mono text-xs text-brand-textSoft">{u.id}</td>
                        <td className="p-4 pr-6 text-right">
                          <button
                            onClick={() => handleDeleteUser(u.id, u.email)}
                            disabled={u.email === 'mockuser@vivu.vn' || ADMIN_EMAILS.includes(u.email) && u.email !== 'mockuser@vivu.vn'}
                            className="p-2 rounded-lg text-brand-danger bg-brand-danger/10 hover:bg-brand-danger/25 transition disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Xóa người dùng"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-brand-surfaceStrong/5 border-b border-brand-line/40 text-xs font-bold text-brand-textSoft uppercase">
                    <th className="p-4 pl-6">Chuyến đi</th>
                    <th className="p-4">Chủ sở hữu</th>
                    <th className="p-4">Ngân sách</th>
                    <th className="p-4">Trạng thái</th>
                    <th className="p-4 pr-6 text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-line/20 text-sm">
                  {tripsLoading ? (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-brand-textSoft">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-primary" />
                        Đang tải danh sách chuyến đi...
                      </td>
                    </tr>
                  ) : trips && trips.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-brand-textSoft">
                        Chưa có chuyến đi nào được tạo.
                      </td>
                    </tr>
                  ) : (
                    trips?.map(t => (
                      <tr key={t.id} className="hover:bg-brand-surfaceStrong/5 transition">
                        <td className="p-4 pl-6">
                          <div>
                            <p className="font-bold text-brand-text">{t.title}</p>
                            <div className="flex items-center gap-3 text-xs text-brand-textSoft mt-1">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-brand-primary" />
                                {t.destination_city}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-brand-primary" />
                                {formatDate(t.start_date)} - {formatDate(t.end_date)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-brand-textSoft">
                          <span className="font-semibold">{t.user_email}</span>
                        </td>
                        <td className="p-4 text-brand-text font-semibold flex items-center gap-1 mt-1.5 border-none">
                          <Wallet className="w-3.5 h-3.5 text-brand-primary" />
                          {formatCurrency(t.budget_total)}
                        </td>
                        <td className="p-4">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${
                            t.status === 'completed' 
                              ? 'bg-brand-surfaceStrong text-brand-textSoft'
                              : t.status === 'active'
                              ? 'bg-brand-primary/10 text-brand-primary'
                              : 'bg-brand-gold/25 text-brand-primaryStrong'
                          }`}>
                            {t.status === 'completed' ? 'Hoàn thành' : t.status === 'active' ? 'Hoạt động' : 'Bản nháp'}
                          </span>
                        </td>
                        <td className="p-4 pr-6 text-right">
                          <button
                            onClick={() => handleDeleteTrip(t.id, t.title)}
                            className="p-2 rounded-lg text-brand-danger bg-brand-danger/10 hover:bg-brand-danger/25 transition"
                            title="Xóa chuyến đi"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Admin;

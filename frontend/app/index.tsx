import { Redirect } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import BrandSplash from '../components/loading/BrandSplash';

export default function Index() {
  const { session, isAdmin, loading } = useAuth();

  if (loading) {
    return <BrandSplash />;
  }

  if (!session) return <Redirect href="/landing" />;
  if (isAdmin)  return <Redirect href="/admin" />;
  return <Redirect href="/chuyen-di" />;
}

'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { 
  User, 
  Bell, 
  Shield, 
  HelpCircle, 
  LogOut, 
  ChevronRight,
  Camera,
  Mail,
  Phone,
  Calendar,
  Activity,
  Target,
  Heart,
  Moon,
  Globe,
  Lock,
  CreditCard,
  FileText,
  MessageCircle,
  Home,
  TrendingUp,
  Plus
} from 'lucide-react';
import Link from 'next/link';

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatar?: string;
  dateOfBirth?: string;
  gender?: string;
  height?: number;
  weight?: number;
}

export default function MobileSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth/signin');
      return;
    }
  }, [session, status, router]);

  useEffect(() => {
    if (session) {
      fetchProfile();
    }
  }, [session]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/users/profile');
      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (confirm('Are you sure you want to logout?')) {
      // Clear local storage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user-preferences');
        localStorage.removeItem('dtps-theme');
        sessionStorage.clear();
      }
      const fullSigninUrl = `${window.location.origin}/client-auth/signin`;
      await signOut({ callbackUrl: fullSigninUrl, redirect: true });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner className="h-12 w-12 text-emerald-500" />
      </div>
    );
  }

  const firstName = profile?.firstName || session?.user?.name?.split(' ')[0] || 'User';
  const lastName = profile?.lastName || session?.user?.name?.split(' ')[1] || '';
  const email = profile?.email || session?.user?.email || '';

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-linear-to-r from-emerald-500 rounded-xl to-teal-600 text-white px-4 pt-safe-top pb-8">
        <h1 className="text-2xl font-bold py-4">Settings</h1>
        
        {/* Profile Card */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-2xl overflow-hidden">
                {profile?.avatar ? (
                  <img src={profile.avatar} alt={firstName} className="h-full w-full object-cover" />
                ) : (
                  <User className="h-10 w-10" />
                )}
              </div>
              <button className="absolute bottom-0 right-0 h-7 w-7 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                <Camera className="h-4 w-4 text-white" />
              </button>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold">{firstName} {lastName}</h2>
              <p className="text-sm text-white/80">{email}</p>
            </div>
            <Link href="/profile" className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <ChevronRight className="h-6 w-6" />
            </Link>
          </div>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="px-4 py-6 space-y-6">
        {/* Account Settings */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Account</h3>
          </div>
          <div className="divide-y divide-gray-100">
            <Link href="/profile" className="flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <User className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">Personal Information</p>
                <p className="text-sm text-gray-500">Update your profile details</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </Link>

            <Link href="/profile" className="flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors">
              <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                <Target className="h-5 w-5 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">Health Goals</p>
                <p className="text-sm text-gray-500">Manage your fitness goals</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </Link>

            <Link href="/profile" className="flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors">
              <div className="h-10 w-10 rounded-full bg-pink-100 flex items-center justify-center">
                <Heart className="h-5 w-5 text-pink-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">Health Information</p>
                <p className="text-sm text-gray-500">Medical conditions & allergies</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </Link>
          </div>
        </div>

        {/* Preferences */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Preferences</h3>
          </div>
          <div className="divide-y divide-gray-100">
            <button className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors">
              <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                <Bell className="h-5 w-5 text-yellow-600" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-gray-900">Notifications</p>
                <p className="text-sm text-gray-500">Manage push notifications</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>

            <button className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors">
              <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <Globe className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-gray-900">Language & Region</p>
                <p className="text-sm text-gray-500">English (US)</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>

            <button className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors">
              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                <Moon className="h-5 w-5 text-gray-600" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-gray-900">Appearance</p>
                <p className="text-sm text-gray-500">Light mode</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Security & Privacy */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Security & Privacy</h3>
          </div>
          <div className="divide-y divide-gray-100">
            <button className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <Lock className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-gray-900">Change Password</p>
                <p className="text-sm text-gray-500">Update your password</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>

            <button className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors">
              <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                <Shield className="h-5 w-5 text-orange-600" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-gray-900">Privacy Settings</p>
                <p className="text-sm text-gray-500">Control your data</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Support */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Support</h3>
          </div>
          <div className="divide-y divide-gray-100">
            <button className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors">
              <div className="h-10 w-10 rounded-full bg-cyan-100 flex items-center justify-center">
                <HelpCircle className="h-5 w-5 text-cyan-600" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-gray-900">Help Center</p>
                <p className="text-sm text-gray-500">FAQs and guides</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>

            <button className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors">
              <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-teal-600" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-gray-900">Contact Support</p>
                <p className="text-sm text-gray-500">Get help from our team</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>

            {/* Legal Section */}
            <div className="border-b border-gray-100">
              <div className="px-4 py-3 bg-gray-50">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-600" />
                  <p className="text-sm font-semibold text-gray-900">Legal Documents</p>
                </div>
              </div>
              
              <Link href="/settings/privacy-policy" className="w-full flex items-center gap-3 px-4 py-3 active:bg-gray-50 transition-colors border-b border-gray-100 text-left hover:bg-gray-50">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 text-sm">Privacy Policy</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </Link>

              <Link href="/settings/terms-of-service" className="w-full flex items-center gap-3 px-4 py-3 active:bg-gray-50 transition-colors border-b border-gray-100 text-left hover:bg-gray-50">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 text-sm">Terms & Conditions</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </Link>

              <Link href="/settings/refund" className="w-full flex items-center gap-3 px-4 py-3 active:bg-gray-50 transition-colors text-left hover:bg-gray-50">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 text-sm">Refund Policy</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </Link>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full bg-white rounded-2xl shadow-sm p-4 flex items-center justify-center gap-2 text-red-600 font-semibold active:bg-gray-50 transition-colors"
        >
          <LogOut className="h-5 w-5" />
          Logout
        </button>

        {/* App Version */}
        <div className="text-center text-sm text-gray-500 py-4">
          <p>DTPS Nutrition v1.0.0</p>
          <p className="mt-1">© 2024 All rights reserved</p>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom z-50">
        <div className="grid grid-cols-5 h-16">
          <Link href="/client-dashboard" className="flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 active:bg-gray-50 transition-colors">
            <Home className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">Home</span>
          </Link>
          <Link href="/my-plan" className="flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 active:bg-gray-50 transition-colors">
            <Heart className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">Plan</span>
          </Link>
          <Link href="/my-plan" className="flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 active:bg-gray-50 transition-colors">
            <div className="h-12 w-12 bg-emerald-500 rounded-full flex items-center justify-center -mt-6 shadow-lg">
              <Plus className="h-6 w-6 text-white" />
            </div>
          </Link>
          <Link href="/progress" className="flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 active:bg-gray-50 transition-colors">
            <TrendingUp className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">Progress</span>
          </Link>
          <Link href="/messages" className="flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 active:bg-gray-50 transition-colors">
            <MessageCircle className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">Messages</span>
          </Link>
        </div>
      </div>
    </div>
  );
}


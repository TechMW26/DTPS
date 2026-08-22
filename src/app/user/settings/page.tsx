'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Bell,
  Moon,
  Globe,
  HelpCircle,
  FileText,
  MessageCircle,
  ChevronRight,
  LogOut,
  Smartphone,
  Mail,
  Volume2,
  Eye,
  Loader2,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import UserNavBar from '@/components/client/UserNavBar';
import { SpoonLoader } from '@/components/ui/SpoonLoader';
import { ClientPageSkeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';
import PageTransition from '@/components/animations/PageTransition';

interface UserSettings {
  pushNotifications: boolean;
  emailNotifications: boolean;
  mealReminders: boolean;
  appointmentReminders: boolean;
  progressUpdates: boolean;
  darkMode: boolean;
  soundEnabled: boolean;
}

export default function UserSettingsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { isDarkMode, setIsDarkMode } = useTheme();
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [settings, setSettings] = useState<UserSettings>({
    pushNotifications: true,
    emailNotifications: true,
    mealReminders: true,
    appointmentReminders: true,
    progressUpdates: false,
    darkMode: isDarkMode,
    soundEnabled: true,
  });

  // Handle logout with proper cookie clearing
  const handleLogout = useCallback(async () => {
    try {
      setLoggingOut(true);

      // First, try to call our custom logout API to clear cookies (if it exists)
      try {
        const logoutRes = await fetch('/api/auth/logout', { method: 'POST' });
        // Only try to parse JSON if response is ok and has content
        if (logoutRes.ok && logoutRes.headers.get('content-type')?.includes('application/json')) {
          await logoutRes.json();
        }
      } catch (logoutError) {
        // Silently fail if logout API doesn't respond with valid JSON
      }

      // Clear any local storage items
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user-preferences');
        localStorage.removeItem('dtps-theme');
        localStorage.removeItem('onboarding-data');
        sessionStorage.clear();
      }

      // Then call NextAuth signOut
      const fullSigninUrl = `${window.location.origin}/client-auth/signin`;
      await signOut({
        callbackUrl: fullSigninUrl,
        redirect: true
      });
    } catch (error) {
      console.error('Error during logout:', error);
      // Fallback to just NextAuth signOut
      const fullSigninUrl = `${window.location.origin}/client-auth/signin`;
      await signOut({ callbackUrl: fullSigninUrl });
    } finally {
      setLoggingOut(false);
    }
  }, []);

  // Handle account deletion
  const handleDeleteAccount = useCallback(async () => {
    if (!deletePassword.trim()) {
      setDeleteError('Please enter your password to confirm.');
      return;
    }

    setDeleting(true);
    setDeleteError('');

    try {
      const response = await fetch('/api/client/delete-account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        setDeleteError(data.error || 'Failed to delete account.');
        return;
      }

      toast.success('Account deleted successfully.');

      // Clear local storage and sign out
      if (typeof window !== 'undefined') {
        localStorage.clear();
        sessionStorage.clear();
      }

      // Sign out and redirect
      const fullSigninUrl = `${window.location.origin}/client-auth/signin`;
      await signOut({ callbackUrl: fullSigninUrl, redirect: true });
    } catch (error) {
      console.error('Error deleting account:', error);
      setDeleteError('An error occurred. Please try again.');
    } finally {
      setDeleting(false);
    }
  }, [deletePassword]);

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/client/settings', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          if (data.settings) {
            setSettings(data.settings);
          }
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  // Update individual setting
  const updateSetting = async (key: string, value: boolean) => {
    setSaving(key);

    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    // Handle dark mode immediately using ThemeContext
    if (key === 'darkMode') {
      setIsDarkMode(value);
    }

    // Play sound effect if enabled
    if (settings.soundEnabled && key !== 'soundEnabled') {
      playToggleSound();
    }

    try {
      const response = await fetch('/api/client/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: newSettings })
      });

      if (response.ok) {
        // Show specific messages for certain settings
        if (key === 'mealReminders') {
          toast.success(value ? 'Meal reminders enabled! You\'ll be notified at meal times.' : 'Meal reminders disabled');
        } else if (key === 'appointmentReminders') {
          toast.success(value ? 'Appointment reminders enabled! You\'ll get notifications before appointments.' : 'Appointment reminders disabled');
        } else if (key === 'pushNotifications') {
          if (value) {
            // Request push notification permission
            requestNotificationPermission();
          }
          toast.success(value ? 'Push notifications enabled' : 'Push notifications disabled');
        } else if (key === 'darkMode') {
          toast.success(value ? 'Dark mode enabled' : 'Light mode enabled');
        }
      } else {
        // Revert on error
        setSettings(settings);
        if (key === 'darkMode') {
          setIsDarkMode(!value);
        }
        toast.error('Failed to update setting');
      }
    } catch (error) {
      console.error('Error updating setting:', error);
      setSettings(settings);
      if (key === 'darkMode') {
        setIsDarkMode(!value);
      }
      toast.error('Failed to update setting');
    } finally {
      setSaving(null);
    }
  };

  // Request notification permission
  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        // Register for push notifications
        if ('serviceWorker' in navigator) {
          try {
            const registration = await navigator.serviceWorker.ready;
          } catch (error) {
            console.error('Error registering for push:', error);
          }
        }
      } else if (permission === 'denied') {
        toast.error('Please enable notifications in your browser settings');
        setSettings(prev => ({ ...prev, pushNotifications: false }));
      }
    }
  };

  // Play toggle sound
  const playToggleSound = () => {
    try {
      const audio = new Audio('/sounds/toggle.mp3');
      audio.volume = 0.3;
      audio.play().catch(() => { });
    } catch (error) {
      // Ignore audio errors
    }
  };

  const settingSections = [
    {
      title: 'Notifications',
      icon: Bell,
      description: 'Control how you receive updates',
      items: [
        {
          key: 'pushNotifications',
          label: 'Push notifications',
          description: 'Receive push notifications on your device',
          icon: Smartphone,
        },
        {
          key: 'emailNotifications',
          label: 'Email notifications',
          description: 'Receive updates via email',
          icon: Mail,
        },
      ],
    },
    {
      title: 'Reminders',
      icon: Bell,
      description: 'Stay on track with timely reminders',
      items: [
        {
          key: 'mealReminders',
          label: 'Meal reminders',
          description: 'Get reminded about your meals at scheduled times',
          icon: Bell,
        },
        {
          key: 'appointmentReminders',
          label: 'Appointment reminders',
          description: 'Get notified 30 minutes before appointments',
          icon: Bell,
        },
        {
          key: 'progressUpdates',
          label: 'Weekly progress updates',
          description: 'Receive weekly progress summaries',
          icon: Bell,
        },
      ],
    },
    {
      title: 'Appearance',
      icon: Eye,
      description: 'Customize your app experience',
      items: [
        {
          key: 'darkMode',
          label: 'Dark mode',
          description: 'Use dark theme for better night viewing',
          icon: Moon,
        },
        {
          key: 'soundEnabled',
          label: 'Sound effects',
          description: 'Play sounds for notifications and actions',
          icon: Volume2,
        },
      ],
    },
  ];

  const linkSections = [
    {
      title: 'Support',
      icon: HelpCircle,
      links: [
        { label: 'Help center', href: '/user/settings/help-center', icon: HelpCircle },
        { label: 'Contact support', href: '/user/settings/contact-support', icon: MessageCircle },
        { label: 'Report a problem', href: '/user/settings/report-problem', icon: MessageCircle },
      ],
    },
    {
      title: 'Legal',
      icon: FileText,
      links: [
        { label: 'Terms of service', href: '/user/settings/terms-of-service', icon: FileText },
        { label: 'Privacy policy', href: '/user/settings/privacy-policy', icon: FileText },
        { label: 'Refund and cancellation policy', href: '/user/settings/refund', icon: FileText },
      ],
    },
  ];

  if (loading) {
    return <ClientPageSkeleton variant="list" showHeader={false} />;
  }

  return (
    <PageTransition>
      <div className={`min-h-screen transition-colors duration-500 ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        {/* Navigation Bar */}
        <UserNavBar
          title="Settings"
          subtitle="Manage your preferences"
          showBack={true}
          showMenu={false}
          showProfile={false}
          showNotification={false}
          backHref="/user"
        />

        <div className="px-4 space-y-4 py-4">
          {/* Setting Sections with Toggles */}
          {settingSections.map((section) => (
            <Card
              key={section.title}
              className={`border-0 shadow-sm hover:shadow-md transition-shadow ${isDarkMode ? 'bg-gray-800' : 'bg-white'
                }`}
            >
              <CardHeader className="p-4 pb-2 border-b border-[#3AB1A0]/10">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[#E06A26]/10 flex items-center justify-center">
                    <section.icon className="h-5 w-5 text-[#E06A26]" />
                  </div>
                  <div>
                    <CardTitle className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-[#3AB1A0]'
                      }`}>
                      {section.title}
                    </CardTitle>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {section.description}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-3 space-y-3">
                {section.items.map((item) => (
                  <div
                    key={item.key}
                    className={`flex items-center justify-between p-3 rounded-xl transition-colors ${isDarkMode
                      ? 'hover:bg-gray-700'
                      : 'hover:bg-[#3AB1A0]/5'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${settings[item.key as keyof UserSettings]
                        ? 'bg-[#3AB1A0]/20'
                        : isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                        }`}>
                        <item.icon className={`h-5 w-5 ${settings[item.key as keyof UserSettings]
                          ? 'text-[#3AB1A0]'
                          : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`} />
                      </div>
                      <div>
                        <Label className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                          {item.label}
                        </Label>
                        <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                          {item.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {saving === item.key && (
                        <Loader2 className="h-4 w-4 animate-spin text-[#3AB1A0]" />
                      )}
                      <Switch
                        checked={settings[item.key as keyof UserSettings] as boolean}
                        onCheckedChange={(checked) => updateSetting(item.key, checked)}
                        aria-label={item.label}
                        className="data-[state=checked]:bg-[#3AB1A0]"
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          {/* Link Sections */}
          {linkSections.map((section) => (
            <Card
              key={section.title}
              className={`border-0 shadow-sm hover:shadow-md transition-shadow ${isDarkMode ? 'bg-gray-800' : 'bg-white'
                }`}
            >
              <CardHeader className="p-4 pb-2 border-b border-[#3AB1A0]/10">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[#DB9C6E]/10 flex items-center justify-center">
                    <section.icon className="h-5 w-5 text-[#DB9C6E]" />
                  </div>
                  <CardTitle className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-[#3AB1A0]'
                    }`}>
                    {section.title}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2 space-y-1">
                {section.links.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className={`flex items-center justify-between p-3 rounded-xl transition-colors ${isDarkMode
                      ? 'hover:bg-gray-700'
                      : 'hover:bg-[#3AB1A0]/10'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <link.icon className="h-5 w-5 text-[#E06A26]" />
                      <span className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-700'
                        }`}>
                        {link.label}
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#3AB1A0]" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}

          {/* Language Selection */}
          <Card className={`border-0 shadow-sm hover:shadow-md transition-shadow ${isDarkMode ? 'bg-gray-800' : 'bg-white'
            }`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[#E06A26]/10 flex items-center justify-center">
                    <Globe className="h-5 w-5 text-[#E06A26]" />
                  </div>
                  <div>
                    <Label className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                      Language
                    </Label>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                      English (US)
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-[#3AB1A0]" />
              </div>
            </CardContent>
          </Card>

          {/* App Version */}
          <Card className="border-0 shadow-sm bg-linear-to-r from-[#E06A26]/10 to-[#3AB1A0]/10">
            <CardContent className="p-4 text-center">
              <p className="text-sm font-semibold text-[#3AB1A0]">DTPS Nutrition</p>
              <p className="text-xs text-gray-500">Version 1.0.0</p>
            </CardContent>
          </Card>

          {/* Sign Out Button */}
          <Button
            className="w-full bg-[#E06A26] hover:bg-[#E06A26]/90 text-white font-medium h-12 rounded-xl disabled:opacity-50"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Signing out...
              </>
            ) : (
              <>
                <LogOut className="h-5 w-5 mr-2" />
                Sign out
              </>
            )}
          </Button>

          {/* Delete Account Section */}
          <Card className={`border-0 shadow-sm ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <CardContent className="p-4">
              {!showDeleteDialog ? (
                <button
                  onClick={() => setShowDeleteDialog(true)}
                  className="flex items-center gap-3 w-full text-left"
                >
                  <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
                    <Trash2 className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-red-600">Delete account</p>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Permanently delete your account and all data
                    </p>
                  </div>
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl">
                    <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-700">Delete your account?</p>
                      <p className="text-xs text-red-600 mt-1">
                        This action is permanent and cannot be undone. All your data including meal plans,
                        progress records, appointments, and messages will be permanently deleted.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="delete-account-password" className="text-sm font-medium text-gray-700">
                      Enter your password to confirm
                    </label>
                    <input
                      id="delete-account-password"
                      type="password"
                      value={deletePassword}
                      onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(''); }}
                      placeholder="Enter your password"
                      className={`w-full h-12 px-4 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-300 ${deleteError ? 'border-red-400' : 'border-gray-300'
                        }`}
                    />
                    {deleteError && (
                      <p className="text-xs text-red-500">{deleteError}</p>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 h-11 rounded-xl"
                      onClick={() => {
                        setShowDeleteDialog(false);
                        setDeletePassword('');
                        setDeleteError('');
                      }}
                      disabled={deleting}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white"
                      onClick={handleDeleteAccount}
                      disabled={deleting || !deletePassword.trim()}
                    >
                      {deleting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        'Delete account'
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Support Contact Details */}
          <Card className="border-0 shadow-sm bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-sm font-semibold text-gray-900">Support</p>
              <p className="text-sm text-gray-700">Email: support@dtpoonamsagar.com</p>
              <p className="text-sm text-gray-700">Phone: +91 98930 27688</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}

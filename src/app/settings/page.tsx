'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/contexts/ThemeContext';
import {
  User,
  Save,
  Bell,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Calendar,
  Loader2,
  Moon,
  Sun,
  Palette,
  Shield,
  MapPin,
  Monitor
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { log } from 'console';

// Import mobile version for clients
const MobileSettingsPage = dynamic(() => import('./page-mobile'), {
  ssr: false
});

interface UserProfile {
  user: any;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatar?: string;
  bio?: string;
  dateOfBirth?: string;
  gender?: string;
  height?: number;
  weight?: number;
  activityLevel?: string;
  healthGoals?: string[];
  medicalConditions?: string[];
  allergies?: string[];
  dietaryRestrictions?: string[];
  // Dietitian specific
  credentials?: string[];
  specializations?: string[];
  experience?: number;
  consultationFee?: number;
  lastLoginAt?: string;
}

interface LoginLogEntry {
  _id: string;
  createdAt: string;
  ipAddress?: string;
  userAgent?: string;
  description?: string;
  deviceName?: string;
  sessionId?: string;
  isCurrentSession?: boolean;
  source?: 'activity' | 'profile';
}

// Desktop version component
function DesktopSettingsPage() {
  const { data: session, update } = useSession();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const isStaffWithLoginLogs = session?.user?.role === 'dietitian' || session?.user?.role === 'health_counselor';
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [googleCalendarConnecting, setGoogleCalendarConnecting] = useState(false);
  const [loginLogsLoading, setLoginLogsLoading] = useState(false);
  const [loggingOutOthers, setLoggingOutOthers] = useState(false);
  const [loginLogs, setLoginLogs] = useState<LoginLogEntry[]>([]);



  useEffect(() => {
    if (session?.user?.id) {
      fetchProfile();
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!isStaffWithLoginLogs || !session?.user?.id) return;
    fetchLoginLogs();
  }, [isStaffWithLoginLogs, session?.user?.id]);

  useEffect(() => {
    if (!isStaffWithLoginLogs) return;
    if (!profile?.lastLoginAt) return;
    if (loginLogs.length > 0) return;

    setLoginLogs([
      {
        _id: 'last-login-fallback',
        createdAt: profile.lastLoginAt,
        description: 'Last account login (from profile record)',
        source: 'profile'
      }
    ]);
  }, [isStaffWithLoginLogs, profile?.lastLoginAt, loginLogs.length]);

  const getDeviceSummary = (userAgent?: string): string => {
    if (!userAgent) return 'Unknown device';

    const ua = userAgent.toLowerCase();
    const platform = ua.includes('android')
      ? 'Android'
      : ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')
        ? 'iOS'
        : ua.includes('mac')
          ? 'macOS'
          : ua.includes('windows')
            ? 'Windows'
            : ua.includes('linux')
              ? 'Linux'
              : 'Unknown OS';

    const browser = ua.includes('edg/')
      ? 'Edge'
      : ua.includes('chrome/')
        ? 'Chrome'
        : ua.includes('safari/') && !ua.includes('chrome/')
          ? 'Safari'
          : ua.includes('firefox/')
            ? 'Firefox'
            : 'Browser';

    return `${browser} on ${platform}`;
  };

  const fetchLoginLogs = async () => {
    if (!session?.user?.id) return;
    try {
      setLoginLogsLoading(true);
      const params = new URLSearchParams({
        page: '1',
        limit: '200',
        userId: session.user.id,
        actionType: 'login',
        category: 'auth'
      });

      const response = await fetch(`/api/activity-logs?${params.toString()}`, {
        cache: 'no-store'
      });

      if (!response.ok) {
        setLoginLogs([]);
        return;
      }

      const data = await response.json();
      const activities = Array.isArray(data?.activities) ? data.activities : [];
      const normalized = activities.map((item: any) => ({
        _id: String(item?._id || ''),
        createdAt: item?.createdAt,
        ipAddress: item?.ipAddress,
        userAgent: item?.userAgent,
        deviceName: item?.details?.deviceName,
        sessionId: item?.details?.sessionId,
        isCurrentSession: item?.details?.sessionId && session?.user?.sessionId
          ? item.details.sessionId === session.user.sessionId
          : false,
        description: item?.description,
        source: 'activity' as const,
      })).filter((item: LoginLogEntry) => Boolean(item._id) && Boolean(item.createdAt));
      setLoginLogs(normalized);
    } catch (err) {
      console.error('Error fetching login logs:', err);
      setLoginLogs([]);
    } finally {
      setLoginLogsLoading(false);
    }
  };

  const handleLogoutOtherDevices = async () => {
    try {
      setLoggingOutOthers(true);
      setError('');
      setMessage('');

      const response = await fetch('/api/auth/logout-other-sessions', {
        method: 'POST'
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Failed to logout other devices' }));
        setError(data.error || 'Failed to logout other devices');
        return;
      }

      setMessage('Logged out from all other devices. This device stays signed in.');
      await fetchLoginLogs();
    } catch (err) {
      console.error('Error logging out other devices:', err);
      setError('Failed to logout other devices');
    } finally {
      setLoggingOutOthers(false);
    }
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/users/${session?.user?.id}`);
      if (response.ok) {
        const data = await response.json();
        // API returns { user: {...} }
        const userData = data.user || data;
        setProfile(userData);
        // Check if Google Calendar is connected
        setGoogleCalendarConnected(!!userData.googleCalendarAccessToken);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profile),
      });

      if (response.ok) {
        const updatedProfile = await response.json();
        setProfile(updatedProfile);
        setMessage('Profile updated successfully');

        // Update session if avatar changed
        if (updatedProfile?.avatar !== session?.user?.avatar) {
          await update({
            ...session,
            user: {
              ...session?.user,
              avatar: updatedProfile?.avatar
            }
          });
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      setError('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = (url: string) => {
    if (profile) {
      setProfile({ ...profile, avatar: url });
    }
  };

  const updateField = (field: keyof UserProfile, value: any) => {
    if (profile) {
      setProfile({ ...profile, [field]: value });
    }
  };

  const handleConnectGoogleCalendar = async () => {
    try {
      setGoogleCalendarConnecting(true);
      const response = await fetch('/api/auth/google-calendar', {
        method: 'POST'
      });
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setError('Failed to get Google Calendar authorization URL');
      }
    } catch (err) {
      console.error('Error connecting Google Calendar:', err);
      setError('Failed to connect Google Calendar');
    } finally {
      setGoogleCalendarConnecting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner />
        </div>
      </DashboardLayout>
    );
  }

  if (!profile) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card>
            <CardContent className="text-center py-12">
              <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Profile Not Found</h3>
              <p className="text-gray-600">Unable to load your profile information.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your account and preferences</p>
        </div>

        {/* Messages */}
        {message && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="appearance" className="space-y-4">
          <TabsList>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            {isStaffWithLoginLogs && <TabsTrigger value="login-logs">Login Logs</TabsTrigger>}
          </TabsList>

          <TabsContent value="appearance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Palette className="h-5 w-5" />
                  <span>Appearance</span>
                </CardTitle>
                <CardDescription>Customize how the dashboard looks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 border rounded-lg dark:border-gray-700">
                  <div className="flex items-center space-x-3">
                    {isDarkMode ? (
                      <Moon className="h-6 w-6 text-blue-500" />
                    ) : (
                      <Sun className="h-6 w-6 text-yellow-500" />
                    )}
                    <div>
                      <h3 className="font-medium dark:text-white">Dark Mode</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {isDarkMode ? 'Dark theme is enabled' : 'Light theme is enabled'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={isDarkMode}
                    onCheckedChange={toggleDarkMode}
                  />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Switch between light and dark themes. Your preference will be saved and applied automatically.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Bell className="h-5 w-5" />
                  <span>Notification Preferences</span>
                </CardTitle>
                <CardDescription>Choose how you want to be notified</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Coming Soon</h3>
                  <p className="text-gray-600">
                    Notification preferences will be available in a future update.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Calendar className="h-5 w-5" />
                  <span>Calendar Integration</span>
                </CardTitle>
                <CardDescription>Connect your Google Calendar to sync tasks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Calendar className="h-6 w-6 text-blue-500" />
                    <div>
                      <h3 className="font-medium">Google Calendar</h3>
                      <p className="text-sm text-gray-600">
                        {googleCalendarConnected ? 'Connected' : 'Not connected'}
                      </p>
                    </div>
                  </div>
                  {!googleCalendarConnected ? (
                    <Button
                      onClick={handleConnectGoogleCalendar}
                      disabled={googleCalendarConnecting}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {googleCalendarConnecting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Calendar className="mr-2 h-4 w-4" />
                          Connect Calendar
                        </>
                      )}
                    </Button>
                  ) : (
                    <div className="flex items-center space-x-2 text-green-600">
                      <CheckCircle className="h-5 w-5" />
                      <span>Connected</span>
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-4">
                  Connect your Google Calendar to automatically sync tasks and receive calendar notifications.
                  Your calendar will be updated with new tasks and their deadlines.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {isStaffWithLoginLogs && (
            <TabsContent value="login-logs" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Shield className="h-5 w-5" />
                    <span>Login Logs</span>
                  </CardTitle>
                  <CardDescription>
                    Recent sign-ins for this account, including IP and device details.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleLogoutOtherDevices}
                      disabled={loggingOutOthers || loginLogsLoading}
                    >
                      {loggingOutOthers ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Logging out...
                        </>
                      ) : (
                        'Logout Other Devices'
                      )}
                    </Button>
                    <Button variant="outline" size="sm" onClick={fetchLoginLogs} disabled={loginLogsLoading}>
                      {loginLogsLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Refreshing...
                        </>
                      ) : (
                        'Refresh Logs'
                      )}
                    </Button>
                  </div>

                  {loginLogsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <LoadingSpinner />
                    </div>
                  ) : loginLogs.length === 0 ? (
                    <div className="rounded-lg border p-4 text-sm text-gray-600 dark:text-gray-300">
                      No login logs found yet for this account.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {loginLogs.map((logItem) => (
                        <div key={logItem._id} className="rounded-lg border p-3 dark:border-gray-700">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {new Date(logItem.createdAt).toLocaleString()}
                            </p>
                            {logItem.isCurrentSession && (
                              <span className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-semibold">
                                Current Device
                              </span>
                            )}
                          </div>
                          {logItem.source === 'profile' && (
                            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{logItem.description}</p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
                            <span className="inline-flex items-center gap-1">
                              <Monitor className="h-3.5 w-3.5" />
                              Device: {logItem.deviceName || getDeviceSummary(logItem.userAgent)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              IP: {logItem.ipAddress || 'Unavailable'}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Shield className="h-3.5 w-3.5" />
                              {getDeviceSummary(logItem.userAgent)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <LoadingSpinner className="mr-2 h-4 w-4" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}

// Main export with role-based routing
export default function SettingsPage() {
  const { data: session } = useSession();
  const isClient = session?.user?.role === 'client';

  // Show mobile UI for clients
  if (isClient) {
    return <MobileSettingsPage />;
  }

  // Show desktop UI for dietitians/admins
  return <DesktopSettingsPage />;
}

'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import FileUpload from '@/components/ui/file-upload';
import { DashboardContentSkeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  User,
  Camera,
  Save,
  Mail,
  Phone,
  Calendar,
  CheckCircle,
  AlertCircle,
  Edit,
  LogOut,
  Shield,
} from 'lucide-react';
import { format } from 'date-fns';

interface UserProfile {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatar?: string;
  bio?: string;
  role: string;
  status: string;
  dateOfBirth?: string;
  gender?: string;
  credentials?: string[];
  specializations?: string[];
  experience?: number;
  createdAt: string;
}

export default function HealthCounselorProfilePage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Verify user is health counselor
    if (session?.user?.role !== 'health_counselor') {
      router.push('/auth/signin');
      return;
    }
    fetchProfile();
  }, [session, router]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/users/${session?.user?.id}`);
      if (response.ok) {
        const data = await response.json();
        setProfile(data.user || data);
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
        setEditing(false);
        
        // Update session if avatar changed
        if (updatedProfile.avatar !== session?.user?.avatar) {
          await update({
            ...session,
            user: {
              ...session?.user,
              avatar: updatedProfile.avatar
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

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user-preferences');
        localStorage.removeItem('theme');
        sessionStorage.clear();
      }
      
      const fullSigninUrl = `${window.location.origin}/`;
      await signOut({ callbackUrl: fullSigninUrl });
    } catch (error) {
      console.error('Error during logout:', error);
      const fullSigninUrl = `${window.location.origin}/`;
      await signOut({ callbackUrl: fullSigninUrl });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <DashboardContentSkeleton statCards={3} sections={2} />
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
            <p className="text-gray-600 mt-1">Manage your personal information</p>
          </div>
          <div className="flex space-x-2">
            {!editing ? (
              <Button onClick={() => setEditing(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Profile
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Messages */}
        {message && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{message}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Card */}
          <Card className="lg:col-span-1">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center">
                <div className="relative">
                  <Avatar className="h-32 w-32">
                    <AvatarImage src={profile.avatar} />
                    <AvatarFallback className="text-2xl bg-teal-100 text-teal-700">
                      {profile.firstName?.[0]}{profile.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  {editing && (
                    <FileUpload type="avatar" onUpload={handleAvatarUpload}>
                      <button className="absolute bottom-0 right-0 h-10 w-10 rounded-full bg-teal-500 text-white flex items-center justify-center shadow-lg hover:bg-teal-600 transition-colors">
                        <Camera className="h-5 w-5" />
                      </button>
                    </FileUpload>
                  )}
                </div>
                
                <h2 className="mt-4 text-xl font-semibold text-gray-900">
                  {profile.firstName} {profile.lastName}
                </h2>
                
                <div className="flex items-center space-x-2 mt-2">
                  <Badge className="bg-teal-100 text-teal-800">
                    <Shield className="h-3 w-3 mr-1" />
                    Health Counselor
                  </Badge>
                  <Badge className={profile.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                    {profile.status}
                  </Badge>
                </div>

                <div className="mt-4 w-full space-y-3 text-sm">
                  <div className="flex items-center text-gray-600">
                    <Mail className="h-4 w-4 mr-3 text-gray-400" />
                    {profile.email}
                  </div>
                  {profile.phone && (
                    <div className="flex items-center text-gray-600">
                      <Phone className="h-4 w-4 mr-3 text-gray-400" />
                      {profile.phone}
                    </div>
                  )}
                  <div className="flex items-center text-gray-600">
                    <Calendar className="h-4 w-4 mr-3 text-gray-400" />
                    Member since {format(new Date(profile.createdAt), 'MMMM yyyy')}
                  </div>
                </div>

                <div className="mt-6 w-full pt-6 border-t">
                  <Button
                    variant="outline"
                    className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Details Card */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>
                Your personal details and contact information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  {editing ? (
                    <Input
                      id="firstName"
                      value={profile.firstName}
                      onChange={(e) => updateField('firstName', e.target.value)}
                      className="mt-1"
                    />
                  ) : (
                    <p className="mt-1 text-sm text-gray-900">{profile.firstName}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  {editing ? (
                    <Input
                      id="lastName"
                      value={profile.lastName}
                      onChange={(e) => updateField('lastName', e.target.value)}
                      className="mt-1"
                    />
                  ) : (
                    <p className="mt-1 text-sm text-gray-900">{profile.lastName}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  {editing ? (
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      className="mt-1"
                    />
                  ) : (
                    <p className="mt-1 text-sm text-gray-900">{profile.email}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  {editing ? (
                    <Input
                      id="phone"
                      value={profile.phone || ''}
                      onChange={(e) => updateField('phone', e.target.value)}
                      placeholder="Enter phone number"
                      className="mt-1"
                    />
                  ) : (
                    <p className="mt-1 text-sm text-gray-900">{profile.phone || 'Not provided'}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="bio">Bio</Label>
                {editing ? (
                  <Textarea
                    id="bio"
                    value={profile.bio || ''}
                    onChange={(e) => updateField('bio', e.target.value)}
                    placeholder="Tell us about yourself..."
                    className="mt-1"
                    rows={4}
                  />
                ) : (
                  <p className="mt-1 text-sm text-gray-900">{profile.bio || 'No bio provided'}</p>
                )}
              </div>

              {/* Specializations */}
              {profile.specializations && profile.specializations.length > 0 && (
                <div>
                  <Label>Specializations</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {profile.specializations.map((spec, index) => (
                      <Badge key={index} variant="outline">
                        {spec}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Experience */}
              {profile.experience && (
                <div>
                  <Label>Experience</Label>
                  <p className="mt-1 text-sm text-gray-900">{profile.experience} years</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

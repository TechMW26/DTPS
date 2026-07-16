'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  Edit2,
  Save,
  X,
  Trash2,
  UserX,
  Users,
  Calendar,
  Activity,
  User,
  Phone,
  Mail,
  Briefcase,
  Clock,
  CheckCircle,
  AlertCircle,
  HeartPulse
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface ClientProgress {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
  phone?: string;
  status: string;
  clientStatus?: 'lead' | 'active' | 'inactive' | 'hold' | string;
  createdAt: string;
  generalGoal?: string;
  onboardingCompleted?: boolean;
  progress: {
    appointmentCount: number;
    upcomingAppointment?: {
      dateTime: string;
      type: string;
    };
    lastAppointment?: {
      dateTime: string;
      type: string;
    };
  };
}

interface HealthCounselor {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatar?: string;
  status: string;
  bio?: string;
  experience?: number;
  specializations?: string[];
  credentials?: string[];
  availability?: Array<{
    day: string;
    startTime: string;
    endTime: string;
  }>;
  createdAt: string;
}

interface Stats {
  totalClients: number;
  activeClients: number;
  totalAppointments: number;
  completedAppointments: number;
}

export default function AdminHealthCounselorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const counselorId = params.counselorId as string;

  const [counselor, setCounselor] = useState<HealthCounselor | null>(null);
  const [clients, setClients] = useState<ClientProgress[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<HealthCounselor>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);

  useEffect(() => {
    if (counselorId) {
      fetchCounselorDetails();
    }
  }, [counselorId]);

  const fetchCounselorDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/health-counselors/${counselorId}`);
      if (!response.ok) throw new Error('Failed to fetch health counselor details');

      const data = await response.json();
      setCounselor(data.counselor);
      setClients(data.clients || []);
      setStats(data.stats);
    } catch (error) {
      console.error('Error fetching health counselor:', error);
      toast.error('Failed to load health counselor details');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    if (counselor) {
      setEditData({
        firstName: counselor.firstName,
        lastName: counselor.lastName,
        email: counselor.email,
        phone: counselor.phone,
        bio: counselor.bio,
        experience: counselor.experience,
        specializations: counselor.specializations,
        credentials: counselor.credentials,
      });
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/admin/health-counselors/${counselorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      });

      if (!response.ok) throw new Error('Failed to update health counselor');

      const data = await response.json();
      setCounselor(data.counselor);
      setIsEditing(false);
      toast.success('Health Counselor updated successfully');
    } catch (error) {
      console.error('Error updating health counselor:', error);
      toast.error('Failed to update health counselor');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      const response = await fetch(`/api/admin/health-counselors/${counselorId}?action=deactivate`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to deactivate health counselor');

      const data = await response.json();
      toast.success(data.message);
      if (data.warning) {
        toast.warning(data.warning);
      }
      router.push('/admin/health-counselors');
    } catch (error) {
      console.error('Error deactivating health counselor:', error);
      toast.error('Failed to deactivate health counselor');
    }
    setDeactivateDialogOpen(false);
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/admin/health-counselors/${counselorId}?action=delete`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete health counselor');
      }

      toast.success('Health Counselor deleted permanently');
      router.push('/admin/health-counselors');
    } catch (error: any) {
      console.error('Error deleting health counselor:', error);
      toast.error(error.message || 'Failed to delete health counselor');
    }
    setDeleteDialogOpen(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'inactive': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'hold': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'lead':
      case 'leading':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
      case 'suspended': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'inactive':
        return 'Inactive';
      case 'hold':
        return 'On Hold';
      default:
        return 'Lead';
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <LoadingSpinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (!counselor) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <AlertCircle className="h-16 w-16 text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-600">Health Counselor not found</h2>
          <Button onClick={() => router.push('/admin/health-counselors')} className="mt-4">
            Back to Health Counselors
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 px-4 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/admin/health-counselors')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Health Counselor Profile</h1>
              <p className="text-gray-500">View and manage health counselor details</p>
            </div>
          </div>
          <div className="flex gap-2">
            {!isEditing ? (
              <>
                <Button variant="outline" onClick={handleEdit}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  className="text-amber-600 border-amber-600 hover:bg-amber-50"
                  onClick={() => setDeactivateDialogOpen(true)}
                >
                  <UserX className="h-4 w-4 mr-2" />
                  Deactivate
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsEditing(false)} disabled={saving}>
                  <X className="h-4 w-4 mr-2" />
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

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold">{stats.totalClients}</p>
                    <p className="text-xs text-gray-500">Total Clients</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold">{stats.activeClients}</p>
                    <p className="text-xs text-gray-500">Active Clients</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-purple-500" />
                  <div>
                    <p className="text-2xl font-bold">{stats.totalAppointments}</p>
                    <p className="text-xs text-gray-500">Total Appointments</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-teal-500" />
                  <div>
                    <p className="text-2xl font-bold">{stats.completedAppointments}</p>
                    <p className="text-xs text-gray-500">Completed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Profile Card */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-shrink-0">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={counselor.avatar} />
                  <AvatarFallback className="text-2xl bg-purple-500 text-white">
                    {counselor.firstName?.[0]}{counselor.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label className="text-gray-500">Full Name</Label>
                  {isEditing ? (
                    <div className="flex gap-2">
                      <Input
                        value={editData.firstName || ''}
                        onChange={e => setEditData({ ...editData, firstName: e.target.value })}
                        placeholder="First Name"
                      />
                      <Input
                        value={editData.lastName || ''}
                        onChange={e => setEditData({ ...editData, lastName: e.target.value })}
                        placeholder="Last Name"
                      />
                    </div>
                  ) : (
                    <p className="font-medium">{counselor.firstName} {counselor.lastName}</p>
                  )}
                </div>
                <div>
                  <Label className="text-gray-500">Email</Label>
                  {isEditing ? (
                    <Input
                      value={editData.email || ''}
                      onChange={e => setEditData({ ...editData, email: e.target.value })}
                    />
                  ) : (
                    <p className="font-medium">{counselor.email}</p>
                  )}
                </div>
                <div>
                  <Label className="text-gray-500">Phone</Label>
                  {isEditing ? (
                    <Input
                      value={editData.phone || ''}
                      onChange={e => setEditData({ ...editData, phone: e.target.value })}
                    />
                  ) : (
                    <p className="font-medium">{counselor.phone || 'Not provided'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-gray-500">Status</Label>
                  <Badge className={getStatusColor(counselor.status)}>
                    {counselor.status}
                  </Badge>
                </div>
                <div>
                  <Label className="text-gray-500">Experience</Label>
                  {isEditing ? (
                    <Input
                      type="number"
                      value={editData.experience || ''}
                      onChange={e => setEditData({ ...editData, experience: parseInt(e.target.value) })}
                      placeholder="Years"
                    />
                  ) : (
                    <p className="font-medium">{counselor.experience ? `${counselor.experience} years` : 'Not specified'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-gray-500">Joined</Label>
                  <p className="font-medium">{format(new Date(counselor.createdAt), 'MMM dd, yyyy')}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList>
            <TabsTrigger value="profile">
              <User className="h-4 w-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="clients">
              <Users className="h-4 w-4 mr-2" />
              Assigned Clients ({clients.length})
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    Professional Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-gray-500">Bio</Label>
                    {isEditing ? (
                      <Textarea
                        value={editData.bio || ''}
                        onChange={e => setEditData({ ...editData, bio: e.target.value })}
                        rows={4}
                      />
                    ) : (
                      <p className="text-sm">{counselor.bio || 'No bio provided'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-gray-500">Specializations</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {counselor.specializations?.length ? (
                        counselor.specializations.map((spec, i) => (
                          <Badge key={i} variant="outline" className="bg-purple-50 text-purple-700">{spec}</Badge>
                        ))
                      ) : (
                        <span className="text-gray-400">None specified</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-500">Credentials</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {counselor.credentials?.length ? (
                        counselor.credentials.map((cred, i) => (
                          <Badge key={i} variant="outline" className="bg-green-50 text-green-700">{cred}</Badge>
                        ))
                      ) : (
                        <span className="text-gray-400">None specified</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Availability
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {counselor.availability?.length ? (
                    <div className="space-y-2">
                      {counselor.availability.map((slot, i) => (
                        <div key={i} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                          <span className="font-medium capitalize">{slot.day}</span>
                          <span className="text-gray-600">{slot.startTime} - {slot.endTime}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-center py-4">No availability set</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Clients Tab */}
          <TabsContent value="clients">
            <Card>
              <CardHeader>
                <CardTitle>Assigned Clients & Progress</CardTitle>
              </CardHeader>
              <CardContent>
                {clients.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Goal</TableHead>
                        <TableHead>Total Appointments</TableHead>
                        <TableHead>Last Appointment</TableHead>
                        <TableHead>Next Appointment</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clients.map((client) => (
                        <TableRow
                          key={client._id}
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                          onClick={() => router.push(`/admin/clients/${client._id}`)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={client.avatar} />
                                <AvatarFallback className="text-xs">
                                  {client.firstName?.[0]}{client.lastName?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{client.firstName} {client.lastName}</p>
                                <p className="text-xs text-gray-500">{client.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {client.generalGoal?.replace('-', ' ') || 'Not set'}
                            </Badge>
                          </TableCell>
                          <TableCell>{client.progress.appointmentCount}</TableCell>
                          <TableCell>
                            {client.progress.lastAppointment ? (
                              <div>
                                <p className="text-sm">
                                  {format(new Date(client.progress.lastAppointment.dateTime), 'MMM dd, yyyy')}
                                </p>
                                <p className="text-xs text-gray-500 capitalize">
                                  {client.progress.lastAppointment.type}
                                </p>
                              </div>
                            ) : (
                              <span className="text-gray-400">None</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {client.progress.upcomingAppointment ? (
                              <div>
                                <p className="text-sm">
                                  {format(new Date(client.progress.upcomingAppointment.dateTime), 'MMM dd, HH:mm')}
                                </p>
                                <p className="text-xs text-gray-500 capitalize">
                                  {client.progress.upcomingAppointment.type}
                                </p>
                              </div>
                            ) : (
                              <span className="text-gray-400">None scheduled</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(client.clientStatus || 'lead')}>
                              {getStatusLabel(client.clientStatus)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>No clients assigned</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Deactivate Dialog */}
        <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate Health Counselor</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to deactivate {counselor.firstName} {counselor.lastName}?
                {clients.length > 0 && (
                  <span className="text-amber-600 block mt-2">
                    Warning: This health counselor has {clients.length} assigned clients.
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeactivate} className="bg-amber-600 hover:bg-amber-700">
                Deactivate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Health Counselor Permanently</AlertDialogTitle>
              <AlertDialogDescription className="text-red-600">
                This action cannot be undone.
                {clients.length > 0 ? (
                  <span className="block mt-2">
                    Cannot delete: This health counselor has {clients.length} assigned clients.
                    Please reassign them first.
                  </span>
                ) : (
                  <span className="block mt-2">
                    This will permanently delete {counselor.firstName} {counselor.lastName}'s account.
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700"
                disabled={clients.length > 0}
              >
                Delete Permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Award,
  Clock,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Target,
  FileText,
  ClipboardList,
  CreditCard,
  StickyNote
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
  clientStatus?: string;
  createdAt: string;
  generalGoal?: string;
  onboardingCompleted?: boolean;
  progress: {
    mealPlanCount: number;
    latestMealPlan?: {
      name: string;
      startDate: string;
      status: string;
    };
    appointmentCount: number;
    upcomingAppointment?: {
      dateTime: string;
      type: string;
    };
  };
}

interface AppointmentData {
  _id: string;
  client: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
  };
  scheduledAt: string;
  type: string;
  status: string;
  duration?: number;
  notes?: string;
}

interface PaymentData {
  _id: string;
  client: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  amount: number;
  currency: string;
  status: string;
  type: string;
  planName?: string;
  transactionId?: string;
  createdAt: string;
}

interface NoteData {
  _id: string;
  userId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
  };
  content: string;
  category: string;
  priority: string;
  isEscalation: boolean;
  createdAt: string;
}

interface TaskData {
  _id: string;
  client: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
  };
  title: string;
  taskType: string;
  status: string;
  priority: string;
  startDate: string;
  endDate?: string;
  description?: string;
}

interface MealPlanData {
  _id: string;
  clientId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
  };
  templateId?: {
    name: string;
  };
  name?: string;
  startDate: string;
  endDate?: string;
  status: string;
  createdAt: string;
}

interface Dietitian {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatar?: string;
  status: string;
  bio?: string;
  experience?: number;
  consultationFee?: number;
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
  totalMealPlans: number;
  totalPayments: number;
  completedPayments: number;
  pendingPayments: number;
  totalRevenue: number;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  overdueTasks: number;
}

export default function AdminDietitianDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dietitianId = params.dietitianId as string;

  const [dietitian, setDietitian] = useState<Dietitian | null>(null);
  const [clients, setClients] = useState<ClientProgress[]>([]);
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [payments, setPayments] = useState<PaymentData[]>([]);
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlanData[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Dietitian>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);

  useEffect(() => {
    if (dietitianId) {
      fetchDietitianDetails();
    }
  }, [dietitianId]);

  const fetchDietitianDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/dietitians/${dietitianId}`);
      if (!response.ok) throw new Error('Failed to fetch dietitian details');

      const data = await response.json();
      setDietitian(data.dietitian);
      setClients(data.clients || []);
      setAppointments(data.appointments || []);
      setPayments(data.payments || []);
      setNotes(data.notes || []);
      setTasks(data.tasks || []);
      setMealPlans(data.mealPlans || []);
      setStats(data.stats);
    } catch (error) {
      console.error('Error fetching dietitian:', error);
      toast.error('Failed to load dietitian details');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    if (dietitian) {
      setEditData({
        firstName: dietitian.firstName,
        lastName: dietitian.lastName,
        email: dietitian.email,
        phone: dietitian.phone,
        bio: dietitian.bio,
        experience: dietitian.experience,
        consultationFee: dietitian.consultationFee,
        specializations: dietitian.specializations,
        credentials: dietitian.credentials,
      });
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/admin/dietitians/${dietitianId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      });

      if (!response.ok) throw new Error('Failed to update dietitian');

      const data = await response.json();
      setDietitian(data.dietitian);
      setIsEditing(false);
      toast.success('Dietitian updated successfully');
    } catch (error) {
      console.error('Error updating dietitian:', error);
      toast.error('Failed to update dietitian');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      const response = await fetch(`/api/admin/dietitians/${dietitianId}?action=deactivate`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to deactivate dietitian');

      const data = await response.json();
      toast.success(data.message);
      if (data.warning) {
        toast.warning(data.warning);
      }
      router.push('/admin/dietitians');
    } catch (error) {
      console.error('Error deactivating dietitian:', error);
      toast.error('Failed to deactivate dietitian');
    }
    setDeactivateDialogOpen(false);
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/admin/dietitians/${dietitianId}?action=delete`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete dietitian');
      }

      toast.success('Dietitian deleted permanently');
      router.push('/admin/dietitians');
    } catch (error: any) {
      console.error('Error deleting dietitian:', error);
      toast.error(error.message || 'Failed to delete dietitian');
    }
    setDeleteDialogOpen(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'inactive': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
      case 'lead': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'suspended': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-800';
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

  if (!dietitian) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <AlertCircle className="h-16 w-16 text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-600">Dietitian not found</h2>
          <Button onClick={() => router.push('/admin/dietitians')} className="mt-4">
            Back to Dietitians
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
            <Button variant="ghost" onClick={() => router.push('/admin/dietitians')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Dietitian Profile</h1>
              <p className="text-gray-500">View and manage dietitian details</p>
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
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
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
                    <p className="text-xs text-gray-500">Appointments</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="text-2xl font-bold">{stats.totalMealPlans}</p>
                    <p className="text-xs text-gray-500">Meal Plans</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-indigo-500" />
                  <div>
                    <p className="text-2xl font-bold">{stats.totalTasks}</p>
                    <p className="text-xs text-gray-500">Total Tasks</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="text-2xl font-bold">{stats.overdueTasks}</p>
                    <p className="text-xs text-gray-500">Overdue Tasks</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-teal-500" />
                  <div>
                    <p className="text-2xl font-bold">{stats.completedPayments}</p>
                    <p className="text-xs text-gray-500">Payments</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-emerald-500" />
                  <div>
                    <p className="text-2xl font-bold">₹{stats.totalRevenue?.toLocaleString() || 0}</p>
                    <p className="text-xs text-gray-500">Revenue</p>
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
              <div className="shrink-0">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={dietitian.avatar} />
                  <AvatarFallback className="text-2xl bg-[#3AB1A0] text-white">
                    {dietitian.firstName?.[0]}{dietitian.lastName?.[0]}
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
                    <p className="font-medium">{dietitian.firstName} {dietitian.lastName}</p>
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
                    <p className="font-medium">{dietitian.email}</p>
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
                    <p className="font-medium">{dietitian.phone || 'Not provided'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-gray-500">Status</Label>
                  <Badge className={getStatusColor(dietitian.status)}>
                    {dietitian.status}
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
                    <p className="font-medium">{dietitian.experience ? `${dietitian.experience} years` : 'Not specified'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-gray-500">Consultation Fee</Label>
                  {isEditing ? (
                    <Input
                      type="number"
                      value={editData.consultationFee || ''}
                      onChange={e => setEditData({ ...editData, consultationFee: parseInt(e.target.value) })}
                      placeholder="Fee"
                    />
                  ) : (
                    <p className="font-medium">{dietitian.consultationFee ? `₹${dietitian.consultationFee}` : 'Not set'}</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="profile">
              <User className="h-4 w-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="clients">
              <Users className="h-4 w-4 mr-2" />
              Clients ({clients.length})
            </TabsTrigger>
            <TabsTrigger value="appointments">
              <Calendar className="h-4 w-4 mr-2" />
              Appointments ({appointments.length})
            </TabsTrigger>
            <TabsTrigger value="mealplans">
              <Target className="h-4 w-4 mr-2" />
              Meal Plans ({mealPlans.length})
            </TabsTrigger>
            <TabsTrigger value="tasks">
              <ClipboardList className="h-4 w-4 mr-2" />
              Tasks ({tasks.length})
            </TabsTrigger>
            <TabsTrigger value="notes">
              <StickyNote className="h-4 w-4 mr-2" />
              Notes ({notes.length})
            </TabsTrigger>
            <TabsTrigger value="payments">
              <CreditCard className="h-4 w-4 mr-2" />
              Payments ({payments.length})
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
                      <p className="text-sm">{dietitian.bio || 'No bio provided'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-gray-500">Specializations</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {dietitian.specializations?.length ? (
                        dietitian.specializations.map((spec, i) => (
                          <Badge key={i} variant="outline" className="bg-blue-50 text-blue-700">{spec}</Badge>
                        ))
                      ) : (
                        <span className="text-gray-400">None specified</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-500">Credentials</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {dietitian.credentials?.length ? (
                        dietitian.credentials.map((cred, i) => (
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
                  {dietitian.availability?.length ? (
                    <div className="space-y-2">
                      {dietitian.availability.map((slot, i) => (
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
                        <TableHead>Meal Plans</TableHead>
                        <TableHead>Appointments</TableHead>
                        <TableHead>Latest Plan</TableHead>
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
                          <TableCell>{client.progress.mealPlanCount}</TableCell>
                          <TableCell>{client.progress.appointmentCount}</TableCell>
                          <TableCell>
                            {client.progress.latestMealPlan ? (
                              <div>
                                <p className="text-sm font-medium">{client.progress.latestMealPlan.name}</p>
                                <p className="text-xs text-gray-500">
                                  {format(new Date(client.progress.latestMealPlan.startDate), 'MMM dd')}
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
                            <Badge className={getStatusColor(client.clientStatus || client.status)}>
                              {client.clientStatus || client.status}
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

          {/* Appointments Tab */}
          <TabsContent value="appointments">
            <Card>
              <CardHeader>
                <CardTitle>Appointments</CardTitle>
              </CardHeader>
              <CardContent>
                {appointments.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {appointments.map((appointment) => (
                        <TableRow key={appointment._id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={appointment.client?.avatar} />
                                <AvatarFallback className="text-xs">
                                  {appointment.client?.firstName?.[0]}{appointment.client?.lastName?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{appointment.client?.firstName} {appointment.client?.lastName}</p>
                                <p className="text-xs text-gray-500">{appointment.client?.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {format(new Date(appointment.scheduledAt), 'MMM dd, yyyy HH:mm')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{appointment.type}</Badge>
                          </TableCell>
                          <TableCell>{appointment.duration || 30} min</TableCell>
                          <TableCell>
                            <Badge className={
                              appointment.status === 'completed' ? 'bg-green-100 text-green-800' :
                                appointment.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                                  appointment.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                    'bg-gray-100 text-gray-800'
                            }>
                              {appointment.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>No appointments</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Meal Plans Tab */}
          <TabsContent value="mealplans">
            <Card>
              <CardHeader>
                <CardTitle>Meal Plans Created</CardTitle>
              </CardHeader>
              <CardContent>
                {mealPlans.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Plan Name</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>End Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mealPlans.map((plan) => (
                        <TableRow key={plan._id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={plan.clientId?.avatar} />
                                <AvatarFallback className="text-xs">
                                  {plan.clientId?.firstName?.[0]}{plan.clientId?.lastName?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{plan.clientId?.firstName} {plan.clientId?.lastName}</p>
                                <p className="text-xs text-gray-500">{plan.clientId?.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            {plan.templateId?.name || plan.name || 'Custom Plan'}
                          </TableCell>
                          <TableCell>
                            {format(new Date(plan.startDate), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell>
                            {plan.endDate ? format(new Date(plan.endDate), 'MMM dd, yyyy') : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge className={
                              plan.status === 'active' ? 'bg-green-100 text-green-800' :
                                plan.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-800'
                            }>
                              {plan.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-gray-500 text-sm">
                            {format(new Date(plan.createdAt), 'MMM dd, yyyy')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Target className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>No meal plans created</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tasks Tab */}
          <TabsContent value="tasks">
            <Card>
              <CardHeader>
                <CardTitle>Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                {tasks.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Task Type</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasks.map((task) => (
                        <TableRow key={task._id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={task.client?.avatar} />
                                <AvatarFallback className="text-xs">
                                  {task.client?.firstName?.[0]}{task.client?.lastName?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{task.client?.firstName} {task.client?.lastName}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{task.taskType}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{task.title}</TableCell>
                          <TableCell>
                            <span className={task.endDate && new Date(task.endDate) < new Date() && task.status !== 'completed' ? 'text-red-500' : ''}>
                              {task.endDate ? format(new Date(task.endDate), 'MMM dd, yyyy') : '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge className={
                              task.priority === 'high' ? 'bg-red-100 text-red-800' :
                                task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                            }>
                              {task.priority}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={
                              task.status === 'completed' ? 'bg-green-100 text-green-800' :
                                task.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                  task.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-gray-100 text-gray-800'
                            }>
                              {task.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <ClipboardList className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>No tasks</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes">
            <Card>
              <CardHeader>
                <CardTitle>Notes Created</CardTitle>
              </CardHeader>
              <CardContent>
                {notes.length ? (
                  <div className="space-y-4">
                    {notes.map((note) => (
                      <div key={note._id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={note.userId?.avatar} />
                              <AvatarFallback className="text-xs">
                                {note.userId?.firstName?.[0]}{note.userId?.lastName?.[0]}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">For: {note.userId?.firstName} {note.userId?.lastName}</p>
                              <p className="text-xs text-gray-500">{note.userId?.email}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Badge variant="outline">{note.category}</Badge>
                            {note.isEscalation && <Badge className="bg-red-100 text-red-800">Escalation</Badge>}
                            <Badge className={
                              note.priority === 'high' ? 'bg-red-100 text-red-800' :
                                note.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                            }>
                              {note.priority}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{note.content}</p>
                        <p className="text-xs text-gray-400 mt-2">
                          {format(new Date(note.createdAt), 'MMM dd, yyyy HH:mm')}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <StickyNote className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>No notes created</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments">
            <Card>
              <CardHeader>
                <CardTitle>Payments</CardTitle>
              </CardHeader>
              <CardContent>
                {payments.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Transaction ID</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => (
                        <TableRow key={payment._id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{payment.client?.firstName} {payment.client?.lastName}</p>
                              <p className="text-xs text-gray-500">{payment.client?.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>{payment.planName || '-'}</TableCell>
                          <TableCell className="font-medium">
                            {payment.currency} {payment.amount?.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{payment.type}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={
                              payment.status === 'completed' ? 'bg-green-100 text-green-800' :
                                payment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  payment.status === 'failed' ? 'bg-red-100 text-red-800' :
                                    'bg-gray-100 text-gray-800'
                            }>
                              {payment.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-gray-500">
                            {payment.transactionId || '-'}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {format(new Date(payment.createdAt), 'MMM dd, yyyy')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <CreditCard className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>No payments</p>
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
              <AlertDialogTitle>Deactivate Dietitian</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to deactivate {dietitian.firstName} {dietitian.lastName}?
                {clients.length > 0 && (
                  <span className="text-amber-600 block mt-2">
                    Warning: This dietitian has {clients.length} assigned clients.
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
              <AlertDialogTitle>Delete Dietitian Permanently</AlertDialogTitle>
              <AlertDialogDescription className="text-red-600">
                This action cannot be undone.
                {clients.length > 0 ? (
                  <span className="block mt-2">
                    Cannot delete: This dietitian has {clients.length} assigned clients.
                    Please reassign them first.
                  </span>
                ) : (
                  <span className="block mt-2">
                    This will permanently delete {dietitian.firstName} {dietitian.lastName}'s account.
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

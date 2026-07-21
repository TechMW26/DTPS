'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useRealtime } from '@/hooks/useRealtime';
import { useGoalCategories } from '@/hooks/useGoalCategories';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { ClientHoldStatus, HoldStatus } from '@/components/admin/ClientHoldStatus';
import {
  ArrowLeft,
  Edit2,
  Save,
  X,
  Trash2,
  UserX,
  FileText,
  CreditCard,
  Calendar,
  Activity,
  User,
  Phone,
  Mail,
  MapPin,
  Target,
  Scale,
  Ruler,
  Heart,
  AlertCircle,
  Download,
  Eye,
  Image as ImageIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { openMediaInApp } from '@/lib/media';

interface Document {
  _id: string;
  type: string;
  fileName: string;
  filePath: string;
  uploadedAt: string;
}

interface MealPlan {
  _id: string;
  templateId?: { name: string; category: string };
  assignedBy?: { firstName: string; lastName: string };
  startDate: string;
  endDate?: string;
  status: string;
  createdAt: string;
}

interface Payment {
  _id: string;
  // Plan details
  planName?: string;
  planCategory?: string;
  durationDays?: number;
  durationLabel?: string;
  // Pricing
  baseAmount?: number;
  discountPercent?: number;
  discountAmount?: number;
  taxPercent?: number;
  taxAmount?: number;
  finalAmount?: number;
  amount: number;
  currency: string;
  // Transaction
  transactionId?: string;
  paymentMethod?: string;
  paymentType?: string;
  // Razorpay
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayPaymentLinkUrl?: string;
  // Payer
  payerEmail?: string;
  payerPhone?: string;
  payerName?: string;
  // Card/Bank
  cardLast4?: string;
  cardNetwork?: string;
  bank?: string;
  wallet?: string;
  vpa?: string;
  // Status
  status: string;
  paymentStatus?: string;
  // Dates
  purchaseDate?: string;
  startDate?: string;
  endDate?: string;
  paidAt?: string;
  // Meal plan tracking
  mealPlanCreated?: boolean;
  daysUsed?: number;
  remainingDays?: number;
  // Notes
  description?: string;
  notes?: string;
  // Refs
  dietitian?: { _id: string; firstName: string; lastName: string; email: string };
  servicePlan?: { _id: string; name: string; category?: string; duration?: number };
  createdAt: string;
  updatedAt?: string;
}

interface Client {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatar?: string;
  status: string;
  clientStatus?: 'lead' | 'active' | 'inactive' | 'hold' | string;
  dateOfBirth?: string;
  gender?: string;
  height?: number;
  weight?: number;
  heightFeet?: string;
  heightInch?: string;
  heightCm?: string;
  weightKg?: string;
  targetWeightKg?: string;
  bmi?: string;
  bmiCategory?: string;
  activityLevel?: string;
  healthGoals?: string[];
  generalGoal?: string;
  medicalConditions?: string[];
  allergies?: string[];
  dietaryRestrictions?: string[];
  documents?: Document[];
  onboardingCompleted?: boolean;
  createdAt: string;
  assignedDietitian?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  assignedHealthCounselor?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  // Hold Status
  holdStatus?: {
    isOnHold: boolean;
    holdDate?: string;
    holdTime?: string;
    activatedDate?: string;
    activatedTime?: string;
    totalHoldDurationMs?: number;
    holdCount?: number;
    heldBy?: { _id: string; firstName: string; lastName: string };
    activatedBy?: { _id: string; firstName: string; lastName: string };
  };
  holdStatusHistory?: Array<{
    action: 'hold' | 'activate';
    performedByName: string;
    performedByRole: string;
    timestamp: string;
    reason?: string;
    holdDurationMs?: number;
  }>;
}

export default function AdminClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.clientId as string;
  const { categories: goalCategories } = useGoalCategories();

  const [client, setClient] = useState<Client | null>(null);
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Client>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);

  // Hold status state
  const [holdStatus, setHoldStatus] = useState<HoldStatus | null>(null);

  // Payment pagination & filter state
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  const paymentsPerPage = 10;

  // Filtered & paginated payments
  const filteredPayments = useMemo(() => {
    if (paymentStatusFilter === 'all') return payments;
    return payments.filter(p => p.status === paymentStatusFilter);
  }, [payments, paymentStatusFilter]);

  const totalPaymentPages = Math.max(1, Math.ceil(filteredPayments.length / paymentsPerPage));
  const paginatedPayments = useMemo(() => {
    const start = (paymentPage - 1) * paymentsPerPage;
    return filteredPayments.slice(start, start + paymentsPerPage);
  }, [filteredPayments, paymentPage, paymentsPerPage]);

  // Reset to page 1 when filter changes
  useEffect(() => { setPaymentPage(1); }, [paymentStatusFilter]);

  useEffect(() => {
    if (clientId) {
      fetchClientDetails();
    }
  }, [clientId]);

  // Quiet re-fetch for real-time updates (no loading spinner)
  const fetchClientDetailsQuiet = useCallback(async () => {
    if (!clientId) return;
    try {
      const response = await fetch(`/api/admin/clients/${clientId}`);
      if (!response.ok) return;
      const data = await response.json();
      setClient(data.client);
      setMealPlans(data.mealPlans || []);
      setPayments(data.payments || []);
    } catch {
      // Quiet fail for background refresh
    }
  }, [clientId]);

  // Real-time SSE: auto-refresh when payment status changes
  useRealtime({
    onMessage: (event) => {
      if (event.type === 'payment_updated' || event.type === 'payment_link_updated') {
        fetchClientDetailsQuiet();
      }
    },
  });

  const fetchClientDetails = async () => {
    try {
      setLoading(true);
      const [clientResponse, holdResponse] = await Promise.all([
        fetch(`/api/admin/clients/${clientId}`),
        fetch(`/api/admin/clients/${clientId}/hold`)
      ]);

      if (!clientResponse.ok) throw new Error('Failed to fetch client details');

      const data = await clientResponse.json();
      setClient(data.client);
      setMealPlans(data.mealPlans || []);
      setPayments(data.payments || []);

      // Set hold status
      if (holdResponse.ok) {
        const holdData = await holdResponse.json();
        setHoldStatus(holdData);
      }
    } catch (error) {
      console.error('Error fetching client:', error);
      toast.error('Failed to load client details');
    } finally {
      setLoading(false);
    }
  };

  const fetchHoldStatus = async () => {
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/hold`);
      if (response.ok) {
        const data = await response.json();
        setHoldStatus(data);
      }
    } catch (error) {
      console.error('Error fetching hold status:', error);
    }
  };

  const handleEdit = () => {
    if (client) {
      setEditData({
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phone: client.phone,
        dateOfBirth: client.dateOfBirth,
        gender: client.gender,
        heightCm: client.heightCm,
        weightKg: client.weightKg,
        targetWeightKg: client.targetWeightKg,
        activityLevel: client.activityLevel,
        generalGoal: client.generalGoal,
      });
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      });

      if (!response.ok) throw new Error('Failed to update client');

      const data = await response.json();
      setClient(data.client);
      setIsEditing(false);
      toast.success('Client updated successfully');
    } catch (error) {
      console.error('Error updating client:', error);
      toast.error('Failed to update client');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      const response = await fetch(`/api/admin/clients/${clientId}?action=deactivate`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to deactivate client');

      toast.success('Client deactivated successfully');
      router.push('/admin/allclients');
    } catch (error) {
      console.error('Error deactivating client:', error);
      toast.error('Failed to deactivate client');
    }
    setDeactivateDialogOpen(false);
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/admin/clients/${clientId}?action=delete`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete client');

      toast.success('Client deleted permanently');
      router.push('/admin/allclients');
    } catch (error) {
      console.error('Error deleting client:', error);
      toast.error('Failed to delete client');
    }
    setDeleteDialogOpen(false);
  };

  const handleDeleteDocument = async () => {
    if (!documentToDelete) return;

    try {
      const response = await fetch(
        `/api/admin/clients/${clientId}/documents?documentId=${documentToDelete._id}`,
        { method: 'DELETE' }
      );

      if (!response.ok) throw new Error('Failed to delete document');

      setClient(prev => prev ? {
        ...prev,
        documents: prev.documents?.filter(d => d._id !== documentToDelete._id)
      } : null);
      toast.success('Document deleted successfully');
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error('Failed to delete document');
    }
    setDocumentToDelete(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'inactive': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'hold': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'lead':
      case 'leading':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
      case 'suspended':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
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
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <AlertCircle className="h-16 w-16 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-600">Client not found</h2>
        <Button onClick={() => router.push('/admin/allclients')} className="mt-4">
          Back to Clients
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push('/admin/allclients')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Client Details</h1>
            <p className="text-gray-500">Manage client information and data</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={() => router.push(`/dietician/clients/${clientId}`)}
              >
                <Eye className="h-4 w-4 mr-2" />
                View Dashboard
              </Button>
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

      {/* Profile Card */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="shrink-0">
              <Avatar className="h-24 w-24">
                <AvatarImage src={client.avatar} />
                <AvatarFallback className="text-2xl bg-[#3AB1A0] text-white">
                  {client.firstName?.[0]}{client.lastName?.[0]}
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
                  <p className="font-medium">{client.firstName} {client.lastName}</p>
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
                  <p className="font-medium">{client.email}</p>
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
                  <p className="font-medium">{client.phone || 'Not provided'}</p>
                )}
              </div>
              <div>
                <Label className="text-gray-500">Status</Label>
                <Badge className={getStatusColor(client.clientStatus || 'lead')}>
                  {getStatusLabel(client.clientStatus)}
                </Badge>
              </div>
              <div>
                <Label className="text-gray-500">Hold Status</Label>
                <ClientHoldStatus
                  clientId={clientId}
                  clientName={`${client.firstName} ${client.lastName}`}
                  holdStatus={holdStatus || undefined}
                  onStatusChange={() => {
                    fetchHoldStatus();
                    fetchClientDetailsQuiet();
                  }}
                  compact={true}
                />
              </div>
              <div>
                <Label className="text-gray-500">Joined</Label>
                <p className="font-medium">{format(new Date(client.createdAt), 'MMM dd, yyyy')}</p>
              </div>
              <div>
                <Label className="text-gray-500">Assigned Dietitian</Label>
                <p className="font-medium">
                  {client.assignedDietitian
                    ? `${client.assignedDietitian.firstName} ${client.assignedDietitian.lastName}`
                    : 'Not assigned'}
                </p>
              </div>
              <div>
                <Label className="text-gray-500">Health Counselor</Label>
                <p className="font-medium">
                  {client.assignedHealthCounselor
                    ? `${client.assignedHealthCounselor.firstName} ${client.assignedHealthCounselor.lastName}`
                    : 'Not assigned'}
                </p>
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
          <TabsTrigger value="health">
            <Heart className="h-4 w-4 mr-2" />
            Health Info
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="h-4 w-4 mr-2" />
            Documents ({client.documents?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="plans">
            <Calendar className="h-4 w-4 mr-2" />
            Meal Plans ({mealPlans.length})
          </TabsTrigger>
          <TabsTrigger value="payments">
            <CreditCard className="h-4 w-4 mr-2" />
            Payments ({payments.length})
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <Label className="text-gray-500">Date of Birth</Label>
                {isEditing ? (
                  <Input
                    type="date"
                    value={editData.dateOfBirth?.split('T')[0] || ''}
                    onChange={e => setEditData({ ...editData, dateOfBirth: e.target.value })}
                  />
                ) : (
                  <p className="font-medium">
                    {client.dateOfBirth ? format(new Date(client.dateOfBirth), 'MMM dd, yyyy') : 'Not provided'}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-gray-500">Gender</Label>
                {isEditing ? (
                  <Select
                    value={editData.gender || ''}
                    onValueChange={v => setEditData({ ...editData, gender: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="font-medium capitalize">{client.gender || 'Not provided'}</p>
                )}
              </div>
              <div>
                <Label className="text-gray-500">Activity Level</Label>
                {isEditing ? (
                  <Select
                    value={editData.activityLevel || ''}
                    onValueChange={v => setEditData({ ...editData, activityLevel: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sedentary">Sedentary</SelectItem>
                      <SelectItem value="lightly_active">Lightly Active</SelectItem>
                      <SelectItem value="moderately_active">Moderately Active</SelectItem>
                      <SelectItem value="very_active">Very Active</SelectItem>
                      <SelectItem value="extremely_active">Extremely Active</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="font-medium capitalize">{client.activityLevel?.replace('_', ' ') || 'Not provided'}</p>
                )}
              </div>
              <div>
                <Label className="text-gray-500">Goal</Label>
                {isEditing ? (
                  <Select
                    value={editData.generalGoal || ''}
                    onValueChange={v => setEditData({ ...editData, generalGoal: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select goal" />
                    </SelectTrigger>
                    <SelectContent>
                      {goalCategories.map(goal => (
                        <SelectItem key={goal._id} value={goal.value}>
                          {goal.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="font-medium capitalize">{client.generalGoal?.replace('-', ' ') || 'Not specified'}</p>
                )}
              </div>
              <div>
                <Label className="text-gray-500">Onboarding Status</Label>
                <Badge variant={client.onboardingCompleted ? 'default' : 'secondary'}>
                  {client.onboardingCompleted ? 'Completed' : 'Incomplete'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Health Info Tab */}
        <TabsContent value="health">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scale className="h-5 w-5" />
                  Body Measurements
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-500">Height</Label>
                    {isEditing ? (
                      <Input
                        value={editData.heightCm || ''}
                        onChange={e => setEditData({ ...editData, heightCm: e.target.value })}
                        placeholder="Height in cm"
                      />
                    ) : (
                      <p className="font-medium">{client.heightCm ? `${client.heightCm} cm` : 'Not provided'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-gray-500">Weight</Label>
                    {isEditing ? (
                      <Input
                        value={editData.weightKg || ''}
                        onChange={e => setEditData({ ...editData, weightKg: e.target.value })}
                        placeholder="Weight in kg"
                      />
                    ) : (
                      <p className="font-medium">{client.weightKg ? `${client.weightKg} kg` : 'Not provided'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-gray-500">Target Weight</Label>
                    {isEditing ? (
                      <Input
                        value={editData.targetWeightKg || ''}
                        onChange={e => setEditData({ ...editData, targetWeightKg: e.target.value })}
                        placeholder="Target weight in kg"
                      />
                    ) : (
                      <p className="font-medium">{client.targetWeightKg ? `${client.targetWeightKg} kg` : 'Not set'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-gray-500">BMI</Label>
                    <p className="font-medium">
                      {client.bmi || 'N/A'}
                      {client.bmiCategory && <span className="text-gray-500 ml-1">({client.bmiCategory})</span>}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="h-5 w-5" />
                  Health Conditions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-gray-500">Medical Conditions</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {client.medicalConditions?.length ? (
                      client.medicalConditions.map((condition, i) => (
                        <Badge key={i} variant="outline">{condition}</Badge>
                      ))
                    ) : (
                      <span className="text-gray-400">None reported</span>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-gray-500">Allergies</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {client.allergies?.length ? (
                      client.allergies.map((allergy, i) => (
                        <Badge key={i} variant="outline" className="bg-red-50 text-red-700">{allergy}</Badge>
                      ))
                    ) : (
                      <span className="text-gray-400">None reported</span>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-gray-500">Dietary Restrictions</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {client.dietaryRestrictions?.length ? (
                      client.dietaryRestrictions.map((restriction, i) => (
                        <Badge key={i} variant="outline">{restriction}</Badge>
                      ))
                    ) : (
                      <span className="text-gray-400">None reported</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>Uploaded Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {client.documents?.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {client.documents.map((doc) => (
                    <div
                      key={doc._id}
                      className="border rounded-lg p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className="flex items-center gap-3">
                        {doc.type === 'meal-picture' ? (
                          <ImageIcon className="h-8 w-8 text-blue-500" />
                        ) : (
                          <FileText className="h-8 w-8 text-gray-500" />
                        )}
                        <div>
                          <p className="font-medium text-sm truncate max-w-37.5">{doc.fileName}</p>
                          <p className="text-xs text-gray-500">{doc.type}</p>
                          <p className="text-xs text-gray-400">
                            {format(new Date(doc.uploadedAt), 'MMM dd, yyyy')}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openMediaInApp(doc.filePath, doc.fileName)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => setDocumentToDelete(doc)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No documents uploaded</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Meal Plans Tab */}
        <TabsContent value="plans">
          <Card>
            <CardHeader>
              <CardTitle>Assigned Meal Plans</CardTitle>
            </CardHeader>
            <CardContent>
              {mealPlans.length ? (
                <div className="space-y-3">
                  {mealPlans.map((plan) => (
                    <div
                      key={plan._id}
                      className="border rounded-lg p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div>
                        <p className="font-medium">{plan.templateId?.name || 'Custom Plan'}</p>
                        <p className="text-sm text-gray-500">
                          {plan.templateId?.category && (
                            <Badge variant="outline" className="mr-2">{plan.templateId.category}</Badge>
                          )}
                          Started: {format(new Date(plan.startDate), 'MMM dd, yyyy')}
                        </p>
                        {plan.assignedBy && (
                          <p className="text-xs text-gray-400">
                            Assigned by: {plan.assignedBy.firstName} {plan.assignedBy.lastName}
                          </p>
                        )}
                      </div>
                      <Badge variant={plan.status === 'active' ? 'default' : 'secondary'}>
                        {plan.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No meal plans assigned</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <CardTitle>Payment History</CardTitle>
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Status filter */}
                  <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                    <SelectTrigger className="w-40 h-9">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                    </SelectContent>
                  </Select>
                  {payments.length > 0 && (
                    <Badge variant="outline" className="text-sm whitespace-nowrap">
                      {filteredPayments.length} of {payments.length} payment{payments.length !== 1 ? 's' : ''} · Total: ₹{filteredPayments.filter(p => p.status === 'completed' || p.status === 'paid').reduce((sum, p) => sum + (p.finalAmount || p.amount || 0), 0).toLocaleString()}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredPayments.length ? (
                <div className="space-y-4">
                  {paginatedPayments.map((payment) => (
                    <div
                      key={payment._id}
                      className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 space-y-3"
                    >
                      {/* Top row: Plan name, status, amount */}
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-base">
                            {payment.planName || payment.description || 'Payment'}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {payment.planCategory && (
                              <Badge variant="outline" className="text-xs capitalize">{payment.planCategory}</Badge>
                            )}
                            {payment.durationLabel && (
                              <span className="text-xs text-gray-500">{payment.durationLabel}{payment.durationDays ? ` (${payment.durationDays} days)` : ''}</span>
                            )}
                            {payment.paymentType && (
                              <Badge variant="outline" className="text-xs capitalize">{payment.paymentType.replace('_', ' ')}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg">₹{(payment.finalAmount || payment.amount || 0).toLocaleString()}</p>
                          <Badge
                            variant={payment.status === 'completed' || payment.status === 'paid' ? 'default' : payment.status === 'failed' || payment.status === 'cancelled' ? 'destructive' : 'secondary'}
                            className="mt-1"
                          >
                            {payment.status}
                          </Badge>
                        </div>
                      </div>

                      {/* Pricing breakdown */}
                      {(payment.baseAmount || payment.discountAmount || payment.taxAmount) && (
                        <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-sm">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {payment.baseAmount != null && (
                              <div>
                                <span className="text-gray-500">Base:</span>{' '}
                                <span className="font-medium">₹{payment.baseAmount.toLocaleString()}</span>
                              </div>
                            )}
                            {(payment.discountAmount != null && payment.discountAmount > 0) && (
                              <div>
                                <span className="text-gray-500">Discount:</span>{' '}
                                <span className="font-medium text-green-600">-₹{payment.discountAmount.toLocaleString()}{payment.discountPercent ? ` (${payment.discountPercent}%)` : ''}</span>
                              </div>
                            )}
                            {(payment.taxAmount != null && payment.taxAmount > 0) && (
                              <div>
                                <span className="text-gray-500">Tax:</span>{' '}
                                <span className="font-medium">+₹{payment.taxAmount.toLocaleString()}{payment.taxPercent ? ` (${payment.taxPercent}%)` : ''}</span>
                              </div>
                            )}
                            {payment.finalAmount != null && (
                              <div>
                                <span className="text-gray-500">Final:</span>{' '}
                                <span className="font-semibold">₹{payment.finalAmount.toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Transaction & Payment details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                        {payment.paymentMethod && (
                          <div><span className="text-gray-500">Method:</span> <span className="capitalize font-medium">{payment.paymentMethod}</span></div>
                        )}
                        {payment.transactionId && (
                          <div><span className="text-gray-500">Transaction ID:</span> <span className="font-mono text-xs">{payment.transactionId}</span></div>
                        )}
                        {payment.razorpayPaymentId && (
                          <div><span className="text-gray-500">Razorpay ID:</span> <span className="font-mono text-xs">{payment.razorpayPaymentId}</span></div>
                        )}
                        {payment.razorpayOrderId && (
                          <div><span className="text-gray-500">Order ID:</span> <span className="font-mono text-xs">{payment.razorpayOrderId}</span></div>
                        )}
                        {payment.cardLast4 && (
                          <div><span className="text-gray-500">Card:</span> <span className="font-medium">{payment.cardNetwork ? `${payment.cardNetwork} ` : ''}****{payment.cardLast4}</span></div>
                        )}
                        {payment.bank && (
                          <div><span className="text-gray-500">Bank:</span> <span className="font-medium">{payment.bank}</span></div>
                        )}
                        {payment.wallet && (
                          <div><span className="text-gray-500">Wallet:</span> <span className="font-medium">{payment.wallet}</span></div>
                        )}
                        {payment.vpa && (
                          <div><span className="text-gray-500">UPI:</span> <span className="font-medium">{payment.vpa}</span></div>
                        )}
                      </div>

                      {/* Payer info */}
                      {(payment.payerName || payment.payerEmail || payment.payerPhone) && (
                        <div className="text-sm flex flex-wrap gap-3">
                          {payment.payerName && (<span><span className="text-gray-500">Payer:</span> {payment.payerName}</span>)}
                          {payment.payerEmail && (<span><span className="text-gray-500">Email:</span> {payment.payerEmail}</span>)}
                          {payment.payerPhone && (<span><span className="text-gray-500">Phone:</span> {payment.payerPhone}</span>)}
                        </div>
                      )}

                      {/* Dates row */}
                      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                        <span>Created: {format(new Date(payment.createdAt), 'MMM dd, yyyy HH:mm')}</span>
                        {payment.paidAt && <span>Paid: {format(new Date(payment.paidAt), 'MMM dd, yyyy HH:mm')}</span>}
                        {payment.purchaseDate && <span>Purchase: {format(new Date(payment.purchaseDate), 'MMM dd, yyyy')}</span>}
                        {payment.startDate && <span>Start: {format(new Date(payment.startDate), 'MMM dd, yyyy')}</span>}
                        {payment.endDate && <span>End: {format(new Date(payment.endDate), 'MMM dd, yyyy')}</span>}
                      </div>

                      {/* Meal plan tracking & Dietitian */}
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {payment.mealPlanCreated != null && (
                          <Badge variant={payment.mealPlanCreated ? 'default' : 'secondary'} className="text-xs">
                            Meal Plan: {payment.mealPlanCreated ? 'Created' : 'Pending'}
                          </Badge>
                        )}
                        {payment.daysUsed != null && payment.daysUsed > 0 && (
                          <span className="text-gray-500">Days used: {payment.daysUsed}/{payment.durationDays || '-'}</span>
                        )}
                        {payment.remainingDays != null && payment.remainingDays > 0 && (
                          <span className="text-gray-500">Remaining: {payment.remainingDays} days</span>
                        )}
                        {payment.dietitian && (
                          <span className="text-gray-500">Dietitian: {payment.dietitian.firstName} {payment.dietitian.lastName}</span>
                        )}
                      </div>

                      {/* Notes */}
                      {(payment.notes || payment.description) && (
                        <div className="text-sm text-gray-600 dark:text-gray-400 border-t pt-2">
                          {payment.notes && <p><span className="text-gray-500">Notes:</span> {payment.notes}</p>}
                          {payment.description && payment.description !== payment.planName && <p><span className="text-gray-500">Description:</span> {payment.description}</p>}
                        </div>
                      )}

                      {/* Invoice button */}
                      {(payment.status === 'completed' || payment.status === 'paid') && (
                        <div className="flex justify-end border-t pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`/api/invoices/${payment._id}`, '_blank')}
                            className="h-8 text-xs"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download Invoice
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Pagination Controls */}
                  {totalPaymentPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t">
                      <p className="text-sm text-gray-500">
                        Showing {((paymentPage - 1) * paymentsPerPage) + 1}–{Math.min(paymentPage * paymentsPerPage, filteredPayments.length)} of {filteredPayments.length} payments
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPaymentPage(p => Math.max(1, p - 1))}
                          disabled={paymentPage === 1}
                        >
                          Previous
                        </Button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPaymentPages) }, (_, i) => {
                            let pageNum: number;
                            if (totalPaymentPages <= 5) {
                              pageNum = i + 1;
                            } else if (paymentPage <= 3) {
                              pageNum = i + 1;
                            } else if (paymentPage >= totalPaymentPages - 2) {
                              pageNum = totalPaymentPages - 4 + i;
                            } else {
                              pageNum = paymentPage - 2 + i;
                            }
                            return (
                              <Button
                                key={pageNum}
                                variant={paymentPage === pageNum ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setPaymentPage(pageNum)}
                                className="w-9 h-9"
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPaymentPage(p => Math.min(totalPaymentPages, p + 1))}
                          disabled={paymentPage === totalPaymentPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <CreditCard className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>{paymentStatusFilter !== 'all' ? `No ${paymentStatusFilter} payments found` : 'No payment records'}</p>
                  {paymentStatusFilter !== 'all' && (
                    <Button variant="link" size="sm" className="mt-2" onClick={() => setPaymentStatusFilter('all')}>
                      Show all payments
                    </Button>
                  )}
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
            <AlertDialogTitle>Deactivate Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate {client.firstName} {client.lastName}?
              They will no longer be able to access their account. You can reactivate them later.
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
            <AlertDialogTitle>Delete Client Permanently</AlertDialogTitle>
            <AlertDialogDescription className="text-red-600">
              This action cannot be undone. This will permanently delete {client.firstName} {client.lastName}'s
              account and all associated data including documents, meal plans, and payment records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Document Dialog */}
      <AlertDialog open={!!documentToDelete} onOpenChange={() => setDocumentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{documentToDelete?.fileName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDocument} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

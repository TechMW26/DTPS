'use client';

import { useState, useEffect, useRef, useCallback, MutableRefObject } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  Calendar,
  MapPin,
  Ruler,
  Weight,
  Target,
  Activity,
  AlertCircle,
  FileText,
  BookOpen,
  CreditCard,
  MessageSquare,
  Settings,
  Save,
  Trash2,
  UserX,
  StickyNote,
  X,
  Plus,
  Eye,
  EyeOff,
  Pencil,
  ChevronLeft,
  Mic,
  Square,
  Play,
  Pause
} from 'lucide-react';
import { Home, RefreshCw as RefreshIcon, ArrowLeft as BackArrow } from 'lucide-react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { logHistory, generateChangeDetails } from '@/lib/utils/history';
import { BasicInfoForm, type BasicInfoData } from '@/components/clients/BasicInfoForm';
import { ClientHoldStatus, HoldStatus } from '@/components/admin/ClientHoldStatus';
import { MedicalForm, type MedicalData } from '@/components/clients/MedicalForm';
import { LifestyleForm, type LifestyleData } from '@/components/clients/LifestyleForm';
import { useDataRefresh, DataEventTypes, emitDataChange } from '@/lib/events/useDataRefresh';
import { socketClient } from '@/lib/realtime/socket-client';
import { SOCKET_EVENTS } from '@/lib/realtime/socket-events';
import { RecallForm, type RecallEntry } from '@/components/clients/RecallForm';
import FormsSection from '@/components/clientDashboard/FormsSection';
import { JournalSection } from '@/components/journal';
import ProgressSection from '@/components/clientDashboard/ProgressSection';
import PlanningSection from '@/components/clientDashboard/PlanningSection';
// import PaymentsSection from '@/components/clientDashboard/PaymentsSection';
import BookingsSection from '@/components/clientDashboard/BookingsSection';
import PaymentsSection from '@/components/clientDashboard/PaymentsSection';
import DocumentsSection from '@/components/clientDashboard/DocumentsSection';
import HistorySection from '@/components/clientDashboard/HistorySection';
import TasksSection from '@/components/clientDashboard/TasksSection';
import ImageLightbox from '@/components/ui/image-lightbox';

interface ClientData {
  _id: string;
  clientId?: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
  phone?: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
  dateOfBirth?: string;
  gender?: string;
  height?: number;
  weight?: number;
  weightKg?: string;
  activityLevel?: string;
  healthGoals?: string[];
  medicalConditions?: string[];
  allergies?: string[];
  dietaryRestrictions?: string[];
  maritalStatus?: string;
  occupation?: string;
  source?: string;
  alternativePhone?: string;
  alternativeEmail?: string;
  anniversary?: string;
  // Hold status
  holdStatus?: {
    isOnHold: boolean;
    holdDate?: string;
    holdTime?: string;
    activatedDate?: string;
    activatedTime?: string;
    totalHoldDurationMs?: number;
    holdCount?: number;
  };
  assignedDietitian?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  assignedDietitians?: Array<{
    _id: string;
    firstName: string;
    lastName: string;
  }>;
  createdBy?: {
    userId?: {
      _id: string;
      firstName: string;
      lastName: string;
      role: string;
    };
    role: string;
  };
  assignedHealthCounselor?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  assignedHealthCounselors?: Array<{
    _id: string;
    firstName: string;
    lastName: string;
  }>;
  // Lifestyle fields
  sleepHours?: number | string;
  stressLevel?: string;
  smokingStatus?: string;
  alcoholConsumption?: string;
  waterIntake?: number | string;
  // Dietary recall fields
  breakfast?: string;
  midMorningSnack?: string;
  lunch?: string;
  eveningSnack?: string;
  dinner?: string;
  dietaryNotes?: string;
  // Diet plans
  dietPlans?: Array<{
    _id?: string;
    title: string;
    status: string;
    calories: string;
    type: string;
    notes: string;
    startDate: string;
    endDate: string;
    days: number;
    progress: string;
  }>;
}

interface ClientNote {
  _id?: string;
  topicType: string;
  date: string;
  content: string;
  showToClient: boolean;
  attachments?: Array<{
    type: 'image' | 'video' | 'audio';
    url: string;
    filename?: string;
    mimeType?: string;
    size?: number;
  }>;
  createdAt?: string;
  createdBy?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
}

function sortNotesByCreatedAt(notes: ClientNote[]) {
  return [...notes].sort(
    (a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime()
  );
}

const NOTE_TOPIC_TYPES = [
  'General',
  'Diet Plan',
  'Escalation',
  'Medical',
  'Progress',
  'Consultation',
  'Renewal',
  'Follow-up',
  'Feedback',
  'Other'
] as const;

// Task types
const TASK_TYPES = [
  'General Followup',
  'Habit Update',
  'Session Booking',
  'Sign Document',
  'Form Allotment',
  'Report Upload',
  'Diary Update',
  'Measurement Update',
  'BCA Update',
  'Progress Update'
] as const;

// Time options for task allotment
const TIME_OPTIONS = [
  '12:00 AM', '12:30 AM', '01:00 AM', '01:30 AM', '02:00 AM', '02:30 AM',
  '03:00 AM', '03:30 AM', '04:00 AM', '04:30 AM', '05:00 AM', '05:30 AM',
  '06:00 AM', '06:30 AM', '07:00 AM', '07:30 AM', '08:00 AM', '08:30 AM',
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM',
  '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM',
  '06:00 PM', '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM',
  '09:00 PM', '09:30 PM', '10:00 PM', '10:30 PM', '11:00 PM', '11:30 PM'
] as const;


interface ClientTask {
  _id?: string;
  taskType: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  allottedTime: string;
  repeatFrequency: number;
  notifyClientOnChat: boolean;
  notifyDieticianOnCompletion: string;
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  tags?: Array<{ _id: string; name: string; color: string; icon?: string }>;
  dietitian?: { _id: string; firstName: string; lastName: string; email: string };
  createdAt?: string;
}

interface ClientTag {
  _id: string;
  name: string;
  description?: string;
  color: string;
  icon?: string;
  createdAt?: string;
}

interface ClientWeightLogEntry {
  _id: string;
  weight: number;
  recordedAt: string;
}

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session?.user?.role || '').toString().toLowerCase().includes('admin');
  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingForm, setSavingForm] = useState(false);
  const [activeSection, setActiveSection] = useState('forms'); // Main section: forms, journal, progress, planning, payments, bookings, documents
  const [activeTab, setActiveTab] = useState('basic-details');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<ClientData>>({});

  // Hold status state
  const [holdStatus, setHoldStatus] = useState<HoldStatus | undefined>(undefined);


  // Notes panel state
  const [isNotesOpen, setIsNotesOpen] = useState(false);

  // Weight tracker visibility state
  const [showWeightTracker, setShowWeightTracker] = useState(false);

  // Reset-to-home callbacks for each section
  const resetCallbacksRef = useRef<Record<string, (() => void) | undefined>>({});
  const registerReset = useCallback((section: string, fn: () => void) => {
    resetCallbacksRef.current[section] = fn;
  }, []);
  const handleResetToHome = useCallback(() => {
    resetCallbacksRef.current[activeSection]?.();
  }, [activeSection]);
  const [clientNotes, setClientNotes] = useState<ClientNote[]>([]);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNote, setNewNote] = useState<ClientNote>({
    topicType: 'General',
    date: format(new Date(), 'yyyy-MM-dd'),
    content: '',
    showToClient: false,
    attachments: []
  });

  // Active plan/program state
  const [activePlan, setActivePlan] = useState<{
    name: string;
    startDate: string;
    endDate: string;
    originalEndDate?: string;
    duration: number;
    status: 'active' | 'inactive' | 'completed' | 'upcoming';
    isExtended?: boolean;
    isFrozen?: boolean;
    frozenDays?: number;
    extendedDays?: number;
    totalActivePlans?: number;
    expectedStartDate?: string;
    expectedEndDate?: string;
    hasMealPlan?: boolean;
  } | null>(null);
  const [showPlanDetails, setShowPlanDetails] = useState(false);

  // Tasks panel state
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const [clientTasks, setClientTasks] = useState<ClientTask[]>([]);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ClientTask | null>(null);
  const [newTask, setNewTask] = useState<ClientTask>({
    taskType: 'General Followup',
    title: '',
    description: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    allottedTime: '12:00 AM',
    repeatFrequency: 1,
    notifyClientOnChat: false,
    notifyDieticianOnCompletion: '',
    status: 'pending'
  });

  // Tags panel state
  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const [allTags, setAllTags] = useState<ClientTag[]>([]);
  const [clientTagIds, setClientTagIds] = useState<string[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);


  const [renewalStartDate, setRenewalStartDate] = useState('');
  const [renewalEndDate, setRenewalEndDate] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const getDietitianDisplayName = () => {
    // Check singular assignedDietitian first
    const assigned = client?.assignedDietitian;
    if (assigned?.firstName || assigned?.lastName) {
      return `${assigned?.firstName || ''} ${assigned?.lastName || ''}`.trim();
    }
    // Check plural assignedDietitians array
    const assignedArray = client?.assignedDietitians;
    if (assignedArray && assignedArray.length > 0) {
      const names = assignedArray
        .filter(d => d?.firstName || d?.lastName)
        .map(d => `${d?.firstName || ''} ${d?.lastName || ''}`.trim());
      if (names.length > 0) {
        return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
      }
    }
    // Fallback to createdBy dietitian
    const createdByDietitian = client?.createdBy?.role === 'dietitian' ? client?.createdBy?.userId : null;
    if (createdByDietitian?.firstName || createdByDietitian?.lastName) {
      return `${createdByDietitian?.firstName || ''} ${createdByDietitian?.lastName || ''}`.trim();
    }
    return 'Not Assigned';
  };

  const getHealthCounselorDisplayName = () => {
    // Check singular assignedHealthCounselor first
    const assigned = client?.assignedHealthCounselor;
    if (assigned?.firstName || assigned?.lastName) {
      return `${assigned?.firstName || ''} ${assigned?.lastName || ''}`.trim();
    }
    // Check plural assignedHealthCounselors array
    const assignedArray = client?.assignedHealthCounselors;
    if (assignedArray && assignedArray.length > 0) {
      const names = assignedArray
        .filter(hc => hc?.firstName || hc?.lastName)
        .map(hc => `${hc?.firstName || ''} ${hc?.lastName || ''}`.trim());
      if (names.length > 0) {
        return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
      }
    }
    return 'Not Assigned';
  };

  // Note detail/edit state
  const [selectedNote, setSelectedNote] = useState<ClientNote | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editNote, setEditNote] = useState<ClientNote>({
    topicType: 'General',
    date: '',
    content: '',
    showToClient: false,
    attachments: []
  });

  // Lightbox state for note attachments
  const [noteLightboxOpen, setNoteLightboxOpen] = useState(false);
  const [noteLightboxImage, setNoteLightboxImage] = useState('');

  const openNoteLightbox = (url: string) => {
    setNoteLightboxImage(url);
    setNoteLightboxOpen(true);
  };

  // Form component states
  const [basicInfo, setBasicInfo] = useState<BasicInfoData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    gender: '',
    parentAccount: '',
    altPhone: '',
    altEmails: '',
    anniversary: '',
    source: '',
    referralSource: '',
    generalGoal: '',
    maritalStatus: '',
    occupation: '',
    goalsList: [],
    targetWeightBucket: '',
    sharePhotoConsent: false,
    // Physical measurements (moved from Lifestyle)
    heightFeet: '',
    heightInch: '',
    heightCm: '',
    weightKg: '',
    targetWeightKg: '',
    idealWeightKg: '',
    bmi: '',
    activityLevel: ''
  });

  const [medicalData, setMedicalData] = useState<MedicalData>({
    medicalConditions: '',
    allergies: '',
    dietaryRestrictions: '',
    notes: '',
    diseaseHistory: [],
    medicalHistory: '',
    familyHistory: '',
    medication: '',
    bloodGroup: '',
    gutIssues: [],
    reports: [],
    isPregnant: false,
    // Female-specific fields
    isLactating: false,
    menstrualCycle: '',
    bloodFlow: ''
  });

  const [lifestyleData, setLifestyleData] = useState<LifestyleData>({
    foodPreference: '',
    preferredCuisine: [],
    allergiesFood: [],
    fastDays: [],
    nonVegExemptDays: [],
    foodLikes: '',
    foodDislikes: '',
    eatOutFrequency: '',
    smokingFrequency: '',
    alcoholFrequency: '',
    activityRate: '',
    cookingOil: [],
    monthlyOilConsumption: '',
    cookingSalt: '',
    carbonatedBeverageFrequency: '',
    cravingType: '',
    sleepPattern: '',
    stressLevel: ''
  });

  const [recallEntries, setRecallEntries] = useState<RecallEntry[]>([]);

  // Backend-computed client status (lead / active / inactive)
  const [clientComputedStatus, setClientComputedStatus] = useState<'lead' | 'active' | 'inactive' | 'hold'>('lead');
  const [currentWeightKg, setCurrentWeightKg] = useState<number | null>(null);
  const [firstWeightKg, setFirstWeightKg] = useState<number | null>(null);
  const [weightLog, setWeightLog] = useState<ClientWeightLogEntry[]>([]);

  const fetchWithRetry = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}, retries = 1) => {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(input, {
          ...init,
          signal: controller.signal,
          cache: init.cache || 'no-store',
        });
        window.clearTimeout(timeoutId);
        return response;
      } catch (error) {
        window.clearTimeout(timeoutId);
        lastError = error;
        if (attempt < retries) {
          await new Promise(resolve => window.setTimeout(resolve, 250 * (attempt + 1)));
          continue;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Request failed');
  }, []);

  // Fetch hold status
  const fetchHoldStatus = async () => {
    try {
      const response = await fetch(`/api/admin/clients/${params.clientId}/hold`, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        setHoldStatus(data);
        // Also update client object
        setClient(prev => prev ? {
          ...prev,
          holdStatus: {
            isOnHold: data.isOnHold,
            holdDate: data.holdDate,
            holdTime: data.holdTime,
            activatedDate: data.activatedDate,
            activatedTime: data.activatedTime,
            totalHoldDurationMs: data.totalHoldDurationMs,
            holdCount: data.holdCount
          }
        } : prev);
      }
    } catch (error) {
      console.error('Error fetching hold status:', error);
    }
  };

  useEffect(() => {
    if (params.clientId) {
      fetchClientDetails();
      fetchClientNotes();
      fetchClientTasks();
      fetchActivePlan();
      fetchCurrentWeightSummary();
      fetchClientWeightLog();
      fetchHoldStatus();
    }
  }, [params.clientId]);

  // Suppress Event-type unhandled rejections from resource load failures (broken images/media)
  // These are native browser Events, not real app errors, but Sentry captures them
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // If the rejection reason is a native Event (not an Error), it's a resource load failure
      if (event.reason instanceof Event && !(event.reason instanceof Error)) {
        event.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }, []);

  const handleAdminDeactivateClient = async () => {
    if (!isAdmin) {
      toast.error('Admin access required to deactivate clients');
      return;
    }
    const ok = window.confirm('Deactivate this client? They will not be able to login.');
    if (!ok) return;

    try {
      const res = await fetch(`/api/admin/clients/${params.clientId}?action=deactivate`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('Deactivate failed:', data);
        throw new Error(data.error || data.details || 'Failed to deactivate client');
      }

      toast.success('Client deactivated successfully');
      router.push('/admin/allclients');
    } catch (error: any) {
      console.error('Error deactivating client:', error);
      toast.error(error.message || 'Failed to deactivate client');
    }
  };

  const handleAdminDeleteClient = async () => {
    if (!isAdmin) {
      toast.error('Admin access required to delete clients');
      return;
    }
    const ok = window.confirm('Delete this client permanently? This action cannot be undone and will remove all their data.');
    if (!ok) return;

    try {
      const res = await fetch(`/api/admin/clients/${params.clientId}?action=delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('Delete failed:', data);
        throw new Error(data.error || data.details || 'Failed to delete client');
      }

      toast.success('Client deleted permanently');
      router.push('/admin/allclients');
    } catch (error: any) {
      console.error('Error deleting client:', error);
      toast.error(error.message || 'Failed to delete client');
    }
  };

  // Subscribe to data change events for automatic refresh of active plan
  useDataRefresh(
    [
      DataEventTypes.MEAL_PLAN_UPDATED,
      DataEventTypes.MEAL_PLAN_CREATED,
      DataEventTypes.MEAL_PLAN_DELETED,
      DataEventTypes.MEAL_PLAN_FROZEN,
      DataEventTypes.MEAL_PLAN_UNFROZEN,
      DataEventTypes.MEAL_PLAN_EXTENDED,
      DataEventTypes.MEAL_PLAN_PAUSED,
      DataEventTypes.MEAL_PLAN_RESUMED,
      DataEventTypes.CLIENT_UPDATED,
      DataEventTypes.BASIC_INFO_UPDATED,
      DataEventTypes.LIFESTYLE_INFO_UPDATED,
      DataEventTypes.MEDICAL_INFO_UPDATED,
      DataEventTypes.DIETARY_RECALL_UPDATED,
      DataEventTypes.FORM_DATA_UPDATED,
    ],
    () => {
      fetchActivePlan(); // Refresh active plan banner when data changes
      fetchClientDetails(true); // Silent refresh of client data
      fetchCurrentWeightSummary(true); // Refresh current/first weight summary
      fetchClientWeightLog(true); // Refresh full weight tracker block
    },
    [params.clientId]
  );

  useDataRefresh(
    DataEventTypes.NOTES_UPDATED,
    () => {
      fetchClientNotes();
    },
    [params.clientId]
  );

  // Realtime weight updates from client app -> staff dashboard
  useEffect(() => {
    if (!params.clientId) return;

    const unsubscribe = socketClient.on(SOCKET_EVENTS.CLIENT_WEIGHT_UPDATED, (payload: any) => {
      const incomingClientId = String(payload?.clientId || '');
      const pageClientId = String(params.clientId);
      if (!incomingClientId || incomingClientId !== pageClientId) return;

      const nextWeight = Number(payload?.weightKg);
      if (!Number.isFinite(nextWeight) || nextWeight <= 0) return;

      setCurrentWeightKg(nextWeight);
      fetchClientWeightLog(true).catch(() => { });

      // Update local page state instantly (current weight only)
      setClient(prev => prev ? ({
        ...prev,
        weight: nextWeight,
        weightKg: String(nextWeight)
      }) : prev);

      // Keep Basic Info form weight unchanged.
      // Realtime/progress updates should only affect tracker/current display, not baseline form values.
    });

    return () => {
      unsubscribe();
    };
  }, [params.clientId]);

  // Realtime fallback: keep weight fresh even if a socket event is missed
  useEffect(() => {
    if (!params.clientId) return;

    const refreshWeight = () => {
      fetchCurrentWeightSummary(true).catch(() => { });
      fetchClientWeightLog(true).catch(() => { });
    };

    const intervalId = window.setInterval(refreshWeight, 20000);
    const onFocus = () => refreshWeight();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshWeight();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [params.clientId]);

  const fetchClientWeightLog = async (silent = false) => {
    try {
      const response = await fetchWithRetry(`/api/progress?clientId=${params.clientId}&type=weight&limit=365&page=1`);
      if (!response.ok) return;

      const data = await response.json();
      const entriesRaw = Array.isArray(data?.progressEntries) ? data.progressEntries : [];

      const entries: ClientWeightLogEntry[] = entriesRaw
        .map((entry: any) => ({
          _id: String(entry?._id || ''),
          weight: Number(entry?.value),
          recordedAt: entry?.recordedAt || new Date().toISOString(),
          createdAt: entry?.createdAt || entry?.recordedAt || new Date().toISOString()
        }))
        .filter((entry: ClientWeightLogEntry) => Number.isFinite(entry.weight) && entry.weight > 0)
        .sort((a: ClientWeightLogEntry, b: ClientWeightLogEntry) => {
          const timeA = new Date(a.recordedAt).getTime();
          const timeB = new Date(b.recordedAt).getTime();
          if (timeB !== timeA) return timeB - timeA;
          // Tiebreaker: use createdAt for same timestamp
          const createdA = (a as any).createdAt ? new Date((a as any).createdAt).getTime() : timeA;
          const createdB = (b as any).createdAt ? new Date((b as any).createdAt).getTime() : timeB;
          return createdB - createdA;
        });

      setWeightLog(entries);

      if (entries.length > 0) {
        setCurrentWeightKg(entries[0].weight);

        // Keep first weight in sync with Basic Info baseline when available.
        // Only use oldest tracker weight as fallback when baseline is not set.
        const baselineWeight = Number(basicInfo?.weightKg || 0);
        if (!(Number.isFinite(baselineWeight) && baselineWeight > 0)) {
          setFirstWeightKg(entries[entries.length - 1].weight);
        }
      }
    } catch (error) {
      if (!silent) {
        console.error('Error fetching client weight log:', error);
      }
    }
  };

  // Fetch active plan data (from client-meal-plans and client-purchases)
  const fetchActivePlan = async () => {
    try {
      // First fetch purchase data to get expected dates
      let purchaseData: any = null;
      const purchaseRes = await fetchWithRetry(`/api/client-purchases/check?clientId=${params.clientId}`);
      if (purchaseRes.ok) {
        purchaseData = await purchaseRes.json();
        // Use backend-computed status as single source of truth
        if (purchaseData.clientStatus) {
          setClientComputedStatus(purchaseData.clientStatus as 'lead' | 'active' | 'inactive' | 'hold');
        }
      }

      // Fetch meal plans for this client
      const mealPlanRes = await fetchWithRetry(`/api/client-meal-plans?clientId=${params.clientId}`);
      if (mealPlanRes.ok) {
        const data = await mealPlanRes.json();
        // API returns { success: true, mealPlans: [...] }
        const mealPlans = data.mealPlans || [];

        // Get ALL active plans
        const activePlans = mealPlans
          .filter((p: any) => p.status === 'active')
          .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

        if (activePlans.length > 0) {
          const today = new Date();
          today.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison

          // Find the CURRENTLY RUNNING plan (today is between startDate and endDate)
          const currentlyRunningPlan = activePlans.find((plan: any) => {
            const planStart = new Date(plan.startDate);
            const planEnd = new Date(plan.endDate);
            planStart.setHours(0, 0, 0, 0);
            planEnd.setHours(23, 59, 59, 999);
            return today >= planStart && today <= planEnd;
          });

          // If a plan is currently running, show that specific plan
          if (currentlyRunningPlan) {
            const planOriginalDuration = currentlyRunningPlan.duration || 0;
            const planCurrentDuration = Math.ceil(
              (new Date(currentlyRunningPlan.endDate).getTime() - new Date(currentlyRunningPlan.startDate).getTime()) / (1000 * 60 * 60 * 24)
            ) + 1;

            // Get frozen days count from totalFreezeCount (more accurate) or count from meals
            const frozenDays = currentlyRunningPlan.totalFreezeCount ||
              currentlyRunningPlan.meals?.filter((m: any) => m.isFrozen)?.length || 0;

            // Calculate extended days (total extension = current duration - original duration)
            // This includes both manual extensions and freeze-related extensions
            const totalExtension = (planOriginalDuration > 0 && planCurrentDuration > planOriginalDuration)
              ? planCurrentDuration - planOriginalDuration
              : 0;

            // Extended days = total extension - frozen days (since frozen days are part of extension)
            const extendedDays = Math.max(0, totalExtension - frozenDays);

            // Calculate original end date (before any extensions or freezes)
            const originalEndDate = planOriginalDuration > 0 && totalExtension > 0
              ? new Date(new Date(currentlyRunningPlan.startDate).getTime() + (planOriginalDuration - 1) * 24 * 60 * 60 * 1000).toISOString()
              : undefined;

            setActivePlan({
              name: currentlyRunningPlan.name || 'Wellness Plan',
              startDate: currentlyRunningPlan.startDate,
              endDate: currentlyRunningPlan.endDate,
              originalEndDate: originalEndDate,
              duration: planOriginalDuration || planCurrentDuration,
              status: 'active',
              isExtended: extendedDays > 0,
              isFrozen: frozenDays > 0,
              frozenDays: frozenDays,
              extendedDays: extendedDays,
              totalActivePlans: activePlans.length,
              expectedStartDate: purchaseData?.expectedStartDate || undefined,
              expectedEndDate: purchaseData?.expectedEndDate || undefined,
              hasMealPlan: true
            });
            return;
          }

          // If no plan is running today, find upcoming or most recent plan
          // First check for upcoming plans
          const upcomingPlan = activePlans.find((plan: any) => {
            const planStart = new Date(plan.startDate);
            planStart.setHours(0, 0, 0, 0);
            return planStart > today;
          });

          if (upcomingPlan) {
            const planOriginalDuration = upcomingPlan.duration || 0;
            const planCurrentDuration = Math.ceil(
              (new Date(upcomingPlan.endDate).getTime() - new Date(upcomingPlan.startDate).getTime()) / (1000 * 60 * 60 * 24)
            ) + 1;

            setActivePlan({
              name: upcomingPlan.name || 'Wellness Plan',
              startDate: upcomingPlan.startDate,
              endDate: upcomingPlan.endDate,
              duration: planOriginalDuration || planCurrentDuration,
              status: 'upcoming',
              totalActivePlans: activePlans.length,
              expectedStartDate: purchaseData?.expectedStartDate || undefined,
              expectedEndDate: purchaseData?.expectedEndDate || undefined,
              hasMealPlan: true
            });
            return;
          }

          // Otherwise show the most recent expired plan
          const mostRecentPlan = activePlans[activePlans.length - 1];
          const planOriginalDuration = mostRecentPlan.duration || 0;
          const planCurrentDuration = Math.ceil(
            (new Date(mostRecentPlan.endDate).getTime() - new Date(mostRecentPlan.startDate).getTime()) / (1000 * 60 * 60 * 24)
          ) + 1;

          setActivePlan({
            name: mostRecentPlan.name || 'Wellness Plan',
            startDate: mostRecentPlan.startDate,
            endDate: mostRecentPlan.endDate,
            duration: planOriginalDuration || planCurrentDuration,
            status: 'completed',
            totalActivePlans: activePlans.length,
            expectedStartDate: purchaseData?.expectedStartDate || undefined,
            expectedEndDate: purchaseData?.expectedEndDate || undefined,
            hasMealPlan: true
          });
          return;
        }
      }

      // If no meal plan, check for purchases to determine if inactive
      if (purchaseData && purchaseData.hasPaidPlan) {
        setActivePlan({
          name: 'Wellness Plan',
          startDate: purchaseData.startDate || new Date().toISOString(),
          endDate: purchaseData.endDate || new Date().toISOString(),
          duration: purchaseData.totalDays || 0,
          status: 'active',
          expectedStartDate: purchaseData.expectedStartDate || undefined,
          expectedEndDate: purchaseData.expectedEndDate || undefined,
          hasMealPlan: false
        });
      } else {
        setActivePlan(null); // No active plan
      }
    } catch (error) {
      console.error('Error fetching active plan:', error);
      setActivePlan(null);
    }
  };

  // Fetch client notes
  const fetchClientNotes = async () => {
    try {
      const response = await fetchWithRetry(`/api/users/${params.clientId}/notes`);
      if (response.ok) {
        const data = await response.json();
        setClientNotes(sortNotesByCreatedAt(data?.notes || []));
      }
    } catch (error) {
      console.error('Error fetching notes:', error);
    }
  };

  // Save new note
  const handleSaveNote = async () => {
    if (!newNote.content.trim()) {
      toast.error('Please fill in notes content');
      return;
    }

    // Validate renewal dates if topic type is Renewal
    if (newNote.topicType === 'Renewal') {
      if (!renewalStartDate || !renewalEndDate) {
        toast.error('Please select both start and end dates for renewal');
        return;
      }
    }

    try {
      setSavingNote(true);

      // Prepare note data - include renewal dates in content if Renewal type
      const noteToSave = {
        ...newNote,
        date: newNote.topicType === 'Renewal' ? renewalStartDate : newNote.date,
        // Store renewal end date in a metadata field if needed, or append to content
        content: newNote.topicType === 'Renewal'
          ? `${newNote.content}\n\n[Renewal Period: ${format(new Date(renewalStartDate), 'MMM d, yyyy')} - ${format(new Date(renewalEndDate), 'MMM d, yyyy')}]`
          : newNote.content
      };

      const response = await fetchWithRetry(`/api/users/${params.clientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noteToSave)
      });

      if (response.ok) {
        const data = await response.json();
        const savedNote = data?.note as ClientNote | undefined;
        toast.success('Note saved successfully');
        if (savedNote) {
          setClientNotes(prev => sortNotesByCreatedAt([
            savedNote,
            ...prev.filter(note => note._id !== savedNote._id)
          ]));
        }
        setNewNote({
          topicType: 'General',
          date: format(new Date(), 'yyyy-MM-dd'),
          content: '',
          showToClient: false,
          attachments: []
        });
        setRenewalStartDate('');
        setRenewalEndDate('');
        setIsAddingNote(false);
        emitDataChange(DataEventTypes.NOTES_UPDATED, {
          clientId: params.clientId,
          noteId: savedNote?._id || null,
          action: 'created'
        });
      } else {
        toast.error('Failed to save note');
      }
    } catch (error) {
      console.error('Error saving note:', error);
      toast.error('Error saving note');
    } finally {
      setSavingNote(false);
    }
  };

  // Upload media attachment for notes
  const handleMediaUpload = async (file: File) => {
    try {
      setUploadingMedia(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'note-attachment');

      const response = await fetchWithRetry('/api/upload', {
        method: 'POST',
        body: formData
      });


      if (response.ok) {
        const data = await response.json();
        let mediaType: 'image' | 'video' | 'audio' = 'image';
        if (file.type.startsWith('video/')) mediaType = 'video';
        else if (file.type.startsWith('audio/')) mediaType = 'audio';

        const attachment = {
          type: mediaType,
          url: data.url,
          filename: file.name,
          mimeType: file.type,
          size: file.size
        };

        setNewNote(prev => ({
          ...prev,
          attachments: [...(prev.attachments || []), attachment]
        }));
        toast.success('Media uploaded successfully');
      } else {
        // Try to get error message from response
        let errorMsg = 'Failed to upload media';
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          // If JSON parsing fails, use default error
        }
        console.error('Upload error:', errorMsg);
        if (file.type.startsWith('audio/')) {
          toast.error(`Failed to upload audio: ${errorMsg}`);
        } else {
          toast.error(`Failed to upload media: ${errorMsg}`);
        }
      }
    } catch (error) {
      console.error('Error uploading media:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (file.type.startsWith('audio/')) {
        toast.error(`Failed to upload audio: ${errorMsg}`);
      } else {
        toast.error(`Error uploading media: ${errorMsg}`);
      }
    } finally {
      setUploadingMedia(false);
    }
  };

  // Remove attachment from new note
  const handleRemoveAttachment = (index: number) => {
    setNewNote(prev => ({
      ...prev,
      attachments: (prev.attachments || []).filter((_, i) => i !== index)
    }));
  };

  // Delete note
  const handleDeleteNote = async (noteId: string) => {
    try {
      const response = await fetchWithRetry(`/api/users/${params.clientId}/notes/${noteId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Note deleted');
        setClientNotes(prev => prev.filter(n => n._id !== noteId));
        if (selectedNote?._id === noteId) {
          setSelectedNote(null);
          setIsEditingNote(false);
        }
        emitDataChange(DataEventTypes.NOTES_UPDATED, {
          clientId: params.clientId,
          noteId,
          action: 'deleted'
        });
      } else {
        toast.error('Failed to delete note');
      }
    } catch (error) {
      console.error('Error deleting note:', error);
      toast.error('Error deleting note');
    }
  };

  // Toggle note visibility to client
  const handleToggleNoteVisibility = async (noteId: string, showToClient: boolean) => {
    try {
      const response = await fetchWithRetry(`/api/users/${params.clientId}/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showToClient })
      });

      if (response.ok) {
        const data = await response.json();
        const updatedNote = data?.note as ClientNote | undefined;
        if (updatedNote) {
          setClientNotes(prev => sortNotesByCreatedAt(prev.map(n =>
            n._id === noteId ? { ...n, ...updatedNote } : n
          )));
        } else {
          setClientNotes(prev => prev.map(n =>
            n._id === noteId ? { ...n, showToClient } : n
          ));
        }
        if (selectedNote && selectedNote._id === noteId) {
          setSelectedNote(prev => prev ? { ...prev, ...(updatedNote || { showToClient }) } : null);
        }
        emitDataChange(DataEventTypes.NOTES_UPDATED, {
          clientId: params.clientId,
          noteId,
          action: 'visibility'
        });
        toast.success(showToClient ? 'Note visible to client' : 'Note hidden from client');
      }
    } catch (error) {
      console.error('Error updating note:', error);
    }
  };

  // Open note detail view
  const handleOpenNoteDetail = (note: ClientNote) => {
    setSelectedNote(note);
    setEditNote({
      ...note,
      topicType: note.topicType || 'General',
      date: note.date ? format(new Date(note.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      attachments: note.attachments || []
    });
    setIsEditingNote(false);
  };

  // Close note detail view
  const handleCloseNoteDetail = () => {
    setSelectedNote(null);
    setIsEditingNote(false);
  };

  // Update note (only visibility toggle allowed now)
  const handleUpdateNote = async () => {
    if (!selectedNote?._id || !editNote.content.trim()) {
      toast.error('Please fill in notes content');
      return;
    }

    try {
      setSavingNote(true);
      const response = await fetchWithRetry(`/api/users/${params.clientId}/notes/${selectedNote._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicType: editNote.topicType,
          date: editNote.date,
          content: editNote.content,
          showToClient: editNote.showToClient
        })
      });

      if (response.ok) {
        const data = await response.json();
        const updatedNote = data?.note as ClientNote | undefined;
        toast.success('Note updated successfully');
        if (updatedNote) {
          setClientNotes(prev => sortNotesByCreatedAt(prev.map(n =>
            n._id === selectedNote._id ? { ...n, ...updatedNote } : n
          )));
          setSelectedNote(prev => prev ? { ...prev, ...updatedNote } : prev);
        } else {
          setClientNotes(prev => prev.map(n =>
            n._id === selectedNote._id ? { ...n, ...editNote } : n
          ));
          setSelectedNote({ ...selectedNote, ...editNote });
        }
        setIsEditingNote(false);
        emitDataChange(DataEventTypes.NOTES_UPDATED, {
          clientId: params.clientId,
          noteId: selectedNote._id,
          action: 'updated'
        });
      } else {
        toast.error('Failed to update note');
      }
    } catch (error) {
      console.error('Error updating note:', error);
      toast.error('Error updating note');
    } finally {
      setSavingNote(false);
    }
  };

  const fetchClientDetails = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await fetch(`/api/users/${params.clientId}`, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        setClient(data?.user);
        setFormData(data?.user);

        // Profile weightKg is the editable baseline "first weight" from Basic Info.
        // Current weight comes from the weight log (fetchClientWeightLog).
        const profileWeight = Number(data?.user?.weightKg ?? data?.user?.weight ?? 0);
        if (Number.isFinite(profileWeight) && profileWeight > 0) {
          setFirstWeightKg(profileWeight);
        }

        // Load client tags
        if (data?.user?.tags && Array.isArray(data.user.tags)) {
          const tagIds = data.user.tags.map((tag: any) =>
            typeof tag === 'string' ? tag : tag._id
          );
          setClientTagIds(tagIds);
        }

        // Fetch the form sections in parallel so slow networks do not serialize the wait.
        const [lifestyleResponse, medicalResponse, recallResponse] = await Promise.all([
          fetchWithRetry(`/api/users/${params.clientId}/lifestyle`),
          fetchWithRetry(`/api/users/${params.clientId}/medical`),
          fetchWithRetry(`/api/users/${params.clientId}/recall`),
        ]);

        let lifestyleInfo = null;
        if (lifestyleResponse.ok) {
          const lifestyleData = await lifestyleResponse.json();
          lifestyleInfo = lifestyleData?.lifestyleInfo;
        }

        // Populate form component states (with physical measurements from user or lifestyle)
        // Prefer LifestyleInfo for ft/in/cm because this is the current source of truth.
        const savedFt = parseFloat(lifestyleInfo?.heightFeet || data?.user?.heightFeet || '0') || 0;
        const savedInch = parseFloat(lifestyleInfo?.heightInch || data?.user?.heightInch || '0') || 0;
        const savedCmRaw = parseFloat(lifestyleInfo?.heightCm || data?.user?.height || data?.user?.heightCm || '0') || 0;
        // Guard against invalid legacy values (e.g., "5" stored as cm).
        const savedCm = savedCmRaw >= 50 && savedCmRaw <= 300 ? savedCmRaw : 0;

        // Validate ft/inch values - feet should be integer, inches should be 0-11
        const isValidFtInch = Number.isInteger(savedFt) && savedInch >= 0 && savedInch <= 11;

        // Height conversion on load - auto-fill missing fields
        let finalHeightFeet = '';
        let finalHeightInch = '';
        let finalHeightCm = '';

        if (savedCm > 0) {
          // Always derive ft/inch from cm for consistency
          const totalInches = savedCm / 2.54;
          const ft = Math.floor(totalInches / 12);
          const inch = Math.round(totalInches % 12);
          finalHeightFeet = ft > 0 ? String(ft) : '';
          finalHeightInch = inch >= 0 ? String(inch) : '';
          finalHeightCm = String(savedCm);
        } else if ((savedFt > 0 || savedInch > 0) && isValidFtInch) {
          // Convert valid ft+inch to cm
          const totalInches = (savedFt * 12) + savedInch;
          const cm = Math.round(totalInches * 2.54);
          finalHeightCm = cm > 0 ? String(cm) : '';
          finalHeightFeet = savedFt > 0 ? String(savedFt) : '';
          finalHeightInch = savedInch > 0 ? String(savedInch) : '';
        }
        // If all are 0/empty or invalid, keep all fields empty (no default 0)

        // Get weight value
        const savedWeight = parseFloat(data?.user?.weightKg || lifestyleInfo?.weightKg || data?.user?.weight || '0') || 0;
        const finalWeightKg = savedWeight > 0 ? String(savedWeight) : '';

        // Calculate BMI from final values
        const calculateBMI = (weightKgVal: string, heightCmVal: string): string => {
          const w = parseFloat(weightKgVal || '0');
          const h = parseFloat(heightCmVal || '0');
          if (!w || !h || h === 0) return '';
          const heightM = h / 100;
          const bmiVal = w / (heightM * heightM);
          return bmiVal.toFixed(1);
        };
        const calculatedBmi = calculateBMI(finalWeightKg, finalHeightCm);

        setBasicInfo({
          firstName: data?.user?.firstName || '',
          lastName: data?.user?.lastName || '',
          email: data?.user?.email || '',
          phone: data?.user?.phone || '',
          dateOfBirth: data?.user?.dateOfBirth || '',
          gender: data?.user?.gender || '',
          parentAccount: data?.user?.parentAccount || '',
          altPhone: data?.user?.alternativePhone || '',
          altEmails: data?.user?.alternativeEmail || '',
          anniversary: data?.user?.anniversary || '',
          source: data?.user?.source || '',
          referralSource: data?.user?.referralSource || '',
          generalGoal: data?.user?.generalGoal || 'not-specified',
          maritalStatus: data?.user?.maritalStatus || '',
          occupation: data?.user?.occupation || '',
          goalsList: data?.user?.healthGoals || [],
          targetWeightBucket: data?.user?.targetWeightBucket || '',
          sharePhotoConsent: data?.user?.sharePhotoConsent || false,
          // Physical measurements - use converted values
          heightFeet: finalHeightFeet,
          heightInch: finalHeightInch,
          heightCm: finalHeightCm,
          weightKg: finalWeightKg,
          targetWeightKg: data?.user?.targetWeightKg || lifestyleInfo?.targetWeightKg || '',
          idealWeightKg: data?.user?.idealWeightKg || lifestyleInfo?.idealWeightKg || '',
          bmi: calculatedBmi,
          activityLevel: data?.user?.activityLevel || lifestyleInfo?.activityLevel || ''
        });

        // Set lifestyle data (food preferences only)
        setLifestyleData({
          foodPreference: lifestyleInfo?.foodPreference || data?.user?.foodPreference || '',
          preferredCuisine: lifestyleInfo?.preferredCuisine || data?.user?.preferredCuisine || [],
          allergiesFood: lifestyleInfo?.allergiesFood || data?.user?.allergiesFood || [],
          fastDays: lifestyleInfo?.fastDays || data?.user?.fastDays || [],
          nonVegExemptDays: lifestyleInfo?.nonVegExemptDays || data?.user?.nonVegExemptDays || [],
          foodLikes: lifestyleInfo?.foodLikes || data?.user?.foodLikes || '',
          foodDislikes: lifestyleInfo?.foodDislikes || data?.user?.foodDislikes || '',
          eatOutFrequency: lifestyleInfo?.eatOutFrequency || data?.user?.eatOutFrequency || '',
          smokingFrequency: lifestyleInfo?.smokingFrequency || data?.user?.smokingStatus || data?.user?.smokingFrequency || '',
          alcoholFrequency: lifestyleInfo?.alcoholFrequency || data?.user?.alcoholConsumption || data?.user?.alcoholFrequency || '',
          activityRate: lifestyleInfo?.activityRate || data?.user?.activityRate || '',
          cookingOil: lifestyleInfo?.cookingOil || data?.user?.cookingOil || [],
          monthlyOilConsumption: lifestyleInfo?.monthlyOilConsumption || data?.user?.monthlyOilConsumption || '',
          cookingSalt: lifestyleInfo?.cookingSalt || data?.user?.cookingSalt || '',
          carbonatedBeverageFrequency: lifestyleInfo?.carbonatedBeverageFrequency || data?.user?.carbonatedBeverageFrequency || '',
          cravingType: lifestyleInfo?.cravingType || data?.user?.cravingType || '',
          sleepPattern: lifestyleInfo?.sleepPattern || data?.user?.sleepPattern || '',
          stressLevel: lifestyleInfo?.stressLevel || data?.user?.stressLevel || ''
        });

        let medicalInfo = null;
        if (medicalResponse.ok) {
          const medicalData = await medicalResponse.json();
          medicalInfo = medicalData?.medicalInfo;
        }

        // Get medical arrays for client state (for filtering recipes)
        const medicalConditionsArr = medicalInfo?.medicalConditions || data?.user?.medicalConditions || [];
        const allergiesArr = medicalInfo?.allergies || data?.user?.allergies || [];
        const dietaryRestrictionsArr = medicalInfo?.dietaryRestrictions || data?.user?.dietaryRestrictions || [];

        // Update client state with medical data so PlanningSection can filter recipes
        setClient({
          ...data?.user,
          medicalConditions: medicalConditionsArr,
          allergies: allergiesArr,
          dietaryRestrictions: dietaryRestrictionsArr
        });

        // Set medical data form state (prefer from separate API, fallback to user data)
        setMedicalData({
          medicalConditions: medicalConditionsArr?.join(', ') || '',
          allergies: allergiesArr?.join(', ') || '',
          dietaryRestrictions: dietaryRestrictionsArr?.join(', ') || '',
          notes: medicalInfo?.notes || data?.user?.notes || '',
          diseaseHistory: medicalInfo?.diseaseHistory || data?.user?.diseaseHistory || [],
          medicalHistory: medicalInfo?.medicalHistory || data?.user?.medicalHistory || '',
          familyHistory: medicalInfo?.familyHistory || data?.user?.familyHistory || '',
          medication: medicalInfo?.medication || data?.user?.medication || '',
          bloodGroup: medicalInfo?.bloodGroup || data?.user?.bloodGroup || '',
          gutIssues: medicalInfo?.gutIssues || data?.user?.gutIssues || [],
          reports: medicalInfo?.reports || data?.user?.reports || [],
          isPregnant: medicalInfo?.isPregnant || data?.user?.isPregnant || false,
          // Female-specific fields
          isLactating: medicalInfo?.isLactating || data?.user?.isLactating || false,
          menstrualCycle: medicalInfo?.menstrualCycle || data?.user?.menstrualCycle || '',
          bloodFlow: medicalInfo?.bloodFlow || data?.user?.bloodFlow || ''
        });

        if (recallResponse.ok) {
          const recallData = await recallResponse.json();
          // Use entries from API response (already formatted with id)
          const loadedEntries = recallData?.entries || [];
          if (loadedEntries.length > 0) {
            setRecallEntries(loadedEntries);
          }
        } else {
          // Fallback to embedded data if API fails (for backward compatibility)
          setRecallEntries(data?.user?.dietaryRecall || []);
        }

      } else {
        toast.error('Failed to fetch client details');
      }
    } catch (error) {
      console.error('Error fetching client details:', error);
      if (!silent) toast.error('Error loading client data');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchCurrentWeightSummary = async (silent = false) => {
    try {
      // Current weight comes from weight log (most recent entry)
      // Profile weightKg is the first/baseline weight, NOT current weight
      // Fetch from progress API to get the most recent weight entry
      const response = await fetch(`/api/progress?clientId=${params.clientId}&type=weight&limit=1&page=1`, {
        cache: 'no-store'
      });
      if (response.ok) {
        const data = await response.json();
        const entries = Array.isArray(data?.progressEntries) ? data.progressEntries : [];
        if (entries.length > 0) {
          const latestWeight = Number(entries[0]?.value);
          if (Number.isFinite(latestWeight) && latestWeight > 0) {
            setCurrentWeightKg(latestWeight);
            return;
          }
        }
      }

      // Fallback: journal progress summary
      const journalResponse = await fetch(`/api/journal/progress?clientId=${params.clientId}`, { cache: 'no-store' });
      if (!journalResponse.ok) return;

      const journalData = await journalResponse.json();
      if (!journalData?.success) return;

      const current = Number(journalData?.summary?.currentlyAt?.weight);

      if (Number.isFinite(current) && current > 0) {
        setCurrentWeightKg(current);
      }
    } catch (error) {
      if (!silent) {
        console.error('Error fetching weight summary:', error);
      }
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async (): Promise<boolean> => {
    try {
      setSavingForm(true);
      const failedSections: string[] = [];
      // 1. Save basic user data (now includes physical measurements)
      const basicUserData = {
        firstName: basicInfo?.firstName,
        lastName: basicInfo?.lastName,
        email: basicInfo?.email,
        phone: basicInfo?.phone,
        dateOfBirth: basicInfo?.dateOfBirth,
        gender: basicInfo?.gender,
        parentAccount: basicInfo?.parentAccount,
        alternativePhone: basicInfo?.altPhone,
        alternativeEmail: basicInfo?.altEmails,
        anniversary: basicInfo?.anniversary,
        source: basicInfo?.source,
        referralSource: basicInfo?.referralSource,
        maritalStatus: basicInfo?.maritalStatus,
        occupation: basicInfo?.occupation,
        targetWeightBucket: basicInfo?.targetWeightBucket,
        sharePhotoConsent: basicInfo?.sharePhotoConsent,
        generalGoal: basicInfo?.generalGoal,
        healthGoals: basicInfo?.goalsList,
        // Physical measurements - send both weight and weightKg for API to handle first weight logic
        height: parseFloat(basicInfo?.heightCm as string) || undefined,
        weight: parseFloat(basicInfo?.weightKg as string) || undefined,
        heightFeet: basicInfo?.heightFeet || undefined,
        heightInch: basicInfo?.heightInch || undefined,
        heightCm: basicInfo?.heightCm || undefined,
        weightKg: basicInfo?.weightKg || undefined, // Important: API uses this for first weight updates
      };

      const basicRequest = fetchWithRetry(`/api/users/${params.clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basicUserData)
      });

      // 2. Save lifestyle data to separate endpoint (food preferences only)
      const lifestylePayload = {
        // Measurements (stored in LifestyleInfo)
        heightFeet: basicInfo?.heightFeet,
        heightInch: basicInfo?.heightInch,
        heightCm: basicInfo?.heightCm,
        weightKg: basicInfo?.weightKg,
        targetWeightKg: basicInfo?.targetWeightKg,
        idealWeightKg: basicInfo?.idealWeightKg,
        bmi: basicInfo?.bmi,
        activityLevel: basicInfo?.activityLevel,
        // Lifestyle data
        activityRate: lifestyleData?.activityRate,
        foodPreference: lifestyleData?.foodPreference,
        preferredCuisine: lifestyleData?.preferredCuisine,
        allergiesFood: lifestyleData?.allergiesFood,
        fastDays: lifestyleData?.fastDays,
        nonVegExemptDays: lifestyleData?.nonVegExemptDays,
        foodLikes: lifestyleData?.foodLikes,
        foodDislikes: lifestyleData?.foodDislikes,
        eatOutFrequency: lifestyleData?.eatOutFrequency,
        smokingFrequency: lifestyleData?.smokingFrequency,
        alcoholFrequency: lifestyleData?.alcoholFrequency,
        cookingOil: lifestyleData?.cookingOil,
        monthlyOilConsumption: lifestyleData?.monthlyOilConsumption,
        cookingSalt: lifestyleData?.cookingSalt,
        carbonatedBeverageFrequency: lifestyleData?.carbonatedBeverageFrequency,
        cravingType: lifestyleData?.cravingType,
        sleepPattern: lifestyleData?.sleepPattern,
        stressLevel: lifestyleData?.stressLevel,
      };

      const lifestyleRequest = fetchWithRetry(`/api/users/${params.clientId}/lifestyle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lifestylePayload)
      });


      // 3. Save medical data to separate endpoint
      const medicalPayload = {
        medicalConditions: medicalData.medicalConditions.split(',').map(s => s.trim()).filter(Boolean),
        allergies: medicalData.allergies.split(',').map(s => s.trim()).filter(Boolean),
        dietaryRestrictions: medicalData.dietaryRestrictions.split(',').map(s => s.trim()).filter(Boolean),
        notes: medicalData?.notes,
        diseaseHistory: medicalData?.diseaseHistory,
        medicalHistory: medicalData?.medicalHistory,
        familyHistory: medicalData?.familyHistory,
        medication: medicalData?.medication,
        bloodGroup: medicalData?.bloodGroup,
        gutIssues: medicalData?.gutIssues,
        reports: medicalData?.reports,
        isPregnant: medicalData?.isPregnant,
        // Female-specific fields
        isLactating: medicalData?.isLactating,
        menstrualCycle: medicalData?.menstrualCycle,
        bloodFlow: medicalData?.bloodFlow,
      };

      const medicalRequest = fetchWithRetry(`/api/users/${params.clientId}/medical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(medicalPayload)
      });


      // 4. Save dietary recall entries separately
      if (recallEntries && recallEntries.length > 0) {
        // Map entries to meals format for API
        const mealsToSave = recallEntries.map(entry => ({
          mealType: entry.mealType,
          hour: entry.hour,
          minute: entry.minute,
          meridian: entry.meridian,
          food: entry.food,

        }));

        const recallRequest = fetchWithRetry(`/api/users/${params.clientId}/recall`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meals: mealsToSave })
        });

        const [basicResponse, lifestyleResponse, medicalResponse, recallResponse] = await Promise.allSettled([
          basicRequest,
          lifestyleRequest,
          medicalRequest,
          recallRequest,
        ]);

        if (basicResponse.status === 'fulfilled') {
          if (!basicResponse.value.ok) {
            const errorData = await basicResponse.value.json().catch(() => ({}));
            console.error('Failed to update basic info:', basicResponse.value.status, errorData);
            failedSections.push('Basic Details');
          }
        } else {
          console.error('Failed to update basic info:', basicResponse.reason);
          failedSections.push('Basic Details');
        }

        if (lifestyleResponse.status === 'fulfilled') {
          if (!lifestyleResponse.value.ok) {
            const lifestyleError = await lifestyleResponse.value.json().catch(() => ({}));
            console.error('Failed to save lifestyle data:', lifestyleError);
            failedSections.push('Lifestyle');
          }
        } else {
          console.error('Failed to save lifestyle data:', lifestyleResponse.reason);
          failedSections.push('Lifestyle');
        }

        if (medicalResponse.status === 'fulfilled') {
          if (!medicalResponse.value.ok) {
            const medicalError = await medicalResponse.value.json().catch(() => ({}));
            console.error('Failed to save medical data:', medicalError);
            failedSections.push('Medical');
          } else {
            // Immediately update client state with new medical data so PlanningSection has latest data
            setClient(prev => prev ? ({
              ...prev,
              medicalConditions: medicalPayload.medicalConditions,
              allergies: medicalPayload.allergies,
              dietaryRestrictions: medicalPayload.dietaryRestrictions
            } as ClientData) : null);
          }
        } else {
          console.error('Failed to save medical data:', medicalResponse.reason);
          failedSections.push('Medical');
        }

        if (recallResponse.status === 'fulfilled') {
          if (!recallResponse.value.ok) {
            const recallError = await recallResponse.value.json().catch(() => ({}));
            console.error('Failed to save dietary recall entries:', recallError);
            failedSections.push('Recall');
          }
        } else {
          console.error('Failed to save dietary recall entries:', recallResponse.reason);
          failedSections.push('Recall');
        }

      } else {
        const [basicResponse, lifestyleResponse, medicalResponse] = await Promise.allSettled([
          basicRequest,
          fetchWithRetry(`/api/users/${params.clientId}/lifestyle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lifestylePayload)
          }),
          fetchWithRetry(`/api/users/${params.clientId}/medical`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(medicalPayload)
          })
        ]);

        if (basicResponse.status === 'fulfilled') {
          if (!basicResponse.value.ok) {
            const errorData = await basicResponse.value.json().catch(() => ({}));
            console.error('Failed to update basic info:', basicResponse.value.status, errorData);
            failedSections.push('Basic Details');
          }
        } else {
          console.error('Failed to update basic info:', basicResponse.reason);
          failedSections.push('Basic Details');
        }

        if (lifestyleResponse.status === 'fulfilled') {
          if (!lifestyleResponse.value.ok) {
            const lifestyleError = await lifestyleResponse.value.json().catch(() => ({}));
            console.error('Failed to save lifestyle data:', lifestyleError);
            failedSections.push('Lifestyle');
          }
        } else {
          console.error('Failed to save lifestyle data:', lifestyleResponse.reason);
          failedSections.push('Lifestyle');
        }

        if (medicalResponse.status === 'fulfilled') {
          if (!medicalResponse.value.ok) {
            const medicalError = await medicalResponse.value.json().catch(() => ({}));
            console.error('Failed to save medical data:', medicalError);
            failedSections.push('Medical');
          } else {
            setClient(prev => prev ? ({
              ...prev,
              medicalConditions: medicalPayload.medicalConditions,
              allergies: medicalPayload.allergies,
              dietaryRestrictions: medicalPayload.dietaryRestrictions
            } as ClientData) : null);
          }
        } else {
          console.error('Failed to save medical data:', medicalResponse.reason);
          failedSections.push('Medical');
        }
      }

      if (failedSections.length > 0) {
        toast.error(`Could not save: ${failedSections.join(', ')}. Please fix and try again.`);
        return false;
      }

      // Log history for profile update
      await logHistory({
        userId: params.clientId as string,
        action: 'update',
        category: 'profile',
        description: 'Client profile, medical, and lifestyle information updated',
        changeDetails: generateChangeDetails(
          {
            firstName: client?.firstName,
            lastName: client?.lastName,
            email: client?.email,
            phone: client?.phone,
            medicalConditions: client?.medicalConditions,
            allergies: client?.allergies,
          },
          {
            firstName: basicInfo?.firstName,
            lastName: basicInfo?.lastName,
            email: basicInfo?.email,
            phone: basicInfo?.phone,
            medicalConditions: medicalData.medicalConditions,
            allergies: medicalData.allergies,
          }
        ),
      });

      toast.success('Client details updated successfully');

      // Reflect updated baseline first weight immediately in the header cards.
      const updatedBaselineWeight = Number(basicInfo?.weightKg || 0);
      if (Number.isFinite(updatedBaselineWeight) && updatedBaselineWeight > 0) {
        setFirstWeightKg(updatedBaselineWeight);
      }

      // Refresh data first, then emit so other components see consistent state
      await fetchClientDetails(true);
      emitDataChange(DataEventTypes.FORM_DATA_UPDATED, {
        clientId: params.clientId,
        updatedFields: ['basic', 'lifestyle', 'medical', 'recall']
      });
      setIsEditing(false);
      return true;
    } catch (error) {
      console.error('Error updating client:', error);
      toast.error('Error updating client');
      return false;
    } finally {
      setSavingForm(false);
    }
  };

  // Save individual dietary recall entry
  const handleSaveRecallEntry = async (entry: RecallEntry) => {
    try {
      // Always save all entries to maintain consistency
      // Update the entry in the local state first
      const updatedEntries = recallEntries.map(e =>
        e.id === entry.id ? entry : e
      );

      // Map entries to meals format for API
      const mealsToSave = updatedEntries.map(e => ({
        mealType: e.mealType,
        hour: e.hour,
        minute: e.minute,
        meridian: e.meridian,
        food: e.food,

      }));

      const response = await fetch(`/api/users/${params.clientId}/recall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meals: mealsToSave })
      });

      if (response.ok) {
        // Log history for dietary recall update
        await logHistory({
          userId: params.clientId as string,
          action: 'update',
          category: 'diet',
          description: `Dietary recall updated for ${entry.mealType}`,
          metadata: {
            mealType: entry.mealType,
            food: entry.food,

          },
        });

        toast.success('Dietary recall entry saved successfully');
        fetchClientDetails();
      } else {
        toast.error('Failed to save entry');
      }
    } catch (error) {
      console.error('Error saving dietary recall entry:', error);
      toast.error('Error saving entry');
    }
  };

  // Delete individual dietary recall entry
  const handleDeleteRecallEntry = async (entryId: string) => {
    try {
      const response = await fetch(`/api/users/${params.clientId}/recall/${entryId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        const deletedEntry = recallEntries.find(e => e._id === entryId);

        // Log history for deletion
        await logHistory({
          userId: params.clientId as string,
          action: 'delete',
          category: 'diet',
          description: `Dietary recall entry deleted for ${deletedEntry?.mealType || 'meal'}`,
          metadata: {
            mealType: deletedEntry?.mealType,
            food: deletedEntry?.food,
          },
        });

        toast.success('Dietary recall entry deleted successfully');
        // Update local state to remove the deleted entry
        setRecallEntries(prev => prev.filter(e => e._id !== entryId));
      } else {
        toast.error('Failed to delete entry');
      }
    } catch (error) {
      console.error('Error deleting dietary recall entry:', error);
      toast.error('Error deleting entry');
    }
  };

  const calculateAge = (dateOfBirth: string | undefined) => {
    if (!dateOfBirth) return null;
    try {
      const today = new Date();
      const birthDate = new Date(dateOfBirth);
      let age = today.getFullYear() - birthDate?.getFullYear();
      const monthDiff = today.getMonth() - birthDate?.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today?.getDate() < birthDate?.getDate())) {
        age--;
      }
      return age;
    } catch (error) {
      return null;
    }
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date?.getTime())) return 'N/A';
      return format(date, 'MMM d, yyyy');
    } catch (error) {
      return 'N/A';
    }
  };

  // Format last seen with relative time
  const formatLastSeen = (dateString: string | undefined) => {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      if (isNaN(date?.getTime())) return 'Never';

      const now = new Date();
      const diffInMs = now.getTime() - date.getTime();
      const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
      const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

      if (diffInMinutes < 1) return 'Just now';
      if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
      if (diffInHours < 24) return `${diffInHours}h ago`;
      if (diffInDays < 7) return `${diffInDays}d ago`;

      return format(date, 'MMM d, yyyy');
    } catch (error) {
      return 'Never';
    }
  };

  const displayCurrentWeight = (() => {
    // Current weight should prefer weight log (most recent entry).
    // This avoids transient/stale summary values overriding tracker truth.
    if (weightLog.length > 0) {
      const latest = weightLog[0]; // weightLog is sorted newest first
      if (Number.isFinite(latest.weight) && latest.weight > 0) return latest.weight;
    }
    // Fallback to cached summary state.
    if (currentWeightKg && Number.isFinite(currentWeightKg) && currentWeightKg > 0) return currentWeightKg;
    return null;
  })();

  const displayFirstWeight = (() => {
    // First weight should always prefer Basic Info baseline (editable by staff).
    const basicWeight = parseFloat(String(basicInfo?.weightKg || ''));
    if (Number.isFinite(basicWeight) && basicWeight > 0) return basicWeight;

    // Fallbacks: stored baseline state, then oldest tracker entry
    if (firstWeightKg && Number.isFinite(firstWeightKg) && firstWeightKg > 0) return firstWeightKg;
    if (weightLog.length > 0) {
      const oldest = weightLog[weightLog.length - 1];
      if (Number.isFinite(oldest.weight) && oldest.weight > 0) return oldest.weight;
    }
    return null;
  })();

  const weightDelta = (() => {
    if (!displayCurrentWeight || !displayFirstWeight) return null;
    return Number((displayCurrentWeight - displayFirstWeight).toFixed(1));
  })();

  const isFirstWeightLocked = (() => {
    return !!(displayFirstWeight && Number.isFinite(displayFirstWeight) && displayFirstWeight > 0);
  })();

  const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);

  // Fetch client tasks
  const fetchClientTasks = async () => {
    try {
      const response = await fetch(`/api/users/${params.clientId}/tasks`);
      if (response.ok) {
        const data = await response.json();
        setClientTasks(data?.tasks || []);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  // Save new task
  const handleSaveTask = async () => {
    if (!newTask.taskType || !newTask.startDate || !newTask.endDate) {
      toast.error('Please fill in task type, start date and end date');
      return;
    }

    try {
      setSavingTask(true);
      const response = await fetch(`/api/users/${params.clientId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newTask,
          title: newTask.title || newTask.taskType
        })
      });

      if (response.ok) {
        const data = await response.json();
        toast.success('Task created successfully');
        setNewTask({
          taskType: 'General Followup',
          title: '',
          description: '',
          startDate: format(new Date(), 'yyyy-MM-dd'),
          endDate: format(new Date(), 'yyyy-MM-dd'),
          allottedTime: '12:00 AM',
          repeatFrequency: 1,
          notifyClientOnChat: false,
          notifyDieticianOnCompletion: '',
          status: 'pending'
        });
        setIsAddingTask(false);
        fetchClientTasks();
      } else {
        let errorMsg = 'Failed to create task';
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
          console.error('Task creation error:', errorData);
        } catch {
          // JSON parsing failed
        }
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error(error instanceof Error ? error.message : 'Error creating task');
    } finally {
      setSavingTask(false);
    }
  };

  // Delete task
  const handleDeleteTask = async (taskId: string) => {
    try {
      const response = await fetch(`/api/users/${params.clientId}/tasks/${taskId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Task deleted');
        setClientTasks(prev => prev.filter(t => t._id !== taskId));
        if (selectedTask?._id === taskId) {
          setSelectedTask(null);
        }
      } else {
        toast.error('Failed to delete task');
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Error deleting task');
    }
  };

  // Update task status
  const handleUpdateTaskStatus = async (taskId: string, status: string) => {
    try {
      const response = await fetch(`/api/users/${params.clientId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      if (response.ok) {
        setClientTasks(prev => prev.map(t =>
          t._id === taskId ? { ...t, status: status as any } : t
        ));
        if (selectedTask && selectedTask._id === taskId) {
          setSelectedTask({ ...selectedTask, status: status as any });
        }
        toast.success('Task status updated');
      }
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  // Open task detail view
  const handleOpenTaskDetail = (task: ClientTask) => {
    setSelectedTask(task);
  };

  // Close task detail view
  const handleCloseTaskDetail = () => {
    setSelectedTask(null);
  };

  // Fetch all tags
  const fetchAllTags = useCallback(async () => {
    try {
      setLoadingTags(true);
      // Fetch tags filtered by role - API automatically filters based on session user role
      // Dietitians see dietitian + general tags, health counselors see health_counselor + general tags, admins see all
      const response = await fetch(`/api/admin/tags`);
      if (response.ok) {
        const data = await response.json();
        setAllTags(data || []);
      }
    } catch (error) {
      console.error('Error fetching tags:', error);
    } finally {
      setLoadingTags(false);
    }
  }, []);

  // Toggle tag for client (single tag mode - only one tag allowed)
  const handleToggleClientTag = async (tagId: string) => {
    try {
      const isSelected = clientTagIds.includes(tagId);
      // Single tag mode: If clicking the same tag, remove it. If clicking a different tag, replace it.
      const newTagIds = isSelected
        ? [] // Remove if already selected
        : [tagId]; // Replace with new tag (single tag only)

      setClientTagIds(newTagIds);

      // Update client with new tags
      const response = await fetch(`/api/users/${params.clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: newTagIds })
      });

      if (!response.ok) {
        // Revert on error
        setClientTagIds(clientTagIds);
        toast.error('Failed to update tags');
      } else {
        if (isSelected) {
          toast.success('Tag removed');
        } else {
          // If a tag was already assigned, show replacement message
          if (clientTagIds.length > 0) {
            toast.success('Tag replaced successfully');
          } else {
            toast.success('Tag assigned');
          }
        }
      }
    } catch (error) {
      console.error('Error updating tags:', error);
      toast.error('Error updating tags');
    }
  };

  // Load tags when opening the panel
  useEffect(() => {
    if (isTagsOpen) {
      fetchAllTags();
    }
  }, [isTagsOpen]);

  // Subscribe to real-time tag updates
  useDataRefresh(DataEventTypes.TAGS_UPDATED, fetchAllTags, [fetchAllTags]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <LoadingSpinner />
        </div>
      </DashboardLayout>
    );
  }

  if (!client) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card>
            <CardContent className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Client not found</h3>
              <Button onClick={() => router.push('/dietician/clients')}>
                Back to Clients
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-64px)] bg-gray-50">


        {/* Main Content - Scrollable */}
        <div className="flex-1 overflow-y-auto bg-white">
          {/* Full-width client navigation */}
          <div className="w-full bg-gray-50 border-b border-gray-200 sticky top-0 z-20">
            <div className="max-w-full px-8 py-2 flex items-center gap-2 overflow-x-auto">

              {/* Back button — resets active tab to its home view */}
              <button
                onClick={handleResetToHome}
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg whitespace-nowrap transition-colors text-gray-500 hover:bg-gray-100 hover:text-gray-900 mr-1"
                title="Back to section home"
              >
                <BackArrow className="h-4 w-4" />
              </button>

              <div className="w-px h-6 bg-gray-300 mr-1" />

              <button
                onClick={() => setActiveSection('forms')}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg whitespace-nowrap transition-colors ${activeSection === 'forms'
                  ? 'text-blue-700 bg-blue-50 border border-blue-200 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
              >
                <FileText className="h-4 w-4" />
                Forms
              </button>

              <button
                onClick={() => setActiveSection('journal')}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg whitespace-nowrap transition-colors ${activeSection === 'journal'
                  ? 'text-blue-700 bg-blue-50 border border-blue-200 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
              >
                <BookOpen className="h-4 w-4" />
                Journal
              </button>


              <button
                onClick={() => setActiveSection('planning')}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg whitespace-nowrap transition-colors ${activeSection === 'planning'
                  ? 'text-blue-700 bg-blue-50 border border-blue-200 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
              >
                <Calendar className="h-4 w-4" />
                Planning
              </button>

              <button
                onClick={() => setActiveSection('payments')}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg whitespace-nowrap transition-colors ${activeSection === 'payments'
                  ? 'text-blue-700 bg-blue-50 border border-blue-200 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
              >
                <CreditCard className="h-4 w-4" />
                Payments
              </button>

              <button
                onClick={() => setActiveSection('bookings')}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg whitespace-nowrap transition-colors ${activeSection === 'bookings'
                  ? 'text-blue-700 bg-blue-50 border border-blue-200 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
              >
                <Calendar className="h-4 w-4" />
                Bookings
              </button>

              <button
                onClick={() => setActiveSection('documents')}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg whitespace-nowrap transition-colors ${activeSection === 'documents'
                  ? 'text-blue-700 bg-blue-50 border border-blue-200 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
              >
                <FileText className="h-4 w-4" />
                Documents
              </button>

              <button
                onClick={() => setActiveSection('tasks')}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg whitespace-nowrap transition-colors ${activeSection === 'tasks'
                  ? 'text-blue-700 bg-blue-50 border border-blue-200 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
              >
                <Calendar className="h-4 w-4" />
                Tasks
              </button>

              <button
                onClick={() => setActiveSection('history')}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg whitespace-nowrap transition-colors ${activeSection === 'history'
                  ? 'text-blue-700 bg-blue-50 border border-blue-200 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
              >
                <Calendar className="h-4 w-4" />
                History
              </button>

            </div>
          </div>



          <div className="p-6">
            {/* Client Header - Modern Program Banner and Summary */}
            <div className="mb-6">
              <div className="flex items-start justify-between gap-6">
                {/* Left: Avatar + Name + meta */}
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-xl flex items-center justify-center text-white text-lg font-semibold bg-linear-to-br from-blue-500 to-blue-600">
                      {client?.firstName?.[0] || ''}{client?.lastName?.[0] || ''}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <h1 className="text-xl font-bold text-gray-900 truncate">
                          {client.firstName} {client.lastName}
                        </h1>
                        <div className="flex items-center gap-1.5 text-sm text-gray-600">
                          <span className="uppercase">{client?.gender}</span>
                          <span className="text-gray-400">|</span>
                          <span>{calculateAge(client?.dateOfBirth)} yrs</span>
                          {client?.clientId && (
                            <>
                              <span className="text-gray-400">|</span>
                              <span className="font-medium text-blue-600">{client.clientId}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-block h-2 w-2 rounded-full ${clientComputedStatus === 'active' ? 'bg-green-500' :
                            clientComputedStatus === 'inactive' ? 'bg-red-500' :
                              clientComputedStatus === 'hold' ? 'bg-yellow-500' :
                                'bg-gray-400'
                            }`} />
                          <span className="capitalize">
                            {clientComputedStatus === 'active' ? 'Active' :
                              clientComputedStatus === 'inactive' ? 'Inactive' :
                                clientComputedStatus === 'hold' ? 'On Hold' :
                                  'Lead'}
                          </span>
                        </div>
                        <span className="text-gray-300">•</span>
                        <ClientHoldStatus
                          clientId={params.clientId as string}
                          clientName={`${client?.firstName || ''} ${client?.lastName || ''}`.trim()}
                          holdStatus={holdStatus}
                          onStatusChange={() => {
                            // Refresh both the hold status control and the computed
                            // client status badge so the UI updates without a refresh.
                            fetchHoldStatus();
                            fetchActivePlan();
                          }}
                          compact={true}
                        />
                        <span className="text-gray-300">•</span>
                        <span>Dietitian: {getDietitianDisplayName()}</span>
                        <span className="text-gray-300">•</span>
                        <span>HC: {getHealthCounselorDisplayName()}</span>
                        <span className="text-gray-300">•</span>
                        <span className="whitespace-nowrap">Last seen: {formatLastSeen(client?.lastLoginAt || client?.createdAt)}</span>
                        {displayCurrentWeight && (
                          <>
                            <span className="text-gray-300">•</span>
                            <span className="whitespace-nowrap">Current Weight: {displayCurrentWeight} kg</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Action buttons */}
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 flex items-center gap-1.5"
                    onClick={() => setIsTagsOpen(true)}
                  >
                    Tags
                    {clientTagIds.length > 0 && (
                      <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-purple-500">
                        {clientTagIds.length}
                      </Badge>
                    )}
                  </Button>

                  {isAdmin && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-8 flex items-center gap-1.5 text-amber-600 border-amber-600 hover:bg-amber-50"
                        onClick={handleAdminDeactivateClient}
                      >
                        <UserX className="h-3.5 w-3.5" />
                        Deactivate
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="text-xs h-8 flex items-center gap-1.5"
                        onClick={handleAdminDeleteClient}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </>
                  )}
                  {/* <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs h-8 flex items-center gap-1.5"
                    onClick={() => setActiveSection('history')}
                  >
                    History
                  </Button> */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 flex items-center gap-1.5"
                    onClick={() => setIsNotesOpen(true)}
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                    Notes
                    {clientNotes.length > 0 && (
                      <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-blue-500">
                        {clientNotes.length}
                      </Badge>
                    )}
                  </Button>
                  {/* <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setIsEditing(!isEditing)}>{isEditing ? 'Cancel' : 'Modify'}</Button> */}
                  {/* <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs h-8 flex items-center gap-1.5"
                    onClick={() => setIsTasksOpen(true)}
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    Tasks
                    {clientTasks.length > 0 && (
                      <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-green-500">
                        {clientTasks.length}
                      </Badge>
                    )}
                  </Button> */}
                </div>
              </div>

              {/* Weight Tracker Summary (First / Current / History with tags) */}
              <div className="mt-4 rounded-xl border border-gray-200 bg-white overflow-hidden">
                <button
                  onClick={() => setShowWeightTracker(!showWeightTracker)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-gray-800">Weight Tracker</h3>
                    <span className="text-xs text-gray-500">{weightLog.length} entries</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {displayCurrentWeight && (
                      <span className="text-sm font-medium text-blue-600">{displayCurrentWeight.toFixed(1)} kg</span>
                    )}
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${showWeightTracker ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {showWeightTracker && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-amber-700">First Weight</span>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">START</span>
                        </div>
                        <p className="mt-1 text-lg font-bold text-amber-900">
                          {displayFirstWeight ? `${displayFirstWeight.toFixed(1)} kg` : '--'}
                        </p>
                      </div>

                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-blue-700">Current Weight</span>
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">NOW</span>
                        </div>
                        <p className="mt-1 text-lg font-bold text-blue-900">
                          {displayCurrentWeight ? `${displayCurrentWeight.toFixed(1)} kg` : '--'}
                        </p>
                      </div>

                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="text-xs font-medium text-gray-600">Change from Start</div>
                        <p className={`mt-1 text-lg font-bold ${weightDelta === null
                          ? 'text-gray-500'
                          : weightDelta < 0
                            ? 'text-green-700'
                            : weightDelta > 0
                              ? 'text-red-700'
                              : 'text-gray-700'
                          }`}>
                          {weightDelta === null
                            ? '--'
                            : `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg ${weightDelta < 0 ? '↓' : weightDelta > 0 ? '↑' : '→'}`}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 max-h-56 overflow-y-auto rounded-lg border border-gray-100">
                      {weightLog.length === 0 ? (
                        <div className="p-4 text-sm text-gray-500">No weight entries yet.</div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {weightLog.map((entry, index) => {
                            const isNow = index === 0;
                            const isStart = index === weightLog.length - 1;
                            return (
                              <div key={entry._id} className="flex items-center justify-between p-3">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{entry.weight.toFixed(1)} kg</p>
                                  <p className="text-xs text-gray-500">{format(new Date(entry.recordedAt), 'dd MMM yyyy, hh:mm a')}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {isStart && (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">START</span>
                                  )}
                                  {isNow && (
                                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">NOW</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Program Banner */}
              {activePlan ? (
                <div className="mt-5 rounded-2xl bg-linear-to-r from-slate-600 via-slate-500 to-slate-400 px-6 py-5 shadow-lg">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${activePlan.status === 'active' || activePlan.status === 'upcoming' ? 'bg-emerald-400 animate-pulse' :
                          'bg-gray-400'
                          }`}></div>
                        <p className="text-sm font-medium text-slate-300 uppercase tracking-wide">
                          {activePlan.status === 'active' ? 'Currently Running' :
                            activePlan.status === 'upcoming' ? 'Upcoming Program' :
                              activePlan.status === 'completed' ? 'Completed Program' : 'No active program'}
                        </p>
                        {activePlan.totalActivePlans && activePlan.totalActivePlans > 1 && (
                          <span className="ml-2 text-xs bg-white/20 text-white px-2 py-0.5 rounded-full">
                            {activePlan.totalActivePlans} total plans
                          </span>
                        )}
                      </div>
                      <h2 className="mt-2 text-xl text-white font-bold">{activePlan.name}</h2>
                      <p className="mt-1 text-sm text-slate-400">
                        {activePlan.status === 'active' || activePlan.status === 'upcoming' ? 'Ongoing wellness journey' :
                          'Plan completed'}
                      </p>
                    </div>
                    <div className={`grid ${activePlan.expectedStartDate && activePlan.expectedEndDate && activePlan.hasMealPlan ? 'grid-cols-4' : 'grid-cols-3'} gap-3 text-xs`}>
                      <div className="rounded-xl bg-linear-to-br from-cyan-500 to-blue-600 px-4 py-3 shadow-md">
                        <p className="text-xs font-medium text-cyan-100 uppercase tracking-wide">Duration</p>
                        <p className="mt-1.5 text-lg font-bold text-white">
                          {activePlan.duration} days
                        </p>
                      </div>
                      {/* Expected Dates - shown first if set */}
                      {activePlan.expectedStartDate && activePlan.expectedEndDate && (
                        <div className="rounded-xl bg-linear-to-br from-amber-500 to-orange-600 px-4 py-3 shadow-md">
                          <p className="text-xs font-medium text-amber-100 uppercase tracking-wide">
                            Expected dates
                          </p>
                          <p className="mt-1.5 text-sm font-semibold text-white">
                            {formatDate(activePlan.expectedStartDate)} – {formatDate(activePlan.expectedEndDate)}
                          </p>
                        </div>
                      )}
                      {/* Meal Plan Dates - shown only when meal plan exists */}
                      {activePlan.hasMealPlan && (
                        <div
                          className={`rounded-xl bg-linear-to-br from-violet-500 to-purple-600 px-4 py-3 shadow-md ${(activePlan.isExtended || activePlan.isFrozen) ? 'cursor-pointer hover:from-violet-600 hover:to-purple-700 transition-colors' : ''}`}
                          onClick={(e) => {
                            if (activePlan.isExtended || activePlan.isFrozen) {
                              e.stopPropagation();
                              setShowPlanDetails(!showPlanDetails);
                            }
                          }}
                        >
                          <p className="text-xs font-medium text-violet-100 uppercase tracking-wide">
                            Plan dates {(activePlan.isExtended || activePlan.isFrozen) && <span className="text-yellow-300">ⓘ</span>}
                          </p>
                          <p className="mt-1.5 text-sm font-semibold text-white">
                            {formatDate(activePlan.startDate)} – {formatDate(activePlan.endDate)}
                          </p>
                        </div>
                      )}
                      {/* If no meal plan but has expected dates, show waiting message */}
                      {!activePlan.hasMealPlan && !activePlan.expectedStartDate && (
                        <div className="rounded-xl bg-linear-to-br from-violet-500 to-purple-600 px-4 py-3 shadow-md">
                          <p className="text-xs font-medium text-violet-100 uppercase tracking-wide">
                            Program dates
                          </p>
                          <p className="mt-1.5 text-sm font-semibold text-white">
                            Meal plan not created
                          </p>
                        </div>
                      )}
                      <div className={`rounded-xl bg-linear-to-br ${clientComputedStatus === 'active' ? 'from-emerald-500 to-green-600' :
                        clientComputedStatus === 'lead' ? 'from-gray-500 to-gray-600' :
                          clientComputedStatus === 'hold' ? 'from-yellow-500 to-amber-600' :
                            'from-red-500 to-red-600'
                        } px-4 py-3 shadow-md`}>
                        <p className={`text-xs font-medium uppercase tracking-wide ${clientComputedStatus === 'active' ? 'text-emerald-100' :
                          clientComputedStatus === 'lead' ? 'text-gray-100' :
                            clientComputedStatus === 'hold' ? 'text-yellow-50' :
                              'text-red-100'
                          }`}>Status</p>
                        <Badge className={`mt-1.5 ${clientComputedStatus === 'active' ? 'bg-white/20' :
                          clientComputedStatus === 'lead' ? 'bg-gray-500/20' :
                            clientComputedStatus === 'hold' ? 'bg-yellow-500/20' :
                              'bg-red-500/20'
                          } backdrop-blur-sm border border-white/30 text-[11px] text-white font-semibold`}>
                          {clientComputedStatus === 'active' ? 'Active' : clientComputedStatus === 'inactive' ? 'Inactive' : clientComputedStatus === 'hold' ? 'On Hold' : 'Lead'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Extended/Frozen Details - shown on click of Program dates */}
                  {showPlanDetails && (activePlan.isExtended || activePlan.isFrozen) && (
                    <div className="mt-4 pt-4 border-t border-white/20">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        {activePlan.originalEndDate && (
                          <div className="bg-white/10 rounded-lg p-3">
                            <p className="text-xs text-slate-300">Original End Date</p>
                            <p className="text-white font-medium">{formatDate(activePlan.originalEndDate)}</p>
                          </div>
                        )}
                        {activePlan.isFrozen && activePlan.frozenDays && activePlan.frozenDays > 0 && (
                          <div className="bg-cyan-500/20 rounded-lg p-3">
                            <p className="text-xs text-cyan-200">Frozen Days</p>
                            <p className="text-white font-medium">❄️ {activePlan.frozenDays} days</p>
                          </div>
                        )}
                        {activePlan.isExtended && activePlan.extendedDays && activePlan.extendedDays > 0 && (
                          <div className="bg-orange-500/20 rounded-lg p-3">
                            <p className="text-xs text-orange-200">Extended Days</p>
                            <p className="text-white font-medium">+{activePlan.extendedDays} days</p>
                          </div>
                        )}
                        <div className="bg-white/10 rounded-lg p-3">
                          <p className="text-xs text-slate-300">New End Date</p>
                          <p className="text-white font-medium">{formatDate(activePlan.endDate)}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-slate-400">
                        {activePlan.isFrozen && activePlan.frozenDays && activePlan.frozenDays > 0 && `❄️ ${activePlan.frozenDays} days were frozen (meals copied to end). `}
                        {activePlan.isExtended && activePlan.extendedDays && activePlan.extendedDays > 0 && `📅 Plan extended by ${activePlan.extendedDays} additional days. `}
                        End date updated accordingly.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl bg-linear-to-r from-gray-500 via-gray-400 to-gray-300 px-6 py-5 shadow-lg">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-red-400"></div>
                        <p className="text-sm font-medium text-gray-200 uppercase tracking-wide">No Active Program</p>
                      </div>
                      <h2 className="mt-2 text-xl text-white font-bold">No Plan</h2>
                      <p className="mt-1 text-sm text-gray-200">
                        Client needs to purchase a plan to get started
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div className="rounded-xl bg-linear-to-br from-gray-600 to-gray-700 px-4 py-3 shadow-md">
                        <p className="text-xs font-medium text-gray-300 uppercase tracking-wide">Duration</p>
                        <p className="mt-1.5 text-lg font-bold text-white">No days</p>
                      </div>
                      <div className="rounded-xl bg-linear-to-br from-gray-600 to-gray-700 px-4 py-3 shadow-md">
                        <p className="text-xs font-medium text-gray-300 uppercase tracking-wide">Program dates</p>
                        <p className="mt-1.5 text-sm font-semibold text-white">No dates</p>
                      </div>
                      <div className={`rounded-xl bg-linear-to-br ${clientComputedStatus === 'lead' ? 'from-gray-600 to-gray-700' :
                        clientComputedStatus === 'inactive' ? 'from-red-600 to-red-700' :
                          clientComputedStatus === 'hold' ? 'from-yellow-500 to-amber-600' :
                            'from-green-600 to-green-700'
                        } px-4 py-3 shadow-md`}>
                        <p className={`text-xs font-medium uppercase tracking-wide ${clientComputedStatus === 'lead' ? 'text-gray-200' :
                          clientComputedStatus === 'inactive' ? 'text-red-200' :
                            clientComputedStatus === 'hold' ? 'text-yellow-50' :
                              'text-green-200'
                          }`}>Status</p>
                        <Badge className={`mt-1.5 ${clientComputedStatus === 'lead' ? 'bg-gray-500/30' :
                          clientComputedStatus === 'inactive' ? 'bg-red-500/30' :
                            clientComputedStatus === 'hold' ? 'bg-yellow-500/30' :
                              'bg-green-500/30'
                          } backdrop-blur-sm border border-white/30 text-[11px] text-white font-semibold`}>
                          {clientComputedStatus === 'active' ? 'Active' : clientComputedStatus === 'inactive' ? 'Inactive' : clientComputedStatus === 'hold' ? 'On Hold' : 'Lead'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Section Content - all sections rendered but hidden to preserve state */}
            <div style={{ display: activeSection === 'forms' ? 'block' : 'none' }}>
              <FormsSection
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                basicInfo={basicInfo}
                medicalData={medicalData}
                lifestyleData={lifestyleData}
                recallEntries={recallEntries}
                setBasicInfo={setBasicInfo}
                setMedicalData={setMedicalData}
                setLifestyleData={setLifestyleData}
                setRecallEntries={setRecallEntries}
                handleSave={handleSave}
                handleSaveRecallEntry={handleSaveRecallEntry}
                handleDeleteRecallEntry={handleDeleteRecallEntry}
                loading={savingForm}
                clientId={params.clientId as string}
                userRole="dietitian"
                disableFirstWeight={false}
                currentWeightKg={displayCurrentWeight}
                onRegisterReset={(fn: () => void) => registerReset('forms', fn)}
              />
            </div>

            <div style={{ display: activeSection === 'journal' ? 'block' : 'none' }}>
              <JournalSection clientId={params.clientId as string} onRegisterReset={(fn: () => void) => registerReset('journal', fn)} />
            </div>

            <div style={{ display: activeSection === 'progress' ? 'block' : 'none' }}>
              <ProgressSection
                client={client}
                setActiveSection={setActiveSection}
                setActiveTab={setActiveTab}
                formatDate={formatDate}
                onRegisterReset={(fn: () => void) => registerReset('progress', fn)}
              />
            </div>

            <div data-section="planning" style={{ display: activeSection === 'planning' ? 'block' : 'none' }}>
              <PlanningSection client={client} onRegisterReset={(fn: () => void) => registerReset('planning', fn)} />
            </div>

            <div data-section="payments" style={{ display: activeSection === 'payments' ? 'block' : 'none' }}>
              <PaymentsSection
                client={client}
                formatDate={formatDate}
                onRegisterReset={(fn: () => void) => registerReset('payments', fn)}
              />
            </div>

            <div style={{ display: activeSection === 'bookings' ? 'block' : 'none' }}>
              <BookingsSection
                clientId={client._id}
                clientName={`${client.firstName} ${client.lastName}`}
                onRegisterReset={(fn: () => void) => registerReset('bookings', fn)}
              />
            </div>

            <div style={{ display: activeSection === 'documents' ? 'block' : 'none' }}>
              <DocumentsSection client={client} formatDate={formatDate} onRegisterReset={(fn: () => void) => registerReset('documents', fn)} />
            </div>

            <div style={{ display: activeSection === 'tasks' ? 'block' : 'none' }}>
              <TasksSection
                clientId={params.clientId as string}
                clientName={`${client?.firstName} ${client?.lastName}`}
                dietitianEmail={session?.user?.email}
                onRegisterReset={(fn: () => void) => registerReset('tasks', fn)}
              />
            </div>

            <div style={{ display: activeSection === 'history' ? 'block' : 'none' }}>
              <HistorySection clientId={params.clientId as string} onRegisterReset={(fn: () => void) => registerReset('history', fn)} />
            </div>
          </div>
        </div>
      </div>

      {/* Notes Slide-out Panel */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${isNotesOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/30"
          onClick={() => setIsNotesOpen(false)}
        />

        {/* Panel */}
        <div
          className={`fixed top-1/2 right-0 -translate-y-1/2 h-[85vh] w-full max-w-sm bg-white shadow-2xl z-50 rounded-l-2xl overflow-hidden flex flex-col transition-transform duration-300 ease-out ${isNotesOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b bg-linear-to-r from-blue-50 to-white">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <StickyNote className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Client Notes</h2>
                <p className="text-xs text-gray-500">{clientNotes.length} notes</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 rounded-full hover:bg-gray-100"
              onClick={() => setIsNotesOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Note Detail View */}
            {selectedNote ? (
              <div className="animate-in slide-in-from-right-4 duration-200">
                {/* Back button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-3 -ml-2 text-gray-600 hover:text-gray-900"
                  onClick={handleCloseNoteDetail}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back to Notes
                </Button>

                {/* Note Detail Card */}
                <Card className="border-gray-200">
                  <CardContent className="p-4">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <Badge variant="secondary" className="text-[10px] px-2 py-0.5 mb-1">
                            {selectedNote.topicType || 'General'}
                          </Badge>
                          <h3 className="text-lg font-semibold text-gray-900">{selectedNote.topicType || 'General'}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-500">
                              {selectedNote.date ? format(new Date(selectedNote.date), 'MMMM d, yyyy') : 'No date'}
                            </p>
                            {selectedNote.showToClient ? (
                              <Badge className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 border-green-200">
                                <Eye className="h-3 w-3 mr-1" />
                                Visible to client
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                                <EyeOff className="h-3 w-3 mr-1" />
                                Hidden from client
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-4 mt-4">
                        <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Note Content</Label>
                        <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap leading-relaxed">
                          {selectedNote.content}
                        </p>
                      </div>

                      {/* Attachments Display */}
                      {selectedNote.attachments && selectedNote.attachments.length > 0 && (
                        <div className="mt-4">
                          <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Attachments</Label>
                          <div className="flex flex-wrap gap-3 mt-2">
                            {selectedNote.attachments.map((att, idx) => (
                              <div key={idx} className="relative">
                                {att.type === 'image' && (
                                  <div className="cursor-pointer" onClick={() => openNoteLightbox(att.url)}>
                                    <img src={att.url} alt={att.filename || 'Image'} className="h-24 w-24 object-cover rounded-lg border shadow-sm hover:shadow-md transition-shadow" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                  </div>
                                )}
                                {att.type === 'video' && (
                                  <video controls className="h-24 w-40 rounded-lg border shadow-sm">
                                    <source src={att.url} type={att.mimeType || 'video/mp4'} />
                                  </video>
                                )}
                                {att.type === 'audio' && (
                                  <audio controls className="h-10 w-48">
                                    <source src={att.url} type={att.mimeType || 'audio/mpeg'} />
                                  </audio>
                                )}
                                <p className="text-[9px] text-gray-400 mt-0.5 truncate max-w-25">{att.filename}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedNote.createdAt && (
                        <p className="text-[10px] text-gray-400 pt-2">
                          Created: {format(new Date(selectedNote.createdAt), 'MMM d, yyyy h:mm a')}
                          {selectedNote.createdBy && (
                            <span className="ml-1">
                              by {selectedNote.createdBy.firstName} {selectedNote.createdBy.lastName}
                            </span>
                          )}
                        </p>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-3 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleToggleNoteVisibility(selectedNote._id!, !selectedNote.showToClient)}
                        >
                          {selectedNote.showToClient ? (
                            <>
                              <EyeOff className="h-3.5 w-3.5 mr-1.5" />
                              Hide from Client
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5 mr-1.5" />
                              Show to Client
                            </>
                          )}
                        </Button>
                        {/* Only show delete button if current user created the note */}
                        {selectedNote.createdBy?._id === session?.user?.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                            onClick={() => {
                              handleDeleteNote(selectedNote._id!);
                              handleCloseNoteDetail();
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              /* Notes List View */
              <>
                {/* Add Note Button */}
                {!isAddingNote && (
                  <Button
                    className="w-full mb-3 bg-blue-600 hover:bg-blue-700 h-9 text-sm"
                    onClick={() => setIsAddingNote(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add New Note
                  </Button>
                )}

                {/* Add Note Form */}
                {isAddingNote && (
                  <Card className="mb-3 border-blue-200 bg-blue-50/50 animate-in slide-in-from-top-2 duration-200">
                    <CardContent className="p-3 space-y-3">
                      <div>
                        <Label className="text-xs font-medium">Topic Type *</Label>
                        <Select
                          value={newNote.topicType}
                          onValueChange={(value) => {
                            setNewNote(prev => ({ ...prev, topicType: value }));
                            // Reset renewal dates when changing topic type
                            if (value !== 'Renewal') {
                              setRenewalStartDate('');
                              setRenewalEndDate('');
                            }
                          }}
                        >
                          <SelectTrigger className="mt-1 h-8 text-sm">
                            <SelectValue placeholder="Select topic type" />
                          </SelectTrigger>
                          <SelectContent>
                            {NOTE_TOPIC_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Show date range for Renewal, single date for others */}
                      {newNote.topicType === 'Renewal' ? (
                        <div className="space-y-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <Label className="text-xs font-medium text-amber-900">Renewal Period</Label>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs font-medium text-gray-600">Start Date</Label>
                              <Input
                                type="date"
                                value={renewalStartDate}
                                onChange={(e) => setRenewalStartDate(e.target.value)}
                                className="mt-1 h-8 text-sm"
                              />
                            </div>
                            <div>
                              <Label className="text-xs font-medium text-gray-600">End Date</Label>
                              <Input
                                type="date"
                                value={renewalEndDate}
                                onChange={(e) => setRenewalEndDate(e.target.value)}
                                className="mt-1 h-8 text-sm"
                              />
                            </div>
                          </div>
                          {renewalStartDate && renewalEndDate && (
                            <p className="text-xs text-amber-800 mt-2">
                              Duration: {Math.ceil((new Date(renewalEndDate).getTime() - new Date(renewalStartDate).getTime()) / (1000 * 60 * 60 * 24))} days
                            </p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <Label className="text-xs font-medium">Date</Label>
                          <Input
                            type="date"
                            value={newNote.date}
                            onChange={(e) => setNewNote(prev => ({ ...prev, date: e.target.value }))}
                            className="mt-1 h-8 text-sm"
                          />
                        </div>
                      )}

                      <div>
                        <Label className="text-xs font-medium">Notes *</Label>
                        <Textarea
                          placeholder="Enter your notes here..."
                          value={newNote.content}
                          onChange={(e) => setNewNote(prev => ({ ...prev, content: e.target.value }))}
                          className="mt-1 min-h-20 text-sm resize-none"
                        />
                      </div>

                      {/* Audio Recording Section */}
                      <div>
                        <Label className="text-xs font-medium">Voice Recording</Label>
                        <div className="mt-1 flex items-center gap-2">
                          {!isRecording ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-10 px-4 flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
                              onClick={async () => {
                                try {
                                  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                                  const recorder = new MediaRecorder(stream);
                                  const chunks: Blob[] = [];

                                  recorder.ondataavailable = (e) => {
                                    if (e.data.size > 0) chunks.push(e.data);
                                  };

                                  recorder.onstop = async () => {
                                    try {

                                      if (chunks.length === 0) {
                                        console.error('No audio chunks recorded');
                                        toast.error('No audio recorded. Please try again.');
                                        stream.getTracks().forEach(track => track.stop());
                                        setRecordingTime(0);
                                        setIsRecording(false);
                                        return;
                                      }

                                      const audioBlob = new Blob(chunks, { type: 'audio/webm' });

                                      if (audioBlob.size === 0) {
                                        console.error('Audio blob is empty');
                                        toast.error('Audio file is empty. Please try again.');
                                        stream.getTracks().forEach(track => track.stop());
                                        setRecordingTime(0);
                                        setIsRecording(false);
                                        return;
                                      }

                                      const file = new File([audioBlob], `recording-${Date.now()}.webm`, { type: 'audio/webm' });

                                      stream.getTracks().forEach(track => track.stop());

                                      const result = await handleMediaUpload(file);

                                      setRecordingTime(0);
                                      setIsRecording(false);
                                    } catch (error) {
                                      console.error('Error in recorder.onstop:', error);
                                      toast.error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                                      stream.getTracks().forEach(track => track.stop());
                                      setRecordingTime(0);
                                      setIsRecording(false);
                                    }
                                  };

                                  setMediaRecorder(recorder);
                                  setAudioChunks([]);
                                  recorder.start();
                                  setIsRecording(true);

                                  // Start timer
                                  const timer = setInterval(() => {
                                    setRecordingTime(prev => prev + 1);
                                  }, 1000);
                                  recordingTimerRef.current = timer;
                                } catch (err) {
                                  toast.error('Microphone access denied');
                                }
                              }}
                            >
                              <Mic className="h-4 w-4" />
                              Record Audio
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg border border-red-200">
                                <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
                                <span className="text-sm font-mono text-red-600">
                                  {Math.floor(recordingTime / 60).toString().padStart(2, '0')}:{(recordingTime % 60).toString().padStart(2, '0')}
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-10 px-4 flex items-center gap-2 text-gray-600"
                                onClick={() => {
                                  if (mediaRecorder) {
                                    mediaRecorder.stop();
                                    setIsRecording(false);
                                    if (recordingTimerRef.current) {
                                      clearInterval(recordingTimerRef.current);
                                      recordingTimerRef.current = null;
                                    }
                                  }
                                }}
                              >
                                <Square className="h-4 w-4" />
                                Stop
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Media Upload Section */}
                      <div>
                        <Label className="text-xs font-medium">Attachments (Image/Video/Audio)</Label>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {(newNote.attachments || []).map((att, idx) => (
                            <div key={idx} className="relative group">
                              {att.type === 'image' && (
                                <img src={att.url} alt={att.filename} className="h-16 w-16 object-cover rounded border" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                              )}
                              {att.type === 'video' && (
                                <div className="h-16 w-16 bg-gray-100 rounded border flex items-center justify-center">
                                  <span className="text-[10px] text-gray-500">Video</span>
                                </div>
                              )}
                              {att.type === 'audio' && (
                                <div className="h-16 w-16 bg-gray-100 rounded border flex items-center justify-center">
                                  <span className="text-[10px] text-gray-500">Audio</span>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveAttachment(idx)}
                                className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          <label className="h-16 w-16 border-2 border-dashed border-gray-300 rounded flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors">
                            <input
                              type="file"
                              accept="image/*,video/*,audio/*"
                              capture="environment"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleMediaUpload(file);
                                e.target.value = '';
                              }}
                              disabled={uploadingMedia}
                            />
                            {uploadingMedia ? (
                              <LoadingSpinner className="h-4 w-4" />
                            ) : (
                              <Plus className="h-5 w-5 text-gray-400" />
                            )}
                          </label>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">Max 50MB per file</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="showToClient"
                          checked={newNote.showToClient}
                          onChange={(e) => setNewNote(prev => ({ ...prev, showToClient: e.target.checked }))}
                          className="h-3.5 w-3.5 text-blue-600 rounded border-gray-300"
                        />
                        <Label htmlFor="showToClient" className="text-xs cursor-pointer">
                          Show to client
                        </Label>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8 text-xs"
                          onClick={() => {
                            setIsAddingNote(false);
                            setNewNote({
                              topicType: 'General',
                              date: format(new Date(), 'yyyy-MM-dd'),
                              content: '',
                              showToClient: false,
                              attachments: []
                            });
                            setRenewalStartDate('');
                            setRenewalEndDate('');
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 h-8 text-xs bg-blue-600 hover:bg-blue-700"
                          onClick={handleSaveNote}
                          disabled={savingNote || uploadingMedia}
                        >
                          {savingNote ? 'Saving...' : 'Save Note'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Notes List */}
                <div className="space-y-2">
                  {clientNotes.length === 0 && !isAddingNote ? (
                    <div className="text-center py-8">
                      <StickyNote className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">No notes yet</p>
                      <p className="text-gray-400 text-xs mt-1">Add your first note</p>
                    </div>
                  ) : (
                    clientNotes.map((note, index) => (
                      <Card
                        key={note._id}
                        className="border-gray-200 hover:border-blue-300 transition-all duration-200 hover:shadow-md cursor-pointer animate-in fade-in slide-in-from-right-2 group"
                        style={{ animationDelay: `${index * 50}ms` }}
                        onClick={() => handleOpenNoteDetail(note)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                <Badge variant="outline" className="text-[8px] px-1 py-0 text-gray-500">
                                  {note.topicType || 'General'}
                                </Badge>
                                {note.showToClient ? (
                                  <Badge className="text-[9px] px-1.5 py-0 bg-green-100 text-green-700 border-green-200">
                                    <Eye className="h-2.5 w-2.5 mr-0.5" />
                                    Visible
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                                    <EyeOff className="h-2.5 w-2.5 mr-0.5" />
                                    Hidden
                                  </Badge>
                                )}
                                {note.createdBy && (
                                  <span className="text-[9px] text-gray-400">
                                    by {note.createdBy.firstName} {note.createdBy.lastName}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-500 mb-1">
                                {note.date ? format(new Date(note.date), 'MMM d, yyyy') : 'No date'}
                              </p>
                              <p className="text-xs text-gray-600 line-clamp-2">{note.content}</p>
                            </div>

                            <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleToggleNoteVisibility(note._id!, !note.showToClient)}
                                title={note.showToClient ? 'Hide from client' : 'Show to client'}
                              >
                                {note.showToClient ? (
                                  <EyeOff className="h-3.5 w-3.5 text-gray-500" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5 text-gray-500" />
                                )}
                              </Button>
                              {/* Only show delete button if current user created the note */}
                              {note.createdBy?._id === session?.user?.id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => handleDeleteNote(note._id!)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tasks Slide-out Panel */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${isTasksOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/30"
          onClick={() => setIsTasksOpen(false)}
        />

        {/* Panel */}
        <div
          className={`fixed top-1/2 right-0 -translate-y-1/2 h-[85vh] w-full max-w-md bg-white shadow-2xl z-50 rounded-l-2xl overflow-hidden flex flex-col transition-transform duration-300 ease-out ${isTasksOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b bg-linear-to-r from-green-50 to-white">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center">
                <Calendar className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Client Tasks</h2>
                <p className="text-xs text-gray-500">{clientTasks.length} tasks</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 rounded-full hover:bg-gray-100"
              onClick={() => setIsTasksOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Task Detail View */}
            {selectedTask ? (
              <div className="animate-in slide-in-from-right-4 duration-200">
                {/* Back button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-3 -ml-2 text-gray-600 hover:text-gray-900"
                  onClick={handleCloseTaskDetail}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back to Tasks
                </Button>

                {/* Task Detail Card */}
                <Card className="border-gray-200">
                  <CardContent className="p-4">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] px-2 py-0.5 mb-1 ${selectedTask.status === 'completed' ? 'bg-green-100 text-green-700' :
                              selectedTask.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                                selectedTask.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                  'bg-yellow-100 text-yellow-700'
                              }`}
                          >
                            {selectedTask.status}
                          </Badge>
                          <h3 className="text-lg font-semibold text-gray-900">{selectedTask.title || selectedTask.taskType}</h3>
                          <Badge variant="outline" className="text-[10px] px-2 py-0.5 mt-1">
                            {selectedTask.taskType}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <Label className="text-xs font-medium text-gray-500">Start Date</Label>
                          <p className="text-sm text-gray-700 mt-1">
                            {selectedTask.startDate ? format(new Date(selectedTask.startDate), 'MMM d, yyyy') : 'N/A'}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <Label className="text-xs font-medium text-gray-500">End Date</Label>
                          <p className="text-sm text-gray-700 mt-1">
                            {selectedTask.endDate ? format(new Date(selectedTask.endDate), 'MMM d, yyyy') : 'N/A'}
                          </p>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-3">
                        <Label className="text-xs font-medium text-gray-500">Allotted Time</Label>
                        <p className="text-sm text-gray-700 mt-1">{selectedTask.allottedTime}</p>
                      </div>

                      {selectedTask.description && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <Label className="text-xs font-medium text-gray-500">Message</Label>
                          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{selectedTask.description}</p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {selectedTask.notifyClientOnChat && (
                          <Badge className="text-[10px] bg-blue-100 text-blue-700">
                            Notify Client on Chat
                          </Badge>
                        )}
                        {selectedTask.repeatFrequency > 0 && (
                          <Badge className="text-[10px] bg-purple-100 text-purple-700">
                            Repeat: Every {selectedTask.repeatFrequency} day(s)
                          </Badge>
                        )}
                      </div>

                      {selectedTask.createdAt && (
                        <p className="text-[10px] text-gray-400">
                          Created: {format(new Date(selectedTask.createdAt), 'MMM d, yyyy h:mm a')}
                        </p>
                      )}

                      {/* Status Update Buttons */}
                      <div className="pt-3 border-t">
                        <Label className="text-xs font-medium text-gray-500 mb-2 block">Update Status</Label>
                        <div className="flex flex-wrap gap-2">
                          {['pending', 'in-progress', 'completed', 'cancelled'].map((status) => (
                            <Button
                              key={status}
                              variant={selectedTask.status === status ? 'default' : 'outline'}
                              size="sm"
                              className="text-xs capitalize"
                              onClick={() => handleUpdateTaskStatus(selectedTask._id!, status)}
                            >
                              {status}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-3 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                          onClick={() => {
                            handleDeleteTask(selectedTask._id!);
                            handleCloseTaskDetail();
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          Delete Task
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              /* Tasks List View */
              <>
                {/* Add Task Button */}
                {!isAddingTask && (
                  <Button
                    className="w-full mb-3 bg-green-600 hover:bg-green-700 h-9 text-sm"
                    onClick={() => setIsAddingTask(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Task
                  </Button>
                )}

                {/* Add Task Form */}
                {isAddingTask && (
                  <Card className="mb-3 border-green-200 bg-green-50/50 animate-in slide-in-from-top-2 duration-200">
                    <CardContent className="p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900">Create Task</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => setIsAddingTask(false)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div>
                        <Label className="text-xs font-medium">Task Type *</Label>
                        <Select
                          value={newTask.taskType}
                          onValueChange={(value) => setNewTask(prev => ({ ...prev, taskType: value }))}
                        >
                          <SelectTrigger className="mt-1 h-8 text-sm">
                            <SelectValue placeholder="Select task type" />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs font-medium">Start Date *</Label>
                          <Input
                            type="date"
                            value={newTask.startDate}
                            onChange={(e) => setNewTask(prev => ({ ...prev, startDate: e.target.value }))}
                            className="mt-1 h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs font-medium">End Date *</Label>
                          <Input
                            type="date"
                            value={newTask.endDate}
                            onChange={(e) => setNewTask(prev => ({ ...prev, endDate: e.target.value }))}
                            className="mt-1 h-8 text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs font-medium">Task Allotment Time</Label>
                        <Select
                          value={newTask.allottedTime}
                          onValueChange={(value) => setNewTask(prev => ({ ...prev, allottedTime: value }))}
                        >
                          <SelectTrigger className="mt-1 h-8 text-sm">
                            <SelectValue placeholder="Select time" />
                          </SelectTrigger>
                          <SelectContent className="max-h-48">
                            {TIME_OPTIONS.map((time) => (
                              <SelectItem key={time} value={time}>{time}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs font-medium">Repeat Frequency (days)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={newTask.repeatFrequency}
                          onChange={(e) => setNewTask(prev => ({ ...prev, repeatFrequency: parseInt(e.target.value) || 0 }))}
                          className="mt-1 h-8 text-sm"
                          placeholder="0 = no repeat"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="notifyClientOnChat"
                          checked={newTask.notifyClientOnChat}
                          onChange={(e) => setNewTask(prev => ({ ...prev, notifyClientOnChat: e.target.checked }))}
                          className="h-3.5 w-3.5 text-green-600 rounded border-gray-300"
                        />
                        <Label htmlFor="notifyClientOnChat" className="text-xs cursor-pointer">
                          Notify Customer on chat
                        </Label>
                      </div>

                      <div>
                        <Label className="text-xs font-medium">Notify practitioner on task completion</Label>
                        <Input
                          type="text"
                          value={newTask.notifyDieticianOnCompletion}
                          onChange={(e) => setNewTask(prev => ({ ...prev, notifyDieticianOnCompletion: e.target.value }))}
                          className="mt-1 h-8 text-sm"
                          placeholder="Email or name"
                        />
                      </div>

                      <div>
                        <Label className="text-xs font-medium">Message</Label>
                        <Textarea
                          value={newTask.description}
                          onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                          className="mt-1 text-sm min-h-15"
                          placeholder="Write your message here"
                        />
                        <p className="text-[10px] text-orange-500 mt-1">
                          Note: Type #name to use as a placeholder for contact&apos;s name
                        </p>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8 text-xs"
                          onClick={() => {
                            setIsAddingTask(false);
                            setNewTask({
                              taskType: 'General Followup',
                              title: '',
                              description: '',
                              startDate: format(new Date(), 'yyyy-MM-dd'),
                              endDate: format(new Date(), 'yyyy-MM-dd'),
                              allottedTime: '12:00 AM',
                              repeatFrequency: 1,
                              notifyClientOnChat: false,
                              notifyDieticianOnCompletion: '',
                              status: 'pending'
                            });
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700"
                          onClick={handleSaveTask}
                          disabled={savingTask}
                        >
                          {savingTask ? 'Saving...' : 'Save'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Tasks List */}
                <div className="space-y-2">
                  {clientTasks.length === 0 && !isAddingTask ? (
                    <div className="text-center py-8">
                      <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">No tasks yet</p>
                      <p className="text-gray-400 text-xs mt-1">Create your first task</p>
                    </div>
                  ) : (
                    clientTasks.map((task, index) => (
                      <Card
                        key={task._id}
                        className="border-gray-200 hover:border-green-300 transition-all duration-200 hover:shadow-md cursor-pointer animate-in fade-in slide-in-from-right-2 group"
                        style={{ animationDelay: `${index * 50}ms` }}
                        onClick={() => handleOpenTaskDetail(task)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Badge variant="outline" className="text-[8px] px-1 py-0 text-gray-500">
                                  {task.taskType}
                                </Badge>
                                <Badge
                                  className={`text-[9px] px-1.5 py-0 ${task.status === 'completed' ? 'bg-green-100 text-green-700' :
                                    task.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                                      task.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                        'bg-yellow-100 text-yellow-700'
                                    }`}
                                >
                                  {task.status}
                                </Badge>
                              </div>
                              <p className="text-xs font-medium text-gray-900 mb-0.5">
                                {task.title || task.taskType}
                              </p>
                              <p className="text-[10px] text-gray-500">
                                {task.startDate ? format(new Date(task.startDate), 'MMM d') : ''} - {task.endDate ? format(new Date(task.endDate), 'MMM d, yyyy') : ''}
                              </p>
                            </div>

                            <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleDeleteTask(task._id!)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tags Slide-out Panel */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${isTagsOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/30"
          onClick={() => setIsTagsOpen(false)}
        />

        {/* Panel */}
        <div
          className={`fixed top-1/2 right-0 -translate-y-1/2 h-[85vh] w-full max-w-md bg-white shadow-2xl z-50 rounded-l-2xl overflow-hidden flex flex-col transition-transform duration-300 ease-out ${isTagsOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b bg-linear-to-r from-purple-50 to-white">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <Badge className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Manage Tags</h2>
                <p className="text-xs text-gray-500">{clientTagIds.length > 0 ? '1 tag assigned' : 'No tag assigned'}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 rounded-full hover:bg-gray-100"
              onClick={() => setIsTagsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Info Message */}
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700 flex items-start gap-2">
                <span className="mt-0.5 font-semibold">ℹ</span>
                <span><strong>Single tag only:</strong> You can assign only one tag at a time. To use a different tag, remove the current one first.</span>
              </p>
            </div>

            {loadingTags ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner className="h-6 w-6" />
              </div>
            ) : allTags.length === 0 ? (
              <div className="text-center py-8">
                <Badge className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">No tags available</p>
                <p className="text-gray-400 text-xs mt-1">Tags are created by admin</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Assigned Tags */}
                {clientTagIds.length > 0 && (
                  <>
                    <div className="mb-4">
                      <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Assigned Tags</h3>
                      <div className="space-y-2">
                        {allTags
                          .filter(tag => clientTagIds.includes(tag._id))
                          .map((tag) => (
                            <Card
                              key={tag._id}
                              className="border-2 border-purple-200 bg-purple-50 hover:shadow-md transition-all"
                            >
                              <CardContent className="p-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 flex-1">
                                    <div
                                      className="h-3 w-3 rounded-full"
                                      style={{ backgroundColor: tag.color || '#3B82F6' }}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900">{tag.name}</p>
                                      {tag.description && (
                                        <p className="text-xs text-gray-600 line-clamp-1">{tag.description}</p>
                                      )}
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-purple-600 hover:text-purple-700 hover:bg-purple-100"
                                    onClick={() => handleToggleClientTag(tag._id)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                      </div>
                    </div>
                    <div className="border-t border-gray-200 my-4" />
                  </>
                )}

                {/* Available Tags */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Available Tags</h3>
                  {allTags.filter(tag => !clientTagIds.includes(tag._id)).length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-gray-500 text-xs">All tags are assigned</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {allTags
                        .filter(tag => !clientTagIds.includes(tag._id))
                        .map((tag) => (
                          <Card
                            key={tag._id}
                            className="border-gray-200 hover:border-purple-300 transition-all duration-200 hover:shadow-md cursor-pointer group"
                            onClick={() => handleToggleClientTag(tag._id)}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-3 w-3 rounded-full shrink-0"
                                  style={{ backgroundColor: tag.color || '#3B82F6' }}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900">{tag.name}</p>
                                  {tag.description && (
                                    <p className="text-xs text-gray-600 line-clamp-1">{tag.description}</p>
                                  )}
                                </div>
                                <Plus className="h-4 w-4 text-gray-400 group-hover:text-purple-600 transition-colors shrink-0" />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image Lightbox for note attachments */}
      <ImageLightbox
        isOpen={noteLightboxOpen}
        onClose={() => setNoteLightboxOpen(false)}
        src={noteLightboxImage}
        alt="Note attachment"
      />
    </DashboardLayout>
  );
}

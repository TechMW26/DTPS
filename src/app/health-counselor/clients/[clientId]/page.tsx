'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
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
  AlertCircle,
  FileText,
  BookOpen,
  CreditCard,
  StickyNote,
  X,
  Plus,
  Eye,
  EyeOff,
  History,
  CheckSquare,
  ChevronLeft,
  Pencil,
  Trash2,
  Mic,
  Square,
  Play,
  Pause
} from 'lucide-react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { BasicInfoForm, type BasicInfoData } from '@/components/clients/BasicInfoForm';
import { MedicalForm, type MedicalData } from '@/components/clients/MedicalForm';
import { LifestyleForm, type LifestyleData } from '@/components/clients/LifestyleForm';
import { RecallForm, type RecallEntry } from '@/components/clients/RecallForm';
import FormsSection from '@/components/clientDashboard/FormsSection';
import { JournalSection } from '@/components/journal';
import ProgressSection from '@/components/clientDashboard/ProgressSection';
import PlanningSection from '@/components/clientDashboard/PlanningSection';
import BookingsSection from '@/components/clientDashboard/BookingsSection';
import PaymentsSection from '@/components/clientDashboard/PaymentsSection';
import DocumentsSection from '@/components/clientDashboard/DocumentsSection';
import HistorySection from '@/components/clientDashboard/HistorySection';
import ImageLightbox from '@/components/ui/image-lightbox';
import TasksSection from '@/components/clientDashboard/TasksSection';
import { useDataRefresh, DataEventTypes, emitDataChange } from '@/lib/events/useDataRefresh';

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
  sleepHours?: number | string;
  stressLevel?: string;
  smokingStatus?: string;
  alcoholConsumption?: string;
  waterIntake?: number | string;
  breakfast?: string;
  midMorningSnack?: string;
  lunch?: string;
  eveningSnack?: string;
  dinner?: string;
  dietaryNotes?: string;
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

export default function HealthCounselorClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('forms');
  const [activeTab, setActiveTab] = useState('basic-details');

  // Notes panel state
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [clientNotes, setClientNotes] = useState<ClientNote[]>([]);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNote, setNewNote] = useState<ClientNote>({
    topicType: 'General',
    date: format(new Date(), 'yyyy-MM-dd'),
    content: '',
    showToClient: false,
    attachments: []
  });
  const [savingNote, setSavingNote] = useState(false);
  const [selectedNote, setSelectedNote] = useState<ClientNote | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editNote, setEditNote] = useState<ClientNote>({
    topicType: 'General',
    date: '',
    content: '',
    showToClient: false,
    attachments: []
  });
  const [renewalStartDate, setRenewalStartDate] = useState('');
  const [renewalEndDate, setRenewalEndDate] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Lightbox state for note attachments
  const [noteLightboxOpen, setNoteLightboxOpen] = useState(false);
  const [noteLightboxImage, setNoteLightboxImage] = useState('');

  const openNoteLightbox = (url: string) => {
    setNoteLightboxImage(url);
    setNoteLightboxOpen(true);
  };

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Active plan state
  const [activePlan, setActivePlan] = useState<{
    name: string;
    startDate: string;
    endDate: string;
    duration: number;
    status: 'active' | 'inactive' | 'completed' | 'upcoming';
    hasMealPlan?: boolean;
  } | null>(null);

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

  useEffect(() => {
    if (params.clientId) {
      fetchClientDetails();
      fetchClientNotes();
      fetchActivePlan();
    }
  }, [params.clientId]);

  // Subscribe to form data events for real-time sync
  useDataRefresh(
    [
      DataEventTypes.BASIC_INFO_UPDATED,
      DataEventTypes.LIFESTYLE_INFO_UPDATED,
      DataEventTypes.MEDICAL_INFO_UPDATED,
      DataEventTypes.DIETARY_RECALL_UPDATED,
      DataEventTypes.FORM_DATA_UPDATED
    ],
    () => {
      fetchClientDetails();
      fetchActivePlan();
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

  const fetchActivePlan = async () => {
    try {
      const mealPlanRes = await fetch(`/api/client-meal-plans?clientId=${params.clientId}`);
      if (mealPlanRes.ok) {
        const data = await mealPlanRes.json();
        const mealPlans = data.mealPlans || [];

        const activePlans = mealPlans
          .filter((p: any) => p.status === 'active')
          .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

        if (activePlans.length > 0) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const currentlyRunningPlan = activePlans.find((plan: any) => {
            const planStart = new Date(plan.startDate);
            const planEnd = new Date(plan.endDate);
            planStart.setHours(0, 0, 0, 0);
            planEnd.setHours(23, 59, 59, 999);
            return today >= planStart && today <= planEnd;
          });

          if (currentlyRunningPlan) {
            const planDuration = Math.ceil(
              (new Date(currentlyRunningPlan.endDate).getTime() - new Date(currentlyRunningPlan.startDate).getTime()) / (1000 * 60 * 60 * 24)
            ) + 1;

            setActivePlan({
              name: currentlyRunningPlan.name || 'Wellness Plan',
              startDate: currentlyRunningPlan.startDate,
              endDate: currentlyRunningPlan.endDate,
              duration: planDuration,
              status: 'active',
              hasMealPlan: true
            });
            return;
          }
        }
      }
      setActivePlan(null);
    } catch (error) {
      console.error('Error fetching active plan:', error);
      setActivePlan(null);
    }
  };

  const fetchClientNotes = async () => {
    try {
      const response = await fetch(`/api/users/${params.clientId}/notes`, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        // Show all notes - health counselor can see all notes but can only delete their own
        setClientNotes(sortNotesByCreatedAt(data?.notes || []));
      }
    } catch (error) {
      console.error('Error fetching notes:', error);
    }
  };

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
        content: newNote.topicType === 'Renewal'
          ? `${newNote.content}\n\n[Renewal Period: ${format(new Date(renewalStartDate), 'MMM d, yyyy')} - ${format(new Date(renewalEndDate), 'MMM d, yyyy')}]`
          : newNote.content
      };

      const response = await fetch(`/api/users/${params.clientId}/notes`, {
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

  const handleDeleteNote = async (noteId: string) => {
    try {
      const response = await fetch(`/api/users/${params.clientId}/notes/${noteId}`, {
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

  // Upload media attachment for notes
  const handleMediaUpload = async (file: File) => {
    try {
      setUploadingMedia(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'note-attachment');

      const response = await fetch('/api/upload', {
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

  // Toggle note visibility to client
  const handleToggleNoteVisibility = async (noteId: string, showToClient: boolean) => {
    try {
      const response = await fetch(`/api/users/${params.clientId}/notes/${noteId}`, {
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

  // Update note
  const handleUpdateNote = async () => {
    if (!selectedNote?._id || !editNote.content.trim()) {
      toast.error('Please fill in notes content');
      return;
    }

    try {
      setSavingNote(true);
      const response = await fetch(`/api/users/${params.clientId}/notes/${selectedNote._id}`, {
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

  const fetchClientDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/users/${params.clientId}`);
      if (response.ok) {
        const data = await response.json();
        setClient(data?.user);

        // Populate form states
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
          heightFeet: data?.user?.heightFeet || '',
          heightInch: data?.user?.heightInch || '',
          heightCm: String(data?.user?.heightCm || data?.user?.height || ''),
          weightKg: String(data?.user?.weightKg || data?.user?.weight || ''),
          targetWeightKg: data?.user?.targetWeightKg || '',
          idealWeightKg: data?.user?.idealWeightKg || '',
          bmi: data?.user?.bmi || '',
          activityLevel: data?.user?.activityLevel || ''
        });

        // Fetch lifestyle data from separate API
        const lifestyleResponse = await fetch(`/api/users/${params.clientId}/lifestyle`);
        let lifestyleInfo = null;
        if (lifestyleResponse.ok) {
          const lifestyleDataResponse = await lifestyleResponse.json();
          lifestyleInfo = lifestyleDataResponse?.lifestyleInfo;
        }

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

        // Fetch medical data from separate API
        const medicalResponse = await fetch(`/api/users/${params.clientId}/medical`);
        let medicalInfo = null;
        if (medicalResponse.ok) {
          const medicalData = await medicalResponse.json();
          medicalInfo = medicalData?.medicalInfo;
        }

        setMedicalData({
          medicalConditions: (medicalInfo?.medicalConditions || data?.user?.medicalConditions || []).join(', '),
          allergies: (medicalInfo?.allergies || data?.user?.allergies || []).join(', '),
          dietaryRestrictions: (medicalInfo?.dietaryRestrictions || data?.user?.dietaryRestrictions || []).join(', '),
          notes: medicalInfo?.notes || data?.user?.notes || '',
          diseaseHistory: medicalInfo?.diseaseHistory || data?.user?.diseaseHistory || [],
          medicalHistory: medicalInfo?.medicalHistory || data?.user?.medicalHistory || '',
          familyHistory: medicalInfo?.familyHistory || data?.user?.familyHistory || '',
          medication: medicalInfo?.medication || data?.user?.medication || '',
          bloodGroup: medicalInfo?.bloodGroup || data?.user?.bloodGroup || '',
          gutIssues: medicalInfo?.gutIssues || data?.user?.gutIssues || [],
          reports: medicalInfo?.reports || data?.user?.reports || [],
          isPregnant: medicalInfo?.isPregnant || data?.user?.isPregnant || false,
          isLactating: medicalInfo?.isLactating || data?.user?.isLactating || false,
          menstrualCycle: medicalInfo?.menstrualCycle || data?.user?.menstrualCycle || '',
          bloodFlow: medicalInfo?.bloodFlow || data?.user?.bloodFlow || ''
        });

        // Load dietary recall entries from dedicated API
        const recallResponse = await fetch(`/api/users/${params.clientId}/recall`, { cache: 'no-store' });
        if (recallResponse.ok) {
          const recallData = await recallResponse.json();
          const loadedEntries = Array.isArray(recallData?.entries) ? recallData.entries : [];
          if (loadedEntries.length > 0) {
            setRecallEntries(loadedEntries);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching client:', error);
    } finally {
      setLoading(false);
    }
  };

  // Health counselors CAN edit client form data (basic info, medical, lifestyle)
  const handleSave = async () => {
    try {
      // Prepare the data to save
      const updateData = {
        // Basic Info (email/phone are immutable)
        firstName: basicInfo.firstName,
        lastName: basicInfo.lastName,
        dateOfBirth: basicInfo.dateOfBirth,
        gender: basicInfo.gender,
        parentAccount: basicInfo.parentAccount,
        alternativePhone: basicInfo.altPhone,
        alternativeEmail: basicInfo.altEmails,
        anniversary: basicInfo.anniversary,
        source: basicInfo.source,
        referralSource: basicInfo.referralSource,
        generalGoal: basicInfo.generalGoal,
        maritalStatus: basicInfo.maritalStatus,
        occupation: basicInfo.occupation,
        healthGoals: basicInfo.goalsList,
        targetWeightBucket: basicInfo.targetWeightBucket,
        sharePhotoConsent: basicInfo.sharePhotoConsent,
        // Summary values
        height: basicInfo.heightCm,
        weight: basicInfo.weightKg,
      };

      const response = await fetch(`/api/users/${params.clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const error = await response.json();
        toast.error(error.error || 'Failed to save client data');
        return;
      }

      const lifestylePayload = {
        heightFeet: basicInfo.heightFeet,
        heightInch: basicInfo.heightInch,
        heightCm: basicInfo.heightCm,
        weightKg: basicInfo.weightKg,
        targetWeightKg: basicInfo.targetWeightKg,
        idealWeightKg: basicInfo.idealWeightKg,
        bmi: basicInfo.bmi,
        activityLevel: basicInfo.activityLevel,
        activityRate: lifestyleData.activityRate,
        foodPreference: lifestyleData.foodPreference,
        preferredCuisine: lifestyleData.preferredCuisine,
        allergiesFood: lifestyleData.allergiesFood,
        fastDays: lifestyleData.fastDays,
        nonVegExemptDays: lifestyleData.nonVegExemptDays,
        foodLikes: lifestyleData.foodLikes,
        foodDislikes: lifestyleData.foodDislikes,
        eatOutFrequency: lifestyleData.eatOutFrequency,
        smokingFrequency: lifestyleData.smokingFrequency,
        alcoholFrequency: lifestyleData.alcoholFrequency,
        cookingOil: lifestyleData.cookingOil,
        monthlyOilConsumption: lifestyleData.monthlyOilConsumption,
        cookingSalt: lifestyleData.cookingSalt,
        carbonatedBeverageFrequency: lifestyleData.carbonatedBeverageFrequency,
        cravingType: lifestyleData.cravingType,
        sleepPattern: lifestyleData.sleepPattern,
        stressLevel: lifestyleData.stressLevel,
      };

      const lifestyleResponse = await fetch(`/api/users/${params.clientId}/lifestyle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lifestylePayload)
      });

      if (!lifestyleResponse.ok) {
        console.error('Failed to save lifestyle data');
      }

      const medicalPayload = {
        medicalConditions: medicalData.medicalConditions.split(',').map(s => s.trim()).filter(Boolean),
        allergies: medicalData.allergies.split(',').map(s => s.trim()).filter(Boolean),
        dietaryRestrictions: medicalData.dietaryRestrictions.split(',').map(s => s.trim()).filter(Boolean),
        notes: medicalData.notes,
        diseaseHistory: medicalData.diseaseHistory,
        medicalHistory: medicalData.medicalHistory,
        familyHistory: medicalData.familyHistory,
        medication: medicalData.medication,
        bloodGroup: medicalData.bloodGroup,
        gutIssues: medicalData.gutIssues,
        reports: medicalData.reports,
        isPregnant: medicalData.isPregnant,
        isLactating: medicalData.isLactating,
        menstrualCycle: medicalData.menstrualCycle,
        bloodFlow: medicalData.bloodFlow,
      };

      const medicalResponse = await fetch(`/api/users/${params.clientId}/medical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(medicalPayload)
      });

      if (!medicalResponse.ok) {
        console.error('Failed to save medical data');
      }

      toast.success('Client data saved successfully');

      // Emit form data updated event for real-time sync
      emitDataChange(DataEventTypes.FORM_DATA_UPDATED, {
        clientId: params.clientId,
        updatedFields: ['basic', 'lifestyle', 'medical']
      });

      fetchClientDetails();
    } catch (error) {
      console.error('Error saving client data:', error);
      toast.error('Error saving client data');
    }
  };

  // Health counselors CAN edit dietary recall entries
  const handleSaveRecallEntry = async (entry: RecallEntry) => {
    try {
      const updatedEntries = recallEntries.map(e =>
        e.id === entry.id ? entry : e
      );

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
        toast.success('Recall entry saved');
        fetchClientDetails();
      } else {
        toast.error('Failed to save recall entry');
      }
    } catch (error) {
      console.error('Error saving recall entry:', error);
      toast.error('Error saving recall entry');
    }
  };

  const handleDeleteRecallEntry = async (entryId: string) => {
    try {
      const updatedEntries = recallEntries.filter(e => e.id !== entryId);
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
        toast.success('Recall entry deleted');
        fetchClientDetails();
      } else {
        toast.error('Failed to delete recall entry');
      }
    } catch (error) {
      console.error('Error deleting recall entry:', error);
      toast.error('Error deleting recall entry');
    }
  };

  const calculateAge = (dateString: string | undefined) => {
    if (!dateString) return null;
    try {
      const birthDate = new Date(dateString);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
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
      if (isNaN(date.getTime())) return 'N/A';
      return format(date, 'MMM d, yyyy');
    } catch (error) {
      return 'N/A';
    }
  };

  const formatLastSeen = (dateString: string | undefined) => {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Never';
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
      return 'Never';
    }
  };

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
              <Button onClick={() => router.push('/health-counselor/clients')}>
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
        <div className="flex-1 overflow-y-auto bg-white">
          {/* Navigation */}
          <div className="w-full bg-gray-50 border-b border-gray-200 sticky top-0 z-20">
            <div className="max-w-full px-8 py-2 flex items-center justify-around gap-2 overflow-x-auto">
              <Button variant="ghost" size="sm" asChild className="mr-4">
                <Link href="/health-counselor/clients">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Link>
              </Button>

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
                Planning (View Only)
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
                <CheckSquare className="h-4 w-4" />
                Tasks
              </button>

              <button
                onClick={() => setActiveSection('history')}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg whitespace-nowrap transition-colors ${activeSection === 'history'
                  ? 'text-blue-700 bg-blue-50 border border-blue-200 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
              >
                <History className="h-4 w-4" />
                History
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Client Header */}
            <div className="mb-6">
              <div className="flex items-start justify-between gap-6">
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
                        <span className={`inline-block h-2 w-2 rounded-full ${activePlan?.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <span className="capitalize">{activePlan?.status === 'active' ? 'Active' : 'Inactive'}</span>
                        <span className="text-gray-300">•</span>
                        <span>Last seen: {formatLastSeen(client?.lastLoginAt || client?.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <span>Dietitian: {(() => {
                          // Check singular
                          if (client.assignedDietitian?.firstName || client.assignedDietitian?.lastName) {
                            return `${client.assignedDietitian?.firstName || ''} ${client.assignedDietitian?.lastName || ''}`.trim();
                          }
                          // Check plural array
                          if (client.assignedDietitians && client.assignedDietitians.length > 0) {
                            const names = client.assignedDietitians.filter(d => d?.firstName || d?.lastName).map(d => `${d?.firstName || ''} ${d?.lastName || ''}`.trim());
                            return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
                          }
                          return 'Not Assigned';
                        })()}</span>
                        <span className="text-gray-300">•</span>
                        <span>Health Counselor: {(() => {
                          // Check singular
                          if (client.assignedHealthCounselor?.firstName || client.assignedHealthCounselor?.lastName) {
                            return `${client.assignedHealthCounselor?.firstName || ''} ${client.assignedHealthCounselor?.lastName || ''}`.trim();
                          }
                          // Check plural array
                          if (client.assignedHealthCounselors && client.assignedHealthCounselors.length > 0) {
                            const names = client.assignedHealthCounselors.filter(hc => hc?.firstName || hc?.lastName).map(hc => `${hc?.firstName || ''} ${hc?.lastName || ''}`.trim());
                            return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
                          }
                          return 'Not Assigned';
                        })()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
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
                </div>
              </div>

              {/* Program Banner */}
              {activePlan ? (
                <div className="mt-5 rounded-2xl bg-linear-to-r from-slate-600 via-slate-500 to-slate-400 px-6 py-5 shadow-lg">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${activePlan.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'}`}></div>
                        <p className="text-sm font-medium text-slate-300 uppercase tracking-wide">
                          {activePlan.status === 'active' ? 'Currently Running' : 'Program Status'}
                        </p>
                      </div>
                      <h2 className="mt-2 text-xl text-white font-bold">{activePlan.name}</h2>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div className="rounded-xl bg-linear-to-br from-cyan-500 to-blue-600 px-4 py-3 shadow-md">
                        <p className="text-xs font-medium text-cyan-100 uppercase tracking-wide">Duration</p>
                        <p className="mt-1.5 text-lg font-bold text-white">{activePlan.duration} days</p>
                      </div>
                      <div className="rounded-xl bg-linear-to-br from-violet-500 to-purple-600 px-4 py-3 shadow-md">
                        <p className="text-xs font-medium text-violet-100 uppercase tracking-wide">Plan dates</p>
                        <p className="mt-1.5 text-sm font-semibold text-white">
                          {formatDate(activePlan.startDate)} – {formatDate(activePlan.endDate)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-linear-to-br from-emerald-500 to-green-600 px-4 py-3 shadow-md">
                        <p className="text-xs font-medium text-emerald-100 uppercase tracking-wide">Status</p>
                        <Badge className="mt-1.5 bg-white/20 backdrop-blur-sm border border-white/30 text-[11px] text-white font-semibold">
                          {activePlan.status === 'active' ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl bg-linear-to-r from-gray-500 via-gray-400 to-gray-300 px-6 py-5 shadow-lg">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-red-400"></div>
                    <p className="text-sm font-medium text-gray-200 uppercase tracking-wide">No Active Program</p>
                  </div>
                  <h2 className="mt-2 text-xl text-white font-bold">No Plan</h2>
                </div>
              )}
            </div>

            {/* Section Content */}
            {activeSection === 'forms' && (
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
                loading={loading}
                clientId={params.clientId as string}
                userRole="health_counselor"
              />
            )}

            {activeSection === 'journal' && (
              <JournalSection clientId={params.clientId as string} />
            )}

            {activeSection === 'planning' && (
              <div data-section="planning">
                <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    <strong>View Only:</strong> Health counselors can view meal plans but cannot create, edit, or delete them.
                  </p>
                </div>
                <PlanningSection client={client} viewOnly={true} />
              </div>
            )}

            {activeSection === 'payments' && (
              <div data-section="payments">
                <PaymentsSection client={client} formatDate={formatDate} />
              </div>
            )}

            {activeSection === 'bookings' && (
              <BookingsSection
                clientId={client._id}
                clientName={`${client.firstName} ${client.lastName}`}
                userRole="health_counselor"
                dietitianId={client.assignedDietitian?._id}
              />
            )}

            {activeSection === 'documents' && (
              <DocumentsSection client={client} formatDate={formatDate} />
            )}

            {activeSection === 'tasks' && (
              <TasksSection
                clientId={params.clientId as string}
                clientName={`${client?.firstName} ${client?.lastName}`}
                dietitianEmail={session?.user?.email}
                userRole="health_counselor"
              />
            )}

            {activeSection === 'history' && (
              <HistorySection clientId={params.clientId as string} />
            )}
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
                                    <img src={att.url} alt={att.filename || 'Image'} className="h-24 w-24 object-cover rounded-lg border shadow-sm hover:shadow-md transition-shadow" />
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
                        {selectedNote.createdBy?._id === (session?.user as any)?.id && (
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

                                      await handleMediaUpload(file);

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
                                <img src={att.url} alt={att.filename} className="h-16 w-16 object-cover rounded border" />
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
                              {note.createdBy?._id === (session?.user as any)?.id && (
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

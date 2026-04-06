'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Scale,
  Activity,
  Ruler,
  Camera,
  Plus,
  Target,
  Flame,
  Droplets,
  Calendar,
  Edit3,
  Trash2,
  User
} from 'lucide-react';
import { format, subDays, subMonths, subYears } from 'date-fns';
import { toast } from 'sonner';
import SpoonGifLoader from '@/components/ui/SpoonGifLoader';
import { compressImage } from '@/lib/imageCompression';
import { socketClient } from '@/lib/realtime/socket-client';
import { SOCKET_EVENTS } from '@/lib/realtime/socket-events';

type TimeRange = '1W' | '1M' | '3M' | '6M' | '1Y';

interface MeasurementEntry {
  date: string;
  waist?: number;
  hips?: number;
  chest?: number;
  arms?: number;
  thighs?: number;
}
interface UserProfile {
  bmi: string;
  bmiCategory: string;
  weightKg: string;
  heightCm: string;
  generalGoal: string;
}
interface TransformationPhoto {
  _id: string;
  url: string;
  date: string;
  notes: string;
  side?: 'front' | 'back' | 'right-side' | 'left-side';
}

interface ProgressData {
  currentWeight: number;
  startWeight: number;
  targetWeight: number;
  weightChange: number;
  bmi: number;
  heightCm?: number;
  progressPercent: number;
  weightHistory: Array<{ date: string; weight: number }>;
  measurements: {
    waist: number;
    hips: number;
    chest: number;
    arms: number;
    thighs: number;
  };
  todayMeasurements?: {
    waist: number;
    hips: number;
    chest: number;
    arms: number;
    thighs: number;
  };
  measurementHistory: MeasurementEntry[];
  lastMeasurementDate?: string;
  canAddMeasurement?: boolean;
  daysUntilNextMeasurement?: number;
  goals: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    water?: number;
    steps?: number;
  };
  todayIntake?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  calorieHistory?: Array<{ date: string; calories: number }>;
  nutritionHistory?: Array<{ date: string; calories: number; protein: number; carbs: number; fat: number }>;
  transformationPhotos?: TransformationPhoto[];
}

// Time Range Filter Component
function TimeRangeFilter({
  value,
  onChange
}: {
  value: TimeRange;
  onChange: (v: TimeRange) => void
}) {
  const options: TimeRange[] = ['1W', '1M', '3M', '6M', '1Y'];

  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${value === option
            ? 'bg-[#E06A26] text-white shadow-sm'
            : 'text-gray-600 hover:bg-gray-200'
            }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

// Simple Line Chart Component
function LineChart({
  data,
  height = 120,
  color = '#3AB1A0',
  labels = []
}: {
  data: number[],
  height?: number,
  color?: string,
  labels?: string[]
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        Not enough data to display chart
      </div>
    );
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const paddingY = 15;
  const paddingX = 20; // Add horizontal padding to prevent edge cutoff
  const chartWidth = 300;
  const chartHeight = height - paddingY * 2;
  const totalWidth = chartWidth + paddingX * 2;

  const points = data.map((value, index) => {
    const x = paddingX + (index / (data.length - 1)) * chartWidth;
    const y = chartHeight - ((value - min) / range) * chartHeight + paddingY;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `${paddingX},${chartHeight + paddingY} ${points} ${paddingX + chartWidth},${chartHeight + paddingY}`;

  return (
    <div className="overflow-visible">
      <svg viewBox={`0 0 ${totalWidth} ${height}`} className="w-full h-auto overflow-visible" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={`areaGradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        <polygon points={areaPoints} fill={`url(#areaGradient-${color})`} />

        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {data.map((value, index) => {
          const x = paddingX + (index / (data.length - 1)) * chartWidth;
          const y = chartHeight - ((value - min) / range) * chartHeight + paddingY;
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="4"
              fill="white"
              stroke={color}
              strokeWidth="2"
            />
          );
        })}
      </svg>
      {labels.length > 0 && (
        <div className="flex justify-between px-5 mt-2">
          {labels.map((label, i) => (
            <span key={i} className="text-[11px] text-gray-500 font-medium">{label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Circular Progress Component
function CircularProgress({
  value,
  max,
  size = 80,
  strokeWidth = 8,
  color = '#3AB1A0',
  label,
  unit
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label: string;
  unit: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value / max, 1);
  const offset = circumference - progress * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-gray-900">{value}</span>
          <span className="text-xs text-gray-500">{unit}</span>
        </div>
      </div>
      <span className="mt-2 text-xs font-medium text-gray-600">{label}</span>
    </div>
  );
}

// Macro Bar Component
function MacroBar({
  label,
  value,
  max,
  color,
  icon: Icon
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  icon: React.ElementType;
}) {
  const progress = Math.min((value / max) * 100, 100);

  return (
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color.replace('bg-', 'bg-').replace('-500', '-100')}`}>
        <Icon className={`w-5 h-5 ${color.replace('bg-', 'text-')}`} />
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          <span className="text-sm text-gray-500">{value}g / {max}g</span>
        </div>
        <div className="h-2 overflow-hidden bg-gray-100 rounded-full">
          <div
            className={`h-full rounded-full ${color}`}
            style={{ width: `${progress}%`, transition: 'width 0.5s ease' }}
          />
        </div>
      </div>
    </div>
  );
}

// Helper function to get date range
function getDateRange(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case '1W': return subDays(now, 7);
    case '1M': return subMonths(now, 1);
    case '3M': return subMonths(now, 3);
    case '6M': return subMonths(now, 6);
    case '1Y': return subYears(now, 1);
    default: return subDays(now, 7);
  }
}

export default function UserProgressPage() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showMeasurementsModal, setShowMeasurementsModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showMeasurementReminderPopup, setShowMeasurementReminderPopup] = useState(false);
  const [showMeasurementRestrictionPopup, setShowMeasurementRestrictionPopup] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [measurements, setMeasurements] = useState({
    waist: '',
    hips: '',
    chest: '',
    arms: '',
    thighs: ''
  });
  const [photoNotes, setPhotoNotes] = useState('');
  const [photoSide, setPhotoSide] = useState<'front' | 'back' | 'right-side' | 'left-side'>('front');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'weight' | 'nutrition' | 'body'>('weight');
  const [timeRange, setTimeRange] = useState<TimeRange>('1W');
  const [selectedPhoto, setSelectedPhoto] = useState<TransformationPhoto | null>(null);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchProgressData();
    }
  }, [session, timeRange]);

  // Realtime: keep weight cards/list updated instantly when weight changes
  useEffect(() => {
    const currentUserId = String(session?.user?.id || '');
    if (!currentUserId) return;

    const unsubscribe = socketClient.on(SOCKET_EVENTS.CLIENT_WEIGHT_UPDATED, (payload: any) => {
      const incomingClientId = String(payload?.clientId || '');
      const nextWeight = Number(payload?.weightKg);
      if (!incomingClientId || incomingClientId !== currentUserId) return;
      if (!Number.isFinite(nextWeight) || nextWeight <= 0) return;

      const updatedAt = payload?.updatedAt || new Date().toISOString();

      setProgressData(prev => {
        if (!prev) return prev;

        const currentHistory = Array.isArray(prev.weightHistory) ? prev.weightHistory : [];
        const appended = [{ date: updatedAt, weight: nextWeight }, ...currentHistory];

        const uniqueHistory = appended.filter((entry, index, arr) =>
          index === arr.findIndex(e => e.date === entry.date && e.weight === entry.weight)
        );

        return {
          ...prev,
          currentWeight: nextWeight,
          weightHistory: uniqueHistory,
        };
      });
    });

    return () => {
      unsubscribe();
    };
  }, [session?.user?.id]);

  const fetchProgressData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/client/progress?range=${timeRange}&allWeights=true`, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();

        // Set the progress data to state
        setProgressData(data);

        if (data.measurements) {
          setMeasurements({
            waist: data.measurements.waist?.toString() || '',
            hips: data.measurements.hips?.toString() || '',
            chest: data.measurements.chest?.toString() || '',
            arms: data.measurements.arms?.toString() || '',
            thighs: data.measurements.thighs?.toString() || ''
          });
        }
        // Check if it's time to remind user to add measurements (7 days passed)
        if (data.canAddMeasurement && data.lastMeasurementDate) {
          const lastMeasDate = new Date(data.lastMeasurementDate);
          const daysSince = Math.floor((new Date().getTime() - lastMeasDate.getTime()) / (24 * 60 * 60 * 1000));
          if (daysSince >= 7) {
            // Show reminder popup once per session
            const reminderShown = sessionStorage.getItem('measurementReminderShown');
            if (!reminderShown) {
              setShowMeasurementReminderPopup(true);
              sessionStorage.setItem('measurementReminderShown', 'true');
            }
          }
        }
      }

      // Fetch user profile data (BMI, weight, height, etc.)
      try {
        const profileRes = await fetch('/api/client/profile', { cache: 'no-store' });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setUserProfile({
            bmi: profileData.bmi || '',
            bmiCategory: profileData.bmiCategory || '',
            weightKg: profileData.weightKg || '',
            heightCm: profileData.heightCm || '',
            generalGoal: profileData.generalGoal || ''
          });
        }
      } catch (profileError) {
        console.error('Error fetching profile:', profileError);
      }
    } catch (error) {
      console.error('Error fetching progress:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handler for Add Measurement button click
  const handleAddMeasurementClick = () => {
    if (progressData?.canAddMeasurement === false) {
      setShowMeasurementRestrictionPopup(true);
    } else {
      setShowMeasurementsModal(true);
    }
  };

  const handleLogWeight = async () => {
    if (!newWeight || isNaN(parseFloat(newWeight))) {
      toast.error('Please enter a valid weight');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/client/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'weight',
          value: parseFloat(newWeight)
        })
      });

      if (response.ok) {
        const result = await response.json();
        const savedWeight = parseFloat(newWeight);
        const savedDate = result?.entry?.recordedAt || new Date().toISOString();

        // Optimistic local update so list shows immediately
        setProgressData(prev => {
          if (!prev || !Number.isFinite(savedWeight) || savedWeight <= 0) return prev;

          const currentHistory = Array.isArray(prev.weightHistory) ? prev.weightHistory : [];
          const nextHistory = [{ date: savedDate, weight: savedWeight }, ...currentHistory];

          return {
            ...prev,
            currentWeight: savedWeight,
            weightHistory: nextHistory,
          };
        });

        // Also update BMI by updating profile weight
        // Do NOT update profile/basic form weight here.
        // Progress weight logs must remain independent.

        toast.success('Weight logged successfully!');
        setShowWeightModal(false);
        setNewWeight('');
        fetchProgressData();
      } else {
        toast.error('Failed to log weight');
      }
    } catch (error) {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }

  };

  const handleSaveMeasurements = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/client/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'measurements',
          measurements: {
            waist: parseFloat(measurements.waist) || 0,
            hips: parseFloat(measurements.hips) || 0,
            chest: parseFloat(measurements.chest) || 0,
            arms: parseFloat(measurements.arms) || 0,
            thighs: parseFloat(measurements.thighs) || 0
          }
        })
      });

      if (response.ok) {
        toast.success('Measurements saved successfully!');
        setShowMeasurementsModal(false);
        fetchProgressData();
      } else {
        toast.error('Failed to save measurements');
      }
    } catch (error) {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a JPEG, PNG, or WebP image');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image size must be less than 10MB');
      return;
    }

    setUploadingPhoto(true);
    try {
      // Compress image before upload
      toast.info('Compressing image...');
      const compressed = await compressImage(file, {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.85,
        format: 'image/webp'
      });

      // Use the compressed blob directly (compressImage returns { blob, dataUrl, ... })
      const compressedFile = new File([compressed.blob], `transformation-${Date.now()}.webp`, { type: 'image/webp' });

      // Upload the compressed file
      const formData = new FormData();
      formData.append('file', compressedFile);
      formData.append('type', 'progress');

      toast.info('Uploading to cloud...');
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!uploadRes.ok) {
        toast.error('Failed to upload image');
        return;
      }

      const uploadResult = await uploadRes.json();
      const photoUrl = uploadResult.url || `/api/files/${uploadResult.fileId || uploadResult._id}`;

      // Save the photo entry
      const saveRes = await fetch('/api/client/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'photo',
          photoUrl: photoUrl,
          notes: photoNotes,
          side: photoSide
        })
      });

      if (saveRes.ok) {
        toast.success('Photo added successfully!');
        setShowPhotoModal(false);
        setPhotoNotes('');
        setPhotoSide('front');
        fetchProgressData();
      } else {
        toast.error('Failed to save photo');
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast.error('Something went wrong');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm('Are you sure you want to delete this photo?')) return;

    try {
      const response = await fetch(`/api/client/progress?id=${photoId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Photo deleted successfully');
        fetchProgressData();
        setShowPhotoViewer(false);
        setSelectedPhoto(null);
      } else {
        toast.error('Failed to delete photo');
      }
    } catch (error) {
      toast.error('Something went wrong');
    }
  };

  // Default data if no API data
  const data: ProgressData = progressData || {
    currentWeight: 0,
    startWeight: 0,
    targetWeight: 0,
    weightChange: 0,
    bmi: 0,
    progressPercent: 0,
    weightHistory: [],
    measurements: { waist: 0, hips: 0, chest: 0, arms: 0, thighs: 0 },
    todayMeasurements: { waist: 0, hips: 0, chest: 0, arms: 0, thighs: 0 },
    measurementHistory: [],
    goals: { calories: 2000, protein: 120, carbs: 250, fat: 65, water: 8, steps: 10000 },
    todayIntake: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    calorieHistory: [],
    transformationPhotos: []
  };

  // Use today's measurements if available, otherwise use latest measurements
  const displayMeasurements = data.todayMeasurements &&
    (data.todayMeasurements.waist || data.todayMeasurements.hips || data.todayMeasurements.chest || data.todayMeasurements.arms || data.todayMeasurements.thighs)
    ? data.todayMeasurements
    : data.measurements;

  const weightToGo = Math.max(0, data.currentWeight - data.targetWeight);

  // Filter data based on time range
  const filteredWeightHistory = useMemo(() => {
    const startDate = getDateRange(timeRange);
    return data.weightHistory
      .filter(entry => new Date(entry.date) >= startDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data.weightHistory, timeRange]);

  const allWeightHistoryNewestFirst = useMemo(() => {
    return [...data.weightHistory].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [data.weightHistory]);

  const filteredMeasurementHistory = useMemo(() => {
    return [...(data.measurementHistory || [])].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [data.measurementHistory]);

  const filteredCalorieHistory = useMemo(() => {
    const startDate = getDateRange(timeRange);
    return (data.calorieHistory || []).filter(entry => new Date(entry.date) >= startDate);
  }, [data.calorieHistory, timeRange]);

  // Filter nutrition history for macros charts
  const filteredNutritionHistory = useMemo(() => {
    const startDate = getDateRange(timeRange);
    return (data.nutritionHistory || []).filter(entry => new Date(entry.date) >= startDate);
  }, [data.nutritionHistory, timeRange]);

  // Chart data
  const weightChartData = filteredWeightHistory.length > 1
    ? filteredWeightHistory.map(e => e.weight)
    : data.currentWeight > 0 ? [data.currentWeight] : [];

  const weightChartLabels = filteredWeightHistory.length > 1
    ? filteredWeightHistory.map(e => format(new Date(e.date), 'dd'))
    : [];

  const calorieChartData = filteredCalorieHistory.length > 1
    ? filteredCalorieHistory.map(e => e.calories)
    : [];

  const calorieChartLabels = filteredCalorieHistory.length > 1
    ? filteredCalorieHistory.map(e => format(new Date(e.date), 'dd'))
    : [];

  // Macros chart data
  const proteinChartData = filteredNutritionHistory.length > 1
    ? filteredNutritionHistory.map(e => e.protein)
    : [];

  const carbsChartData = filteredNutritionHistory.length > 1
    ? filteredNutritionHistory.map(e => e.carbs)
    : [];

  const fatChartData = filteredNutritionHistory.length > 1
    ? filteredNutritionHistory.map(e => e.fat)
    : [];

  const macroChartLabels = filteredNutritionHistory.length > 1
    ? filteredNutritionHistory.map(e => format(new Date(e.date), 'dd'))
    : [];

  // Get waist history for body measurements chart
  const waistChartData = filteredMeasurementHistory.length > 0
    ? filteredMeasurementHistory.filter(e => e.waist).map(e => e.waist!)
    : [];

  const waistChartLabels = filteredMeasurementHistory.length > 0
    ? filteredMeasurementHistory.filter(e => e.waist).map(e => format(new Date(e.date), 'dd'))
    : [];

  // BMI calculation - calculate from height and weight if not provided by API
  const calculateBMI = (weightKg: number, heightCm: number): number => {
    if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) return 0;
    const heightM = heightCm / 100;
    const bmi = weightKg / (heightM * heightM);
    return Math.round(bmi * 10) / 10;
  };

  // Use API BMI or calculate from height/weight
  const calculatedBmi = data.bmi && data.bmi > 0
    ? data.bmi
    : calculateBMI(data.currentWeight, data.heightCm || 0);

  // BMI display value - ensure it's properly formatted and reasonable
  const bmiValue = calculatedBmi && !isNaN(calculatedBmi) && calculatedBmi > 10 && calculatedBmi < 60
    ? calculatedBmi.toFixed(1)
    : '--';

  if (status === 'loading' || loading) {
    return (
      <div className={`fixed inset-0 flex items-center justify-center z-100 ${isDarkMode ? 'bg-gray-950' : 'bg-white'}`}>
        <SpoonGifLoader size="lg" />
      </div>
    );
  }
  return (
    <div className={`min-h-screen pb-24 transition-colors duration-300 ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`border-b transition-colors duration-300 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/user"
              className={`p-2 -ml-2 transition-colors rounded-xl ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
            >
              <ArrowLeft className={`w-5 h-5 ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`} />
            </Link>
            <h1 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-black'}`}>My Progress</h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pb-3">
          {[
            { id: 'weight', label: 'Weight', icon: Scale },
            { id: 'nutrition', label: 'Nutrition', icon: Flame },
            { id: 'body', label: 'Body', icon: Ruler }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab.id
                ? 'bg-[#E06A26] text-white shadow-lg shadow-[#E06A26]/25'
                : isDarkMode
                  ? 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Time Range Filter - shown for weight and nutrition tabs only */}
        {activeTab !== 'body' && (
          <div className={`p-3 shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
          </div>
        )}

        {/* Weight Tab */}
        {activeTab === 'weight' && (
          <>
            {/* Weight Overview Card */}
            <div className="bg-linear-to-br from-[#3AB1A0] to-[#2a9989] rounded-3xl p-5 text-white shadow-xl">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-sm text-white/70">Current Weight</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{data.currentWeight || '--'}</span>
                    <span className="text-lg opacity-70">kg</span>
                  </div>
                  {data.weightChange !== 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      {data.weightChange < 0 ? (
                        <TrendingDown className="w-4 h-4 text-green-200" />
                      ) : (
                        <TrendingUp className="w-4 h-4 text-red-200" />
                      )}
                      <span className="text-sm">
                        {Math.abs(data.weightChange)} kg this week
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowWeightModal(true)}
                  className="p-3 transition-colors bg-white/20 hover:bg-white/30 rounded-xl"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {/* Progress Bar */}
              <div className="h-3 mb-2 rounded-full bg-white/20">
                <div
                  className="h-3 transition-all duration-500 bg-white rounded-full"
                  style={{ width: `${Math.min(data.progressPercent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-sm">
                <span>Start: {data.startWeight || '--'} kg</span>
                <span className="font-medium">{data.progressPercent}% to goal</span>
                <span>Goal: {data.targetWeight || '--'} kg</span>
              </div>
            </div>

            {/* Weight Chart */}
            <div className={`p-4 shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Weight Trend</h3>
                <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                  {timeRange === '1W' ? 'Last 7 days' :
                    timeRange === '1M' ? 'Last month' :
                      timeRange === '3M' ? 'Last 3 months' :
                        timeRange === '6M' ? 'Last 6 months' : 'Last year'}
                </span>
              </div>
              <div className="h-38">
                {weightChartData.length > 1 ? (
                  <LineChart data={weightChartData} color="#3AB1A0" labels={weightChartLabels} />
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-gray-400">
                    Not enough data to display chart
                  </div>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className={`p-4 text-center shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                <Scale className="w-6 h-6 text-[#3AB1A0] mx-auto mb-2" />
                <p className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{bmiValue}</p>
                <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>BMI</p>
              </div>
              <div className={`p-4 text-center shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                <Target className="w-6 h-6 text-[#E06A26] mx-auto mb-2" />
                <p className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{weightToGo.toFixed(1)}</p>
                <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>kg to go</p>
              </div>
              <div className={`p-4 text-center shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                <Calendar className="w-6 h-6 text-[#DB9C6E] mx-auto mb-2" />
                <p className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{data.weightHistory.length}</p>
                <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>entries</p>
              </div>
            </div>

            {/* BMI Card - Show if BMI is available */}
            {/* BMI Card */}
            {userProfile?.bmi && (
              <div className={`rounded-3xl p-6 shadow-sm border border-[#E06A26]/15 ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>

                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className={`text-xs font-medium tracking-wider uppercase ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                      Body Mass Index
                    </p>
                    <div className="flex items-end gap-2 mt-1">
                      <span className={`text-4xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {userProfile.bmi}
                      </span>
                      <span className={`mb-1 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>kg/m²</span>
                    </div>
                  </div>

                  {/* Category Badge */}
                  <span
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold ${userProfile.bmiCategory === 'Normal'
                      ? 'bg-[#3AB1A0]/15 text-[#3AB1A0]'
                      : userProfile.bmiCategory === 'Underweight'
                        ? 'bg-blue-100 text-blue-700'
                        : userProfile.bmiCategory === 'Overweight'
                          ? 'bg-[#DB9C6E]/20 text-[#DB9C6E]'
                          : 'bg-[#E06A26]/15 text-[#E06A26]'
                      }`}
                  >
                    {userProfile.bmiCategory}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="relative mt-6">
                  {/* Track */}
                  <div className="flex h-3 overflow-hidden rounded-full">
                    <div className="w-[20%] bg-blue-400/70" />
                    <div className="w-[30%] bg-[#3AB1A0]" />
                    <div className="w-[20%] bg-[#DB9C6E]" />
                    <div className="w-[30%] bg-[#E06A26]" />
                  </div>

                  {/* Indicator - contained within bounds */}
                  <div
                    className="absolute -translate-x-1/2 -translate-y-1/2 top-1/2"
                    style={{
                      left: `clamp(2.5%, ${Math.min(
                        Math.max(((parseFloat(userProfile.bmi) - 15) / 25) * 100, 2.5),
                        97.5
                      )}%, 97.5%)`,
                    }}
                  >
                    <div className={`w-5 h-5 border-2 rounded-full shadow-md ${isDarkMode ? 'bg-gray-950 border-gray-200' : 'bg-white border-gray-900'}`} />
                  </div>
                </div>

                {/* Scale */}
                <div className="flex justify-between mt-2 text-xs text-gray-400">
                  <span>15</span>
                  <span>18.5</span>
                  <span>25</span>
                  <span>30</span>
                  <span>40</span>
                </div>

                <div className="flex justify-between mt-1 text-xs font-medium">
                  <span className="text-blue-500">Under</span>
                  <span className="text-[#3AB1A0]">Normal</span>
                  <span className="text-[#DB9C6E]">Over</span>
                  <span className="text-[#E06A26]">Obese</span>
                </div>

                {/* Weight & Height */}
                <div className={`grid grid-cols-2 gap-4 pt-4 mt-6 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-[#3AB1A0]/15 flex items-center justify-center">
                      <Activity className="h-5 w-5 text-[#3AB1A0]" />
                    </div>
                    <div>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Weight</p>
                      <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {data.currentWeight > 0 ? data.currentWeight : userProfile.weightKg} kg
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-[#E06A26]/15 flex items-center justify-center">
                      <User className="h-5 w-5 text-[#E06A26]" />
                    </div>
                    <div>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Height</p>
                      <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {userProfile.heightCm} cm
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}


            {/* Recent Entries */}
            <div className={`p-4 shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <h3 className={`mb-3 font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Recent Entries</h3>
              {allWeightHistoryNewestFirst.length > 0 ? (
                <div className="space-y-2">
                  {allWeightHistoryNewestFirst.map((entry, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between py-2 border-b last:border-0 ${isDarkMode ? 'border-gray-700' : 'border-gray-50'}`}
                    >
                      <span className={`text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>
                        {format(new Date(entry.date), 'MMM d, yyyy')}
                      </span>
                      <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{entry.weight} kg</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <Scale className={`w-10 h-10 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                  <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>No weight entries yet</p>
                  <button
                    onClick={() => setShowWeightModal(true)}
                    className="mt-2 text-[#E06A26] font-medium text-sm"
                  >
                    Log your first weight
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Nutrition Tab */}
        {activeTab === 'nutrition' && (
          <>
            {/* Calorie History Chart - Moved to Top */}
            <div className={`p-4 shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Calorie Trend</h3>
                <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                  {timeRange === '1W' ? 'Last 7 days' :
                    timeRange === '1M' ? 'Last month' :
                      timeRange === '3M' ? 'Last 3 months' :
                        timeRange === '6M' ? 'Last 6 months' : 'Last year'}
                </span>
              </div>
              <div className="h-38">
                {calorieChartData.length > 1 ? (
                  <LineChart data={calorieChartData} color="#E06A26" labels={calorieChartLabels} />
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-gray-400">
                    Not enough calorie data to display chart
                  </div>
                )}
              </div>
            </div>

            {/* Daily Calories */}
            <div className={`p-5 shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Today's Calories</h3>
                <span className="text-sm text-[#3AB1A0] font-medium">
                  {data.todayIntake?.calories || 0} / {data.goals?.calories || 2000}
                </span>
              </div>

              {/* Calorie Progress Ring */}
              <div className="flex justify-center mb-6">
                <CircularProgress
                  value={data.todayIntake?.calories || 0}
                  max={data.goals?.calories || 2000}
                  size={140}
                  strokeWidth={12}
                  color="#3AB1A0"
                  label="Calories"
                  unit="kcal"
                />
              </div>

              {/* Remaining Calories */}
              <div className="bg-[#3AB1A0]/10 rounded-xl p-4 text-center">
                <p className={`text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>Remaining</p>
                <p className="text-2xl font-bold text-[#3AB1A0]">
                  {Math.max(0, (data.goals?.calories || 2000) - (data.todayIntake?.calories || 0))}
                </p>
                <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>calories</p>
              </div>
            </div>

            {/* Macros */}
            <div className={`p-5 shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <h3 className={`mb-4 font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Macronutrients</h3>

              <div className="flex justify-around mb-6">
                <CircularProgress
                  value={data.todayIntake?.protein || 0}
                  max={data.goals?.protein || 120}
                  size={80}
                  strokeWidth={8}
                  color="#3AB1A0"
                  label="Protein"
                  unit="g"
                />
                <CircularProgress
                  value={data.todayIntake?.carbs || 0}
                  max={data.goals?.carbs || 250}
                  size={80}
                  strokeWidth={8}
                  color="#E06A26"
                  label="Carbs"
                  unit="g"
                />
                <CircularProgress
                  value={data.todayIntake?.fat || 0}
                  max={data.goals?.fat || 65}
                  size={80}
                  strokeWidth={8}
                  color="#DB9C6E"
                  label="Fat"
                  unit="g"
                />
              </div>

              {/* Macro Bars */}
              <div className="space-y-4">
                <MacroBar
                  label="Protein"
                  value={data.todayIntake?.protein || 0}
                  max={data.goals?.protein || 120}
                  color="bg-[#3AB1A0]"
                  icon={Activity}
                />
                <MacroBar
                  label="Carbohydrates"
                  value={data.todayIntake?.carbs || 0}
                  max={data.goals?.carbs || 250}
                  color="bg-[#E06A26]"
                  icon={Flame}
                />
                <MacroBar
                  label="Fat"
                  value={data.todayIntake?.fat || 0}
                  max={data.goals?.fat || 65}
                  color="bg-[#DB9C6E]"
                  icon={Droplets}
                />
              </div>
            </div>

            {/* Macros Trend Charts */}
            <div className={`p-5 shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <h3 className={`mb-4 font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Macros Trend</h3>
              <div className="space-y-8">
                {/* Protein Chart */}
                <div className={`pb-6 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-[#3AB1A0]">Protein (g)</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${isDarkMode ? 'text-gray-200 bg-gray-900' : 'text-gray-500 bg-gray-100'}`}>
                      Goal: {data.goals?.protein || 120}g
                    </span>
                  </div>


                  <div className="h-38">
                    {proteinChartData.length > 1 ? (
                      <LineChart data={proteinChartData} color="#3AB1A0" labels={macroChartLabels} height={96} />
                    ) : (
                      <div className="flex items-center justify-center h-full text-xs text-gray-400">
                        Complete more meals to see protein trend
                      </div>
                    )}
                  </div>
                </div>

                {/* Carbs Chart */}
                <div className={`pb-6 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-[#E06A26]">Carbs (g)</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${isDarkMode ? 'text-gray-200 bg-gray-900' : 'text-gray-500 bg-gray-100'}`}>
                      Goal: {data.goals?.carbs || 250}g
                    </span>
                  </div>
                  <div className="h-38">
                    {carbsChartData.length > 1 ? (
                      <LineChart data={carbsChartData} color="#E06A26" labels={macroChartLabels} height={96} />
                    ) : (
                      <div className="flex items-center justify-center h-full text-xs text-gray-400">
                        Complete more meals to see carbs trend
                      </div>
                    )}
                  </div>
                </div>

                {/* Fat Chart */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-[#DB9C6E]">Fat (g)</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${isDarkMode ? 'text-gray-200 bg-gray-900' : 'text-gray-500 bg-gray-100'}`}>
                      Goal: {data.goals?.fat || 65}g
                    </span>
                  </div>
                  <div className="h-38">
                    {fatChartData.length > 1 ? (
                      <LineChart data={fatChartData} color="#DB9C6E" labels={macroChartLabels} height={96} />
                    ) : (
                      <div className="flex items-center justify-center h-full text-xs text-gray-400">
                        Complete more meals to see fat trend
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Daily Goals */}
            <div className={`p-5 shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <h3 className={`mb-4 font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Daily Goals</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#E06A26]/10 rounded-xl p-4">
                  <Flame className="w-6 h-6 text-[#E06A26] mb-2" />
                  <p className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{data.goals?.calories || 2000}</p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Calories/day</p>
                </div>
                <div className="bg-[#3AB1A0]/10 rounded-xl p-4">
                  <Activity className="w-6 h-6 text-[#3AB1A0] mb-2" />
                  <p className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{data.goals?.protein || 120}g</p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Protein/day</p>
                </div>
                <div className="bg-[#3AB1A0]/10 rounded-xl p-4">
                  <Droplets className="w-6 h-6 text-[#3AB1A0] mb-2" />
                  <p className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{data.goals?.water || 8}</p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Glasses water</p>
                </div>
                <div className="bg-[#DB9C6E]/10 rounded-xl p-4">
                  <Target className="w-6 h-6 text-[#DB9C6E] mb-2" />
                  <p className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{(data.goals?.steps || 10000).toLocaleString()}</p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Steps/day</p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Body Tab */}
        {activeTab === 'body' && (
          <>
            {/* Body Measurements */}
            <div className={`p-4 shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Body Measurements</h3>
                <button
                  onClick={handleAddMeasurementClick}
                  className="text-[#E06A26] text-sm font-medium flex items-center gap-1 bg-[#E06A26]/10 px-3 py-1.5 rounded-lg hover:bg-[#E06A26]/20 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>

              {/* Show date indicator */}
              <p className={`mb-3 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                {data.todayMeasurements && (data.todayMeasurements.waist || data.todayMeasurements.hips)
                  ? `Today's measurements (${format(new Date(), 'MMM d, yyyy')})`
                  : 'Latest measurements'}
              </p>

              {/* Responsive Grid - Larger boxes for readability */}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {[
                  { label: 'Waist', value: displayMeasurements.waist, color: 'bg-[#3AB1A0]/20 text-[#3AB1A0]' },
                  { label: 'Hips', value: displayMeasurements.hips, color: 'bg-[#E06A26]/20 text-[#E06A26]' },
                  { label: 'Chest', value: displayMeasurements.chest, color: 'bg-[#3AB1A0]/20 text-[#3AB1A0]' },
                  { label: 'Arms', value: displayMeasurements.arms, color: 'bg-[#DB9C6E]/20 text-[#DB9C6E]' },
                  { label: 'Thighs', value: displayMeasurements.thighs, color: 'bg-[#E06A26]/20 text-[#E06A26]' }
                ].map((item) => (
                  <div key={item.label} className="p-2 text-center">
                    <div className={`h-14 sm:h-16 rounded-xl ${item.color} flex items-center justify-center mb-1`}>
                      <span className="text-base font-bold sm:text-lg">{item.value || '--'}</span>
                    </div>
                    <p className={`text-xs truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>{item.label}</p>
                    <p className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>cm</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Measurement History */}
            <div className={`p-4 shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <h3 className={`mb-3 font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Measurement History</h3>
              {filteredMeasurementHistory.length > 0 ? (
                <div className="px-4 -mx-4 overflow-x-auto">
                  <table className={`w-full text-sm ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    <thead>
                      <tr className={`border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                        <th className={`px-1 py-2 text-xs font-medium text-left ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Date</th>
                        <th className={`px-1 py-2 text-xs font-medium text-center ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Waist</th>
                        <th className={`px-1 py-2 text-xs font-medium text-center ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Hips</th>
                        <th className={`px-1 py-2 text-xs font-medium text-center ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Chest</th>
                        <th className={`px-1 py-2 text-xs font-medium text-center ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Arms</th>
                        <th className={`px-1 py-2 text-xs font-medium text-center ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Thighs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMeasurementHistory.map((entry, index) => (
                        <tr key={index} className={`border-b last:border-0 ${isDarkMode ? 'border-gray-700' : 'border-gray-50'}`}>
                          <td className={`px-1 py-2 text-xs ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>
                            {format(new Date(entry.date), 'MMM d')}
                          </td>
                          <td className="px-1 py-2 text-xs font-medium text-center">{entry.waist || '-'}</td>
                          <td className="px-1 py-2 text-xs font-medium text-center">{entry.hips || '-'}</td>
                          <td className="px-1 py-2 text-xs font-medium text-center">{entry.chest || '-'}</td>
                          <td className="px-1 py-2 text-xs font-medium text-center">{entry.arms || '-'}</td>
                          <td className="px-1 py-2 text-xs font-medium text-center">{entry.thighs || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-6 text-center">
                  <Ruler className={`w-10 h-10 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                  <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>No measurement history yet</p>
                  <button
                    onClick={handleAddMeasurementClick}
                    className="mt-2 text-[#E06A26] font-medium text-sm"
                  >
                    Add your first measurement
                  </button>
                </div>
              )}
            </div>
            {/* BMI Card - Show if BMI is available */}
            {/* BMI Card */}
            {userProfile?.bmi && (
              <div className={`rounded-3xl p-6 shadow-sm border border-[#E06A26]/15 ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>

                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className={`text-xs font-medium tracking-wider uppercase ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                      Body Mass Index
                    </p>
                    <div className="flex items-end gap-2 mt-1">
                      <span className={`text-4xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {userProfile.bmi}
                      </span>
                      <span className={`mb-1 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>kg/m²</span>
                    </div>
                  </div>

                  {/* Category Badge */}
                  <span
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold ${userProfile.bmiCategory === 'Normal'
                      ? 'bg-[#3AB1A0]/15 text-[#3AB1A0]'
                      : userProfile.bmiCategory === 'Underweight'
                        ? 'bg-blue-100 text-blue-700'
                        : userProfile.bmiCategory === 'Overweight'
                          ? 'bg-[#DB9C6E]/20 text-[#DB9C6E]'
                          : 'bg-[#E06A26]/15 text-[#E06A26]'
                      }`}
                  >
                    {userProfile.bmiCategory}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="relative mt-6">
                  {/* Track */}
                  <div className="flex h-3 overflow-hidden rounded-full">
                    <div className="w-[20%] bg-blue-400/70" />
                    <div className="w-[30%] bg-[#3AB1A0]" />
                    <div className="w-[20%] bg-[#DB9C6E]" />
                    <div className="w-[30%] bg-[#E06A26]" />
                  </div>

                  {/* Indicator - contained within bounds */}
                  <div
                    className="absolute -translate-x-1/2 -translate-y-1/2 top-1/2"
                    style={{
                      left: `clamp(2.5%, ${Math.min(
                        Math.max(((parseFloat(userProfile.bmi) - 15) / 25) * 100, 2.5),
                        97.5
                      )}%, 97.5%)`,
                    }}
                  >
                    <div className={`w-5 h-5 border-2 rounded-full shadow-md ${isDarkMode ? 'bg-gray-950 border-gray-200' : 'bg-white border-gray-900'}`} />
                  </div>
                </div>

                {/* Scale */}
                <div className="flex justify-between mt-2 text-xs text-gray-400">
                  <span>15</span>
                  <span>18.5</span>
                  <span>25</span>
                  <span>30</span>
                  <span>40</span>
                </div>

                <div className="flex justify-between mt-1 text-xs font-medium">
                  <span className="text-blue-500">Under</span>
                  <span className="text-[#3AB1A0]">Normal</span>
                  <span className="text-[#DB9C6E]">Over</span>
                  <span className="text-[#E06A26]">Obese</span>
                </div>

                {/* Weight & Height */}
                <div className={`grid grid-cols-2 gap-4 pt-4 mt-6 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-[#3AB1A0]/15 flex items-center justify-center">
                      <Activity className="h-5 w-5 text-[#3AB1A0]" />
                    </div>
                    <div>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Weight</p>
                      <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {data.currentWeight > 0 ? data.currentWeight : userProfile.weightKg} kg
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-[#E06A26]/15 flex items-center justify-center">
                      <User className="h-5 w-5 text-[#E06A26]" />
                    </div>
                    <div>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>Height</p>
                      <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {userProfile.heightCm} cm
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Progress Photos */}
            <div className={`p-4 shadow-sm rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Transformation Photos</h3>
                <button
                  onClick={() => setShowPhotoModal(true)}
                  className="text-[#E06A26] text-sm font-medium flex items-center gap-1 bg-[#E06A26]/10 px-3 py-1.5 rounded-lg hover:bg-[#E06A26]/20 transition-colors"
                >
                  <Camera className="w-4 h-4" /> Add
                </button>
              </div>

              {data.transformationPhotos && data.transformationPhotos.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {data.transformationPhotos.map((photo) => (
                    <div
                      key={photo._id}
                      className="relative overflow-hidden cursor-pointer aspect-square rounded-xl group"
                      onClick={() => {
                        setSelectedPhoto(photo);
                        setShowPhotoViewer(true);
                      }}
                    >
                      <img
                        src={photo.url}
                        alt="Progress photo"
                        loading="lazy"
                        className="object-cover w-full h-full"
                      />
                      <div className="absolute inset-0 flex items-end justify-center transition-all opacity-0 bg-black/0 group-hover:bg-black/30 group-hover:opacity-100">
                        <span className="px-2 py-1 mb-2 text-xs text-white rounded bg-black/50">
                          {format(new Date(photo.date), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <Camera className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500">No transformation photos yet</p>
                  <p className="mt-1 text-xs text-gray-400">Track your journey with photos</p>
                  <button
                    onClick={() => setShowPhotoModal(true)}
                    className="mt-3 text-[#3AB1A0] font-medium text-sm"
                  >
                    Add your first photo
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Weight Modal */}
      {showWeightModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50 sm:items-center">
          <div className="w-full max-w-md p-6 bg-white rounded-t-3xl sm:rounded-3xl">
            <h3 className="mb-4 text-xl font-bold text-gray-900">Log Today's Weight</h3>

            <div className="space-y-4">
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={newWeight}
                  onChange={(e) => setNewWeight(e.target.value)}
                  placeholder="Enter weight"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3AB1A0] text-lg font-medium"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowWeightModal(false)}
                  className="flex-1 px-4 py-3 font-semibold text-gray-700 transition-colors bg-gray-100 rounded-xl hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogWeight}
                  disabled={saving}
                  className="flex-1 px-4 py-3 bg-[#E06A26] text-white rounded-xl font-semibold hover:bg-[#c55a1f] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Measurements Modal */}
      {showMeasurementsModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50 sm:items-center">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="mb-2 text-xl font-bold text-gray-900">Add New Measurements</h3>
            <p className="mb-4 text-sm text-gray-500">
              Recording for: {format(new Date(), 'MMMM d, yyyy')}
            </p>

            <div className="space-y-4">
              {[
                { key: 'waist', label: 'Waist' },
                { key: 'hips', label: 'Hips' },
                { key: 'chest', label: 'Chest' },
                { key: 'arms', label: 'Arms' },
                { key: 'thighs', label: 'Thighs' }
              ].map((field) => (
                <div key={field.key}>
                  <label className="block mb-2 text-sm font-medium text-gray-700">{field.label} (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={measurements[field.key as keyof typeof measurements]}
                    onChange={(e) => setMeasurements({ ...measurements, [field.key]: e.target.value })}
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3AB1A0]"
                  />
                </div>
              ))}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowMeasurementsModal(false)}
                  className="flex-1 px-4 py-3 font-semibold text-gray-700 transition-colors bg-gray-100 rounded-xl hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveMeasurements}
                  disabled={saving}
                  className="flex-1 px-4 py-3 bg-[#E06A26] text-white rounded-xl font-semibold hover:bg-[#c55a1f] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo Upload Modal */}
      {showPhotoModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50 sm:items-center">
          <div className="w-full max-w-md p-6 bg-white rounded-t-3xl sm:rounded-3xl">
            <h3 className="mb-2 text-xl font-bold text-gray-900">Add Transformation Photo</h3>
            <p className="mb-4 text-sm text-gray-500">
              Date: {format(new Date(), 'MMMM d, yyyy')}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">Side *</label>
                <select
                  value={photoSide}
                  onChange={(e) => setPhotoSide(e.target.value as 'front' | 'back' | 'right-side' | 'left-side')}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3AB1A0]"
                >
                  <option value="front">Front</option>
                  <option value="back">Back</option>
                  <option value="right-side">Right Side</option>
                  <option value="left-side">Left Side</option>
                </select>
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">Notes (optional)</label>
                <textarea
                  value={photoNotes}
                  onChange={(e) => setPhotoNotes(e.target.value)}
                  placeholder="E.g., After 2 weeks..."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3AB1A0] resize-none"
                  rows={2}
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">Photo</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="hidden"
                  id="photo-upload"
                  disabled={uploadingPhoto}
                />
                <label
                  htmlFor="photo-upload"
                  className={`w-full h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-[#3AB1A0] hover:bg-[#3AB1A0]/10 transition-colors ${uploadingPhoto ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {uploadingPhoto ? (
                    <>
                      <div className="w-8 h-8 border-2 border-[#3AB1A0] border-t-transparent rounded-full animate-spin mb-2" />
                      <span className="text-sm text-gray-500">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-8 h-8 mb-2 text-gray-400" />
                      <span className="text-sm text-gray-500">Tap to select photo</span>
                      <span className="mt-1 text-xs text-gray-400">JPEG, PNG or WebP (max 10MB)</span>
                    </>
                  )}
                </label>
              </div>

              <button
                onClick={() => {
                  setShowPhotoModal(false);
                  setPhotoNotes('');
                  setPhotoSide('front');
                }}
                className="w-full px-4 py-3 font-semibold text-gray-700 transition-colors bg-gray-100 rounded-xl hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Viewer Modal */}
      {showPhotoViewer && selectedPhoto && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
          <div className="flex items-center justify-between p-4 text-white">
            <div>
              <p className="font-medium">{format(new Date(selectedPhoto.date), 'MMMM d, yyyy')}</p>
              {selectedPhoto.side && (
                <p className="text-sm text-[#3AB1A0] capitalize">{selectedPhoto.side.replace('-', ' ')}</p>
              )}
              {selectedPhoto.notes && (
                <p className="text-sm text-gray-300">{selectedPhoto.notes}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleDeletePhoto(selectedPhoto._id)}
                className="p-2 text-red-400 transition-colors hover:text-red-300"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  setShowPhotoViewer(false);
                  setSelectedPhoto(null);
                }}
                className="p-2 text-white transition-colors hover:text-gray-300"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-center flex-1 p-4">
            <img
              src={selectedPhoto.url}
              alt="Progress photo"
              loading="lazy"
              className="object-contain max-w-full max-h-full rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Measurement Reminder Popup - Shows after 7 days */}
      {showMeasurementReminderPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm p-6 text-center bg-white rounded-3xl animate-bounce-in">
            <div className="w-16 h-16 bg-[#3AB1A0]/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Ruler className="w-8 h-8 text-[#3AB1A0]" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-gray-900">Time to Measure!</h3>
            <p className="mb-6 text-gray-600">
              It's been 7 days since your last body measurement. Track your progress by adding new measurements today!
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowMeasurementReminderPopup(false)}
                className="flex-1 px-4 py-3 font-semibold text-gray-700 transition-colors bg-gray-100 rounded-xl hover:bg-gray-200"
              >
                Later
              </button>
              <button
                onClick={() => {
                  setShowMeasurementReminderPopup(false);
                  setShowMeasurementsModal(true);
                }}
                className="flex-1 px-4 py-3 bg-[#E06A26] text-white rounded-xl font-semibold hover:bg-[#c55a1f] transition-colors"
              >
                Add Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Measurement Restriction Popup - Shows when trying to add before 7 days */}
      {showMeasurementRestrictionPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm p-6 text-center bg-white rounded-3xl">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100">
              <Calendar className="w-8 h-8 text-amber-600" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-gray-900">Please Wait</h3>
            <p className="mb-2 text-gray-600">
              Body measurements can only be recorded once every 7 days for accurate tracking.
            </p>
            <p className="text-lg font-semibold text-[#3AB1A0] mb-6">
              {data.daysUntilNextMeasurement === 1
                ? '1 day remaining'
                : `${data.daysUntilNextMeasurement || 0} days remaining`}
            </p>
            {data.lastMeasurementDate && (
              <p className="mb-4 text-sm text-gray-500">
                Last recorded: {format(new Date(data.lastMeasurementDate), 'MMM d, yyyy')}
              </p>
            )}
            <button
              onClick={() => setShowMeasurementRestrictionPopup(false)}
              className="w-full px-4 py-3 bg-[#E06A26] text-white rounded-xl font-semibold hover:bg-[#c55a1f] transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Calendar,
  Droplet,
  Coffee,
  Plus,
  Minus,
  X,
  Trash2,
  Check,
  GlassWater
} from 'lucide-react';
import { toast } from 'sonner';
import SpoonGifLoader from '@/components/ui/SpoonGifLoader';
import { useBodyScrollLock } from '@/hooks';

interface WaterEntry {
  _id: string;
  amount: number;
  unit: string;
  type: string;
  time: string;
  createdAt: string;
}

interface AssignedWater {
  amount: number;
  assignedAt: string;
  isCompleted: boolean;
  completedAt?: string;
}

interface HydrationData {
  totalToday: number;
  goal: number;
  entries: WaterEntry[];
  assignedWater: AssignedWater | null;
  date: string;
  dataHash?: string; // For change detection
}

export default function HydrationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hydrationData, setHydrationData] = useState<HydrationData>({
    totalToday: 0,
    goal: 2500,
    entries: [],
    assignedWater: null,
    date: new Date().toISOString()
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [customAmount, setCustomAmount] = useState(350);
  const [saving, setSaving] = useState(false);
  const [completingTask, setCompletingTask] = useState(false);
  const [animatedFill, setAnimatedFill] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Refs to avoid stale closures in the polling interval and animations
  const lastDataHashRef = useRef<string | null>(null);
  const totalRef = useRef(0);
  const isAnimatingRef = useRef(false);

  // Prevent body scroll when modal is open
  useBodyScrollLock(showAddModal || showDatePicker);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Animate water fill smoothly using requestAnimationFrame
  const animateWaterFill = useCallback((from: number, to: number, goal: number) => {
    setIsAnimating(true);
    isAnimatingRef.current = true;
    const startPercent = Math.min((from / goal) * 100, 100);
    const endPercent = Math.min((to / goal) * 100, 100);
    const duration = 1000; // 1 second for smoother animation
    const startTime = performance.now();

    setAnimatedFill(startPercent);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic for smooth deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentPercent = startPercent + (endPercent - startPercent) * easeOut;

      setAnimatedFill(currentPercent);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setAnimatedFill(endPercent);
        setIsAnimating(false);
        isAnimatingRef.current = false;
      }
    };

    requestAnimationFrame(animate);
  }, []);

  // Apply a fresh hydration payload to state + refs. Optionally animate the
  // water fill from the previous total to the new total.
  const applyData = useCallback((data: HydrationData, animate = false) => {
    const prevTotal = totalRef.current;
    setHydrationData(data);
    totalRef.current = data.totalToday;
    lastDataHashRef.current = data.dataHash ?? null;
    if (animate && data.totalToday !== prevTotal) {
      animateWaterFill(prevTotal, data.totalToday, data.goal);
    }
  }, [animateWaterFill]);

  const fetchHydrationData = useCallback(async (showLoader = true, checkForChanges = false) => {
    try {
      if (showLoader) setLoading(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const response = await fetch(`/api/client/hydration?date=${dateStr}`);
      if (response.ok) {
        const data = await response.json();

        // Background poll: skip if nothing changed or a local animation is active
        if (checkForChanges) {
          if (isAnimatingRef.current) return;
          if (lastDataHashRef.current && data.dataHash === lastDataHashRef.current) {
            return;
          }
        }

        applyData(data, !showLoader);
      }
    } catch (error) {
      console.error('Error fetching hydration data:', error);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [selectedDate, applyData]);

  // Keep a ref to the latest fetch function so the polling interval never
  // closes over a stale version (this was causing data to silently not update).
  const fetchRef = useRef(fetchHydrationData);
  useEffect(() => {
    fetchRef.current = fetchHydrationData;
  }, [fetchHydrationData]);

  useEffect(() => {
    if (session?.user) {
      fetchHydrationData(true, false);

      // Lightweight background sync every 10s; only re-renders if data changed
      const interval = setInterval(() => {
        fetchRef.current(false, true);
      }, 10000);

      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, selectedDate]);

  // Initialize animated fill when data loads
  useEffect(() => {
    if (!loading && !isAnimating) {
      const targetPercent = Math.min((hydrationData.totalToday / hydrationData.goal) * 100, 100);
      setAnimatedFill(targetPercent);
    }
  }, [loading, hydrationData.totalToday, hydrationData.goal, isAnimating]);

  const handleQuickAdd = async (amount: number, type: string = 'water') => {
    setSaving(true);
    const prevTotal = totalRef.current;
    const goal = hydrationData.goal;

    // Optimistic feedback: start the fill animation immediately
    animateWaterFill(prevTotal, prevTotal + amount, goal);

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const response = await fetch('/api/client/hydration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, unit: 'ml', type, date: dateStr })
      });

      if (response.ok) {
        // The POST now returns the full updated state — no second fetch needed
        const data = await response.json();
        toast.success(`Added ${amount}ml of ${type}`);
        applyData(data, false);
      } else {
        toast.error('Failed to add water');
        animateWaterFill(prevTotal + amount, prevTotal, goal); // revert
      }
    } catch {
      toast.error('Something went wrong');
      animateWaterFill(prevTotal + amount, prevTotal, goal); // revert
    } finally {
      setSaving(false);
    }
  };

  const handleCustomAdd = async () => {
    if (customAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    await handleQuickAdd(customAmount);
    setShowAddModal(false);
    setCustomAmount(350);
  };

  const handleDeleteEntry = async (entryId: string) => {
    const prevTotal = totalRef.current;
    const entry = hydrationData.entries.find((e) => e._id === entryId);
    const goal = hydrationData.goal;

    // Optimistic feedback: animate the decrease immediately
    if (entry) {
      animateWaterFill(prevTotal, Math.max(prevTotal - entry.amount, 0), goal);
    }

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const response = await fetch(`/api/client/hydration?id=${entryId}&date=${dateStr}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // DELETE now returns the full updated state — no second fetch needed
        const data = await response.json();
        toast.success('Entry deleted');
        applyData(data, false);
      } else {
        toast.error('Failed to delete entry');
        if (entry) animateWaterFill(Math.max(prevTotal - entry.amount, 0), prevTotal, goal); // revert
      }
    } catch {
      toast.error('Something went wrong');
      if (entry) animateWaterFill(Math.max(prevTotal - entry.amount, 0), prevTotal, goal); // revert
    }
  };

  const handleCompleteAssignedWater = async () => {
    setCompletingTask(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const response = await fetch('/api/client/hydration', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', date: dateStr })
      });

      if (response.ok) {
        // PATCH now returns the full updated state — no second fetch needed
        const data = await response.json();
        toast.success('Assigned water intake marked as complete!');
        applyData(data, false);
      } else {
        toast.error('Failed to mark as complete');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setCompletingTask(false);
    }
  };

  const fillPercent = Math.min((hydrationData.totalToday / hydrationData.goal) * 100, 100);
  const completionPercent = Math.round(fillPercent);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-100 bg-white dark:bg-gray-950">
        <SpoonGifLoader size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white px-4 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <Link href="/user" className="p-2 -ml-2">
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-[#E06A26]">Hydration</h1>
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="flex items-center gap-1 p-2 -mr-2 bg-[#3AB1A0]/10 rounded-lg"
          >
            <Calendar className="w-5 h-5 text-[#3AB1A0]" />
            <span className="text-sm font-medium text-[#3AB1A0]">
              {format(selectedDate, 'dd MMM')}
            </span>
          </button>
        </div>

        {/* Date Picker */}
        {showDatePicker && (
          <div className="mt-3 p-3 bg-gray-50 rounded-xl">
            <input
              type="date"
              value={format(selectedDate, 'yyyy-MM-dd')}
              onChange={(e) => {
                setSelectedDate(new Date(e.target.value));
                setShowDatePicker(false);
              }}
              className="w-full p-2 border rounded-lg"
            />
          </div>
        )}
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Main Water Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="flex items-start justify-between">
            {/* Left side - Stats */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Droplet className="w-5 h-5 text-[#3AB1A0]" fill="#3AB1A0" />
                <span className="text-[#3AB1A0] font-semibold text-sm">TODAY</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-5xl font-bold text-gray-900">
                  {hydrationData.totalToday.toLocaleString()}
                </span>
                <span className="text-2xl text-gray-400 ml-1">ml</span>
              </div>
              <p className="text-gray-500 mt-1">Goal: {hydrationData.goal.toLocaleString()} ml</p>

              {/* Completion Badge */}
              <div className="mt-4 inline-flex items-center gap-2 bg-[#3AB1A0]/10 text-[#3AB1A0] px-4 py-2 rounded-full">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="font-semibold">{completionPercent}% Complete</span>
              </div>
            </div>

            {/* Right side - Water Glass with Animation */}
            <div className="relative w-36 h-48">
              <svg viewBox="0 0 120 160" className="w-full h-full">
                {/* Definitions for gradients and clip paths */}
                <defs>
                  <linearGradient id="glassShine" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#f3f4f6" />
                    <stop offset="50%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#e5e7eb" />
                  </linearGradient>
                  <clipPath id="glassClip">
                    <path d="M22 12 L27 148 C27 152 93 152 93 148 L98 12 C98 8 22 8 22 12" />
                  </clipPath>
                  <linearGradient id="waterGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#7dd3fc">
                      <animate attributeName="stop-color" values="#7dd3fc;#38bdf8;#7dd3fc" dur="3s" repeatCount="indefinite" />
                    </stop>
                    <stop offset="50%" stopColor="#38bdf8">
                      <animate attributeName="stop-color" values="#38bdf8;#0ea5e9;#38bdf8" dur="3s" repeatCount="indefinite" />
                    </stop>
                    <stop offset="100%" stopColor="#0284c7">
                      <animate attributeName="stop-color" values="#0284c7;#0369a1;#0284c7" dur="3s" repeatCount="indefinite" />
                    </stop>
                  </linearGradient>
                </defs>

                {/* Glass outline */}
                <path
                  d="M20 10 L25 150 C25 155 95 155 95 150 L100 10 C100 5 20 5 20 10"
                  fill="url(#glassShine)"
                  stroke="#d1d5db"
                  strokeWidth="2"
                  opacity="0.3"
                />
                <path
                  d="M20 10 L25 150 C25 155 95 155 95 150 L100 10 C100 5 20 5 20 10"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="3"
                />

                <g clipPath="url(#glassClip)">
                  {/* Water fill - smooth animated transition */}
                  <rect
                    x="20"
                    y={150 - (animatedFill * 1.38)}
                    width="80"
                    height={animatedFill * 1.38 + 10}
                    fill="url(#waterGradient)"
                    style={{ transition: isAnimating ? 'none' : 'all 0.5s ease-out' }}
                  />

                  {/* Animated wave effect on water surface using SVG animate */}
                  <ellipse
                    cx="60"
                    cy={150 - (animatedFill * 1.38)}
                    rx="40"
                    ry="5"
                    fill="#bae6fd"
                    opacity="0.8"
                  >
                    <animate attributeName="rx" values="40;38;40" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="ry" values="5;6;5" dur="2s" repeatCount="indefinite" />
                  </ellipse>
                  <ellipse
                    cx="60"
                    cy={150 - (animatedFill * 1.38) + 2}
                    rx="35"
                    ry="3"
                    fill="#7dd3fc"
                    opacity="0.6"
                  >
                    <animate attributeName="rx" values="35;37;35" dur="2.5s" repeatCount="indefinite" />
                  </ellipse>
                </g>

                {/* Animated Bubbles using SVG animate */}
                {animatedFill > 10 && (
                  <>
                    <circle cx="40" cy={140 - (animatedFill * 0.8)} r="3" fill="white" opacity="0.5">
                      <animate attributeName="cy" values={`${140 - (animatedFill * 0.8)};${100 - (animatedFill * 0.8)};${140 - (animatedFill * 0.8)}`} dur="3s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0.8;0" dur="3s" repeatCount="indefinite" />
                      <animate attributeName="r" values="3;2;1" dur="3s" repeatCount="indefinite" />
                    </circle>
                    <circle cx="75" cy={145 - (animatedFill * 0.9)} r="2" fill="white" opacity="0.4">
                      <animate attributeName="cy" values={`${145 - (animatedFill * 0.9)};${95 - (animatedFill * 0.9)};${145 - (animatedFill * 0.9)}`} dur="4s" repeatCount="indefinite" begin="0.5s" />
                      <animate attributeName="opacity" values="0.4;0.7;0" dur="4s" repeatCount="indefinite" begin="0.5s" />
                      <animate attributeName="r" values="2;1.5;0.5" dur="4s" repeatCount="indefinite" begin="0.5s" />
                    </circle>
                    <circle cx="55" cy={135 - (animatedFill * 0.7)} r="2.5" fill="white" opacity="0.3">
                      <animate attributeName="cy" values={`${135 - (animatedFill * 0.7)};${100 - (animatedFill * 0.7)};${135 - (animatedFill * 0.7)}`} dur="3.5s" repeatCount="indefinite" begin="1s" />
                      <animate attributeName="opacity" values="0.3;0.6;0" dur="3.5s" repeatCount="indefinite" begin="1s" />
                      <animate attributeName="r" values="2.5;1.5;0.5" dur="3.5s" repeatCount="indefinite" begin="1s" />
                    </circle>
                    <circle cx="65" cy={150 - (animatedFill * 0.85)} r="1.5" fill="white" opacity="0.4">
                      <animate attributeName="cy" values={`${150 - (animatedFill * 0.85)};${110 - (animatedFill * 0.85)};${150 - (animatedFill * 0.85)}`} dur="2.8s" repeatCount="indefinite" begin="1.5s" />
                      <animate attributeName="opacity" values="0.4;0.7;0" dur="2.8s" repeatCount="indefinite" begin="1.5s" />
                      <animate attributeName="r" values="1.5;1;0.3" dur="2.8s" repeatCount="indefinite" begin="1.5s" />
                    </circle>
                  </>
                )}

                {/* Glass highlight/shine */}
                <path
                  d="M30 20 L32 120"
                  stroke="white"
                  strokeWidth="3"
                  opacity="0.3"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Assigned Water Section - Today's Goal */}
        {hydrationData.assignedWater && hydrationData.assignedWater.amount > 0 && (
          <div className={`rounded-3xl p-5 shadow-sm ${hydrationData.assignedWater.isCompleted
            ? 'bg-green-50 border-2 border-green-200'
            : 'bg-[#3AB1A0]/10 border-2 border-[#3AB1A0]/30'
            }`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-600 mb-1">
                  Today's Assigned Water Goal
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {hydrationData.assignedWater.amount.toLocaleString()} ml
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Assigned: {format(new Date(hydrationData.assignedWater.assignedAt), 'MMM d, h:mm a')}
                </p>
              </div>

              {hydrationData.assignedWater.isCompleted ? (
                <div className="flex items-center gap-2 bg-[#3AB1A0] text-white px-4 py-2 rounded-full">
                  <Check className="w-5 h-5" />
                  <span className="font-semibold">Completed</span>
                </div>
              ) : (
                <button
                  onClick={handleCompleteAssignedWater}
                  disabled={completingTask || hydrationData.totalToday < hydrationData.assignedWater.amount}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all ${hydrationData.totalToday >= hydrationData.assignedWater.amount
                    ? 'bg-[#3AB1A0] text-white hover:bg-[#2a9989]'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    }`}
                >
                  {completingTask ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                  ) : (
                    <Check className="w-5 h-5" />
                  )}
                  <span>Done</span>
                </button>
              )}
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Progress</span>
                <span>{Math.min(Math.round((hydrationData.totalToday / hydrationData.assignedWater.amount) * 100), 100)}%</span>
              </div>
              <div className="h-2 bg-white rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${hydrationData.assignedWater.isCompleted ? 'bg-green-500' : 'bg-[#3AB1A0]'
                    }`}
                  style={{ width: `${Math.min((hydrationData.totalToday / hydrationData.assignedWater.amount) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Quick Add Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#E06A26]">Quick Add</h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-[#3AB1A0] font-semibold text-sm"
            >
              Custom amount
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* 250ml */}
            <button
              onClick={() => handleQuickAdd(250)}
              disabled={saving}
              className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center gap-3 hover:shadow-md transition-all active:scale-95"
            >
              <div className="h-12 w-12 rounded-full bg-[#3AB1A0]/10 flex items-center justify-center">
                <GlassWater className="w-6 h-6 text-[#3AB1A0]" />
              </div>
              <span className="font-semibold text-gray-900">+250 ml</span>
            </button>

            {/* 500ml */}
            <button
              onClick={() => handleQuickAdd(500)}
              disabled={saving}
              className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center gap-3 hover:shadow-md transition-all active:scale-95"
            >
              <div className="h-12 w-12 rounded-full bg-[#3AB1A0]/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-[#3AB1A0]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 2v6h.01L6 8.01V12h10V8.01L16 8V2H6zm10 16h-4v2.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V18h1V8H8v10h1v2.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V18h4v-4h-4v-2h4v-2h-4V8h4v2h-4v2h4v4z" />
                </svg>
              </div>
              <span className="font-semibold text-gray-900">+500 ml</span>
            </button>

            {/* 750ml */}
            <button
              onClick={() => handleQuickAdd(750)}
              disabled={saving}
              className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center gap-3 hover:shadow-md transition-all active:scale-95"
            >
              <div className="h-12 w-12 rounded-full bg-[#3AB1A0]/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-[#3AB1A0]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 2v3H3v2h2v2H3v2h2v10a1 1 0 001 1h12a1 1 0 001-1V11h2V9h-2V7h2V5h-2V2H5zm2 2h10v16H7V4z" />
                </svg>
              </div>
              <span className="font-semibold text-gray-900">+750 ml</span>
            </button>
          </div>
        </div>

        {/* Today's History */}
        <div>
          <h2 className="text-lg font-bold text-[#E06A26] mb-4">Today's History</h2>

          {hydrationData.entries.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <Droplet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No water entries yet today</p>
              <p className="text-sm text-gray-400 mt-1">Start tracking your hydration!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {hydrationData.entries.map((entry) => (
                <div
                  key={entry._id}
                  className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-12 w-12 rounded-full flex items-center justify-center ${entry.type === 'coffee' ? 'bg-amber-50' : 'bg-[#3AB1A0]/10'
                      }`}>
                      {entry.type === 'coffee' ? (
                        <Coffee className="w-6 h-6 text-amber-600" />
                      ) : (
                        <Droplet className="w-6 h-6 text-[#3AB1A0]" fill="#3AB1A0" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 capitalize">{entry.type || 'Water'}</p>
                      <p className="text-sm text-gray-500">Hydration</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{entry.amount} ml</p>
                      <p className="text-xs text-gray-400">{entry.time}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteEntry(entry._id)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Custom Amount Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 animate-slide-up">
            {/* Handle */}
            <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6" />

            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">Add Water</h3>
              <button onClick={() => setShowAddModal(false)} className="p-2">
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>

            <p className="text-center text-gray-500 text-sm mb-4">ENTER AMOUNT</p>

            {/* Amount Selector */}
            <div className="flex items-center justify-center gap-6 mb-6">
              <button
                onClick={() => setCustomAmount(Math.max(0, customAmount - 50))}
                className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <Minus className="w-5 h-5 text-gray-600" />
              </button>

              <div className="text-center">
                <input
                  type="number"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(parseInt(e.target.value) || 0)}
                  className="text-5xl font-bold text-gray-900 w-32 text-center bg-transparent border-none outline-none"
                />
                <p className="text-gray-500">ml</p>
              </div>

              <button
                onClick={() => setCustomAmount(customAmount + 50)}
                className="w-14 h-14 rounded-2xl border-2 border-[#3AB1A0] flex items-center justify-center hover:bg-[#3AB1A0]/10 transition-colors"
              >
                <Plus className="w-5 h-5 text-[#3AB1A0]" />
              </button>
            </div>

            {/* Quick Amount Buttons */}
            <div className="flex justify-center gap-3 mb-6">
              {[100, 250, 500].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setCustomAmount(customAmount + amount)}
                  className="px-5 py-2 bg-gray-100 rounded-full text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  +{amount}
                </button>
              ))}
            </div>

            {/* Add Button */}
            <button
              onClick={handleCustomAdd}
              disabled={saving || customAmount <= 0}
              className="w-full py-4 bg-[#3AB1A0] text-white rounded-2xl font-semibold flex items-center justify-center gap-2 hover:bg-[#2a9989] transition-colors disabled:opacity-50"
            >
              <Droplet className="w-5 h-5" fill="white" />
              {saving ? 'Adding...' : 'Add Water'}
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

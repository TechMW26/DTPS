'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageTransition from '@/components/animations/PageTransition';
import { useTheme } from '@/contexts/ThemeContext';
import { format } from 'date-fns';
import {
    ArrowLeft,
    Calendar,
    Zap,
    Plus,
    Minus,
    X,
    Trash2,
    Check,
    Activity
} from 'lucide-react';
import { toast } from 'sonner';
import SpoonGifLoader from '@/components/ui/SpoonGifLoader';
import BottomNavBar from '@/components/client/BottomNavBar';
import { useBodyScrollLock } from '@/hooks';

interface ActivityEntry {
    _id: string;
    name: string;
    duration: number;
    intensity: string;
    calories?: number;
    time: string;
    createdAt: string;
}

interface AssignedActivity {
    amount: number;
    activityCount?: number;
    unit: string;
    assignedAt: string;
    isCompleted: boolean;
    completedAt?: string;
    activities?: any[];
}

interface ActivityData {
    totalToday: number;
    goal: number;
    entries: ActivityEntry[];
    assignedActivity: AssignedActivity | null;
    date: string;
    dataHash?: string;
}

export default function ActivityPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { isDarkMode } = useTheme();
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [activityData, setActivityData] = useState<ActivityData>({
        totalToday: 0,
        goal: 30,
        entries: [],
        assignedActivity: null,
        date: new Date().toISOString()
    });
    const [showAddModal, setShowAddModal] = useState(false);
    const [customName, setCustomName] = useState('Walking');
    const [customDuration, setCustomDuration] = useState(30);
    const [customIntensity, setCustomIntensity] = useState('moderate');
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

    const animateActivityFill = useCallback((from: number, to: number, goal: number) => {
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

    // Apply a fresh activity payload to state + refs, optionally animating the fill.
    const applyData = useCallback((data: ActivityData, animate = false) => {
        const prevTotal = totalRef.current;
        setActivityData(data);
        totalRef.current = data.totalToday;
        lastDataHashRef.current = data.dataHash ?? null;
        if (animate && data.totalToday !== prevTotal) {
            animateActivityFill(prevTotal, data.totalToday, data.goal);
        }
    }, [animateActivityFill]);

    const fetchActivityData = useCallback(async (showLoader = true, checkForChanges = false) => {
        try {
            if (showLoader) setLoading(true);
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const response = await fetch(`/api/client/activity?date=${dateStr}`);
            if (response.ok) {
                const data = await response.json();

                // Background poll: skip if nothing changed or an animation is active
                if (checkForChanges) {
                    if (isAnimatingRef.current) return;
                    if (lastDataHashRef.current && data.dataHash === lastDataHashRef.current) {
                        return;
                    }
                }

                applyData(data, !showLoader);
            }
        } catch (error) {
            console.error('Error fetching activity data:', error);
        } finally {
            if (showLoader) setLoading(false);
        }
    }, [selectedDate, applyData]);

    // Keep a ref to the latest fetch function so the polling interval never
    // closes over a stale version.
    const fetchRef = useRef(fetchActivityData);
    useEffect(() => {
        fetchRef.current = fetchActivityData;
    }, [fetchActivityData]);

    useEffect(() => {
        if (session?.user) {
            fetchActivityData(true, false);

            const interval = setInterval(() => {
                fetchRef.current(false, true);
            }, 10000);

            return () => clearInterval(interval);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, selectedDate]);

    useEffect(() => {
        if (!loading && !isAnimating) {
            const targetPercent = Math.min((activityData.totalToday / activityData.goal) * 100, 100);
            setAnimatedFill(targetPercent);
        }
    }, [loading, activityData.totalToday, activityData.goal, isAnimating]);

    const handleQuickAdd = async (name: string, duration: number, intensity: string = 'moderate') => {
        setSaving(true);
        const prevTotal = totalRef.current;
        const goal = activityData.goal;

        // Optimistic feedback: start the fill animation immediately
        animateActivityFill(prevTotal, prevTotal + duration, goal);

        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const response = await fetch('/api/client/activity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, duration, intensity, date: dateStr })
            });

            if (response.ok) {
                // POST now returns the full updated state — no second fetch needed
                const data = await response.json();
                toast.success(`Added ${duration}m of ${name}`);
                applyData(data, false);
            } else {
                toast.error('Failed to add activity');
                animateActivityFill(prevTotal + duration, prevTotal, goal); // revert
            }
        } catch {
            toast.error('Something went wrong');
            animateActivityFill(prevTotal + duration, prevTotal, goal); // revert
        } finally {
            setSaving(false);
        }
    };

    const handleCustomAdd = async () => {
        if (customDuration <= 0) {
            toast.error('Please enter a valid duration');
            return;
        }
        await handleQuickAdd(customName, customDuration, customIntensity);
        setShowAddModal(false);
        setCustomName('Walking');
        setCustomDuration(30);
        setCustomIntensity('moderate');
    };

    const handleDeleteEntry = async (entryId: string) => {
        const prevTotal = totalRef.current;
        const entry = activityData.entries.find((e) => e._id === entryId);
        const goal = activityData.goal;
        const removed = entry?.duration || 0;

        // Optimistic feedback: animate the decrease immediately
        if (entry) {
            animateActivityFill(prevTotal, Math.max(prevTotal - removed, 0), goal);
        }

        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const response = await fetch(`/api/client/activity?id=${entryId}&date=${dateStr}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                // DELETE now returns the full updated state — no second fetch needed
                const data = await response.json();
                toast.success('Entry deleted');
                applyData(data, false);
            } else {
                toast.error('Failed to delete entry');
                if (entry) animateActivityFill(Math.max(prevTotal - removed, 0), prevTotal, goal); // revert
            }
        } catch {
            toast.error('Something went wrong');
            if (entry) animateActivityFill(Math.max(prevTotal - removed, 0), prevTotal, goal); // revert
        }
    };

    const handleCompleteActivity = async () => {
        setCompletingTask(true);
        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const response = await fetch('/api/client/activity', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'complete', date: dateStr })
            });

            if (response.ok) {
                // PATCH now returns the full updated state — no second fetch needed
                const data = await response.json();
                toast.success('Activity goal marked as complete!');
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

    // State for tracking which individual activity is being completed
    const [completingActivityIndex, setCompletingActivityIndex] = useState<number | null>(null);

    const handleCompleteIndividualActivity = async (index: number) => {
        setCompletingActivityIndex(index);
        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const response = await fetch('/api/client/tasks', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskType: 'activity',
                    taskId: `activity-${index}`,
                    date: dateStr,
                    action: 'complete'
                })
            });

            if (response.ok) {
                toast.success('Activity marked as complete!');
                // The tasks endpoint doesn't return activity state, so refresh once
                const newResponse = await fetch(`/api/client/activity?date=${dateStr}`);
                if (newResponse.ok) {
                    const newData = await newResponse.json();
                    applyData(newData, false);
                }
            } else {
                const error = await response.json();
                toast.error(error.error || 'Failed to complete activity');
            }
        } catch {
            toast.error('Something went wrong');
        } finally {
            setCompletingActivityIndex(null);
        }
    };

    const fillPercent = Math.min((activityData.totalToday / activityData.goal) * 100, 100);
    const completionPercent = Math.round(fillPercent);

    if (loading) {
        return (
            <div className={`fixed inset-0 flex items-center justify-center z-100 ${isDarkMode ? 'bg-gray-950' : 'bg-white'}`}>
                <SpoonGifLoader size="lg" />
            </div>
        );
    }

    return (
        <PageTransition>
            <div className={`min-h-screen pb-24 transition-colors duration-300 ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                {/* Header */}
                <div className={`px-4 py-4 border-b transition-colors duration-300 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                    <div className="flex items-center justify-between">
                        <Link href="/user" className="p-2 -ml-2">
                            <ArrowLeft className="w-6 h-6 text-gray-700" />
                        </Link>
                        <h1 className="text-lg font-bold text-gray-900">Activity</h1>
                        <button
                            onClick={() => setShowDatePicker(!showDatePicker)}
                            className="flex items-center gap-1 p-2 -mr-2 bg-[#E06A26]/10 rounded-lg"
                        >
                            <Calendar className="w-5 h-5 text-[#c55a1f]" />
                            <span className="text-sm font-medium text-[#c55a1f]">
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
                    {/* Main Activity Card */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm">
                        <div className="flex items-start justify-between">
                            {/* Left side - Stats */}
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <Zap className="w-5 h-5 text-[#E06A26]" />
                                    <span className="text-[#E06A26] font-semibold text-sm">TODAY</span>
                                </div>
                                <div className="flex items-baseline">
                                    <span className="text-5xl font-bold text-gray-900">
                                        {Math.round(activityData.totalToday)}
                                    </span>
                                    <span className="text-2xl text-gray-400 ml-1">min</span>
                                </div>
                                <p className="text-gray-500 mt-1">Goal: {activityData.goal} minutes</p>

                                {/* Completion Badge */}
                                <div className="mt-4 inline-flex items-center gap-2 bg-[#E06A26]/10 text-[#c55a1f] px-4 py-2 rounded-full">
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    <span className="font-semibold">{completionPercent}% Complete</span>
                                </div>
                            </div>

                            {/* Right side - Activity Animation */}
                            <div className="relative w-36 h-48">
                                <svg viewBox="0 0 120 160" className="w-full h-full">
                                    <defs>
                                        <linearGradient id="activityGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                            <stop offset="0%" stopColor="#fbbf24">
                                                <animate attributeName="stop-color" values="#fbbf24;#f59e0b;#fbbf24" dur="3s" repeatCount="indefinite" />
                                            </stop>
                                            <stop offset="50%" stopColor="#f59e0b">
                                                <animate attributeName="stop-color" values="#f59e0b;#d97706;#f59e0b" dur="3s" repeatCount="indefinite" />
                                            </stop>
                                            <stop offset="100%" stopColor="#d97706">
                                                <animate attributeName="stop-color" values="#d97706;#b45309;#d97706" dur="3s" repeatCount="indefinite" />
                                            </stop>
                                        </linearGradient>
                                        <clipPath id="activityClip">
                                            <path d="M30 15 Q30 10 35 10 L85 10 Q90 10 90 15 L88 145 Q88 152 60 155 Q32 152 32 145 L30 15" />
                                        </clipPath>
                                    </defs>

                                    {/* Container outline (like a fitness tracker) */}
                                    <rect
                                        x="22"
                                        y="12"
                                        width="76"
                                        height="136"
                                        rx="8"
                                        fill="none"
                                        stroke="#e5e7eb"
                                        strokeWidth="2"
                                    />
                                    <path
                                        d="M22 20 L98 20 M22 20 Q22 12 30 12 L90 12 Q98 12 98 20"
                                        fill="none"
                                        stroke="#d1d5db"
                                        strokeWidth="1"
                                        opacity="0.5"
                                    />

                                    <g clipPath="url(#activityClip)">
                                        {/* Energy fill - smooth animated transition */}
                                        <rect
                                            x="30"
                                            y={148 - (animatedFill * 1.30)}
                                            width="60"
                                            height={animatedFill * 1.30}
                                            fill="url(#activityGradient)"
                                            style={{ transition: isAnimating ? 'none' : 'all 0.5s ease-out' }}
                                        />

                                        {/* Energy wave effect */}
                                        <ellipse
                                            cx="60"
                                            cy={148 - (animatedFill * 1.30)}
                                            rx="30"
                                            ry="4"
                                            fill="#fcd34d"
                                            opacity="0.7"
                                        >
                                            <animate attributeName="rx" values="30;28;30" dur="2s" repeatCount="indefinite" />
                                            <animate attributeName="ry" values="4;5;4" dur="2s" repeatCount="indefinite" />
                                        </ellipse>
                                    </g>

                                    {/* Energy particles/sparks */}
                                    {animatedFill > 15 && (
                                        <>
                                            <circle cx="45" cy={130 - (animatedFill * 0.8)} r="2" fill="#fbbf24" opacity="0.6">
                                                <animate attributeName="cy" values={`${130 - (animatedFill * 0.8)};${90 - (animatedFill * 0.8)};${130 - (animatedFill * 0.8)}`} dur="2.5s" repeatCount="indefinite" />
                                                <animate attributeName="opacity" values="0.6;0.9;0" dur="2.5s" repeatCount="indefinite" />
                                            </circle>
                                            <circle cx="75" cy={140 - (animatedFill * 0.85)} r="1.5" fill="#f59e0b" opacity="0.5">
                                                <animate attributeName="cy" values={`${140 - (animatedFill * 0.85)};${95 - (animatedFill * 0.85)};${140 - (animatedFill * 0.85)}`} dur="3s" repeatCount="indefinite" begin="0.5s" />
                                                <animate attributeName="opacity" values="0.5;0.8;0" dur="3s" repeatCount="indefinite" begin="0.5s" />
                                            </circle>
                                            <circle cx="60" cy={135 - (animatedFill * 0.75)} r="1" fill="#fbbf24" opacity="0.4">
                                                <animate attributeName="cy" values={`${135 - (animatedFill * 0.75)};${100 - (animatedFill * 0.75)};${135 - (animatedFill * 0.75)}`} dur="3.5s" repeatCount="indefinite" begin="1s" />
                                                <animate attributeName="opacity" values="0.4;0.7;0" dur="3.5s" repeatCount="indefinite" begin="1s" />
                                            </circle>
                                        </>
                                    )}

                                    {/* Progress bars on side */}
                                    <line x1="105" y1="40" x2="105" y2="140" stroke="#f3f4f6" strokeWidth="2" />
                                    <line
                                        x1="105"
                                        y1={140 - (animatedFill * 1.0)}
                                        x2="105"
                                        y2="140"
                                        stroke="url(#activityGradient)"
                                        strokeWidth="2"
                                        style={{ transition: 'all 0.5s ease-out' }}
                                    />

                                    {/* Display percentage */}
                                    <text x="60" y="85" textAnchor="middle" fontSize="18" fontWeight="bold" fill="#374151">
                                        {completionPercent}%
                                    </text>
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Assigned Activity Section */}
                    {activityData.assignedActivity && (activityData.assignedActivity.amount > 0 || (activityData.assignedActivity.activityCount || 0) > 0) && (
                        <div className={`rounded-3xl p-5 shadow-sm ${activityData.assignedActivity.isCompleted
                            ? 'bg-[#3AB1A0]/10 border-2 border-[#3AB1A0]/30'
                            : 'bg-[#3AB1A0]/10 border-2 border-[#3AB1A0]/30'
                            }`}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-gray-600 mb-1">
                                        Today's Activity Goal
                                    </p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {activityData.assignedActivity.activityCount || 0} activities
                                        {activityData.assignedActivity.amount > 0 && ` (${activityData.assignedActivity.amount} min)`}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Assigned: {format(new Date(activityData.assignedActivity.assignedAt), 'MMM d, h:mm a')}
                                    </p>
                                </div>

                                {(() => {
                                    // Check if activity goal is met
                                    const allActivitiesCompleted = activityData.assignedActivity?.activities?.length
                                        ? activityData.assignedActivity.activities.every((a: any) => a.completed)
                                        : false;
                                    const durationGoalMet = activityData.assignedActivity?.amount
                                        ? activityData.totalToday >= activityData.assignedActivity.amount
                                        : true;
                                    const canComplete = allActivitiesCompleted || durationGoalMet;

                                    return activityData.assignedActivity?.isCompleted ? (
                                        <div className="flex items-center gap-2 bg-[#3AB1A0] text-white px-4 py-2 rounded-full">
                                            <Check className="w-5 h-5" />
                                            <span className="font-semibold">Completed</span>
                                        </div>
                                    ) : canComplete ? (
                                        <button
                                            onClick={handleCompleteActivity}
                                            disabled={completingTask}
                                            className="flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all bg-[#E06A26] text-white hover:bg-[#c55a1f]"
                                        >
                                            {completingTask ? (
                                                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                                            ) : (
                                                <Check className="w-5 h-5" />
                                            )}
                                            <span>Done</span>
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-2 px-4 py-2 rounded-full font-semibold bg-gray-200 text-gray-500 cursor-not-allowed">
                                            <Check className="w-5 h-5" />
                                            <span>Done</span>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Progress bar - only show if there's a duration target */}
                            {activityData.assignedActivity.amount > 0 && (
                                <div className="mt-4">
                                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                                        <span>Progress</span>
                                        <span>{Math.min(Math.round((activityData.totalToday / activityData.assignedActivity.amount) * 100), 100)}%</span>
                                    </div>
                                    <div className="h-2 bg-white rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${activityData.assignedActivity.isCompleted ? 'bg-[#3AB1A0]' : 'bg-[#E06A26]'
                                                }`}
                                            style={{ width: `${Math.min((activityData.totalToday / activityData.assignedActivity.amount) * 100, 100)}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Show assigned activities list */}
                            {activityData.assignedActivity.activities && activityData.assignedActivity.activities.length > 0 && (
                                <div className="mt-4 space-y-2">
                                    <p className="text-xs text-gray-500 font-medium">Activities to complete (click to mark done):</p>
                                    {activityData.assignedActivity.activities.map((activity: any, index: number) => (
                                        <div key={index} className="flex items-center justify-between bg-white p-3 rounded-lg">
                                            <div className="flex-1">
                                                <span className="font-medium text-sm text-gray-800">{activity.name}</span>
                                                <div className="flex gap-2 text-xs text-gray-500 mt-0.5">
                                                    {activity.sets > 0 && <span>{activity.sets} sets</span>}
                                                    {activity.reps > 0 && <span>{activity.reps} reps</span>}
                                                    {activity.duration > 0 && <span>{activity.duration} min</span>}
                                                </div>
                                                {activity.videoLink && (
                                                    <a
                                                        href={activity.videoLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-[#E06A26] mt-1 inline-block"
                                                    >
                                                        Watch Video →
                                                    </a>
                                                )}
                                            </div>
                                            {activity.completed ? (
                                                <div className="flex items-center gap-1 text-[#3AB1A0]">
                                                    <Check className="w-5 h-5" />
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => handleCompleteIndividualActivity(index)}
                                                    disabled={completingActivityIndex === index}
                                                    className="p-2 bg-[#E06A26] text-white rounded-lg hover:bg-[#C55A1C] disabled:opacity-50 transition-colors"
                                                >
                                                    {completingActivityIndex === index ? (
                                                        <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                                    ) : (
                                                        <Check className="w-4 h-4" />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Quick Add Section */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-gray-900">Quick Add</h2>
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="text-[#E06A26] font-semibold text-sm"
                            >
                                Custom activity
                            </button>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            {/* 15 minutes */}
                            <button
                                onClick={() => handleQuickAdd('Walking', 15, 'light')}
                                disabled={saving}
                                className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center gap-3 hover:shadow-md transition-all active:scale-95"
                            >
                                <div className="h-12 w-12 rounded-full bg-[#E06A26]/10 flex items-center justify-center">
                                    <Zap className="w-6 h-6 text-[#E06A26]" />
                                </div>
                                <span className="font-semibold text-gray-900 text-sm">15 min</span>
                            </button>

                            {/* 30 minutes */}
                            <button
                                onClick={() => handleQuickAdd('Jogging', 30, 'moderate')}
                                disabled={saving}
                                className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center gap-3 hover:shadow-md transition-all active:scale-95"
                            >
                                <div className="h-12 w-12 rounded-full bg-[#E06A26]/10 flex items-center justify-center">
                                    <Zap className="w-6 h-6 text-[#E06A26]" />
                                </div>
                                <span className="font-semibold text-gray-900 text-sm">30 min</span>
                            </button>

                            {/* 45 minutes */}
                            <button
                                onClick={() => handleQuickAdd('Running', 45, 'vigorous')}
                                disabled={saving}
                                className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center gap-3 hover:shadow-md transition-all active:scale-95"
                            >
                                <div className="h-12 w-12 rounded-full bg-[#E06A26]/10 flex items-center justify-center">
                                    <Zap className="w-6 h-6 text-[#E06A26]" />
                                </div>
                                <span className="font-semibold text-gray-900 text-sm">45 min</span>
                            </button>
                        </div>
                    </div>

                    {/* Today's History */}
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 mb-4">Today's Activity Log</h2>

                        {activityData.entries.length === 0 ? (
                            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                                <Zap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500">No activities logged yet today</p>
                                <p className="text-sm text-gray-400 mt-1">Start tracking your activities!</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {activityData.entries.map((entry) => (
                                    <div
                                        key={entry._id}
                                        className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="h-12 w-12 rounded-full flex items-center justify-center bg-[#E06A26]/10">
                                                <Zap className="w-6 h-6 text-[#E06A26]" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-900 capitalize">{entry.name}</p>
                                                <p className="text-sm text-gray-500">
                                                    {entry.duration}m • Intensity: {entry.intensity}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <p className="font-semibold text-gray-900">{entry.duration} min</p>
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

                {/* Custom Activity Modal */}
                {showAddModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center pb-20">
                        <div className="bg-white rounded-3xl w-full max-w-lg p-6 pb-8 animate-slide-up max-h-[80dvh] overflow-y-auto mx-3">
                            {/* Handle */}
                            <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6" />

                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-gray-900">Add Activity</h3>
                                <button onClick={() => setShowAddModal(false)} className="p-2">
                                    <X className="w-6 h-6 text-gray-500" />
                                </button>
                            </div>

                            {/* Activity Name */}
                            <div className="mb-6">
                                <label className="text-sm font-semibold text-gray-700 block mb-2">Activity Type</label>
                                <input
                                    type="text"
                                    value={customName}
                                    onChange={(e) => setCustomName(e.target.value)}
                                    placeholder="e.g., Running, Cycling, Swimming"
                                    className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E06A26]"
                                />
                            </div>

                            {/* Duration */}
                            <div className="mb-6">
                                <p className="text-sm font-semibold text-gray-700 mb-3">Duration (minutes)</p>
                                <div className="flex items-center justify-center gap-6">
                                    <button
                                        onClick={() => setCustomDuration(Math.max(5, customDuration - 5))}
                                        className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                                    >
                                        <Minus className="w-5 h-5 text-gray-600" />
                                    </button>

                                    <div className="text-center">
                                        <input
                                            type="number"
                                            value={customDuration}
                                            onChange={(e) => setCustomDuration(Math.max(1, parseInt(e.target.value) || 0))}
                                            className="text-5xl font-bold text-gray-900 w-24 text-center bg-transparent border-none outline-none"
                                        />
                                        <p className="text-gray-500">minutes</p>
                                    </div>

                                    <button
                                        onClick={() => setCustomDuration(customDuration + 5)}
                                        className="w-14 h-14 rounded-2xl border-2 border-[#E06A26] flex items-center justify-center hover:bg-[#E06A26]/10 transition-colors"
                                    >
                                        <Plus className="w-5 h-5 text-[#E06A26]" />
                                    </button>
                                </div>
                            </div>

                            {/* Intensity */}
                            <div className="mb-6">
                                <p className="text-sm font-semibold text-gray-700 mb-3">Intensity</p>
                                <div className="flex justify-center gap-3">
                                    {['light', 'moderate', 'vigorous'].map((intensity) => (
                                        <button
                                            key={intensity}
                                            onClick={() => setCustomIntensity(intensity)}
                                            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors capitalize ${customIntensity === intensity
                                                ? 'bg-[#E06A26] text-white'
                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                }`}
                                        >
                                            {intensity}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Add Button */}
                            <button
                                onClick={handleCustomAdd}
                                disabled={saving || customDuration <= 0}
                                className="w-full py-4 bg-[#E06A26] text-white rounded-2xl font-semibold flex items-center justify-center gap-2 hover:bg-[#c55a1f] transition-colors disabled:opacity-50"
                            >
                                <Zap className="w-5 h-5" />
                                {saving ? 'Adding...' : 'Add Activity'}
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
        </PageTransition>
    );
}

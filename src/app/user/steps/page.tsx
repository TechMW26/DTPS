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
    Footprints,
    Plus,
    Minus,
    X,
    Trash2,
    Check
} from 'lucide-react';
import { toast } from 'sonner';
import SpoonGifLoader from '@/components/ui/SpoonGifLoader';
import { useBodyScrollLock } from '@/hooks';

interface StepsEntry {
    _id: string;
    steps: number;
    distance?: number;
    calories?: number;
    time: string;
    createdAt: string;
}

interface AssignedSteps {
    amount: number;
    assignedAt: string;
    isCompleted: boolean;
    completedAt?: string;
}

interface StepsData {
    totalToday: number;
    goal: number;
    entries: StepsEntry[];
    assignedSteps: AssignedSteps | null;
    date: string;
    dataHash?: string;
}

export default function StepsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { isDarkMode } = useTheme();
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [stepsData, setStepsData] = useState<StepsData>({
        totalToday: 0,
        goal: 10000,
        entries: [],
        assignedSteps: null,
        date: new Date().toISOString()
    });
    const [showAddModal, setShowAddModal] = useState(false);
    const [customSteps, setCustomSteps] = useState(1000);
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

    const animateStepsFill = useCallback((from: number, to: number, goal: number) => {
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

    // Apply a fresh steps payload to state + refs, optionally animating the fill.
    const applyData = useCallback((data: StepsData, animate = false) => {
        const prevTotal = totalRef.current;
        setStepsData(data);
        totalRef.current = data.totalToday;
        lastDataHashRef.current = data.dataHash ?? null;
        if (animate && data.totalToday !== prevTotal) {
            animateStepsFill(prevTotal, data.totalToday, data.goal);
        }
    }, [animateStepsFill]);

    const fetchStepsData = useCallback(async (showLoader = true, checkForChanges = false) => {
        try {
            if (showLoader) setLoading(true);
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const response = await fetch(`/api/client/steps?date=${dateStr}`);
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
            console.error('Error fetching steps data:', error);
        } finally {
            if (showLoader) setLoading(false);
        }
    }, [selectedDate, applyData]);

    // Keep a ref to the latest fetch function so the polling interval never
    // closes over a stale version.
    const fetchRef = useRef(fetchStepsData);
    useEffect(() => {
        fetchRef.current = fetchStepsData;
    }, [fetchStepsData]);

    useEffect(() => {
        if (session?.user) {
            fetchStepsData(true, false);

            const interval = setInterval(() => {
                fetchRef.current(false, true);
            }, 10000);

            return () => clearInterval(interval);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, selectedDate]);

    useEffect(() => {
        if (!loading && !isAnimating) {
            const targetPercent = Math.min((stepsData.totalToday / stepsData.goal) * 100, 100);
            setAnimatedFill(targetPercent);
        }
    }, [loading, stepsData.totalToday, stepsData.goal, isAnimating]);

    const handleQuickAdd = async (steps: number) => {
        setSaving(true);
        const prevTotal = totalRef.current;
        const goal = stepsData.goal;

        // Optimistic feedback: start the fill animation immediately
        animateStepsFill(prevTotal, prevTotal + steps, goal);

        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const response = await fetch('/api/client/steps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ steps, date: dateStr })
            });

            if (response.ok) {
                // POST now returns the full updated state — no second fetch needed
                const data = await response.json();
                toast.success(`Added ${steps.toLocaleString()} steps`);
                applyData(data, false);
            } else {
                toast.error('Failed to add steps');
                animateStepsFill(prevTotal + steps, prevTotal, goal); // revert
            }
        } catch {
            toast.error('Something went wrong');
            animateStepsFill(prevTotal + steps, prevTotal, goal); // revert
        } finally {
            setSaving(false);
        }
    };

    const handleCustomAdd = async () => {
        if (customSteps <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }
        await handleQuickAdd(customSteps);
        setShowAddModal(false);
        setCustomSteps(1000);
    };

    const handleDeleteEntry = async (entryId: string) => {
        const prevTotal = totalRef.current;
        const entry = stepsData.entries.find((e) => e._id === entryId);
        const goal = stepsData.goal;
        const removed = entry?.steps || 0;

        // Optimistic feedback: animate the decrease immediately
        if (entry) {
            animateStepsFill(prevTotal, Math.max(prevTotal - removed, 0), goal);
        }

        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const response = await fetch(`/api/client/steps?id=${entryId}&date=${dateStr}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                // DELETE now returns the full updated state — no second fetch needed
                const data = await response.json();
                toast.success('Entry deleted');
                applyData(data, false);
            } else {
                toast.error('Failed to delete entry');
                if (entry) animateStepsFill(Math.max(prevTotal - removed, 0), prevTotal, goal); // revert
            }
        } catch {
            toast.error('Something went wrong');
            if (entry) animateStepsFill(Math.max(prevTotal - removed, 0), prevTotal, goal); // revert
        }
    };

    const handleCompleteSteps = async () => {
        setCompletingTask(true);
        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const response = await fetch('/api/client/steps', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'complete', date: dateStr })
            });

            if (response.ok) {
                // PATCH now returns the full updated state — no second fetch needed
                const data = await response.json();
                toast.success('Steps goal marked as complete!');
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

    const fillPercent = Math.min((stepsData.totalToday / stepsData.goal) * 100, 100);
    const completionPercent = Math.round(fillPercent);
    const distance = (stepsData.totalToday / 1315).toFixed(2);

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
            <div className="sticky top-0 z-40 bg-white border-b border-gray-100">
                <div className="relative flex items-center justify-center px-4 py-4">
                    <Link href="/user" className="absolute left-4 flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#3AB1A0]/10 transition-colors">
                        <ArrowLeft className="w-5 h-5 text-gray-700" />
                    </Link>
                    <h1 className="text-lg font-bold text-black">Steps</h1>
                    <button
                        onClick={() => setShowDatePicker(!showDatePicker)}
                        className="absolute right-4 flex items-center gap-1 p-2 bg-[#3AB1A0]/10 rounded-lg"
                    >
                        <Calendar className="w-5 h-5 text-[#3AB1A0]" />
                        <span className="text-sm font-medium text-[#3AB1A0]">
                            {format(selectedDate, 'dd MMM')}
                        </span>
                    </button>
                </div>

                {/* Date Picker */}
                {showDatePicker && (
                    <div className="px-4 pb-3">
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
                {/* Main Steps Card */}
                <div className="bg-white rounded-3xl p-6 shadow-sm">
                    <div className="flex items-start justify-between">
                        {/* Left side - Stats */}
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                                <Footprints className="w-5 h-5 text-[#3AB1A0]" />
                                <span className="text-[#3AB1A0] font-semibold text-sm">TODAY</span>
                            </div>
                            <div className="flex items-baseline">
                                <span className="text-5xl font-bold text-gray-900">
                                    {stepsData.totalToday.toLocaleString()}
                                </span>
                                <span className="text-2xl text-gray-400 ml-1">steps</span>
                            </div>
                            <div className="flex gap-4 mt-2 text-gray-600 text-sm">
                                <div>
                                    <p className="text-gray-500">Distance</p>
                                    <p className="font-semibold">{distance} km</p>
                                </div>
                                <div>
                                    <p className="text-gray-500">Goal</p>
                                    <p className="font-semibold">{stepsData.goal.toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Completion Badge */}
                            <div className="mt-4 inline-flex items-center gap-2 bg-[#3AB1A0]/10 text-[#3AB1A0] px-4 py-2 rounded-full">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span className="font-semibold">{completionPercent}% Complete</span>
                            </div>
                        </div>

                        {/* Right side - Circular Progress Ring Animation */}
                        <div className="relative w-36 h-48">
                            <svg viewBox="0 0 120 160" className="w-full h-full">
                                <defs>
                                    <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#5FCFC0" />
                                        <stop offset="50%" stopColor="#3AB1A0" />
                                        <stop offset="100%" stopColor="#2A9A8B" />
                                    </linearGradient>
                                    <linearGradient id="pathGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                        <stop offset="0%" stopColor="#7DDDD0" />
                                        <stop offset="100%" stopColor="#3AB1A0" />
                                    </linearGradient>
                                    <filter id="glowEffect" x="-50%" y="-50%" width="200%" height="200%">
                                        <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
                                    </filter>
                                </defs>

                                {/* Background circle track */}
                                <circle
                                    cx="60"
                                    cy="75"
                                    r="50"
                                    fill="none"
                                    stroke="#e5e7eb"
                                    strokeWidth="8"
                                    opacity="0.5"
                                />

                                {/* Animated progress ring */}
                                <circle
                                    cx="60"
                                    cy="75"
                                    r="50"
                                    fill="none"
                                    stroke="url(#ringGradient)"
                                    strokeWidth="8"
                                    strokeLinecap="round"
                                    strokeDasharray={`${(animatedFill / 100) * 314} 314`}
                                    transform="rotate(-90 60 75)"
                                    style={{ transition: isAnimating ? 'none' : 'stroke-dasharray 0.5s ease-out' }}
                                />

                                {/* Glow effect on progress */}
                                <circle
                                    cx="60"
                                    cy="75"
                                    r="50"
                                    fill="none"
                                    stroke="url(#ringGradient)"
                                    strokeWidth="8"
                                    strokeLinecap="round"
                                    strokeDasharray={`${(animatedFill / 100) * 314} 314`}
                                    transform="rotate(-90 60 75)"
                                    filter="url(#glowEffect)"
                                    opacity="0.5"
                                    style={{ transition: isAnimating ? 'none' : 'stroke-dasharray 0.5s ease-out' }}
                                />

                                {/* Center content */}
                                <text x="60" y="70" textAnchor="middle" fontSize="22" fontWeight="bold" fill="#3AB1A0">
                                    {completionPercent}%
                                </text>
                                <text x="60" y="88" textAnchor="middle" fontSize="10" fill="#6b7280">
                                    of goal
                                </text>

                                {/* Animated walking path at bottom */}
                                <g transform="translate(10, 135)">
                                    {/* Path line */}
                                    <line x1="0" y1="10" x2="100" y2="10" stroke="#CBEEE9" strokeWidth="4" strokeLinecap="round" />
                                    <line
                                        x1="0"
                                        y1="10"
                                        x2={animatedFill}
                                        y2="10"
                                        stroke="url(#pathGradient)"
                                        strokeWidth="4"
                                        strokeLinecap="round"
                                        style={{ transition: isAnimating ? 'none' : 'all 0.5s ease-out' }}
                                    />

                                    {/* Walking figure dot */}
                                    <circle
                                        cx={Math.min(animatedFill, 100)}
                                        cy="10"
                                        r="6"
                                        fill="#3AB1A0"
                                        style={{ transition: isAnimating ? 'none' : 'cx 0.5s ease-out' }}
                                    >
                                        <animate attributeName="r" values="6;7;6" dur="1s" repeatCount="indefinite" />
                                    </circle>

                                    {/* Footprint markers on path */}
                                    {[20, 40, 60, 80].map((pos, i) => (
                                        <text
                                            key={i}
                                            x={pos}
                                            y="10"
                                            textAnchor="middle"
                                            fontSize="8"
                                            opacity={animatedFill >= pos ? "0.8" : "0.2"}
                                            style={{ transition: 'opacity 0.3s ease-out' }}
                                        >
                                            👣
                                        </text>
                                    ))}
                                </g>
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Assigned Steps Section */}
                {stepsData.assignedSteps && stepsData.assignedSteps.amount > 0 && (
                    <div className={`rounded-3xl p-5 shadow-sm ${stepsData.assignedSteps.isCompleted
                        ? 'bg-[#3AB1A0]/10 border-2 border-[#3AB1A0]/30'
                        : 'bg-[#3AB1A0]/10 border-2 border-[#3AB1A0]/30'
                        }`}>
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-semibold text-gray-600 mb-1">
                                    Today's Steps Goal
                                </p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {stepsData.assignedSteps.amount.toLocaleString()} steps
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    Assigned: {format(new Date(stepsData.assignedSteps.assignedAt), 'MMM d, h:mm a')}
                                </p>
                            </div>

                            {stepsData.assignedSteps.isCompleted ? (
                                <div className="flex items-center gap-2 bg-[#3AB1A0] text-white px-4 py-2 rounded-full">
                                    <Check className="w-5 h-5" />
                                    <span className="font-semibold">Completed</span>
                                </div>
                            ) : (
                                <button
                                    onClick={handleCompleteSteps}
                                    disabled={completingTask || stepsData.totalToday < stepsData.assignedSteps.amount}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all ${stepsData.totalToday >= stepsData.assignedSteps.amount
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
                                <span>{Math.min(Math.round((stepsData.totalToday / stepsData.assignedSteps.amount) * 100), 100)}%</span>
                            </div>
                            <div className="h-2 bg-white rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${stepsData.assignedSteps.isCompleted ? 'bg-[#3AB1A0]' : 'bg-[#3AB1A0]'
                                        }`}
                                    style={{ width: `${Math.min((stepsData.totalToday / stepsData.assignedSteps.amount) * 100, 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Quick Add Section */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-gray-900">Quick Add</h2>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="text-[#3AB1A0] font-semibold text-sm"
                        >
                            Custom steps
                        </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        {/* 1000 steps */}
                        <button
                            onClick={() => handleQuickAdd(1000)}
                            disabled={saving}
                            className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center gap-3 hover:shadow-md transition-all active:scale-95"
                        >
                            <div className="h-12 w-12 rounded-full bg-[#3AB1A0]/10 flex items-center justify-center text-xl">
                                👣
                            </div>
                            <span className="font-semibold text-gray-900 text-sm">1K</span>
                        </button>

                        {/* 5000 steps */}
                        <button
                            onClick={() => handleQuickAdd(5000)}
                            disabled={saving}
                            className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center gap-3 hover:shadow-md transition-all active:scale-95"
                        >
                            <div className="h-12 w-12 rounded-full bg-[#3AB1A0]/10 flex items-center justify-center text-xl">
                                👣
                            </div>
                            <span className="font-semibold text-gray-900 text-sm">5K</span>
                        </button>

                        {/* 10000 steps */}
                        <button
                            onClick={() => handleQuickAdd(10000)}
                            disabled={saving}
                            className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center gap-3 hover:shadow-md transition-all active:scale-95"
                        >
                            <div className="h-12 w-12 rounded-full bg-[#3AB1A0]/10 flex items-center justify-center text-xl">
                                👣
                            </div>
                            <span className="font-semibold text-gray-900 text-sm">10K</span>
                        </button>
                    </div>
                </div>

                {/* Today's History */}
                <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Today's Steps Log</h2>

                    {stepsData.entries.length === 0 ? (
                        <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                            <Footprints className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500">No steps logged yet today</p>
                            <p className="text-sm text-gray-400 mt-1">Start tracking your steps!</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {stepsData.entries.map((entry) => (
                                <div
                                    key={entry._id}
                                    className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-full flex items-center justify-center bg-[#3AB1A0]/10 text-xl">
                                            👣
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-900">Steps</p>
                                            <p className="text-sm text-gray-500">
                                                {entry.steps.toLocaleString()} steps
                                                {entry.distance && ` • ${entry.distance} km`}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="text-right">
                                            <p className="font-semibold text-gray-900">{entry.steps.toLocaleString()}</p>
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

            {/* Custom Steps Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
                    <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-8 animate-slide-up max-h-[90vh] overflow-y-auto">
                        {/* Handle */}
                        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6" />

                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-gray-900">Add Steps</h3>
                            <button onClick={() => setShowAddModal(false)} className="p-2">
                                <X className="w-6 h-6 text-gray-500" />
                            </button>
                        </div>

                        <p className="text-center text-gray-500 text-sm mb-4">ENTER STEPS</p>

                        {/* Steps Selector */}
                        <div className="flex items-center justify-center gap-6 mb-6">
                            <button
                                onClick={() => setCustomSteps(Math.max(0, customSteps - 500))}
                                className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                            >
                                <Minus className="w-5 h-5 text-gray-600" />
                            </button>

                            <div className="text-center">
                                <input
                                    type="number"
                                    value={customSteps}
                                    onChange={(e) => setCustomSteps(Math.max(0, parseInt(e.target.value) || 0))}
                                    className="text-5xl font-bold text-gray-900 w-40 text-center bg-transparent border-none outline-none"
                                />
                                <p className="text-gray-500">steps</p>
                            </div>

                            <button
                                onClick={() => setCustomSteps(customSteps + 500)}
                                className="w-14 h-14 rounded-2xl border-2 border-[#3AB1A0] flex items-center justify-center hover:bg-[#3AB1A0]/10 transition-colors"
                            >
                                <Plus className="w-5 h-5 text-[#3AB1A0]" />
                            </button>
                        </div>

                        {/* Quick Step Buttons */}
                        <div className="flex justify-center gap-3 mb-6 flex-wrap">
                            {[1000, 2500, 5000].map((amount) => (
                                <button
                                    key={amount}
                                    onClick={() => setCustomSteps(customSteps + amount)}
                                    className="px-5 py-2 bg-gray-100 rounded-full text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                                >
                                    +{(amount / 1000).toFixed(1)}K
                                </button>
                            ))}
                        </div>

                        {/* Add Button */}
                        <button
                            onClick={handleCustomAdd}
                            disabled={saving || customSteps <= 0}
                            className="w-full py-4 bg-[#E06A26] text-white rounded-2xl font-semibold flex items-center justify-center gap-2 hover:bg-[#c55a1f] transition-colors disabled:opacity-50"
                        >
                            <Footprints className="w-5 h-5" />
                            {saving ? 'Adding...' : 'Add Steps'}
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

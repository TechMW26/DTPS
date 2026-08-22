'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
    ArrowLeft,
    Calendar,
    Moon,
    Plus,
    Minus,
    X,
    Trash2,
    Check
} from 'lucide-react';
import { toast } from 'sonner';
import { ClientPageSkeleton } from '@/components/ui/skeleton';
import { useBodyScrollLock } from '@/hooks';

interface SleepEntry {
    _id: string;
    hours: number;
    minutes: number;
    quality?: string;
    notes?: string;
    time: string;
    createdAt: string;
}

interface AssignedSleep {
    amount: number;
    assignedAt: string;
    isCompleted: boolean;
    completedAt?: string;
}

interface SleepData {
    totalToday: number;
    goal: number;
    entries: SleepEntry[];
    assignedSleep: AssignedSleep | null;
    date: string;
    dataHash?: string;
}

export default function SleepPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [sleepData, setSleepData] = useState<SleepData>({
        totalToday: 0,
        goal: 8,
        entries: [],
        assignedSleep: null,
        date: new Date().toISOString()
    });
    const [showAddModal, setShowAddModal] = useState(false);
    const [customHours, setCustomHours] = useState(7);
    const [customMinutes, setCustomMinutes] = useState(0);
    const [customQuality, setCustomQuality] = useState('good');
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

    const animateSleepFill = useCallback((from: number, to: number, goal: number) => {
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

    // Apply a fresh sleep payload to state + refs, optionally animating the fill.
    const applyData = useCallback((data: SleepData, animate = false) => {
        const prevTotal = totalRef.current;
        setSleepData(data);
        totalRef.current = data.totalToday;
        lastDataHashRef.current = data.dataHash ?? null;
        if (animate && data.totalToday !== prevTotal) {
            animateSleepFill(prevTotal, data.totalToday, data.goal);
        }
    }, [animateSleepFill]);

    const fetchSleepData = useCallback(async (showLoader = true, checkForChanges = false) => {
        try {
            if (showLoader) setLoading(true);
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const response = await fetch(`/api/client/sleep?date=${dateStr}`);
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
            console.error('Error fetching sleep data:', error);
        } finally {
            if (showLoader) setLoading(false);
        }
    }, [selectedDate, applyData]);

    // Keep a ref to the latest fetch function so the polling interval never
    // closes over a stale version.
    const fetchRef = useRef(fetchSleepData);
    useEffect(() => {
        fetchRef.current = fetchSleepData;
    }, [fetchSleepData]);

    useEffect(() => {
        if (session?.user) {
            fetchSleepData(true, false);

            const interval = setInterval(() => {
                fetchRef.current(false, true);
            }, 10000);

            return () => clearInterval(interval);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, selectedDate]);

    useEffect(() => {
        if (!loading && !isAnimating) {
            const targetPercent = Math.min((sleepData.totalToday / sleepData.goal) * 100, 100);
            setAnimatedFill(targetPercent);
        }
    }, [loading, sleepData.totalToday, sleepData.goal, isAnimating]);

    const handleQuickAdd = async (hours: number, minutes: number = 0, quality: string = 'good') => {
        setSaving(true);
        const prevTotal = totalRef.current;
        const goal = sleepData.goal;
        const added = hours + minutes / 60;

        // Optimistic feedback: start the fill animation immediately
        animateSleepFill(prevTotal, prevTotal + added, goal);

        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const response = await fetch('/api/client/sleep', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hours, minutes, quality, date: dateStr })
            });

            if (response.ok) {
                // POST now returns the full updated state — no second fetch needed
                const data = await response.json();
                toast.success(`Added ${hours}h ${minutes}m of sleep`);
                applyData(data, false);
            } else {
                toast.error('Failed to add sleep');
                animateSleepFill(prevTotal + added, prevTotal, goal); // revert
            }
        } catch {
            toast.error('Something went wrong');
            animateSleepFill(prevTotal + added, prevTotal, goal); // revert
        } finally {
            setSaving(false);
        }
    };

    const handleCustomAdd = async () => {
        if (customHours <= 0 && customMinutes <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }
        await handleQuickAdd(customHours, customMinutes, customQuality);
        setShowAddModal(false);
        setCustomHours(7);
        setCustomMinutes(0);
        setCustomQuality('good');
    };

    const handleDeleteEntry = async (entryId: string) => {
        const prevTotal = totalRef.current;
        const entry = sleepData.entries.find((e) => e._id === entryId);
        const goal = sleepData.goal;
        const removed = entry ? entry.hours + entry.minutes / 60 : 0;

        // Optimistic feedback: animate the decrease immediately
        if (entry) {
            animateSleepFill(prevTotal, Math.max(prevTotal - removed, 0), goal);
        }

        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const response = await fetch(`/api/client/sleep?id=${entryId}&date=${dateStr}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                // DELETE now returns the full updated state — no second fetch needed
                const data = await response.json();
                toast.success('Entry deleted');
                applyData(data, false);
            } else {
                toast.error('Failed to delete entry');
                if (entry) animateSleepFill(Math.max(prevTotal - removed, 0), prevTotal, goal); // revert
            }
        } catch {
            toast.error('Something went wrong');
            if (entry) animateSleepFill(Math.max(prevTotal - removed, 0), prevTotal, goal); // revert
        }
    };

    const handleCompleteSleep = async () => {
        setCompletingTask(true);
        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const response = await fetch('/api/client/sleep', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'complete', date: dateStr })
            });

            if (response.ok) {
                // PATCH now returns the full updated state — no second fetch needed
                const data = await response.json();
                toast.success('Sleep goal marked as complete!');
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

    const fillPercent = Math.min((sleepData.totalToday / sleepData.goal) * 100, 100);
    const completionPercent = Math.round(fillPercent);
    const hours = Math.floor(sleepData.totalToday);
    const minutes = Math.round((sleepData.totalToday - hours) * 60);

    if (loading) {
        return <ClientPageSkeleton variant="home" showHeader={false} />;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white px-4 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between">
                    <Link href="/user" className="p-2 -ml-2">
                        <ArrowLeft className="w-6 h-6 text-gray-700" />
                    </Link>
                    <h1 className="text-lg font-bold text-gray-900">Sleep</h1>
                    <button
                        onClick={() => setShowDatePicker(!showDatePicker)}
                        className="flex items-center gap-1 p-2 -mr-2 bg-[#DB9C6E]/10 rounded-lg"
                    >
                        <Calendar className="w-5 h-5 text-[#DB9C6E]" />
                        <span className="text-sm font-medium text-[#DB9C6E]">
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
                {/* Main Sleep Card */}
                <div className="bg-white rounded-3xl p-6 shadow-sm">
                    <div className="flex items-start justify-between">
                        {/* Left side - Stats */}
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                                <Moon className="w-5 h-5 text-[#DB9C6E]" />
                                <span className="text-[#DB9C6E] font-semibold text-sm">TODAY</span>
                            </div>
                            <div className="flex items-baseline">
                                <span className="text-5xl font-bold text-gray-900">{hours}</span>
                                <span className="text-2xl text-gray-400 ml-1">h</span>
                                <span className="text-2xl font-bold text-gray-900 ml-3">{minutes}</span>
                                <span className="text-2xl text-gray-400 ml-1">m</span>
                            </div>
                            <p className="text-gray-500 mt-1">Goal: {sleepData.goal} hours</p>

                            {/* Completion Badge */}
                            <div className="mt-4 inline-flex items-center gap-2 bg-[#DB9C6E]/10 text-[#DB9C6E] px-4 py-2 rounded-full">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span className="font-semibold">{completionPercent}% Complete</span>
                            </div>
                        </div>

                        {/* Right side - Crescent Moon Animation */}
                        <div className="relative w-36 h-48">
                            <svg viewBox="0 0 120 160" className="w-full h-full">
                                <defs>
                                    <linearGradient id="nightSky" x1="0%" y1="0%" x2="0%" y2="100%">
                                        <stop offset="0%" stopColor="#000000" />
                                        <stop offset="50%" stopColor="#111111" />
                                        <stop offset="100%" stopColor="#1a1a1a" />
                                    </linearGradient>
                                    <linearGradient id="moonGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#F5E6D3" />
                                        <stop offset="50%" stopColor="#EABB8C" />
                                        <stop offset="100%" stopColor="#DB9C6E" />
                                    </linearGradient>
                                    <filter id="moonShadow" x="-50%" y="-50%" width="200%" height="200%">
                                        <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                                        <feOffset dx="0" dy="2" result="offsetblur" />
                                        <feFlood floodColor="#DB9C6E" floodOpacity="0.5" />
                                        <feComposite in2="offsetblur" operator="in" />
                                        <feMerge>
                                            <feMergeNode />
                                            <feMergeNode in="SourceGraphic" />
                                        </feMerge>
                                    </filter>
                                    <clipPath id="moonClip">
                                        <circle cx="60" cy="80" r="45" />
                                    </clipPath>
                                </defs>

                                {/* Night sky background circle */}
                                <circle cx="60" cy="80" r="55" fill="url(#nightSky)" opacity="0.9" />
                                <circle cx="60" cy="80" r="55" fill="none" stroke="#DB9C6E" strokeWidth="2" opacity="0.3" />

                                {/* Animated twinkling stars */}
                                <g>
                                    <circle cx="30" cy="50" r="1.5" fill="white">
                                        <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
                                    </circle>
                                    <circle cx="90" cy="45" r="1" fill="white">
                                        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" begin="0.3s" />
                                    </circle>
                                    <circle cx="45" cy="35" r="1.2" fill="white">
                                        <animate attributeName="opacity" values="0.4;1;0.4" dur="2.5s" repeatCount="indefinite" begin="0.8s" />
                                    </circle>
                                    <circle cx="75" cy="60" r="0.8" fill="white">
                                        <animate attributeName="opacity" values="0.3;0.9;0.3" dur="1.8s" repeatCount="indefinite" begin="0.5s" />
                                    </circle>
                                    <circle cx="85" cy="100" r="1" fill="white">
                                        <animate attributeName="opacity" values="0.4;1;0.4" dur="2.2s" repeatCount="indefinite" begin="1s" />
                                    </circle>
                                    <circle cx="35" cy="110" r="1.3" fill="white">
                                        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.7s" repeatCount="indefinite" begin="0.2s" />
                                    </circle>
                                </g>

                                {/* Crescent moon that fills based on progress */}
                                <g filter="url(#moonShadow)">
                                    {/* Full moon base */}
                                    <circle cx="60" cy="80" r="35" fill="url(#moonGlow)" />

                                    {/* Shadow overlay to create crescent - moves based on fill */}
                                    <circle
                                        cx={60 + 25 - (animatedFill * 0.5)}
                                        cy="80"
                                        r="32"
                                        fill="url(#nightSky)"
                                        style={{ transition: isAnimating ? 'none' : 'all 0.8s ease-out' }}
                                    />
                                </g>

                                {/* Moon surface details */}
                                <circle cx="50" cy="75" r="4" fill="#DB9C6E" opacity="0.3" />
                                <circle cx="65" cy="90" r="3" fill="#DB9C6E" opacity="0.2" />
                                <circle cx="55" cy="85" r="2" fill="#DB9C6E" opacity="0.25" />

                                {/* Floating Z's for sleep */}
                                {animatedFill > 20 && (
                                    <g fill="#DB9C6E" fontFamily="sans-serif" fontWeight="bold">
                                        <text x="95" y="50" fontSize="12" opacity="0.7">
                                            <animate attributeName="y" values="50;35;50" dur="3s" repeatCount="indefinite" />
                                            <animate attributeName="opacity" values="0;0.7;0" dur="3s" repeatCount="indefinite" />
                                            Z
                                        </text>
                                        <text x="100" y="40" fontSize="10" opacity="0.5">
                                            <animate attributeName="y" values="40;20;40" dur="3.5s" repeatCount="indefinite" begin="0.5s" />
                                            <animate attributeName="opacity" values="0;0.5;0" dur="3.5s" repeatCount="indefinite" begin="0.5s" />
                                            z
                                        </text>
                                        <text x="105" y="30" fontSize="8" opacity="0.3">
                                            <animate attributeName="y" values="30;10;30" dur="4s" repeatCount="indefinite" begin="1s" />
                                            <animate attributeName="opacity" values="0;0.3;0" dur="4s" repeatCount="indefinite" begin="1s" />
                                            z
                                        </text>
                                    </g>
                                )}

                                {/* Progress text */}
                                <text x="60" y="150" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#DB9C6E">
                                    {completionPercent}%
                                </text>
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Assigned Sleep Section */}
                {sleepData.assignedSleep && sleepData.assignedSleep.amount > 0 && (
                    <div className={`rounded-3xl p-5 shadow-sm ${sleepData.assignedSleep.isCompleted
                        ? 'bg-green-50 border-2 border-green-200'
                        : 'bg-purple-50 border-2 border-purple-200'
                        }`}>
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-semibold text-gray-600 mb-1">
                                    Today's Sleep Goal
                                </p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {sleepData.assignedSleep.amount} hours
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    Assigned: {format(new Date(sleepData.assignedSleep.assignedAt), 'MMM d, h:mm a')}
                                </p>
                            </div>

                            {sleepData.assignedSleep.isCompleted ? (
                                <div className="flex items-center gap-2 bg-[#3AB1A0] text-white px-4 py-2 rounded-full">
                                    <Check className="w-5 h-5" />
                                    <span className="font-semibold">Completed</span>
                                </div>
                            ) : (
                                <button
                                    onClick={handleCompleteSleep}
                                    disabled={completingTask || sleepData.totalToday < sleepData.assignedSleep.amount}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all ${sleepData.totalToday >= sleepData.assignedSleep.amount
                                        ? 'bg-[#DB9C6E] text-white hover:bg-[#c58a5c]'
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
                                <span>{Math.min(Math.round((sleepData.totalToday / sleepData.assignedSleep.amount) * 100), 100)}%</span>
                            </div>
                            <div className="h-2 bg-white rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${sleepData.assignedSleep.isCompleted ? 'bg-[#3AB1A0]' : 'bg-[#DB9C6E]'
                                        }`}
                                    style={{ width: `${Math.min((sleepData.totalToday / sleepData.assignedSleep.amount) * 100, 100)}%` }}
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
                            Custom sleep
                        </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        {/* 6 hours */}
                        <button
                            onClick={() => handleQuickAdd(6, 0, 'good')}
                            disabled={saving}
                            className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center gap-3 hover:shadow-md transition-all active:scale-95"
                        >
                            <div className="h-12 w-12 rounded-full bg-[#DB9C6E]/10 flex items-center justify-center">
                                <Moon className="w-6 h-6 text-[#DB9C6E]" />
                            </div>
                            <span className="font-semibold text-gray-900">6h</span>
                        </button>

                        {/* 7 hours */}
                        <button
                            onClick={() => handleQuickAdd(7, 0, 'good')}
                            disabled={saving}
                            className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center gap-3 hover:shadow-md transition-all active:scale-95"
                        >
                            <div className="h-12 w-12 rounded-full bg-[#DB9C6E]/10 flex items-center justify-center">
                                <Moon className="w-6 h-6 text-[#DB9C6E]" />
                            </div>
                            <span className="font-semibold text-gray-900">7h</span>
                        </button>

                        {/* 8 hours */}
                        <button
                            onClick={() => handleQuickAdd(8, 0, 'good')}
                            disabled={saving}
                            className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center gap-3 hover:shadow-md transition-all active:scale-95"
                        >
                            <div className="h-12 w-12 rounded-full bg-[#DB9C6E]/10 flex items-center justify-center">
                                <Moon className="w-6 h-6 text-[#DB9C6E]" />
                            </div>
                            <span className="font-semibold text-gray-900">8h</span>
                        </button>
                    </div>
                </div>

                {/* Today's History */}
                <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Today's Sleep Log</h2>

                    {sleepData.entries.length === 0 ? (
                        <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                            <Moon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500">No sleep entries yet today</p>
                            <p className="text-sm text-gray-400 mt-1">Start tracking your sleep!</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {sleepData.entries.map((entry) => (
                                <div
                                    key={entry._id}
                                    className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-full flex items-center justify-center bg-[#DB9C6E]/10">
                                            <Moon className="w-6 h-6 text-[#DB9C6E]" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-900">Sleep</p>
                                            <p className="text-sm text-gray-500">
                                                {entry.hours}h {entry.minutes}m
                                                {entry.quality && ` • Quality: ${entry.quality}`}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="text-right">
                                            <p className="font-semibold text-gray-900">{entry.hours}h {entry.minutes}m</p>
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

            {/* Custom Sleep Modal */}
            {showAddModal && (
                <div className="client-popup-above-nav fixed inset-0 z-50 flex items-end justify-center bg-black/50">
                    <div className="client-bottom-sheet-panel max-h-full w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6">
                        {/* Handle */}
                        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6" />

                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-gray-900">Add Sleep</h3>
                            <button onClick={() => setShowAddModal(false)} className="p-2">
                                <X className="w-6 h-6 text-gray-500" />
                            </button>
                        </div>

                        {/* Hours Section */}
                        <div className="mb-6">
                            <p className="text-center text-gray-500 text-sm mb-4">HOURS</p>
                            <div className="flex items-center justify-center gap-6">
                                <button
                                    onClick={() => setCustomHours(Math.max(0, customHours - 1))}
                                    className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                                >
                                    <Minus className="w-5 h-5 text-gray-600" />
                                </button>

                                <div className="text-center">
                                    <input
                                        type="number"
                                        value={customHours}
                                        onChange={(e) => setCustomHours(Math.max(0, parseInt(e.target.value) || 0))}
                                        className="text-5xl font-bold text-gray-900 w-24 text-center bg-transparent border-none outline-none"
                                    />
                                    <p className="text-gray-500">hours</p>
                                </div>

                                <button
                                    onClick={() => setCustomHours(customHours + 1)}
                                    className="w-14 h-14 rounded-2xl border-2 border-[#DB9C6E] flex items-center justify-center hover:bg-[#DB9C6E]/10 transition-colors"
                                >
                                    <Plus className="w-5 h-5 text-[#DB9C6E]" />
                                </button>
                            </div>
                        </div>

                        {/* Minutes Section */}
                        <div className="mb-6">
                            <p className="text-center text-gray-500 text-sm mb-4">MINUTES</p>
                            <div className="flex items-center justify-center gap-6">
                                <button
                                    onClick={() => setCustomMinutes(Math.max(0, customMinutes - 15))}
                                    className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                                >
                                    <Minus className="w-5 h-5 text-gray-600" />
                                </button>

                                <div className="text-center">
                                    <input
                                        type="number"
                                        value={customMinutes}
                                        onChange={(e) => setCustomMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                                        className="text-5xl font-bold text-gray-900 w-24 text-center bg-transparent border-none outline-none"
                                    />
                                    <p className="text-gray-500">minutes</p>
                                </div>

                                <button
                                    onClick={() => setCustomMinutes(Math.min(59, customMinutes + 15))}
                                    className="w-14 h-14 rounded-2xl border-2 border-[#DB9C6E] flex items-center justify-center hover:bg-[#DB9C6E]/10 transition-colors"
                                >
                                    <Plus className="w-5 h-5 text-[#DB9C6E]" />
                                </button>
                            </div>
                        </div>

                        {/* Quality Section */}
                        <div className="mb-6">
                            <p className="text-center text-gray-500 text-sm mb-3">QUALITY</p>
                            <div className="flex justify-center gap-3">
                                {['poor', 'fair', 'good', 'excellent'].map((quality) => (
                                    <button
                                        key={quality}
                                        onClick={() => setCustomQuality(quality)}
                                        className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors capitalize ${customQuality === quality
                                            ? 'bg-[#DB9C6E] text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                    >
                                        {quality}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Add Button */}
                        <button
                            onClick={handleCustomAdd}
                            disabled={saving || (customHours === 0 && customMinutes === 0)}
                            className="w-full py-4 bg-[#E06A26] text-white rounded-2xl font-semibold flex items-center justify-center gap-2 hover:bg-[#c55a1f] transition-colors disabled:opacity-50"
                        >
                            <Moon className="w-5 h-5" />
                            {saving ? 'Adding...' : 'Add Sleep'}
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

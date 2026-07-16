'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageTransition from '@/components/animations/PageTransition';
import { useTheme } from '@/contexts/ThemeContext';
import { format } from 'date-fns';
import {
    ArrowLeft,
    Calendar,
    Droplets,
    Footprints,
    Moon,
    Dumbbell,
    ChevronDown,
    ChevronUp,
    Check,
    Clock,
    Target,
    Loader2,
    CheckCircle2,
    Circle,
    RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import SpoonGifLoader from '@/components/ui/SpoonGifLoader';

interface AssignedWater {
    amount: number;
    assignedAt: string;
    isCompleted: boolean;
    completedAt?: string;
    currentIntake?: number;
}

interface AssignedActivity {
    _id: string;
    name: string;
    sets: number;
    reps: number;
    duration: number;
    videoLink?: string;
    completed: boolean;
    completedAt?: string;
    time: string;
}

interface AssignedSteps {
    target: number;
    current: number;
    isCompleted: boolean;
}

interface AssignedSleep {
    targetHours: number;
    targetMinutes: number;
    currentHours: number;
    currentMinutes: number;
    isCompleted: boolean;
}

interface TasksData {
    water: AssignedWater | null;
    activities: AssignedActivity[];
    steps: AssignedSteps | null;
    sleep: AssignedSleep | null;
    date: string;
    dataHash?: string;
}

export default function TasksPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { isDarkMode } = useTheme();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [tasksData, setTasksData] = useState<TasksData>({
        water: null,
        activities: [],
        steps: null,
        sleep: null,
        date: new Date().toISOString()
    });
    const [lastDataHash, setLastDataHash] = useState<string | null>(null);
    const [completingTask, setCompletingTask] = useState<string | null>(null);

    // Expanded state for each card
    const [expandedCards, setExpandedCards] = useState<{ [key: string]: boolean }>({
        water: false,
        activities: false,
        steps: false,
        sleep: false
    });

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    const fetchTasksData = useCallback(async (showLoader = true) => {
        try {
            if (showLoader) setLoading(true);
            setRefreshing(true);
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const response = await fetch(`/api/client/tasks?date=${dateStr}`);
            if (response.ok) {
                const data = await response.json();
                setTasksData(data);
                setLastDataHash(data.dataHash || null);
            }
        } catch (error) {
            console.error('Error fetching tasks data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedDate]);

    // Manual refresh handler
    const handleRefresh = () => {
        fetchTasksData(false);
        toast.success('Tasks refreshed!');
    };

    // Fetch on initial load and when date changes
    useEffect(() => {
        if (session?.user) {
            fetchTasksData(true);
        }
    }, [session, selectedDate, fetchTasksData]);

    // Refresh when page becomes visible (user switches tabs back) or window gains focus
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && session?.user) {
                fetchTasksData(false);
            }
        };

        const handleFocus = () => {
            if (session?.user) {
                fetchTasksData(false);
            }
        };

        // Listen for user-data-changed event (triggered when dietitian assigns new tasks)
        const handleDataChange = () => {
            if (session?.user) {
                fetchTasksData(false);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);
        window.addEventListener('user-data-changed', handleDataChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('user-data-changed', handleDataChange);
        };
    }, [session, fetchTasksData]);

    const toggleCard = (cardId: string) => {
        setExpandedCards(prev => ({
            ...prev,
            [cardId]: !prev[cardId]
        }));
    };

    const handleCompleteTask = async (taskType: string, taskId?: string) => {
        setCompletingTask(taskId || taskType);
        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const response = await fetch('/api/client/tasks', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskType,
                    taskId,
                    date: dateStr,
                    action: 'complete'
                })
            });

            if (response.ok) {
                toast.success('Task marked as complete!');
                fetchTasksData(false);
            } else {
                const error = await response.json();
                toast.error(error.error || 'Failed to complete task');
            }
        } catch (error) {
            toast.error('Something went wrong');
        } finally {
            setCompletingTask(null);
        }
    };

    // Count completed tasks
    const getTaskStats = () => {
        let total = 0;
        let completed = 0;

        if (tasksData.water) {
            total++;
            if (tasksData.water.isCompleted) completed++;
        }
        if (tasksData.steps) {
            total++;
            if (tasksData.steps.isCompleted) completed++;
        }
        if (tasksData.sleep) {
            total++;
            if (tasksData.sleep.isCompleted) completed++;
        }
        tasksData.activities.forEach(activity => {
            total++;
            if (activity.completed) completed++;
        });

        return { total, completed };
    };

    const stats = getTaskStats();

    if (loading) {
        return (
            <div className={`fixed inset-0 flex items-center justify-center z-100 ${isDarkMode ? 'bg-gray-950' : 'bg-white'}`}>
                <SpoonGifLoader size="lg" />
            </div>
        );
    }

    // Always show water card if assigned, even if not completed
    const showWater = !!tasksData.water;

    return (
        <PageTransition>
            <div className={`min-h-screen pb-24 transition-colors duration-300 ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                {/* Header */}
                <div className={`transition-colors duration-300 px-4 py-4 border-b ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center justify-between">
                    <Link href="/user" className="p-2 -ml-2">
                        <ArrowLeft className={`w-6 h-6 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`} />
                    </Link>
                    <div className="flex items-center gap-2">
                        <h1 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>My Tasks</h1>
                    
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'bg-gray-900 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'}`}
                        >
                            <RefreshCw className={`w-5 h-5 ${isDarkMode ? 'text-gray-200' : 'text-gray-600'} ${refreshing ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            onClick={() => setShowDatePicker(!showDatePicker)}
                            className="flex items-center gap-1 p-2 bg-[#3AB1A0]/10 rounded-lg"
                        >
                            <Calendar className="w-5 h-5 text-[#3AB1A0]" />
                            <span className="text-sm font-medium text-[#3AB1A0]">
                                {format(selectedDate, 'dd MMM')}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Date Picker */}
                {showDatePicker && (
                    <div className={`mt-3 p-3 rounded-xl ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                        <input
                            type="date"
                            value={format(selectedDate, 'yyyy-MM-dd')}
                            onChange={(e) => {
                                setSelectedDate(new Date(e.target.value));
                                setShowDatePicker(false);
                            }}
                            className={`w-full p-2 border rounded-lg ${isDarkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                        />
                    </div>
                )}
            </div>

            <div className="px-4 py-6 space-y-4">
                {/* Progress Summary */}
                <div className="bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B] rounded-2xl p-4 text-white">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-white/70 text-sm">Today's Progress</p>
                            <p className="text-3xl font-bold mt-1">
                                {stats.completed}/{stats.total} Tasks
                            </p>
                        </div>
                        <div className="relative w-16 h-16">
                            <svg className="w-16 h-16 transform -rotate-90">
                                <circle
                                    cx="32"
                                    cy="32"
                                    r="28"
                                    stroke="rgba(255,255,255,0.3)"
                                    strokeWidth="6"
                                    fill="none"
                                />
                                <circle
                                    cx="32"
                                    cy="32"
                                    r="28"
                                    stroke="white"
                                    strokeWidth="6"
                                    fill="none"
                                    strokeDasharray={`${(stats.completed / (stats.total || 1)) * 175.93} 175.93`}
                                    strokeLinecap="round"
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-sm font-bold">
                                    {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {stats.total === 0 && !showWater ? (
                    <div className={`rounded-2xl p-8 text-center border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                        <Target className={`w-16 h-16 mx-auto mb-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                        <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>No Tasks Assigned</h3>
                        <p className={`${isDarkMode ? 'text-gray-300' : 'text-gray-500'} text-sm`}>
                            Your dietitian hasn't assigned any tasks for today yet.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Water Task Card */}
                        {tasksData.water && (
                            <div className={`rounded-2xl shadow-sm overflow-hidden border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                                <button
                                    onClick={() => toggleCard('water')}
                                    className="w-full p-4 flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tasksData.water && tasksData.water.isCompleted ? 'bg-[#3AB1A0]/10' : 'bg-[#3AB1A0]/10'
                                            }`}>
                                            <Droplets className={`w-6 h-6 ${tasksData.water && tasksData.water.isCompleted ? 'text-[#3AB1A0]' : 'text-[#3AB1A0]'
                                                }`} />
                                        </div>
                                        <div className="text-left">
                                            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Water Intake</h3>
                                            <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                                                Goal: {tasksData.water ? tasksData.water.amount.toLocaleString() : '--'} ml
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {tasksData.water && tasksData.water.isCompleted ? (
                                            <CheckCircle2 className="w-6 h-6 text-[#3AB1A0]" />
                                        ) : (
                                            <Circle className={`w-6 h-6 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                                        )}
                                        {expandedCards.water ? (
                                            <ChevronUp className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-400'}`} />
                                        ) : (
                                            <ChevronDown className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-400'}`} />
                                        )}
                                    </div>
                                </button>

                                {expandedCards.water && (
                                    <div className={`px-4 pb-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                                        <div className="pt-4 space-y-3">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Target Amount</span>
                                                <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{tasksData.water ? tasksData.water.amount.toLocaleString() : '--'} ml</span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Current Intake</span>
                                                <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{tasksData.water?.currentIntake ? tasksData.water.currentIntake.toLocaleString() : '0'} ml</span>
                                            </div>
                                            {/* Progress bar for water */}
                                            {tasksData.water && (
                                                <div className={`w-full rounded-full h-2 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                                                    <div
                                                        className={`h-2 rounded-full transition-all ${tasksData.water.isCompleted ? 'bg-[#3AB1A0]' : 'bg-[#3AB1A0]'}`}
                                                        style={{ width: `${Math.min(((tasksData.water.currentIntake || 0) / tasksData.water.amount) * 100, 100)}%` }}
                                                    />
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between text-sm">
                                                <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Assigned</span>
                                                <span className={isDarkMode ? 'text-gray-300' : 'text-gray-500'}>
                                                    {tasksData.water && tasksData.water.assignedAt ? format(new Date(tasksData.water.assignedAt), 'MMM d, h:mm a') : '--'}
                                                </span>
                                            </div>
                                            {(() => {
                                                const waterGoalMet = tasksData.water && (tasksData.water.currentIntake || 0) >= tasksData.water.amount;
                                                
                                                if (tasksData.water?.isCompleted) {
                                                    return (
                                                        <div className="flex items-center gap-2 text-[#3AB1A0] bg-[#3AB1A0]/10 p-3 rounded-lg">
                                                            <Check className="w-5 h-5" />
                                                            <span className="font-medium">Completed</span>
                                                            {tasksData.water.completedAt && (
                                                                <span className="text-sm text-[#3AB1A0] ml-auto">
                                                                    {format(new Date(tasksData.water.completedAt), 'h:mm a')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                } else if (waterGoalMet) {
                                                    return (
                                                        <button
                                                            onClick={() => handleCompleteTask('water')}
                                                            disabled={completingTask === 'water'}
                                                            className="w-full py-3 bg-[#3AB1A0] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#2A9A8B] disabled:opacity-50"
                                                        >
                                                            {completingTask === 'water' ? (
                                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                            ) : (
                                                                <Check className="w-5 h-5" />
                                                            )}
                                                            Mark as Complete
                                                        </button>
                                                    );
                                                } else {
                                                    return (
                                                        <div className="space-y-2">
                                                            <p className={`text-sm text-center ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                                                                Drink {((tasksData.water?.amount || 0) - (tasksData.water?.currentIntake || 0)).toLocaleString()} ml more to complete
                                                            </p>
                                                            <div className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 cursor-not-allowed ${isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-500'}`}>
                                                                <Check className="w-5 h-5" />
                                                                Mark as Complete
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Steps Task Card */}
                        {tasksData.steps && (
                            <div className={`rounded-2xl shadow-sm overflow-hidden border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                                <button
                                    onClick={() => toggleCard('steps')}
                                    className="w-full p-4 flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tasksData.steps.isCompleted ? 'bg-[#3AB1A0]/10' : 'bg-[#E06A26]/10'
                                            }`}>
                                            <Footprints className={`w-6 h-6 ${tasksData.steps.isCompleted ? 'text-[#3AB1A0]' : 'text-[#E06A26]'
                                                }`} />
                                        </div>
                                        <div className="text-left">
                                            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Daily Steps</h3>
                                            <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                                                {tasksData.steps.current.toLocaleString()} / {tasksData.steps.target.toLocaleString()} steps
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {tasksData.steps.isCompleted ? (
                                            <CheckCircle2 className="w-6 h-6 text-[#3AB1A0]" />
                                        ) : (
                                            <Circle className={`w-6 h-6 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                                        )}
                                        {expandedCards.steps ? (
                                            <ChevronUp className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-400'}`} />
                                        ) : (
                                            <ChevronDown className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-400'}`} />
                                        )}
                                    </div>
                                </button>

                                {expandedCards.steps && (
                                    <div className={`px-4 pb-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                                        <div className="pt-4 space-y-3">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Target Steps</span>
                                                <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{tasksData.steps.target.toLocaleString()}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Current Steps</span>
                                                <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{tasksData.steps.current.toLocaleString()}</span>
                                            </div>
                                            <div className={`w-full rounded-full h-2 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                                                <div
                                                    className={`h-2 rounded-full transition-all ${tasksData.steps.isCompleted ? 'bg-[#3AB1A0]' : 'bg-[#E06A26]'
                                                        }`}
                                                    style={{ width: `${Math.min((tasksData.steps.current / tasksData.steps.target) * 100, 100)}%` }}
                                                />
                                            </div>
                                            {tasksData.steps.isCompleted ? (
                                                <div className="flex items-center gap-2 text-[#3AB1A0] bg-[#3AB1A0]/10 p-3 rounded-lg">
                                                    <Check className="w-5 h-5" />
                                                    <span className="font-medium">Goal Achieved!</span>
                                                </div>
                                            ) : tasksData.steps.current >= tasksData.steps.target ? (
                                                <div className="space-y-3">
                                                    <p className="text-sm text-[#3AB1A0] text-center font-medium">
                                                        🎉 You've reached your step goal!
                                                    </p>
                                                    <Button
                                                        onClick={() => handleCompleteTask('steps')}
                                                        disabled={completingTask === 'steps'}
                                                        className="w-full bg-[#3AB1A0] hover:bg-[#2A9A8B] text-white"
                                                    >
                                                        {completingTask === 'steps' ? (
                                                            <>
                                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                                Marking...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Check className="h-4 w-4 mr-2" />
                                                                Mark as Done
                                                            </>
                                                        )}
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    <p className={`text-sm text-center ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                                                        Keep walking! You need {(tasksData.steps.target - tasksData.steps.current).toLocaleString()} more steps.
                                                    </p>
                                                    <div className={`w-full py-2 rounded-lg font-medium flex items-center justify-center gap-2 cursor-not-allowed ${isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-500'}`}>
                                                        <Check className="h-4 w-4" />
                                                        Mark as Done
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sleep Task Card */}
                        {tasksData.sleep && (
                            <div className={`rounded-2xl shadow-sm overflow-hidden border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                                <button
                                    onClick={() => toggleCard('sleep')}
                                    className="w-full p-4 flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tasksData.sleep.isCompleted ? 'bg-[#3AB1A0]/10' : 'bg-[#DB9C6E]/10'
                                            }`}>
                                            <Moon className={`w-6 h-6 ${tasksData.sleep.isCompleted ? 'text-[#3AB1A0]' : 'text-[#DB9C6E]'
                                                }`} />
                                        </div>
                                        <div className="text-left">
                                            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Sleep Goal</h3>
                                            <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                                                Target: {tasksData.sleep.targetHours}h {tasksData.sleep.targetMinutes}m
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {tasksData.sleep.isCompleted ? (
                                            <CheckCircle2 className="w-6 h-6 text-[#3AB1A0]" />
                                        ) : (
                                            <Circle className={`w-6 h-6 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                                        )}
                                        {expandedCards.sleep ? (
                                            <ChevronUp className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-400'}`} />
                                        ) : (
                                            <ChevronDown className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-400'}`} />
                                        )}
                                    </div>
                                </button>

                                {expandedCards.sleep && (
                                    <div className={`px-4 pb-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                                        <div className="pt-4 space-y-3">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Target Sleep</span>
                                                <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{tasksData.sleep.targetHours}h {tasksData.sleep.targetMinutes}m</span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Logged Sleep</span>
                                                <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{tasksData.sleep.currentHours}h {tasksData.sleep.currentMinutes}m</span>
                                            </div>
                                            {/* Progress bar for sleep */}
                                            {(() => {
                                                const targetMinutes = (tasksData.sleep?.targetHours || 0) * 60 + (tasksData.sleep?.targetMinutes || 0);
                                                const currentMinutes = (tasksData.sleep?.currentHours || 0) * 60 + (tasksData.sleep?.currentMinutes || 0);
                                                const sleepProgress = targetMinutes > 0 ? Math.min((currentMinutes / targetMinutes) * 100, 100) : 0;
                                                return (
                                                    <div className={`w-full rounded-full h-2 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                                                        <div
                                                            className={`h-2 rounded-full transition-all ${tasksData.sleep?.isCompleted ? 'bg-[#3AB1A0]' : 'bg-[#DB9C6E]'}`}
                                                            style={{ width: `${sleepProgress}%` }}
                                                        />
                                                    </div>
                                                );
                                            })()}
                                            {(() => {
                                                const targetMinutes = (tasksData.sleep?.targetHours || 0) * 60 + (tasksData.sleep?.targetMinutes || 0);
                                                const currentMinutes = (tasksData.sleep?.currentHours || 0) * 60 + (tasksData.sleep?.currentMinutes || 0);
                                                const sleepGoalMet = currentMinutes >= targetMinutes;
                                                
                                                if (tasksData.sleep?.isCompleted) {
                                                    return (
                                                        <div className="flex items-center gap-2 text-[#3AB1A0] bg-[#3AB1A0]/10 p-3 rounded-lg">
                                                            <Check className="w-5 h-5" />
                                                            <span className="font-medium">Sleep Goal Met!</span>
                                                        </div>
                                                    );
                                                } else if (sleepGoalMet) {
                                                    return (
                                                        <button
                                                            onClick={() => handleCompleteTask('sleep')}
                                                            disabled={completingTask === 'sleep'}
                                                            className="w-full py-3 bg-[#DB9C6E] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#C48A5E] disabled:opacity-50"
                                                        >
                                                            {completingTask === 'sleep' ? (
                                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                            ) : (
                                                                <Check className="w-5 h-5" />
                                                            )}
                                                            Mark as Complete
                                                        </button>
                                                    );
                                                } else {
                                                    const remainingMinutes = targetMinutes - currentMinutes;
                                                    const remainingHours = Math.floor(remainingMinutes / 60);
                                                    const remainingMins = remainingMinutes % 60;
                                                    return (
                                                        <div className="space-y-2">
                                                            <p className={`text-sm text-center ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                                                                Log {remainingHours > 0 ? `${remainingHours}h ` : ''}{remainingMins}m more sleep to complete
                                                            </p>
                                                            <div className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 cursor-not-allowed ${isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-500'}`}>
                                                                <Check className="w-5 h-5" />
                                                                Mark as Complete
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Activities Task Card */}
                        {tasksData.activities.length > 0 && (
                            <div className={`rounded-2xl shadow-sm overflow-hidden border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                                <button
                                    onClick={() => toggleCard('activities')}
                                    className="w-full p-4 flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tasksData.activities.every(a => a.completed) ? 'bg-[#3AB1A0]/10' : 'bg-[#E06A26]/10'
                                            }`}>
                                            <Dumbbell className={`w-6 h-6 ${tasksData.activities.every(a => a.completed) ? 'text-[#3AB1A0]' : 'text-[#E06A26]'
                                                }`} />
                                        </div>
                                        <div className="text-left">
                                            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Activities</h3>
                                            <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                                                {tasksData.activities.filter(a => a.completed).length}/{tasksData.activities.length} completed
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {tasksData.activities.every(a => a.completed) ? (
                                            <CheckCircle2 className="w-6 h-6 text-[#3AB1A0]" />
                                        ) : (
                                            <Circle className={`w-6 h-6 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                                        )}
                                        {expandedCards.activities ? (
                                            <ChevronUp className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-400'}`} />
                                        ) : (
                                            <ChevronDown className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-400'}`} />
                                        )}
                                    </div>
                                </button>

                                {expandedCards.activities && (
                                    <div className={`px-4 pb-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                                        <div className="pt-4 space-y-3">
                                            {tasksData.activities.map((activity, index) => (
                                                <div
                                                    key={activity._id}
                                                    className={`p-3 rounded-xl border ${activity.completed
                                                        ? 'border-[#3AB1A0]/30 bg-[#3AB1A0]/10'
                                                        : isDarkMode
                                                            ? 'border-gray-700 bg-gray-900'
                                                            : 'border-gray-200 bg-gray-50'
                                                        }`}
                                                >
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex-1">
                                                            <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{activity.name}</h4>
                                                            <div className={`flex flex-wrap gap-2 mt-1 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                                                                {activity.sets > 0 && (
                                                                    <span className={`px-2 py-1 rounded ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                                                                        {activity.sets} sets
                                                                    </span>
                                                                )}
                                                                {activity.reps > 0 && (
                                                                    <span className={`px-2 py-1 rounded ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                                                                        {activity.reps} reps
                                                                    </span>
                                                                )}
                                                                {activity.duration > 0 && (
                                                                    <span className={`px-2 py-1 rounded ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                                                                        {activity.duration} min
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {activity.completed ? (
                                                            <div className="flex items-center gap-1 text-[#3AB1A0]">
                                                                <Check className="w-5 h-5" />
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleCompleteTask('activity', `activity-${index}`)}
                                                                disabled={completingTask === `activity-${index}`}
                                                                className="p-2 bg-[#E06A26] text-white rounded-lg hover:bg-[#C55A1C] disabled:opacity-50"
                                                            >
                                                                {completingTask === `activity-${index}` ? (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <Check className="w-4 h-4" />
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                    {activity.videoLink && (
                                                        <a
                                                            href={activity.videoLink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-xs text-[#E06A26] mt-2 inline-block"
                                                        >
                                                            Watch Video →
                                                        </a>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
        </PageTransition>
    );
}

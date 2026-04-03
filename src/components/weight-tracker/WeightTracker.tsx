'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
    TrendingUp,
    TrendingDown,
    Minus,
    Scale,
    Plus,
    Trash2,
    RotateCcw,
    Calendar,
    Clock,
    Flag,
    Target,
    Eye,
    EyeOff
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface WeightEntry {
    id: string;
    weight: number;
    unit: 'kg' | 'lbs';
    timestamp: string;
    isFirst: boolean;
}

interface WeightTrackerData {
    firstWeight: WeightEntry | null;
    currentWeight: WeightEntry | null;
    history: WeightEntry[];
    preferredUnit: 'kg' | 'lbs';
}

interface ProgressApiWeightEntry {
    _id?: string;
    weight: number;
    date: string;
}

interface ProgressApiResponse {
    currentWeight?: number;
    startWeight?: number;
    weightHistory?: ProgressApiWeightEntry[];
}

const UNIT_STORAGE_KEY = 'weight_tracker_preferred_unit';

const convertWeight = (weight: number, fromUnit: 'kg' | 'lbs', toUnit: 'kg' | 'lbs'): number => {
    if (fromUnit === toUnit) return weight;
    if (fromUnit === 'kg' && toUnit === 'lbs') return weight * 2.20462;
    return weight / 2.20462;
};

const formatWeight = (weight: number, unit: 'kg' | 'lbs'): string => {
    return `${weight.toFixed(1)} ${unit}`;
};

export default function WeightTracker() {
    const [data, setData] = useState<WeightTrackerData>({
        firstWeight: null,
        currentWeight: null,
        history: [],
        preferredUnit: 'kg'
    });
    const [inputWeight, setInputWeight] = useState('');
    const [isLoaded, setIsLoaded] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showWeightDetails, setShowWeightDetails] = useState(true);

    const hydrateFromApi = useCallback((apiData: ProgressApiResponse) => {
        const rawHistory = Array.isArray(apiData?.weightHistory) ? apiData.weightHistory : [];

        const normalized = rawHistory
            .map((entry, index) => ({
                id: String(entry?._id || `${entry?.date || Date.now()}-${index}`),
                weight: Number(entry?.weight || 0),
                unit: 'kg' as const,
                timestamp: new Date(entry?.date || Date.now()).toISOString(),
                isFirst: false,
            }))
            .filter(entry => Number.isFinite(entry.weight) && entry.weight > 0)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // newest first

        if (normalized.length === 0) {
            setData(prev => ({
                ...prev,
                firstWeight: null,
                currentWeight: null,
                history: []
            }));
            return;
        }

        const oldestEntry = [...normalized].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )[0];

        const history = normalized.map(entry => ({
            ...entry,
            isFirst: entry.id === oldestEntry.id
        }));

        const firstWeight = history.find(entry => entry.isFirst) || null;
        const currentWeight = history[0] || null;

        setData(prev => ({
            ...prev,
            firstWeight,
            currentWeight,
            history
        }));
    }, []);

    const fetchWeightsFromDb = useCallback(async () => {
        const response = await fetch('/api/client/progress?range=1Y', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Failed to fetch weight history');
        }

        const apiData = await response.json() as ProgressApiResponse;
        hydrateFromApi(apiData);
    }, [hydrateFromApi]);

    // Load unit preference and DB data on mount
    useEffect(() => {
        const initialize = async () => {
            try {
                const storedUnit = localStorage.getItem(UNIT_STORAGE_KEY);
                if (storedUnit === 'kg' || storedUnit === 'lbs') {
                    setData(prev => ({ ...prev, preferredUnit: storedUnit }));
                }

                await fetchWeightsFromDb();
            } catch (error) {
                console.error('Error loading weight data from DB:', error);
                toast.error('Failed to load weight data');
            } finally {
                setIsLoaded(true);
            }
        };

        initialize();
    }, [fetchWeightsFromDb]);

    // Persist only UI unit preference in window storage
    useEffect(() => {
        if (isLoaded) {
            try {
                localStorage.setItem(UNIT_STORAGE_KEY, data.preferredUnit);
            } catch (error) {
                console.error('Error saving preferred unit:', error);
            }
        }
    }, [data.preferredUnit, isLoaded]);

    const handleAddWeight = useCallback(async () => {
        const weightValue = parseFloat(inputWeight);
        if (isNaN(weightValue) || weightValue <= 0 || weightValue > 1000) {
            return;
        }

        const weightInKg = data.preferredUnit === 'kg'
            ? weightValue
            : convertWeight(weightValue, 'lbs', 'kg');

        try {
            setIsSaving(true);

            const response = await fetch('/api/client/progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'weight',
                    value: Number(weightInKg.toFixed(2)),
                    notes: 'Weight logged via Weight Tracker'
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save weight in database');
            }

            await fetchWeightsFromDb();
            setInputWeight('');
            toast.success('Weight saved');
        } catch (error) {
            console.error('Error saving weight:', error);
            toast.error('Failed to save weight');
        } finally {
            setIsSaving(false);
        }
    }, [inputWeight, data.preferredUnit, fetchWeightsFromDb]);

    const handleUnitChange = useCallback((newUnit: 'kg' | 'lbs') => {
        setData(prev => ({
            ...prev,
            preferredUnit: newUnit
        }));
    }, []);

    const handleReset = useCallback(async () => {
        try {
            setIsSaving(true);
            const response = await fetch('/api/client/progress?type=weight&all=true', {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to reset weight data');
            }

            setData(prev => ({
                ...prev,
                firstWeight: null,
                currentWeight: null,
                history: []
            }));
            setInputWeight('');
            toast.success('All weight data reset');
        } catch (error) {
            console.error('Error resetting weights:', error);
            toast.error('Failed to reset weight data');
        } finally {
            setIsSaving(false);
        }
    }, []);

    const handleDeleteEntry = useCallback(async (entryId: string) => {
        try {
            setIsSaving(true);
            const response = await fetch(`/api/client/progress?id=${encodeURIComponent(entryId)}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete entry');
            }

            await fetchWeightsFromDb();
            toast.success('Entry deleted');
        } catch (error) {
            console.error('Error deleting weight entry:', error);
            toast.error('Failed to delete entry');
        } finally {
            setIsSaving(false);
        }
    }, [fetchWeightsFromDb]);

    // Calculate weight change
    const getWeightChange = useCallback(() => {
        if (!data.firstWeight || !data.currentWeight) return null;

        const firstInPreferred = convertWeight(
            data.firstWeight.weight,
            data.firstWeight.unit,
            data.preferredUnit
        );
        const currentInPreferred = convertWeight(
            data.currentWeight.weight,
            data.currentWeight.unit,
            data.preferredUnit
        );

        const change = currentInPreferred - firstInPreferred;
        const percentage = ((change / firstInPreferred) * 100).toFixed(1);

        return {
            value: change,
            percentage,
            direction: change > 0 ? 'gained' : change < 0 ? 'lost' : 'same'
        };
    }, [data.firstWeight, data.currentWeight, data.preferredUnit]);

    const weightChange = getWeightChange();

    const getDisplayWeight = (entry: WeightEntry | null): string => {
        if (!entry) return '--';
        const converted = convertWeight(entry.weight, entry.unit, data.preferredUnit);
        return formatWeight(converted, data.preferredUnit);
    };

    if (!isLoaded) {
        return (
            <div className="flex items-center justify-center p-8">
                <Scale className="h-8 w-8 animate-pulse text-gray-400" />
            </div>
        );
    }

    return (
        <div className="space-y-6 p-4 max-w-2xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Scale className="h-8 w-8 text-primary" />
                    <div>
                        <h1 className="text-2xl font-bold">Weight Tracker</h1>
                        <p className="text-sm text-muted-foreground">Track your weight journey</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowWeightDetails(prev => !prev)}
                    >
                        {showWeightDetails ? (
                            <>
                                <EyeOff className="h-4 w-4 mr-1" />
                                Hide Weight UI
                            </>
                        ) : (
                            <>
                                <Eye className="h-4 w-4 mr-1" />
                                Show Weight UI
                            </>
                        )}
                    </Button>
                    <Select value={data.preferredUnit} onValueChange={(v) => handleUnitChange(v as 'kg' | 'lbs')}>
                        <SelectTrigger className="w-20">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="kg">kg</SelectItem>
                            <SelectItem value="lbs">lbs</SelectItem>
                        </SelectContent>
                    </Select>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" size="icon" className="text-destructive hover:text-destructive" disabled={isSaving}>
                                <RotateCcw className="h-4 w-4" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Reset All Data?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will permanently delete all your weight entries including your starting weight. This action cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Reset All
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>

            {/* Input Section */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex gap-3">
                        <div className="relative flex-1">
                            <Input
                                type="number"
                                placeholder={`Enter weight (${data.preferredUnit})`}
                                value={inputWeight}
                                onChange={(e) => setInputWeight(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddWeight()}
                                className="pr-12"
                                min="0"
                                max="1000"
                                step="0.1"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                                {data.preferredUnit}
                            </span>
                        </div>
                        <Button onClick={handleAddWeight} disabled={isSaving || !inputWeight || parseFloat(inputWeight) <= 0}>
                            <Plus className="h-4 w-4 mr-2" />
                            {isSaving ? 'Saving...' : 'Add Entry'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {showWeightDetails && (
                <>
                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* First Weight Card */}
                        <Card className={cn(
                            "relative overflow-hidden",
                            data.firstWeight && "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20"
                        )}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                        <Flag className="h-4 w-4 text-amber-500" />
                                        First Weight
                                    </CardTitle>
                                    <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300">
                                        START
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold">
                                    {getDisplayWeight(data.firstWeight)}
                                </p>
                                {data.firstWeight && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {format(new Date(data.firstWeight.timestamp), 'MMM d, yyyy')}
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        {/* Current Weight Card */}
                        <Card className={cn(
                            "relative overflow-hidden",
                            data.currentWeight && "border-primary/50 bg-primary/5"
                        )}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                        <Target className="h-4 w-4 text-primary" />
                                        Current Weight
                                    </CardTitle>
                                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                                        NOW
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold">
                                    {getDisplayWeight(data.currentWeight)}
                                </p>
                                {data.currentWeight && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {format(new Date(data.currentWeight.timestamp), 'MMM d, yyyy h:mm a')}
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        {/* Change Card */}
                        <Card className={cn(
                            "relative overflow-hidden",
                            weightChange?.direction === 'lost' && "border-green-500/50 bg-green-50/50 dark:bg-green-950/20",
                            weightChange?.direction === 'gained' && "border-red-500/50 bg-red-50/50 dark:bg-red-950/20"
                        )}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                        {weightChange?.direction === 'lost' && <TrendingDown className="h-4 w-4 text-green-500" />}
                                        {weightChange?.direction === 'gained' && <TrendingUp className="h-4 w-4 text-red-500" />}
                                        {(!weightChange || weightChange.direction === 'same') && <Minus className="h-4 w-4" />}
                                        Change
                                    </CardTitle>
                                    {weightChange && weightChange.direction !== 'same' && (
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                weightChange.direction === 'lost' && "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/50 dark:text-green-300",
                                                weightChange.direction === 'gained' && "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/50 dark:text-red-300"
                                            )}
                                        >
                                            {weightChange.direction === 'lost' ? 'LOST' : 'GAINED'}
                                        </Badge>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className={cn(
                                    "text-3xl font-bold",
                                    weightChange?.direction === 'lost' && "text-green-600 dark:text-green-400",
                                    weightChange?.direction === 'gained' && "text-red-600 dark:text-red-400"
                                )}>
                                    {weightChange ? (
                                        <>
                                            {weightChange.direction === 'gained' ? '+' : ''}
                                            {formatWeight(weightChange.value, data.preferredUnit)}
                                        </>
                                    ) : '--'}
                                </p>
                                {weightChange && weightChange.direction !== 'same' && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {weightChange.direction === 'gained' ? '+' : ''}{weightChange.percentage}% from start
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* History List */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Calendar className="h-5 w-5" />
                                Weight History
                                <Badge variant="secondary" className="ml-2">
                                    {data.history.length} entries
                                </Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {data.history.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Scale className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>No weight entries yet.</p>
                                    <p className="text-sm">Add your first weight to start tracking!</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {data.history.map((entry, index) => {
                                        const isLatest = index === 0;
                                        const previousEntry = data.history[index + 1];
                                        const changeFromPrevious = previousEntry
                                            ? convertWeight(entry.weight, entry.unit, data.preferredUnit) -
                                            convertWeight(previousEntry.weight, previousEntry.unit, data.preferredUnit)
                                            : null;

                                        return (
                                            <div
                                                key={entry.id}
                                                className={cn(
                                                    "flex items-center justify-between p-3 rounded-lg border transition-colors",
                                                    entry.isFirst && "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20",
                                                    isLatest && !entry.isFirst && "border-primary/30 bg-primary/5"
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="flex flex-col items-center gap-1">
                                                        {entry.isFirst && (
                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300">
                                                                START
                                                            </Badge>
                                                        )}
                                                        {isLatest && !entry.isFirst && (
                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30">
                                                                NOW
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-lg">
                                                            {formatWeight(
                                                                convertWeight(entry.weight, entry.unit, data.preferredUnit),
                                                                data.preferredUnit
                                                            )}
                                                        </p>
                                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                            <span className="flex items-center gap-1">
                                                                <Calendar className="h-3 w-3" />
                                                                {format(new Date(entry.timestamp), 'MMM d, yyyy')}
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <Clock className="h-3 w-3" />
                                                                {format(new Date(entry.timestamp), 'h:mm a')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    {changeFromPrevious !== null && changeFromPrevious !== 0 && (
                                                        <span className={cn(
                                                            "text-sm font-medium flex items-center gap-1",
                                                            changeFromPrevious < 0 ? "text-green-600" : "text-red-600"
                                                        )}>
                                                            {changeFromPrevious < 0 ? (
                                                                <TrendingDown className="h-4 w-4" />
                                                            ) : (
                                                                <TrendingUp className="h-4 w-4" />
                                                            )}
                                                            {changeFromPrevious > 0 ? '+' : ''}
                                                            {changeFromPrevious.toFixed(1)}
                                                        </span>
                                                    )}
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                disabled={isSaving}
                                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Delete Entry?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    {entry.isFirst
                                                                        ? "This is your starting weight. Deleting it will set the next oldest entry as your new starting weight."
                                                                        : "Are you sure you want to delete this weight entry?"}
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction
                                                                    onClick={() => handleDeleteEntry(entry.id)}
                                                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                >
                                                                    Delete
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}

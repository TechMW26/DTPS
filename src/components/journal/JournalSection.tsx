'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { MEAL_TYPES, MEAL_TYPE_KEYS } from '@/lib/mealConfig';
import {
  Activity,
  Utensils,
  Footprints,
  Droplets,
  Moon,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Download,
  Plus,
  TrendingUp,
  Trash2,
  Loader2
} from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ActivitySection from './ActivitySection';
import CaloriesSection from './CaloriesSection';
import StepsSection from './StepsSection';
import WaterSection from './WaterSection';
import SleepSection from './SleepSection';

type TabType = 'activity' | 'calories' | 'steps' | 'water' | 'sleep';
type MainTabType = 'daily' | 'progress' | 'food';
type ProgressSubTabType = 'progress' | 'bca' | 'measurements' | 'analytical';

interface JournalSectionProps {
  clientId: string;
  onRegisterReset?: (fn: () => void) => void;
}

export default function JournalSection({ clientId, onRegisterReset }: JournalSectionProps) {
  const { data: session } = useSession();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [activeMainTab, setActiveMainTab] = useState<MainTabType>('daily');
  const [activeTab, setActiveTab] = useState<TabType>('activity');
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Check if the current user is the client themselves (not a dietitian viewing client data)
  const isClient = session?.user?.id === clientId;

  // Register reset callback for floating back button
  useEffect(() => {
    if (onRegisterReset) {
      onRegisterReset(() => {
        setActiveMainTab('daily');
        setActiveTab('activity');
        setSelectedDate(new Date());
        setCalendarOpen(false);
      });
    }
  }, [onRegisterReset]);

  const tabs = [
    { id: 'activity' as TabType, label: 'Activity', icon: Activity, color: 'text-green-500' },
    { id: 'calories' as TabType, label: 'Calories', icon: Utensils, color: 'text-orange-500' },
    { id: 'steps' as TabType, label: 'Steps', icon: Footprints, color: 'text-blue-500' },
    { id: 'water' as TabType, label: 'Water', icon: Droplets, color: 'text-cyan-500' },
    { id: 'sleep' as TabType, label: 'Sleep', icon: Moon, color: 'text-indigo-500' },
  ];

  const mainTabs = [
    { id: 'daily' as MainTabType, label: 'Daily Journal', icon: CalendarDays },
    { id: 'progress' as MainTabType, label: 'Progress Overview', icon: TrendingUp },
    { id: 'food' as MainTabType, label: 'Food Compliance', icon: Utensils },
  ];

  const handlePrevDay = () => {
    setSelectedDate(subDays(selectedDate, 1));
  };

  const handleNextDay = () => {
    setSelectedDate(addDays(selectedDate, 1));
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setCalendarOpen(false);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'activity':
        return <ActivitySection clientId={clientId} selectedDate={selectedDate} isClient={isClient} />;
      case 'calories':
        return <CaloriesSection clientId={clientId} selectedDate={selectedDate} />;
      case 'steps':
        return <StepsSection clientId={clientId} selectedDate={selectedDate} />;
      case 'water':
        return <WaterSection clientId={clientId} selectedDate={selectedDate} />;
      case 'sleep':
        return <SleepSection clientId={clientId} selectedDate={selectedDate} />;
      default:
        return <ActivitySection clientId={clientId} selectedDate={selectedDate} isClient={isClient} />;
    }
  };

  const renderMainContent = () => {
    switch (activeMainTab) {
      case 'daily':
        return (
          <div className="w-full max-w-full">
            {/* Sub-tabs for Daily Journal - Centered */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex gap-1 bg-gray-100 p-1.5 rounded-lg">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <Button
                      key={tab.id}
                      variant={activeTab === tab.id ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2 ${activeTab === tab.id
                        ? 'bg-white text-gray-900 shadow-sm hover:bg-white'
                        : 'text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                      <Icon className={`h-4 w-4 ${activeTab === tab.id ? tab.color : 'text-gray-500'}`} />
                      {tab.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Tab Content - Full Width */}
            <div className="w-full max-w-full">
              {renderTabContent()}
            </div>
          </div>
        );
      case 'progress':
        return <ProgressOverview clientId={clientId} selectedDate={selectedDate} />;
      case 'food':
        return <FoodCompliance clientId={clientId} selectedDate={selectedDate} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 w-full">
      {/* Date Navigation Header */}
      <div className="flex items-center justify-between bg-white rounded-lg border px-4 py-3">
        <Button variant="outline" size="sm" onClick={handlePrevDay} className="flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" />
          Previous Day
        </Button>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 text-center">
              <CalendarDays className="h-4 w-4 text-gray-500" />
              <span className="font-medium">
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="sm" onClick={handleNextDay} className="flex items-center gap-1">
          Next Day
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Main Tabs - Styled like the screenshot */}
      <div className="w-full bg-gray-100 p-1 rounded-lg">
        <div className="flex justify-center gap-1">
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.id}
                variant={activeMainTab === tab.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveMainTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-2 rounded-lg ${activeMainTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm hover:bg-white'
                  : 'text-gray-600 hover:bg-gray-200'
                  }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Main Content - Full Width */}
      <div className="w-full">
        {renderMainContent()}
      </div>
    </div>
  );
}

// Progress Overview Component with Sub-tabs
function ProgressOverview({ clientId, selectedDate }: { clientId: string; selectedDate: Date }) {
  const [activeSubTab, setActiveSubTab] = useState<ProgressSubTabType>('progress');
  const [showAddProgress, setShowAddProgress] = useState(false);
  const [showAddMeasurement, setShowAddMeasurement] = useState(false);

  const subTabs = [
    { id: 'progress' as ProgressSubTabType, label: 'Progress' },
    { id: 'bca' as ProgressSubTabType, label: 'BCA' },
    { id: 'measurements' as ProgressSubTabType, label: 'Measurements' },
    // { id: 'analytical' as ProgressSubTabType, label: 'Analytical Data' },
  ];

  const renderSubContent = () => {
    switch (activeSubTab) {
      case 'progress':
        return <ProgressTab showAddProgress={showAddProgress} setShowAddProgress={setShowAddProgress} clientId={clientId} selectedDate={selectedDate} />;
      case 'bca':
        return <BCATab clientId={clientId} selectedDate={selectedDate} />;
      case 'measurements':
        return <MeasurementsTab showAddMeasurement={showAddMeasurement} setShowAddMeasurement={setShowAddMeasurement} clientId={clientId} selectedDate={selectedDate} />;
      //   case 'analytical':
      //     return <AnalyticalDataTab />;
      default:
        return null;
    }
  };

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Progress</CardTitle>
            <p className="text-sm text-gray-500">Track and monitor your client's health journey</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex items-center gap-1">
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1"
              onClick={() => {
                if (activeSubTab === 'progress') setShowAddProgress(true);
                if (activeSubTab === 'measurements') setShowAddMeasurement(true);
              }}
            >
              <Plus className="h-4 w-4" />
              {activeSubTab === 'measurements' ? 'Add Measurement' : 'Add Progress'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Sub-tabs */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex bg-gray-100 p-1 rounded-lg">
            {subTabs.map((tab) => (
              <Button
                key={tab.id}
                variant={activeSubTab === tab.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveSubTab(tab.id)}
                className={`px-6 ${activeSubTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm hover:bg-white'
                  : 'text-gray-600 hover:bg-gray-200'
                  }`}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Sub-tab Content */}
        {renderSubContent()}
      </CardContent>
    </Card>
  );
}

// Progress Tab Component
function ProgressTab({ showAddProgress, setShowAddProgress, clientId, selectedDate }: { showAddProgress: boolean; setShowAddProgress: (show: boolean) => void; clientId: string; selectedDate: Date }) {
  const [progressHistory, setProgressHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [startedWith, setStartedWith] = useState({ weight: 0, bmr: 0, bmi: 0, bodyFat: 0 });
  const [currentlyAt, setCurrentlyAt] = useState({ weight: 0, bmr: 0, bmi: 0, bodyFat: 0 });
  const [difference, setDifference] = useState({ weight: 0, bmr: 0, bmi: 0, bodyFat: 0 });
  const [clientProfile, setClientProfile] = useState<{ heightCm: number; weightKg: number; gender: string; age: number; activityLevel: string } | null>(null);
  const [newProgress, setNewProgress] = useState({
    weight: '',
    bmi: '',
    bmr: '',
    bodyFat: '',
    dietPlan: '',
    notes: '',
    date: format(selectedDate, 'yyyy-MM-dd')
  });

  const fetchProgress = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/journal/progress?clientId=${clientId}`);
      const data = await res.json();
      if (data.success) {
        setProgressHistory(data.progress);
        setStartedWith(data.summary.startedWith);
        setCurrentlyAt(data.summary.currentlyAt);
        setDifference(data.summary.difference);
        if (data.clientProfile) {
          setClientProfile(data.clientProfile);
        }
      }
    } catch (error) {
      console.error('Error fetching progress:', error);
      toast.error('Failed to load progress data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProgress();
    // Update date in form when selectedDate changes
    setNewProgress(prev => ({ ...prev, date: format(selectedDate, 'yyyy-MM-dd') }));
  }, [clientId]);

  // Keep the form date in sync with selectedDate
  useEffect(() => {
    setNewProgress(prev => ({ ...prev, date: format(selectedDate, 'yyyy-MM-dd') }));
  }, [selectedDate]);

  // Auto-calculate BMI and BMR when weight changes
  useEffect(() => {
    const weight = parseFloat(newProgress.weight);
    if (!weight || weight <= 0 || !clientProfile) return;
    const { heightCm, age, gender } = clientProfile;
    if (heightCm > 0) {
      const hm = heightCm / 100;
      const bmi = weight / (hm * hm);
      setNewProgress(prev => ({ ...prev, bmi: bmi.toFixed(1) }));
    }
    if (heightCm > 0 && age > 0) {
      const base = 10 * weight + 6.25 * heightCm - 5 * age;
      const bmr = gender === 'female' ? base - 161 : base + 5;
      setNewProgress(prev => ({ ...prev, bmr: bmr.toFixed(0) }));
    }
  }, [newProgress.weight, clientProfile]);

  const handleAddProgress = async () => {
    try {
      const res = await fetch('/api/journal/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newProgress,
          weight: parseFloat(newProgress.weight) || 0,
          bmi: parseFloat(newProgress.bmi) || 0,
          bmr: parseFloat(newProgress.bmr) || 0,
          bodyFat: parseFloat(newProgress.bodyFat) || 0,
          clientId
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Progress added successfully');
        setShowAddProgress(false);
        setNewProgress({
          weight: '',
          bmi: '',
          bmr: '',
          bodyFat: '',
          dietPlan: '',
          notes: '',
          date: format(new Date(), 'yyyy-MM-dd')
        });
        fetchProgress();
      }
    } catch (error) {
      console.error('Error adding progress:', error);
      toast.error('Failed to add progress');
    }
  };

  const handleDeleteProgress = async (entryId: string) => {
    try {
      const res = await fetch(`/api/journal/progress?entryId=${entryId}&clientId=${clientId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Progress entry deleted');
        fetchProgress();
      }
    } catch (error) {
      console.error('Error deleting progress:', error);
      toast.error('Failed to delete progress');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Progress Dialog */}
      <Dialog open={showAddProgress} onOpenChange={setShowAddProgress}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Progress Entry</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={newProgress.date}
                onChange={(e) => setNewProgress({ ...newProgress, date: e.target.value })}
              />
            </div>
            <div>
              <Label>Weight (kg)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={newProgress.weight}
                onChange={(e) => setNewProgress({ ...newProgress, weight: e.target.value })}
              />
            </div>
            <div>
              <Label>BMI {clientProfile?.heightCm ? <span className="text-xs text-gray-400">(auto)</span> : null}</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={newProgress.bmi}
                onChange={(e) => setNewProgress({ ...newProgress, bmi: e.target.value })}
                className={clientProfile?.heightCm && newProgress.weight ? 'bg-gray-50' : ''}
                readOnly={!!(clientProfile?.heightCm && newProgress.weight)}
              />
            </div>
            <div>
              <Label>BMR (cal) {clientProfile?.heightCm ? <span className="text-xs text-gray-400">(auto)</span> : null}</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={newProgress.bmr}
                onChange={(e) => setNewProgress({ ...newProgress, bmr: e.target.value })}
                className={clientProfile?.heightCm && newProgress.weight ? 'bg-gray-50' : ''}
                readOnly={!!(clientProfile?.heightCm && newProgress.weight)}
              />
            </div>
            <div>
              <Label>Body Fat (%)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={newProgress.bodyFat}
                onChange={(e) => setNewProgress({ ...newProgress, bodyFat: e.target.value })}
              />
            </div>
            <div>
              <Label>Diet Plan</Label>
              <Input
                placeholder="e.g. Initial Assessment"
                value={newProgress.dietPlan}
                onChange={(e) => setNewProgress({ ...newProgress, dietPlan: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Input
                placeholder="Additional notes..."
                value={newProgress.notes}
                onChange={(e) => setNewProgress({ ...newProgress, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddProgress(false)}>Cancel</Button>
            <Button onClick={handleAddProgress}>Add Progress</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Progress Section Header */}
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-blue-600" />
        <span className="font-medium text-blue-600">Progress</span>
      </div>

      {/* Progress Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
        {/* Started With */}
        <Card className="border-l-4 border-l-blue-500 min-h-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="font-medium text-blue-600">Started With</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Weight</span>
                <span className="font-medium">{startedWith.weight.toFixed(1)} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">BMR</span>
                <span className="font-medium">{startedWith.bmr.toFixed(1)} cal</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">BMI</span>
                <span className="font-medium">{startedWith.bmi.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Body Fat</span>
                <span className="font-medium">{startedWith.bodyFat.toFixed(1)} %</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Currently At */}
        <Card className="border-l-4 border-l-purple-500 min-h-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              <span className="font-medium text-purple-600">Currently At</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Weight</span>
                <span className="font-medium">{currentlyAt.weight.toFixed(1)} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">BMR</span>
                <span className="font-medium">{currentlyAt.bmr.toFixed(1)} cal</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">BMI</span>
                <span className="font-medium">{currentlyAt.bmi.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Body Fat</span>
                <span className="font-medium">{currentlyAt.bodyFat.toFixed(1)} %</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Difference */}
        <Card className="border-l-4 border-l-orange-500 min-h-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              <span className="font-medium text-orange-600">Difference</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Weight</span>
                <span className={`font-medium ${difference.weight < 0 ? 'text-green-600' : difference.weight > 0 ? 'text-red-600' : ''}`}>
                  {difference.weight >= 0 ? '+' : ''}{difference.weight.toFixed(2)} kg
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">BMR</span>
                <span className="font-medium">{difference.bmr >= 0 ? '+' : ''}{difference.bmr.toFixed(2)} cal</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">BMI</span>
                <span className={`font-medium ${difference.bmi < 0 ? 'text-green-600' : difference.bmi > 0 ? 'text-red-600' : ''}`}>
                  {difference.bmi >= 0 ? '+' : ''}{difference.bmi.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Body Fat</span>
                <span className={`font-medium ${difference.bodyFat < 0 ? 'text-green-600' : difference.bodyFat > 0 ? 'text-red-600' : ''}`}>
                  {difference.bodyFat >= 0 ? '+' : ''}{difference.bodyFat.toFixed(2)} %
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Trend Charts */}
      {progressHistory.length >= 2 && (() => {
        const chartData = [...progressHistory]
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map(entry => ({
            date: format(new Date(entry.date), 'MMM d'),
            weight: entry.weight || 0,
            bmi: entry.bmi || 0,
            bmr: entry.bmr || 0,
            bodyFat: entry.bodyFat || 0,
          }));

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Weight Chart */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <h4 className="text-sm font-medium text-gray-600 mb-3">Weight (kg)</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="weight" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Weight" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* BMI Chart */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <h4 className="text-sm font-medium text-gray-600 mb-3">BMI</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="bmi" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="BMI" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* BMR Chart */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <h4 className="text-sm font-medium text-gray-600 mb-3">BMR (cal)</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="bmr" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="BMR" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Body Fat Chart */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <h4 className="text-sm font-medium text-gray-600 mb-3">Body Fat (%)</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="bodyFat" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Body Fat" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Progress History */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Progress History</h3>
          <Badge variant="outline">{progressHistory.length} {progressHistory.length === 1 ? 'entry' : 'entries'}</Badge>
        </div>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full min-w-175">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Weight (kg)</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">BMI</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">BMR (cal)</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Body Fat (%)</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Diet Plan</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Notes</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {progressHistory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    No progress entries yet. Click "Add Progress" to add your first entry.
                  </td>
                </tr>
              ) : (
                progressHistory.map((entry) => (
                  <tr key={entry._id} className="border-t">
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-col">
                        <span>{format(new Date(entry.date), 'MMM d, yyyy, hh:mm a')}</span>
                        {entry.source === 'weight_tracker' && (
                          <span className="text-[10px] text-blue-600 font-medium">Weight Tracker</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{Number.isFinite(entry.weight) ? Number(entry.weight).toFixed(1) : '-'}</td>
                    <td className="px-4 py-3 text-sm">{Number.isFinite(entry.bmi) ? Number(entry.bmi).toFixed(1) : '-'}</td>
                    <td className="px-4 py-3 text-sm">{Number.isFinite(entry.bmr) ? Number(entry.bmr).toFixed(1) : '-'}</td>
                    <td className="px-4 py-3 text-sm">{Number.isFinite(entry.bodyFat) ? Number(entry.bodyFat).toFixed(1) : '-'}</td>
                    <td className="px-4 py-3 text-sm">{entry.dietPlan || '-'}</td>
                    <td className="px-4 py-3 text-sm">{entry.notes || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => handleDeleteProgress(entry._id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// BCA Tab Component
function BCATab({ clientId, selectedDate }: { clientId: string; selectedDate: Date }) {
  const [selectedBCA, setSelectedBCA] = useState('karada');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [bcaHistory, setBcaHistory] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    measurementDate: format(selectedDate, 'yyyy-MM-dd'),
    height: '',
    weight: '',
    bmi: '',
    fatPercentage: '',
    visceralFat: '',
    restingMetabolism: '',
    bodyAge: '',
    fatMass: '',
    totalSubcutFat: '',
    subcutFatTrunk: '',
    subcutFatArms: '',
    subcutFatLegs: '',
    totalSkeletalMuscle: '',
    skeletalMuscleTrunk: '',
    skeletalMuscleArms: '',
    skeletalMuscleLegs: '',
    waist: '',
    hip: '',
    neck: '',
    waterContent: '',
    boneWeight: ''
  });

  const fetchBCA = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/journal/bca?clientId=${clientId}`);
      const data = await res.json();
      if (data.success) {
        setBcaHistory(data.bca || []);
        // Pre-fill form with latest entry if exists
        if (data.latestEntry) {
          setFormData({
            measurementDate: format(selectedDate, 'yyyy-MM-dd'),
            height: data.latestEntry.height?.toString() || '',
            weight: data.latestEntry.weight?.toString() || '',
            bmi: data.latestEntry.bmi?.toString() || '',
            fatPercentage: data.latestEntry.fatPercentage?.toString() || '',
            visceralFat: data.latestEntry.visceralFat?.toString() || '',
            restingMetabolism: data.latestEntry.restingMetabolism?.toString() || '',
            bodyAge: data.latestEntry.bodyAge?.toString() || '',
            fatMass: data.latestEntry.fatMass?.toString() || '',
            totalSubcutFat: data.latestEntry.totalSubcutFat?.toString() || '',
            subcutFatTrunk: data.latestEntry.subcutFatTrunk?.toString() || '',
            subcutFatArms: data.latestEntry.subcutFatArms?.toString() || '',
            subcutFatLegs: data.latestEntry.subcutFatLegs?.toString() || '',
            totalSkeletalMuscle: data.latestEntry.totalSkeletalMuscle?.toString() || '',
            skeletalMuscleTrunk: data.latestEntry.skeletalMuscleTrunk?.toString() || '',
            skeletalMuscleArms: data.latestEntry.skeletalMuscleArms?.toString() || '',
            skeletalMuscleLegs: data.latestEntry.skeletalMuscleLegs?.toString() || '',
            waist: data.latestEntry.waist?.toString() || '',
            hip: data.latestEntry.hip?.toString() || '',
            neck: data.latestEntry.neck?.toString() || '',
            waterContent: data.latestEntry.waterContent?.toString() || '',
            boneWeight: data.latestEntry.boneWeight?.toString() || ''
          });
        }
      }
    } catch (error) {
      console.error('Error fetching BCA:', error);
      toast.error('Failed to load BCA data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBCA();
  }, [clientId]);

  useEffect(() => {
    // Update date in form when selectedDate changes
    setFormData(prev => ({ ...prev, measurementDate: format(selectedDate, 'yyyy-MM-dd') }));
  }, [selectedDate]);

  // Auto-calculate BMI when height and weight change
  useEffect(() => {
    if (formData.height && formData.weight) {
      const heightInMeters = parseFloat(formData.height) * 0.0254; // Convert inches to meters
      const weight = parseFloat(formData.weight);
      if (heightInMeters > 0 && weight > 0) {
        const bmi = weight / (heightInMeters * heightInMeters);
        setFormData(prev => ({ ...prev, bmi: bmi.toFixed(1) }));
      }
    }
  }, [formData.height, formData.weight]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.weight) {
      toast.error('Weight is required');
      return;
    }

    try {
      setIsSaving(true);
      const res = await fetch('/api/journal/bca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bcaType: selectedBCA,
          measurementDate: formData.measurementDate,
          height: parseFloat(formData.height) || 0,
          weight: parseFloat(formData.weight) || 0,
          bmi: parseFloat(formData.bmi) || 0,
          fatPercentage: parseFloat(formData.fatPercentage) || 0,
          visceralFat: parseFloat(formData.visceralFat) || 0,
          restingMetabolism: parseFloat(formData.restingMetabolism) || 0,
          bodyAge: parseFloat(formData.bodyAge) || 0,
          fatMass: parseFloat(formData.fatMass) || 0,
          totalSubcutFat: parseFloat(formData.totalSubcutFat) || 0,
          subcutFatTrunk: parseFloat(formData.subcutFatTrunk) || 0,
          subcutFatArms: parseFloat(formData.subcutFatArms) || 0,
          subcutFatLegs: parseFloat(formData.subcutFatLegs) || 0,
          totalSkeletalMuscle: parseFloat(formData.totalSkeletalMuscle) || 0,
          skeletalMuscleTrunk: parseFloat(formData.skeletalMuscleTrunk) || 0,
          skeletalMuscleArms: parseFloat(formData.skeletalMuscleArms) || 0,
          skeletalMuscleLegs: parseFloat(formData.skeletalMuscleLegs) || 0,
          waist: parseFloat(formData.waist) || 0,
          hip: parseFloat(formData.hip) || 0,
          neck: parseFloat(formData.neck) || 0,
          waterContent: parseFloat(formData.waterContent) || 0,
          boneWeight: parseFloat(formData.boneWeight) || 0,
          clientId
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('BCA data saved successfully');
        fetchBCA();
      } else {
        toast.error(data.error || 'Failed to save BCA data');
      }
    } catch (error) {
      console.error('Error saving BCA:', error);
      toast.error('Failed to save BCA data');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Selected BCA */}
      <div>
        <Label className="text-sm text-gray-600">Current Selected BCA</Label>
        <Select value={selectedBCA} onValueChange={setSelectedBCA}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select BCA type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="karada">Karada BCA</SelectItem>
            <SelectItem value="inbody">InBody</SelectItem>
            <SelectItem value="tanita">Tanita</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Measurement Data */}
      <div>
        <h3 className="font-medium text-gray-700 mb-3">MEASUREMENT DATA</h3>
        <div>
          <Label className="text-sm text-gray-600">Date of Measurement</Label>
          <Input
            type="date"
            value={formData.measurementDate}
            onChange={(e) => handleInputChange('measurementDate', e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      {/* Basic Info */}
      <div>
        <h3 className="font-medium text-gray-700 mb-3">BASIC INFO</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-sm text-gray-600">Height (inches) <span className="text-xs text-gray-400">(auto from profile)</span></Label>
            <Input
              type="number"
              placeholder="0.0"
              step="0.1"
              value={formData.height}
              onChange={(e) => handleInputChange('height', e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-sm text-gray-600">Weight (Kgs) <span className="text-red-500">*</span></Label>
            <Input
              type="number"
              placeholder="0.0"
              step="0.1"
              value={formData.weight}
              onChange={(e) => handleInputChange('weight', e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-sm text-gray-600">BMI (Kg/m²)</Label>
            <Input
              type="number"
              placeholder="0.0"
              step="0.1"
              value={formData.bmi}
              className="mt-1 bg-gray-50"
              readOnly
            />
          </div>
        </div>
      </div>

      {/* Body Info */}
      <div>
        <h3 className="font-medium text-gray-700 mb-3">BODY INFO</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-sm text-gray-600">Fat (%)</Label>
            <Input type="number" placeholder="0.0" step="0.1" value={formData.fatPercentage} onChange={(e) => handleInputChange('fatPercentage', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm text-gray-600">Visceral Fat</Label>
            <Input type="number" placeholder="0.0" step="0.1" value={formData.visceralFat} onChange={(e) => handleInputChange('visceralFat', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm text-gray-600">Resting Metabolism (Kcal)</Label>
            <Input type="number" placeholder="0.0" step="0.1" value={formData.restingMetabolism} onChange={(e) => handleInputChange('restingMetabolism', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm text-gray-600">Body Age</Label>
            <Input type="number" placeholder="0" value={formData.bodyAge} onChange={(e) => handleInputChange('bodyAge', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm text-gray-600">Fat Mass (Kg)</Label>
            <Input type="number" placeholder="0.0" step="0.1" value={formData.fatMass} onChange={(e) => handleInputChange('fatMass', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm text-gray-600">Total SubCut Fat (%)</Label>
            <Input type="number" placeholder="0.0" step="0.1" value={formData.totalSubcutFat} onChange={(e) => handleInputChange('totalSubcutFat', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm text-gray-600">SubCut Fat Trunk (%)</Label>
            <Input type="number" placeholder="0.0" step="0.1" value={formData.subcutFatTrunk} onChange={(e) => handleInputChange('subcutFatTrunk', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm text-gray-600">SubCut Fat Arms (%)</Label>
            <Input type="number" placeholder="0.0" step="0.1" value={formData.subcutFatArms} onChange={(e) => handleInputChange('subcutFatArms', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm text-gray-600">SubCut Fat Legs (%)</Label>
            <Input type="number" placeholder="0.0" step="0.1" value={formData.subcutFatLegs} onChange={(e) => handleInputChange('subcutFatLegs', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm text-gray-600">Total Skeletal Muscle (%)</Label>
            <Input type="number" placeholder="0.0" step="0.1" value={formData.totalSkeletalMuscle} onChange={(e) => handleInputChange('totalSkeletalMuscle', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm text-gray-600">Skeletal Muscle Trunk (%)</Label>
            <Input type="number" placeholder="0.0" step="0.1" value={formData.skeletalMuscleTrunk} onChange={(e) => handleInputChange('skeletalMuscleTrunk', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm text-gray-600">Skeletal Muscle Arms (%)</Label>
            <Input type="number" placeholder="0.0" step="0.1" value={formData.skeletalMuscleArms} onChange={(e) => handleInputChange('skeletalMuscleArms', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm text-gray-600">Skeletal Muscle Legs (%)</Label>
            <Input type="number" placeholder="0.0" step="0.1" value={formData.skeletalMuscleLegs} onChange={(e) => handleInputChange('skeletalMuscleLegs', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm text-gray-600">Waist (inches)</Label>
            <Input type="number" placeholder="0.0" step="0.1" value={formData.waist} onChange={(e) => handleInputChange('waist', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm text-gray-600">Hip (inches)</Label>
            <Input type="number" placeholder="0.0" step="0.1" value={formData.hip} onChange={(e) => handleInputChange('hip', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm text-gray-600">Neck (inches)</Label>
            <Input type="number" placeholder="0.0" step="0.1" value={formData.neck} onChange={(e) => handleInputChange('neck', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm text-gray-600">Water Content (%)</Label>
            <Input type="number" placeholder="0.0" step="0.1" value={formData.waterContent} onChange={(e) => handleInputChange('waterContent', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm text-gray-600">Bone Weight (Kg)</Label>
            <Input type="number" placeholder="0.0" step="0.1" value={formData.boneWeight} onChange={(e) => handleInputChange('boneWeight', e.target.value)} className="mt-1" />
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-center">
        <Button
          className="bg-blue-600 hover:bg-blue-700 px-8"
          onClick={handleSubmit}
          disabled={isSaving}
        >
          {isSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : 'Submit'}
        </Button>
      </div>

      {/* BCA Trend Charts */}
      {bcaHistory.length >= 2 && (() => {
        const chartData = [...bcaHistory]
          .sort((a, b) => new Date(a.measurementDate).getTime() - new Date(b.measurementDate).getTime())
          .map(entry => ({
            date: format(new Date(entry.measurementDate), 'MMM d'),
            weight: entry.weight || 0,
            bmi: entry.bmi || 0,
            fatPercentage: entry.fatPercentage || 0,
            visceralFat: entry.visceralFat || 0,
            restingMetabolism: entry.restingMetabolism || 0,
            totalSkeletalMuscle: entry.totalSkeletalMuscle || 0,
          }));

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {/* Weight Chart */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <h4 className="text-sm font-medium text-gray-600 mb-3">Weight (kg)</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="weight" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Weight" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Fat % Chart */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <h4 className="text-sm font-medium text-gray-600 mb-3">Fat %</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="fatPercentage" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Fat %" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* BMI Chart */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <h4 className="text-sm font-medium text-gray-600 mb-3">BMI</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="bmi" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="BMI" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Visceral Fat Chart */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <h4 className="text-sm font-medium text-gray-600 mb-3">Visceral Fat</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="visceralFat" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Visceral Fat" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Resting Metabolism Chart */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <h4 className="text-sm font-medium text-gray-600 mb-3">Resting Metabolism (cal)</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="restingMetabolism" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Resting Metabolism" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Skeletal Muscle Chart */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <h4 className="text-sm font-medium text-gray-600 mb-3">Skeletal Muscle (%)</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="totalSkeletalMuscle" stroke="#ec4899" strokeWidth={2} dot={{ r: 3 }} name="Skeletal Muscle" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* BCA History */}
      {bcaHistory.length > 0 && (
        <div className="mt-6">
          <h3 className="font-medium mb-3">BCA History ({bcaHistory.length} entries)</h3>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full min-w-150">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-sm font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-2 text-sm font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-2 text-sm font-medium text-gray-600">Weight</th>
                  <th className="text-left px-4 py-2 text-sm font-medium text-gray-600">BMI</th>
                  <th className="text-left px-4 py-2 text-sm font-medium text-gray-600">Fat %</th>
                </tr>
              </thead>
              <tbody>
                {bcaHistory.slice(0, 5).map((entry) => (
                  <tr key={entry._id} className="border-t">
                    <td className="px-4 py-2 text-sm">{format(new Date(entry.measurementDate), 'MMM d, yyyy')}</td>
                    <td className="px-4 py-2 text-sm capitalize">{entry.bcaType}</td>
                    <td className="px-4 py-2 text-sm">{entry.weight} kg</td>
                    <td className="px-4 py-2 text-sm">{entry.bmi?.toFixed(1)}</td>
                    <td className="px-4 py-2 text-sm">{entry.fatPercentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Measurements Tab Component
function MeasurementsTab({ showAddMeasurement, setShowAddMeasurement, clientId, selectedDate }: { showAddMeasurement: boolean; setShowAddMeasurement: (show: boolean) => void; clientId: string; selectedDate: Date }) {
  const [measurementHistory, setMeasurementHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [startedWith, setStartedWith] = useState({ arm: 0, waist: 0, abd: 0, chest: 0, hips: 0, thigh: 0 });
  const [currentlyAt, setCurrentlyAt] = useState({ arm: 0, waist: 0, abd: 0, chest: 0, hips: 0, thigh: 0 });
  const [difference, setDifference] = useState({ arm: 0, waist: 0, abd: 0, chest: 0, hips: 0, thigh: 0 });
  const [newMeasurement, setNewMeasurement] = useState({
    arm: '',
    waist: '',
    abd: '',
    chest: '',
    hips: '',
    thigh: '',
    date: format(selectedDate, 'yyyy-MM-dd')
  });

  const fetchMeasurements = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/journal/measurements?clientId=${clientId}`);
      const data = await res.json();
      if (data.success) {
        setMeasurementHistory(data.measurements || []);
        setStartedWith(data.summary.startedWith);
        setCurrentlyAt(data.summary.currentlyAt);
        setDifference(data.summary.difference);
      }
    } catch (error) {
      console.error('Error fetching measurements:', error);
      toast.error('Failed to load measurements');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMeasurements();
    // Update date in form when selectedDate changes
    setNewMeasurement(prev => ({ ...prev, date: format(selectedDate, 'yyyy-MM-dd') }));
  }, [clientId]);

  // Keep the form date in sync with selectedDate
  useEffect(() => {
    setNewMeasurement(prev => ({ ...prev, date: format(selectedDate, 'yyyy-MM-dd') }));
  }, [selectedDate]);

  const handleAddMeasurement = async () => {
    try {
      const res = await fetch('/api/journal/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          arm: parseFloat(newMeasurement.arm) || 0,
          waist: parseFloat(newMeasurement.waist) || 0,
          abd: parseFloat(newMeasurement.abd) || 0,
          chest: parseFloat(newMeasurement.chest) || 0,
          hips: parseFloat(newMeasurement.hips) || 0,
          thigh: parseFloat(newMeasurement.thigh) || 0,
          date: newMeasurement.date,
          clientId
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Measurement added successfully');
        setShowAddMeasurement(false);
        setNewMeasurement({
          arm: '',
          waist: '',
          abd: '',
          chest: '',
          hips: '',
          thigh: '',
          date: format(new Date(), 'yyyy-MM-dd')
        });
        fetchMeasurements();
      } else {
        toast.error(data.error || 'Failed to add measurement');
      }
    } catch (error) {
      console.error('Error adding measurement:', error);
      toast.error('Failed to add measurement');
    }
  };

  const handleDeleteMeasurement = async (entryId: string) => {
    try {
      const res = await fetch(`/api/journal/measurements?entryId=${entryId}&clientId=${clientId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Measurement deleted');
        fetchMeasurements();
      } else {
        toast.error(data.error || 'Failed to delete measurement');
      }
    } catch (error) {
      console.error('Error deleting measurement:', error);
      toast.error('Failed to delete measurement');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Measurement Dialog */}
      <Dialog open={showAddMeasurement} onOpenChange={setShowAddMeasurement}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Measurement</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={newMeasurement.date}
                onChange={(e) => setNewMeasurement({ ...newMeasurement, date: e.target.value })}
              />
            </div>
            <div>
              <Label>Arm (cm)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={newMeasurement.arm}
                onChange={(e) => setNewMeasurement({ ...newMeasurement, arm: e.target.value })}
              />
            </div>
            <div>
              <Label>Waist (cm)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={newMeasurement.waist}
                onChange={(e) => setNewMeasurement({ ...newMeasurement, waist: e.target.value })}
              />
            </div>
            <div>
              <Label>Abd (cm)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={newMeasurement.abd}
                onChange={(e) => setNewMeasurement({ ...newMeasurement, abd: e.target.value })}
              />
            </div>
            <div>
              <Label>Chest (cm)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={newMeasurement.chest}
                onChange={(e) => setNewMeasurement({ ...newMeasurement, chest: e.target.value })}
              />
            </div>
            <div>
              <Label>Hips (cm)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={newMeasurement.hips}
                onChange={(e) => setNewMeasurement({ ...newMeasurement, hips: e.target.value })}
              />
            </div>
            <div>
              <Label>Thigh (cm)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={newMeasurement.thigh}
                onChange={(e) => setNewMeasurement({ ...newMeasurement, thigh: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMeasurement(false)}>Cancel</Button>
            <Button onClick={handleAddMeasurement}>Add Measurement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Measurements / Gallery Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-600" />
          <span className="font-medium text-blue-600">Measurements</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex items-center gap-1">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1"
            onClick={() => setShowAddMeasurement(true)}
          >
            <Plus className="h-4 w-4" />
            Add Measurement
          </Button>
        </div>
      </div>

      {/* Measurement Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
        {/* Started With */}
        <Card className="border-l-4 border-l-blue-500 min-h-65">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="font-medium text-blue-600">Started with</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Arm</span>
                <span className="font-medium">{startedWith.arm.toFixed(1)} cm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Waist</span>
                <span className="font-medium">{startedWith.waist.toFixed(1)} cm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Abd</span>
                <span className="font-medium">{startedWith.abd.toFixed(1)} cm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Chest</span>
                <span className="font-medium">{startedWith.chest.toFixed(1)} cm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Hips</span>
                <span className="font-medium">{startedWith.hips.toFixed(1)} cm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Thigh</span>
                <span className="font-medium">{startedWith.thigh.toFixed(1)} cm</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Currently At */}
        <Card className="border-l-4 border-l-purple-500 min-h-65">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              <span className="font-medium text-purple-600">Currently at</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Arm</span>
                <span className="font-medium">{currentlyAt.arm.toFixed(1)} cm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Waist</span>
                <span className="font-medium">{currentlyAt.waist.toFixed(1)} cm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Abd</span>
                <span className="font-medium">{currentlyAt.abd.toFixed(1)} cm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Chest</span>
                <span className="font-medium">{currentlyAt.chest.toFixed(1)} cm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Hips</span>
                <span className="font-medium">{currentlyAt.hips.toFixed(1)} cm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Thigh</span>
                <span className="font-medium">{currentlyAt.thigh.toFixed(1)} cm</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Difference */}
        <Card className="border-l-4 border-l-orange-500 min-h-65">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              <span className="font-medium text-orange-600">Difference</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Arm</span>
                <span className={`font-medium ${difference.arm < 0 ? 'text-green-600' : difference.arm > 0 ? 'text-red-600' : ''}`}>
                  {difference.arm >= 0 ? '+' : ''}{difference.arm.toFixed(1)} cm
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Waist</span>
                <span className={`font-medium ${difference.waist < 0 ? 'text-green-600' : difference.waist > 0 ? 'text-red-600' : ''}`}>
                  {difference.waist >= 0 ? '+' : ''}{difference.waist.toFixed(1)} cm
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Abd</span>
                <span className={`font-medium ${difference.abd < 0 ? 'text-green-600' : difference.abd > 0 ? 'text-red-600' : ''}`}>
                  {difference.abd >= 0 ? '+' : ''}{difference.abd.toFixed(1)} cm
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Chest</span>
                <span className={`font-medium ${difference.chest < 0 ? 'text-green-600' : difference.chest > 0 ? 'text-red-600' : ''}`}>
                  {difference.chest >= 0 ? '+' : ''}{difference.chest.toFixed(1)} cm
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Hips</span>
                <span className={`font-medium ${difference.hips < 0 ? 'text-green-600' : difference.hips > 0 ? 'text-red-600' : ''}`}>
                  {difference.hips >= 0 ? '+' : ''}{difference.hips.toFixed(1)} cm
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Thigh</span>
                <span className={`font-medium ${difference.thigh < 0 ? 'text-green-600' : difference.thigh > 0 ? 'text-red-600' : ''}`}>
                  {difference.thigh >= 0 ? '+' : ''}{difference.thigh.toFixed(1)} cm
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Measurement Trend Charts */}
      {measurementHistory.length >= 2 && (() => {
        const chartData = [...measurementHistory]
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map(entry => ({
            date: format(new Date(entry.date), 'MMM d'),
            arm: entry.arm || 0,
            waist: entry.waist || 0,
            abd: entry.abd || 0,
            chest: entry.chest || 0,
            hips: entry.hips || 0,
            thigh: entry.thigh || 0,
          }));

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Waist Chart */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <h4 className="text-sm font-medium text-gray-600 mb-3">Waist (cm)</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="waist" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Waist" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Abdomen Chart */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <h4 className="text-sm font-medium text-gray-600 mb-3">Abdomen (cm)</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="abd" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Abdomen" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Chest Chart */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <h4 className="text-sm font-medium text-gray-600 mb-3">Chest (cm)</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="chest" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Chest" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Arm Chart */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <h4 className="text-sm font-medium text-gray-600 mb-3">Arm (cm)</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="arm" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="Arm" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Hips Chart */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <h4 className="text-sm font-medium text-gray-600 mb-3">Hips (cm)</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="hips" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Hips" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Thigh Chart */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <h4 className="text-sm font-medium text-gray-600 mb-3">Thigh (cm)</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="thigh" stroke="#ec4899" strokeWidth={2} dot={{ r: 3 }} name="Thigh" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Measurement History */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Measurement History</h3>
          <Badge variant="outline">{measurementHistory.length} {measurementHistory.length === 1 ? 'entry' : 'entries'}</Badge>
        </div>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full min-w-175">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Arm (cm)</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Waist (cm)</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Abd (cm)</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Chest (cm)</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Hips (cm)</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Thigh (cm)</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {measurementHistory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    No measurements yet. Click "Add Measurement" to add your first entry.
                  </td>
                </tr>
              ) : (
                measurementHistory.map((entry) => (
                  <tr key={entry._id} className="border-t">
                    <td className="px-4 py-3 text-sm">{format(new Date(entry.date), 'MMM d, yyyy')}</td>
                    <td className="px-4 py-3 text-sm">{entry.arm?.toFixed(1)}</td>
                    <td className="px-4 py-3 text-sm">{entry.waist?.toFixed(1)}</td>
                    <td className="px-4 py-3 text-sm">{entry.abd?.toFixed(1)}</td>
                    <td className="px-4 py-3 text-sm">{entry.chest?.toFixed(1)}</td>
                    <td className="px-4 py-3 text-sm">{entry.hips?.toFixed(1)}</td>
                    <td className="px-4 py-3 text-sm">{entry.thigh?.toFixed(1)}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="text-blue-500 hover:text-blue-700">
                          <TrendingUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => handleDeleteMeasurement(entry._id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


// Food Compliance Component
function FoodCompliance({ clientId, selectedDate }: { clientId: string; selectedDate: Date }) {
  const [statsView, setStatsView] = useState('7days');
  const [mealsFilter, setMealsFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [complianceSummary, setComplianceSummary] = useState({
    taken: 0,
    missed: 0,
    notRecorded: 0,
    options: 0
  });
  const [showFullReport, setShowFullReport] = useState(false);
  const [plannedMeals, setPlannedMeals] = useState<any[]>([]);
  const [loadingMeals, setLoadingMeals] = useState(false);

  const fetchComplianceData = async () => {
    try {
      setIsLoading(true);
      const days = statsView === '7days' ? 7 : statsView === '14days' ? 14 : 30;
      const mealType = mealsFilter === 'snacks' ? 'Snack' : mealsFilter;
      const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/journal/compliance?clientId=${clientId}&days=${days}&mealType=${mealType}&selectedDate=${selectedDateStr}`);
      const data = await res.json();
      if (data.success) {
        setWeeklyData(data.dailyData || []);
        setComplianceSummary(data.complianceSummary || { taken: 0, missed: 0, notRecorded: 0, options: 0 });
      }
    } catch (error) {
      console.error('Error fetching compliance:', error);
      toast.error('Failed to load compliance data');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch planned meals when showing full report
  const fetchPlannedMeals = async () => {
    try {
      setLoadingMeals(true);
      const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/journal/meals?clientId=${clientId}&date=${selectedDateStr}`);
      const data = await res.json();
      if (data.success) {
        setPlannedMeals(data.meals || []);
      }
    } catch (error) {
      console.error('Error fetching planned meals:', error);
    } finally {
      setLoadingMeals(false);
    }
  };

  useEffect(() => {
    fetchComplianceData();
  }, [clientId, statsView, mealsFilter, selectedDate]);

  useEffect(() => {
    if (showFullReport) {
      fetchPlannedMeals();
    }
  }, [showFullReport, selectedDate, clientId]);

  // Listen for data changes to refresh compliance data
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchComplianceData();
        if (showFullReport) fetchPlannedMeals();
      }
    };

    const handleDataChange = () => {
      fetchComplianceData();
      if (showFullReport) fetchPlannedMeals();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('user-data-changed', handleDataChange);
    window.addEventListener('meal-plan-updated', handleDataChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('user-data-changed', handleDataChange);
      window.removeEventListener('meal-plan-updated', handleDataChange);
    };
  }, [showFullReport]);

  // Calculate max for bar chart scaling
  const maxBarValue = Math.max(...weeklyData.map(d => d.taken + d.missed + d.notRecorded), 1);
  const barScale = 140 / maxBarValue; // Max height is 140px

  return (
    <Card className="w-full overflow-hidden">
      <CardContent className="pt-6">
        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <Label className="text-sm text-gray-600">Stats View</Label>
            <Select value={statsView} onValueChange={setStatsView}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">Last 7 days</SelectItem>
                <SelectItem value="14days">Last 14 days</SelectItem>
                <SelectItem value="30days">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm text-gray-600">Meals</Label>
            <Select value={mealsFilter} onValueChange={setMealsFilter}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="breakfast">Breakfast</SelectItem>
                <SelectItem value="lunch">Lunch</SelectItem>
                <SelectItem value="dinner">Dinner</SelectItem>
                <SelectItem value="snacks">Snacks</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <>
            {/* Charts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              {/* Compliance Report - Bar Chart */}
              <Card className="min-h-80">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-center">Compliance Report</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-48 flex items-end justify-between gap-1 px-2 overflow-x-auto">
                    {weeklyData.length === 0 ? (
                      <div className="w-full text-center text-gray-500 py-8">
                        No data available for this period
                      </div>
                    ) : (
                      weeklyData.map((day, index) => (
                        <div key={index} className="flex-1 min-w-7.5 flex flex-col items-center">
                          <div className="w-full flex flex-col gap-0.5" style={{ height: '160px', justifyContent: 'flex-end' }}>
                            {day.taken > 0 && (
                              <div
                                className="w-full bg-green-500 rounded-t"
                                style={{ height: `${Math.max(day.taken * barScale, 4)}px` }}
                              />
                            )}
                            {day.options > 0 && (
                              <div
                                className="w-full bg-blue-500"
                                style={{ height: `${Math.max(day.options * barScale, 4)}px` }}
                              />
                            )}
                            {day.missed > 0 && (
                              <div
                                className="w-full bg-red-500 rounded-b"
                                style={{ height: `${Math.max(day.missed * barScale, 4)}px` }}
                              />
                            )}
                            {day.taken === 0 && day.missed === 0 && day.options === 0 && (
                              <div
                                className="w-full bg-gray-200 rounded"
                                style={{ height: '4px' }}
                              />
                            )}
                          </div>
                          <span className="text-xs text-gray-500 mt-2 whitespace-nowrap">{day.date}</span>
                        </div>
                      ))
                    )}
                  </div>
                  {/* Legend */}
                  <div className="flex justify-center gap-4 mt-4">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-red-500 rounded" />
                      <span className="text-xs text-gray-600">Missed</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-blue-500 rounded" />
                      <span className="text-xs text-gray-600">Options</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-green-500 rounded" />
                      <span className="text-xs text-gray-600">Taken</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Compliance Summary - Donut Chart */}
              <Card className="min-h-80">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-center">Compliance Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-center">
                    <div className="relative w-40 h-40">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        {/* Background circle */}
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke="#e5e7eb"
                          strokeWidth="12"
                        />
                        {/* Taken - Green */}
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke="#22c55e"
                          strokeWidth="12"
                          strokeDasharray={`${complianceSummary.taken * 2.51} ${100 * 2.51}`}
                          strokeLinecap="round"
                        />
                        {/* Options - Blue */}
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="12"
                          strokeDasharray={`${complianceSummary.options * 2.51} ${100 * 2.51}`}
                          strokeDashoffset={`${-complianceSummary.taken * 2.51}`}
                          strokeLinecap="round"
                        />
                        {/* Missed - Red */}
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="12"
                          strokeDasharray={`${complianceSummary.missed * 2.51} ${100 * 2.51}`}
                          strokeDashoffset={`${-(complianceSummary.taken + complianceSummary.options) * 2.51}`}
                          strokeLinecap="round"
                        />
                        {/* Not Recorded - Gray */}
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke="#d1d5db"
                          strokeWidth="12"
                          strokeDasharray={`${complianceSummary.notRecorded * 2.51} ${100 * 2.51}`}
                          strokeDashoffset={`${-(complianceSummary.taken + complianceSummary.options + complianceSummary.missed) * 2.51}`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-bold text-gray-700">{complianceSummary.taken}%</span>
                      </div>
                    </div>
                  </div>
                  {/* Legend */}
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full" />
                      <span className="text-sm text-gray-600">Taken ({complianceSummary.taken}%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-gray-300 rounded-full" />
                      <span className="text-sm text-gray-600">Not Recorded ({complianceSummary.notRecorded}%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full" />
                      <span className="text-sm text-gray-600">Missed ({complianceSummary.missed}%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full" />
                      <span className="text-sm text-gray-600">Options ({complianceSummary.options}%)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* See Full Report Button */}
            <div className="flex justify-center mt-6">
              <Button
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => setShowFullReport(!showFullReport)}
              >
                {showFullReport ? 'Hide Full Report' : 'See Full Report'}
              </Button>
            </div>

            {/* Full Report - Planned Meals Section */}
            {showFullReport && (
              <div className="mt-6 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Utensils className="h-4 w-4 text-orange-500" />
                        Planned Meals for {format(selectedDate, 'MMMM d, yyyy')}
                      </div>
                      {!loadingMeals && plannedMeals.length > 0 && (
                        <div className="flex items-center gap-3 text-sm font-normal">
                          <span className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full" />
                            {plannedMeals.filter(m => m.consumed).length} Consumed
                          </span>
                          <span className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full" />
                            {plannedMeals.filter(m => !m.consumed).length} Pending
                          </span>
                        </div>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loadingMeals ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                      </div>
                    ) : plannedMeals.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <Utensils className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                        <p>No planned meals for this date</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Meal completion progress bar */}
                        <div className="mb-4">
                          <div className="flex justify-between text-xs text-gray-600 mb-1">
                            <span>Meal Completion Progress</span>
                            <span>{Math.round((plannedMeals.filter(m => m.consumed).length / plannedMeals.length) * 100)}%</span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full transition-all duration-500"
                              style={{ width: `${(plannedMeals.filter(m => m.consumed).length / plannedMeals.length) * 100}%` }}
                            />
                          </div>
                        </div>

                        {/* Group meals by type */}
                        {MEAL_TYPE_KEYS.map(key => MEAL_TYPES[key].label).map(mealType => {
                          const mealsOfType = plannedMeals.filter(m => m.type === mealType);
                          if (mealsOfType.length === 0) return null;

                          return (
                            <div key={mealType} className="border rounded-lg overflow-hidden">
                              <div className="bg-linear-to-r from-orange-500 to-orange-600 px-4 py-2">
                                <h4 className="font-medium text-white">{mealType}</h4>
                              </div>
                              <div className="divide-y">
                                {mealsOfType.map((meal: any) => (
                                  <div
                                    key={meal._id}
                                    className={`p-3 flex items-center justify-between ${meal.consumed ? 'bg-green-50' : 'bg-white'
                                      }`}
                                  >
                                    <div className="flex-1">
                                      <p className="font-medium text-gray-800">{meal.name}</p>
                                      <div className="flex gap-4 text-xs text-gray-500 mt-1">
                                        <span>{meal.calories || 0} cal</span>
                                        <span>P: {meal.protein || 0}g</span>
                                        <span>C: {meal.carbs || 0}g</span>
                                        <span>F: {meal.fat || 0}g</span>
                                      </div>
                                      {meal.time && (
                                        <p className="text-xs text-gray-400 mt-1">{meal.time}</p>
                                      )}
                                    </div>
                                    <Badge className={meal.consumed
                                      ? 'bg-green-100 text-green-700 border-green-300'
                                      : 'bg-gray-100 text-gray-600 border-gray-300'
                                    }>
                                      {meal.consumed ? '✓ Consumed' : 'Pending'}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}

                        {/* Summary */}
                        <Card className="bg-gray-50">
                          <CardContent className="p-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                              <div>
                                <p className="text-2xl font-bold text-orange-600">
                                  {plannedMeals.reduce((sum, m) => sum + (m.calories || 0), 0)}
                                </p>
                                <p className="text-xs text-gray-500">Total Calories</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-blue-600">
                                  {plannedMeals.reduce((sum, m) => sum + (m.protein || 0), 0)}g
                                </p>
                                <p className="text-xs text-gray-500">Protein</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-green-600">
                                  {plannedMeals.reduce((sum, m) => sum + (m.carbs || 0), 0)}g
                                </p>
                                <p className="text-xs text-gray-500">Carbs</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-purple-600">
                                  {plannedMeals.reduce((sum, m) => sum + (m.fat || 0), 0)}g
                                </p>
                                <p className="text-xs text-gray-500">Fat</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

          </>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Moon, Plus, Trash2, Loader2, Check, Target, Send } from 'lucide-react';
import TrackingStatsGrid from './TrackingStatsGrid';
// import TimeBasedBarChart from './TimeBasedBarChart';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface SleepEntry {
  _id: string;
  hours: number;
  minutes: number;
  quality: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  time: string;
}

interface AssignedSleep {
  targetHours: number;
  targetMinutes: number;
  assignedAt?: string;
  isCompleted: boolean;
  completedAt?: string;
}

interface SleepSectionProps {
  clientId: string;
  selectedDate: Date;
}

export default function SleepSection({ clientId, selectedDate }: SleepSectionProps) {
  const [entries, setEntries] = useState<SleepEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState({ totalMinutes: 0, totalHours: 0, remainingMinutes: 0, displayTime: '0h 0m', target: 8, percentage: 0 });

  // Assigned sleep state
  const [assignedSleep, setAssignedSleep] = useState<AssignedSleep | null>(null);
  const [assignHours, setAssignHours] = useState<number>(8);
  const [assignMinutes, setAssignMinutes] = useState<number>(0);
  const [assigning, setAssigning] = useState(false);
  const [showCustomSleep, setShowCustomSleep] = useState(false);

  const [newEntry, setNewEntry] = useState({
    hours: 0,
    minutes: 0,
    quality: '' as string
  });

  // Fetch sleep entries for the selected date
  const fetchSleep = useCallback(async () => {
    try {
      setLoading(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/journal/sleep?date=${dateStr}&clientId=${clientId}`);
      const data = await res.json();

      if (data.success) {
        setEntries(data.entries || []);
        setSummary(data.summary || { totalMinutes: 0, totalHours: 0, remainingMinutes: 0, displayTime: '0h 0m', target: 8, percentage: 0 });
      }
    } catch (error) {
      console.error('Error fetching sleep:', error);
      toast.error('Failed to load sleep data');
    } finally {
      setLoading(false);
    }
  }, [clientId, selectedDate]);

  // Fetch assigned sleep status
  const fetchAssignedSleep = useCallback(async () => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/admin/clients/${clientId}/assign-sleep?date=${dateStr}`);
      const data = await res.json();

      if (data.assignedSleep) {
        setAssignedSleep(data.assignedSleep);
        setAssignHours(data.assignedSleep.targetHours || 8);
        setAssignMinutes(data.assignedSleep.targetMinutes || 0);
      } else {
        setAssignedSleep(null);
      }
    } catch (error) {
      console.error('Error fetching assigned sleep:', error);
    }
  }, [clientId, selectedDate]);

  useEffect(() => {
    fetchSleep();
    fetchAssignedSleep();
  }, [fetchSleep, fetchAssignedSleep]);

  // Auto-refresh on visibility change and focus (when user comes back to tab/window)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSleep();
        fetchAssignedSleep();
      }
    };

    const handleFocus = () => {
      fetchSleep();
      fetchAssignedSleep();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchSleep, fetchAssignedSleep]);

  // Handle assigning sleep to client
  const handleAssignSleep = async () => {
    if (assignHours <= 0 && assignMinutes <= 0) {
      toast.error('Please enter a valid sleep duration');
      return;
    }

    try {
      setAssigning(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/admin/clients/${clientId}/assign-sleep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetHours: assignHours, targetMinutes: assignMinutes, date: dateStr })
      });

      const data = await res.json();

      if (data.success) {
        setAssignedSleep({
          targetHours: assignHours,
          targetMinutes: assignMinutes,
          assignedAt: new Date().toISOString(),
          isCompleted: false
        });
        toast.success(`Assigned ${assignHours}h ${assignMinutes}m sleep target to client`);
      } else {
        toast.error(data.error || 'Failed to assign sleep target');
      }
    } catch (error) {
      console.error('Error assigning sleep:', error);
      toast.error('Failed to assign sleep target');
    } finally {
      setAssigning(false);
    }
  };

  // Handle removing assigned sleep
  const handleRemoveAssignedSleep = async () => {
    try {
      setAssigning(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/admin/clients/${clientId}/assign-sleep?date=${dateStr}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success) {
        setAssignedSleep(null);
        toast.success('Assigned sleep target removed');
      } else {
        toast.error(data.error || 'Failed to remove assigned sleep');
      }
    } catch (error) {
      console.error('Error removing assigned sleep:', error);
      toast.error('Failed to remove assigned sleep');
    } finally {
      setAssigning(false);
    }
  };

  const handleAddEntry = async () => {
    if (!newEntry.hours && !newEntry.minutes) {
      toast.error('Please enter hours or minutes');
      return;
    }

    try {
      setSaving(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch('/api/journal/sleep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newEntry,
          quality: newEntry.quality || 'Fair',
          date: dateStr,
          clientId
        })
      });

      const data = await res.json();

      if (data.success) {
        setEntries(data.entries || []);
        setSummary(data.summary || summary);
        setNewEntry({ hours: 0, minutes: 0, quality: '' });
        toast.success('Sleep record added successfully');
        window.dispatchEvent(new CustomEvent('user-data-changed', { detail: { dataType: 'sleep' } }));
        // Re-fetch to update assigned status
        fetchSleep();
        fetchAssignedSleep();
      } else {
        toast.error(data.error || 'Failed to add sleep record');
      }
    } catch (error) {
      console.error('Error adding sleep:', error);
      toast.error('Failed to add sleep record');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/journal/sleep?entryId=${id}&date=${dateStr}&clientId=${clientId}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success) {
        setEntries(data.entries || []);
        setSummary(data.summary || summary);
        toast.success('Entry deleted');
        window.dispatchEvent(new CustomEvent('user-data-changed', { detail: { dataType: 'sleep' } }));
        // Re-fetch to update assigned status
        fetchSleep();
        fetchAssignedSleep();
      } else {
        toast.error(data.error || 'Failed to delete entry');
      }
    } catch (error) {
      console.error('Error deleting entry:', error);
      toast.error('Failed to delete entry');
    }
  };

  const totalMinutes = summary.totalMinutes;
  const totalHours = summary.totalHours;
  const remainingMinutes = summary.remainingMinutes;

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'Excellent': return 'bg-green-100 text-green-700';
      case 'Good': return 'bg-blue-100 text-blue-700';
      case 'Fair': return 'bg-yellow-100 text-yellow-700';
      case 'Poor': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  // Mock chart data
  const chartData = [
    { time: '6 am', values: [30, 25, 15] },
    { time: '8 am', values: [45, 35, 20] },
    { time: '10 am', values: [50, 40, 25] },
    { time: '12 pm', values: [40, 30, 20] },
    { time: '2 pm', values: [55, 45, 30] },
    { time: '4 pm', values: [48, 38, 22] },
    { time: '6 pm', values: [60, 50, 35] },
    { time: '8 pm', values: [52, 42, 28] },
    { time: '10 pm', values: [35, 28, 18] },
  ];

  const sleepPercentage = summary.percentage;

  const trackingStats = [
    { title: 'Daily Sleep', value: `${totalHours}h ${remainingMinutes}m`, percentage: sleepPercentage, color: '#22c55e' },
    { title: 'Average Sleep', value: '7.2 hrs', percentage: 85, color: '#3b82f6' },
    { title: 'Total Sleep', value: '50.4 hrs', percentage: 82, color: '#f97316' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* Assign Sleep to Client Card */}
      <Card className="w-full border-indigo-200 bg-linear-to-r from-indigo-50 to-purple-50">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-indigo-600" />
            Assign Sleep Goal for {format(selectedDate, 'MMM dd, yyyy')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {assignedSleep && assignedSleep.targetHours > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-indigo-100">
                <div>
                  <p className="font-medium text-gray-800">
                    Assigned Sleep Target: {assignedSleep.targetHours}h {assignedSleep.targetMinutes}m
                  </p>
                  <p className="text-xs text-gray-500">
                    {assignedSleep.assignedAt && `Assigned on ${format(new Date(assignedSleep.assignedAt), 'MMM dd, yyyy hh:mm a')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {assignedSleep.isCompleted ? (
                    <Badge className="bg-green-500 text-white flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      Completed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-orange-600 border-orange-300 animate-pulse">
                      Pending
                    </Badge>
                  )}
                </div>
              </div>
              {assignedSleep.isCompleted && assignedSleep.completedAt && (
                <p className="text-sm text-green-600 text-center">
                  ✓ Client marked as completed on {format(new Date(assignedSleep.completedAt), 'MMM dd, hh:mm a')}
                </p>
              )}
              {/* <div className="flex gap-2">
                <Button 
                  onClick={handleRemoveAssignedSleep} 
                  disabled={assigning}
                  variant="outline"
                  className="flex-1 text-red-600 border-red-300 hover:bg-red-50"
                >
                  Remove Assignment
                </Button>
              </div> */}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Set a daily sleep goal for this client. They will see this target on their Tasks page.
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="text-xs text-gray-500">Hours</Label>
                  <Input
                    type="number"
                    placeholder="8"
                    min="0"
                    max="24"
                    value={assignHours}
                    onChange={(e) => setAssignHours(parseInt(e.target.value) || 0)}
                    className="bg-white"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-gray-500">Minutes</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    min="0"
                    max="59"
                    value={assignMinutes}
                    onChange={(e) => setAssignMinutes(parseInt(e.target.value) || 0)}
                    className="bg-white"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleAssignSleep}
                    disabled={assigning || (assignHours <= 0 && assignMinutes <= 0)}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {assigning ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Assign
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button type="button" variant="outline" size="sm" onClick={() => { setAssignHours(6); setAssignMinutes(0); }} className="text-xs">6h</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => { setAssignHours(7); setAssignMinutes(0); }} className="text-xs">7h</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => { setAssignHours(8); setAssignMinutes(0); }} className="text-xs">8h</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => { setAssignHours(7); setAssignMinutes(30); }} className="text-xs">7.5h</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => { setAssignHours(8); setAssignMinutes(30); }} className="text-xs">8.5h</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>


      {/* Today's Sleep */}
      <Card className="w-full">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <CardTitle className="text-base">Today's Sleep</CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-indigo-600">
                {totalHours}h {remainingMinutes}m total
              </Badge>
              <Button
                onClick={() => setShowCustomSleep(true)}
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-center text-gray-500 py-4">No sleep recorded today</p>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry._id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-800">
                      {entry.hours}h {entry.minutes}m
                    </p>
                    <Badge className={getQualityColor(entry.quality)} variant="secondary">
                      {entry.quality}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{entry.time}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteEntry(entry._id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sleep Tracking Stats */}
      <Card className="w-full">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <CardTitle className="text-base">Sleep Tracking</CardTitle>
            {/* <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-1" />
              Add Entry
            </Button> */}
          </div>
        </CardHeader>
        <CardContent>
          <TrackingStatsGrid stats={trackingStats} />
        </CardContent>
      </Card>

      {/* Sleep Quality Chart */}
      {/* <TimeBasedBarChart
        title="Sleep Quality"
        yAxisLabel="1 hr"
        data={chartData}
        colors={['#3b82f6', '#8b5cf6', '#ef4444']}
        legends={[
          { label: 'Deep', color: '#3b82f6' },
          { label: 'Light', color: '#8b5cf6' },
          { label: 'REM', color: '#ef4444' },
        ]}
        maxValue={70}
      /> */}

      {/* Custom Sleep Modal */}
      {showCustomSleep && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-3xl w-full max-w-md p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add Sleep</h2>
              <button
                onClick={() => setShowCustomSleep(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {/* Display assigned sleep if any */}
            {assignedSleep && (
              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                <p className="text-sm font-medium text-indigo-900">
                  Assigned Target: {assignedSleep.targetHours}h {assignedSleep.targetMinutes}m
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Hours</Label>
                <Input
                  type="number"
                  placeholder="0"
                  min="0"
                  max="24"
                  value={newEntry.hours || ''}
                  onChange={(e) => setNewEntry({ ...newEntry, hours: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Minutes</Label>
                <Input
                  type="number"
                  placeholder="0"
                  min="0"
                  max="59"
                  value={newEntry.minutes || ''}
                  onChange={(e) => setNewEntry({ ...newEntry, minutes: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Quality</Label>
                <select
                  value={newEntry.quality}
                  onChange={(e) => setNewEntry({ ...newEntry, quality: e.target.value })}
                  className="w-full mt-1 p-2 border rounded-lg"
                >
                  <option value="">Select quality</option>
                  <option value="Excellent">Excellent</option>
                  <option value="Good">Good</option>
                  <option value="Fair">Fair</option>
                  <option value="Poor">Poor</option>
                </select>
              </div>
            </div>

            <Button
              onClick={handleAddEntry}
              disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Sleep Record'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

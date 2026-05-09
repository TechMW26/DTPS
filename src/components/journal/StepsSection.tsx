'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Footprints, Plus, Trash2, Loader2, Check, Target, Send } from 'lucide-react';
import TrackingStatsGrid from './TrackingStatsGrid';
// import TimeBasedBarChart from './TimeBasedBarChart';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface StepsEntry {
  _id: string;
  steps: number;
  distance: number;
  calories: number;
  time: string;
}

interface AssignedSteps {
  target: number;
  assignedAt?: string;
  isCompleted: boolean;
  completedAt?: string;
}

interface StepsSectionProps {
  clientId: string;
  selectedDate: Date;
}

export default function StepsSection({ clientId, selectedDate }: StepsSectionProps) {
  const [entries, setEntries] = useState<StepsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState({ totalSteps: 0, totalDistance: 0, totalCalories: 0, target: 10000, percentage: 0 });

  // Assigned steps state
  const [assignedSteps, setAssignedSteps] = useState<AssignedSteps | null>(null);
  const [assignTarget, setAssignTarget] = useState<number>(10000);
  const [assigning, setAssigning] = useState(false);
  const [showCustomSteps, setShowCustomSteps] = useState(false);

  const [newEntry, setNewEntry] = useState({
    steps: 0,
    distance: 0,
    calories: 0
  });

  // Fetch steps for the selected date
  const fetchSteps = useCallback(async () => {
    try {
      setLoading(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/journal/steps?date=${dateStr}&clientId=${clientId}`);
      const data = await res.json();

      if (data.success) {
        setEntries(data.entries || []);
        setSummary(data.summary || { totalSteps: 0, totalDistance: 0, totalCalories: 0, target: 10000, percentage: 0 });
      }
    } catch (error) {
      console.error('Error fetching steps:', error);
      toast.error('Failed to load steps');
    } finally {
      setLoading(false);
    }
  }, [clientId, selectedDate]);

  // Fetch assigned steps status
  const fetchAssignedSteps = useCallback(async () => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/admin/clients/${clientId}/assign-steps?date=${dateStr}`);
      const data = await res.json();

      if (data.assignedSteps) {
        setAssignedSteps(data.assignedSteps);
        setAssignTarget(data.assignedSteps.target || 10000);
      } else {
        setAssignedSteps(null);
      }
    } catch (error) {
      console.error('Error fetching assigned steps:', error);
    }
  }, [clientId, selectedDate]);

  useEffect(() => {
    fetchSteps();
    fetchAssignedSteps();
  }, [fetchSteps, fetchAssignedSteps]);

  // Auto-refresh on visibility change and focus (when user comes back to tab/window)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSteps();
        fetchAssignedSteps();
      }
    };

    const handleFocus = () => {
      fetchSteps();
      fetchAssignedSteps();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchSteps, fetchAssignedSteps]);

  // Handle assigning steps to client
  const handleAssignSteps = async () => {
    if (!assignTarget || assignTarget <= 0) {
      toast.error('Please enter a valid steps target');
      return;
    }

    try {
      setAssigning(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/admin/clients/${clientId}/assign-steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: assignTarget, date: dateStr })
      });

      const data = await res.json();

      if (data.success) {
        setAssignedSteps({
          target: assignTarget,
          assignedAt: new Date().toISOString(),
          isCompleted: false
        });
        toast.success(`Assigned ${assignTarget.toLocaleString()} steps target to client`);
      } else {
        toast.error(data.error || 'Failed to assign steps');
      }
    } catch (error) {
      console.error('Error assigning steps:', error);
      toast.error('Failed to assign steps');
    } finally {
      setAssigning(false);
    }
  };

  // Handle removing assigned steps
  const handleRemoveAssignedSteps = async () => {
    try {
      setAssigning(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/admin/clients/${clientId}/assign-steps?date=${dateStr}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success) {
        setAssignedSteps(null);
        toast.success('Assigned steps removed');
      } else {
        toast.error(data.error || 'Failed to remove assigned steps');
      }
    } catch (error) {
      console.error('Error removing assigned steps:', error);
      toast.error('Failed to remove assigned steps');
    } finally {
      setAssigning(false);
    }
  };

  const handleAddEntry = async () => {
    if (!newEntry.steps) {
      toast.error('Please enter steps count');
      return;
    }

    try {
      setSaving(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch('/api/journal/steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newEntry,
          date: dateStr,
          clientId
        })
      });

      const data = await res.json();

      if (data.success) {
        setEntries(data.entries || []);
        setSummary(data.summary || summary);
        setNewEntry({ steps: 0, distance: 0, calories: 0 });
        toast.success('Steps added successfully');
        window.dispatchEvent(new CustomEvent('user-data-changed', { detail: { dataType: 'steps' } }));
        // Re-fetch to update assigned status
        fetchSteps();
        fetchAssignedSteps();
      } else {
        toast.error(data.error || 'Failed to add steps');
      }
    } catch (error) {
      console.error('Error adding steps:', error);
      toast.error('Failed to add steps');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/journal/steps?entryId=${id}&date=${dateStr}&clientId=${clientId}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success) {
        setEntries(data.entries || []);
        setSummary(data.summary || summary);
        toast.success('Entry deleted');
        window.dispatchEvent(new CustomEvent('user-data-changed', { detail: { dataType: 'steps' } }));
        // Re-fetch to update assigned status
        fetchSteps();
        fetchAssignedSteps();
      } else {
        toast.error(data.error || 'Failed to delete entry');
      }
    } catch (error) {
      console.error('Error deleting entry:', error);
      toast.error('Failed to delete entry');
    }
  };

  const totalSteps = summary.totalSteps;
  const totalDistance = entries.reduce((sum, e) => sum + e.distance, 0);
  const totalCalories = entries.reduce((sum, e) => sum + e.calories, 0);

  // Mock chart data
  const chartData = [
    { time: '6 am', values: [200, 150, 100] },
    { time: '8 am', values: [450, 350, 200] },
    { time: '10 am', values: [600, 450, 300] },
    { time: '12 pm', values: [500, 400, 250] },
    { time: '2 pm', values: [700, 550, 350] },
    { time: '4 pm', values: [650, 500, 300] },
    { time: '6 pm', values: [800, 600, 400] },
    { time: '8 pm', values: [550, 450, 280] },
    { time: '10 pm', values: [300, 250, 150] },
  ];

  const trackingStats = [
    { title: 'Daily Steps', value: totalSteps.toLocaleString(), percentage: summary.percentage, color: '#22c55e' },
    { title: 'Average Steps', value: '7500 steps', percentage: 75, color: '#3b82f6' },
    { title: 'Total Steps', value: '52500 steps', percentage: 65, color: '#f97316' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* Assign Steps to Client Card */}
      <Card className="w-full border-green-200 bg-linear-to-r from-green-50 to-emerald-50">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-green-600" />
            Assign Steps Goal for {format(selectedDate, 'MMM dd, yyyy')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {assignedSteps && assignedSteps.target > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-green-100">
                <div>
                  <p className="font-medium text-gray-800">
                    Assigned Steps Target: {assignedSteps.target.toLocaleString()} steps
                  </p>
                  <p className="text-xs text-gray-500">
                    {assignedSteps.assignedAt && `Assigned on ${format(new Date(assignedSteps.assignedAt), 'MMM dd, yyyy hh:mm a')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {assignedSteps.isCompleted ? (
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
              {assignedSteps.isCompleted && assignedSteps.completedAt && (
                <p className="text-sm text-green-600 text-center">
                  ✓ Client marked as completed on {format(new Date(assignedSteps.completedAt), 'MMM dd, hh:mm a')}
                </p>
              )}
              {/* <div className="flex gap-2">
                <Button 
                  onClick={handleRemoveAssignedSteps} 
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
                Set a daily steps goal for this client. They will see this target on their Tasks page.
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    placeholder="Steps target (e.g., 10000)"
                    value={assignTarget}
                    onChange={(e) => setAssignTarget(parseInt(e.target.value) || 0)}
                    className="bg-white"
                  />
                </div>
                <Button
                  onClick={handleAssignSteps}
                  disabled={assigning || assignTarget <= 0}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {assigning ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Assign
                </Button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button type="button" variant="outline" size="sm" onClick={() => setAssignTarget(5000)} className="text-xs">5k</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setAssignTarget(7500)} className="text-xs">7.5k</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setAssignTarget(10000)} className="text-xs">10k</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setAssignTarget(12000)} className="text-xs">12k</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setAssignTarget(15000)} className="text-xs">15k</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>



      {/* Today's Steps */}
      <Card className="w-full">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <CardTitle className="text-base">Today's Steps</CardTitle>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-blue-600">
                  {totalSteps.toLocaleString()} steps
                </Badge>
                <Badge variant="outline" className="text-green-600">
                  {totalDistance.toFixed(2)} km
                </Badge>
                <Badge variant="outline" className="text-orange-600">
                  {totalCalories} cal
                </Badge>
              </div>
              <Button
                onClick={() => setShowCustomSteps(true)}
                size="sm"
                className="bg-green-600 hover:bg-green-700"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-center text-gray-500 py-4">No steps recorded today</p>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry._id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div>
                    <p className="font-medium text-gray-800">{entry.steps.toLocaleString()} steps</p>
                    <p className="text-sm text-gray-500">
                      {entry.distance.toFixed(2)} km • {entry.calories} calories burned
                    </p>
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

      {/* Steps Tracking Stats */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Steps Tracking</CardTitle>
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

      {/* Steps Count Chart */}
      {/* <TimeBasedBarChart
        title="Steps Count"
        yAxisLabel="1000 steps"
        data={chartData}
        colors={['#3b82f6', '#8b5cf6', '#ef4444']}
        legends={[
          { label: 'Morning', color: '#3b82f6' },
          { label: 'Afternoon', color: '#8b5cf6' },
          { label: 'Evening', color: '#ef4444' },
        ]}
        maxValue={1000}
      /> */}

      {/* Custom Steps Modal */}
      {showCustomSteps && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-3xl w-full max-w-md p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add Steps</h2>
              <button
                onClick={() => setShowCustomSteps(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {/* Display assigned steps if any */}
            {assignedSteps && (
              <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                <p className="text-sm font-medium text-green-900">
                  Target: {assignedSteps.target.toLocaleString()} steps
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Steps</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newEntry.steps || ''}
                  onChange={(e) => setNewEntry({ ...newEntry, steps: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Distance (km)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  step="0.1"
                  value={newEntry.distance || ''}
                  onChange={(e) => setNewEntry({ ...newEntry, distance: parseFloat(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Calories</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newEntry.calories || ''}
                  onChange={(e) => setNewEntry({ ...newEntry, calories: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
            </div>

            <Button
              onClick={handleAddEntry}
              disabled={saving}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Steps'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

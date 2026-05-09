'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Droplets, Plus, Trash2, Loader2, Check, Target, Send } from 'lucide-react';
import TrackingStatsGrid from './TrackingStatsGrid';
// import TimeBasedBarChart from './TimeBasedBarChart';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface WaterEntry {
  _id: string;
  amount: number;
  unit: string;
  time: string;
}

interface AssignedWater {
  amount: number;
  assignedAt?: string;
  isCompleted: boolean;
  completedAt?: string;
}

interface WaterSectionProps {
  clientId: string;
  selectedDate: Date;
}

export default function WaterSection({ clientId, selectedDate }: WaterSectionProps) {
  const [entries, setEntries] = useState<WaterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState({ totalMl: 0, totalLiters: '0', target: 2500, percentage: 0 });

  // Assigned water state
  const [assignedWater, setAssignedWater] = useState<AssignedWater | null>(null);
  const [assignAmount, setAssignAmount] = useState<number>(2500);
  const [assigning, setAssigning] = useState(false);
  const [showCustomWater, setShowCustomWater] = useState(false);

  const [newEntry, setNewEntry] = useState({
    amount: 0,
    unit: 'Glass (250ml)'
  });

  const unitToMl: Record<string, number> = {
    'Glass (250ml)': 250,
    'Bottle (500ml)': 500,
    'Bottle (1L)': 1000,
    'Cup (200ml)': 200,
    'glasses': 250
  };

  // Fetch water entries for the selected date
  const fetchWater = useCallback(async () => {
    try {
      setLoading(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/journal/water?date=${dateStr}&clientId=${clientId}`);
      const data = await res.json();

      if (data.success) {
        setEntries(data.entries || []);
        setSummary(data.summary || { totalMl: 0, totalLiters: '0', target: 2500, percentage: 0 });
      }
    } catch (error) {
      console.error('Error fetching water:', error);
      toast.error('Failed to load water intake');
    } finally {
      setLoading(false);
    }
  }, [clientId, selectedDate]);

  // Fetch assigned water status
  const fetchAssignedWater = useCallback(async () => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/admin/clients/${clientId}/assign-water?date=${dateStr}`);
      const data = await res.json();

      if (data.assignedWater) {
        setAssignedWater(data.assignedWater);
        setAssignAmount(data.assignedWater.amount || 2500);
      } else {
        setAssignedWater(null);
      }
    } catch (error) {
      console.error('Error fetching assigned water:', error);
    }
  }, [clientId, selectedDate]);

  useEffect(() => {
    fetchWater();
    fetchAssignedWater();
  }, [fetchWater, fetchAssignedWater]);

  // Auto-refresh on visibility change and focus (when user comes back to tab/window)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchWater();
        fetchAssignedWater();
      }
    };

    const handleFocus = () => {
      fetchWater();
      fetchAssignedWater();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchWater, fetchAssignedWater]);

  // Handle assigning water to client
  const handleAssignWater = async () => {
    if (!assignAmount || assignAmount <= 0) {
      toast.error('Please enter a valid water amount');
      return;
    }

    try {
      setAssigning(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/admin/clients/${clientId}/assign-water`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: assignAmount, date: dateStr })
      });

      const data = await res.json();

      if (data.success) {
        setAssignedWater({
          amount: assignAmount,
          assignedAt: new Date().toISOString(),
          isCompleted: false
        });
        toast.success(`Assigned ${assignAmount}ml water intake to client`);
      } else {
        toast.error(data.error || 'Failed to assign water');
      }
    } catch (error) {
      console.error('Error assigning water:', error);
      toast.error('Failed to assign water');
    } finally {
      setAssigning(false);
    }
  };

  // Handle removing assigned water
  const handleRemoveAssignedWater = async () => {
    try {
      setAssigning(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/admin/clients/${clientId}/assign-water?date=${dateStr}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success) {
        setAssignedWater(null);
        toast.success('Assigned water removed');
      } else {
        toast.error(data.error || 'Failed to remove assigned water');
      }
    } catch (error) {
      console.error('Error removing assigned water:', error);
      toast.error('Failed to remove assigned water');
    } finally {
      setAssigning(false);
    }
  };

  const handleAddEntry = async () => {
    if (!newEntry.amount) {
      toast.error('Please enter an amount');
      return;
    }

    try {
      setSaving(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch('/api/journal/water', {
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
        setNewEntry({ amount: 0, unit: 'Glass (250ml)' });
        toast.success('Water intake added successfully');
        window.dispatchEvent(new CustomEvent('user-data-changed', { detail: { dataType: 'water' } }));
        // Re-fetch to update assigned status
        fetchWater();
        fetchAssignedWater();
      } else {
        toast.error(data.error || 'Failed to add water intake');
      }
    } catch (error) {
      console.error('Error adding water:', error);
      toast.error('Failed to add water intake');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/journal/water?entryId=${id}&date=${dateStr}&clientId=${clientId}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success) {
        setEntries(data.entries || []);
        setSummary(data.summary || summary);
        toast.success('Entry deleted');
        window.dispatchEvent(new CustomEvent('user-data-changed', { detail: { dataType: 'water' } }));
        // Re-fetch to update assigned status
        fetchWater();
        fetchAssignedWater();
      } else {
        toast.error(data.error || 'Failed to delete entry');
      }
    } catch (error) {
      console.error('Error deleting entry:', error);
      toast.error('Failed to delete entry');
    }
  };

  const totalMl = summary.totalMl;
  const totalLiters = summary.totalLiters;

  // Mock chart data
  const chartData = [
    { time: '6 am', values: [100, 80, 60] },
    { time: '8 am', values: [150, 120, 80] },
    { time: '10 am', values: [180, 140, 100] },
    { time: '12 pm', values: [200, 160, 120] },
    { time: '2 pm', values: [170, 140, 100] },
    { time: '4 pm', values: [190, 150, 110] },
    { time: '6 pm', values: [160, 130, 90] },
    { time: '8 pm', values: [140, 110, 80] },
    { time: '10 pm', values: [100, 80, 60] },
  ];

  const trackingStats = [
    { title: 'Daily Intake', value: `${totalLiters} L`, percentage: summary.percentage, color: '#22c55e' },
    { title: 'Average Intake', value: '2500 ml', percentage: 85, color: '#3b82f6' },
    { title: 'Total Intake', value: '17000 ml', percentage: 68, color: '#f97316' },
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
      {/* Assign Water to Client Card */}
      <Card className="w-full border-blue-200 bg-linear-to-r from-blue-50 to-cyan-50">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-blue-600" />
            Assign Water Intake Goal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {assignedWater && assignedWater.amount > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-blue-100">
                <div>
                  <p className="font-medium text-gray-800">
                    Assigned Water: {assignedWater.amount}ml
                  </p>
                  <p className="text-xs text-gray-500">
                    {assignedWater.assignedAt && `Assigned on ${format(new Date(assignedWater.assignedAt), 'MMM dd, yyyy hh:mm a')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {assignedWater.isCompleted ? (
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
              {assignedWater.isCompleted && assignedWater.completedAt && (
                <p className="text-sm text-green-600 text-center">
                  ✓ Client marked as completed on {format(new Date(assignedWater.completedAt), 'MMM dd, hh:mm a')}
                </p>
              )}

            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Set a daily water intake goal for this client. They will see this target on their Tasks page.
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    placeholder="Amount in ml (e.g., 2500)"
                    value={assignAmount}
                    onChange={(e) => setAssignAmount(parseInt(e.target.value) || 0)}
                    className="bg-white"
                  />
                </div>
                <Button
                  onClick={handleAssignWater}
                  disabled={assigning || assignAmount <= 0}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {assigning ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Assign
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAssignAmount(2000)}
                  className="text-xs"
                >
                  2L
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAssignAmount(2500)}
                  className="text-xs"
                >
                  2.5L
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAssignAmount(3000)}
                  className="text-xs"
                >
                  3L
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAssignAmount(3500)}
                  className="text-xs"
                >
                  3.5L
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Water Intake Form */}
      {/* <Card className="w-full">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Droplets className="h-4 w-4 text-blue-500" />
            Add Water Intake
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-gray-600">Amount</Label>
              <Input
                type="number"
                placeholder="0"
                value={newEntry.amount || ''}
                onChange={(e) => setNewEntry({ ...newEntry, amount: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label className="text-sm text-gray-600">Unit</Label>
              <Select
                value={newEntry.unit}
                onValueChange={(value) => setNewEntry({ ...newEntry, unit: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Glass (250ml)">Glass (250ml)</SelectItem>
                  <SelectItem value="Bottle (500ml)">Bottle (500ml)</SelectItem>
                  <SelectItem value="Bottle (1L)">Bottle (1L)</SelectItem>
                  <SelectItem value="Cup (200ml)">Cup (200ml)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <Button onClick={handleAddEntry} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            {saving ? 'Adding...' : 'Add Entry'}
          </Button>
        </CardContent>
      </Card> */}

      {/* Today's Water Intake */}
      <Card className="w-full">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <CardTitle className="text-base">Today's Water Intake</CardTitle>
            <div className="flex gap-2 items-center">
              <Badge variant="outline" className="text-blue-600">
                {totalLiters} L
              </Badge>
              {/* <Badge variant="outline" className="text-cyan-600">
                {totalMl} ml
              </Badge> */}
              <Button
                onClick={() => setShowCustomWater(true)}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-center text-gray-500 py-4">No water intake recorded today</p>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry._id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div>
                    <p className="font-medium text-gray-800">
                      {entry.amount} {entry.unit === 'glasses' ? 'glasses' : entry.unit}

                    </p>
                  </div>
                  {/* <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{entry.time}</span>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleDeleteEntry(entry._id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div> */}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Water Intake Tracking Stats */}
      <Card className="w-full">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <CardTitle className="text-base">Water Intake Tracking</CardTitle>
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

      {/* Glass Intake Chart */}
      {/* <TimeBasedBarChart
        title="Glass Intake"
        yAxisLabel="200 ml"
        data={chartData}
        colors={['#3b82f6', '#8b5cf6', '#ef4444']}
        legends={[
          { label: 'Glass 1', color: '#3b82f6' },
          { label: 'Glass 2', color: '#8b5cf6' },
          { label: 'Glass 3', color: '#ef4444' },
        ]}
        maxValue={250}
      /> */}

      {/* Custom Water Modal */}
      {showCustomWater && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-3xl w-full max-w-md p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add Water</h2>
              <button
                onClick={() => setShowCustomWater(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {/* Display assigned water if any */}
            {assignedWater && (
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-sm font-medium text-blue-900">
                  Target: {assignedWater.amount} ml
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Amount</Label>
                <Input
                  type="number"
                  placeholder="250"
                  value={newEntry.amount || ''}
                  onChange={(e) => setNewEntry({ ...newEntry, amount: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Unit</Label>
                <select
                  value={newEntry.unit}
                  onChange={(e) => setNewEntry({ ...newEntry, unit: e.target.value })}
                  className="w-full mt-1 p-2 border rounded-lg"
                >
                  <option value="Glass (250ml)">Glass (250ml)</option>
                  <option value="Bottle (500ml)">Bottle (500ml)</option>
                  <option value="Bottle (1L)">Bottle (1L)</option>
                  <option value="Cup (200ml)">Cup (200ml)</option>
                  <option value="ml">Custom (ml)</option>
                </select>
              </div>

              {/* Quick add buttons */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => setNewEntry({ ...newEntry, amount: 250, unit: 'Glass (250ml)' })}
                  variant="outline"
                  size="sm"
                >
                  250ml
                </Button>
                <Button
                  onClick={() => setNewEntry({ ...newEntry, amount: 500, unit: 'Bottle (500ml)' })}
                  variant="outline"
                  size="sm"
                >
                  500ml
                </Button>
                <Button
                  onClick={() => setNewEntry({ ...newEntry, amount: 1000, unit: 'Bottle (1L)' })}
                  variant="outline"
                  size="sm"
                >
                  1L
                </Button>
                <Button
                  onClick={() => setNewEntry({ ...newEntry, amount: 200, unit: 'Cup (200ml)' })}
                  variant="outline"
                  size="sm"
                >
                  200ml
                </Button>
              </div>
            </div>

            <Button
              onClick={handleAddEntry}
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Water'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

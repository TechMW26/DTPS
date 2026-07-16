'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Ruler, Plus, Trash2, Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import Image from 'next/image';

interface MeasurementEntry {
  _id?: string;
  date: string;
  arm?: number;
  waist?: number;
  abd?: number;
  chest?: number;
  hips?: number;
  thigh?: number;
  addedBy?: string;
}

interface BodyMeasurementsProps {
  clientId: string;
  onUpdate?: () => void;
}

export default function BodyMeasurements({ clientId, onUpdate }: BodyMeasurementsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [measurements, setMeasurements] = useState<MeasurementEntry[]>([]);
  const [latestMeasurement, setLatestMeasurement] = useState<MeasurementEntry | null>(null);
  const [newMeasurement, setNewMeasurement] = useState({
    arm: '',
    waist: '',
    abd: '',
    chest: '',
    hips: '',
    thigh: ''
  });

  useEffect(() => {
    fetchMeasurements();
  }, [clientId]);

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (showAddModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showAddModal]);

  const fetchMeasurements = async () => {
    try {
      const response = await fetch(`/api/journal/measurements?clientId=${clientId}`);
      if (response.ok) {
        const data = await response.json();
        setMeasurements(data.measurements || []);
        setLatestMeasurement(data.latest || null);
      }
    } catch (error) {
      console.error('Error fetching measurements:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMeasurement = async () => {
    // Check if at least one measurement is provided
    const hasValue = Object.values(newMeasurement).some(v => v && parseFloat(v) > 0);
    if (!hasValue) {
      toast.error('Please enter at least one measurement');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/journal/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          arm: parseFloat(newMeasurement.arm) || 0,
          waist: parseFloat(newMeasurement.waist) || 0,
          abd: parseFloat(newMeasurement.abd) || 0,
          chest: parseFloat(newMeasurement.chest) || 0,
          hips: parseFloat(newMeasurement.hips) || 0,
          thigh: parseFloat(newMeasurement.thigh) || 0
        })
      });

      if (response.ok) {
        toast.success('Measurements added successfully');
        setShowAddModal(false);
        setNewMeasurement({ arm: '', waist: '', abd: '', chest: '', hips: '', thigh: '' });
        fetchMeasurements();
        onUpdate?.();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to add measurements');
      }
    } catch (error) {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMeasurement = async (measurementId: string) => {
    if (!confirm('Are you sure you want to delete this measurement?')) return;

    try {
      const response = await fetch(`/api/journal/measurements?entryId=${measurementId}&clientId=${clientId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Measurement deleted');
        fetchMeasurements();
        onUpdate?.();
      } else {
        toast.error('Failed to delete measurement');
      }
    } catch (error) {
      toast.error('Something went wrong');
    }
  };

  const getChange = (current: number | undefined, previous: number | undefined) => {
    if (!current || !previous) return null;
    return current - previous;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center flex justify-center">
          <Image
            src="/images/spoon-loader.gif"
            alt="Loading..."
            width={60}
            height={90}
            className="object-contain"
            style={{ height: 'auto' }}
            unoptimized
          />
        </CardContent>
      </Card>
    );
  }

  const previousMeasurement = measurements[1] || null;

  return (
    <div className="space-y-6">
      {/* Current Measurements Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Ruler className="h-5 w-5" />
            Body Measurements
          </CardTitle>
          <Button onClick={() => setShowAddModal(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </CardHeader>
        <CardContent>
          {latestMeasurement ? (
            <>
              <p className="text-sm text-gray-500 mb-4">
                Last updated: {format(new Date(latestMeasurement.date), 'MMM d, yyyy')}
                {latestMeasurement.addedBy && (
                  <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">
                    by {latestMeasurement.addedBy}
                  </span>
                )}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {[
                  { key: 'arm', label: 'Arm', color: 'purple' },
                  { key: 'waist', label: 'Waist', color: 'blue' },
                  { key: 'abd', label: 'Abdomen', color: 'orange' },
                  { key: 'chest', label: 'Chest', color: 'green' },
                  { key: 'hips', label: 'Hips', color: 'pink' },
                  { key: 'thigh', label: 'Thigh', color: 'amber' }
                ].map((item) => {
                  const value = latestMeasurement[item.key as keyof MeasurementEntry] as number;
                  const prevValue = previousMeasurement?.[item.key as keyof MeasurementEntry] as number;
                  const change = getChange(value, prevValue);

                  return (
                    <div key={item.key} className={`bg-${item.color}-50 rounded-xl p-4 text-center`}>
                      <p className="text-2xl font-bold text-gray-900">
                        {value || '--'}
                      </p>
                      <p className="text-xs text-gray-500">{item.label} (cm)</p>
                      {change !== null && change !== 0 && (
                        <p className={`text-xs mt-1 flex items-center justify-center gap-1 ${change > 0 ? 'text-red-500' : 'text-green-500'}`}>
                          {change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {change > 0 ? '+' : ''}{change.toFixed(1)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Ruler className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No measurements recorded yet</p>
              <Button className="mt-4" onClick={() => setShowAddModal(true)}>
                Add First Measurement
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Measurement History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Measurement History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {measurements.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-gray-600">Date</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-600">Arm (cm)</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-600">Waist (cm)</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-600">Abdomen (cm)</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-600">Chest (cm)</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-600">Hips (cm)</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-600">Thigh (cm)</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-600">Added By</th>
                    <th className="text-center py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {measurements.map((entry, index) => (
                    <tr key={entry._id || index} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 px-2 text-gray-700">
                        {format(new Date(entry.date), 'MMM d, yyyy')}
                      </td>
                      <td className="py-3 px-2 text-center">{entry.arm || '-'}</td>
                      <td className="py-3 px-2 text-center">{entry.waist || '-'}</td>
                      <td className="py-3 px-2 text-center">{entry.abd || '-'}</td>
                      <td className="py-3 px-2 text-center">{entry.chest || '-'}</td>
                      <td className="py-3 px-2 text-center">{entry.hips || '-'}</td>
                      <td className="py-3 px-2 text-center">{entry.thigh || '-'}</td>
                      <td className="py-3 px-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded ${entry.addedBy === 'client' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                          }`}>
                          {entry.addedBy || 'system'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <button
                          onClick={() => entry._id && handleDeleteMeasurement(entry._id)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-gray-500 py-4">No measurement history</p>
          )}
        </CardContent>
      </Card>

      {/* Add Measurement Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-hidden"
          onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}
        >
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden my-auto">
            {/* Header - Sticky */}
            <div className="shrink-0 p-6 border-b border-gray-100 bg-white">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Add New Measurements</h3>
              <p className="text-sm text-gray-500">
                Recording for: {format(new Date(), 'MMMM d, yyyy')}
              </p>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-6">
              <div className="space-y-4">
                {[
                  { key: 'arm', label: 'Arm' },
                  { key: 'waist', label: 'Waist' },
                  { key: 'abd', label: 'Abdomen' },
                  { key: 'chest', label: 'Chest' },
                  { key: 'hips', label: 'Hips' },
                  { key: 'thigh', label: 'Thigh' }
                ].map((field) => (
                  <div key={field.key}>
                    <Label>{field.label} (cm)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={newMeasurement[field.key as keyof typeof newMeasurement]}
                      onChange={(e) => setNewMeasurement({
                        ...newMeasurement,
                        [field.key]: e.target.value
                      })}
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Footer - Sticky */}
            <div className="shrink-0 flex gap-3 p-6 border-t border-gray-100 bg-white">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleAddMeasurement}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

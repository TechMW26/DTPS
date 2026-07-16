"use client";
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save } from 'lucide-react';

export interface RecallEntry {
  id: string;
  _id?: string; // MongoDB ID for saved entries
  mealType: string; // e.g., Early Morning, Breakfast
  hour: string; // 1-12
  minute: string; // 00-59
  meridian: 'AM' | 'PM';
  food: string;
}

interface RecallFormProps {
  entries: RecallEntry[];
  onChange: (entries: RecallEntry[]) => void;
  onSave: () => void;
  onSaveEntry?: (entry: RecallEntry) => Promise<void>;
  onDeleteEntry?: (entryId: string) => Promise<void>;
  loading?: boolean;
  userRole?: 'client' | 'dietitian' | 'health_counselor' | 'admin';
}

export function RecallForm({ entries, onChange, onSave, onSaveEntry, onDeleteEntry, loading, userRole = 'client' }: RecallFormProps) {
  // Predefined meal slots - 8 canonical meal types
  const defaultSlots: { mealType: string; hour: string; minute: string; meridian: 'AM' | 'PM' }[] = [
    { mealType: 'Early Morning', hour: '6', minute: '00', meridian: 'AM' },
    { mealType: 'Breakfast', hour: '9', minute: '00', meridian: 'AM' },
    { mealType: 'Mid Morning', hour: '11', minute: '00', meridian: 'AM' },
    { mealType: 'Lunch', hour: '1', minute: '00', meridian: 'PM' },
    { mealType: 'Mid Evening', hour: '4', minute: '00', meridian: 'PM' },
    { mealType: 'Evening', hour: '7', minute: '00', meridian: 'PM' },
    { mealType: 'Dinner', hour: '7', minute: '00', meridian: 'PM' },
    { mealType: 'Post Dinner', hour: '9', minute: '00', meridian: 'PM' },
  ];

  // For dietitian: show single save button at bottom
  const isDietitian = userRole === 'dietitian';

  // Initialize default slots if empty (after initial render) to avoid setState during render
  useEffect(() => {
    if (entries.length === 0) {
      onChange(defaultSlots.map(s => ({
        id: Math.random().toString(36).slice(2),
        mealType: s.mealType,
        hour: s.hour,
        minute: s.minute,
        meridian: s.meridian,
        food: ''
      })));
    }
  }, [entries.length]); // Remove onChange from dependencies to prevent infinite loop

  const addEntry = () => {
    onChange([
      ...entries,
      { id: Math.random().toString(36).slice(2), mealType: 'Breakfast', hour: '9', minute: '00', meridian: 'AM', food: '' }
    ]);
  };

  const updateEntry = (id: string, field: keyof RecallEntry, value: string) => {
    onChange(entries.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter(e => e.id !== id));
  };

  return (
    <Card className="border-0 shadow-lg rounded-xl overflow-hidden">
      <CardHeader className="bg-linear-to-r from-emerald-500 to-emerald-600 py-4 px-4 sm:px-6">
        <CardTitle className="text-lg sm:text-xl font-bold text-white">24h Dietary Recall</CardTitle>
        <CardDescription className="text-blue-100 text-sm">Record foods consumed in the past 24 hours</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6 px-4 sm:px-6">
        <div className="space-y-5">
          {entries.map((entry) => (
            <div key={entry.id} className="border border-gray-200 rounded-lg p-5 space-y-4 bg-white hover:bg-gray-50 transition-colors">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <Select value={entry.mealType} onValueChange={(val: string) => updateEntry(entry.id, 'mealType', val)}>
                  <SelectTrigger className="w-full sm:w-48 h-10 text-sm font-semibold">
                    <SelectValue>{entry.mealType}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Early Morning">Early Morning</SelectItem>
                    <SelectItem value="Breakfast">Breakfast</SelectItem>
                    <SelectItem value="Mid Morning">Mid Morning</SelectItem>
                    <SelectItem value="Lunch">Lunch</SelectItem>
                    <SelectItem value="Mid Evening">Mid Evening</SelectItem>
                    <SelectItem value="Evening">Evening</SelectItem>
                    <SelectItem value="Dinner">Dinner</SelectItem>
                    <SelectItem value="Post Dinner">Post Dinner</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg p-2">
                  <Input className="w-12 h-8 text-xs text-center border-0 bg-white" value={entry.hour} onChange={e => updateEntry(entry.id, 'hour', e.target.value)} />
                  <span className="text-sm font-bold text-gray-600">:</span>
                  <Input className="w-12 h-8 text-xs text-center border-0 bg-white" value={entry.minute} onChange={e => updateEntry(entry.id, 'minute', e.target.value)} />
                  <Select value={entry.meridian} onValueChange={(val: 'AM' | 'PM') => updateEntry(entry.id, 'meridian', val)}>
                    <SelectTrigger className="w-16 h-8 text-xs border-0 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AM">AM</SelectItem>
                      <SelectItem value="PM">PM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2.5">
                <Label className="text-sm font-medium">Food Details</Label>
                <Textarea
                  value={entry.food}
                  onChange={e => updateEntry(entry.id, 'food', e.target.value)}
                  rows={2}
                  placeholder="Please enter food details here..."
                  className="resize-none"
                />
              </div>

              {/* Show individual save buttons only for clients */}
              {!isDietitian && (
                <div className="flex justify-end gap-2 pt-2">
                  {onSaveEntry && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onSaveEntry(entry)}
                      disabled={loading}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs"
                    >
                      <Save className="mr-1 h-3.5 w-3.5" />
                      Save Entry
                    </Button>
                  )}
                  {onDeleteEntry && entry.food && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => onDeleteEntry(entry.id)}
                      disabled={loading}
                      className="text-xs"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  )}
                  {(!entry._id || !entry.food) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeEntry(entry.id)}
                      className="text-xs"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Clear
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
          {entries.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No entries yet. Add the first one.</p>
          )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-gray-200 mt-4">
          <Button type="button" variant="outline" onClick={addEntry} className="text-xs">
            <Plus className="mr-2 h-4 w-4" />
            Add Custom Entry
          </Button>

          {/* Single Save All button for dietitians */}
          {isDietitian && (
            <Button
              type="button"
              onClick={onSave}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium shadow-md hover:shadow-lg transition-all">

              <Save className="mr-2 h-4 w-4" />
              Save All Entries
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
export default RecallForm;

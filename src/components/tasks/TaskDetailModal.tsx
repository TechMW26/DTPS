'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar, Clock, Tag, X, Loader2, Save } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Tag {
  _id: string;
  name: string;
  color?: string;
  icon?: string;
}

interface Task {
  _id: string;
  taskType: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  allottedTime: string;
  repeatFrequency: number;
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  tags?: Tag[];
  createdAt: string;
}

interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  clientId: string;
  availableTags: Tag[];
  onTaskUpdated: () => void;
}

export function TaskDetailModal({
  isOpen,
  onClose,
  task,
  clientId,
  availableTags,
  onTaskUpdated,
}: TaskDetailModalProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (task) {
      setSelectedTags(task.tags?.slice(0, 1).map(t => t._id) || []);
      setHasChanges(false);
    }
  }, [task, isOpen]);

  const handleTagToggle = (tagId: string) => {
    setSelectedTags(prev => {
      const newTags = prev.includes(tagId) ? [] : [tagId];
      setHasChanges(true);
      return newTags;
    });
  };

  const handleSaveTags = async () => {
    if (!task) return;

    try {
      setIsSaving(true);
      const response = await fetch(
        `/api/clients/${clientId}/tasks/${task._id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: selectedTags }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update task tags');
      }

      toast.success('Task tags updated successfully');
      onTaskUpdated();
      setHasChanges(false);
    } catch (error) {
      console.error('Error updating task tags:', error);
      toast.error('Failed to update task tags');
    } finally {
      setIsSaving(false);
    }
  };

  if (!task) return null;

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    'in-progress': 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
  <DialogContent className="sm:max-w-150">
        <DialogHeader>
          <DialogTitle className="text-xl">{task.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Task Type & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                Task Type
              </p>
              <p className="font-medium">{task.taskType}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                Status
              </p>
              <Badge className={statusColors[task.status]}>
                {task.status}
              </Badge>
            </div>
          </div>

          {/* Description */}
          {task.description && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                Description
              </p>
              <p className="text-sm text-gray-700">{task.description}</p>
            </div>
          )}

          {/* Dates & Time */}
          <div className="grid grid-cols-3 gap-4 bg-gray-50 p-3 rounded">
            <div>
              <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                <Calendar className="w-3 h-3" />
                <span>Start Date</span>
              </div>
              <p className="font-medium text-sm">
                {format(new Date(task.startDate), 'MMM dd, yyyy')}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                <Calendar className="w-3 h-3" />
                <span>End Date</span>
              </div>
              <p className="font-medium text-sm">
                {format(new Date(task.endDate), 'MMM dd, yyyy')}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                <Clock className="w-3 h-3" />
                <span>Time</span>
              </div>
              <p className="font-medium text-sm">{task.allottedTime}</p>
            </div>
          </div>

          {/* Repeat Frequency */}
          {task.repeatFrequency > 0 && (
            <div className="bg-blue-50 p-3 rounded">
              <p className="text-xs text-blue-600 font-medium">
                Repeats every {task.repeatFrequency} day(s)
              </p>
            </div>
          )}

          {/* Tags Section */}
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-gray-600" />
              <h3 className="font-semibold">Tags</h3>
            </div>

            {availableTags.length === 0 ? (
              <p className="text-sm text-gray-500">No tags available</p>
            ) : (
              <div className="space-y-3 max-h-50 overflow-y-auto">
                <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-md">
                  <p className="text-xs text-blue-700 font-medium">
                    ℹ️ Select one tag at a time. To use a different tag, remove the current one first.
                  </p>
                </div>
                {availableTags.map(tag => (
                  <label
                    key={tag._id}
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedTags[0] === tag._id}
                      onCheckedChange={() => handleTagToggle(tag._id)}
                    />
                    <div className="flex items-center gap-2 flex-1">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-sm">{tag.name}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Selected Tags Preview */}
          {selectedTags.length > 0 && (
            <div className="border-t pt-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                Selected Tags
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedTags.map(tagId => {
                  const tag = availableTags.find(t => t._id === tagId);
                  if (!tag) return null;
                  return (
                    <Badge
                      key={tagId}
                      className="gap-1"
                      style={{
                        backgroundColor: tag.color || '#3B82F6',
                        color: 'white',
                      }}
                    >
                      {tag.name}
                      <button
                        onClick={() => handleTagToggle(tagId)}
                        className="ml-1 hover:opacity-75"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Close
          </Button>
          {hasChanges && (
            <Button onClick={handleSaveTags} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Tags
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

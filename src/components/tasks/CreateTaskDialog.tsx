'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const TASK_TYPES = [
  'General Followup',
  'Habit Update',
  'Session Booking',
  'Sign Document',
  'Form Allotment',
  'Report Upload',
  'Diary Update',
  'Measurement Update',
  'BCA Update',
  'Progress Update'
];

const TIME_OPTIONS: string[] = [];
for (let i = 0; i < 24; i++) {
  for (let j = 0; j < 60; j += 30) {
    const hour = i % 12 === 0 ? 12 : i % 12;
    const meridian = i < 12 ? 'AM' : 'PM';
    const minute = String(j).padStart(2, '0');
    TIME_OPTIONS.push(`${String(hour).padStart(2, '0')}:${minute} ${meridian}`);
  }
}

interface CreateTaskDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  dietitianEmail?: string;
  onTaskCreated: () => void;
}

export function CreateTaskDialog({
  isOpen,
  onClose,
  clientId,
  clientName,
  dietitianEmail,
  onTaskCreated
}: CreateTaskDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    taskType: '',
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    allottedTime: '12:00 AM',
    dueTime: '11:59 PM',
    repeatFrequency: 0,
    notifyClientOnChat: false,
    notifyDieticianOnCompletion: dietitianEmail || ''
  });

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Get available time options (only future times for today, all times for future dates)
  const getAvailableTimeOptions = () => {
    const today = new Date();
    const todayDateStr = today.toISOString().split('T')[0];
    
    // If start date is today, filter out past times
    if (formData.startDate === todayDateStr) {
      const currentHour = today.getHours();
      const currentMinute = today.getMinutes();
      
      return TIME_OPTIONS.filter(timeStr => {
        const [timeOnly] = timeStr.split(' ');
        const [hours, minutes] = timeOnly.split(':').map(Number);
        
        // Convert to 24-hour format for comparison
        let hour24 = hours;
        if (timeStr.includes('PM') && hours !== 12) {
          hour24 = hours + 12;
        } else if (timeStr.includes('AM') && hours === 12) {
          hour24 = 0;
        }
        
        // Only show times that are current or future
        return hour24 > currentHour || (hour24 === currentHour && minutes >= currentMinute);
      });
    }
    
    // For future dates, show all times
    return TIME_OPTIONS;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.taskType || !formData.startDate || !formData.endDate) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (new Date(formData.startDate) > new Date(formData.endDate)) {
      toast.error('Start date cannot be after end date');
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`/api/clients/${clientId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Task created successfully');
        setFormData({
          taskType: '',
          title: '',
          description: '',
          startDate: '',
          endDate: '',
          allottedTime: '12:00 AM',
          dueTime: '11:59 PM',
          repeatFrequency: 0,
          notifyClientOnChat: false,
          notifyDieticianOnCompletion: dietitianEmail || ''
        });
        onClose();
        onTaskCreated();
      } else {
        toast.error(data.error || 'Failed to create task');
      }
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Error creating task');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Task for {clientName}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Task Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="taskType" className="text-sm font-medium">
                Task Type *
              </Label>
              <Select
                value={formData.taskType}
                onValueChange={(value) =>
                  setFormData({ ...formData, taskType: value })
                }
              >
                <SelectTrigger id="taskType">
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Contact Search */}
            <div>
              <Label htmlFor="contact" className="text-sm font-medium">
                Select Contact
              </Label>
              <Input
                id="contact"
                placeholder="Search..."
                disabled
                value={clientName}
              />
            </div>
          </div>

          {/* Start & End Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startDate" className="text-sm font-medium">
                Start Date *
              </Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                min={getTodayDate()}
                onChange={(e) =>
                  setFormData({ 
                    ...formData, 
                    startDate: e.target.value,
                    // Reset time if date changes
                    allottedTime: TIME_OPTIONS[0] || '12:00 AM'
                  })
                }
                required
              />
            </div>

            <div>
              <Label htmlFor="endDate" className="text-sm font-medium">
                End Date *
              </Label>
              <Input
                id="endDate"
                type="date"
                value={formData.endDate}
                min={getTodayDate()}
                onChange={(e) =>
                  setFormData({ ...formData, endDate: e.target.value })
                }
                required
              />
            </div>
          </div>

          {/* Allotted Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="allottedTime" className="text-sm font-medium">
                Task Allotment Time
              </Label>
              <Select
                value={formData.allottedTime}
                onValueChange={(value) =>
                  setFormData({ ...formData, allottedTime: value })
                }
              >
                <SelectTrigger id="allottedTime">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {getAvailableTimeOptions().map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Due Time */}
            <div>
              <Label htmlFor="dueTime" className="text-sm font-medium">
                Due Time (Complete By)
              </Label>
              <Select
                value={formData.dueTime}
                onValueChange={(value) =>
                  setFormData({ ...formData, dueTime: value })
                }
              >
                <SelectTrigger id="dueTime">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {TIME_OPTIONS.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Repeat Frequency */}
          <div>
            <Label htmlFor="repeatFrequency" className="text-sm font-medium">
              Repeat Frequency
            </Label>
            <Input
              id="repeatFrequency"
              type="number"
              min="0"
              value={formData.repeatFrequency}
              placeholder="0 = No repeat"
              onChange={(e) =>
                setFormData({
                  ...formData,
                  repeatFrequency: parseInt(e.target.value) || 0
                })
              }
            />
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="notifyClient"
                checked={formData.notifyClientOnChat}
                onCheckedChange={(checked) =>
                  setFormData({
                    ...formData,
                    notifyClientOnChat: checked === true
                  })
                }
              />
              <Label htmlFor="notifyClient" className="font-normal cursor-pointer">
                Notify Customer on chat
              </Label>
            </div>
          </div>

          {/* Notify Practitioner */}
          <div>
            <Label htmlFor="notifyPractitioner" className="text-sm font-medium">
              Notify practitioner on task completion
            </Label>
            <Input
              id="notifyPractitioner"
              placeholder="Nothing selected"
              value={formData.notifyDieticianOnCompletion}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  notifyDieticianOnCompletion: e.target.value
                })
              }
            />
          </div>

          {/* Description/Message */}
          <div>
            <Label htmlFor="description" className="text-sm font-medium">
              Message
            </Label>
            <Textarea
              id="description"
              placeholder="Write your message here"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={4}
            />
            <p className="text-xs text-gray-500 mt-1">
              Note: Type #name to use as a placeholder for contact's name
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

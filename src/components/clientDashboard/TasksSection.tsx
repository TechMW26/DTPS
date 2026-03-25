'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Calendar, Clock, Trash2, CheckCircle2, AlertCircle, Loader2, Tag } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { CreateTaskDialog } from '@/components/tasks/CreateTaskDialog';
import { TaskDetailModal } from '@/components/tasks/TaskDetailModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRealtime } from '@/hooks/useRealtime';
import { useDataRefresh, DataEventTypes } from '@/lib/events/useDataRefresh';

interface TagType {
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
  notifyClientOnChat: boolean;
  notifyDieticianOnCompletion: string;
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  tags?: TagType[];
  googleCalendarEventId?: string;
  createdAt: string;
  creatorRole?: 'dietitian' | 'health_counselor' | 'admin';
  dietitian?: {
    _id: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
}

interface TasksSectionProps {
  clientId: string;
  clientName: string;
  dietitianEmail?: string;
  userRole?: 'dietitian' | 'health_counselor' | 'admin';
  onRegisterReset?: (fn: () => void) => void;
}

export default function TasksSection({
  clientId,
  clientName,
  dietitianEmail,
  userRole = 'dietitian',
  onRegisterReset
}: TasksSectionProps) {
  const { data: session } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [availableTags, setAvailableTags] = useState<TagType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [filteredStatus, setFilteredStatus] = useState<'all' | 'pending' | 'completed'>('all');
  const [syncing, setSyncing] = useState<string | null>(null);
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [tagFormData, setTagFormData] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
  });

  // Helper function to check if current user can edit/delete a task
  const canEditTask = (task: Task) => {
    // Admins can edit any task
    if (userRole === 'admin') return true;
    // Both dietitians and health counselors can only edit/delete tasks they created
    const currentUserId = (session?.user as any)?.id || (session?.user as any)?._id;
    return task.dietitian?._id === currentUserId;
  };

  // Helper function to get creator display info
  const getCreatorInfo = (task: Task) => {
    const creatorName = task.dietitian ? `${task.dietitian.firstName} ${task.dietitian.lastName}` : 'Unknown';
    const creatorRole = task.creatorRole || 'dietitian';
    const roleLabel = creatorRole === 'health_counselor' ? 'Health Counselor' : creatorRole === 'admin' ? 'Admin' : 'Dietitian';
    const roleColor = creatorRole === 'health_counselor' ? 'bg-purple-100 text-purple-800' : creatorRole === 'admin' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800';
    return { creatorName, roleLabel, roleColor };
  };

  const fetchTasks = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/clients/${clientId}/tasks`);
      if (!response.ok) {
        console.error('Failed to fetch tasks:', response.status);
        return;
      }
      const data = await response.json();
      if (data.success) {
        setTasks(data.tasks);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast.error('Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  const fetchAvailableTags = useCallback(async () => {
    try {
      // Fetch tags - API automatically filters based on session user role
      // Dietitians see dietitian + general tags, health counselors see health_counselor + general tags, admins see all
      const response = await fetch(`/api/admin/tags`);
      if (response.ok) {
        const data = await response.json();
        setAvailableTags(data);
      }
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchAvailableTags();
  }, [fetchTasks, fetchAvailableTags]);

  // Register reset callback for floating back button
  useEffect(() => {
    if (onRegisterReset) {
      onRegisterReset(() => {
        setIsDialogOpen(false);
        setIsDetailModalOpen(false);
        setSelectedTask(null);
        setFilteredStatus('all');
        fetchTasks();
      });
    }
  }, [onRegisterReset]);

  // Subscribe to real-time tag updates
  useDataRefresh(DataEventTypes.TAGS_UPDATED, fetchAvailableTags, [fetchAvailableTags]);

  const handleRealtimeMessage = useCallback(
    (event: { type: string; data: string }) => {
      if (!event?.type) return;
      if (!['task_created', 'task_updated', 'task_deleted'].includes(event.type)) return;
      try {
        const data = JSON.parse(event.data);
        if (data?.clientId && String(data.clientId) !== String(clientId)) return;
      } catch {
        // If payload is not parseable, do a safe refresh.
      }
      fetchTasks();
    },
    [clientId, fetchTasks]
  );

  useRealtime({ onMessage: handleRealtimeMessage });

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      const response = await fetch(`/api/clients/${clientId}/tasks/${taskId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Task deleted');
        fetchTasks();
      } else {
        toast.error('Failed to delete task');
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Error deleting task');
    }
  };

  const handleUpdateStatus = async (taskId: string, status: string) => {
    try {
      const response = await fetch(`/api/clients/${clientId}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      if (response.ok) {
        toast.success('Task status updated');
        fetchTasks();
      } else {
        toast.error('Failed to update task');
      }
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Error updating task');
    }
  };

  const handleSyncToGoogleCalendar = async (taskId: string) => {
    try {
      setSyncing(taskId);
      const response = await fetch(
        `/api/clients/${clientId}/tasks/${taskId}/google-calendar`,
        { method: 'POST' }
      );

      const data = await response.json();

      if (response.ok) {
        toast.success('Task synced to Google Calendar');
        fetchTasks();
      } else {
        // Show action message if available
        if (data.action) {
          toast.error(`${data.error}: ${data.action}`);
        } else {
          toast.error(data.error || 'Failed to sync with Google Calendar');
        }
      }
    } catch (error) {
      console.error('Error syncing to Google Calendar:', error);
      toast.error('Error syncing to Google Calendar');
    } finally {
      setSyncing(null);
    }
  };

  const handleRemoveFromGoogleCalendar = async (taskId: string) => {
    try {
      setSyncing(taskId);
      const response = await fetch(
        `/api/clients/${clientId}/tasks/${taskId}/google-calendar`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        toast.success('Task removed from Google Calendar');
        fetchTasks();
      } else {
        toast.error('Failed to remove from Google Calendar');
      }
    } catch (error) {
      console.error('Error removing from Google Calendar:', error);
      toast.error('Error removing from Google Calendar');
    } finally {
      setSyncing(null);
    }
  };

  const handleOpenTagDialog = () => {
    setIsTagDialogOpen(true);
  };

  const handleCloseTagDialog = () => {
    setIsTagDialogOpen(false);
  };

  const handleSaveTag = async () => {
    try {
      const response = await fetch('/api/admin/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tagFormData),
      });

      if (!response.ok) {
        throw new Error('Failed to save tag');
      }

      toast.success('Tag saved successfully');
      handleCloseTagDialog();
      fetchAvailableTags();
    } catch (error) {
      console.error('Error saving tag:', error);
      toast.error('Failed to save tag');
    }
  };

  const filteredTasks = tasks.filter(task => {
    if (filteredStatus === 'all') return true;
    return task.status === filteredStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Tasks</h2>
        <Button
          onClick={() => setIsDialogOpen(true)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Task
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Button
          variant={filteredStatus === 'all' ? 'default' : 'outline'}
          onClick={() => setFilteredStatus('all')}
          size="sm"
        >
          All ({tasks.length})
        </Button>
        <Button
          variant={filteredStatus === 'pending' ? 'default' : 'outline'}
          onClick={() => setFilteredStatus('pending')}
          size="sm"
        >
          Pending ({tasks.filter(t => t.status === 'pending').length})
        </Button>
        <Button
          variant={filteredStatus === 'completed' ? 'default' : 'outline'}
          onClick={() => setFilteredStatus('completed')}
          size="sm"
        >
          Completed ({tasks.filter(t => t.status === 'completed').length})
        </Button>
      </div>

      {/* Tasks List */}
      {filteredTasks.length === 0 ? (
        <Card>
          <CardContent className="flex justify-center items-center h-40">
            <p className="text-gray-500">No tasks found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredTasks.map((task) => {
            const creatorInfo = getCreatorInfo(task);
            return (
            <Card
              key={task._id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => {
                setSelectedTask(task);
                setIsDetailModalOpen(true);
              }}
            >
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge className={getStatusColor(task.status)}>
                        {task.status}
                      </Badge>
                      <h3 className="text-lg font-semibold">{task.taskType}</h3>
                      <Badge className={creatorInfo.roleColor}>
                        Created by {creatorInfo.roleLabel}: {creatorInfo.creatorName}
                      </Badge>
                    </div>
                    {task.title && (
                      <p className="text-sm text-gray-600 mt-1">{task.title}</p>
                    )}
                    {task.description && (
                      <p className="text-sm text-gray-500 mt-2">{task.description}</p>
                    )}
                  </div>
                  {canEditTask(task) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTask(task._id);
                      }}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Task Details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span>
                      {format(new Date(task.startDate), 'MMM d, yyyy')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <span>{task.allottedTime}</span>
                  </div>
                  <div className="text-gray-600">
                    <span className="font-medium">Repeat:</span> {task.repeatFrequency === 0 ? 'No' : `Every ${task.repeatFrequency} days`}
                  </div>
                  {task.googleCalendarEventId && (
                    <div className="text-green-600 font-medium">
                      ✓ Synced to Calendar
                    </div>
                  )}
                </div>

                {/* Tags Display */}
                {task.tags && task.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {task.tags.map(tag => (
                      <Badge
                        key={tag._id}
                        style={{
                          backgroundColor: tag.color || '#3B82F6',
                          color: 'white',
                        }}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {canEditTask(task) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTask(task);
                        setIsDetailModalOpen(true);
                      }}
                      className="gap-1"
                    >
                      <Tag className="h-4 w-4" />
                      Manage Tags
                    </Button>
                  )}

                  {canEditTask(task) && task.status !== 'completed' && task.status !== 'cancelled' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateStatus(task._id, 'completed');
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Mark Complete
                    </Button>
                  )}

                  {canEditTask(task) && task.status !== 'completed' && task.status !== 'cancelled' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateStatus(task._id, 'cancelled');
                      }}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <AlertCircle className="h-4 w-4 mr-1" />
                      Cancel Task
                    </Button>
                  )}

                  {!task.googleCalendarEventId ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSyncToGoogleCalendar(task._id);
                      }}
                      disabled={syncing === task._id}
                    >
                      {syncing === task._id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>📅 Sync to Calendar</>
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFromGoogleCalendar(task._id);
                      }}
                      disabled={syncing === task._id}
                      className="text-orange-600"
                    >
                      {syncing === task._id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Removing...
                        </>
                      ) : (
                        <>📅 Remove from Calendar</>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
          })}
        </div>
      )}

      {/* Create Task Dialog */}
      <CreateTaskDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        clientId={clientId}
        clientName={clientName}
        dietitianEmail={dietitianEmail}
        onTaskCreated={() => {
          setIsDialogOpen(false);
          fetchTasks();
        }}
      />

      {/* Task Detail Modal */}
      <TaskDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        task={selectedTask}
        clientId={clientId}
        availableTags={availableTags}
        onTaskUpdated={() => {
          fetchTasks();
          setIsDetailModalOpen(false);
        }}
      />

      {/* Tag Management Modal */}
      <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Tags</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Tag Name"
              value={tagFormData.name}
              onChange={(e) => setTagFormData({ ...tagFormData, name: e.target.value })}
            />
            <Textarea
              placeholder="Description"
              value={tagFormData.description}
              onChange={(e) => setTagFormData({ ...tagFormData, description: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button onClick={handleCloseTagDialog}>Cancel</Button>
            <Button onClick={handleSaveTag}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

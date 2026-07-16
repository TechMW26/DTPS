'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Activity, Plus, Trash2, Loader2, Video, CheckCircle2, Circle, ExternalLink, Target, Send, Check } from 'lucide-react';
import TrackingStatsGrid from './TrackingStatsGrid';
// import TimeBasedBarChart from './TimeBasedBarChart';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface ActivityEntry {
  _id: string;
  name: string;
  sets: number;
  reps: number;
  duration: number;
  videoLink?: string;
  completed?: boolean;
  completedAt?: string;
  time: string;
}

interface AssignedActivity {
  name: string;
  sets: number;
  reps: number;
  duration: number;
  videoLink?: string;
  completed: boolean;
  completedAt?: string;
}

interface AssignedActivities {
  activities: AssignedActivity[];
  assignedAt?: string;
  isCompleted: boolean;
  completedAt?: string;
}

interface ActivitySectionProps {
  clientId: string;
  selectedDate: Date;
  isClient?: boolean;
}

export default function ActivitySection({ clientId, selectedDate, isClient = false }: ActivitySectionProps) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState({ totalDuration: 0, totalSets: 0, target: 60, percentage: 0 });

  // Assigned activities state
  const [assignedActivities, setAssignedActivities] = useState<AssignedActivities | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [showCustomActivity, setShowCustomActivity] = useState(false);
  const [newAssignActivity, setNewAssignActivity] = useState({
    name: '',
    sets: 0,
    reps: 0,
    duration: 0,
    videoLink: ''
  });
  const [activityList, setActivityList] = useState<AssignedActivity[]>([]);

  const [newActivity, setNewActivity] = useState({
    name: '',
    sets: 0,
    reps: 0,
    duration: 0,
    videoLink: ''
  });

  // Fetch activities for the selected date
  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/journal/activity?date=${dateStr}&clientId=${clientId}`);
      const data = await res.json();

      if (data.success) {
        setActivities(data.activities || []);
        setSummary(data.summary || { totalDuration: 0, totalSets: 0, target: 60, percentage: 0 });
      }
    } catch (error) {
      console.error('Error fetching activities:', error);
      toast.error('Failed to load activities');
    } finally {
      setLoading(false);
    }
  }, [clientId, selectedDate]);

  // Fetch assigned activities status
  const fetchAssignedActivities = useCallback(async () => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/admin/clients/${clientId}/assign-activities?date=${dateStr}`);
      const data = await res.json();

      if (data.assignedActivities) {
        setAssignedActivities(data.assignedActivities);
      } else {
        setAssignedActivities(null);
      }
    } catch (error) {
      console.error('Error fetching assigned activities:', error);
    }
  }, [clientId, selectedDate]);

  useEffect(() => {
    fetchActivities();
    fetchAssignedActivities();
  }, [fetchActivities, fetchAssignedActivities]);

  // Auto-refresh on visibility change and focus (when user comes back to tab/window)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchActivities();
        fetchAssignedActivities();
      }
    };

    const handleFocus = () => {
      fetchActivities();
      fetchAssignedActivities();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchActivities, fetchAssignedActivities]);

  // Add activity to list for assignment
  const handleAddToActivityList = () => {
    if (!newAssignActivity.name) {
      toast.error('Please enter an activity name');
      return;
    }
    setActivityList([...activityList, { ...newAssignActivity, completed: false }]);
    setNewAssignActivity({ name: '', sets: 0, reps: 0, duration: 0, videoLink: '' });
  };

  // Remove activity from list
  const handleRemoveFromActivityList = (index: number) => {
    setActivityList(activityList.filter((_, i) => i !== index));
  };

  // Handle assigning activities to client
  const handleAssignActivities = async () => {
    if (activityList.length === 0) {
      toast.error('Please add at least one activity');
      return;
    }

    try {
      setAssigning(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/admin/clients/${clientId}/assign-activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activities: activityList, date: dateStr })
      });

      const data = await res.json();

      if (data.success) {
        setAssignedActivities({
          activities: activityList,
          assignedAt: new Date().toISOString(),
          isCompleted: false
        });
        setActivityList([]);
        toast.success(`Assigned ${activityList.length} activities to client`);
      } else {
        toast.error(data.error || 'Failed to assign activities');
      }
    } catch (error) {
      console.error('Error assigning activities:', error);
      toast.error('Failed to assign activities');
    } finally {
      setAssigning(false);
    }
  };

  // Handle removing assigned activities
  const handleRemoveAssignedActivities = async () => {
    try {
      setAssigning(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/admin/clients/${clientId}/assign-activities?date=${dateStr}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success) {
        setAssignedActivities(null);
        toast.success('Assigned activities removed');
      } else {
        toast.error(data.error || 'Failed to remove assigned activities');
      }
    } catch (error) {
      console.error('Error removing assigned activities:', error);
      toast.error('Failed to remove assigned activities');
    } finally {
      setAssigning(false);
    }
  };

  const handleAddActivity = async () => {
    if (!newActivity.name) {
      toast.error('Please enter an activity name');
      return;
    }

    try {
      setSaving(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch('/api/journal/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newActivity,
          date: dateStr,
          clientId
        })
      });

      const data = await res.json();

      if (data.success) {
        setActivities(data.activities || []);
        setNewActivity({ name: '', sets: 0, reps: 0, duration: 0, videoLink: '' });
        toast.success('Activity added successfully');
        window.dispatchEvent(new CustomEvent('user-data-changed', { detail: { dataType: 'activity' } }));
        fetchActivities(); // Refresh to get updated summary
      } else {
        toast.error(data.error || 'Failed to add activity');
      }
    } catch (error) {
      console.error('Error adding activity:', error);
      toast.error('Failed to add activity');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteActivity = async (id: string) => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/journal/activity?entryId=${id}&date=${dateStr}&clientId=${clientId}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success) {
        setActivities(data.activities || []);
        toast.success('Activity deleted');
        window.dispatchEvent(new CustomEvent('user-data-changed', { detail: { dataType: 'activity' } }));
        fetchActivities(); // Refresh to get updated summary
      } else {
        toast.error(data.error || 'Failed to delete activity');
      }
    } catch (error) {
      console.error('Error deleting activity:', error);
      toast.error('Failed to delete activity');
    }
  };

  const handleMarkComplete = async (id: string, completed: boolean) => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch('/api/journal/activity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: id,
          date: dateStr,
          clientId,
          completed: !completed
        })
      });

      const data = await res.json();

      if (data.success) {
        setActivities(data.activities || []);
        toast.success(completed ? 'Marked as incomplete' : 'Marked as completed!');
        window.dispatchEvent(new CustomEvent('user-data-changed', { detail: { dataType: 'activity' } }));
        // Re-fetch to get updated summary and assigned status
        fetchActivities();
        fetchAssignedActivities();
      } else {
        toast.error(data.error || 'Failed to update status');
      }
    } catch (error) {
      console.error('Error updating activity:', error);
      toast.error('Failed to update activity');
    }
  };

  const totalDuration = activities.reduce((sum, a) => sum + a.duration, 0);
  const totalSets = activities.reduce((sum, a) => sum + a.sets, 0);
  const completedActivities = activities.filter(a => a.completed);
  const pendingActivities = activities.filter(a => !a.completed);

  // Mock chart data
  const chartData = [
    { time: '6 am', values: [15, 10, 5] },
    { time: '8 am', values: [25, 20, 8] },
    { time: '10 am', values: [35, 25, 12] },
    { time: '12 pm', values: [30, 22, 10] },
    { time: '2 pm', values: [40, 30, 15] },
    { time: '4 pm', values: [35, 28, 12] },
    { time: '6 pm', values: [45, 35, 18] },
    { time: '8 pm', values: [38, 30, 14] },
    { time: '10 pm', values: [20, 15, 8] },
  ];

  const trackingStats = [
    { title: 'Daily Activity', value: `${totalDuration} min`, percentage: summary.percentage, color: '#22c55e' },
    { title: 'Average Activity', value: '50 min', percentage: 80, color: '#3b82f6' },
    { title: 'Total Activity', value: '350 min', percentage: 70, color: '#f97316' },
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
      {/* Assign Activities to Client Card - Only for Dietitian */}
      {!isClient && (
        <Card className="w-full border-orange-200 bg-linear-to-r from-orange-50 to-amber-50">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-orange-600" />
              Assign Activities for {format(selectedDate, 'MMM dd, yyyy')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {assignedActivities ? (
              <div className="space-y-3">
                <div className="p-4 bg-white rounded-lg border border-orange-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-800">
                      {assignedActivities.activities.length} Activities Assigned
                    </p>
                    <div className="flex items-center gap-2">
                      {assignedActivities.isCompleted ? (
                        <Badge className="bg-green-500 text-white flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          All Completed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-orange-600 border-orange-300">
                          {assignedActivities.activities.filter(a => a.completed).length}/{assignedActivities.activities.length} Done
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    {assignedActivities.assignedAt && `Assigned on ${format(new Date(assignedActivities.assignedAt), 'MMM dd, yyyy hh:mm a')}`}
                  </p>
                  <div className="space-y-2 mt-2">
                    {assignedActivities.activities.map((activity, index) => (
                      <div
                        key={index}
                        className={`flex items-center justify-between p-2 rounded-lg ${activity.completed ? 'bg-green-50' : 'bg-gray-50'}`}
                      >
                        <div className="flex items-center gap-2">
                          {activity.completed ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <Circle className="h-4 w-4 text-gray-400" />
                          )}
                          <span className={`text-sm ${activity.completed ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
                            {activity.name}
                          </span>
                          {activity.videoLink && (
                            <a href={activity.videoLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                              <Video className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          {activity.sets}x{activity.reps} • {activity.duration}min
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* <div className="flex gap-2">
                  <Button 
                    onClick={handleRemoveAssignedActivities} 
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




                {/* Activity Input Form */}
                <div className="space-y-3 p-3 bg-white rounded-lg border border-orange-100">
                  <Input
                    placeholder="Activity name (e.g., Push-ups)"
                    value={newAssignActivity.name}
                    onChange={(e) => setNewAssignActivity({ ...newAssignActivity, name: e.target.value })}
                    className="bg-white"
                  />
                  <div className="grid grid-cols-4 gap-2">
                    <Input
                      type="number"
                      placeholder="Sets"
                      value={newAssignActivity.sets || ''}
                      onChange={(e) => setNewAssignActivity({ ...newAssignActivity, sets: parseInt(e.target.value) || 0 })}
                      className="bg-white"
                    />
                    <Input
                      type="number"
                      placeholder="Reps"
                      value={newAssignActivity.reps || ''}
                      onChange={(e) => setNewAssignActivity({ ...newAssignActivity, reps: parseInt(e.target.value) || 0 })}
                      className="bg-white"
                    />
                    <Input
                      type="number"
                      placeholder="Duration (min)"
                      value={newAssignActivity.duration || ''}
                      onChange={(e) => setNewAssignActivity({ ...newAssignActivity, duration: parseInt(e.target.value) || 0 })}
                      className="bg-white"
                    />
                    <Button onClick={handleAddToActivityList} size="sm" className="bg-orange-600 hover:bg-orange-700">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input
                    placeholder="Video link (optional)"
                    value={newAssignActivity.videoLink}
                    onChange={(e) => setNewAssignActivity({ ...newAssignActivity, videoLink: e.target.value })}
                    className="bg-white"
                  />
                </div>

                {/* Activity List */}
                {activityList.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-500">Activities to assign ({activityList.length}):</p>
                    {activityList.map((activity, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-white rounded-lg border border-orange-100"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-800">{activity.name}</span>
                          {activity.videoLink && <Video className="h-3 w-3 text-blue-500" />}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {activity.sets}x{activity.reps} • {activity.duration}min
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveFromActivityList(index)}
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  onClick={handleAssignActivities}
                  disabled={assigning || activityList.length === 0}
                  className="w-full bg-orange-600 hover:bg-orange-700"
                >
                  {assigning ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Assign {activityList.length} Activities
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}



      {/* Today's Activities */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Today's Activities</CardTitle>
            <div className="flex gap-2 items-center flex-wrap">
              <div className="flex gap-2">
                <Badge variant="outline" className="text-blue-600">
                  {completedActivities.reduce((sum, a) => sum + a.duration, 0)} min total
                </Badge>
                <Badge variant="outline" className="text-purple-600">
                  {completedActivities.reduce((sum, a) => sum + a.sets, 0)} sets total
                </Badge>
              </div>
              {isClient && (
                <Button
                  onClick={() => setShowCustomActivity(true)}
                  size="sm"
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* For Dietitian: Show ALL activities (both pending and completed) */}
          {!isClient ? (
            activities.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No activities recorded today</p>
            ) : (
              <div className="space-y-3">
                {/* Summary */}
                <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">
                    Total: {activities.length} activities
                  </span>
                  <div className="flex gap-2">
                    <Badge className="bg-green-100 text-green-700 text-xs">
                      {completedActivities.length} Done
                    </Badge>
                    <Badge className="bg-orange-100 text-orange-700 text-xs">
                      {pendingActivities.length} Pending
                    </Badge>
                  </div>
                </div>

                {/* All Activities */}
                {activities.map((activity) => (
                  <div
                    key={activity._id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${activity.completed
                        ? 'bg-green-50 border-green-100'
                        : 'bg-gray-50 border-gray-100'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      {activity.completed ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <Circle className="h-5 w-5 text-gray-400" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className={`font-medium ${activity.completed ? 'text-gray-700' : 'text-gray-800'}`}>
                            {activity.name}
                          </p>
                          {activity.videoLink && (
                            <a
                              href={activity.videoLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-700"
                            >
                              <Video className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {activity.sets} sets • {activity.reps} reps • {activity.duration} min
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={activity.completed ? "bg-green-100 text-green-700 text-xs" : "bg-orange-100 text-orange-700 text-xs"}>
                        {activity.completed ? 'Done' : 'Pending'}
                      </Badge>
                      <span className="text-xs text-gray-400">{activity.time}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteActivity(activity._id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* For Client: Show both pending and completed activities */
            activities.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No activities recorded today</p>
            ) : (
              <div className="space-y-3">
                {/* Pending Activities - Only for Client */}
                {pendingActivities.length > 0 && (
                  <div className="space-y-3">
                    {pendingActivities.map((activity) => (
                      <div
                        key={activity._id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                      >
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleMarkComplete(activity._id, activity.completed || false)}
                            className="text-gray-400 hover:text-green-500 transition-colors"
                          >
                            <Circle className="h-5 w-5" />
                          </button>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-800">{activity.name}</p>
                              {activity.videoLink && (
                                <a
                                  href={activity.videoLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-500 hover:text-blue-700"
                                >
                                  <Video className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">
                              {activity.sets} sets • {activity.reps} reps • {activity.duration} min
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400">{activity.time}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteActivity(activity._id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Completed Activities - For Client */}
                {completedActivities.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      Completed ({completedActivities.length})
                    </p>
                    <div className="space-y-2">
                      {completedActivities.map((activity) => (
                        <div
                          key={activity._id}
                          className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100"
                        >
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleMarkComplete(activity._id, activity.completed || false)}
                              className="text-green-500 hover:text-green-700 transition-colors"
                            >
                              <CheckCircle2 className="h-5 w-5" />
                            </button>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-gray-700 line-through">{activity.name}</p>
                                {activity.videoLink && (
                                  <a
                                    href={activity.videoLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 hover:text-blue-700"
                                  >
                                    <Video className="h-4 w-4" />
                                  </a>
                                )}
                              </div>
                              <p className="text-sm text-gray-500">
                                {activity.sets} sets • {activity.reps} reps • {activity.duration} min
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge className="bg-green-100 text-green-700 text-xs">Done</Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteActivity(activity._id)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* Activity Tracking Stats */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Activity Tracking</CardTitle>
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

      {/* Activity Duration Chart */}
      {/* <TimeBasedBarChart
        title="Activity Duration"
        yAxisLabel="10 min"
        data={chartData}
        colors={['#3b82f6', '#8b5cf6', '#ef4444']}
        legends={[
          { label: 'Light', color: '#3b82f6' },
          { label: 'Moderate', color: '#8b5cf6' },
          { label: 'Intense', color: '#ef4444' },
        ]}
        maxValue={50}
      /> */}

      {/* Custom Activity Modal */}
      {showCustomActivity && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-3xl w-full max-w-md p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add Activity</h2>
              <button
                onClick={() => setShowCustomActivity(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {/* Display assigned activities if any */}
            {assignedActivities && assignedActivities.activities.length > 0 && (
              <div className="p-3 bg-orange-50 rounded-lg border border-orange-100">
                <p className="text-sm font-medium text-orange-900 mb-2">Assigned Activities:</p>
                <div className="space-y-1">
                  {assignedActivities.activities.map((activity, idx) => (
                    <p key={idx} className="text-xs text-orange-800">
                      • {activity.name} ({activity.sets} sets, {activity.reps} reps, {activity.duration} min)
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Activity Name</Label>
                <Input
                  type="text"
                  placeholder="e.g., Push-ups"
                  value={newActivity.name}
                  onChange={(e) => setNewActivity({ ...newActivity, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">Sets</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newActivity.sets || ''}
                    onChange={(e) => setNewActivity({ ...newActivity, sets: parseInt(e.target.value) || 0 })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Reps</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newActivity.reps || ''}
                    onChange={(e) => setNewActivity({ ...newActivity, reps: parseInt(e.target.value) || 0 })}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Duration (min)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newActivity.duration || ''}
                  onChange={(e) => setNewActivity({ ...newActivity, duration: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Video Link (optional)</Label>
                <Input
                  type="url"
                  placeholder="https://..."
                  value={newActivity.videoLink}
                  onChange={(e) => setNewActivity({ ...newActivity, videoLink: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <Button
              onClick={handleAddActivity}
              disabled={saving}
              className="w-full bg-orange-600 hover:bg-orange-700"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Activity'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { X, Users, Crown, UserPlus, UserMinus, Trash2, Edit2, Loader2, Check, Search, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface GroupMember {
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    role: string;
    email?: string;
  };
  role: 'admin' | 'member';
  joinedAt: string;
}

interface GroupDetail {
  _id: string;
  name: string;
  description?: string;
  avatar?: string;
  createdBy: any;
  members: GroupMember[];
  createdAt: string;
}

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  role: string;
}

interface GroupInfoPanelProps {
  groupId: string;
  currentUserId: string;
  onClose: () => void;
  onGroupUpdated: () => void;
  onGroupDeleted: () => void;
}

export default function GroupInfoPanel({
  groupId,
  currentUserId,
  onClose,
  onGroupUpdated,
  onGroupDeleted
}: GroupInfoPanelProps) {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    fetchGroupDetails();
  }, [groupId]);

  const fetchGroupDetails = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/messages/groups/${groupId}`);
      if (response.ok) {
        const data = await response.json();
        setGroup(data.group);
        setEditName(data.group.name);
        setEditDescription(data.group.description || '');
      }
    } catch (error) {
      console.error('Error fetching group details:', error);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = group?.members.some(
    m => m.user?._id === currentUserId && m.role === 'admin'
  );

  const isCreator = group?.createdBy?._id === currentUserId || group?.createdBy === currentUserId;

  const saveGroupInfo = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/messages/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || undefined
        })
      });

      if (response.ok) {
        const data = await response.json();
        setGroup(data.group);
        setEditing(false);
        onGroupUpdated();
      }
    } catch (error) {
      console.error('Error updating group:', error);
    } finally {
      setSaving(false);
    }
  };

  const fetchAvailableUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await fetch('/api/users/available-for-chat');
      if (response.ok) {
        const data = await response.json();
        const existingIds = group?.members.map(m => m.user?._id) || [];
        setAvailableUsers(
          (data.users || []).filter((u: User) => !existingIds.includes(u._id))
        );
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const addMembers = async (userId: string) => {
    try {
      const response = await fetch(`/api/messages/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', memberIds: [userId] })
      });

      if (response.ok) {
        const data = await response.json();
        setGroup(data.group);
        setAvailableUsers(prev => prev.filter(u => u._id !== userId));
        onGroupUpdated();
      }
    } catch (error) {
      console.error('Error adding member:', error);
    }
  };

  const removeMember = async (userId: string) => {
    if (!confirm('Remove this member from the group?')) return;
    setRemoving(userId);
    try {
      const response = await fetch(`/api/messages/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', memberIds: [userId] })
      });

      if (response.ok) {
        const data = await response.json();
        setGroup(data.group);
        onGroupUpdated();
      }
    } catch (error) {
      console.error('Error removing member:', error);
    } finally {
      setRemoving(null);
    }
  };

  const deleteGroup = async () => {
    if (!confirm('Are you sure you want to delete this group? This cannot be undone.')) return;

    try {
      const response = await fetch(`/api/messages/groups/${groupId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        onGroupDeleted();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to delete group');
      }
    } catch (error) {
      console.error('Error deleting group:', error);
    }
  };

  const filteredUsers = availableUsers.filter(user =>
    `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Group not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-4 border-b bg-gray-50 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h3 className="font-semibold text-gray-900">Group Info</h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Group Avatar & Name */}
        <div className="p-6 flex flex-col items-center text-center border-b">
          <div className="h-20 w-20 rounded-full bg-blue-100 flex items-center justify-center mb-3">
            {group.avatar ? (
              <img src={group.avatar} className="h-20 w-20 rounded-full object-cover" alt="" />
            ) : (
              <Users className="h-10 w-10 text-blue-600" />
            )}
          </div>

          {editing ? (
            <div className="w-full space-y-2">
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Group name"
                maxLength={100}
              />
              <textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                maxLength={500}
                className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(false)} className="flex-1">
                  Cancel
                </Button>
                <Button size="sm" onClick={saveGroupInfo} disabled={saving || !editName.trim()} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900">{group.name}</h2>
              {group.description && <p className="text-sm text-gray-500 mt-1">{group.description}</p>}
              <p className="text-xs text-gray-400 mt-1">
                Group · {group.members.length} member{group.members.length !== 1 ? 's' : ''}
              </p>
              {isAdmin && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="mt-2 text-blue-600">
                  <Edit2 className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
            </>
          )}
        </div>

        {/* Members */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-900 text-sm">
              {group.members.length} Member{group.members.length !== 1 ? 's' : ''}
            </h4>
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddMember(!showAddMember);
                  if (!showAddMember) fetchAvailableUsers();
                }}
                className="text-blue-600"
              >
                <UserPlus className="h-4 w-4 mr-1" />
                Add
              </Button>
            )}
          </div>

          {/* Add member search */}
          {showAddMember && (
            <div className="mb-4 border rounded-lg p-3 bg-gray-50">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search users to add..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {loadingUsers ? (
                  <div className="flex justify-center py-3">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-2">No users available</p>
                ) : (
                  filteredUsers.map(user => (
                    <div
                      key={user._id}
                      onClick={() => addMembers(user._id)}
                      className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-blue-50 transition-colors"
                    >
                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-medium flex-shrink-0">
                        {user.avatar ? (
                          <img src={user.avatar} className="h-8 w-8 rounded-full object-cover" alt="" />
                        ) : (
                          `${user.firstName[0]}${user.lastName[0]}`
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{user.firstName} {user.lastName}</p>
                        <p className="text-xs text-gray-500 capitalize">{user.role.replace('_', ' ')}</p>
                      </div>
                      <UserPlus className="h-4 w-4 text-blue-600" />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Member list */}
          <div className="space-y-1">
            {group.members.map(member => {
              const user = member.user;
              if (!user) return null;

              return (
                <div key={user._id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-medium text-sm flex-shrink-0">
                    {user.avatar ? (
                      <img src={user.avatar} className="h-10 w-10 rounded-full object-cover" alt="" />
                    ) : (
                      `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 text-sm">
                        {user.firstName} {user.lastName}
                        {user._id === currentUserId && <span className="text-gray-400 ml-1">(You)</span>}
                      </p>
                      {member.role === 'admin' && (
                        <span className="inline-flex items-center gap-0.5 bg-yellow-100 text-yellow-700 text-[10px] font-semibold rounded px-1.5 py-0.5">
                          <Crown className="h-2.5 w-2.5" />
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 capitalize">{user.role?.replace('_', ' ')}</p>
                  </div>
                  {isAdmin && user._id !== currentUserId && user._id !== (group.createdBy?._id || group.createdBy) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMember(user._id)}
                      disabled={removing === user._id}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      {removing === user._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserMinus className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Danger Zone */}
        {(isCreator || isAdmin) && (
          <div className="p-4 border-t">
            <Button
              variant="ghost"
              onClick={deleteGroup}
              className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Group
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { X, Search, Users, Loader2, Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  role: string;
  email?: string;
}

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated: (group: any) => void;
  currentUserId: string;
}

export default function CreateGroupModal({ isOpen, onClose, onGroupCreated, currentUserId }: CreateGroupModalProps) {
  const [step, setStep] = useState<'info' | 'members'>('info');
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filterRole, setFilterRole] = useState<string>('all');

  useEffect(() => {
    if (isOpen) {
      setStep('info');
      setGroupName('');
      setDescription('');
      setSelectedUsers([]);
      setSearchQuery('');
      fetchUsers();
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/users/available-for-chat');
      if (response.ok) {
        const data = await response.json();
        setUsers((data.users || []).filter((u: User) => u._id !== currentUserId));
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const createGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) return;

    setCreating(true);
    try {
      const response = await fetch('/api/messages/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName.trim(),
          description: description.trim() || undefined,
          memberIds: selectedUsers
        })
      });

      if (response.ok) {
        const data = await response.json();
        onGroupCreated(data.group);
        onClose();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to create group');
      }
    } catch (error) {
      console.error('Error creating group:', error);
      alert('Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = `${user.firstName} ${user.lastName} ${user.email || ''}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    return matchesSearch && matchesRole;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-blue-600 text-white">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <h2 className="text-lg font-semibold">
              {step === 'info' ? 'New Group' : 'Add Members'}
            </h2>
          </div>
          <button onClick={onClose} className="hover:bg-blue-700 rounded-full p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step 1: Group Info */}
        {step === 'info' && (
          <>
            <div className="p-4 space-y-4 flex-1">
              <div className="flex items-center justify-center">
                <div className="h-20 w-20 rounded-full bg-blue-100 flex items-center justify-center">
                  <Users className="h-10 w-10 text-blue-600" />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Group Name *</label>
                <Input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g., Weight Loss Support Group"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this group about?"
                  rows={3}
                  maxLength={500}
                  className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="p-3 border-t">
              <Button
                onClick={() => setStep('members')}
                disabled={!groupName.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Next: Add Members
              </Button>
            </div>
          </>
        )}

        {/* Step 2: Add Members */}
        {step === 'members' && (
          <>
            <div className="p-3 border-b space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Users className="h-4 w-4" />
                <span className="font-medium">{groupName}</span>
                <span>·</span>
                <span>{selectedUsers.length} member{selectedUsers.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-1 flex-wrap">
                {['all', 'client', 'dietitian', 'health_counselor'].map(role => (
                  <button
                    key={role}
                    onClick={() => setFilterRole(role)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      filterRole === role
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {role === 'all' ? 'All' : role === 'health_counselor' ? 'HC' : role.charAt(0).toUpperCase() + role.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected chips */}
            {selectedUsers.length > 0 && (
              <div className="px-3 pt-2 flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {selectedUsers.map(id => {
                  const user = users.find(u => u._id === id);
                  return user ? (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs rounded-full px-2 py-1"
                    >
                      {user.firstName} {user.lastName}
                      <button onClick={() => toggleUser(id)} className="hover:text-blue-900">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ) : null;
                })}
              </div>
            )}

            {/* User list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No users found</p>
              ) : (
                filteredUsers.map(user => (
                  <div
                    key={user._id}
                    onClick={() => toggleUser(user._id)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b ${
                      selectedUsers.includes(user._id) ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                      selectedUsers.includes(user._id)
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-gray-300'
                    }`}>
                      {selectedUsers.includes(user._id) && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-medium text-sm flex-shrink-0">

                      
                      {user.avatar ? (
                        <img src={user.avatar} className="h-10 w-10 rounded-full object-cover" alt="" />
                      ) : (
                        `${user.firstName[0]}${user.lastName[0]}`
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm">{user.firstName} {user.lastName}</p>
                      <p className="text-xs text-gray-500 capitalize">{user.role.replace('_', ' ')}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t flex gap-2">
              <Button variant="outline" onClick={() => setStep('info')} className="flex-1">
                Back
              </Button>
              <Button
                onClick={createGroup}
                disabled={selectedUsers.length === 0 || creating}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Group ({selectedUsers.length})
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

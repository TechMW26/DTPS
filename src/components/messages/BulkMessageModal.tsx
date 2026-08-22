'use client';

import { useState, useEffect } from 'react';
import { X, Search, Send, CheckCheck, Loader2, Users, ChevronRight, Check } from 'lucide-react';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  role: string;
  email?: string;
  clientStatus?: 'lead' | 'active' | 'inactive' | 'hold';
}

interface BulkMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
}

const MAX_BULK_RECIPIENTS = 500;

export default function BulkMessageModal({ isOpen, onClose, currentUserId }: BulkMessageModalProps) {
  const [step, setStep] = useState<'select' | 'compose' | 'result'>('select');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<{ sent: number; failed: number; skipped: number } | null>(null);
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      setStep('select');
      setSelectedUsers([]);
      setMessage('');
      setResults(null);
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // For bulk messages, only fetch clients (forBulkMessage=true)
      const response = await fetch('/api/users/available-for-chat?forBulkMessage=true&limit=500');
      if (response.ok) {
        const data = await response.json();
        // All users returned should be clients only (server-side filtered)
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

  const selectAll = () => {
    const filteredIds = filteredUsers.map(u => u._id);
    const allSelected = filteredIds.every(id => selectedUsers.includes(id));
    if (allSelected) {
      setSelectedUsers(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedUsers(prev => [...new Set([...prev, ...filteredIds])]);
    }
  };

  const sendBulkMessage = async () => {
    if (!message.trim() || selectedUsers.length === 0) return;

    if (selectedUsers.length > MAX_BULK_RECIPIENTS) {
      alert(`You can send a broadcast to maximum ${MAX_BULK_RECIPIENTS} recipients at a time.`);
      return;
    }

    setSending(true);
    try {
      const response = await fetch('/api/messages/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientIds: selectedUsers,
          content: message.trim(),
          type: 'text'
        })
      });

      if (response.ok) {
        const data = await response.json();
        setResults(data.results);
        setStep('result');
      } else {
        const errData = await response.json();
        const detailMessage = Array.isArray(errData?.details) && errData.details.length > 0
          ? (errData.details[0]?.message || errData.details[0]?.path?.join('.'))
          : '';
        const errorText = detailMessage
          ? `${errData.error || 'Failed to send bulk message'}: ${detailMessage}`
          : (errData.error || 'Failed to send bulk message');
        alert(errorText);
      }
    } catch (error) {
      console.error('Error sending bulk message:', error);
      alert('Failed to send bulk message');
    } finally {
      setSending(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = `${user.firstName} ${user.lastName} ${user.email || ''}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase());

    const matchesStatus = filterStatus === 'all' || user.clientStatus === filterStatus;

    return matchesSearch && matchesStatus;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-green-600 text-white">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <h2 className="text-lg font-semibold">
              {step === 'select' ? 'Select Recipients' : step === 'compose' ? 'Compose Message' : 'Message Sent'}
            </h2>
          </div>
          <button onClick={onClose} className="hover:bg-green-700 rounded-full p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step 1: Select Recipients */}
        {step === 'select' && (
          <>
            <div className="p-3 border-b space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Status Filter */}
              <div className="flex gap-2">
                <button
                  onClick={() => setFilterStatus('all')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterStatus === 'all' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilterStatus('active')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterStatus === 'active' ? 'bg-green-100 text-green-700 border-2 border-green-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  Active
                </button>
                <button
                  onClick={() => setFilterStatus('inactive')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterStatus === 'inactive' ? 'bg-red-100 text-red-700 border-2 border-red-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  Inactive
                </button>
                <button
                  onClick={() => setFilterStatus('lead')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterStatus === 'lead' ? 'bg-gray-100 text-gray-700 border-2 border-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  Lead
                </button>
                <button
                  onClick={() => setFilterStatus('hold')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterStatus === 'hold' ? 'bg-yellow-100 text-yellow-800 border-2 border-yellow-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  On Hold
                </button>
              </div>

              <p className="text-xs text-gray-500">
                Bulk messages can only be sent to your assigned clients.
              </p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {selectedUsers.length} selected of {filteredUsers.length} clients
                </span>
                <button onClick={selectAll} className="text-green-600 hover:text-green-700 font-medium">
                  {filteredUsers.every(u => selectedUsers.includes(u._id)) ? 'Deselect All' : 'Select All'}
                </button>
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
                      className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs rounded-full px-2 py-1"
                    >
                      {user.firstName} {user.lastName}
                      <button onClick={() => toggleUser(id)} className="hover:text-green-900">
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
                <ListSkeleton rows={6} />
              ) : filteredUsers.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No users found</p>
              ) : (
                filteredUsers.map(user => (
                  <div
                    key={user._id}
                    onClick={() => toggleUser(user._id)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b ${selectedUsers.includes(user._id) ? 'bg-green-50' : 'hover:bg-gray-50'
                      }`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${selectedUsers.includes(user._id)
                      ? 'bg-green-600 border-green-600'
                      : 'border-gray-300'
                      }`}>
                      {selectedUsers.includes(user._id) && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-medium text-sm shrink-0">
                      {user.avatar ? (
                        <img src={user.avatar} className="h-10 w-10 rounded-full object-cover" alt="" />
                      ) : (
                        `${user.firstName[0]}${user.lastName[0]}`
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 text-sm">{user.firstName} {user.lastName}</p>
                        {user.clientStatus && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 ${user.clientStatus === 'active' ? 'bg-green-100 text-green-700' :
                            user.clientStatus === 'inactive' ? 'bg-red-100 text-red-700' :
                              user.clientStatus === 'hold' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-700'
                            }`}>
                            {user.clientStatus === 'hold' ? 'On Hold' : user.clientStatus.charAt(0).toUpperCase() + user.clientStatus.slice(1)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 capitalize">{user.role.replace('_', ' ')}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t">
              <Button
                onClick={() => setStep('compose')}
                disabled={selectedUsers.length === 0 || selectedUsers.length > MAX_BULK_RECIPIENTS}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                Next: Compose Message
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
              {selectedUsers.length > MAX_BULK_RECIPIENTS && (
                <p className="text-xs text-red-600 mt-2 text-center">
                  Maximum {MAX_BULK_RECIPIENTS} recipients allowed per broadcast.
                </p>
              )}
            </div>
          </>
        )}

        {/* Step 2: Compose Message */}
        {step === 'compose' && (
          <>
            <div className="p-4 space-y-4 flex-1">
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-sm text-green-800">
                  <strong>{selectedUsers.length}</strong> recipient{selectedUsers.length !== 1 ? 's' : ''} selected
                </p>
                <p className="text-xs text-green-600 mt-1">
                  This message will be sent individually to each recipient as a separate conversation.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message..."
                  rows={6}
                  maxLength={2000}
                  className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
                />
                <p className="text-xs text-gray-400 text-right mt-1">{message.length}/2000</p>
              </div>
            </div>

            <div className="p-3 border-t flex gap-2">
              <Button variant="outline" onClick={() => setStep('select')} className="flex-1">
                Back
              </Button>
              <Button
                onClick={sendBulkMessage}
                disabled={!message.trim() || sending || selectedUsers.length > MAX_BULK_RECIPIENTS}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send to {selectedUsers.length}
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {/* Step 3: Results */}
        {step === 'result' && results && (
          <>
            <div className="p-6 flex-1 flex flex-col items-center justify-center text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCheck className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Bulk Message Sent!</h3>
              <div className="space-y-2 text-sm">
                <p className="text-green-600">
                  <strong>{results.sent}</strong> message{results.sent !== 1 ? 's' : ''} sent successfully
                </p>
                {results.failed > 0 && (
                  <p className="text-red-500">
                    <strong>{results.failed}</strong> failed to send
                  </p>
                )}
                {results.skipped > 0 && (
                  <p className="text-yellow-600">
                    <strong>{results.skipped}</strong> invalid recipient{results.skipped !== 1 ? 's' : ''} skipped
                  </p>
                )}
              </div>
            </div>
            <div className="p-3 border-t">
              <Button onClick={onClose} className="w-full bg-green-600 hover:bg-green-700">
                Done
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

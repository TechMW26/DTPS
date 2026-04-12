'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertCircle,
  Bell,
  CheckCircle,
  Loader2,
  Search,
  Send,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { UserRole } from '@/types';

type RecipientRole = 'client' | 'dietitian' | 'health_counselor';
type TargetType = 'particular' | 'selected' | 'all';

const ROLE_OPTIONS: Array<{ role: RecipientRole; label: string }> = [
  { role: 'client', label: 'Clients' },
  { role: 'dietitian', label: 'Dietitians' },
  { role: 'health_counselor', label: 'Health Counselors' },
];

interface Recipient {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: RecipientRole;
  hasFcmToken?: boolean;
}

interface SendNotificationFormProps {
  preselectedClientId?: string;
  onSuccess?: () => void;
}

export default function SendNotificationForm({ preselectedClientId, onSuccess }: SendNotificationFormProps) {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === UserRole.ADMIN;

  const [activeTab, setActiveTab] = useState<'send' | 'cleanup'>('send');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const [targetType, setTargetType] = useState<TargetType>(
    preselectedClientId ? 'particular' : 'particular'
  );
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>(
    preselectedClientId ? [preselectedClientId] : []
  );
  const [selectedRoles, setSelectedRoles] = useState<RecipientRole[]>(
    isAdmin ? ROLE_OPTIONS.map((option) => option.role) : ['client']
  );

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [sendResult, setSendResult] = useState<{
    success: boolean;
    message: string;
    stats?: { total: number; success: number; failed: number; skippedNoToken?: number };
  } | null>(null);

  const [cleanupTargetType, setCleanupTargetType] = useState<TargetType>('selected');
  const [cleanupRoles, setCleanupRoles] = useState<RecipientRole[]>(['dietitian', 'health_counselor']);
  const [cleanupSelectedRecipients, setCleanupSelectedRecipients] = useState<string[]>([]);
  const [cleanupSearchQuery, setCleanupSearchQuery] = useState('');
  const [cleanupReadState, setCleanupReadState] = useState<'all' | 'read' | 'unread'>('all');
  const [deleting, setDeleting] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{
    success: boolean;
    message: string;
    stats?: { deletedNotifications: number; targetUsers: number };
  } | null>(null);

  useEffect(() => {
    if (isAdmin) {
      setSelectedRoles((prev) => (prev.length > 0 ? prev : ROLE_OPTIONS.map((option) => option.role)));
      setCleanupRoles((prev) => (prev.length > 0 ? prev : ['dietitian', 'health_counselor']));
    } else {
      setSelectedRoles(['client']);
      setCleanupRoles(['client']);
    }
  }, [isAdmin]);

  const getClientInitials = (name?: string) => {
    const safeName = (name || '').trim();
    if (!safeName) {
      return 'CL';
    }
    return safeName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }

    const fetchRecipients = async () => {
      setLoading(true);
      try {
        const params = isAdmin ? '?roles=client,dietitian,health_counselor' : '';
        const response = await fetch(`/api/admin/notifications/send${params}`);
        const data = await response.json();

        if (data.success) {
          const rawRecipients = (Array.isArray(data.recipients) ? data.recipients : []) as Array<{
            id?: unknown;
            name?: unknown;
            email?: unknown;
            avatar?: unknown;
            role?: unknown;
            hasFcmToken?: unknown;
          }>;

          const normalizedRecipients: Recipient[] = rawRecipients
            .map((recipient) => {
              const roleValue = String(recipient?.role || 'client').trim().toLowerCase();
              const role: RecipientRole =
                roleValue === 'dietitian' || roleValue === 'health_counselor' || roleValue === 'client'
                  ? roleValue
                  : 'client';

              return {
                id: String(recipient?.id || '').trim(),
                name: String(recipient?.name || '').trim() || 'Unnamed User',
                email: String(recipient?.email || '').trim(),
                avatar: typeof recipient?.avatar === 'string' ? recipient.avatar : undefined,
                role,
                hasFcmToken: Boolean(recipient?.hasFcmToken),
              };
            })
            .filter((recipient) => recipient.id.length > 0);

          setRecipients(normalizedRecipients);

          if (preselectedClientId) {
            setSelectedRecipients([preselectedClientId]);
          }
        }
      } catch (error) {
        console.error('Failed to fetch notification recipients:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecipients();
  }, [isAdmin, preselectedClientId, status]);

  const roleFilteredRecipients = useMemo(() => {
    if (!isAdmin) {
      return recipients.filter((recipient) => recipient.role === 'client');
    }

    if (selectedRoles.length === 0) {
      return [];
    }

    return recipients.filter((recipient) => selectedRoles.includes(recipient.role));
  }, [isAdmin, recipients, selectedRoles]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredRecipients = useMemo(
    () => roleFilteredRecipients.filter((recipient) => {
      const safeName = recipient.name.toLowerCase();
      const safeEmail = recipient.email.toLowerCase();
      return safeName.includes(normalizedQuery) || safeEmail.includes(normalizedQuery);
    }),
    [roleFilteredRecipients, normalizedQuery]
  );

  const cleanupRoleFilteredRecipients = useMemo(() => {
    if (cleanupRoles.length === 0) {
      return [];
    }
    return recipients.filter((recipient) => cleanupRoles.includes(recipient.role));
  }, [recipients, cleanupRoles]);

  const normalizedCleanupQuery = cleanupSearchQuery.trim().toLowerCase();
  const filteredCleanupRecipients = useMemo(
    () => cleanupRoleFilteredRecipients.filter((recipient) => {
      const safeName = recipient.name.toLowerCase();
      const safeEmail = recipient.email.toLowerCase();
      return safeName.includes(normalizedCleanupQuery) || safeEmail.includes(normalizedCleanupQuery);
    }),
    [cleanupRoleFilteredRecipients, normalizedCleanupQuery]
  );

  const toggleRoleSelection = (role: RecipientRole, isChecked: boolean) => {
    setSelectedRoles((prev) => {
      if (isChecked) {
        return Array.from(new Set([...prev, role]));
      }
      return prev.filter((value) => value !== role);
    });
  };

  const toggleCleanupRoleSelection = (role: RecipientRole, isChecked: boolean) => {
    setCleanupRoles((prev) => {
      if (isChecked) {
        return Array.from(new Set([...prev, role]));
      }
      return prev.filter((value) => value !== role);
    });
  };

  const setRecipientSelection = (recipientId: string, isSelected: boolean) => {
    if (!recipientId) return;

    setSelectedRecipients((prev) => {
      if (targetType === 'particular') {
        return isSelected ? [recipientId] : [];
      }

      if (isSelected) {
        if (prev.includes(recipientId)) return prev;
        return [...prev, recipientId];
      }

      return prev.filter((id) => id !== recipientId);
    });
  };

  const setCleanupRecipientSelection = (recipientId: string, isSelected: boolean) => {
    if (!recipientId) return;

    setCleanupSelectedRecipients((prev) => {
      if (cleanupTargetType === 'particular') {
        return isSelected ? [recipientId] : [];
      }

      if (isSelected) {
        if (prev.includes(recipientId)) return prev;
        return [...prev, recipientId];
      }

      return prev.filter((id) => id !== recipientId);
    });
  };

  const selectAllFilteredRecipients = () => {
    if (targetType !== 'selected') return;
    const visibleIds = filteredRecipients.map((recipient) => recipient.id);
    setSelectedRecipients((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  const selectAllFilteredCleanupRecipients = () => {
    if (cleanupTargetType !== 'selected') return;
    const visibleIds = filteredCleanupRecipients.map((recipient) => recipient.id);
    setCleanupSelectedRecipients((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  const clearSendSelections = () => setSelectedRecipients([]);
  const clearCleanupSelections = () => setCleanupSelectedRecipients([]);

  const roleLabel = (role: RecipientRole) => {
    if (role === 'client') return 'Client';
    if (role === 'dietitian') return 'Dietitian';
    return 'Health Counselor';
  };

  const roleColorClass = (role: RecipientRole) => {
    if (role === 'dietitian') return 'bg-green-100 text-green-800';
    if (role === 'health_counselor') return 'bg-cyan-100 text-cyan-800';
    return 'bg-blue-100 text-blue-800';
  };

  const handleSendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Please enter a notification title');
      return;
    }

    if (!body.trim()) {
      toast.error('Please enter a notification message');
      return;
    }

    if (isAdmin && selectedRoles.length === 0) {
      toast.error('Please select at least one role');
      return;
    }

    if (targetType !== 'all' && selectedRecipients.length === 0) {
      toast.error(`Please select ${targetType === 'particular' ? 'one user' : 'at least one user'}`);
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        body: body.trim(),
        targetType,
        userIds: targetType !== 'all' ? selectedRecipients : undefined,
        recipientRoles: isAdmin ? selectedRoles : undefined,
        data: {
          type: 'custom',
          ...(actionUrl.trim() ? { url: actionUrl.trim() } : {}),
        },
      };

      const response = await fetch('/api/admin/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.success) {
        setSendResult({ success: true, message: data.message, stats: data.stats });

        const skipped = Number(data?.stats?.skippedNoToken || 0);
        const sent = Number(data?.stats?.success || 0);
        const failed = Number(data?.stats?.failed || 0);

        if (skipped > 0 || failed > 0) {
          toast.success(`Dispatch done: ${sent} sent, ${failed} failed, ${skipped} without token`);
        } else {
          toast.success(`Notification sent to ${sent} recipient(s)`);
        }

        setTitle('');
        setBody('');
        setActionUrl('');

        if (!preselectedClientId) {
          setSelectedRecipients([]);
        }

        onSuccess?.();
      } else {
        setSendResult({ success: false, message: data.message || 'Failed to send notification' });
        toast.error(data.message || 'Failed to send notification');
      }
    } catch (error) {
      console.error('Failed to send notification:', error);
      setSendResult({ success: false, message: 'Failed to send notification' });
      toast.error('Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteNotifications = async () => {
    if (!isAdmin) return;

    if (cleanupRoles.length === 0) {
      toast.error('Please select at least one role for deletion');
      return;
    }

    if (cleanupTargetType !== 'all' && cleanupSelectedRecipients.length === 0) {
      toast.error(`Please select ${cleanupTargetType === 'particular' ? 'one user' : 'at least one user'} to delete`);
      return;
    }

    const confirmed = window.confirm(
      cleanupTargetType === 'all'
        ? 'Delete notifications for all users in selected roles? This action cannot be undone.'
        : 'Delete notifications for selected users? This action cannot be undone.'
    );

    if (!confirmed) return;

    setDeleting(true);
    setCleanupResult(null);

    try {
      const response = await fetch('/api/admin/notifications/send', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: cleanupTargetType,
          recipientRoles: cleanupRoles,
          userIds: cleanupTargetType === 'all' ? undefined : cleanupSelectedRecipients,
          readState: cleanupReadState,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setCleanupResult({
          success: true,
          message: data.message,
          stats: data.stats,
        });

        toast.success(`Deleted ${Number(data?.stats?.deletedNotifications || 0)} notification(s)`);

        if (cleanupTargetType !== 'all') {
          setCleanupSelectedRecipients([]);
        }
      } else {
        setCleanupResult({
          success: false,
          message: data.message || 'Failed to delete notifications',
        });
        toast.error(data.message || 'Failed to delete notifications');
      }
    } catch (error) {
      console.error('Failed to delete notifications:', error);
      setCleanupResult({ success: false, message: 'Failed to delete notifications' });
      toast.error('Failed to delete notifications');
    } finally {
      setDeleting(false);
    }
  };

  const templates = [
    { title: 'Reminder', body: 'Please check your dashboard for today\'s updates.' },
    { title: 'Action Needed', body: 'Please review and complete the pending items.' },
    { title: 'Follow-up', body: 'A quick follow-up is required. Please open your messages.' },
    { title: 'Update Posted', body: 'A new update has been shared for your account.' },
    { title: 'Important Notice', body: 'Please review this important notification promptly.' },
  ];

  const applyTemplate = (template: { title: string; body: string }) => {
    setTitle(template.title);
    setBody(template.body);
  };

  const recipientSummaryCount =
    targetType === 'all'
      ? roleFilteredRecipients.length
      : selectedRecipients.length;

  const cleanupSummaryCount =
    cleanupTargetType === 'all'
      ? cleanupRoleFilteredRecipients.length
      : cleanupSelectedRecipients.length;

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Center
        </CardTitle>
        <CardDescription>
          {isAdmin
            ? 'Send role-based custom web push notifications and cleanup existing notifications.'
            : 'Send custom push notifications to your clients.'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'send' | 'cleanup')}>
          <TabsList>
            <TabsTrigger value="send">Send Notification</TabsTrigger>
            {isAdmin && <TabsTrigger value="cleanup">Delete Notifications</TabsTrigger>}
          </TabsList>

          <TabsContent value="send" className="pt-2">
            <form onSubmit={handleSendSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label>Quick Templates</Label>
                <div className="flex flex-wrap gap-2">
                  {templates.map((template, index) => (
                    <Button
                      key={index}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyTemplate(template)}
                      className="text-xs"
                    >
                      {template.title}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter notification title"
                    maxLength={100}
                  />
                  <p className="text-xs text-muted-foreground">{title.length}/100 characters</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="body">Message *</Label>
                  <Textarea
                    id="body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Enter notification message"
                    rows={3}
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground">{body.length}/500 characters</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="actionUrl">Redirect URL (optional)</Label>
                  <Input
                    id="actionUrl"
                    value={actionUrl}
                    onChange={(e) => setActionUrl(e.target.value)}
                    placeholder="/settings/notifications"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label>Target Type</Label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="targetType"
                      checked={targetType === 'particular'}
                      onChange={() => {
                        setTargetType('particular');
                        setSelectedRecipients((prev) => (prev[0] ? [prev[0]] : []));
                      }}
                    />
                    Particular
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="targetType"
                      checked={targetType === 'selected'}
                      onChange={() => setTargetType('selected')}
                    />
                    Selected
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="targetType"
                      checked={targetType === 'all'}
                      onChange={() => setTargetType('all')}
                    />
                    All
                  </label>
                </div>
              </div>

              {isAdmin && (
                <div className="space-y-3">
                  <Label>Recipient Roles</Label>
                  <div className="flex flex-wrap gap-4">
                    {ROLE_OPTIONS.map((option) => (
                      <label key={option.role} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={selectedRoles.includes(option.role)}
                          onCheckedChange={(checked) => toggleRoleSelection(option.role, checked === true)}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {targetType !== 'all' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>
                      Select Recipients {selectedRecipients.length > 0 && `(${selectedRecipients.length})`}
                    </Label>
                    {targetType === 'selected' && (
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={selectAllFilteredRecipients}>
                          Select All
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={clearSendSelections}>
                          Clear
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    <p>
                      <span className="font-semibold text-foreground">Token:</span> user has at least one registered FCM token, so push can be delivered.
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">No Token:</span> push permission/token is not registered, so push will not be delivered yet.
                    </p>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search recipients by name or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>

                  <div className="h-56 border rounded-md p-2 overflow-y-auto">
                    {loading ? (
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : filteredRecipients.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">No recipients found</div>
                    ) : (
                      <div className="space-y-2">
                        {filteredRecipients.map((recipient) => {
                          const isSelected = selectedRecipients.includes(recipient.id);

                          return (
                            <div
                              key={recipient.id}
                              className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-accent ${isSelected ? 'bg-accent' : ''}`}
                              onClick={() =>
                                setRecipientSelection(
                                  recipient.id,
                                  targetType === 'particular' ? true : !isSelected
                                )
                              }
                            >
                              {targetType === 'selected' && (
                                <Checkbox
                                  checked={isSelected}
                                  onClick={(event) => event.stopPropagation()}
                                  onCheckedChange={(checked) => setRecipientSelection(recipient.id, checked === true)}
                                />
                              )}

                              <Avatar className="h-8 w-8">
                                <AvatarImage src={recipient.avatar} alt={recipient.name} />
                                <AvatarFallback>{getClientInitials(recipient.name)}</AvatarFallback>
                              </Avatar>

                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{recipient.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{recipient.email}</p>
                              </div>

                              <Badge variant="secondary" className={`text-xs ${roleColorClass(recipient.role)}`}>
                                {roleLabel(recipient.role)}
                              </Badge>

                              {recipient.hasFcmToken ? (
                                <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">
                                  Token
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                                  No Token
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedRecipients.length > 0 && targetType !== 'all' && (
                <div className="flex flex-wrap gap-2">
                  {selectedRecipients.slice(0, 8).map((recipientId) => {
                    const recipient = recipients.find((item) => item.id === recipientId);
                    if (!recipient) return null;

                    return (
                      <Badge key={recipientId} variant="secondary" className="flex items-center gap-1">
                        {recipient.name}
                        <button
                          type="button"
                          onClick={() => setSelectedRecipients((prev) => prev.filter((id) => id !== recipientId))}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}

                  {selectedRecipients.length > 8 && (
                    <Badge variant="outline">+{selectedRecipients.length - 8} more</Badge>
                  )}
                </div>
              )}

              {sendResult && (
                <div
                  className={`p-3 rounded-md flex items-start gap-2 ${sendResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}
                >
                  {sendResult.success ? (
                    <CheckCircle className="h-5 w-5 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 mt-0.5" />
                  )}

                  <div>
                    <p className="font-medium">{sendResult.message}</p>
                    {sendResult.stats && (
                      <p className="text-sm">
                        Sent: {sendResult.stats.success}/{sendResult.stats.total}
                        {sendResult.stats.failed > 0 && `, Failed: ${sendResult.stats.failed}`}
                        {Number(sendResult.stats.skippedNoToken || 0) > 0 && `, No Token: ${sendResult.stats.skippedNoToken}`}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={
                  sending ||
                  !title.trim() ||
                  !body.trim() ||
                  (isAdmin && selectedRoles.length === 0) ||
                  (targetType !== 'all' && selectedRecipients.length === 0)
                }
              >
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Notification
                    {recipientSummaryCount > 0 ? ` (${recipientSummaryCount})` : ''}
                  </>
                )}
              </Button>
            </form>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="cleanup" className="pt-2">
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label>Delete Target Type</Label>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="cleanupTargetType"
                        checked={cleanupTargetType === 'particular'}
                        onChange={() => {
                          setCleanupTargetType('particular');
                          setCleanupSelectedRecipients((prev) => (prev[0] ? [prev[0]] : []));
                        }}
                      />
                      Particular
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="cleanupTargetType"
                        checked={cleanupTargetType === 'selected'}
                        onChange={() => setCleanupTargetType('selected')}
                      />
                      Selected
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="cleanupTargetType"
                        checked={cleanupTargetType === 'all'}
                        onChange={() => setCleanupTargetType('all')}
                      />
                      All
                    </label>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Roles to Delete</Label>
                  <div className="flex flex-wrap gap-4">
                    {ROLE_OPTIONS.map((option) => (
                      <label key={option.role} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={cleanupRoles.includes(option.role)}
                          onCheckedChange={(checked) => toggleCleanupRoleSelection(option.role, checked === true)}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cleanupReadState">Delete Scope</Label>
                  <select
                    id="cleanupReadState"
                    value={cleanupReadState}
                    onChange={(e) => setCleanupReadState(e.target.value as 'all' | 'read' | 'unread')}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="all">All notifications</option>
                    <option value="read">Read notifications only</option>
                    <option value="unread">Unread notifications only</option>
                  </select>
                </div>

                {cleanupTargetType !== 'all' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>
                        Select Users {cleanupSelectedRecipients.length > 0 && `(${cleanupSelectedRecipients.length})`}
                      </Label>
                      {cleanupTargetType === 'selected' && (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={selectAllFilteredCleanupRecipients}
                          >
                            Select All
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={clearCleanupSelections}>
                            Clear
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search users by name or email..."
                        value={cleanupSearchQuery}
                        onChange={(e) => setCleanupSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                      {cleanupSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setCleanupSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2"
                        >
                          <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                      )}
                    </div>

                    <div className="h-56 border rounded-md p-2 overflow-y-auto">
                      {loading ? (
                        <div className="flex items-center justify-center h-full">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : filteredCleanupRecipients.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">No users found</div>
                      ) : (
                        <div className="space-y-2">
                          {filteredCleanupRecipients.map((recipient) => {
                            const isSelected = cleanupSelectedRecipients.includes(recipient.id);

                            return (
                              <div
                                key={`cleanup-${recipient.id}`}
                                className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-accent ${isSelected ? 'bg-accent' : ''}`}
                                onClick={() =>
                                  setCleanupRecipientSelection(
                                    recipient.id,
                                    cleanupTargetType === 'particular' ? true : !isSelected
                                  )
                                }
                              >
                                {cleanupTargetType === 'selected' && (
                                  <Checkbox
                                    checked={isSelected}
                                    onClick={(event) => event.stopPropagation()}
                                    onCheckedChange={(checked) =>
                                      setCleanupRecipientSelection(recipient.id, checked === true)
                                    }
                                  />
                                )}

                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={recipient.avatar} alt={recipient.name} />
                                  <AvatarFallback>{getClientInitials(recipient.name)}</AvatarFallback>
                                </Avatar>

                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{recipient.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">{recipient.email}</p>
                                </div>

                                <Badge variant="secondary" className={`text-xs ${roleColorClass(recipient.role)}`}>
                                  {roleLabel(recipient.role)}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {cleanupResult && (
                  <div
                    className={`p-3 rounded-md flex items-start gap-2 ${cleanupResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}
                  >
                    {cleanupResult.success ? (
                      <CheckCircle className="h-5 w-5 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-5 w-5 mt-0.5" />
                    )}

                    <div>
                      <p className="font-medium">{cleanupResult.message}</p>
                      {cleanupResult.stats && (
                        <p className="text-sm">
                          Deleted: {cleanupResult.stats.deletedNotifications} notifications across{' '}
                          {cleanupResult.stats.targetUsers} users
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={handleDeleteNotifications}
                  disabled={
                    deleting ||
                    cleanupRoles.length === 0 ||
                    (cleanupTargetType !== 'all' && cleanupSelectedRecipients.length === 0)
                  }
                >
                  {deleting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Notifications ({cleanupSummaryCount})
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

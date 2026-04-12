'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Bell, Send, Users, User, Loader2, CheckCircle, AlertCircle, Search, X } from 'lucide-react';
import { toast } from 'sonner';

interface Client {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface SendNotificationFormProps {
  preselectedClientId?: string;
  onSuccess?: () => void;
}

export default function SendNotificationForm({ preselectedClientId, onSuccess }: SendNotificationFormProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetType, setTargetType] = useState<'single' | 'multiple' | 'all'>(
    preselectedClientId ? 'single' : 'single'
  );
  const [selectedClients, setSelectedClients] = useState<string[]>(
    preselectedClientId ? [preselectedClientId] : []
  );
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    stats?: { total: number; success: number; failed: number };
  } | null>(null);

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

  // Fetch clients for selection
  useEffect(() => {
    const fetchClients = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/admin/notifications/send');
        const data = await response.json();
        if (data.success) {
          const rawClients = (Array.isArray(data.clients) ? data.clients : []) as Array<{
            id?: unknown;
            name?: unknown;
            email?: unknown;
            avatar?: unknown;
          }>;

          const normalizedClients: Client[] = Array.isArray(data.clients)
            ? rawClients
              .map((client) => ({
                id: String(client?.id || '').trim(),
                name: String(client?.name || '').trim() || 'Unnamed Client',
                email: String(client?.email || '').trim(),
                avatar: typeof client?.avatar === 'string' ? client.avatar : undefined,
              }))
              .filter((client: Client) => client.id.length > 0)
            : [];
          setClients(normalizedClients);
        }
      } catch (error) {
        console.error('Failed to fetch clients:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchClients();
  }, []);

  // Filter clients based on search
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredClients = clients.filter((client) => {
    const safeName = (client.name || '').toLowerCase();
    const safeEmail = (client.email || '').toLowerCase();
    return safeName.includes(normalizedQuery) || safeEmail.includes(normalizedQuery);
  });

  // Handle client selection
  const toggleClientSelection = (clientId: string) => {
    if (!clientId) {
      return;
    }
    if (targetType === 'single') {
      setSelectedClients([clientId]);
    } else {
      setSelectedClients(prev =>
        prev.includes(clientId)
          ? prev.filter(id => id !== clientId)
          : [...prev, clientId]
      );
    }
  };

  const setClientSelection = (clientId: string, isSelected: boolean) => {
    if (!clientId) {
      return;
    }
    setSelectedClients(prev => {
      if (isSelected) {
        if (prev.includes(clientId)) {
          return prev;
        }
        return [...prev, clientId];
      }
      if (!prev.includes(clientId)) {
        return prev;
      }
      return prev.filter(id => id !== clientId);
    });
  };

  // Select all filtered clients
  const selectAllFiltered = () => {
    const filteredIds = filteredClients.map(c => c.id);
    setSelectedClients(prev => {
      const newSet = new Set([...prev, ...filteredIds]);
      return Array.from(newSet);
    });
  };

  // Clear all selections
  const clearSelections = () => {
    setSelectedClients([]);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Please enter a notification title');
      return;
    }

    if (!body.trim()) {
      toast.error('Please enter a notification message');
      return;
    }

    if (targetType !== 'all' && selectedClients.length === 0) {
      toast.error('Please select at least one client');
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          targetType,
          clientIds: targetType !== 'all' ? selectedClients : undefined,
          data: {
            type: 'custom',
            url: '/client-dashboard'
          }
        })
      });

      const data = await response.json();

      if (data.success) {
        setResult({
          success: true,
          message: data.message,
          stats: data.stats
        });
        toast.success(`Notification sent to ${data.stats.success} client(s)`);

        // Reset form
        setTitle('');
        setBody('');
        if (!preselectedClientId) {
          setSelectedClients([]);
        }

        onSuccess?.();
      } else {
        setResult({
          success: false,
          message: data.message
        });
        toast.error(data.message);
      }
    } catch (error) {
      console.error('Failed to send notification:', error);
      setResult({
        success: false,
        message: 'Failed to send notification'
      });
      toast.error('Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  // Notification templates
  const templates = [
    { title: '📢 Reminder', body: 'Don\'t forget to log your meals today!' },
    { title: '💪 Motivation', body: 'Keep up the great work! You\'re making progress!' },
    { title: '📅 Check-in', body: 'Time for your weekly check-in. How are you feeling?' },
    { title: '🎯 Goal Update', body: 'Let\'s review your progress and adjust your goals!' },
    { title: '💧 Hydration', body: 'Remember to drink water throughout the day!' },
  ];

  const applyTemplate = (template: { title: string; body: string }) => {
    setTitle(template.title);
    setBody(template.body);
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Send Custom Notification
        </CardTitle>
        <CardDescription>
          Send push notifications to your clients
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Quick Templates */}
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

          {/* Notification Content */}
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
          </div>

          {/* Target Type Selection */}
          {!preselectedClientId && (
            <div className="space-y-3">
              <Label>Send To</Label>
              <div className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="single"
                    name="targetType"
                    value="single"
                    checked={targetType === 'single'}
                    onChange={(e) => {
                      setTargetType('single');
                      if (selectedClients.length > 1) {
                        setSelectedClients([selectedClients[0]]);
                      }
                    }}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="single" className="flex items-center gap-1 cursor-pointer">
                    <User className="h-4 w-4" />
                    Single Client
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="multiple"
                    name="targetType"
                    value="multiple"
                    checked={targetType === 'multiple'}
                    onChange={() => setTargetType('multiple')}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="multiple" className="flex items-center gap-1 cursor-pointer">
                    <Users className="h-4 w-4" />
                    Multiple Clients
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="all"
                    name="targetType"
                    value="all"
                    checked={targetType === 'all'}
                    onChange={() => setTargetType('all')}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="all" className="flex items-center gap-1 cursor-pointer">
                    <Users className="h-4 w-4" />
                    All Clients
                  </Label>
                </div>
              </div>
            </div>
          )}

          {/* Client Selection */}
          {targetType !== 'all' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Select Clients {selectedClients.length > 0 && `(${selectedClients.length})`}</Label>
                {targetType === 'multiple' && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={selectAllFiltered}
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearSelections}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients..."
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

              {/* Client List */}
              <div className="h-52 border rounded-md p-2 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : filteredClients.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No clients found
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredClients.map((client) => {
                      const isSelected = selectedClients.includes(client.id);
                      const handleRowSelect = () => {
                        if (targetType === 'single') {
                          toggleClientSelection(client.id);
                        } else if (targetType === 'multiple') {
                          setClientSelection(client.id, !isSelected);
                        }
                      };

                      return (
                        <div
                          key={client.id}
                          className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-accent ${isSelected ? 'bg-accent' : ''
                            }`}
                          onClick={targetType === 'single' ? handleRowSelect : undefined}
                        >
                          {targetType === 'multiple' && (
                            <Checkbox
                              type="button"
                              checked={isSelected}
                              onClick={(e) => e.stopPropagation()}
                              onCheckedChange={(checked) => setClientSelection(client.id, checked === true)}
                            />
                          )}
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={client.avatar} alt={client.name} />
                            <AvatarFallback>
                              {getClientInitials(client.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{client.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                          </div>
                          {isSelected && targetType === 'single' && (
                            <Badge variant="secondary" className="text-xs">Selected</Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Selected Clients Preview */}
          {selectedClients.length > 0 && targetType !== 'all' && (
            <div className="flex flex-wrap gap-2">
              {selectedClients.slice(0, 5).map(clientId => {
                const client = clients.find(c => c.id === clientId);
                return client ? (
                  <Badge key={clientId} variant="secondary" className="flex items-center gap-1">
                    {client.name}
                    <button
                      type="button"
                      onClick={() => setSelectedClients(prev => prev.filter(id => id !== clientId))}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ) : null;
              })}
              {selectedClients.length > 5 && (
                <Badge variant="outline">+{selectedClients.length - 5} more</Badge>
              )}
            </div>
          )}

          {/* Result Message */}
          {result && (
            <div
              className={`p-3 rounded-md flex items-start gap-2 ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}
            >
              {result.success ? (
                <CheckCircle className="h-5 w-5 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 mt-0.5" />
              )}
              <div>
                <p className="font-medium">{result.message}</p>
                {result.stats && (
                  <p className="text-sm">
                    Sent: {result.stats.success}/{result.stats.total}
                    {result.stats.failed > 0 && ` (${result.stats.failed} failed)`}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={sending || (!title.trim()) || (!body.trim()) || (targetType !== 'all' && selectedClients.length === 0)}
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
                {targetType === 'all' ? ` to All Clients (${clients.length})` :
                  selectedClients.length > 0 ? ` to ${selectedClients.length} Client(s)` : ''}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { formatDateIST, formatTimeIST } from '@/lib/utils/formatDateIST';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, CalendarPlus } from "lucide-react";
import { toast } from "sonner";

interface Appointment {
  _id: string;
  type: string;
  status: string;
  scheduledAt: string;
  duration: number;
  notes?: string;
  dietitian: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  client: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface Dietitian {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Client {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export default function AdminAppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Booking dialog state
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [dietitians, setDietitians] = useState<Dietitian[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [bookingData, setBookingData] = useState({
    dietitianId: '',
    clientId: '',
    scheduledAt: '',
    duration: 60,
    type: 'consultation',
    notes: ''
  });
  const [booking, setBooking] = useState(false);

  async function fetchAppointments() {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set('limit', '50');
      params.set('page', String(page));
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const res = await fetch(`/api/appointments?${params.toString()}`, {
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        // Check if response is HTML (nginx error page)
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          throw new Error(`Server error (${res.status}). Please try again.`);
        }
        const errorText = await res.text();
        throw new Error(errorText || `Request failed with status ${res.status}`);
      }

      const data = await res.json();
      setAppointments(data.appointments || []);
      setPages(data.pagination?.pages || 1);
      setTotal(data.pagination?.total || 0);
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError(e?.message || "Failed to load appointments");
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchDietitiansAndClients() {
    try {
      const [dietitiansRes, clientsRes] = await Promise.all([
        fetch('/api/users/dietitians', { cache: 'no-store' }),
        fetch('/api/users/clients', { cache: 'no-store' })
      ]);

      if (dietitiansRes.ok) {
        const contentType = dietitiansRes.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const dietitiansData = await dietitiansRes.json();
          setDietitians(dietitiansData.dietitians || []);
        }
      }

      if (clientsRes.ok) {
        const contentType = clientsRes.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const clientsData = await clientsRes.json();
          setClients(clientsData.clients || []);
        }
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }

  async function handleBookAppointment() {
    try {
      setBooking(true);
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      toast.success('Appointment booked successfully!');
      setShowBookingDialog(false);
      setBookingData({
        dietitianId: '',
        clientId: '',
        scheduledAt: '',
        duration: 60,
        type: 'consultation',
        notes: ''
      });
      fetchAppointments();
    } catch (error: any) {
      toast.error(error.message || 'Failed to book appointment');
    } finally {
      setBooking(false);
    }
  }

  useEffect(() => {
    fetchAppointments();
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchDietitiansAndClients();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'no-show': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'consultation': return 'bg-purple-100 text-purple-800';
      case 'follow-up': return 'bg-orange-100 text-orange-800';
      case 'initial': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Appointments Management</h1>
          <Button onClick={() => setShowBookingDialog(true)} className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4" />
            Book Appointment
          </Button>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Search appointments..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-64"
          />
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="no-show">No Show</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="text-sm text-gray-600">
          {total} appointments total
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              All Appointments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 flex items-center justify-center">
                <LoadingSpinner />
              </div>
            ) : error ? (
              <div className="py-8 flex flex-col items-center justify-center gap-4">
                <div className="text-red-600 text-sm text-center max-w-md">{error}</div>
                <Button
                  variant="outline"
                  onClick={() => fetchAppointments()}
                  className="flex items-center gap-2"
                >
                  Try Again
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-3">Date & Time</th>
                      <th className="text-left p-3">Dietitian</th>
                      <th className="text-left p-3">Client</th>
                      <th className="text-left p-3">Type</th>
                      <th className="text-left p-3">Duration</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map(appointment => (
                      <tr key={appointment._id} className="border-b hover:bg-gray-50">
                        <td className="p-3">
                          <div className="text-sm">
                            <div className="font-medium">
                              {formatDateIST(appointment.scheduledAt)}
                            </div>
                            <div className="text-gray-500">
                              {formatTimeIST(appointment.scheduledAt)}
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="text-sm">
                            <div className="font-medium">
                              {appointment.dietitian.firstName} {appointment.dietitian.lastName}
                            </div>
                            <div className="text-gray-500">
                              {appointment.dietitian.email}
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="text-sm">
                            <div className="font-medium">
                              {appointment.client.firstName} {appointment.client.lastName}
                            </div>
                            <div className="text-gray-500">
                              {appointment.client.email}
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge className={getTypeColor(appointment.type)}>
                            {appointment.type}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1 text-sm">
                            <Clock className="h-4 w-4" />
                            {appointment.duration}m
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge className={getStatusColor(appointment.status)}>
                            {appointment.status}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="text-sm text-gray-600 max-w-xs truncate">
                            {appointment.notes || '-'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-gray-600">
              Showing {(page - 1) * 50 + 1}-{Math.min(page * 50, total)} of {total} appointments
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={page <= 1 || loading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                  const start = Math.max(1, Math.min(pages - 4, page - 2));
                  const n = start + i;
                  if (n > pages) return null;
                  return (
                    <Button
                      key={n}
                      variant={n === page ? "default" : "outline"}
                      size="sm"
                      className="w-8 h-8 p-0 rounded-full"
                      disabled={loading}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={page >= pages || loading}
                onClick={() => setPage(p => Math.min(pages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Booking Dialog */}
        <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Book New Appointment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Dietitian</Label>
                <Select value={bookingData.dietitianId} onValueChange={(v) => setBookingData({ ...bookingData, dietitianId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select dietitian" />
                  </SelectTrigger>
                  <SelectContent>
                    {dietitians.map(dietitian => (
                      <SelectItem key={dietitian._id} value={dietitian._id}>
                        {dietitian.firstName} {dietitian.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Client</Label>
                <Select value={bookingData.clientId} onValueChange={(v) => setBookingData({ ...bookingData, clientId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(client => (
                      <SelectItem key={client._id} value={client._id}>
                        {client.firstName} {client.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={bookingData.scheduledAt}
                  onChange={(e) => setBookingData({ ...bookingData, scheduledAt: e.target.value })}
                />
              </div>

              <div>
                <Label>Duration (minutes)</Label>
                <Select value={String(bookingData.duration)} onValueChange={(v) => setBookingData({ ...bookingData, duration: parseInt(v) })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="60">60 minutes</SelectItem>
                    <SelectItem value="90">90 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Type</Label>
                <Select value={bookingData.type} onValueChange={(v) => setBookingData({ ...bookingData, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consultation">Consultation</SelectItem>
                    <SelectItem value="follow-up">Follow-up</SelectItem>
                    <SelectItem value="initial">Initial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={bookingData.notes}
                  onChange={(e) => setBookingData({ ...bookingData, notes: e.target.value })}
                  placeholder="Optional notes..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBookingDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleBookAppointment} disabled={booking || !bookingData.dietitianId || !bookingData.clientId || !bookingData.scheduledAt}>
                {booking ? <LoadingSpinner className="mr-2 h-4 w-4" /> : null}
                Book Appointment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

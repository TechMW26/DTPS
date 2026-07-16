'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Calendar, Clock, Video, Phone, MapPin, Plus, ChevronRight, User, Bell, Sparkles, CheckCircle2 } from 'lucide-react';
import { format, isToday, isTomorrow, isPast, formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { MobileBottomNav } from '@/components/mobile/MobileBottomNav';

interface Appointment {
  _id: string;
  type: string;
  status: string;
  scheduledAt: string;
  duration: number;
  notes?: string;
  meetingLink?: string;
  dietitian: {
    firstName: string;
    lastName: string;
    avatar?: string;
  };
}

export default function MobileAppointmentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth/signin');
      return;
    }
  }, [session, status, router]);

  useEffect(() => {
    if (session) {
      fetchAppointments();
    }
  }, [session]);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/appointments');
      if (response.ok) {
        const data = await response.json();
        setAppointments(data.appointments || []);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAppointmentDate = (dateString: string) => {
    try {
      if (!dateString) return 'N/A';
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      if (isToday(date)) return 'Today';
      if (isTomorrow(date)) return 'Tomorrow';
      return format(date, 'MMM dd, yyyy');
    } catch (error) {
      return 'N/A';
    }
  };

  const getAppointmentTime = (dateString: string) => {
    try {
      if (!dateString) return 'N/A';
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      return format(date, 'h:mm a');
    } catch (error) {
      return 'N/A';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-700 border-green-200';
      case 'scheduled': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'completed': return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'cancelled': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video className="h-5 w-5" />;
      case 'phone': return <Phone className="h-5 w-5" />;
      case 'in-person': return <MapPin className="h-5 w-5" />;
      default: return <Calendar className="h-5 w-5" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'video': return 'from-purple-500 to-pink-500';
      case 'phone': return 'from-blue-500 to-cyan-500';
      case 'in-person': return 'from-orange-500 to-red-500';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  const upcomingAppointments = appointments.filter(apt => !isPast(new Date(apt.scheduledAt)));
  const pastAppointments = appointments.filter(apt => isPast(new Date(apt.scheduledAt)));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner className="h-12 w-12 text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Clean Modern Header */}
      <div className="bg-white px-4 pt-safe-top sticky top-0 z-50 shadow-sm border-b border-gray-100">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center space-x-3">
            <div className="h-14 w-14 rounded-2xl bg-linear-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md">
              <Calendar className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
              <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                Your health journey
              </p>
            </div>
          </div>
          <button className="h-11 w-11 bg-gray-100 rounded-xl flex items-center justify-center hover:bg-gray-200 transition-all active:scale-95">
            <Bell className="h-6 w-6 text-gray-700" />
          </button>
        </div>

        {/* Clean Tabs */}
        <div className="flex gap-2 mt-3 pb-1">
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`flex-1 py-3 rounded-t-2xl font-semibold transition-all ${
              activeTab === 'upcoming'
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Clock className="h-4 w-4" />
              Upcoming
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                activeTab === 'upcoming' ? 'bg-white/20' : 'bg-gray-200'
              }`}>
                {upcomingAppointments.length}
              </span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('past')}
            className={`flex-1 py-3 rounded-t-2xl font-semibold transition-all ${
              activeTab === 'past'
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Past
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                activeTab === 'past' ? 'bg-white/20' : 'bg-gray-200'
              }`}>
                {pastAppointments.length}
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-4">
        {activeTab === 'upcoming' ? (
          upcomingAppointments.length === 0 ? (
            <div className="text-center py-16 px-6">
              <div className="relative inline-block mb-6">
                <div className="h-24 w-24 rounded-3xl bg-linear-to-br from-purple-100 to-pink-100 flex items-center justify-center mx-auto shadow-md border border-purple-200">
                  <Calendar className="h-12 w-12 text-purple-600" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">No upcoming appointments</h3>
              <p className="text-gray-600 text-sm mb-8 max-w-xs mx-auto">
                Start your wellness journey by booking a session with your dietitian
              </p>
              <Link
                href="/appointments/book"
                className="inline-flex items-center gap-2 px-8 py-4 bg-linear-to-r from-purple-600 to-pink-600 text-white rounded-2xl font-semibold shadow-lg hover:shadow-xl active:scale-95 transition-all"
              >
                <Plus className="h-5 w-5" />
                Book Your First Session
                <Sparkles className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <>
              {upcomingAppointments.map((appointment, index) => (
                <Link
                  key={appointment._id}
                  href={`/appointments/${appointment._id}`}
                  className="block group"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="bg-white rounded-3xl shadow-md border border-gray-100 p-5 transform transition-all duration-300 hover:shadow-lg active:scale-[0.98]">
                    <div className="flex items-start gap-4">
                      {/* Avatar with clean design */}
                      <div className="relative shrink-0">
                        <div className={`h-16 w-16 rounded-2xl bg-linear-to-br ${getTypeColor(appointment.type)} p-0.5 shadow-md`}>
                          <div className="h-full w-full rounded-2xl bg-white p-0.5">
                            {appointment.dietitian.avatar ? (
                              <img
                                src={appointment.dietitian.avatar}
                                alt={appointment.dietitian.firstName}
                                className="h-full w-full rounded-2xl object-cover"
                              />
                            ) : (
                              <div className={`h-full w-full rounded-2xl bg-linear-to-br ${getTypeColor(appointment.type)} flex items-center justify-center`}>
                                <User className="h-7 w-7 text-white" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <h3 className="font-bold text-gray-900 text-lg">
                              Dt. {appointment.dietitian.firstName} {appointment.dietitian.lastName}
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {formatDistanceToNow(new Date(appointment.scheduledAt), { addSuffix: true })}
                            </p>
                          </div>
                          <div className="p-2 rounded-xl bg-gray-100">
                            <ChevronRight className="h-5 w-5 text-gray-600" />
                          </div>
                        </div>

                        {/* Date & Time with clean badges */}
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-xl border border-blue-200">
                            <Calendar className="h-3.5 w-3.5 text-blue-600" />
                            <span className="text-xs font-semibold text-blue-700">{getAppointmentDate(appointment.scheduledAt)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 rounded-xl border border-purple-200">
                            <Clock className="h-3.5 w-3.5 text-purple-600" />
                            <span className="text-xs font-semibold text-purple-700">{getAppointmentTime(appointment.scheduledAt)}</span>
                          </div>
                        </div>

                        {/* Type & Status badges */}
                        <div className="flex items-center gap-2">
                          <div className={`flex items-center gap-1.5 px-3 py-1.5 bg-linear-to-br ${getTypeColor(appointment.type)} rounded-xl shadow-sm`}>
                            {getTypeIcon(appointment.type)}
                            <span className="text-xs font-bold text-white capitalize">{appointment.type}</span>
                          </div>
                          <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${getStatusBadgeColor(appointment.status)} capitalize`}>
                            {appointment.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </>
          )
        ) : (
          pastAppointments.length === 0 ? (
            <div className="text-center py-16 px-6">
              <div className="h-24 w-24 rounded-3xl bg-gray-100 flex items-center justify-center mx-auto mb-6 shadow-sm border border-gray-200">
                <CheckCircle2 className="h-12 w-12 text-gray-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">No past appointments</h3>
              <p className="text-gray-600 text-sm max-w-xs mx-auto">
                Your completed appointment history will appear here
              </p>
            </div>
          ) : (
            <>
              {pastAppointments.map((appointment, index) => (
                <Link
                  key={appointment._id}
                  href={`/appointments/${appointment._id}`}
                  className="block group"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="bg-white rounded-3xl shadow-md p-5 transform transition-all duration-300 hover:shadow-lg active:scale-[0.98] border border-gray-200">
                    <div className="flex items-start gap-4">
                      {/* Avatar - clean design for past */}
                      <div className="relative shrink-0">
                        <div className="h-16 w-16 rounded-2xl bg-gray-200 p-0.5 shadow-sm">
                          <div className="h-full w-full rounded-2xl bg-white p-0.5">
                            {appointment.dietitian.avatar ? (
                              <img
                                src={appointment.dietitian.avatar}
                                alt={appointment.dietitian.firstName}
                                className="h-full w-full rounded-2xl object-cover opacity-60"
                              />
                            ) : (
                              <div className="h-full w-full rounded-2xl bg-gray-200 flex items-center justify-center">
                                <User className="h-7 w-7 text-gray-500" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <h3 className="font-bold text-gray-700 text-lg">
                              Dt. {appointment.dietitian.firstName} {appointment.dietitian.lastName}
                            </h3>
                            <p className="text-xs text-gray-400 mt-0.5">Completed</p>
                          </div>
                          <div className="p-2 rounded-xl bg-gray-100">
                            <ChevronRight className="h-5 w-5 text-gray-400" />
                          </div>
                        </div>

                        {/* Date & Time */}
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-200">
                            <Calendar className="h-3.5 w-3.5 text-gray-500" />
                            <span className="text-xs font-semibold text-gray-600">{format(new Date(appointment.scheduledAt), 'MMM dd, yyyy')}</span>
                          </div>
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-200">
                            <Clock className="h-3.5 w-3.5 text-gray-500" />
                            <span className="text-xs font-semibold text-gray-600">{getAppointmentTime(appointment.scheduledAt)}</span>
                          </div>
                        </div>

                        {/* Status badge */}
                        <span className={`inline-block px-3 py-1.5 rounded-xl text-xs font-bold border ${getStatusBadgeColor(appointment.status)} capitalize`}>
                          {appointment.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </>
          )
        )}
      </div>

      {/* Floating Action Button - Colorful gradient */}
      <Link
        href="/appointments/book"
        className="fixed bottom-24 right-6 z-40 group"
      >
        <div className="relative">
          <div className="absolute inset-0 bg-linear-to-r from-purple-600 to-pink-600 rounded-full blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
          <div className="relative h-16 w-16 bg-linear-to-r from-purple-600 to-pink-600 text-white rounded-full shadow-2xl hover:shadow-3xl active:scale-95 transition-all flex items-center justify-center">
            <Plus className="h-7 w-7" />
          </div>
        </div>
      </Link>

      {/* Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}


import { google, calendar_v3 } from 'googleapis';
import User from '@/lib/db/models/User';
import { getBaseUrl } from '@/lib/config';

/**
 * Google Calendar Service for managing calendar events
 */

export interface CalendarEventResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

export interface AppointmentCalendarData {
  title: string;
  description: string;
  scheduledAt: Date;
  duration: number;
  meetingLink?: string;
  location?: string;
}

/**
 * Get OAuth2 client for a user
 */
async function getOAuth2ClientForUser(userId: string) {
  const user = await User.findById(userId);
  
  if (!user || !user.googleCalendarAccessToken) {
    return null;
  }

  let baseUrl = getBaseUrl();
  baseUrl = baseUrl.replace(/\/$/, '');

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${baseUrl}/api/auth/google-calendar/callback`
  );

  oauth2Client.setCredentials({
    access_token: user.googleCalendarAccessToken,
    refresh_token: user.googleCalendarRefreshToken,
    expiry_date: user.googleCalendarTokenExpiry ? new Date(user.googleCalendarTokenExpiry).getTime() : undefined
  });

  // Try to refresh token if needed
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    if (credentials.access_token) {
      oauth2Client.setCredentials(credentials);
      // Update stored token
      user.googleCalendarAccessToken = credentials.access_token;
      if (credentials.refresh_token) {
        user.googleCalendarRefreshToken = credentials.refresh_token;
      }
      if (credentials.expiry_date) {
        user.googleCalendarTokenExpiry = new Date(credentials.expiry_date);
      }
      await user.save();
    }
  } catch (refreshError) {
    console.warn('Token refresh failed for user:', userId, refreshError);
  }

  return oauth2Client;
}

/**
 * Create a calendar event for an appointment
 */
export async function createCalendarEvent(
  userId: string,
  appointmentData: AppointmentCalendarData,
  attendeeEmail?: string
): Promise<CalendarEventResult> {
  try {
    const oauth2Client = await getOAuth2ClientForUser(userId);
    
    if (!oauth2Client) {
      return { success: false, error: 'Google Calendar not connected' };
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const endTime = new Date(appointmentData.scheduledAt.getTime() + appointmentData.duration * 60 * 1000);

    const event: calendar_v3.Schema$Event = {
      summary: appointmentData.title,
      description: appointmentData.description,
      start: {
        dateTime: appointmentData.scheduledAt.toISOString(),
        timeZone: 'Asia/Kolkata'
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'Asia/Kolkata'
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 30 } // 30 minutes before
        ]
      }
    };

    // Add meeting link if available
    if (appointmentData.meetingLink) {
      event.description = `${appointmentData.description}\n\nJoin meeting: ${appointmentData.meetingLink}`;
      event.conferenceData = {
        entryPoints: [{
          entryPointType: 'video',
          uri: appointmentData.meetingLink,
          label: 'Join Video Call'
        }]
      };
    }

    // Add location if available
    if (appointmentData.location) {
      event.location = appointmentData.location;
    }

    // Add attendee if provided
    if (attendeeEmail) {
      event.attendees = [{ email: attendeeEmail }];
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'all' // Send email notifications to attendees
    });

    return {
      success: true,
      eventId: response.data.id || undefined
    };
  } catch (error: any) {
    console.error('Error creating calendar event:', error);
    return {
      success: false,
      error: error.message || 'Failed to create calendar event'
    };
  }
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(
  userId: string,
  eventId: string
): Promise<CalendarEventResult> {
  try {
    const oauth2Client = await getOAuth2ClientForUser(userId);
    
    if (!oauth2Client) {
      return { success: false, error: 'Google Calendar not connected' };
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
      sendUpdates: 'all' // Send cancellation notifications
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting calendar event:', error);
    // If event not found, consider it a success (already deleted)
    if (error.code === 404 || error.code === 410) {
      return { success: true };
    }
    return {
      success: false,
      error: error.message || 'Failed to delete calendar event'
    };
  }
}

/**
 * Update a calendar event
 */
export async function updateCalendarEvent(
  userId: string,
  eventId: string,
  appointmentData: Partial<AppointmentCalendarData>
): Promise<CalendarEventResult> {
  try {
    const oauth2Client = await getOAuth2ClientForUser(userId);
    
    if (!oauth2Client) {
      return { success: false, error: 'Google Calendar not connected' };
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const event: calendar_v3.Schema$Event = {};

    if (appointmentData.title) {
      event.summary = appointmentData.title;
    }

    if (appointmentData.description) {
      event.description = appointmentData.description;
    }

    if (appointmentData.scheduledAt) {
      event.start = {
        dateTime: appointmentData.scheduledAt.toISOString(),
        timeZone: 'Asia/Kolkata'
      };
      
      if (appointmentData.duration) {
        const endTime = new Date(appointmentData.scheduledAt.getTime() + appointmentData.duration * 60 * 1000);
        event.end = {
          dateTime: endTime.toISOString(),
          timeZone: 'Asia/Kolkata'
        };
      }
    }

    await calendar.events.patch({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: event,
      sendUpdates: 'all'
    });

    return { success: true, eventId };
  } catch (error: any) {
    console.error('Error updating calendar event:', error);
    return {
      success: false,
      error: error.message || 'Failed to update calendar event'
    };
  }
}

/**
 * Sync appointment to both dietitian and client calendars
 */
export async function syncAppointmentToCalendars(
  dietitianId: string,
  clientId: string,
  appointmentData: AppointmentCalendarData,
  dietitianEmail: string,
  clientEmail: string
): Promise<{
  dietitianEventId?: string;
  clientEventId?: string;
  errors: string[];
}> {
  const errors: string[] = [];
  let dietitianEventId: string | undefined;
  let clientEventId: string | undefined;

  // Create event in dietitian's calendar
  const dietitianResult = await createCalendarEvent(
    dietitianId,
    appointmentData,
    clientEmail // Add client as attendee
  );

  if (dietitianResult.success) {
    dietitianEventId = dietitianResult.eventId;
  } else {
    errors.push(`Dietitian calendar: ${dietitianResult.error}`);
  }

  // Create event in client's calendar
  const clientResult = await createCalendarEvent(
    clientId,
    appointmentData,
    dietitianEmail // Add dietitian as attendee
  );

  if (clientResult.success) {
    clientEventId = clientResult.eventId;
  } else {
    errors.push(`Client calendar: ${clientResult.error}`);
  }

  return { dietitianEventId, clientEventId, errors };
}

/**
 * Remove appointment from both calendars
 */
export async function removeAppointmentFromCalendars(
  dietitianId: string,
  clientId: string,
  dietitianEventId?: string,
  clientEventId?: string
): Promise<{ errors: string[] }> {
  const errors: string[] = [];

  // Remove from dietitian's calendar
  if (dietitianEventId) {
    const dietitianResult = await deleteCalendarEvent(dietitianId, dietitianEventId);
    if (!dietitianResult.success) {
      errors.push(`Dietitian calendar: ${dietitianResult.error}`);
    }
  }

  // Remove from client's calendar
  if (clientEventId) {
    const clientResult = await deleteCalendarEvent(clientId, clientEventId);
    if (!clientResult.success) {
      errors.push(`Client calendar: ${clientResult.error}`);
    }
  }

  return { errors };
}

export default {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
  syncAppointmentToCalendars,
  removeAppointmentFromCalendars
};

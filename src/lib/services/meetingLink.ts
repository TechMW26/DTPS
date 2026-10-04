import { google, calendar_v3 } from 'googleapis';
import { getNativeGoogleCalendarClient, getNativeGoogleCalendarClientByEmail } from './native-google-calendar';

export interface MeetingLinkResult {
  success: boolean;
  meetingLink?: string;
  meetingDetails?: {
    meetingId?: string;
    meetingUuid?: string;
    joinUrl?: string;
    startUrl?: string;
    password?: string;
    hostEmail?: string;
    provider: 'google_meet';
  };
  error?: string;
}

/**
 * Generate a meeting link based on the appointment mode
 * Zoom is deprecated; all online/video modes generate Google Meet links.
 */
export async function generateMeetingLink(
  modeName: string,
  meetingConfig: {
    topic: string;
    scheduledAt: Date;
    duration: number;
    description?: string;
    hostEmail: string;
    attendees: { email: string; name: string }[];
  }
): Promise<MeetingLinkResult> {
  const lowerModeName = modeName.toLowerCase();

  // Generate Google Meet for all online/video modes (including legacy zoom mode names)
  if (
    lowerModeName.includes('zoom') ||
    lowerModeName.includes('google') ||
    lowerModeName.includes('meet') ||
    lowerModeName.includes('video') ||
    lowerModeName.includes('online')
  ) {
    return generateGoogleMeetLink(meetingConfig);
  }

  // Not a video mode, no meeting link needed
  return {
    success: true,
    meetingLink: undefined,
    meetingDetails: undefined,
  };
}

/**
 * Get OAuth2 client for a user (for Google Meet/Calendar integration)
 */
/**
 * Find user by email and get their OAuth2 client
 */
/**
 * Generate a Google Meet link using Google Calendar API
 * Creates a calendar event with conference data to get a real Google Meet link
 */
async function generateGoogleMeetLink(config: {
  topic: string;
  scheduledAt: Date;
  duration: number;
  description?: string;
  hostEmail: string;
  attendees: { email: string; name: string }[];
}): Promise<MeetingLinkResult> {
  try {
    // Try to get OAuth2 client for the host
    const hostResult = await getNativeGoogleCalendarClientByEmail(config.hostEmail);

    if (hostResult?.client) {
      // Use Google Calendar API to create event with Google Meet
      const calendar = google.calendar({ version: 'v3', auth: hostResult.client });

      const endTime = new Date(config.scheduledAt.getTime() + config.duration * 60 * 1000);

      const event: calendar_v3.Schema$Event = {
        summary: config.topic,
        description: config.description || `Meeting: ${config.topic}`,
        start: {
          dateTime: config.scheduledAt.toISOString(),
          timeZone: 'Asia/Kolkata'
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'Asia/Kolkata'
        },
        attendees: config.attendees.map(a => ({ email: a.email, displayName: a.name })),
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 30 }
          ]
        }
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
        conferenceDataVersion: 1,
        sendUpdates: 'all'
      });

      const meetLink = response.data.hangoutLink || response.data.conferenceData?.entryPoints?.[0]?.uri;
      const meetId = response.data.conferenceData?.conferenceId || response.data.id;

      if (meetLink) {

        return {
          success: true,
          meetingLink: meetLink,
          meetingDetails: {
            meetingId: meetId || undefined,
            joinUrl: meetLink,
            hostEmail: config.hostEmail,
            provider: 'google_meet',
          },
        };
      }
    }

    return { success: false, error: 'Google Calendar is not connected or did not return a meeting link' };
  } catch (error: any) {
    console.error('Calendar provider operation failed');
    return {
      success: false,
      error: 'Failed to create Google Meet link',
    };
  }
}

/**
 * Check if a mode requires a meeting link
 */
export function requiresMeetingLink(modeName: string): boolean {
  const lowerModeName = modeName.toLowerCase();
  return (
    lowerModeName.includes('zoom') ||
    lowerModeName.includes('google') ||
    lowerModeName.includes('meet') ||
    lowerModeName.includes('video') ||
    lowerModeName.includes('online')
  );
}

// Calendar lifecycle is handled by the appointment outbox with the owning calendar event ID.
export default {generateMeetingLink,requiresMeetingLink};

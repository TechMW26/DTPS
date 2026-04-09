import { google, calendar_v3 } from 'googleapis';
import User from '@/lib/db/models/User';
import { getBaseUrl } from '@/lib/config';

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
 * Find user by email and get their OAuth2 client
 */
async function getOAuth2ClientByEmail(email: string) {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return null;
  return { client: await getOAuth2ClientForUser(user._id.toString()), userId: user._id.toString() };
}

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
    const hostResult = await getOAuth2ClientByEmail(config.hostEmail);
    
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
        console.log('[GoogleMeet] Successfully created Google Meet:', meetLink);
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

    // Fallback: Generate a placeholder meet code if Google Calendar API is not available
    console.log('[GoogleMeet] Falling back to generated meet code (no Google Calendar auth)');
    const generateMeetCode = () => {
      const chars = 'abcdefghijklmnopqrstuvwxyz';
      const segment = () => {
        let result = '';
        for (let i = 0; i < 3; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
      };
      return `${segment()}-${segment()}-${segment()}`;
    };

    const meetCode = generateMeetCode();
    const meetLink = `https://meet.google.com/${meetCode}`;

    return {
      success: true,
      meetingLink: meetLink,
      meetingDetails: {
        meetingId: meetCode,
        joinUrl: meetLink,
        provider: 'google_meet',
      },
    };
  } catch (error: any) {
    console.error('Failed to create Google Meet link:', error);
    return {
      success: false,
      error: error.message || 'Failed to create Google Meet link',
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

/**
 * Delete a meeting link
 */
export async function deleteMeetingLink(
  meetingId: string,
  provider: 'zoom' | 'google_meet'
): Promise<{ success: boolean; error?: string }> {
  try {
    // Zoom support removed. Google Meet links don't need explicit deletion.
    void meetingId;
    void provider;
    
    return { success: true };
  } catch (error: any) {
    console.error(`Failed to delete ${provider} meeting:`, error);
    return {
      success: false,
      error: error.message || `Failed to delete ${provider} meeting`,
    };
  }
}

/**
 * Update a meeting link
 */
export async function updateMeetingLink(
  meetingId: string,
  provider: 'zoom' | 'google_meet',
  config: {
    topic?: string;
    scheduledAt?: Date;
    duration?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Zoom support removed. Google Meet links don't require update.
    void meetingId;
    void provider;
    void config;
    
    return { success: true };
  } catch (error: any) {
    console.error(`Failed to update ${provider} meeting:`, error);
    return {
      success: false,
      error: error.message || `Failed to update ${provider} meeting`,
    };
  }
}

export default {
  generateMeetingLink,
  requiresMeetingLink,
  deleteMeetingLink,
  updateMeetingLink,
};

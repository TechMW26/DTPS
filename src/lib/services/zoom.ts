import axios from 'axios';
import jwt from 'jsonwebtoken';

export interface ZoomMeetingConfig {
  topic: string;
  type: number; // 1 = instant, 2 = scheduled, 3 = recurring with no fixed time, 8 = recurring with fixed time
  start_time: string; // ISO 8601 format
  duration: number; // in minutes
  timezone: string;
  password?: string;
  agenda?: string;
  settings?: {
    host_video?: boolean;
    participant_video?: boolean;
    cn_meeting?: boolean;
    in_meeting?: boolean;
    join_before_host?: boolean;
    mute_upon_entry?: boolean;
    watermark?: boolean;
    use_pmi?: boolean;
    approval_type?: number;
    audio?: string;
    auto_recording?: string;
    enforce_login?: boolean;
    enforce_login_domains?: string;
    alternative_hosts?: string;
    close_registration?: boolean;
    show_share_button?: boolean;
    allow_multiple_devices?: boolean;
    registrants_confirmation_email?: boolean;
    waiting_room?: boolean;
    request_permission_to_unmute_participants?: boolean;
    global_dial_in_countries?: string[];
    global_dial_in_numbers?: Array<{
      city?: string;
      country?: string;
      country_name?: string;
      number?: string;
      type?: string;
    }>;
    contact_name?: string;
    contact_email?: string;
    registrants_email_notification?: boolean;
    meeting_authentication?: boolean;
    authentication_option?: string;
    authentication_domains?: string;
    authentication_name?: string;
  };
}

export interface ZoomMeeting {
  id: number;
  uuid: string;
  host_id: string;
  host_email: string;
  topic: string;
  type: number;
  status: string;
  start_time: string;
  duration: number;
  timezone: string;
  agenda: string;
  created_at: string;
  start_url: string;
  join_url: string;
  password: string;
  h323_password: string;
  pstn_password: string;
  encrypted_password: string;
  settings: {
    host_video: boolean;
    participant_video: boolean;
    cn_meeting: boolean;
    in_meeting: boolean;
    join_before_host: boolean;
    mute_upon_entry: boolean;
    watermark: boolean;
    use_pmi: boolean;
    approval_type: number;
    audio: string;
    auto_recording: string;
    enforce_login: boolean;
    enforce_login_domains: string;
    alternative_hosts: string;
    close_registration: boolean;
    show_share_button: boolean;
    allow_multiple_devices: boolean;
    registrants_confirmation_email: boolean;
    waiting_room: boolean;
    request_permission_to_unmute_participants: boolean;
    global_dial_in_countries: string[];
    contact_name: string;
    contact_email: string;
    registrants_email_notification: boolean;
    meeting_authentication: boolean;
    authentication_option: string;
    authentication_domains: string;
    authentication_name: string;
  };
}

class ZoomService {
  private baseURL = 'https://api.zoom.us/v2';
  private apiKey: string;
  private apiSecret: string;
  private accountId: string;
  private clientId: string;
  private clientSecret: string;

  constructor() {
    this.apiKey = process.env.ZOOM_API_KEY || '';
    this.apiSecret = process.env.ZOOM_API_SECRET || '';
    this.accountId = process.env.ZOOM_ACCOUNT_ID || '';
    this.clientId = process.env.ZOOM_CLIENT_ID || '';
    this.clientSecret = process.env.ZOOM_CLIENT_SECRET || '';

    if (!this.apiKey || !this.apiSecret) {
      console.warn('Zoom API credentials not configured');
    }
  }

  /**
   * Generate JWT token for Zoom API authentication
   */
  private generateJWT(): string {
    const payload = {
      iss: this.apiKey,
      exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour expiration
    };

    return jwt.sign(payload, this.apiSecret);
  }

  /**
   * Get OAuth access token for Server-to-Server OAuth
   */
  private async getAccessToken(): Promise<string> {
    try {
      const response = await axios.post('https://zoom.us/oauth/token', null, {
        params: {
          grant_type: 'account_credentials',
          account_id: this.accountId
        },
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return response.data.access_token;
    } catch (error) {
      console.error('Error getting Zoom access token:', error);
      throw new Error('Failed to get Zoom access token');
    }
  }

  /**
   * Get authorization headers for API requests
   */
  private async getAuthHeaders(): Promise<{ [key: string]: string }> {
    // Try OAuth first (recommended for new apps)
    if (this.clientId && this.clientSecret && this.accountId) {
      const accessToken = await this.getAccessToken();
      return {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      };
    }

    // Fallback to JWT (deprecated but still works)
    const token = this.generateJWT();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Create a new Zoom meeting
   */
  async createMeeting(userId: string, meetingConfig: ZoomMeetingConfig): Promise<ZoomMeeting> {
    try {
      const headers = await this.getAuthHeaders();

      // Try to create meeting with the provided userId first
      let response;
      try {
        response = await axios.post(
          `${this.baseURL}/users/${userId}/meetings`,
          meetingConfig,
          { headers }
        );
      } catch (userError: any) {
        // If user doesn't exist, try with 'me' (the account owner)
        if (userError.response?.data?.code === 1001) {
          response = await axios.post(
            `${this.baseURL}/users/me/meetings`,
            meetingConfig,
            { headers }
          );
        } else {
          throw userError;
        }
      }

      return response.data;
    } catch (error: any) {
      console.error('Error creating Zoom meeting:', error.response?.data || error.message);
      throw new Error(`Failed to create Zoom meeting: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Update an existing Zoom meeting
   */
  async updateMeeting(meetingId: string, meetingConfig: Partial<ZoomMeetingConfig>): Promise<void> {
    try {
      const headers = await this.getAuthHeaders();
      
      await axios.patch(
        `${this.baseURL}/meetings/${meetingId}`,
        meetingConfig,
        { headers }
      );
    } catch (error: any) {
      console.error('Error updating Zoom meeting:', error.response?.data || error.message);
      throw new Error(`Failed to update Zoom meeting: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Delete a Zoom meeting
   */
  async deleteMeeting(meetingId: string): Promise<void> {
    try {
      const headers = await this.getAuthHeaders();
      
      await axios.delete(
        `${this.baseURL}/meetings/${meetingId}`,
        { headers }
      );
    } catch (error: any) {
      console.error('Error deleting Zoom meeting:', error.response?.data || error.message);
      throw new Error(`Failed to delete Zoom meeting: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get meeting details
   */
  async getMeeting(meetingId: string): Promise<ZoomMeeting> {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await axios.get(
        `${this.baseURL}/meetings/${meetingId}`,
        { headers }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error getting Zoom meeting:', error.response?.data || error.message);
      throw new Error(`Failed to get Zoom meeting: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Generate a meeting configuration for appointments
   */
  generateMeetingConfig(
    topic: string,
    startTime: Date,
    duration: number,
    agenda?: string
  ): ZoomMeetingConfig {
    return {
      topic,
      type: 2, // Scheduled meeting
      start_time: startTime.toISOString(),
      duration,
      timezone: 'UTC',
      agenda: agenda || `Nutrition consultation: ${topic}`,
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: true,
        mute_upon_entry: false,
        watermark: false,
        use_pmi: false,
        approval_type: 0, // Automatically approve
        audio: 'both', // Both telephony and VoIP
        auto_recording: 'none',
        enforce_login: false,
        waiting_room: true,
        allow_multiple_devices: true,
        show_share_button: true,
        request_permission_to_unmute_participants: false
      }
    };
  }
}

export default new ZoomService();

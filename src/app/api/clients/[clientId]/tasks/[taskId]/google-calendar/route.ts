import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import Task from '@/lib/db/models/Task';
import User from '@/lib/db/models/User';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/config';
import { google } from 'googleapis';

/**
 * Google Calendar Integration Endpoints
 * 
 * POST: Create a Google Calendar event for the task
 * DELETE: Remove the task from Google Calendar
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string; taskId: string }> }
) {
  let session: any = null;
  try {
    session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { taskId } = await params;

    const task = await Task.findById(taskId);
    
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Get the user (dietitian) who created the task
    const user = await User.findById(session.user.id);
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.googleCalendarAccessToken) {
      return NextResponse.json(
        { 
          error: 'Google Calendar not configured',
          message: 'User has not connected their Google Calendar yet',
          action: 'Connect calendar from Settings → Integrations'
        },
        { status: 400 }
      );
    }

    // Initialize Google Calendar API client
    let baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    baseUrl = baseUrl.replace(/\/$/, '');
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${baseUrl}/api/auth/google-calendar/callback`
    );

    // Set the credentials from the user's tokens
    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
      expiry_date: user.googleCalendarTokenExpiry ? new Date(user.googleCalendarTokenExpiry).getTime() : undefined
    });

    // Check if token needs refresh
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      if (credentials.access_token) {
        oauth2Client.setCredentials(credentials);
        // Update stored token if refreshed
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
      console.warn('Token refresh failed, continuing with current token', refreshError);
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Create the event object
    const event = {
      summary: task.title,
      description: task.description || `Task assigned by ${user.fullName}`,
      start: {
        dateTime: new Date(task.endDate || new Date()).toISOString(),
        timeZone: user.timezone || 'UTC'
      },
      end: {
        dateTime: new Date(new Date(task.endDate || new Date()).getTime() + 60 * 60 * 1000).toISOString(),
        timeZone: user.timezone || 'UTC'
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 30 } // 30 minutes before
        ]
      }
    };

    // Create the event
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event
    });

    // Store the event ID in the task
    if (response.data.id) {
      task.googleCalendarEventId = response.data.id;
      await task.save();
    }

    return NextResponse.json({
      success: true,
      message: 'Task synced to Google Calendar',
      eventId: response.data.id,
      eventLink: response.data.htmlLink
    });
  } catch (error: any) {
    console.error('Error syncing to Google Calendar:', error);
    
    // Handle token expiry
    if (error.message?.includes('invalid_grant') || error.message?.includes('Token has been revoked')) {
      if (session) {
        await connectDB();
        const user = await User.findById(session.user.id);
        if (user) {
          user.googleCalendarAccessToken = undefined;
          user.googleCalendarRefreshToken = undefined;
          user.googleCalendarTokenExpiry = undefined;
          await user.save();
        }
      }
      
      return NextResponse.json(
        { 
          error: 'Calendar token expired',
          message: 'Please reconnect your Google Calendar'
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to sync with Google Calendar' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string; taskId: string }> }
) {
  let session: any = null;
  try {
    session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { taskId } = await params;

    const task = await Task.findById(taskId);
    
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (!task.googleCalendarEventId) {
      return NextResponse.json(
        { error: 'Task not synced to Google Calendar' },
        { status: 400 }
      );
    }

    // Get the user (dietitian) to access their calendar
    const user = await User.findById(session.user.id);
    
    if (!user || !user.googleCalendarAccessToken) {
      // If no token, just remove from our database
      task.googleCalendarEventId = undefined;
      await task.save();
      
      return NextResponse.json({
        success: true,
        message: 'Task removed from database (Google Calendar token not available)'
      });
    }

    // Initialize Google Calendar API client
    let baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    baseUrl = baseUrl.replace(/\/$/, '');
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${baseUrl}/api/auth/google-calendar/callback`
    );

    // Set the credentials from the user's tokens
    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
      expiry_date: user.googleCalendarTokenExpiry ? new Date(user.googleCalendarTokenExpiry).getTime() : undefined
    });

    // Check if token needs refresh
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      if (credentials.access_token) {
        oauth2Client.setCredentials(credentials);
        // Update stored token if refreshed
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
      console.warn('Token refresh failed, continuing with current token', refreshError);
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Delete the event from Google Calendar
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: task.googleCalendarEventId
    });

    // Remove event ID from task
    task.googleCalendarEventId = undefined;
    await task.save();

    return NextResponse.json({
      success: true,
      message: 'Task removed from Google Calendar'
    });
  } catch (error: any) {
    console.error('Error removing from Google Calendar:', error);
    
    // Handle token expiry
    if (error.message?.includes('invalid_grant') || error.message?.includes('Token has been revoked')) {
      if (session) {
        await connectDB();
        const user = await User.findById(session.user.id);
        if (user) {
          user.googleCalendarAccessToken = undefined;
          user.googleCalendarRefreshToken = undefined;
          user.googleCalendarTokenExpiry = undefined;
          await user.save();
        }
      }
      
      return NextResponse.json(
        { 
          error: 'Calendar token expired',
          message: 'Please reconnect your Google Calendar'
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to remove from Google Calendar' },
      { status: 500 }
    );
  }
}

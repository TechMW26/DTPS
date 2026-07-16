import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/client/settings - Get user settings
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const user = await User.findById(session.user.id).select('settings').lean() as any;
    
    // Default settings
    const defaultSettings = {
      pushNotifications: true,
      emailNotifications: true,
      mealReminders: true,
      appointmentReminders: true,
      progressUpdates: false,
      darkMode: false,
      soundEnabled: true,
    };

    return NextResponse.json({
      success: true,
      settings: user?.settings || defaultSettings
    });

  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({
      error: 'Failed to fetch settings'
    }, { status: 500 });
  }
}

// PUT /api/client/settings - Update user settings
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { settings } = body;

    if (!settings) {
      return NextResponse.json({ error: 'Settings are required' }, { status: 400 });
    }

    await connectDB();

    // Update user settings
    const updatedUser = await User.findByIdAndUpdate(
      session.user.id,
      { $set: { settings } },
      { new: true }
    ).select('settings');

    // Handle specific settings actions
    if (settings.mealReminders !== undefined || settings.appointmentReminders !== undefined) {
      // Schedule/cancel reminders based on settings
      await handleReminderSettings(session.user.id, settings);
    }

    if (settings.pushNotifications !== undefined) {
      // Handle push notification subscription
      await handlePushNotificationSettings(session.user.id, settings.pushNotifications);
    }

    return NextResponse.json({
      success: true,
      settings: updatedUser?.settings || settings,
      message: 'Settings updated successfully'
    });

  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({
      error: 'Failed to update settings'
    }, { status: 500 });
  }
}

// Handle reminder settings
async function handleReminderSettings(userId: string, settings: any) {
  try {
    // If meal reminders enabled, schedule meal reminders
    if (settings.mealReminders) {
      // Store reminder preferences - these will be used by a cron job
      await User.findByIdAndUpdate(userId, {
        $set: {
          'reminderPreferences.mealReminders': true,
          'reminderPreferences.mealTimes': settings.mealTimes || ['8:00 AM', '1:00 PM', '7:00 PM']
        }
      });
    }

    // If appointment reminders enabled
    if (settings.appointmentReminders) {
      await User.findByIdAndUpdate(userId, {
        $set: {
          'reminderPreferences.appointmentReminders': true,
          'reminderPreferences.reminderBefore': settings.reminderBefore || 30 // 30 minutes before
        }
      });
    }
  } catch (error) {
    console.error('Error handling reminder settings:', error);
  }
}

// Handle push notification settings
async function handlePushNotificationSettings(userId: string, enabled: boolean) {
  try {
    await User.findByIdAndUpdate(userId, {
      $set: { 'pushNotificationEnabled': enabled }
    });
  } catch (error) {
    console.error('Error handling push notification settings:', error);
  }
}

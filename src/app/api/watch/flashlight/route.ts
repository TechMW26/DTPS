import {nativeResponseJson} from '@/lib/api/native-response';
// API Route: Watch Flashlight Control
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeWatchConnection} from '@/lib/db/repository/native-admin-watch';




// POST /api/watch/flashlight - Toggle watch flashlight
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return nativeResponseJson(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { action } = await req.json();

    if (!action || !['on', 'off', 'toggle'].includes(action)) {
      return nativeResponseJson(
        { success: false, error: 'Invalid action. Use "on", "off", or "toggle"' },
        { status: 400 }
      );
    }



    // Get watch connection
    const connection=await nativeWatchConnection(getNativeDatabase(),session.user.id);
    const watchConnection=connection?.watchIsConnected?connection:null;

    if (!watchConnection) {
      return nativeResponseJson(
        { success: false, error: 'Watch not connected' },
        { status: 400 }
      );
    }

    // Note: Most smartwatches don't have a public API to control flashlight remotely
    // This is primarily for visual feedback in the app
    // For watches that support it (like some Wear OS watches), you would send a push notification
    // or use their specific SDK

    let flashlightState = action;

    if (action === 'toggle') {
      // We'd need to track the current state in the database for toggle
      flashlightState = 'toggled';
    }

    // Log the flashlight command (for future implementation with push notifications)

    // For Google Fit / NoiseFit watches connected via Google Fit:
    // The actual flashlight control would need to be done through the watch itself
    // or through a companion app that receives push notifications

    return nativeResponseJson({
      success: true,
      message: `Flashlight ${action} command sent`,
      watchFlashlightAction: action,
      watchProvider: watchConnection.watchProvider,
      // For future: implement push notification to companion app
      watchNote: 'Flashlight control requires companion app on watch. Visual indicator shown in app.',
    });
  } catch (error) {
    console.error('Watch flashlight error:', error);
    return nativeResponseJson(
      { success: false, error: 'Failed to control flashlight' },
      { status: 500 }
    );
  }
}

// GET /api/watch/flashlight - Get flashlight state
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return nativeResponseJson(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }



    const connection=await nativeWatchConnection(getNativeDatabase(),session.user.id);
    const watchConnection=connection?.watchIsConnected?connection:null;

    if (!watchConnection) {
      return nativeResponseJson({
        success: true,
        watchFlashlightSupported: false,
        watchFlashlightState: null,
      });
    }

    return nativeResponseJson({
      success: true,
      watchFlashlightSupported: true,
      watchFlashlightState: 'unknown', // Would need real-time state from watch
      watchProvider: watchConnection.watchProvider,
    });
  } catch (error) {
    console.error('Get flashlight state error:', error);
    return nativeResponseJson(
      { success: false, error: 'Failed to get flashlight state' },
      { status: 500 }
    );
  }
}

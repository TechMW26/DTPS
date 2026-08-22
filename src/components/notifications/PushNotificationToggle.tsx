'use client';

import { useState } from 'react';
import { Bell, BellOff, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface PushNotificationToggleProps {
    className?: string;
    showTestButton?: boolean;
}

export function PushNotificationToggle({
    className = '',
    showTestButton = false,
}: PushNotificationToggleProps) {
    const {
        isSupported,
        permission,
        isRegistered,
        isLoading,
        error,
        requestPermission,
        registerToken,
        unregisterToken,
    } = usePushNotifications({ autoRegister: false });

    const [testLoading, setTestLoading] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);

    const handleToggle = async () => {
        if (isRegistered) {
            await unregisterToken();
        } else {
            if (permission !== 'granted') {
                const granted = await requestPermission();
                if (!granted) return;
            }
            await registerToken();
        }
    };

    const handleTestNotification = async () => {
        setTestLoading(true);
        setTestResult(null);

        try {
            const response = await fetch('/api/fcm/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'Test notification',
                    body: 'This is a test notification from DTPS!',
                }),
            });

            const data = await response.json();

            if (data.success) {
                setTestResult('Notification sent successfully!');
            } else {
                setTestResult(`Failed: ${data.error || 'Unknown error'}`);
            }
        } catch (err: any) {
            setTestResult(`Error: ${err.message}`);
        } finally {
            setTestLoading(false);
        }
    };

    if (!isSupported) {
        return (
            <div className={`flex items-center gap-2 text-gray-500 ${className}`}>
                <BellOff className="h-5 w-5" />
                <span className="text-sm">Push notifications not supported</span>
            </div>
        );
    }

    if (permission === 'denied') {
        return (
            <div className={`flex items-center gap-2 text-red-500 ${className}`}>
                <XCircle className="h-5 w-5" />
                <span className="text-sm">
                    Notifications blocked. Please enable in browser settings.
                </span>
            </div>
        );
    }

    return (
        <div className={`space-y-3 ${className}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {isRegistered ? (
                        <Bell className="h-5 w-5 text-green-600" />
                    ) : (
                        <BellOff className="h-5 w-5 text-gray-400" />
                    )}
                    <div>
                        <p className="font-medium">Push Notifications</p>
                        <p className="text-sm text-gray-500">
                            {isRegistered
                                ? 'You will receive push notifications'
                                : 'Enable to receive notifications'}
                        </p>
                    </div>
                </div>

                <Button
                    variant={isRegistered ? 'outline' : 'default'}
                    size="sm"
                    onClick={handleToggle}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isRegistered ? (
                        'Disable'
                    ) : (
                        'Enable'
                    )}
                </Button>
            </div>

            {error && (
                <p className="text-sm text-red-500">{error}</p>
            )}

            {showTestButton && isRegistered && (
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTestNotification}
                        disabled={testLoading}
                    >
                        {testLoading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Sending...
                            </>
                        ) : (
                            'Send Test Notification'
                        )}
                    </Button>

                    {testResult && (
                        <span className={`text-sm ${testResult.includes('success') ? 'text-green-600' : 'text-red-500'}`}>
                            {testResult.includes('success') && <CheckCircle2 className="inline h-4 w-4 mr-1" />}
                            {testResult}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

export default PushNotificationToggle;

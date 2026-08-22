'use client';

import { ReactNode } from 'react';
import SessionProvider from '@/components/providers/SessionProvider';
import { ClientAppLayout } from '@/components/layout/ClientAppLayout';
import { Toaster } from '@/components/ui/sonner';
import PushNotificationProvider from '@/components/providers/PushNotificationProvider';
import { ThemeProvider } from '@/contexts/ThemeContext';
import ServiceWorkerProvider from '@/components/providers/ServiceWorkerProvider';
import GlobalFetchInterceptor from '@/components/providers/GlobalFetchInterceptor';
import { SocketProvider } from '@/contexts/SocketContext';
import SystemRefreshListener from '@/components/providers/SystemRefreshListener';

interface ProvidersProps {
    children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
    return (
        <SessionProvider>
            <ServiceWorkerProvider />
            <GlobalFetchInterceptor />
            <SocketProvider>
                <SystemRefreshListener />
                <ThemeProvider>
                    <PushNotificationProvider autoRegister={true}>
                        <ClientAppLayout>
                            {children}
                        </ClientAppLayout>
                    </PushNotificationProvider>
                    <Toaster />
                </ThemeProvider>
            </SocketProvider>
        </SessionProvider>
    );
}

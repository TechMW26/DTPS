'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { socketClient, SocketClient } from '@/lib/realtime/socket-client';

interface SocketContextType {
    isConnected: boolean;
    client: SocketClient;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
    const { data: session, status } = useSession();
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (status !== 'authenticated' || !session?.user?.id) {
            socketClient.disconnect();
            setIsConnected(false);
            return;
        }

        // Connect when authenticated
        socketClient.connect();

        const onConnect = () => setIsConnected(true);
        const onDisconnect = () => setIsConnected(false);

        const unsub1 = socketClient.on('connect', onConnect);
        const unsub2 = socketClient.on('disconnect', onDisconnect);

        // Sync initial state
        setIsConnected(socketClient.connected);

        return () => {
            unsub1();
            unsub2();
            socketClient.disconnect();
            setIsConnected(false);
        };
    }, [status, session?.user?.id]);

    const value = useMemo(() => ({
        isConnected,
        client: socketClient,
    }), [isConnected]);

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
}

export function useSocket(): SocketContextType {
    const ctx = useContext(SocketContext);
    if (!ctx) throw new Error('useSocket must be used within a SocketProvider');
    return ctx;
}

/** Safe version that returns defaults when outside a provider. */
export function useSocketSafe(): SocketContextType {
    const ctx = useContext(SocketContext);
    return ctx || { isConnected: false, client: socketClient };
}

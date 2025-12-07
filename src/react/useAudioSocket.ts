import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseAudioSocketOptions {
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (error: Event) => void;
    onMessage?: (event: MessageEvent) => void;
}

export const useAudioSocket = (url: string, options: UseAudioSocketOptions = {}) => {
    const [state, setState] = useState<'connecting' | 'open' | 'closed' | 'error'>('closed');
    const socketRef = useRef<WebSocket | null>(null);

    const connect = useCallback(() => {
        if (socketRef.current) return;

        try {
            setState('connecting');
            const socket = new WebSocket(url);
            socket.binaryType = 'arraybuffer';

            socket.onopen = () => {
                setState('open');
                if (options.onOpen) options.onOpen();
            };

            socket.onclose = () => {
                setState('closed');
                socketRef.current = null;
                if (options.onClose) options.onClose();
            };

            socket.onerror = (error) => {
                setState('error');
                if (options.onError) options.onError(error);
            };

            socket.onmessage = (event) => {
                if (options.onMessage) options.onMessage(event);
            };

            socketRef.current = socket;
        } catch (e) {
            setState('error');
            console.error('WebSocket connection failed', e);
        }
    }, [url, options]);

    const disconnect = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.close();
            socketRef.current = null;
            setState('closed');
        }
    }, []);

    const send = useCallback((data: any) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(data);
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
    }, []);

    return {
        connect,
        disconnect,
        send,
        state,
        socket: socketRef.current
    };
};

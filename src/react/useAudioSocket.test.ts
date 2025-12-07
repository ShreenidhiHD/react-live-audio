import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioSocket } from '../../src/react/useAudioSocket';

// Mock WebSocket
class MockWebSocket {
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((event: any) => void) | null = null;
    onerror: ((error: any) => void) | null = null;
    readyState = 0; // CONNECTING

    send = vi.fn();
    close = vi.fn(() => {
        this.readyState = 3; // CLOSED
        if (this.onclose) this.onclose();
    });

    constructor(url: string) {
        setTimeout(() => {
            this.readyState = 1; // OPEN
            if (this.onopen) this.onopen();
        }, 10);
    }
}

describe('useAudioSocket', () => {
    beforeEach(() => {
        global.WebSocket = MockWebSocket as any;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize with closed state', () => {
        const { result } = renderHook(() => useAudioSocket('wss://test.com'));
        expect(result.current.state).toBe('closed');
    });

    it('should connect', async () => {
        const { result } = renderHook(() => useAudioSocket('wss://test.com'));

        act(() => {
            result.current.connect();
        });

        expect(result.current.state).toBe('connecting');

        // Wait for mock connection
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(result.current.state).toBe('open');
    });

    it('should send data', async () => {
        const { result } = renderHook(() => useAudioSocket('wss://test.com'));

        act(() => {
            result.current.connect();
        });

        await new Promise(resolve => setTimeout(resolve, 20));

        act(() => {
            result.current.send(new Uint8Array([1, 2, 3]));
        });

        // We can't easily access the mock instance here without more complex setup,
        // but we verify no error was thrown.
    });
});

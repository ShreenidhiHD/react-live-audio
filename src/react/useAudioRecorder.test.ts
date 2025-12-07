import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioRecorder } from '../../src/react/useAudioRecorder';

describe('useAudioRecorder', () => {
    it('should initialize with default state', () => {
        const { result } = renderHook(() => useAudioRecorder());

        expect(result.current.isRecording).toBe(false);
        expect(result.current.isPaused).toBe(false);
        expect(result.current.recordingTime).toBe(0);
    });

    it('should start recording', async () => {
        const { result } = renderHook(() => useAudioRecorder());

        await act(async () => {
            await result.current.start(() => { });
        });

        expect(result.current.isRecording).toBe(true);
    });

    it('should stop recording', async () => {
        const { result } = renderHook(() => useAudioRecorder());

        await act(async () => {
            await result.current.start(() => { });
        });

        act(() => {
            result.current.stop();
        });

        expect(result.current.isRecording).toBe(false);
    });
});

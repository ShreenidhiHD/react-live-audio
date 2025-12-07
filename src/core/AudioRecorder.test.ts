import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioRecorder } from '../../src/core/AudioRecorder';

describe('AudioRecorder', () => {
    let recorder: AudioRecorder;

    beforeEach(() => {
        recorder = new AudioRecorder({ sampleRate: 16000 });
        vi.clearAllMocks();
    });

    it('should initialize with default options', () => {
        expect(recorder).toBeDefined();
        expect((recorder as any).isRecording).toBe(false);
    });

    it('should start recording', async () => {
        const gumSpy = vi.spyOn(navigator.mediaDevices, 'getUserMedia');
        // We can't easily spy on the constructor directly without more complex setup,
        // so we'll check if the global was accessed or use a different approach.
        // For now, let's just check gumSpy.
        await recorder.start();
        expect(gumSpy).toHaveBeenCalled();
        expect((recorder as any).isRecording).toBe(true);
    });

    it('should stop recording', async () => {
        await recorder.start();
        recorder.stop();
        expect((recorder as any).isRecording).toBe(false);
    });

    it('should pause and resume', async () => {
        await recorder.start();
        recorder.pause();
        expect((recorder as any).isPaused).toBe(true);

        recorder.resume();
        expect((recorder as any).isPaused).toBe(false);
    });

    it('should initialize Opus encoder if requested', async () => {
        recorder = new AudioRecorder({ encoder: 'opus' });
        // Mock AudioEncoder constructor
        const encoderSpy = vi.spyOn(window as any, 'AudioEncoder').mockImplementation(() => {
            return {
                configure: vi.fn(),
                encode: vi.fn(),
                close: vi.fn(),
            };
        });
        await recorder.start();
        expect(encoderSpy).toHaveBeenCalled();
    });
});

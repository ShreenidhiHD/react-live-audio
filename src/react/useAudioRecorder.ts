import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioRecorder, AudioDataPayload } from '../core/AudioRecorder';

export interface UseAudioRecorderOptions {
    sampleRate?: number;
    audioConstraints?: MediaTrackConstraints;
    vadThreshold?: number;
    vadModelUrl?: string;
    bufferSize?: number;
    encoder?: 'pcm' | 'opus';
    keepBlob?: boolean;
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
    const [recordingTime, setRecordingTime] = useState(0);

    const chunksRef = useRef<(Int16Array | Uint8Array)[]>([]);
    const recorderRef = useRef<AudioRecorder | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimeRef = useRef<number>(0);
    const pausedTimeRef = useRef<number>(0);

    // We expose a method to set the socket or callback for data
    const start = useCallback(async (onData?: (payload: AudioDataPayload) => void) => {
        if (recorderRef.current) return;

        chunksRef.current = [];
        setRecordingBlob(null);
        setRecordingTime(0);
        pausedTimeRef.current = 0;

        // Default keepBlob logic: true for PCM, false for Opus (unless explicitly set)
        const shouldKeepBlob = options.keepBlob ?? (options.encoder !== 'opus');

        const recorder = new AudioRecorder({
            sampleRate: options.sampleRate,
            audioConstraints: options.audioConstraints,
            vadThreshold: options.vadThreshold,
            vadModelUrl: options.vadModelUrl,
            bufferSize: options.bufferSize,
            encoder: options.encoder,
            keepBlob: shouldKeepBlob,
            onDataAvailable: (payload) => {
                if (shouldKeepBlob) {
                    chunksRef.current.push(payload.data);
                }
                if (onData) onData(payload);
            },
            onVADChange: (speaking) => {
                setIsSpeaking(speaking);
            }
        });

        try {
            await recorder.start();
            recorderRef.current = recorder;
            setIsRecording(true);
            setIsPaused(false);
            startTimeRef.current = Date.now();

            timerRef.current = setInterval(() => {
                if (!pausedTimeRef.current) {
                    setRecordingTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
                }
            }, 1000);

        } catch (err) {
            console.error("Error starting recorder:", err);
        }
    }, [options.sampleRate, options.audioConstraints, options.vadThreshold]);

    const stop = useCallback(() => {
        if (recorderRef.current) {
            recorderRef.current.stop();
            recorderRef.current = null;
        }

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        setIsRecording(false);
        setIsPaused(false);
        setIsSpeaking(false);

        // Create Blob if we kept chunks
        if (chunksRef.current.length > 0) {
            if (options.encoder === 'opus') {
                // Raw Opus packets - user must handle container
                const blob = new Blob(chunksRef.current as any[], { type: 'audio/opus' });
                setRecordingBlob(blob);
            } else {
                // PCM - export WAV
                // We need to cast because chunksRef can hold Uint8Array but exportWAV expects Int16Array
                // In PCM mode, we know it's Int16Array
                const blob = AudioRecorder.exportWAV(chunksRef.current as Int16Array[], options.sampleRate);
                setRecordingBlob(blob);
            }
        } else {
            setRecordingBlob(null);
        }
    }, [options.encoder, options.sampleRate]);

    const pause = useCallback(() => {
        if (recorderRef.current && isRecording && !isPaused) {
            recorderRef.current.pause();
            setIsPaused(true);
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            // Store the duration so far
            pausedTimeRef.current = Date.now() - startTimeRef.current;
        }
    }, [isRecording, isPaused]);

    const resume = useCallback(() => {
        if (recorderRef.current && isRecording && isPaused) {
            recorderRef.current.resume();
            setIsPaused(false);

            // Adjust start time so the elapsed time continues correctly
            startTimeRef.current = Date.now() - pausedTimeRef.current;
            pausedTimeRef.current = 0;

            timerRef.current = setInterval(() => {
                setRecordingTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
            }, 1000);
        }
    }, [isRecording, isPaused]);

    useEffect(() => {
        return () => {
            if (recorderRef.current) {
                recorderRef.current.stop();
            }
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, []);

    const getVisualizerData = useCallback(() => {
        if (recorderRef.current) {
            return recorderRef.current.getFrequencies();
        }
        return new Float32Array(0);
    }, []);

    return {
        start,
        stop,
        pause,
        resume,
        isRecording,
        isPaused,
        isSpeaking,
        recordingBlob,
        recordingTime,
        getVisualizerData
    };
};

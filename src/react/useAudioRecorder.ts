
import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioRecorder, AudioDataPayload } from '../core/AudioRecorder';

export interface UseAudioRecorderOptions {
    sampleRate?: number;
    audioConstraints?: MediaTrackConstraints;
    vadThreshold?: number;
    vadModelUrl?: string;
    bufferSize?: number;
    encoder?: 'pcm' | 'opus';
}

export const useAudioRecorder = (options: UseAudioRecorderOptions = {}) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
    const [recordingTime, setRecordingTime] = useState(0);

    const recorderRef = useRef<AudioRecorder | null>(null);
    const chunksRef = useRef<(Int16Array | Uint8Array)[]>([]);
    const startTimeRef = useRef<number>(0);
    const pausedTimeRef = useRef<number>(0);
    const timerRef = useRef<any>(null);

    // We expose a method to set the socket or callback for data
    const start = useCallback(async (onData?: (payload: AudioDataPayload) => void) => {
        if (recorderRef.current) return;

        chunksRef.current = [];
        setRecordingBlob(null);
        setRecordingTime(0);
        pausedTimeRef.current = 0;

        const recorder = new AudioRecorder({
            sampleRate: options.sampleRate,
            audioConstraints: options.audioConstraints,
            vadThreshold: options.vadThreshold,
            vadModelUrl: options.vadModelUrl,
            bufferSize: options.bufferSize,
            encoder: options.encoder,
            onDataAvailable: (payload) => {
                chunksRef.current.push(payload.data);
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
            setIsRecording(false);
            setIsPaused(false);
            setIsSpeaking(false);

            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }

            let blob: Blob;
            if (options.encoder === 'opus') {
                // For Opus, chunks are Uint8Array packets. 
                // We can just blob them together, but usually they need a container (Ogg/WebM).
                // For simplicity in this raw lib, we just return the raw packets as a blob.
                // A real app would use a container muxer.
                blob = new Blob(chunksRef.current as any[], { type: 'audio/ogg' });
            } else {
                blob = AudioRecorder.exportWAV(chunksRef.current as Int16Array[], options.sampleRate);
            }
            setRecordingBlob(blob);
        }
    }, [options.sampleRate, options.encoder]);

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

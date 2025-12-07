
import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioRecorder } from '../core/AudioRecorder';

export interface UseAudioRecorderOptions {
    sampleRate?: number;
    audioConstraints?: MediaTrackConstraints;
    vadThreshold?: number;
}

export const useAudioRecorder = (options: UseAudioRecorderOptions = {}) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
    const [recordingTime, setRecordingTime] = useState(0);

    const recorderRef = useRef<AudioRecorder | null>(null);
    const chunksRef = useRef<Int16Array[]>([]);
    const startTimeRef = useRef<number>(0);
    const timerRef = useRef<any>(null);

    // We expose a method to set the socket or callback for data
    const start = useCallback(async (onData?: (data: Int16Array) => void) => {
        if (recorderRef.current) return;

        chunksRef.current = [];
        setRecordingBlob(null);
        setRecordingTime(0);

        const recorder = new AudioRecorder({
            sampleRate: options.sampleRate,
            audioConstraints: options.audioConstraints,
            vadThreshold: options.vadThreshold,
            onDataAvailable: (data) => {
                chunksRef.current.push(data);
                if (onData) onData(data);
            },
            onVADChange: (speaking) => {
                setIsSpeaking(speaking);
            }
        });

        try {
            await recorder.start();
            recorderRef.current = recorder;
            setIsRecording(true);
            startTimeRef.current = Date.now();

            timerRef.current = setInterval(() => {
                setRecordingTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
            }, 1000);

        } catch (err) {
            console.error("Error starting recorder:", err);
        }
    }, [options.sampleRate, options.audioConstraints]);

    const stop = useCallback(() => {
        if (recorderRef.current) {
            recorderRef.current.stop();
            recorderRef.current = null;
            setIsRecording(false);
            setIsSpeaking(false);

            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }

            const blob = AudioRecorder.exportWAV(chunksRef.current, options.sampleRate);
            setRecordingBlob(blob);
        }
    }, [options.sampleRate]);

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
        isRecording,
        isSpeaking,
        recordingBlob,
        recordingTime,
        getVisualizerData
    };
};

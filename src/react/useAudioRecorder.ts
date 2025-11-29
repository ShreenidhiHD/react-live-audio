
import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioRecorder } from '../core/AudioRecorder';

export interface UseAudioRecorderOptions {
    sampleRate?: number;
}

export const useAudioRecorder = (options: UseAudioRecorderOptions = {}) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const recorderRef = useRef<AudioRecorder | null>(null);

    // We expose a method to set the socket or callback for data
    const start = useCallback(async (onData?: (data: Int16Array) => void) => {
        if (recorderRef.current) return;

        const recorder = new AudioRecorder({
            sampleRate: options.sampleRate,
            onDataAvailable: (data) => {
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
        } catch (err) {
            console.error("Error starting recorder:", err);
        }
    }, [options.sampleRate]);

    const stop = useCallback(() => {
        if (recorderRef.current) {
            recorderRef.current.stop();
            recorderRef.current = null;
            setIsRecording(false);
            setIsSpeaking(false);
        }
    }, []);

    useEffect(() => {
        return () => {
            if (recorderRef.current) {
                recorderRef.current.stop();
            }
        };
    }, []);

    return {
        start,
        stop,
        isRecording,
        isSpeaking
    };
};

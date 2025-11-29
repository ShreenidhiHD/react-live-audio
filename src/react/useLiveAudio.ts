import { useState, useEffect, useRef, useCallback } from 'react';
import { AudioRecorder } from '../core/AudioRecorder';
import { AudioPlayer } from '../core/AudioPlayer';
import { TransportAdapter } from '../core/TransportAdapter';
import { unlockAudioContext } from '../core/BrowserUtils';

export type LiveAudioState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface UseLiveAudioOptions {
    transport: TransportAdapter;
    sampleRate?: number;
}

export const useLiveAudio = ({ transport, sampleRate = 24000 }: UseLiveAudioOptions) => {
    const [state, setState] = useState<LiveAudioState>('idle');
    const [frequencyData, setFrequencyData] = useState<Float32Array>(new Float32Array(0));
    const recorderRef = useRef<AudioRecorder | null>(null);
    const playerRef = useRef<AudioPlayer | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const start = useCallback(async () => {
        try {
            // 1. Setup AudioContext
            // We use the browser's native sample rate for the context to avoid issues, 
            // but we tell the recorder/player what our target rate is.
            const context = new AudioContext();
            audioContextRef.current = context;
            await unlockAudioContext(context);

            // 2. Setup Player
            const player = new AudioPlayer(context, sampleRate);
            playerRef.current = player;

            // 3. Setup Recorder
            const recorder = new AudioRecorder({
                sampleRate,
                onDataAvailable: (data) => {
                    transport.send(data);
                },
                onVADChange: (isSpeaking) => {
                    if (isSpeaking) {
                        setState('listening');
                        // Barge-In: Clear player
                        player.clear();
                        // Send cancel
                        transport.send({ type: 'cancel_response' });
                    } else {
                        setState('thinking');
                    }
                },
                onBargeIn: () => {
                    // Redundant if onVADChange handles it, but safe
                }
            });
            recorderRef.current = recorder;

            // 4. Connect Transport
            await transport.connect((data) => {
                // Received audio from AI
                if (data instanceof ArrayBuffer || data instanceof Int16Array) {
                    setState('speaking');
                    // Ensure data is Int16Array
                    const audioData = data instanceof Int16Array ? data : new Int16Array(data);
                    player.addAudio(audioData);
                }
            });

            await recorder.start();
            setState('listening'); // Initial state

            // Visualizer Loop
            const updateVisualizer = () => {
                if (recorderRef.current) {
                    const data = recorderRef.current.getFrequencies();
                    setFrequencyData(data);
                }
                animationFrameRef.current = requestAnimationFrame(updateVisualizer);
            };
            updateVisualizer();
        } catch (error) {
            console.error("Failed to start live audio:", error);
            setState('idle');
        }

    }, [transport, sampleRate]);

    const stop = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        recorderRef.current?.stop();
        playerRef.current?.clear();
        transport.disconnect();
        setState('idle');
    }, [transport]);

    useEffect(() => {
        return () => {
            stop();
        };
    }, [stop]);

    return {
        start,
        stop,
        state,
        frequencyData
    };
};

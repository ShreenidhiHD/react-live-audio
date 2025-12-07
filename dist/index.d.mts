interface AudioDataPayload {
    data: Int16Array;
    timestamp: number;
    sequence: number;
}
interface AudioRecorderOptions {
    sampleRate?: number;
    onDataAvailable?: (payload: AudioDataPayload) => void;
    onVADChange?: (isSpeaking: boolean) => void;
    audioConstraints?: MediaTrackConstraints;
    vadThreshold?: number;
    vadModelUrl?: string;
    bufferSize?: number;
}
declare class AudioRecorder {
    private context;
    private workletNode;
    private stream;
    private options;
    private isRecording;
    private isPaused;
    private analyser;
    private vadAdapter;
    private buffer;
    private sequenceNumber;
    constructor(options: AudioRecorderOptions);
    start(): Promise<void>;
    private emitData;
    stop(): void;
    pause(): void;
    resume(): void;
    private getWorkletUrl;
    getFrequencies(): Float32Array;
    /**
     * Converts an array of Int16Array chunks into a WAV Blob.
     * @param chunks The audio data chunks (Int16Array)
     * @param sampleRate The sample rate of the audio data (default 16000)
     * @returns A Blob containing the WAV file
     */
    static exportWAV(chunks: Int16Array[], sampleRate?: number): Blob;
    private static writeString;
}

interface UseAudioRecorderOptions {
    sampleRate?: number;
    audioConstraints?: MediaTrackConstraints;
    vadThreshold?: number;
    vadModelUrl?: string;
    bufferSize?: number;
}
declare const useAudioRecorder: (options?: UseAudioRecorderOptions) => {
    start: (onData?: (payload: AudioDataPayload) => void) => Promise<void>;
    stop: () => void;
    pause: () => void;
    resume: () => void;
    isRecording: boolean;
    isPaused: boolean;
    isSpeaking: boolean;
    recordingBlob: Blob | null;
    recordingTime: number;
    getVisualizerData: () => Float32Array<ArrayBufferLike>;
};

interface TransportAdapter {
    connect(onMessage: (data: any) => void): Promise<void>;
    send(data: any): void;
    disconnect(): void;
    onStateChange?: (state: 'connected' | 'connecting' | 'disconnected') => void;
}
declare abstract class BaseTransportAdapter implements TransportAdapter {
    protected state: 'connected' | 'connecting' | 'disconnected';
    onStateChange?: (state: 'connected' | 'connecting' | 'disconnected') => void;
    abstract connect(onMessage: (data: any) => void): Promise<void>;
    abstract send(data: any): void;
    abstract disconnect(): void;
    protected setState(newState: 'connected' | 'connecting' | 'disconnected'): void;
    protected withBackoff(fn: () => Promise<void>): Promise<void>;
}

type LiveAudioState = 'idle' | 'listening' | 'thinking' | 'speaking';
interface UseLiveAudioOptions {
    transport: TransportAdapter;
    sampleRate?: number;
}
declare const useLiveAudio: ({ transport, sampleRate }: UseLiveAudioOptions) => {
    start: () => Promise<void>;
    stop: () => void;
    state: LiveAudioState;
    frequencyData: Float32Array<ArrayBufferLike>;
};

declare class AudioPlayer {
    private context;
    private sampleRate;
    private nextStartTime;
    private scheduledSources;
    private readonly BUFFER_MS;
    constructor(context: AudioContext, sampleRate?: number);
    addAudio(data: Int16Array): void;
    clear(): void;
}

interface VADAdapter {
    process(audioFrame: Float32Array): Promise<boolean>;
    reset(): void;
}
declare class SileroVADAdapter implements VADAdapter {
    private modelUrl;
    private loaded;
    private session;
    private h;
    private c;
    private readonly sr;
    constructor(modelUrl: string);
    load(): Promise<void>;
    process(audioFrame: Float32Array): Promise<boolean>;
    reset(): void;
}

/**
 * Hook to get real-time frequency data for visualization.
 * @param getVisualizerData Function that returns the current frequency data (Float32Array).
 * @returns The current frequency data as a Float32Array.
 */
declare const useAudioVisualizer: (getVisualizerData: () => Float32Array) => Float32Array<ArrayBufferLike>;

export { AudioPlayer, AudioRecorder, type AudioRecorderOptions, BaseTransportAdapter, type LiveAudioState, SileroVADAdapter, type TransportAdapter, type UseAudioRecorderOptions, type UseLiveAudioOptions, type VADAdapter, useAudioRecorder, useAudioVisualizer, useLiveAudio };

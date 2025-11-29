interface UseAudioRecorderOptions {
    sampleRate?: number;
}
declare const useAudioRecorder: (options?: UseAudioRecorderOptions) => {
    start: (onData?: (data: Int16Array) => void) => Promise<void>;
    stop: () => void;
    isRecording: boolean;
    isSpeaking: boolean;
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

interface AudioRecorderOptions {
    sampleRate?: number;
    onDataAvailable?: (data: Int16Array) => void;
    onVADChange?: (isSpeaking: boolean) => void;
    onBargeIn?: () => void;
}
declare class AudioRecorder {
    private context;
    private workletNode;
    private stream;
    private options;
    private isRecording;
    private analyser;
    constructor(options: AudioRecorderOptions);
    start(): Promise<void>;
    stop(): void;
    private getWorkletUrl;
    getFrequencies(): Float32Array;
}

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

export { AudioPlayer, AudioRecorder, type AudioRecorderOptions, BaseTransportAdapter, type LiveAudioState, SileroVADAdapter, type TransportAdapter, type UseAudioRecorderOptions, type UseLiveAudioOptions, type VADAdapter, useAudioRecorder, useLiveAudio };

interface UseAudioRecorderOptions {
    sampleRate?: number;
}
declare const useAudioRecorder: (options?: UseAudioRecorderOptions) => {
    start: (onData?: (data: Int16Array) => void) => Promise<void>;
    stop: () => void;
    isRecording: boolean;
    isSpeaking: boolean;
};

interface AudioRecorderOptions {
    sampleRate?: number;
    onDataAvailable?: (data: Int16Array) => void;
    onVADChange?: (isSpeaking: boolean) => void;
}
declare class AudioRecorder {
    private context;
    private workletNode;
    private stream;
    private options;
    private isRecording;
    constructor(options: AudioRecorderOptions);
    start(): Promise<void>;
    stop(): void;
    private getWorkletUrl;
}

export { AudioRecorder, type AudioRecorderOptions, type UseAudioRecorderOptions, useAudioRecorder };

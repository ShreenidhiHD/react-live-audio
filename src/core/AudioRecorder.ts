
import { WORKLET_CODE } from '../worklet/AudioProcessorString';

export interface AudioRecorderOptions {
    sampleRate?: number;
    onDataAvailable?: (data: Int16Array) => void;
    onVADChange?: (isSpeaking: boolean) => void;
    audioConstraints?: MediaTrackConstraints;
    vadThreshold?: number;
}

export class AudioRecorder {
    private context: AudioContext | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private stream: MediaStream | null = null;
    private options: AudioRecorderOptions;
    private isRecording = false;
    private isPaused = false;
    private analyser: AnalyserNode | null = null;

    constructor(options: AudioRecorderOptions) {
        this.options = options;
    }

    async start() {
        if (this.isRecording) return;
        this.isPaused = false;

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: this.options.audioConstraints ?? {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            // Create AudioContext with desired sample rate if supported, otherwise default
            // Note: We resample in the worklet, so we can let the context run at native rate (usually 44.1 or 48k)
            // to avoid hardware resampling issues.
            this.context = new AudioContext();

            await this.context.resume();

            // Load the worklet
            // TODO: This needs to be replaced with the actual Blob URL or file path in the final build
            // For now, we assume a specific path or we will inject it.
            // We'll use a helper method to get the worklet URL.
            const workletUrl = this.getWorkletUrl();
            await this.context.audioWorklet.addModule(workletUrl);

            const source = this.context.createMediaStreamSource(this.stream);
            this.workletNode = new AudioWorkletNode(this.context, 'audio-processor');

            // Send initial config
            if (this.options.vadThreshold !== undefined) {
                this.workletNode.port.postMessage({
                    type: 'CONFIG',
                    vadThreshold: this.options.vadThreshold
                });
            }

            // Visualizer Support
            this.analyser = this.context.createAnalyser();
            this.analyser.fftSize = 256;
            source.connect(this.analyser);

            this.workletNode.port.onmessage = (event) => {
                const { type, data } = event.data;

                if (type === 'AUDIO_DATA') {
                    if (!this.isPaused && this.options.onDataAvailable) {
                        this.options.onDataAvailable(new Int16Array(data));
                    }
                } else if (type === 'VAD_START') {
                    if (this.options.onVADChange) {
                        this.options.onVADChange(true);
                    }
                } else if (type === 'VAD_END') {
                    if (this.options.onVADChange) {
                        this.options.onVADChange(false);
                    }
                }
            };

            source.connect(this.workletNode);
            // We don't connect to destination to avoid feedback loop (hearing yourself)

            this.isRecording = true;
        } catch (error) {
            console.error('Failed to start recording:', error);
            throw error;
        }
    }

    stop() {
        if (!this.isRecording) return;

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }

        if (this.context) {
            this.context.close();
            this.context = null;
        }

        this.isRecording = false;
        this.isPaused = false;
    }

    pause() {
        if (this.isRecording) {
            this.isPaused = true;
            this.context?.suspend();
        }
    }

    resume() {
        if (this.isRecording && this.isPaused) {
            this.isPaused = false;
            this.context?.resume();
        }
    }

    // This is the magic part where we will inject the worker code
    private getWorkletUrl(): string {
        const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
        return URL.createObjectURL(blob);
    }

    getFrequencies(): Float32Array {
        if (!this.analyser) return new Float32Array(0);
        const data = new Float32Array(this.analyser.frequencyBinCount);
        this.analyser.getFloatFrequencyData(data);
        return data;
    }

    /**
     * Converts an array of Int16Array chunks into a WAV Blob.
     * @param chunks The audio data chunks (Int16Array)
     * @param sampleRate The sample rate of the audio data (default 16000)
     * @returns A Blob containing the WAV file
     */
    static exportWAV(chunks: Int16Array[], sampleRate: number = 16000): Blob {
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const buffer = new ArrayBuffer(44 + totalLength * 2);
        const view = new DataView(buffer);

        // RIFF chunk descriptor
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + totalLength * 2, true);
        this.writeString(view, 8, 'WAVE');

        // fmt sub-chunk
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
        view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
        view.setUint16(22, 1, true); // NumChannels (1 for Mono)
        view.setUint32(24, sampleRate, true); // SampleRate
        view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
        view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
        view.setUint16(34, 16, true); // BitsPerSample

        // data sub-chunk
        this.writeString(view, 36, 'data');
        view.setUint32(40, totalLength * 2, true);

        // Write PCM samples
        let offset = 44;
        for (const chunk of chunks) {
            for (let i = 0; i < chunk.length; i++) {
                view.setInt16(offset, chunk[i], true);
                offset += 2;
            }
        }

        return new Blob([view], { type: 'audio/wav' });
    }

    private static writeString(view: DataView, offset: number, string: string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
}

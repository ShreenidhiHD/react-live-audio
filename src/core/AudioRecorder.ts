
import { WORKLET_CODE } from '../worklet/AudioProcessorString';

export interface AudioRecorderOptions {
    sampleRate?: number;
    onDataAvailable?: (data: Int16Array) => void;
    onVADChange?: (isSpeaking: boolean) => void;
    onBargeIn?: () => void;
}

export class AudioRecorder {
    private context: AudioContext | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private stream: MediaStream | null = null;
    private options: AudioRecorderOptions;
    private isRecording = false;
    private analyser: AnalyserNode | null = null;

    constructor(options: AudioRecorderOptions) {
        this.options = options;
    }

    async start() {
        if (this.isRecording) return;

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
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

            // Visualizer Support
            this.analyser = this.context.createAnalyser();
            this.analyser.fftSize = 256;
            source.connect(this.analyser);

            this.workletNode.port.onmessage = (event) => {
                const { type, data } = event.data;

                if (type === 'AUDIO_DATA') {
                    if (this.options.onDataAvailable) {
                        this.options.onDataAvailable(new Int16Array(data));
                    }
                } else if (type === 'VAD_START') {
                    if (this.options.onVADChange) {
                        this.options.onVADChange(true);
                    }
                    if (this.options.onBargeIn) {
                        this.options.onBargeIn();
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
}

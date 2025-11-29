
// We need to declare this to satisfy TypeScript in the worklet scope
declare class AudioWorkletProcessor {
    port: MessagePort;
    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

declare function registerProcessor(name: string, processorCtor: any): void;

class AudioProcessor extends AudioWorkletProcessor {

    private readonly targetSampleRate = 16000;
    private readonly vadThreshold = 0.01; // Adjustable threshold
    private readonly vadHangoverFrames = 10; // ~100-200ms depending on chunk size
    private vadHangoverCounter = 0;
    private isSpeaking = false;

    constructor() {
        super();
        this.port.onmessage = (event) => {
            if (event.data.type === 'CONFIG') {
                // Handle configuration updates if needed
            }
        };
    }

    process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const input = inputs[0];
        if (!input || input.length === 0) return true;

        const channelData = input[0]; // Mono audio

        // 1. Resample to 16kHz
        // We assume the input sample rate is available via global scope or passed in. 
        // In AudioWorklet, sampleRate is a global variable.
        // @ts-ignore
        const currentSampleRate = sampleRate;
        const resampledData = this.resample(channelData, currentSampleRate, this.targetSampleRate);

        // 2. VAD Logic
        const isCurrentlySpeaking = this.detectVoice(resampledData);

        if (isCurrentlySpeaking) {
            this.vadHangoverCounter = this.vadHangoverFrames;
            if (!this.isSpeaking) {
                this.isSpeaking = true;
                this.port.postMessage({ type: 'VAD_START' });
            }
        } else {
            if (this.vadHangoverCounter > 0) {
                this.vadHangoverCounter--;
            } else if (this.isSpeaking) {
                this.isSpeaking = false;
                this.port.postMessage({ type: 'VAD_END' });
            }
        }

        // 3. Convert to Int16 and Send
        // Only send if we want to stream silence or if speaking. 
        // Usually for real-time AI, we might want to send everything or just speech.
        // Let's send everything but mark it with VAD status, or let the main thread decide.
        // For now, we stream everything to keep it simple and let the server handle silence if needed,
        // BUT the user asked to "Don't stream silence". 
        // So we will only send data if isSpeaking or hangover is active.

        if (this.isSpeaking || this.vadHangoverCounter > 0) {
            const int16Data = this.floatTo16BitPCM(resampledData);
            this.port.postMessage({ type: 'AUDIO_DATA', data: int16Data.buffer }, [int16Data.buffer]);
        }

        return true;
    }

    private resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
        if (fromRate === toRate) return input;

        const ratio = fromRate / toRate;
        const newLength = Math.round(input.length / ratio);
        const result = new Float32Array(newLength);

        for (let i = 0; i < newLength; i++) {
            const originalIndex = i * ratio;
            const index1 = Math.floor(originalIndex);
            const index2 = Math.min(index1 + 1, input.length - 1);
            const weight = originalIndex - index1;

            // Linear interpolation
            result[i] = input[index1] * (1 - weight) + input[index2] * weight;
        }

        return result;
    }

    private detectVoice(data: Float32Array): boolean {
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
            sumSquares += data[i] * data[i];
        }
        const rms = Math.sqrt(sumSquares / data.length);
        return rms > this.vadThreshold;
    }

    private floatTo16BitPCM(input: Float32Array): Int16Array {
        const output = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return output;
    }
}

registerProcessor('audio-processor', AudioProcessor);

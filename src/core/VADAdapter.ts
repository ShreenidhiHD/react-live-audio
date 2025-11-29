import * as ort from 'onnxruntime-web';

export interface VADAdapter {
    process(audioFrame: Float32Array): Promise<boolean>;
    reset(): void;
}

export class SileroVADAdapter implements VADAdapter {
    private loaded = false;
    private session: ort.InferenceSession | null = null;
    private h: ort.Tensor | null = null;
    private c: ort.Tensor | null = null;
    private readonly sr: ort.Tensor;

    constructor(private modelUrl: string) {
        this.sr = new ort.Tensor('int64', new BigInt64Array([16000n]));
    }

    async load() {
        if (this.loaded) return;
        try {
            this.session = await ort.InferenceSession.create(this.modelUrl);
            this.reset();
            this.loaded = true;
        } catch (e) {
            console.error("Failed to load VAD model", e);
        }
    }

    async process(audioFrame: Float32Array): Promise<boolean> {
        if (!this.loaded || !this.session || !this.h || !this.c) {
            // Fallback to energy check if model not loaded
            let sum = 0;
            for (let i = 0; i < audioFrame.length; i++) {
                sum += audioFrame[i] * audioFrame[i];
            }
            return Math.sqrt(sum / audioFrame.length) > 0.02;
        }

        const input = new ort.Tensor('float32', audioFrame, [1, audioFrame.length]);

        const feeds: Record<string, ort.Tensor> = {
            input: input,
            sr: this.sr,
            h: this.h,
            c: this.c
        };

        const results = await this.session.run(feeds);

        // Update states
        this.h = results.hn;
        this.c = results.cn;

        const output = results.output;
        const probability = output.data[0] as number;

        return probability > 0.5;
    }

    reset() {
        // Reset internal state (RNN states) for Silero (2, 1, 64)
        const zeros = new Float32Array(2 * 1 * 64).fill(0);
        this.h = new ort.Tensor('float32', zeros, [2, 1, 64]);
        this.c = new ort.Tensor('float32', zeros, [2, 1, 64]);
    }
}

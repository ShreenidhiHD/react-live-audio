export class AudioPlayer {
    private context: AudioContext;
    private sampleRate: number;
    private nextStartTime: number = 0;
    private scheduledSources: AudioBufferSourceNode[] = [];
    private readonly BUFFER_MS = 40; // 40ms initial buffer

    constructor(context: AudioContext, sampleRate: number = 24000) {
        this.context = context;
        this.sampleRate = sampleRate;
    }

    addAudio(data: Int16Array) {
        const float32 = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) {
            float32[i] = data[i] / 32768; // 0x8000
        }

        const buffer = this.context.createBuffer(1, float32.length, this.sampleRate);
        buffer.copyToChannel(float32, 0);

        const currentTime = this.context.currentTime;

        // Jitter Buffer Logic:
        // If we are starving (nextStartTime < currentTime), add safety buffer
        if (this.nextStartTime < currentTime) {
            this.nextStartTime = currentTime + (this.BUFFER_MS / 1000);
        }

        // Elastic Logic:
        // Calculate latency
        const latency = this.nextStartTime - currentTime;
        let playbackRate = 1.0;
        if (latency > 0.2) { // If > 200ms latency, speed up
            playbackRate = 1.05;
        }

        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = playbackRate;
        source.connect(this.context.destination);
        source.start(this.nextStartTime);

        this.scheduledSources.push(source);

        // Cleanup finished sources
        source.onended = () => {
            const index = this.scheduledSources.indexOf(source);
            if (index > -1) {
                this.scheduledSources.splice(index, 1);
            }
        };

        this.nextStartTime += buffer.duration / playbackRate;
    }

    clear() {
        this.scheduledSources.forEach(source => {
            try {
                source.stop();
            } catch (e) {
                // ignore
            }
        });
        this.scheduledSources = [];
        this.nextStartTime = 0;
    }
}

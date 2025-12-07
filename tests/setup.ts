import { vi } from 'vitest';

// Mock AudioContext
class MockAudioContext {
    state = 'suspended';
    audioWorklet = {
        addModule: vi.fn().mockResolvedValue(undefined),
    };

    createMediaStreamSource() {
        return {
            connect: vi.fn(),
            disconnect: vi.fn(),
        };
    }

    createAnalyser() {
        return {
            connect: vi.fn(),
            disconnect: vi.fn(),
            frequencyBinCount: 128,
            getFloatFrequencyData: vi.fn(),
        };
    }

    resume() {
        this.state = 'running';
        return Promise.resolve();
    }

    suspend() {
        this.state = 'suspended';
        return Promise.resolve();
    }

    close() {
        this.state = 'closed';
        return Promise.resolve();
    }
}

// Mock AudioWorkletNode
class MockAudioWorkletNode {
    port = {
        postMessage: vi.fn(),
        onmessage: null,
    };

    constructor() { }

    connect() { }
    disconnect() { }
}

// Mock AudioEncoder (WebCodecs)
class MockAudioEncoder {
    static isTypeSupported = vi.fn().mockReturnValue(true);

    configure = vi.fn();
    encode = vi.fn();
    close = vi.fn();

    constructor(init: any) {
        // Store callbacks if needed
    }
}

// Mock MediaStream
class MockMediaStream {
    getTracks() {
        return [{
            stop: vi.fn(),
        }];
    }
}

// Assign to global window
Object.defineProperty(window, 'AudioContext', {
    writable: true,
    value: MockAudioContext,
});

Object.defineProperty(window, 'AudioWorkletNode', {
    writable: true,
    value: MockAudioWorkletNode,
});

// Force AudioWorklet on window for feature detection
Object.defineProperty(window, 'AudioWorklet', {
    writable: true,
    value: {},
});

Object.defineProperty(window, 'AudioEncoder', {
    writable: true,
    value: MockAudioEncoder,
});

// Mock navigator.mediaDevices.getUserMedia
Object.defineProperty(navigator, 'mediaDevices', {
    writable: true,
    value: {
        getUserMedia: vi.fn().mockResolvedValue(new MockMediaStream()),
    },
});

// Mock URL.createObjectURL
URL.createObjectURL = vi.fn();

console.log('Setup complete. AudioContext:', !!window.AudioContext, 'AudioWorklet:', !!window.AudioWorklet);

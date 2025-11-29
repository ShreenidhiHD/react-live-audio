'use strict';

var react = require('react');

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/worklet/AudioProcessorString.ts
var WORKLET_CODE = `
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(0);
    this.targetSampleRate = 16000;
    this.vadThreshold = 0.01;
    this.vadHangoverFrames = 10;
    this.vadHangoverCounter = 0;
    this.isSpeaking = false;
    
    this.port.onmessage = (event) => {
      if (event.data.type === 'CONFIG') {
        // Handle config
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0];
    
    // Resample
    // AudioWorklet global scope has sampleRate
    const currentSampleRate = sampleRate;
    const resampledData = this.resample(channelData, currentSampleRate, this.targetSampleRate);

    // VAD
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

    if (this.isSpeaking || this.vadHangoverCounter > 0) {
       const int16Data = this.floatTo16BitPCM(resampledData);
       this.port.postMessage({ type: 'AUDIO_DATA', data: int16Data.buffer }, [int16Data.buffer]);
    }

    return true;
  }

  resample(input, fromRate, toRate) {
    if (fromRate === toRate) return input;
    
    const ratio = fromRate / toRate;
    const newLength = Math.round(input.length / ratio);
    const result = new Float32Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
      const originalIndex = i * ratio;
      const index1 = Math.floor(originalIndex);
      const index2 = Math.min(index1 + 1, input.length - 1);
      const weight = originalIndex - index1;
      
      result[i] = input[index1] * (1 - weight) + input[index2] * weight;
    }
    
    return result;
  }

  detectVoice(data) {
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      sumSquares += data[i] * data[i];
    }
    const rms = Math.sqrt(sumSquares / data.length);
    return rms > this.vadThreshold;
  }

  floatTo16BitPCM(input) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }
}

registerProcessor('audio-processor', AudioProcessor);
`;

// src/core/AudioRecorder.ts
var AudioRecorder = class {
  constructor(options) {
    __publicField(this, "context", null);
    __publicField(this, "workletNode", null);
    __publicField(this, "stream", null);
    __publicField(this, "options");
    __publicField(this, "isRecording", false);
    this.options = options;
  }
  async start() {
    if (this.isRecording) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.context = new AudioContext();
      await this.context.resume();
      const workletUrl = this.getWorkletUrl();
      await this.context.audioWorklet.addModule(workletUrl);
      const source = this.context.createMediaStreamSource(this.stream);
      this.workletNode = new AudioWorkletNode(this.context, "audio-processor");
      this.workletNode.port.onmessage = (event) => {
        const { type, data } = event.data;
        if (type === "AUDIO_DATA") {
          if (this.options.onDataAvailable) {
            this.options.onDataAvailable(new Int16Array(data));
          }
        } else if (type === "VAD_START") {
          if (this.options.onVADChange) {
            this.options.onVADChange(true);
          }
        } else if (type === "VAD_END") {
          if (this.options.onVADChange) {
            this.options.onVADChange(false);
          }
        }
      };
      source.connect(this.workletNode);
      this.isRecording = true;
    } catch (error) {
      console.error("Failed to start recording:", error);
      throw error;
    }
  }
  stop() {
    if (!this.isRecording) return;
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
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
  getWorkletUrl() {
    const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
    return URL.createObjectURL(blob);
  }
};

// src/react/useAudioRecorder.ts
var useAudioRecorder = (options = {}) => {
  const [isRecording, setIsRecording] = react.useState(false);
  const [isSpeaking, setIsSpeaking] = react.useState(false);
  const recorderRef = react.useRef(null);
  const start = react.useCallback(async (onData) => {
    if (recorderRef.current) return;
    const recorder = new AudioRecorder({
      sampleRate: options.sampleRate,
      onDataAvailable: (data) => {
        if (onData) onData(data);
      },
      onVADChange: (speaking) => {
        setIsSpeaking(speaking);
      }
    });
    try {
      await recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.error("Error starting recorder:", err);
    }
  }, [options.sampleRate]);
  const stop = react.useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
      setIsRecording(false);
      setIsSpeaking(false);
    }
  }, []);
  react.useEffect(() => {
    return () => {
      if (recorderRef.current) {
        recorderRef.current.stop();
      }
    };
  }, []);
  return {
    start,
    stop,
    isRecording,
    isSpeaking
  };
};

exports.AudioRecorder = AudioRecorder;
exports.useAudioRecorder = useAudioRecorder;
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map
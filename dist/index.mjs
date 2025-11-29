import { useState, useRef, useCallback, useEffect } from 'react';
import * as ort from 'onnxruntime-web';

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
    this.vadHangoverCounter = 0;
    this.isSpeaking = false;
    this.speakingFrames = 0;
    
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
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.speakingFrames = 0;
        this.port.postMessage({ type: 'VAD_START' });
      }
      this.speakingFrames += 1;
      this.vadHangoverCounter = this.calculateHangover(this.speakingFrames);
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
      // Soft-clip limiter
      const s = Math.tanh(input[i]);
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }

  calculateHangover(speakingFrames) {
    // Assuming ~128 samples per chunk at 16kHz = 8ms
    // 2 seconds = 250 chunks
    if (speakingFrames > 250) {
      return 187; // ~1.5s
    }
    return 62; // ~500ms
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
    __publicField(this, "analyser", null);
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
      this.context = new AudioContext();
      await this.context.resume();
      const workletUrl = this.getWorkletUrl();
      await this.context.audioWorklet.addModule(workletUrl);
      const source = this.context.createMediaStreamSource(this.stream);
      this.workletNode = new AudioWorkletNode(this.context, "audio-processor");
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
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
          if (this.options.onBargeIn) {
            this.options.onBargeIn();
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
  getFrequencies() {
    if (!this.analyser) return new Float32Array(0);
    const data = new Float32Array(this.analyser.frequencyBinCount);
    this.analyser.getFloatFrequencyData(data);
    return data;
  }
};

// src/react/useAudioRecorder.ts
var useAudioRecorder = (options = {}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recorderRef = useRef(null);
  const start = useCallback(async (onData) => {
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
  const stop = useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
      setIsRecording(false);
      setIsSpeaking(false);
    }
  }, []);
  useEffect(() => {
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

// src/core/AudioPlayer.ts
var AudioPlayer = class {
  // 40ms initial buffer
  constructor(context, sampleRate = 24e3) {
    __publicField(this, "context");
    __publicField(this, "sampleRate");
    __publicField(this, "nextStartTime", 0);
    __publicField(this, "scheduledSources", []);
    __publicField(this, "BUFFER_MS", 40);
    this.context = context;
    this.sampleRate = sampleRate;
  }
  addAudio(data) {
    const float32 = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      float32[i] = data[i] / 32768;
    }
    const buffer = this.context.createBuffer(1, float32.length, this.sampleRate);
    buffer.copyToChannel(float32, 0);
    const currentTime = this.context.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + this.BUFFER_MS / 1e3;
    }
    const latency = this.nextStartTime - currentTime;
    let playbackRate = 1;
    if (latency > 0.2) {
      playbackRate = 1.05;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    source.connect(this.context.destination);
    source.start(this.nextStartTime);
    this.scheduledSources.push(source);
    source.onended = () => {
      const index = this.scheduledSources.indexOf(source);
      if (index > -1) {
        this.scheduledSources.splice(index, 1);
      }
    };
    this.nextStartTime += buffer.duration / playbackRate;
  }
  clear() {
    this.scheduledSources.forEach((source) => {
      try {
        source.stop();
      } catch (e) {
      }
    });
    this.scheduledSources = [];
    this.nextStartTime = 0;
  }
};

// src/core/BrowserUtils.ts
var unlockAudioContext = async (context) => {
  if (context.state === "running") return;
  const unlock = () => {
    const buffer = context.createBuffer(1, 1, 22050);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0);
    if (context.state !== "running") {
      context.resume();
    }
    document.removeEventListener("click", unlock);
    document.removeEventListener("touchstart", unlock);
    document.removeEventListener("keydown", unlock);
  };
  document.addEventListener("click", unlock);
  document.addEventListener("touchstart", unlock);
  document.addEventListener("keydown", unlock);
};

// src/react/useLiveAudio.ts
var useLiveAudio = ({ transport, sampleRate = 24e3 }) => {
  const [state, setState] = useState("idle");
  const [frequencyData, setFrequencyData] = useState(new Float32Array(0));
  const recorderRef = useRef(null);
  const playerRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationFrameRef = useRef(null);
  const start = useCallback(async () => {
    try {
      const context = new AudioContext();
      audioContextRef.current = context;
      await unlockAudioContext(context);
      const player = new AudioPlayer(context, sampleRate);
      playerRef.current = player;
      const recorder = new AudioRecorder({
        sampleRate,
        onDataAvailable: (data) => {
          transport.send(data);
        },
        onVADChange: (isSpeaking) => {
          if (isSpeaking) {
            setState("listening");
            player.clear();
            transport.send({ type: "cancel_response" });
          } else {
            setState("thinking");
          }
        },
        onBargeIn: () => {
        }
      });
      recorderRef.current = recorder;
      await transport.connect((data) => {
        if (data instanceof ArrayBuffer || data instanceof Int16Array) {
          setState("speaking");
          const audioData = data instanceof Int16Array ? data : new Int16Array(data);
          player.addAudio(audioData);
        }
      });
      await recorder.start();
      setState("listening");
      const updateVisualizer = () => {
        if (recorderRef.current) {
          const data = recorderRef.current.getFrequencies();
          setFrequencyData(data);
        }
        animationFrameRef.current = requestAnimationFrame(updateVisualizer);
      };
      updateVisualizer();
    } catch (error) {
      console.error("Failed to start live audio:", error);
      setState("idle");
    }
  }, [transport, sampleRate]);
  const stop = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    recorderRef.current?.stop();
    playerRef.current?.clear();
    transport.disconnect();
    setState("idle");
  }, [transport]);
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);
  return {
    start,
    stop,
    state,
    frequencyData
  };
};

// src/core/TransportAdapter.ts
var BaseTransportAdapter = class {
  constructor() {
    __publicField(this, "state", "disconnected");
    __publicField(this, "onStateChange");
  }
  setState(newState) {
    this.state = newState;
    if (this.onStateChange) {
      this.onStateChange(newState);
    }
  }
  // Exponential Backoff Reconnection Logic
  async withBackoff(fn) {
    let attempt = 0;
    while (true) {
      try {
        this.setState("connecting");
        await fn();
        this.setState("connected");
        return;
      } catch (e) {
        attempt++;
        this.setState("disconnected");
        const delay = attempt === 1 ? 200 : Math.min(500 * Math.pow(2, attempt - 2), 1e4);
        console.warn(`Connection failed, retrying in ${delay}ms...`, e);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
};
var SileroVADAdapter = class {
  constructor(modelUrl) {
    this.modelUrl = modelUrl;
    __publicField(this, "loaded", false);
    __publicField(this, "session", null);
    __publicField(this, "h", null);
    __publicField(this, "c", null);
    __publicField(this, "sr");
    this.sr = new ort.Tensor("int64", new BigInt64Array([16000n]));
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
  async process(audioFrame) {
    if (!this.loaded || !this.session || !this.h || !this.c) {
      let sum = 0;
      for (let i = 0; i < audioFrame.length; i++) {
        sum += audioFrame[i] * audioFrame[i];
      }
      return Math.sqrt(sum / audioFrame.length) > 0.02;
    }
    const input = new ort.Tensor("float32", audioFrame, [1, audioFrame.length]);
    const feeds = {
      input,
      sr: this.sr,
      h: this.h,
      c: this.c
    };
    const results = await this.session.run(feeds);
    this.h = results.hn;
    this.c = results.cn;
    const output = results.output;
    const probability = output.data[0];
    return probability > 0.5;
  }
  reset() {
    const zeros = new Float32Array(2 * 1 * 64).fill(0);
    this.h = new ort.Tensor("float32", zeros, [2, 1, 64]);
    this.c = new ort.Tensor("float32", zeros, [2, 1, 64]);
  }
};

export { AudioPlayer, AudioRecorder, BaseTransportAdapter, SileroVADAdapter, useAudioRecorder, useLiveAudio };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map
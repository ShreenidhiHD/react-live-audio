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
        if (event.data.vadThreshold !== undefined) {
          this.vadThreshold = event.data.vadThreshold;
        }
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

// src/core/AudioRecorder.ts
var AudioRecorder = class {
  constructor(options) {
    __publicField(this, "context", null);
    __publicField(this, "workletNode", null);
    __publicField(this, "stream", null);
    __publicField(this, "options");
    __publicField(this, "isRecording", false);
    __publicField(this, "isPaused", false);
    __publicField(this, "analyser", null);
    __publicField(this, "vadAdapter", null);
    // Buffering state
    __publicField(this, "buffer", new Int16Array(0));
    __publicField(this, "sequenceNumber", 0);
    this.options = options;
    if (options.vadModelUrl) {
      this.vadAdapter = new SileroVADAdapter(options.vadModelUrl);
    }
  }
  async start() {
    if (this.isRecording) return;
    this.isPaused = false;
    this.buffer = new Int16Array(0);
    this.sequenceNumber = 0;
    try {
      if (this.vadAdapter) {
        await this.vadAdapter.load();
      }
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: this.options.audioConstraints ?? {
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
      if (this.options.vadThreshold !== void 0) {
        this.workletNode.port.postMessage({
          type: "CONFIG",
          vadThreshold: this.options.vadThreshold
        });
      }
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
      this.workletNode.port.onmessage = async (event) => {
        const { type, data } = event.data;
        if (type === "AUDIO_DATA") {
          if (!this.isPaused) {
            const int16Data = new Int16Array(data);
            if (this.options.bufferSize && this.options.bufferSize > 0) {
              const newBuffer = new Int16Array(this.buffer.length + int16Data.length);
              newBuffer.set(this.buffer);
              newBuffer.set(int16Data, this.buffer.length);
              this.buffer = newBuffer;
              while (this.buffer.length >= this.options.bufferSize) {
                const chunk = this.buffer.slice(0, this.options.bufferSize);
                this.buffer = this.buffer.slice(this.options.bufferSize);
                this.emitData(chunk);
              }
            } else {
              this.emitData(int16Data);
            }
            if (this.vadAdapter) {
              const float32Data = new Float32Array(int16Data.length);
              for (let i = 0; i < int16Data.length; i++) {
                float32Data[i] = int16Data[i] / 32768;
              }
              const isSpeaking = await this.vadAdapter.process(float32Data);
              if (this.options.onVADChange) {
                this.options.onVADChange(isSpeaking);
              }
            }
          }
        } else if (type === "VAD_START") {
          if (!this.vadAdapter && this.options.onVADChange) {
            this.options.onVADChange(true);
          }
        } else if (type === "VAD_END") {
          if (!this.vadAdapter && this.options.onVADChange) {
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
  emitData(data) {
    if (this.options.onDataAvailable) {
      this.options.onDataAvailable({
        data,
        timestamp: Date.now(),
        sequence: this.sequenceNumber++
      });
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
  /**
   * Converts an array of Int16Array chunks into a WAV Blob.
   * @param chunks The audio data chunks (Int16Array)
   * @param sampleRate The sample rate of the audio data (default 16000)
   * @returns A Blob containing the WAV file
   */
  static exportWAV(chunks, sampleRate = 16e3) {
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const buffer = new ArrayBuffer(44 + totalLength * 2);
    const view = new DataView(buffer);
    this.writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + totalLength * 2, true);
    this.writeString(view, 8, "WAVE");
    this.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    this.writeString(view, 36, "data");
    view.setUint32(40, totalLength * 2, true);
    let offset = 44;
    for (const chunk of chunks) {
      for (let i = 0; i < chunk.length; i++) {
        view.setInt16(offset, chunk[i], true);
        offset += 2;
      }
    }
    return new Blob([view], { type: "audio/wav" });
  }
  static writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
};

// src/react/useAudioRecorder.ts
var useAudioRecorder = (options = {}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startTimeRef = useRef(0);
  const pausedTimeRef = useRef(0);
  const timerRef = useRef(null);
  const start = useCallback(async (onData) => {
    if (recorderRef.current) return;
    chunksRef.current = [];
    setRecordingBlob(null);
    setRecordingTime(0);
    pausedTimeRef.current = 0;
    const recorder = new AudioRecorder({
      sampleRate: options.sampleRate,
      audioConstraints: options.audioConstraints,
      vadThreshold: options.vadThreshold,
      vadModelUrl: options.vadModelUrl,
      bufferSize: options.bufferSize,
      onDataAvailable: (payload) => {
        chunksRef.current.push(payload.data);
        if (onData) onData(payload);
      },
      onVADChange: (speaking) => {
        setIsSpeaking(speaking);
      }
    });
    try {
      await recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setIsPaused(false);
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        if (!pausedTimeRef.current) {
          setRecordingTime(Math.floor((Date.now() - startTimeRef.current) / 1e3));
        }
      }, 1e3);
    } catch (err) {
      console.error("Error starting recorder:", err);
    }
  }, [options.sampleRate, options.audioConstraints, options.vadThreshold]);
  const stop = useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
      setIsRecording(false);
      setIsPaused(false);
      setIsSpeaking(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const blob = AudioRecorder.exportWAV(chunksRef.current, options.sampleRate);
      setRecordingBlob(blob);
    }
  }, [options.sampleRate]);
  const pause = useCallback(() => {
    if (recorderRef.current && isRecording && !isPaused) {
      recorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      pausedTimeRef.current = Date.now() - startTimeRef.current;
    }
  }, [isRecording, isPaused]);
  const resume = useCallback(() => {
    if (recorderRef.current && isRecording && isPaused) {
      recorderRef.current.resume();
      setIsPaused(false);
      startTimeRef.current = Date.now() - pausedTimeRef.current;
      pausedTimeRef.current = 0;
      timerRef.current = setInterval(() => {
        setRecordingTime(Math.floor((Date.now() - startTimeRef.current) / 1e3));
      }, 1e3);
    }
  }, [isRecording, isPaused]);
  useEffect(() => {
    return () => {
      if (recorderRef.current) {
        recorderRef.current.stop();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);
  const getVisualizerData = useCallback(() => {
    if (recorderRef.current) {
      return recorderRef.current.getFrequencies();
    }
    return new Float32Array(0);
  }, []);
  return {
    start,
    stop,
    pause,
    resume,
    isRecording,
    isPaused,
    isSpeaking,
    recordingBlob,
    recordingTime,
    getVisualizerData
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
var useAudioVisualizer = (getVisualizerData) => {
  const [data, setData] = useState(new Float32Array(0));
  const animationFrameRef = useRef(null);
  useEffect(() => {
    const loop = () => {
      const newData = getVisualizerData();
      setData(newData);
      animationFrameRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [getVisualizerData]);
  return data;
};

export { AudioPlayer, AudioRecorder, BaseTransportAdapter, SileroVADAdapter, useAudioRecorder, useAudioVisualizer, useLiveAudio };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map
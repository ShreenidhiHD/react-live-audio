
// This file contains the stringified version of the AudioWorkletProcessor.
// In a real build pipeline, this would be generated automatically.
// For now, we manually transpile the TS to JS and embed it.

export const WORKLET_CODE = `
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

# react-live-audio

A robust React hook for real-time audio streaming with AudioWorklet, Voice Activity Detection (VAD), Resampling, and Visualization.

## Features

- 🎙️ **Real-time Audio Streaming**: Efficiently captures audio using AudioWorklet.
- 🗣️ **Voice Activity Detection (VAD)**: Detects when the user is speaking with configurable sensitivity.
- 🔄 **Resampling**: Automatically handles sample rate conversion (e.g., to 16kHz for AI models).
- 💾 **Encoding & Playback**: Export recordings as WAV blobs for easy playback.
- 📊 **Visualization**: Real-time frequency data hook for creating audio visualizers.
- 🎛️ **Advanced Config**: Control echo cancellation, noise suppression, and VAD threshold.
- ⚛️ **React Hook**: Easy-to-use `useAudioRecorder` and `useAudioVisualizer` hooks.
- 📦 **Lightweight**: Minimal dependencies.

## Installation

```bash
npm install react-live-audio
# or
yarn add react-live-audio
# or
pnpm add react-live-audio
```

## Usage

### Basic Recording

```tsx
import React from 'react';
import { useAudioRecorder } from 'react-live-audio';

const AudioApp = () => {
  const { start, stop, isRecording, isSpeaking, recordingBlob } = useAudioRecorder({
    sampleRate: 16000, // Default is 16kHz
  });

  const handleStart = async () => {
    await start((data) => {
      // data is an Int16Array of audio samples
      // Send to WebSocket or process here
    });
  };

  return (
    <div>
      <p>Status: {isRecording ? 'Recording' : 'Idle'}</p>
      <p>VAD: {isSpeaking ? '🗣️ Speaking' : '🤫 Silent'}</p>
      
      <button onClick={handleStart} disabled={isRecording}>Start</button>
      <button onClick={stop} disabled={!isRecording}>Stop</button>
      
      {recordingBlob && (
        <audio controls src={URL.createObjectURL(recordingBlob)} />
      )}
    </div>
  );
};
```

### Visualization

```tsx
import React, { useRef, useEffect } from 'react';
import { useAudioRecorder, useAudioVisualizer } from 'react-live-audio';

const Visualizer = () => {
  const { start, stop, getVisualizerData } = useAudioRecorder();
  const frequencyData = useAudioVisualizer(getVisualizerData);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Draw your visualization using frequencyData (Float32Array)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // ... drawing logic ...
  }, [frequencyData]);

  return (
    <div>
      <button onClick={() => start()}>Start</button>
      <canvas ref={canvasRef} />
    </div>
  );
};
```

## API Reference

### `useAudioRecorder(options)`

#### Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `sampleRate` | `number` | `16000` | Target sample rate for output audio. |
| `vadThreshold` | `number` | `0.01` | Sensitivity for Voice Activity Detection (0.0 to 1.0). |
| `vadModelUrl` | `string` | `undefined` | URL to Silero VAD ONNX model for AI-based detection. |
| `bufferSize` | `number` | `0` | Size of audio chunks in samples. 0 = immediate. |
| `audioConstraints` | `MediaTrackConstraints` | `{ echoCancellation: true, ... }` | Constraints passed to `getUserMedia`. |

#### Returns

| Property | Type | Description |
|----------|------|-------------|
| `start` | `(onData?) => Promise<void>` | Starts recording. Optional callback receives `Int16Array` chunks. |
| `stop` | `() => void` | Stops recording and finalizes the blob. |
| `pause` | `() => void` | Pauses the recording. |
| `resume` | `() => void` | Resumes the recording. |
| `isRecording` | `boolean` | Current recording state. |
| `isPaused` | `boolean` | Current paused state. |
| `isSpeaking` | `boolean` | Current VAD state. |
| `recordingBlob` | `Blob \| null` | The recorded audio as a WAV blob (available after stop). |
| `recordingTime` | `number` | Duration of the current recording in seconds. |
| `getVisualizerData` | `() => Float32Array` | Function to get current frequency data. |

### Advanced Usage

#### AI-Powered VAD (Silero)

To use the AI-based VAD instead of the default energy-based one, provide a URL to the Silero ONNX model.

```tsx
useAudioRecorder({
  vadModelUrl: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.19/dist/silero_vad.onnx"
});
```

#### Buffer Control & Metadata

Control the size of the audio chunks and receive metadata (timestamp, sequence number).

```tsx
useAudioRecorder({
  bufferSize: 4096, // e.g., 4096 samples per chunk
});

// The start callback now receives a payload object
start((payload) => {
  const { data, timestamp, sequence } = payload;
  console.log(`Chunk #${sequence} at ${timestamp}: ${data.length} samples`);
});
```

### `useAudioVisualizer(getVisualizerData)`

Hook that drives an animation loop to fetch frequency data.

#### Arguments

- `getVisualizerData`: The function returned from `useAudioRecorder`.

#### Returns

- `Float32Array`: Real-time frequency data for visualization.

# React Live Audio 🎙️

**🔥 Real-Time Audio Engine for React**
*(Streaming + VAD + PCM/Opus + Visualization)*

> **⚠️ Note:** This is an advanced audio engine, not just a simple recorder. It uses modern browser APIs (AudioWorklet, WebCodecs) which may have varying support across browsers (especially Safari/iOS).

A robust, headless React hook for real-time audio processing. Designed for Voice AI, streaming, and advanced audio applications.

## 🌟 Features

- **⚡ Low Latency**: Uses `AudioWorklet` for non-blocking audio processing.
- **🧠 AI & Energy VAD**: Built-in energy detection + support for **Silero VAD** (ONNX).
- **📦 Smart Buffering**: Control buffer size and metadata (sequence, timestamps).
- **🎼 Multi-Format**: Raw **PCM** (Int16) or compressed **Opus** (WebCodecs).
- **📊 Visualization**: Real-time frequency data hook.
- **🔌 Streaming Ready**: WebSocket helper and chunk-based architecture.

## 🥊 Why use this?

| Feature | react-live-audio | Standard Recorders |
| :--- | :--- | :--- |
| **Focus** | Real-time Streaming / AI | Saving WAV files |
| **Latency** | Ultra-low (Worklet) | High (MediaRecorder) |
| **VAD** | Advanced (AI/Energy) | None / Basic |
| **Encoding** | PCM / Opus (WebCodecs) | WAV / MP3 |
| **Complexity** | High (Engine) | Low (Widget) |
- 🎛️ **Advanced Config**: Control echo cancellation, noise suppression, and VAD threshold.
- ⚛️ **React Hook**: Easy-to-use `useAudioRecorder` and `useAudioVisualizer` hooks.
- 📦 **Lightweight**: Minimal dependencies.
- 🌐 **Browser Support**: Works in modern browsers (Chrome, Edge, Firefox, Safari). Opus encoding requires Chrome/Edge/Safari 16.4+.

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
    await start((payload) => {
      // payload.data is Int16Array or Uint8Array
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
| `encoder` | `'pcm' \| 'opus'` | `'pcm'` | Audio encoding format. 'opus' uses WebCodecs. |
| `audioConstraints` | `MediaTrackConstraints` | `{ echoCancellation: true, ... }` | Constraints passed to `getUserMedia`. |

#### Returns

| Property | Type | Description |
| :--- | :--- | :--- |
| `start(onData?)` | `fn` | Start recording. Optional callback for real-time data. |
| `stop()` | `fn` | Stop recording and finalize Blob (if `keepBlob` is true). |
| `pause() / resume()` | `fn` | Pause/Resume recording. |
| `isRecording` | `boolean` | Current recording state. |
| `isSpeaking` | `boolean` | VAD status (true when user is talking). |
| `recordingBlob` | `Blob` | Final recording (WAV for PCM, Raw packets for Opus). |
| `recordingTime` | `number` | Duration of current recording in ms. |
| `getVisualizerData` | `fn` | Returns `Float32Array` of frequency data for visualization. |

## 🌐 Browser Support & Fallbacks

This library uses advanced browser APIs.

| Feature | Chrome / Edge | Firefox | Safari (iOS) | Fallback Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **AudioWorklet** | ✅ Supported | ✅ Supported | ✅ Supported | Throws Error (Secure Context required) |
| **WebCodecs (Opus)** | ✅ Supported | ⚠️ Partial | ❌ Not Supported | **Auto-falls back to PCM** |
| **Silero VAD** | ✅ Supported | ✅ Supported | ✅ Supported | **Falls back to Energy VAD** |

> **Note on Opus**: If `encoder: 'opus'` is used on a browser without WebCodecs (like iOS Safari), the library will automatically fall back to `pcm` encoding and log a warning. The `onDataAvailable` payload will indicate `encoding: 'pcm'`.

## 🧠 AI Integration

### Streaming to OpenAI / Gemini
Use `encoder: 'pcm'` and `sampleRate: 24000` (Gemini) or `16000` (OpenAI).

```typescript
start((payload) => {
  // payload.data is Int16Array (PCM)
  // Convert to Base64 and send via WebSocket
});
```

### Using Silero VAD
Download the ONNX model and serve it from your public folder.

```typescript
useAudioRecorder({
  vadModelUrl: '/silero_vad.onnx', // Path to your model
  onVADChange: (isSpeaking) => console.log('User is:', isSpeaking ? '🗣️' : '🤫')
});
```

### `useAudioSocket(url, options)`

A helper hook for WebSocket streaming.

```tsx
import { useAudioSocket } from 'react-live-audio';

const { connect, disconnect, send, state } = useAudioSocket('wss://your-server.com', {
  onOpen: () => console.log('Connected'),
  onMessage: (event) => console.log('Message:', event.data),
  onError: (error) => console.error('Error:', error),
  onClose: () => console.log('Closed')
});

// Usage with recorder
start((payload) => {
  if (state === 'open') {
    send(payload.data);
  }
});
```

### `useAudioVisualizer(getVisualizerData)`

Hook that drives an animation loop to fetch frequency data.

#### Arguments

- `getVisualizerData`: The function returned from `useAudioRecorder`.

#### Returns

- `Float32Array`: Real-time frequency data for visualization.

# react-live-audio

A robust React hook for real-time audio streaming with AudioWorklet, Voice Activity Detection (VAD), and Resampling.

## Features

- 🎙️ **Real-time Audio Streaming**: Efficiently captures audio using AudioWorklet.
- 🗣️ **Voice Activity Detection (VAD)**: Detects when the user is speaking.
- 🔄 **Resampling**: Automatically handles sample rate conversion (e.g., to 16kHz for AI models).
- ⚛️ **React Hook**: Easy-to-use `useAudioRecorder` hook.
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

Here is a simple example of how to use the `useAudioRecorder` hook in your React application.

```tsx
import React, { useEffect } from 'react';
import { useAudioRecorder } from 'react-live-audio';

const AudioApp = () => {
  const { start, stop, isRecording, isSpeaking } = useAudioRecorder({
    sampleRate: 16000, // Default is 16kHz, suitable for most AI models like OpenAI/Gemini
  });

  const handleStart = async () => {
    await start((data) => {
      // data is an Int16Array of audio samples
      console.log("Received audio chunk:", data.length);
      // You can send this data to your backend or WebSocket here
    });
  };

  return (
    <div>
      <h1>Live Audio Recorder</h1>
      <p>Status: {isRecording ? 'Recording' : 'Idle'}</p>
      <p>VAD: {isSpeaking ? '🗣️ Speaking' : '🤫 Silent'}</p>
      
      <button onClick={handleStart} disabled={isRecording}>
        Start Recording
      </button>
      <button onClick={stop} disabled={!isRecording}>
        Stop Recording
      </button>
    </div>
  );
};

export default AudioApp;
```

## API Reference

### `useAudioRecorder(options)`

#### Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `sampleRate` | `number` | `undefined` | The desired sample rate for the output audio (e.g., 16000). If not provided, it uses the system's default sample rate, but the internal worklet usually defaults to 16kHz if configured. |

#### Returns

| Property | Type | Description |
|----------|------|-------------|
| `start` | `(onData?: (data: Int16Array) => void) => Promise<void>` | Starts the recording. Accepts an optional callback that receives audio chunks as `Int16Array`. |
| `stop` | `() => void` | Stops the recording and releases resources. |
| `isRecording` | `boolean` | `true` if currently recording, `false` otherwise. |
| `isSpeaking` | `boolean` | `true` if voice activity is detected, `false` otherwise. |


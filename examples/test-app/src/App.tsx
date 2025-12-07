import { useState, useEffect, useRef } from 'react';
import { useAudioRecorder, useAudioVisualizer, useAudioSocket } from 'react-live-audio';

function App() {
    const [echoCancellation, setEchoCancellation] = useState(true);
    const [noiseSuppression, setNoiseSuppression] = useState(true);
    const [vadThreshold, setVadThreshold] = useState(0.01);
    const [useAiVad, setUseAiVad] = useState(false);
    const [bufferSize, setBufferSize] = useState(0);
    const [useOpus, setUseOpus] = useState(false);

    // Example socket usage (mock URL)
    const { connect, disconnect, send, state: socketState } = useAudioSocket('wss://echo.websocket.org');

    const {
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
    } = useAudioRecorder({
        sampleRate: 16000,
        audioConstraints: {
            echoCancellation,
            noiseSuppression
        },
        vadThreshold,
        vadModelUrl: useAiVad ? "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.19/dist/silero_vad.onnx" : undefined,
        bufferSize,
        encoder: useOpus ? 'opus' : 'pcm'
    });

    const frequencyData = useAudioVisualizer(getVisualizerData);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const handleStart = async () => {
        // Connect socket if not open
        if (socketState === 'closed') connect();

        await start((payload) => {
            // Payload contains { data, timestamp, sequence, encoding }
            // console.log(`Chunk #${payload.sequence} (${payload.encoding}): ${payload.data.length} bytes`);

            // Send to socket if open
            if (socketState === 'open') {
                send(payload.data);
            }
        });
    };

    const handleStop = () => {
        stop();
        disconnect();
    };

    const handlePause = () => {
        pause();
    };

    const handleResume = () => {
        resume();
    };

    useEffect(() => {
        if (recordingBlob && audioRef.current) {
            const url = URL.createObjectURL(recordingBlob);
            audioRef.current.src = url;
        }
    }, [recordingBlob]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (frequencyData.length === 0) return;

        const barWidth = (canvas.width / frequencyData.length) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < frequencyData.length; i++) {
            barHeight = (frequencyData[i] + 140) * 2; // Normalize roughly
            if (barHeight < 0) barHeight = 0;

            ctx.fillStyle = `rgb(${barHeight + 100}, 50, 50)`;
            ctx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight / 2);

            x += barWidth + 1;
        }
    }, [frequencyData]);

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
            <h1>React Live Audio Test</h1>

            <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #eee', borderRadius: '8px' }}>
                <h3>Settings</h3>
                <label style={{ display: 'block', marginBottom: '10px' }}>
                    <input
                        type="checkbox"
                        checked={echoCancellation}
                        onChange={(e) => setEchoCancellation(e.target.checked)}
                        disabled={isRecording}
                    />
                    Echo Cancellation
                </label>
                <label style={{ display: 'block', marginBottom: '10px' }}>
                    <input
                        type="checkbox"
                        checked={noiseSuppression}
                        onChange={(e) => setNoiseSuppression(e.target.checked)}
                        disabled={isRecording}
                    />
                    Noise Suppression
                </label>
                <label style={{ display: 'block', marginBottom: '10px' }}>
                    <input
                        type="checkbox"
                        checked={useAiVad}
                        onChange={(e) => setUseAiVad(e.target.checked)}
                        disabled={isRecording}
                    />
                    Use AI VAD (Silero)
                </label>
                <label style={{ display: 'block', marginBottom: '10px' }}>
                    <input
                        type="checkbox"
                        checked={useOpus}
                        onChange={(e) => setUseOpus(e.target.checked)}
                        disabled={isRecording}
                    />
                    Use Opus Encoding (WebCodecs)
                </label>
                <label style={{ display: 'block', marginBottom: '10px' }}>
                    VAD Threshold: {vadThreshold}
                    <input
                        type="range"
                        min="0.001"
                        max="0.1"
                        step="0.001"
                        value={vadThreshold}
                        onChange={(e) => setVadThreshold(parseFloat(e.target.value))}
                        style={{ width: '100%', display: 'block' }}
                    />
                </label>
                <label style={{ display: 'block' }}>
                    Buffer Size (samples): {bufferSize}
                    <select
                        value={bufferSize}
                        onChange={(e) => setBufferSize(parseInt(e.target.value))}
                        disabled={isRecording}
                        style={{ marginLeft: '10px' }}
                    >
                        <option value={0}>Default (Immediate)</option>
                        <option value={2048}>2048 (~128ms)</option>
                        <option value={4096}>4096 (~256ms)</option>
                        <option value={16000}>16000 (1s)</option>
                    </select>
                </label>
            </div>

            <div style={{ marginBottom: '20px' }}>
                <p>Socket State: {socketState}</p>
            </div>

            <div style={{ marginBottom: '20px' }}>
                <button
                    onClick={handleStart}
                    disabled={isRecording}
                    style={{
                        padding: '10px 20px',
                        marginRight: '10px',
                        backgroundColor: isRecording ? '#ccc' : '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isRecording ? 'not-allowed' : 'pointer'
                    }}
                >
                    Start
                </button>
                <button
                    onClick={handleStop}
                    disabled={!isRecording}
                    style={{
                        padding: '10px 20px',
                        marginRight: '10px',
                        backgroundColor: !isRecording ? '#ccc' : '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: !isRecording ? 'not-allowed' : 'pointer'
                    }}
                >
                    Stop
                </button>

                {isRecording && !isPaused && (
                    <button
                        onClick={handlePause}
                        style={{
                            padding: '10px 20px',
                            marginRight: '10px',
                            backgroundColor: '#ffc107',
                            color: 'black',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Pause
                    </button>
                )}

                {isRecording && isPaused && (
                    <button
                        onClick={handleResume}
                        style={{
                            padding: '10px 20px',
                            marginRight: '10px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Resume
                    </button>
                )}
            </div>

            <div style={{ marginBottom: '20px', fontSize: '1.2em' }}>
                <div style={{ marginBottom: '10px' }}>
                    <strong>Status:</strong> {isRecording ? (isPaused ? '⏸️ Paused' : '🔴 Recording') : 'Idle'}
                </div>
                <div style={{ marginBottom: '10px' }}>
                    <strong>Time:</strong> {recordingTime}s
                </div>
                <div>
                    <strong>VAD:</strong> {isSpeaking ? '🗣️ Speaking' : '🤫 Silent'}
                </div>
            </div>

            <div style={{ marginBottom: '20px', border: '1px solid #ccc', borderRadius: '4px', overflow: 'hidden' }}>
                <canvas
                    ref={canvasRef}
                    width={600}
                    height={100}
                    style={{ width: '100%', height: '100px', display: 'block', backgroundColor: '#000' }}
                />
            </div>

            {recordingBlob && (
                <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                    <h3>Last Recording</h3>
                    <p>Size: {(recordingBlob.size / 1024).toFixed(2)} KB</p>
                    <audio ref={audioRef} controls style={{ width: '100%' }} />
                </div>
            )}
        </div>
    );
}

export default App;

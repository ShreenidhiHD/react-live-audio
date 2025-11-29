
import { useRef } from 'react';
import { useAudioRecorder } from 'react-live-audio';

function App() {
    const audioChunksRef = useRef<Int16Array[]>([]);
    const { start, stop, isRecording, isSpeaking } = useAudioRecorder({ sampleRate: 16000 });

    const handleStart = async () => {
        audioChunksRef.current = [];
        await start((data) => {
            // Collect data to playback later
            audioChunksRef.current.push(data);
        });
    };

    const handleStop = () => {
        stop();
        // Create a blob from the recorded chunks to play back
        // Note: Int16Array needs to be converted to a playable format (WAV) or played via AudioContext.
        // For simple verification, we can just log the data size.
        console.log('Recorded chunks:', audioChunksRef.current.length);

        // To play it back, we'd need a WAV header or use AudioContext.
        // For this test, let's just show we got data.
        const totalLength = audioChunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
        alert(`Recorded ${totalLength} samples. Check console for details.`);
    };

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
            <h1>React Live Audio Test</h1>
            <div style={{ marginBottom: '20px' }}>
                <button onClick={handleStart} disabled={isRecording}>
                    Start Recording
                </button>
                <button onClick={handleStop} disabled={!isRecording} style={{ marginLeft: '10px' }}>
                    Stop Recording
                </button>
            </div>

            <div>
                <strong>Status:</strong> {isRecording ? 'Recording' : 'Idle'}
            </div>
            <div>
                <strong>VAD:</strong> {isSpeaking ? 'Speaking' : 'Silent'}
            </div>
        </div>
    );
}

export default App;

export const unlockAudioContext = async (context: AudioContext) => {
    if (context.state === 'running') return;

    const unlock = () => {
        // Create a short silent buffer
        const buffer = context.createBuffer(1, 1, 22050);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.start(0);

        if (context.state !== 'running') {
            context.resume();
        }

        // Remove listeners once triggered
        document.removeEventListener('click', unlock);
        document.removeEventListener('touchstart', unlock);
        document.removeEventListener('keydown', unlock);
    };

    // Listen for any interaction
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
    document.addEventListener('keydown', unlock);
};

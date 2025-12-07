import { useState, useEffect, useRef } from 'react';

/**
 * Hook to get real-time frequency data for visualization.
 * @param getVisualizerData Function that returns the current frequency data (Float32Array).
 * @returns The current frequency data as a Float32Array.
 */
export const useAudioVisualizer = (getVisualizerData: () => Float32Array) => {
    const [data, setData] = useState<Float32Array>(new Float32Array(0));
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
        const loop = () => {
            const newData = getVisualizerData();
            // We always update to keep the animation smooth, even if zeros
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

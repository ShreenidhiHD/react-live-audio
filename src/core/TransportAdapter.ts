export interface TransportAdapter {
    connect(onMessage: (data: any) => void): Promise<void>;
    send(data: any): void;
    disconnect(): void;
    onStateChange?: (state: 'connected' | 'connecting' | 'disconnected') => void;
}

export abstract class BaseTransportAdapter implements TransportAdapter {
    protected state: 'connected' | 'connecting' | 'disconnected' = 'disconnected';
    public onStateChange?: (state: 'connected' | 'connecting' | 'disconnected') => void;

    abstract connect(onMessage: (data: any) => void): Promise<void>;
    abstract send(data: any): void;
    abstract disconnect(): void;

    protected setState(newState: 'connected' | 'connecting' | 'disconnected') {
        this.state = newState;
        if (this.onStateChange) {
            this.onStateChange(newState);
        }
    }

    // Exponential Backoff Reconnection Logic
    protected async withBackoff(fn: () => Promise<void>) {
        let attempt = 0;
        while (true) {
            try {
                this.setState('connecting');
                await fn();
                this.setState('connected');
                return;
            } catch (e) {
                attempt++;
                this.setState('disconnected'); // Or 'reconnecting'

                // Wait 200ms, 500ms, 1s...
                const delay = attempt === 1 ? 200 : Math.min(500 * Math.pow(2, attempt - 2), 10000);

                console.warn(`Connection failed, retrying in ${delay}ms...`, e);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
}

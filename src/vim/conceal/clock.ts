/** One replaceable reveal deadline per editor; stale callbacks cannot win. */
export class RevealClock {
    private timer: number | null = null;
    private generation = 0;

    private readonly window: Window;
    constructor(hostWindow: Window = window) {
        this.window = hostWindow;
    }

    schedule(delay: number, reveal: () => void): void {
        this.cancel();
        const generation = this.generation;
        this.timer = this.window.setTimeout(() => {
            if (generation !== this.generation) return;
            this.timer = null;
            reveal();
        }, delay);
    }

    cancel(): void {
        this.generation++;
        if (this.timer !== null) this.window.clearTimeout(this.timer);
        this.timer = null;
    }
}

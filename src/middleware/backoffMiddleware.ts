import type { Request, Response, NextFunction } from "express";

type Counter = {
    active: number;
};

const counters = new Map<string, Counter>();

function keyFor(req: Request): string {
    return `${req.method}:${req.route?.path ?? req.path}`;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number): number {
    const base = 50;          // 50ms
    const max = 1000;         // cap per-delay
    const exp = Math.min(max, base * Math.pow(2, attempt));
    const jitter = Math.random() * exp * 0.3; // 0–30% jitter
    return exp + jitter;
}

export function throttleMiddleware(
    maxConcurrent: number,
    maxWaitMs = 3000
) {
    return async (req: Request, res: Response, next: NextFunction) => {
        const key = keyFor(req);

        let counter = counters.get(key);
        if (!counter) {
            counter = { active: 0 };
            counters.set(key, counter);
        }

        let attempt = 0;
        let waited = 0;

        while (counter.active >= maxConcurrent) {
            const delay = backoffDelay(attempt++);
            waited += delay;

            if (waited > maxWaitMs) {
                res.setHeader("Retry-After", "1");
                return res.status(429).json({
                    error: "TOO_MANY_REQUESTS",
                    message: "Server is busy, please retry shortly"
                });
            }

            await sleep(delay);
        }

        counter.active++;

        const done = () => {
            counter!.active--;
        };

        res.once("finish", done);
        res.once("close", done);

        return next();
    };
}

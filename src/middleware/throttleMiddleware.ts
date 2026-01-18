import type { Request, Response, NextFunction } from "express";

type Counter = {
    active: number;
};

const counters = new Map<string, Counter>();

function keyFor(req: Request): string {
    return `${req.method}:${req.route?.path ?? req.path}`;
}

export function throttleMiddleware(maxConcurrent = 10) {
    return async (req: Request, res: Response, next: NextFunction) => {
        const key = keyFor(req);

        let counter = counters.get(key);
        if (!counter) {
            counter = { active: 0 };
            counters.set(key, counter);
        }

        if (counter.active >= maxConcurrent) {
            res.setHeader("Retry-After", "1");
            return res.status(429).json({
                error: "TOO_MANY_REQUESTS",
                message: "Too many concurrent requests"
            });
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

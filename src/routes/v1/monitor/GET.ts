import { Request, Response } from "express";

export default async function handler(req: Request, res: Response) {
    return res.json({ ok: true });
}

import type { Request, Response } from 'express'
import fs from 'fs/promises'
import { markdownToHtml } from '@helpers/markdownToHtml'
import path from 'path'

export default async function GET(_req: Request, res: Response) {
    console.log("fetching readme")
    try {
        const readmePath = path.resolve(process.cwd(), 'README.md')
        const readmeContent = await fs.readFile(readmePath, 'utf8')
        const html = markdownToHtml(readmeContent)
        return res.status(200).json({
            value: html,
            lineCount: readmeContent.split('\n').length
        })
    } catch (error) {
        return res.status(500).json({ error: 'Failed to load README' })
    }
}

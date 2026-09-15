import { describe, it, expect } from 'vitest';
import { markdownToHtml } from '@helpers/markdownToHtml';

describe('markdownToHtml helper', () => {
    it('converts markdown images to html img tags', () => {
        const md = '![Logo](https://example.com/logo.png)';
        const html = markdownToHtml(md);
        expect(html).toContain('<img src="https://example.com/logo.png" alt="Logo"');
    });

    it('converts markdown links to html anchor tags', () => {
        const md = '[Example](https://example.com)';
        const html = markdownToHtml(md);
        expect(html).toContain('<a href="https://example.com" target="_blank"');
        expect(html).toContain('>Example</a>');
    });

    it('converts headers of varying levels', () => {
        const md = '# Title 1\n## Title 2\n### Title 3';
        const html = markdownToHtml(md);
        expect(html).toContain('<h1>Title 1</h1>');
        expect(html).toContain('<h2>Title 2</h2>');
        expect(html).toContain('<h3>Title 3</h3>');
    });

    it('converts bold text', () => {
        const md = 'This is **bold** text';
        const html = markdownToHtml(md);
        expect(html).toContain('<strong>bold</strong>');
    });

    it('converts fenced code blocks', () => {
        const md = '```bash\nnpm test\n```';
        const html = markdownToHtml(md);
        expect(html).toContain('<pre style="background:#f4f4f4; padding:10px; border-radius:5px; font-family: monospace; overflow-x: auto;">npm test</pre>');
    });

    it('converts inline code', () => {
        const md = 'Run `npm start` now';
        const html = markdownToHtml(md);
        expect(html).toContain('<code style="background:#f4f4f4; padding:2px 4px; border-radius:3px; font-family: monospace;">npm start</code>');
    });

    it('converts horizontal rules', () => {
        const md = '---';
        const html = markdownToHtml(md);
        expect(html).toContain('<hr style="border: 0; border-top: 1px solid #ccc; margin: 15px 0;" />');
    });

    it('converts unordered list items', () => {
        const md = '- item 1\n* item 2';
        const html = markdownToHtml(md);
        expect(html).toContain('<li>item 1</li>');
        expect(html).toContain('<li>item 2</li>');
    });

    it('converts ordered list items', () => {
        const md = '1. step one\n2. step two';
        const html = markdownToHtml(md);
        expect(html).toContain('<li>step one</li>');
        expect(html).toContain('<li>step two</li>');
    });

    it('converts newlines to br tags', () => {
        const md = 'Line 1\nLine 2';
        const html = markdownToHtml(md);
        expect(html).toContain('Line 1<br />Line 2');
    });
});

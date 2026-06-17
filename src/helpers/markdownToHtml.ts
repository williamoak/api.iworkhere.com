export function markdownToHtml(markdown: string): string {
    // Enhanced markdown to HTML converter for EULA and README
    let html = markdown;

    // 1. Handle Images: ![alt](url)
    html = html.replace(/!\[(.*?)\]\((.*?)\)/gim, '<img src="$2" alt="$1" style="max-width: 100%; border: 1px solid #ddd; margin: 5px 0;" />');

    // 2. Handle Links: [text](url)
    html = html.replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" style="color: #007bff; text-decoration: none;">$1</a>');

    // 3. Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>')
               .replace(/^## (.*$)/gim, '<h2>$1</h2>')
               .replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // 4. Bold
    html = html.replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>');

    // 5. Code blocks (```bash ... ```)
    html = html.replace(/```[a-z]*\n([\s\S]*?)\n```/gim, '<pre style="background:#f4f4f4; padding:10px; border-radius:5px; font-family: monospace; overflow-x: auto;">$1</pre>');

    // 6. Inline Code
    html = html.replace(/`(.*?)`/gim, '<code style="background:#f4f4f4; padding:2px 4px; border-radius:3px; font-family: monospace;">$1</code>');

    // 6. Horizontal Rules
    html = html.replace(/^---$/gim, '<hr style="border: 0; border-top: 1px solid #ccc; margin: 15px 0;" />');

    // 7. Unordered Lists (- or *)
    html = html.replace(/^\s*[-*] (.*$)/gim, '<li>$1</li>');

    // 8. Ordered Lists (1.)
    html = html.replace(/^\s*\d+\. (.*$)/gim, '<li>$1</li>');

    // 9. Line breaks
    html = html.replace(/\n/gim, '<br />');

    return html;
}

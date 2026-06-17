import type { Request, Response } from 'express';

export default async function GET(_req: Request, res: Response) {
    return res.status(200).send(`
<html>
<head>
    <style>
        button {
            padding: 8px 16px;
            cursor: pointer;
            border: 1px solid #000;
            border-radius: 4px;
            background: #f0f0f0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            transition: all 0.2s ease;
        }
        button:hover {
            background: #d8eafa; /* Pastel blue */
            filter: brightness(105%);
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }
        button:disabled {
            background: #b0b0b0;
            cursor: not-allowed;
            filter: none;
        }
        button:disabled:hover {
            background: #a0a0a0;
            filter: none;
        }
        button:active {
            transform: translateY(2px);
            box-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }
        .eula-panel {
            display: none;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 40vw;
            max-width: 90vw;
            max-height: 60vh;
            background: #e0f2f1; /* Pastel green */
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 8px 16px rgba(0,0,0,0.15);
            z-index: 1000;
            transition: opacity 0.3s ease, width 0.3s ease;
            opacity: 0;
            flex-direction: column;
        }
        .eula-panel.open {
            display: flex;
            opacity: 1;
        }
        .eula-panel.expanded {
            width: 60vw;
        }
        #eula-content {
            overflow-y: auto;
            flex-grow: 1;
            margin: 15px 0;
            position: relative;
        }
        .eula-panel .button-group {
            justify-content: center;
            gap: 20px;
            margin-top: 0;
        }
        #eula-back-to-top {
            display: none;
            position: sticky;
            bottom: 10px;
            right: 10px;
            background: #fff;
            border: 1px solid #ccc;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            cursor: pointer;
            z-index: 1001;
            font-size: 20px;
            float: right;
            clear: both;
            padding: 0;
        }
        #eula-back-to-top:hover {
            background: #f0f0f0;
        }
    </style>
</head>
<body>
    <h1>Admin Panel</h1>
    <button type="button" id="eula-btn" title="View the README">README</button>
    <div id="eula-panel" class="eula-panel">
        <h2 id="eula-title">EULA</h2>
        <div id="eula-content">
            <div id="eula-text">Loading...</div>
            <button type="button" id="eula-back-to-top" title="back to top">↑</button>
        </div>
        <div class="button-group">
            <button type="button" id="eula-accept">Accept</button>
            <button type="button" id="eula-cancel">Cancel</button>
            <button type="button" id="eula-done" style="display:none;">Done</button>
        </div>
    </div>
    <script>
        const eulaBtn = document.getElementById('eula-btn');
        const eulaPanel = document.getElementById('eula-panel');
        const eulaTitle = document.getElementById('eula-title');
        const eulaContent = document.getElementById('eula-content');
        const eulaText = document.getElementById('eula-text');
        const cancelBtn = document.getElementById('eula-cancel');
        const acceptBtn = document.getElementById('eula-accept');
        const doneBtn = document.getElementById('eula-done');
        const backToTopBtn = document.getElementById('eula-back-to-top');

        async function loadDocument(url, title) {
            eulaPanel.classList.add('open');
            eulaTitle.innerText = title;
            eulaContent.scrollTop = 0;
            backToTopBtn.style.display = 'none';

            if (title === 'README') {
                acceptBtn.style.display = 'none';
                cancelBtn.style.display = 'none';
                doneBtn.style.display = 'inline-block';
            } else {
                acceptBtn.style.display = 'inline-block';
                cancelBtn.style.display = 'inline-block';
                doneBtn.style.display = 'none';
            }

            const response = await fetch(url);
            const data = await response.json();
            eulaText.innerHTML = data.value;
            if (data.lineCount > 40) {
                eulaPanel.classList.add('expanded');
            } else {
                eulaPanel.classList.remove('expanded');
            }
        }

        eulaBtn.onclick = () => loadDocument('/v1/readme', 'README');

        eulaContent.onscroll = () => {
            if (eulaContent.scrollTop > 100) {
                backToTopBtn.style.display = 'block';
            } else {
                backToTopBtn.style.display = 'none';
            }
        };

        backToTopBtn.onclick = () => {
            eulaContent.scrollTop = 0;
        };

        doneBtn.onclick = () => {
            eulaPanel.classList.remove('open');
        };

        cancelBtn.onclick = () => {
            eulaPanel.classList.remove('open');
            window.dispatchEvent(new CustomEvent('eula-result', { detail: { accepted: false } }));
        };

        acceptBtn.onclick = () => {
            eulaPanel.classList.remove('open');
            window.dispatchEvent(new CustomEvent('eula-result', { detail: { accepted: true } }));
        };
    </script>
</body>
</html>
    `);
}

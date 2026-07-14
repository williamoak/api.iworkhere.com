export const welcomePage = (isAuthenticated: boolean) => `
<!DOCTYPE html>
<html>
<head>
    <title>iWorkHere API</title>
    <link rel="stylesheet" href="/css/main.css">
    <script src="/js/registrationHandler.js"></script>
</head>
<body class="pastel-blue-bg center-layout">
    <div class="card">
        <h1>Welcome to iWorkHere API</h1>
        <div id="loading-overlay" class="loading-overlay">
            <div class="spinner"></div>
            <p>Logging in...</p>
        </div>
            ${isAuthenticated 
            ? '<p>You are logged in.</p><a href="/admin">Go to Admin Dashboard</a>' 
            : `
                <form action="/admin/login" method="POST" autocomplete="off">
                    <div class="form-grid">
                        <label>Username:</label> <input type="text" name="identifier" id="username" placeholder="e.g. user@domain.com" required autocomplete="off">
                        <label>Password:</label> 
                        <div class="password-container">
                            <input type="password" name="password" id="password" placeholder="••••••••" required autocomplete="new-password">
                            <button type="button" class="password-toggle-btn" id="togglePassword">🙈</button>
                        </div>
                    </div>
                    <div class="button-group">
                        <button type="button" title="Register a new user account" id="open-register-btn">Register</button>
                        <button type="button" title="Forgot password">Forgot Password</button>
                        <button type="submit" id="login-btn" disabled title="Login for access">Login</button>
                        <button type="button" title="Login with Google" class="google-btn" id="google-login-btn">
                            <img src="/google.svg" alt="Google" style="width: 20px; height: 20px; vertical-align: middle;">
                        </button>
                    </div>
                </form>
              `
        }
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
        <div id="registration-panel" class="registration-panel">
            <h2>Register</h2>
            <form onsubmit="return false;">
                <div class="form-grid">
                    <label>Username:</label> <input type="text" id="reg-username" placeholder="Username" autocomplete="username">
                    <label>Email:</label> <input type="email" id="reg-email" placeholder="user@domain.com" autocomplete="email">
                    <label>Password:</label> 
                    <div class="password-container">
                        <input type="password" id="reg-password" placeholder="••••••••" autocomplete="new-password">
                        <button type="button" class="password-toggle-btn" id="reg-password-toggle">👁️</button>
                    </div>
                </div>
            </form>
            <div class="button-group">
                <button type="button" id="reg-submit" disabled>Submit</button>
                <button type="button" id="reg-view-eula-btn">View EULA</button>
                <button type="button" id="reg-cancel">Cancel</button>
            </div>
        </div>
        <div id="registration-pending-panel" class="registration-panel" style="display: none;">
            <h2>Registration Pending</h2>
            <p>Account created. Registration Pending, check your email @ <span id="reg-email-display"></span> for a verification link.</p>
            <div class="button-group">
                <button type="button" id="reg-pending-accept">Accept</button>
            </div>
        </div>
        <script>
            async function loadDocument(url, title) {
                const eulaPanel = document.getElementById('eula-panel');
                const eulaTitle = document.getElementById('eula-title');
                const eulaContent = document.getElementById('eula-content');
                const eulaText = document.getElementById('eula-text');
                const cancelBtn = document.getElementById('eula-cancel');
                const acceptBtn = document.getElementById('eula-accept');
                const doneBtn = document.getElementById('eula-done');
                const backToTopBtn = document.getElementById('eula-back-to-top');

                eulaPanel.classList.add('open');
                const regPanel = document.getElementById('registration-panel');
                if (regPanel) regPanel.classList.remove('open');
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
            window.loadDocument = loadDocument;

            document.addEventListener('DOMContentLoaded', () => {
                const eulaPanel = document.getElementById('eula-panel');
                const eulaTitle = document.getElementById('eula-title');
                const eulaContent = document.getElementById('eula-content');
                const eulaText = document.getElementById('eula-text');
                const cancelBtn = document.getElementById('eula-cancel');
                const acceptBtn = document.getElementById('eula-accept');
                const doneBtn = document.getElementById('eula-done');
                const backToTopBtn = document.getElementById('eula-back-to-top');

                const loginForm = document.querySelector('form');
                if (loginForm) {
                    const loginBtn = document.getElementById('login-btn');
                    const usernameInput = document.getElementById('username');
                    const passwordInput = document.getElementById('password');
                    
                    // Clear inputs on page load to prevent browser persistence
                    usernameInput.value = '';
                    passwordInput.value = '';
                    usernameInput.setAttribute('autocomplete', 'off');
                    passwordInput.setAttribute('autocomplete', 'new-password');
                    
                    // Extra protection: clear again after a small delay
                    setTimeout(() => {
                        if (usernameInput.value !== '') usernameInput.value = '';
                        if (passwordInput.value !== '') passwordInput.value = '';
                    }, 500);

                    function validateLoginForm() {
                        if (usernameInput.value.trim() !== '' && passwordInput.value.trim() !== '') {
                            loginBtn.disabled = false;
                        } else {
                            loginBtn.disabled = true;
                        }
                    }

                    usernameInput.addEventListener('input', validateLoginForm);
                    passwordInput.addEventListener('input', validateLoginForm);

                    // Toggle Password visibility
                    const togglePassword = document.getElementById('togglePassword');
                    if (togglePassword) {
                        togglePassword.onclick = () => {
                            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                            passwordInput.setAttribute('type', type);
                            togglePassword.textContent = type === 'password' ? '🙈' : '👁️';
                        };
                    }

                    window.addEventListener('eula-result', (event) => {
                        if (!event.detail.accepted) {
                            if (loginForm) loginForm.reset();
                            validateLoginForm();
                        }
                    });

                    loginForm.onsubmit = async (event) => {
                        event.preventDefault();
                        
                        // Show loading overlay
                        document.getElementById('loading-overlay').style.display = 'flex';

                        const formData = new URLSearchParams(new FormData(loginForm));
                        
                        // Clear inputs immediately
                        usernameInput.value = '';
                        passwordInput.value = '';
                        validateLoginForm();

                        const response = await fetch('/admin/login', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded'
                            },
                            body: formData
                        });
                        
                        if (response.redirected || response.status === 200) {
                            window.location.href = '/admin';
                        } else {
                            const overlay = document.getElementById('loading-overlay');
                            overlay.classList.add('collapsing');
                            setTimeout(() => {
                                window.location.reload(); // To show the failure
                            }, 500);
                        }
                    };

                    validateLoginForm();
                }

                // Google Login handler
                const googleLoginBtn = document.getElementById('google-login-btn');
                if (googleLoginBtn) {
                    googleLoginBtn.onclick = () => {
                        const width = 500;
                        const height = 650;
                        const left = window.screen.width / 2 - width / 2;
                        const top = window.screen.height / 2 - height / 2;
                        const popup = window.open(
                            '/v1/auth/oauth/google?redirect_uri=/admin&flow=popup',
                            'GoogleLogin',
                            'popup=yes,width=' + width + ',height=' + height + ',top=' + top + ',left=' + left + ',status=no,menubar=no,toolbar=no'
                        );
                        
                        window.addEventListener('message', (event) => {
                            if (event.data && event.data.type === 'OAUTH_SUCCESS') {
                                window.location.href = '/admin';
                            }
                        });
                        
                        window.addEventListener('storage', (event) => {
                            if (event.key === 'oauth-tokens' && event.newValue) {
                                window.location.href = '/admin';
                            }
                        });
                    };
                }

                // EULA button (now README button) handler
                const readmeBtn = document.getElementById('readme-btn');
                if (readmeBtn) {
                    readmeBtn.onclick = () => loadDocument('/v1/readme', 'README');
                }

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
            });
        </script>
        <div class="docs-panel" style="display: flex; justify-content: center; gap: 10px;">
            <button type="button" onclick="window.open('/docs/#', '_blank')" title="View the Swagger Documentation">Swagger Docs</button>
            <button type="button" id="readme-btn" title="View the README" onclick="window.loadDocument('/v1/readme', 'README')">README</button>
        </div>
    </div>
</body>
</html>
`;

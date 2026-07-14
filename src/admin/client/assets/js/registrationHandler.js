/**
 * Registration Handler for api.iworkhere.com
 */

window.RegistrationManager = {
    savedRegData: null,
    eulaStatus: 'unknown', // 'unknown', 'accepted', 'declined'
    
    // UI Elements
    panel: null,
    pendingPanel: null,
    usernameInput: null,
    emailInput: null,
    passwordInput: null,

    init() {
        this.panel = document.getElementById('registration-panel');
        this.pendingPanel = document.getElementById('registration-pending-panel');
        this.usernameInput = document.getElementById('reg-username');
        this.emailInput = document.getElementById('reg-email');
        this.passwordInput = document.getElementById('reg-password');
        this.passwordToggleBtn = document.getElementById('reg-password-toggle');
        this.submitBtn = document.getElementById('reg-submit');
        this.emailDisplay = document.getElementById('reg-email-display');

        const openBtn = document.getElementById('open-register-btn');
        const cancelBtn = document.getElementById('reg-cancel');
        const viewEulaBtn = document.getElementById('reg-view-eula-btn');
        const pendingAcceptBtn = document.getElementById('reg-pending-accept');

        if (openBtn) openBtn.onclick = () => {
            this.panel.classList.add('open');
            this.usernameInput.focus();
        };
        
        if (cancelBtn) cancelBtn.onclick = () => this.close();
        
        if (viewEulaBtn) viewEulaBtn.onclick = (e) => {
            e.preventDefault();
            this.saveData();
            window.loadDocument('/v1/auth/eula', 'EULA');
        };

        if (this.submitBtn) this.submitBtn.onclick = () => this.submit();
        if (pendingAcceptBtn) pendingAcceptBtn.onclick = () => window.location.href = '/admin';
        
        if (this.passwordToggleBtn) {
            this.passwordToggleBtn.onclick = () => {
                const isPassword = this.passwordInput.type === 'password';
                this.passwordInput.type = isPassword ? 'text' : 'password';
                this.passwordToggleBtn.textContent = isPassword ? '🙈' : '👁️';
            };
        }

        [this.usernameInput, this.emailInput, this.passwordInput].forEach(input => {
            input.addEventListener('input', () => this.validateForm());
        });

        this.validateForm();

        window.addEventListener('eula-result', (event) => {
            this.panel.classList.add('open');
            this.usernameInput.focus();
            this.eulaStatus = event.detail.accepted ? 'accepted' : 'declined';
            if (this.eulaStatus === 'accepted') {
                this.restoreData();
            } else {
                this.clearData();
            }
            this.validateForm();
        });
    },

    validateForm() {
        const errors = [];
        
        // EULA Validation and UI feedback
        const eulaBtn = document.getElementById('reg-view-eula-btn');
        if (this.eulaStatus === 'unknown') {
            if (eulaBtn) eulaBtn.style.backgroundColor = '#fff9c4'; // pastel yellow
            this.submitBtn.style.backgroundColor = '#fff9c4'; // pastel yellow
            errors.push("Must Accept EULA");
        } else if (this.eulaStatus === 'declined') {
            if (eulaBtn) eulaBtn.style.backgroundColor = '#ffcdd2'; // pastel red
            this.submitBtn.style.backgroundColor = '#ffcdd2'; // pastel red
            errors.push("Must Accept EULA");
        } else {
            if (eulaBtn) eulaBtn.style.backgroundColor = '#c8e6c9'; // pastel green
            this.submitBtn.style.backgroundColor = '#c8e6c9'; // pastel green
        }
        
        // Add EULA status to tooltip
        if (this.eulaStatus === 'unknown') {
             if (eulaBtn) eulaBtn.title = "Please view and accept the EULA";
        } else if (this.eulaStatus === 'declined') {
             if (eulaBtn) eulaBtn.title = "EULA was declined";
        } else {
             if (eulaBtn) eulaBtn.title = "EULA accepted";
        }
        
        const username = this.usernameInput.value.trim();
        const email = this.emailInput.value.trim();
        const password = this.passwordInput.value;

        if (!username) errors.push("Username is required");
        if (!email) errors.push("Email is required");

        if (password.length > 0) {
            if (password !== password.trim()) {
                errors.push("Password must not start or end with whitespace");
            } else if (password.length < 8) {
                errors.push("Password must be at least 8 characters");
            } else if (password.length > 72) {
                errors.push("Password must not exceed 72 characters");
            }
        } else {
            errors.push("Password is required");
        }

        if (errors.length > 0) {
            this.submitBtn.disabled = true;
            this.submitBtn.title = errors.join(';\n ');
        } else {
            this.submitBtn.disabled = false;
            this.submitBtn.title = "Click to submit registration";
        }
    },

    saveData() {
        this.savedRegData = {
            username: this.usernameInput.value,
            email: this.emailInput.value,
            password: this.passwordInput.value
        };
    },

    restoreData() {
        if (this.savedRegData) {
            this.usernameInput.value = this.savedRegData.username;
            this.emailInput.value = this.savedRegData.email;
            this.passwordInput.value = this.savedRegData.password;
        }
        this.savedRegData = null;
    },

    clearData() {
        this.usernameInput.value = '';
        this.emailInput.value = '';
        this.passwordInput.value = '';
        this.savedRegData = null;
    },

    close() {
        this.panel.classList.remove('open');
        this.pendingPanel.classList.remove('open');
        this.clearData();
    },

    async submit() {
        const payload = {
            username: this.usernameInput.value,
            email: this.emailInput.value,
            password: this.passwordInput.value
        };

        try {
            const response = await fetch('/v1/auth/register', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (response.ok) {
                this.panel.classList.remove('open');
                this.pendingPanel.classList.add('open');
                this.emailDisplay.textContent = result.user.email;
            } else {
                alert('Registration failed: ' + (result.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Registration error:', error);
            alert('An unexpected error occurred.');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => window.RegistrationManager.init());

/**
 * Registration Handler for api.iworkhere.com
 */

window.RegistrationManager = {
    savedRegData: null,
    eulaAccepted: false,
    
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

        if (openBtn) openBtn.onclick = () => this.panel.classList.add('open');
        
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

        window.addEventListener('eula-result', (event) => {
            this.panel.classList.add('open');
            this.eulaAccepted = event.detail.accepted;
            if (event.detail.accepted) {
                this.restoreData();
            } else {
                this.clearData();
            }
            this.validateForm();
        });
    },

    validateForm() {
        const isUsernameValid = this.usernameInput.value.trim().length > 0;
        const isEmailValid = this.emailInput.value.trim().length > 0;
        const isPasswordValid = this.passwordInput.value.length > 0;
        const isEulaValid = this.eulaAccepted;

        this.submitBtn.disabled = !(isUsernameValid && isEmailValid && isPasswordValid && isEulaValid);
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
            app_key: 'api.iworkhere.com', // Must match registered application key
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

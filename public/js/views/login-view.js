import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { auth, functions } from '../firebase-init.js';
import { showToast } from '../utils.js';
import { translationService } from '../utils/translation-service.js';

export class LoginView extends LitElement {
    static properties = {
        _selectedRole: { state: true, type: String },
        _isRegistering: { state: true, type: Boolean },
        _isLoading: { state: true, type: Boolean },
        _error: { state: true, type: String }
    };

    constructor() {
        super();
        this._selectedRole = null; // null | 'professor' | 'student'
        this._isRegistering = false;
        this._isLoading = false;
        this._error = '';
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._langUnsubscribe = translationService.subscribe(() => this.requestUpdate());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._langUnsubscribe) {
            this._langUnsubscribe();
        }
    }

    _selectRole(role) {
        this._selectedRole = role;
        this._isRegistering = false;
        this._error = '';
    }

    _backToRoles() {
        this._selectedRole = null;
        this._error = '';
    }

    _toggleMode(e) {
        e.preventDefault();
        this._isRegistering = !this._isRegistering;
        this._error = '';
    }

    async _handleLogin(e) {
        e.preventDefault();
        const email = this.renderRoot.querySelector('#login-email').value;
        const password = this.renderRoot.querySelector('#login-password').value;

        this._isLoading = true;
        this._error = '';

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // onAuthStateChanged in app.js handles redirect
        } catch (error) {
            console.error("Error signing in:", error);
            let message = translationService.t('auth.error_login_generic');
            switch (error.code) {
                case 'auth/invalid-credential':
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                    message = translationService.t('auth.error_invalid_credential');
                    break;
                case 'auth/invalid-email':
                    message = translationService.t('auth.error_invalid_email');
                    break;
                case 'auth/too-many-requests':
                    message = translationService.t('auth.error_too_many_requests');
                    break;
                case 'auth/user-disabled':
                    message = translationService.t('auth.error_user_disabled');
                    break;
            }
            this._error = message;
        } finally {
            this._isLoading = false;
        }
    }

    async _handleRegister(e) {
        e.preventDefault();
        const email = this.renderRoot.querySelector('#register-email').value;
        const password = this.renderRoot.querySelector('#register-password').value;

        // Role is determined by _selectedRole state
        const role = this._selectedRole;

        this._isLoading = true;
        this._error = '';

        try {
            const registerUserWithRole = httpsCallable(functions, 'registerUserWithRole');
            await registerUserWithRole({ email, password, role });
            await signInWithEmailAndPassword(auth, email, password);
            // Force refresh token to get the new custom claims (role) immediately
            if (auth.currentUser) {
                await auth.currentUser.getIdToken(true);
            }
            showToast(translationService.t('auth.success_register'), 'success');
        } catch (error) {
            console.error("Error during registration:", error);
            let message = translationService.t('auth.error_register_generic');
            const errorCode = error.details?.errorCode;
            switch (errorCode) {
                case 'auth/email-already-in-use':
                    message = translationService.t('auth.error_email_in_use');
                    break;
                case 'auth/weak-password':
                    message = translationService.t('auth.error_weak_password');
                    break;
                case 'auth/invalid-email':
                    message = translationService.t('auth.error_invalid_email');
                    break;
                default:
                    message = error.message || message;
            }
            this._error = message;
        } finally {
            this._isLoading = false;
        }
    }

    renderRoleSelection() {
        const t = (key) => translationService.t(key);
        return html`
            <div class="animate-fade-in w-full max-w-lg">
                <div class="text-center mb-8">
                    <h2 class="text-3xl font-bold text-slate-900">${t('auth.role_selection')}</h2>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- Professor Card -->
                    <button @click=${() => this._selectRole('professor')}
                        class="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-xl shadow-slate-200/50 hover:border-indigo-500 hover:shadow-indigo-500/20 hover:-translate-y-1 transition-all duration-300 text-left group h-full flex flex-col justify-between">
                        <div>
                            <div class="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                                👨‍🏫
                            </div>
                            <h3 class="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">${t('auth.role_professor')}</h3>
                            <p class="text-sm text-slate-500 mt-2">${t('auth.role_professor_desc')}</p>
                        </div>
                        <div class="mt-4 flex items-center text-indigo-600 font-semibold text-sm opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-10px] group-hover:translate-x-0">
                            ${t('common.continue')} <span class="ml-1">→</span>
                        </div>
                    </button>

                    <!-- Student Card -->
                    <button @click=${() => this._selectRole('student')}
                        class="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-xl shadow-slate-200/50 hover:border-green-500 hover:shadow-green-500/20 hover:-translate-y-1 transition-all duration-300 text-left group h-full flex flex-col justify-between">
                        <div>
                            <div class="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                                🎓
                            </div>
                            <h3 class="text-lg font-bold text-slate-900 group-hover:text-green-600 transition-colors">${t('auth.role_student')}</h3>
                            <p class="text-sm text-slate-500 mt-2">${t('auth.role_student_desc')}</p>
                        </div>
                         <div class="mt-4 flex items-center text-green-600 font-semibold text-sm opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-10px] group-hover:translate-x-0">
                            ${t('common.continue')} <span class="ml-1">→</span>
                        </div>
                    </button>
                </div>
            </div>
        `;
    }

    renderLoginForm() {
        const t = (key) => translationService.t(key);
        const isProfessor = this._selectedRole === 'professor';
        const accentColor = isProfessor ? 'indigo' : 'green';
        const titleKey = isProfessor ? 'auth.login_as_professor' : 'auth.login_as_student';

        return html`
            <div class="w-full max-w-md space-y-8 animate-fade-in">
                <button @click=${this._backToRoles} class="text-sm font-bold text-slate-400 hover:text-slate-700 flex items-center transition-colors mb-4">
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                    ${t('auth.back_to_roles')}
                </button>

                <div class="text-center lg:text-left">
                     <h2 class="text-3xl font-bold text-slate-900">${this._isRegistering ? t('auth.create_account') : t(titleKey)}</h2>
                     <p class="text-slate-500 mt-2">${this._isRegistering ? '' : t('auth.welcome_desc')}</p>
                </div>

                <!-- Login Form -->
                <div class="${this._isRegistering ? 'hidden' : 'block'} animate-fade-in">
                    <form @submit=${this._handleLogin} class="space-y-5">
                        <div class="space-y-1">
                            <label for="login-email" class="text-sm font-medium text-slate-700">${t('auth.email_label')}</label>
                            <input type="email" id="login-email" placeholder="${t('auth.email_placeholder')}" autocomplete="email" required
                                class="${isProfessor ? 'focus:ring-indigo-500' : 'focus:ring-green-500'} w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:border-transparent transition-all">
                        </div>
                        <div class="space-y-1">
                            <label for="login-password" class="text-sm font-medium text-slate-700">${t('auth.password_label')}</label>
                            <input type="password" id="login-password" placeholder="${t('auth.password_placeholder')}" autocomplete="current-password" required
                                class="${isProfessor ? 'focus:ring-indigo-500' : 'focus:ring-green-500'} w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:border-transparent transition-all">
                        </div>

                        ${this._error ? html`
                        <div class="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span>${this._error}</span>
                        </div>` : ''}

                        <button type="submit" ?disabled=${this._isLoading}
                            class="${isProfessor ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-700 hover:to-indigo-600' : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600'} w-full text-white font-bold py-3 px-4 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50">
                            ${this._isLoading ? t('common.loading') : t('auth.login_btn')}
                        </button>
                    </form>

                    <div class="mt-6 text-center">
                        <p class="text-slate-600">
                            ${t('auth.no_account')}
                            <a href="#" @click=${this._toggleMode} class="${isProfessor ? 'text-indigo-700 hover:text-indigo-800' : 'text-green-700 hover:text-green-800'} font-bold hover:underline transition-colors">${t('auth.register_link')}</a>
                        </p>
                    </div>
                </div>

                <!-- Register Form -->
                <div class="${this._isRegistering ? 'block' : 'hidden'} animate-fade-in">
                    <form @submit=${this._handleRegister} class="space-y-5">
                        <div class="space-y-1">
                            <label for="register-email" class="text-sm font-medium text-slate-700">${t('auth.email_label')}</label>
                            <input type="email" id="register-email" placeholder="${t('auth.email_placeholder')}" autocomplete="email" required
                                class="${isProfessor ? 'focus:ring-indigo-500' : 'focus:ring-green-500'} w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:border-transparent transition-all">
                        </div>
                        <div class="space-y-1">
                            <label for="register-password" class="text-sm font-medium text-slate-700">${t('auth.password_label')}</label>
                            <input type="password" id="register-password" placeholder="${t('auth.password_placeholder')}" autocomplete="new-password" required
                                class="${isProfessor ? 'focus:ring-indigo-500' : 'focus:ring-green-500'} w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:border-transparent transition-all">
                        </div>

                        <!-- Role is implied by _selectedRole, no checkbox needed -->

                        ${this._error ? html`
                        <div class="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span>${this._error}</span>
                        </div>` : ''}

                        <button type="submit" ?disabled=${this._isLoading}
                            class="${isProfessor ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600' : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600'} w-full text-white font-bold py-3 px-4 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50">
                            ${this._isLoading ? t('common.loading') : t('auth.register_btn')}
                        </button>
                    </form>
                        <div class="mt-6 text-center">
                        <p class="text-slate-600">
                            ${t('auth.have_account')}
                            <a href="#" @click=${this._toggleMode} class="${isProfessor ? 'text-indigo-700 hover:text-indigo-800' : 'text-green-700 hover:text-green-800'} font-bold hover:underline transition-colors">${t('auth.login_link')}</a>
                        </p>
                    </div>
                </div>

                <!-- Footer -->
                <p class="text-center text-xs text-slate-400 mt-8">
                    ${t('auth.footer_rights')}
                </p>
            </div>
        `;
    }

    render() {
        const t = (key) => translationService.t(key);

        return html`
        <div class="min-h-screen w-full flex font-['Plus_Jakarta_Sans']">
            <!-- Left Side - Branding (Hidden on mobile) -->
            <div class="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-indigo-900 to-slate-900 overflow-hidden items-center justify-center">
                <!-- Abstract Background Shapes -->
                <div class="absolute top-0 left-0 w-full h-full opacity-20">
                     <div class="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-500 blur-[100px]"></div>
                     <div class="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600 blur-[100px]"></div>
                </div>

                <div class="relative z-10 p-12 text-white max-w-xl">
                    <div class="mb-8 inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/20 backdrop-blur-xl border border-indigo-400/30">
                         <span class="text-3xl">✨</span>
                    </div>
                    <h1 class="text-5xl font-extrabold tracking-tight leading-tight mb-6">
                        ${t('auth.branding_title_1')} <br> <span class="text-indigo-400">${t('auth.branding_title_2')}</span>
                    </h1>
                    <p class="text-lg text-slate-300 leading-relaxed">
                        ${t('auth.branding_desc')}
                    </p>

                    <div class="mt-12 flex gap-4">
                        <div class="flex -space-x-2 overflow-hidden">
                            <div class="w-10 h-10 rounded-full bg-slate-700 border-2 border-slate-800"></div>
                            <div class="w-10 h-10 rounded-full bg-slate-600 border-2 border-slate-800"></div>
                            <div class="w-10 h-10 rounded-full bg-slate-500 border-2 border-slate-800"></div>
                        </div>
                        <p class="text-sm text-slate-400 flex items-center">
                            ${t('auth.community_join')}
                        </p>
                    </div>
                </div>
            </div>

            <!-- Right Side - Content -->
            <div class="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 bg-white relative">
                ${!this._selectedRole ? this.renderRoleSelection() : this.renderLoginForm()}
            </div>
        </div>
        `;
    }
}
customElements.define('login-view', LoginView);

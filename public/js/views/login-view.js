import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { auth, functions } from '../../firebase-init.js';
import { showToast } from '../../utils.js';
import { translationService } from '../../utils/translation-service.js';

export class LoginView extends LitElement {
    static properties = {
        _isRegistering: { state: true, type: Boolean },
        _isLoading: { state: true, type: Boolean },
        _error: { state: true, type: String }
    };

    constructor() {
        super();
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
        const isProfessor = this.renderRoot.querySelector('#register-as-professor').checked;
        const role = isProfessor ? 'professor' : 'student';

        this._isLoading = true;
        this._error = '';

        try {
            const registerUserWithRole = httpsCallable(functions, 'registerUserWithRole');
            await registerUserWithRole({ email, password, role });
            await signInWithEmailAndPassword(auth, email, password);
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

    async _handleProfessorLogin() {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Error with Google sign-in:", error);
            showToast(translationService.t('auth.error_google') + error.message, 'error');
        }
    }

    render() {
        const t = (key) => translationService.t(key);

        return html`
        <div class="min-h-screen w-full flex font-['Plus_Jakarta_Sans']">
            <!-- Left Side - Branding (Hidden on mobile) -->
            <div class="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-green-900 to-slate-900 overflow-hidden items-center justify-center">
                <!-- Abstract Background Shapes -->
                <div class="absolute top-0 left-0 w-full h-full opacity-20">
                     <div class="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-green-500 blur-[100px]"></div>
                     <div class="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600 blur-[100px]"></div>
                </div>

                <div class="relative z-10 p-12 text-white max-w-xl">
                    <div class="mb-8 inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-500/20 backdrop-blur-xl border border-green-400/30">
                         <span class="text-3xl">🎓</span>
                    </div>
                    <h1 class="text-5xl font-extrabold tracking-tight leading-tight mb-6">
                        ${t('auth.branding_title_1')} <br> <span class="text-green-400">${t('auth.branding_title_2')}</span>
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

            <!-- Right Side - Forms -->
            <div class="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 bg-white">
                <div class="w-full max-w-md space-y-8">

                    <div class="text-center lg:text-left">
                         <h2 class="text-3xl font-bold text-slate-900">${this._isRegistering ? t('auth.create_account') : t('auth.welcome_back')}</h2>
                         <p class="text-slate-500 mt-2">${this._isRegistering ? '' : t('auth.welcome_desc')}</p>
                    </div>

                    <!-- Login Form -->
                    <div class="${this._isRegistering ? 'hidden' : 'block'} animate-fade-in">
                        <form @submit=${this._handleLogin} class="space-y-5">
                            <div class="space-y-1">
                                <label for="login-email" class="text-sm font-medium text-slate-700">${t('auth.email_label')}</label>
                                <input type="email" id="login-email" placeholder="${t('auth.email_placeholder')}" autocomplete="email" required
                                    class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all">
                            </div>
                            <div class="space-y-1">
                                <label for="login-password" class="text-sm font-medium text-slate-700">${t('auth.password_label')}</label>
                                <input type="password" id="login-password" placeholder="${t('auth.password_placeholder')}" autocomplete="current-password" required
                                    class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all">
                            </div>

                            ${this._error ? html`
                            <div class="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span>${this._error}</span>
                            </div>` : ''}

                            <button type="submit" ?disabled=${this._isLoading}
                                class="w-full bg-gradient-to-r from-green-700 to-green-600 hover:from-green-800 hover:to-green-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50">
                                ${this._isLoading ? t('common.loading') : t('auth.login_btn')}
                            </button>
                        </form>

                        <div class="mt-6 text-center">
                            <p class="text-slate-600">
                                ${t('auth.no_account')}
                                <a href="#" @click=${this._toggleMode} class="font-bold text-green-700 hover:text-green-800 hover:underline transition-colors">${t('auth.register_link')}</a>
                            </p>
                        </div>
                    </div>

                    <!-- Register Form -->
                    <div class="${this._isRegistering ? 'block' : 'hidden'} animate-fade-in">
                        <form @submit=${this._handleRegister} class="space-y-5">
                            <div class="space-y-1">
                                <label for="register-email" class="text-sm font-medium text-slate-700">${t('auth.email_label')}</label>
                                <input type="email" id="register-email" placeholder="${t('auth.email_placeholder')}" autocomplete="email" required
                                    class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all">
                            </div>
                            <div class="space-y-1">
                                <label for="register-password" class="text-sm font-medium text-slate-700">${t('auth.password_label')}</label>
                                <input type="password" id="register-password" placeholder="${t('auth.password_placeholder')}" autocomplete="new-password" required
                                    class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all">
                            </div>

                            ${this._error ? html`
                            <div class="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2">
                                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span>${this._error}</span>
                            </div>` : ''}

                            <div class="flex items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <input id="register-as-professor" type="checkbox" class="h-5 w-5 text-green-600 focus:ring-green-500 border-slate-300 rounded">
                                <label for="register-as-professor" class="ml-3 block text-sm font-medium text-slate-700">
                                    ${t('auth.register_professor_checkbox')}
                                </label>
                            </div>

                            <button type="submit" ?disabled=${this._isLoading}
                                class="w-full bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-800 hover:to-amber-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50">
                                ${this._isLoading ? t('common.loading') : t('auth.register_btn')}
                            </button>
                        </form>
                            <div class="mt-6 text-center">
                            <p class="text-slate-600">
                                ${t('auth.have_account')}
                                <a href="#" @click=${this._toggleMode} class="font-bold text-green-700 hover:text-green-800 hover:underline transition-colors">${t('auth.login_link')}</a>
                            </p>
                        </div>
                    </div>

                    <!-- Separator -->
                    <div class="relative py-4">
                        <div class="absolute inset-0 flex items-center">
                            <div class="w-full border-t border-slate-200"></div>
                        </div>
                        <div class="relative flex justify-center">
                            <span class="px-4 bg-white text-sm text-slate-400 font-medium uppercase tracking-wider">${t('auth.or')}</span>
                        </div>
                    </div>

                    <!-- Role Switch / Google Login -->
                    <div>
                        <button @click=${this._handleProfessorLogin}
                            class="w-full bg-slate-800 text-white font-semibold py-3 px-4 rounded-xl hover:bg-slate-900 transition-all shadow-md flex items-center justify-center gap-2">
                            <span>👨‍🏫</span>
                            ${t('auth.login_professor_btn')}
                        </button>
                    </div>

                    <!-- Footer -->
                    <p class="text-center text-xs text-slate-400 mt-8">
                        ${t('auth.footer_rights')}
                    </p>
                </div>
            </div>
        </div>
        `;
    }
}
customElements.define('login-view', LoginView);

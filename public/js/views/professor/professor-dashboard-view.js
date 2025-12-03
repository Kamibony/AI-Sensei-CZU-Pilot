import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';
import { translationService, SUPPORTED_LANGUAGES } from '../../utils/translation-service.js';
import { Localized } from '../../utils/localization-mixin.js';
import { baseStyles } from '../../shared-styles.js';
import { handleLogout } from '../../auth.js';

export class ProfessorDashboardView extends Localized(LitElement) {
    static properties = {
        _classes: { state: true, type: Array },
        _students: { state: true, type: Array },
        _lessons: { state: true, type: Array },
        _isLoading: { state: true, type: Boolean },
        _showCreateClassModal: { state: true, type: Boolean },
        _newClassName: { state: true, type: String }
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this._classes = [];
        this._students = [];
        this._lessons = [];
        this._isLoading = true;
        this.unsubscribes = [];
        this._showCreateClassModal = false;
        this._newClassName = "";
    }

    connectedCallback() {
        super.connectedCallback();
        this._fetchDashboardData();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.unsubscribes.forEach(unsub => unsub());
    }

    _fetchDashboardData() {
        const authUnsub = firebaseInit.auth.onAuthStateChanged(user => {
            if (!user) {
                this._isLoading = false;
                return;
            }
            this._isLoading = true;
            this.unsubscribes.forEach(unsub => unsub());
            this.unsubscribes = [];

            const classesQuery = query(collection(firebaseInit.db, 'groups'), where("ownerId", "==", user.uid));
            this.unsubscribes.push(onSnapshot(classesQuery, (snapshot) => {
                this._classes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }));

            const studentsQuery = query(collection(firebaseInit.db, 'students'), where("ownerId", "==", user.uid));
            this.unsubscribes.push(onSnapshot(studentsQuery, (snapshot) => {
                this._students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }));

            const lessonsQuery = query(collection(firebaseInit.db, 'lessons'), where("ownerId", "==", user.uid));
            this.unsubscribes.push(onSnapshot(lessonsQuery, (snapshot) => {
                this._lessons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this._isLoading = false;
            }));
        });
        this.unsubscribes.push(authUnsub);
    }

    get _stats() {
        const totalStudents = new Set(this._classes.flatMap(c => c.studentIds || [])).size;
        const totalClasses = this._classes.length;
        const totalLessons = this._lessons.length;
        return { totalStudents, totalClasses, totalLessons };
    }

    _generateJoinCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    async _submitCreateClass() {
        const className = this._newClassName.trim();
        if (!className) {
            showToast(this.t('professor.enter_class_name'), true);
            return;
        }
        const user = firebaseInit.auth.currentUser;
        if (!user) return;

        try {
            await addDoc(collection(firebaseInit.db, 'groups'), {
                name: className,
                ownerId: user.uid,
                joinCode: this._generateJoinCode(),
                createdAt: serverTimestamp(),
                studentIds: []
            });
            showToast(this.t('common.saved'));
            this._showCreateClassModal = false;
            this._newClassName = "";
        } catch (error) {
            console.error("Error creating class:", error);
            showToast(this.t('common.error'), true);
        }
    }

    async _handleLanguageChange(e) {
        await translationService.changeLanguage(e.target.value);
    }

    render() {
        const t = (key) => this.t(key);
        
        if (this._isLoading) {
             return html`<div class="flex justify-center items-center h-full min-h-screen"><p class="text-xl text-slate-400 animate-pulse">${t('common.loading')}</p></div>`;
        }

        const user = firebaseInit.auth.currentUser;
        const userName = user?.displayName || user?.email || 'Profesore';
        const currentLang = translationService.currentLanguage;

        return html`
            <div class="w-full p-6 md:p-8 space-y-8">
                
                <header class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 class="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">${t('professor.dashboard_title')}</h1>
                        <p class="text-slate-500 mt-1">${t('professor.welcome_back')}, ${userName} 👋</p>
                    </div>

                    <div class="flex items-center gap-3 bg-white p-2 pr-4 rounded-full shadow-sm border border-slate-100">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold shadow-md">
                            ${userName.charAt(0).toUpperCase()}
                        </div>
                        
                        <div class="h-8 w-px bg-slate-200 mx-1"></div>

                        <div class="relative group">
                            <select 
                                @change=${this._handleLanguageChange} 
                                class="appearance-none bg-transparent font-medium text-sm text-slate-600 hover:text-indigo-600 focus:outline-none cursor-pointer pr-4 py-1"
                            >
                                ${SUPPORTED_LANGUAGES.map(lang => html`
                                    <option value="${lang.code}" ?selected=${currentLang === lang.code}>
                                        ${lang.flag} ${lang.code.toUpperCase()}
                                    </option>
                                `)}
                            </select>
                        </div>

                        <button @click=${handleLogout} class="text-slate-400 hover:text-red-500 transition-colors p-1" title="${t('common.logout')}">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                        </button>
                    </div>
                </header>

                <section>
                    <h2 class="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                        <span class="bg-purple-100 text-purple-600 p-1.5 rounded-lg">✨</span> 
                        ${t('professor.creative_studio')}
                    </h2>

                    <div class="bg-white rounded-3xl p-1 shadow-sm border border-slate-200">
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                            
                            <div class="p-6 hover:bg-purple-50/50 transition-colors cursor-pointer group rounded-l-3xl"
                                    @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'editor' }, bubbles: true, composed: true }))}>
                                <div class="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-purple-200 mb-4 group-hover:scale-110 transition-transform">
                                    ✨
                                </div>
                                <h3 class="font-bold text-slate-900 group-hover:text-purple-700 transition-colors">${t('professor.magic_generator')}</h3>
                                <p class="text-sm text-slate-500 mt-1 leading-relaxed">${t('professor.magic_generator_desc')}</p>
                            </div>

                            <div class="p-6 hover:bg-slate-50 transition-colors cursor-pointer group"
                                    @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'editor', viewMode: 'settings' }, bubbles: true, composed: true }))}>
                                <div class="w-12 h-12 bg-white border-2 border-slate-100 text-slate-600 rounded-2xl flex items-center justify-center text-2xl mb-4 group-hover:border-indigo-200 group-hover:text-indigo-600 transition-colors">
                                    📝
                                </div>
                                <h3 class="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">${t('professor.manual_create')}</h3>
                                <p class="text-sm text-slate-500 mt-1 leading-relaxed">${t('professor.manual_create_desc')}</p>
                            </div>

                            <div class="p-6 hover:bg-slate-50 transition-colors cursor-pointer group"
                                    @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'timeline' }, bubbles: true, composed: true }))}>
                                <div class="w-12 h-12 bg-white border-2 border-slate-100 text-slate-600 rounded-2xl flex items-center justify-center text-2xl mb-4 group-hover:border-blue-200 group-hover:text-blue-600 transition-colors">
                                    📚
                                </div>
                                <div class="flex justify-between items-center">
                                    <h3 class="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">${t('professor.lesson_library')}</h3>
                                    <span class="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">${this._stats.totalLessons}</span>
                                </div>
                                <p class="text-sm text-slate-500 mt-1 leading-relaxed">${t('professor.lesson_library_desc')}</p>
                            </div>

                            <div class="p-6 hover:bg-slate-50 transition-colors cursor-pointer group rounded-r-3xl"
                                    @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'media' }, bubbles: true, composed: true }))}>
                                <div class="w-12 h-12 bg-white border-2 border-slate-100 text-slate-600 rounded-2xl flex items-center justify-center text-2xl mb-4 group-hover:border-orange-200 group-hover:text-orange-600 transition-colors">
                                    📁
                                </div>
                                <h3 class="font-bold text-slate-900 group-hover:text-orange-700 transition-colors">${t('professor.media_files')}</h3>
                                <p class="text-sm text-slate-500 mt-1 leading-relaxed">${t('professor.media_files_desc')}</p>
                            </div>

                        </div>
                    </div>
                </section>

                <section>
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <span class="bg-blue-100 text-blue-600 p-1.5 rounded-lg">👥</span>
                            ${t('professor.management_overview')}
                        </h2>
                        <button class="text-sm font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors" @click=${() => this._showCreateClassModal = true}>
                            + ${t('professor.new_class')}
                        </button>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer group"
                                @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'students' }, bubbles: true, composed: true }))}>
                            <div class="flex justify-between items-start mb-4">
                                <div class="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                                </div>
                                <span class="text-3xl font-extrabold text-slate-900">${this._stats.totalStudents}</span>
                            </div>
                            <h3 class="font-bold text-slate-700">${t('professor.my_students')}</h3>
                            <p class="text-xs text-slate-400 mt-1">${t('professor.active_in_classes')}</p>
                        </div>

                        <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer group"
                                @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'classes' }, bubbles: true, composed: true }))}>
                            <div class="flex justify-between items-start mb-4">
                                <div class="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                                </div>
                                <span class="text-3xl font-extrabold text-slate-900">${this._stats.totalClasses}</span>
                            </div>
                            <h3 class="font-bold text-slate-700">${t('professor.my_classes')}</h3>
                            <p class="text-xs text-slate-400 mt-1">${t('professor.manage_groups')}</p>
                        </div>

                        <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer group"
                                @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'analytics' }, bubbles: true, composed: true }))}>
                            <div class="flex justify-between items-start mb-4">
                                <div class="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                                </div>
                                <span class="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded">${t('common.new')}</span>
                            </div>
                            <h3 class="font-bold text-slate-700">${t('professor.analytics')}</h3>
                            <p class="text-xs text-slate-400 mt-1">${t('professor.activity_overview')}</p>
                        </div>
                    </div>
                </section>

            </div>

            ${this._renderCreateClassModal()}
        `;
    }

    _renderCreateClassModal() {
        if (!this._showCreateClassModal) return null;
        const t = (key) => this.t(key);

        return html`
            <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                <div class="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm transform transition-all scale-100">
                    <h3 class="text-xl font-bold mb-1 text-slate-900">${t('professor.create_new_class')}</h3>
                    <p class="text-sm text-slate-500 mb-6">${t('professor.create_class_desc')}</p>
                    
                    <input
                        type="text"
                        class="w-full border-2 border-slate-200 rounded-xl p-3 mb-6 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all font-bold text-slate-700"
                        placeholder="Např. 4.A Fyzika"
                        .value=${this._newClassName}
                        @input=${e => this._newClassName = e.target.value}
                        @keypress=${e => e.key === 'Enter' && this._submitCreateClass()}
                        autofocus
                    >
                    <div class="flex justify-end gap-3">
                        <button class="px-4 py-2 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors" @click=${() => this._showCreateClassModal = false}>${t('common.cancel')}</button>
                        <button class="px-6 py-2 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/30 transition-all transform active:scale-95" @click=${this._submitCreateClass}>${t('common.save')}</button>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('professor-dashboard-view', ProfessorDashboardView);

import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';
import { translationService } from '../../utils/translation-service.js';
import { baseStyles } from '../../shared-styles.js';
import { handleLogout } from '../../auth.js';

export class ProfessorDashboardView extends LitElement {
    static properties = {
        _classes: { state: true, type: Array },
        _students: { state: true, type: Array },
        _lessons: { state: true, type: Array },
        _isLoading: { state: true, type: Boolean },
        _showCreateClassModal: { state: true, type: Boolean },
        _newClassName: { state: true, type: String }
    };

    // Use Light DOM to support global styles + manual injection of shared styles
    createRenderRoot() { return this; }

    static styles = [baseStyles];

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
        // Subscribe to language changes
        this._langUnsubscribe = translationService.subscribe(() => this.requestUpdate());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.unsubscribes.forEach(unsub => unsub());
        if (this._langUnsubscribe) {
            this._langUnsubscribe();
        }
    }

    _fetchDashboardData() {
        // Wrap in onAuthStateChanged to ensure we have a user
        const authUnsub = firebaseInit.auth.onAuthStateChanged(user => {
            if (!user) {
                // Not logged in or logged out
                this._isLoading = false;
                return;
            }

            this._isLoading = true;

            // Clear old listeners if any
            this.unsubscribes.forEach(unsub => unsub());
            this.unsubscribes = [];

            // Fetch Classes
            const classesQuery = query(collection(firebaseInit.db, 'groups'), where("ownerId", "==", user.uid));
            const classesUnsubscribe = onSnapshot(classesQuery, (snapshot) => {
                this._classes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }, err => console.error("Error fetching classes:", err));
            this.unsubscribes.push(classesUnsubscribe);

            // Fetch Students of this Professor
            const studentsQuery = query(collection(firebaseInit.db, 'students'), where("ownerId", "==", user.uid));
            const studentsUnsubscribe = onSnapshot(studentsQuery, (snapshot) => {
                this._students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }, err => console.error("Error fetching students:", err));
            this.unsubscribes.push(studentsUnsubscribe);

            // Fetch Lessons of this Professor
            const lessonsQuery = query(collection(firebaseInit.db, 'lessons'), where("ownerId", "==", user.uid));
            const lessonsUnsubscribe = onSnapshot(lessonsQuery, (snapshot) => {
                this._lessons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this._isLoading = false;
            }, err => {
                console.error("Error fetching lessons:", err);
                this._isLoading = false;
            });
            this.unsubscribes.push(lessonsUnsubscribe);

            // Safety timeout: If data fetching takes too long (e.g. emulator issues), force loading to false
            setTimeout(() => {
                if (this._isLoading) {
                    console.warn("Dashboard: Data fetch timed out or stalled. Forcing UI render.");
                    this._isLoading = false;
                }
            }, 2500);
        });

        // Add auth listener to unsubscribes so it gets cleaned up on disconnect
        this.unsubscribes.push(authUnsub);
    }

    get _stats() {
        const totalStudents = new Set(this._classes.flatMap(c => c.studentIds || [])).size;
        const activeLessons = this._lessons.filter(l => l.assignedToGroups && l.assignedToGroups.length > 0).length;
        const totalLessons = this._lessons.length;
        const totalClasses = this._classes.length;
        return { totalStudents, activeLessons, totalClasses, totalLessons };
    }

    _navigateToClassDetail(groupId) {
        this.dispatchEvent(new CustomEvent('navigate', {
            detail: { view: 'class-detail', groupId },
            bubbles: true,
            composed: true
        }));
    }

    _navigate(view) {
        this.dispatchEvent(new CustomEvent('navigate', {
            detail: { view },
            bubbles: true,
            composed: true
        }));
    }

    _handleLogout() {
        handleLogout();
    }

    _generateJoinCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    _openCreateClassModal() {
        this._newClassName = "";
        this._showCreateClassModal = true;
    }

    _closeCreateClassModal() {
        this._showCreateClassModal = false;
        this._newClassName = "";
    }

    async _submitCreateClass() {
        const className = this._newClassName.trim();
        if (!className) {
            // Fallback text if translation key missing
            const msg = translationService.t('dashboard.enter_class_name');
            showToast(msg === 'dashboard.enter_class_name' ? 'Zadejte název třídy' : msg, true);
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
            showToast(translationService.t('common.saved'));
            this._closeCreateClassModal();
        } catch (error) {
            console.error("Error creating class:", error);
            showToast(translationService.t('professor.error_create_class'), true);
        }
    }

    async _handleLanguageChange(e) {
        await translationService.setLanguage(e.target.value);
        window.location.reload();
    }

    render() {
        const t = (key) => translationService.t(key);
        if (this._isLoading) {
             return html`<div class="flex justify-center items-center h-full"><p class="text-xl text-slate-400 animate-pulse">${t('common.loading')}</p></div>`;
        }

        const user = firebaseInit.auth.currentUser;
        const userName = user?.displayName || user?.email || 'Profesore'; // Use static 'Profesore' as fallback

        return html`
            <style>
                ${baseStyles.cssText}

                /* Custom overrides for dashboard polish */
                .dashboard-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 24px 32px;
                    background: #fff;
                    border-bottom: 1px solid #e2e8f0;
                }
                .dashboard-content {
                    padding: 32px;
                    max-width: 1400px;
                    margin: 0 auto;
                }
            </style>

            <header class="dashboard-header">
                <div>
                    <h1 class="text-2xl font-bold text-slate-800">Učitelský panel</h1>
                    <p class="text-sm text-slate-500 mt-1">Dobré ráno, ${userName} 👋</p>
                </div>

                <div class="flex items-center gap-4">
                    <div class="hidden md:flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full border border-green-200 text-xs font-medium">
                        <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span>Systém je online</span>
                    </div>

                    <div class="relative flex items-center gap-3">
                         <div class="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-slate-100 px-3 py-2 rounded-full border border-slate-200 transition-colors">
                            <span class="text-xl">🇨🇿</span>
                            <span class="text-sm font-medium text-slate-700">Čeština</span>
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
                            </svg>
                         </div>
                    </div>

                    <button @click=${this._handleLogout} class="px-4 py-2 rounded-full border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all flex items-center gap-2">
                        <span>⏏️</span> <span>Odhlásit</span>
                    </button>
                </div>
            </header>

            <div class="dashboard-content">

                <section class="mb-10">
                    <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Přehled managementu</h2>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">

                        <div class="stat-card cursor-pointer hover:shadow-md transition-shadow" @click=${() => this._navigate('students')}>
                            <div class="stat-top">
                                <div class="stat-icon bg-blue-50 text-blue-600 rounded-xl w-10 h-10 flex items-center justify-center text-xl">👤</div>
                                <div class="stat-label text-slate-500 font-medium">Studenti</div>
                            </div>
                            <div class="stat-value text-3xl font-bold text-slate-800 mt-2">${this._stats.totalStudents}</div>
                            <div class="stat-footer text-xs text-slate-400 mt-2 flex justify-between">
                                <span>Aktivní ve vašich třídách</span>
                                <span class="text-indigo-600 font-medium hover:underline">Otevřít →</span>
                            </div>
                        </div>

                        <div class="stat-card cursor-pointer hover:shadow-md transition-shadow" @click=${() => this._navigate('classes')}>
                            <div class="stat-top">
                                <div class="stat-icon bg-purple-50 text-purple-600 rounded-xl w-10 h-10 flex items-center justify-center text-xl">🧑‍🏫</div>
                                <div class="stat-label text-slate-500 font-medium">Třídy</div>
                            </div>
                            <div class="stat-value text-3xl font-bold text-slate-800 mt-2">${this._stats.totalClasses}</div>
                            <div class="stat-footer text-xs text-slate-400 mt-2 flex justify-between">
                                <span>Během tohoto semestru</span>
                                <span class="text-indigo-600 font-medium hover:underline">Spravovat →</span>
                            </div>
                        </div>

                        <div class="stat-card cursor-pointer hover:shadow-md transition-shadow" @click=${() => this._navigate('timeline')}>
                            <div class="stat-top">
                                <div class="stat-icon bg-amber-50 text-amber-600 rounded-xl w-10 h-10 flex items-center justify-center text-xl">📖</div>
                                <div class="stat-label text-slate-500 font-medium">Lekce</div>
                            </div>
                            <div class="stat-value text-3xl font-bold text-slate-800 mt-2">${this._stats.totalLessons}</div>
                            <div class="stat-footer text-xs text-slate-400 mt-2 flex justify-between">
                                <span>V knihovně lekcí</span>
                                <span class="text-indigo-600 font-medium hover:underline">Knihovna →</span>
                            </div>
                        </div>

                    </div>
                </section>

                <section>
                    <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Tvůrčí studio</h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

                        <div @click=${() => this._navigate('editor')} class="group cursor-pointer p-6 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-200 hover:shadow-indigo-300 hover:-translate-y-1 transition-all relative overflow-hidden">
                            <div class="relative z-10">
                                <div class="text-3xl mb-3">✨</div>
                                <h3 class="text-lg font-bold">Magická lekce</h3>
                                <p class="text-indigo-100 text-xs mt-1">Vytvořit z PDF pomocí AI</p>
                            </div>
                            <div class="absolute -bottom-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-700"></div>
                        </div>

                        <div @click=${() => this._navigate('editor')} class="cursor-pointer p-6 rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 hover:-translate-y-1 transition-all">
                            <div class="text-3xl mb-3">🛠️</div>
                            <h3 class="text-lg font-bold text-slate-800">Manuální tvorba</h3>
                            <p class="text-slate-400 text-xs mt-1">Prázdný editor</p>
                        </div>

                        <div @click=${() => this._navigate('timeline')} class="cursor-pointer p-6 rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 hover:-translate-y-1 transition-all">
                            <div class="text-3xl mb-3">📚</div>
                            <h3 class="text-lg font-bold text-slate-800">Knihovna</h3>
                            <p class="text-slate-400 text-xs mt-1">Moje uložené lekce</p>
                        </div>

                        <div @click=${() => this._navigate('media')} class="cursor-pointer p-6 rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 hover:-translate-y-1 transition-all">
                            <div class="text-3xl mb-3">📂</div>
                            <h3 class="text-lg font-bold text-slate-800">Média & Soubory</h3>
                            <p class="text-slate-400 text-xs mt-1">Správce souborů</p>
                        </div>

                    </div>
                </section>

            </div>

            ${this._renderCreateClassModal(t)}
        `;
    }

    _renderCreateClassModal(t) {
        if (!this._showCreateClassModal) return null;

        return html`
            <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                <div class="bg-white rounded-2xl shadow-xl p-6 w-96">
                    <h3 class="text-lg font-bold mb-4">Vytvořit novou třídu</h3>
                    <input
                        type="text"
                        class="w-full border border-gray-300 rounded-lg p-2 mb-4"
                        placeholder="Název třídy (např. 4.A Fyzika)"
                        .value=${this._newClassName}
                        @input=${e => this._newClassName = e.target.value}
                    >
                    <div class="flex justify-end gap-2">
                        <button class="btn-ghost" @click=${this._closeCreateClassModal}>Zrušit</button>
                        <button class="btn-primary" @click=${this._submitCreateClass}>Uložit</button>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('professor-dashboard-view', ProfessorDashboardView);
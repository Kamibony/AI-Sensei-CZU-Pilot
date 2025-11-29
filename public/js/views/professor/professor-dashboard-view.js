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
            </style>
            <main class="main">
                <header class="topbar">
                    <div class="topbar-left">
                        <div class="topbar-title-row">
                            <div class="topbar-title">Učitelský panel</div>
                            <span style="font-size:13px;color:var(--text-muted);">Dobré ráno, ${userName} 👋</span>
                        </div>
                        <div class="topbar-sub">Zde máte rychlý přehled a akce pro dnešní den.</div>
                    </div>

                    <div class="topbar-right">
                        <div class="status-pill">
                            <span class="status-dot"></span>
                            <span>Systém je online</span>
                        </div>

                        <div class="topbar-controls">
                            <select class="lang-select-top" @change=${this._handleLanguageChange}>
                                <option value="cs" ?selected=${translationService.currentLanguage === 'cs'}>Čeština</option>
                                <option value="sk" ?selected=${translationService.currentLanguage === 'sk'}>Slovenčina</option>
                                <option value="en" ?selected=${translationService.currentLanguage === 'en'}>English</option>
                                <option value="pt-br" ?selected=${translationService.currentLanguage === 'pt-br'}>Português</option>
                            </select>

                            <button class="logout-top" @click=${handleLogout}>
                                <span>⏏</span>
                                <span>Odhlásit se</span>
                            </button>

                            <div class="user-badge">
                                <div class="user-avatar">${userName.charAt(0).toUpperCase()}</div>
                                <div>${user?.email}</div>
                            </div>
                        </div>
                    </div>
                </header>

                <section class="quick-actions">
                    <div class="qa-main">
                        <button class="btn-primary" @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'editor' }, bubbles: true, composed: true }))}>
                            <span class="icon">✨</span>
                            <span>Nová lekce z PDF</span>
                        </button>
                        <button class="btn-ghost" @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'classes' }, bubbles: true, composed: true }))}>
                            <span>🧑‍🏫</span>
                            <span>Otevřít Moje třídy</span>
                        </button>
                        <button class="btn-ghost" @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'timeline' }, bubbles: true, composed: true }))}>
                            <span>📚</span>
                            <span>Knihovna lekcí</span>
                        </button>
                    </div>
                    <div class="qa-hint">
                        Tip: Nahrajte PDF a nechte AI Sensei během pár vteřin vytvořit hotovou lekci.
                    </div>
                </section>

                <section class="grid">
                    <section>
                        <div class="card">
                            <div class="card-header">
                                <div>
                                    <div class="card-title">Přehled managementu</div>
                                    <div class="card-subtitle">Rychlý přístup ke studentům, třídám a lekcím.</div>
                                </div>
                            </div>

                            <div class="management-grid">
                                <div class="stat-card" @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'students' }, bubbles: true, composed: true }))}>
                                    <div class="stat-top">
                                        <div class="stat-icon">👤</div>
                                        <div class="stat-label">Studenti</div>
                                    </div>
                                    <div class="stat-value">${this._stats.totalStudents}</div>
                                    <div class="stat-footer">
                                        <span>Aktivní ve vašich třídách</span>
                                        <span class="link-inline">Otevřít studenty →</span>
                                    </div>
                                </div>

                                <div class="stat-card" @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'classes' }, bubbles: true, composed: true }))}>
                                    <div class="stat-top">
                                        <div class="stat-icon">🧑‍🏫</div>
                                        <div class="stat-label">Třídy</div>
                                    </div>
                                    <div class="stat-value">${this._stats.totalClasses}</div>
                                    <div class="stat-footer">
                                        <span>Během tohoto semestru</span>
                                        <span class="link-inline">Moje třídy →</span>
                                    </div>
                                </div>

                                <div class="stat-card" @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'timeline' }, bubbles: true, composed: true }))}>
                                    <div class="stat-top">
                                        <div class="stat-icon">📖</div>
                                        <div class="stat-label">Lekce</div>
                                    </div>
                                    <div class="stat-value">${this._stats.totalLessons}</div>
                                    <div class="stat-footer">
                                        <span>V knihovně lekcí</span>
                                        <span class="link-inline">Knihovna lekcí →</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Add Create Class Button directly here for visibility -->
                            <div class="mt-6 flex justify-end">
                                <button class="btn-ghost" @click=${this._openCreateClassModal}>
                                    <span>+</span>
                                    <span>Vytvořit třídu</span>
                                </button>
                            </div>
                        </div>
                    </section>

                    <aside>
                        <div class="lesson-flow-card">
                            <div class="flow-badge">Tvůrčí studio</div>
                            <div>
                                <div class="lesson-title">Nová Lekce</div>
                                <div class="lesson-sub">Automatizovaná tvorba pomocí AI – od PDF k hotové lekci.</div>
                            </div>

                            <div class="flow-steps">
                                <div class="flow-step badge">
                                    <div class="flow-icon">📄</div>
                                    <div>
                                        <div class="flow-label">Vstup</div>
                                        <div class="flow-main">PDF Dokumenty</div>
                                        <div class="flow-desc">Nahrajte prezentaci, skripta nebo pracovní list.</div>
                                    </div>
                                </div>

                                <div class="flow-step">
                                    <div class="flow-icon">⚡</div>
                                    <div>
                                        <div class="flow-label">Proces</div>
                                        <div class="flow-main">AI Generování</div>
                                        <div class="flow-desc">AI Sensei vytvoří strukturovanou lekci, aktivity a otázky.</div>
                                    </div>
                                </div>

                                <div class="flow-step result">
                                    <div class="flow-icon result">🎓</div>
                                    <div>
                                        <div class="flow-label">Výsledek</div>
                                        <div class="flow-main">Hotová Lekce</div>
                                        <div class="flow-desc">Lekce připravená k použití ve vaší třídě nebo online.</div>
                                    </div>
                                </div>
                            </div>

                            <div class="flow-divider"></div>

                            <button class="btn-primary btn-primary-wide" @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'editor' }, bubbles: true, composed: true }))}>
                                <span class="icon">✨</span>
                                <span>Magicky vygenerovat vše</span>
                            </button>
                        </div>
                    </aside>
                </section>

                ${this._renderCreateClassModal(t)}
            </main>
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

import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, getDocs, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Importy komponentov
import './professor-header.js';
import './lesson-library.js';
import './timeline-view.js';
import './professor-library-view.js';
import './professor-media-view.js';
import './lesson-editor.js';
import './professor-students-view.js';
import './professor-student-profile-view.js';
import './professor-interactions-view.js';
import './professor-analytics-view.js';
import './admin-user-management-view.js';
import './admin-settings-view.js';
import './admin-dashboard-view.js';

// Guide Bot
import '../../components/guide-bot.js';
import './navigation.js'; 

import './professor-dashboard-view.js';
import './professor-class-detail-view.js';
import './professor-classes-view.js';

import { handleLogout } from '../../auth.js';
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';

export class ProfessorApp extends LitElement {
    static properties = {
        _currentView: { state: true, type: String },
        _currentData: { state: true },
        _lessonsData: { state: true, type: Array },
        _sidebarVisible: { state: true, type: Boolean },
    };

    constructor() {
        super();
        this._currentView = 'dashboard';
        this._currentData = null;
        this._lessonsData = [];
        this._sidebarVisible = false;
    }

    // DÔLEŽITÉ: Používame Light DOM
    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        // Načítanie lekcií s oneskorením, aby sme mali istotu, že auth je ready
        setTimeout(() => this._fetchLessons(), 500);
        
        this._boundHandleNavigation = this._handleNavigation.bind(this);
        this._boundHandleAddToTimeline = this._handleAddToTimeline.bind(this);
        this._boundHandleHashChange = this._handleHashChange.bind(this);

        this.addEventListener('navigate', this._boundHandleNavigation);
        document.addEventListener('add-lesson-to-timeline', this._boundHandleAddToTimeline);
        window.addEventListener('hashchange', this._boundHandleHashChange);
        
        window.addEventListener('navigate', this._boundHandleNavigation);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('navigate', this._boundHandleNavigation);
        document.removeEventListener('add-lesson-to-timeline', this._boundHandleAddToTimeline);
        window.removeEventListener('hashchange', this._boundHandleHashChange);
        window.removeEventListener('navigate', this._boundHandleNavigation);
    }

    firstUpdated() {
        const logoutBtn = document.getElementById('logout-btn-nav');
        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

        this._handleHashChange();
    }

    _handleHashChange() {
        const hash = window.location.hash.slice(1);
        const [view, id] = hash.split('/');

        if (view === 'editor' && id) {
            if (!this._currentData || this._currentData.id !== id) {
                this._fetchLessonById(id).then(lesson => {
                    if (lesson) {
                        this._currentView = 'editor';
                        this._currentData = lesson;
                        this._updateBotContext('editor');
                    } else {
                        window.location.hash = 'dashboard';
                    }
                });
                return;
            }
        }

        if (view) {
            this._currentView = view;
            if (view !== 'editor') {
                this._currentData = null;
            }
            this._updateBotContext(view);
        } else {
            this._currentView = 'dashboard';
            this._updateBotContext('dashboard');
        }
    }

    async _fetchLessonById(id) {
        try {
            const db = firebaseInit.db;
            if (!db) return null; // Ak DB nie je ready, vrátime null
            
            const q = query(collection(db, 'lessons'), where('id', '==', id));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                const doc = querySnapshot.docs[0];
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.warn("Lekcia sa nenašla alebo chýbajú práva:", error);
            // Nevyhadzujeme toast, lebo to môže byť len problém s právami
            return null;
        }
    }

    async _fetchLessons() {
        try {
            const db = firebaseInit.db;
            if (!db) {
                console.warn("DB not ready yet.");
                return;
            }
            
            const q = query(collection(db, "lessons"), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            this._lessonsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            this._updateBotContext(this._currentView);
        } catch (error) {
            console.error("Error fetching lessons:", error);
            if (error.code === 'permission-denied') {
                showToast("Chyba oprávnení: Nemáte prístup k zoznamu lekcií.", "warning");
            }
        }
    }

    _handleNavigation(e) {
        const { view, ...data } = e.detail;
        
        if (!view && e.type === 'navigate') return; 

        this._currentView = view;
        if (Object.keys(data).length > 0) {
            this._currentData = data;
        } else if (view !== 'editor') {
            this._currentData = null;
        }
        
        this._updateBotContext(view);

        window.location.hash = view === 'editor' && this._currentData?.id ? `editor/${this._currentData.id}` : view;
    }

    _handleAddToTimeline(e) {
        const lesson = e.detail;
        this._currentData = lesson;
        this._currentView = 'timeline';
        window.location.hash = 'timeline';
        showToast(`Lekcia "${lesson.topic}" pridaná na časovú os.`);
    }

    _onAddNewLesson() {
        this._currentData = null;
        this._currentView = 'editor';
        window.location.hash = 'editor';
    }

    _onLessonCreatedOrUpdated(e) {
        // MERGE FIX
        this._currentData = { ...this._currentData, ...e.detail };
        
        if (this._currentView !== 'editor') {
            this._fetchLessons();
        }
        if (this._currentData.id && !window.location.hash.includes(this._currentData.id)) {
             window.location.hash = `editor/${this._currentData.id}`;
        }
    }

    _updateBotContext(view) {
        // FIX: Bezpečný prístup k botovi
        try {
            const bot = this.querySelector('#guide-bot');
            
            // Overíme, či bot existuje A či má metódu updateContext
            if (bot && typeof bot.updateContext === 'function') {
                const lessonsCount = this._lessonsData ? this._lessonsData.length : 0;
                bot.updateContext(view, { 
                    lessons: lessonsCount,
                    role: 'professor'
                });
            } else {
                // Tichý log pre debugging, ak bot ešte nie je ready
                // console.log("Bot not ready yet");
            }
        } catch (e) {
            console.warn("Bot context update failed silently:", e);
        }
    }

    render() {
        return html`
            <div class="flex h-screen bg-slate-50 overflow-hidden">
                <div class="w-64 flex-shrink-0 bg-white border-r border-slate-200 hidden md:block z-20">
                    <professor-navigation 
                        .activeView="${this._currentView}"
                        @navigate="${this._handleNavigation}">
                    </professor-navigation>
                </div>

                <div class="flex-1 flex flex-col h-full overflow-hidden relative">
                    
                    <professor-header 
                        .user="${firebaseInit.auth.currentUser}"
                        class="flex-shrink-0 z-10 bg-white border-b border-slate-200 shadow-sm">
                    </professor-header>

                    <main class="flex-1 overflow-y-auto p-6 md:p-8 relative">
                        <div class="max-w-7xl mx-auto h-full">
                            ${this._renderCurrentView()}
                        </div>
                    </main>
                    
                    <guide-bot id="guide-bot"></guide-bot>
                </div>
            </div>
        `;
    }

    _renderCurrentView() {
        switch (this._currentView) {
            case 'dashboard':
                return html`<professor-dashboard-view class="h-full flex flex-col"></professor-dashboard-view>`;
            case 'class-detail':
                return html`<professor-class-detail-view .classData="${this._currentData}"></professor-class-detail-view>`;
            case 'classes':
                return html`<professor-classes-view></professor-classes-view>`;
            case 'library':
                return html`
                    <professor-library-view 
                        .lessons="${this._lessonsData}"
                        @edit-lesson="${(e) => { 
                            this._currentData = e.detail; 
                            this._currentView = 'editor';
                            window.location.hash = `editor/${e.detail.id}`;
                        }}"
                        @add-new-lesson="${this._onAddNewLesson}">
                    </professor-library-view>
                `;
            case 'media':
                return html`<professor-media-view></professor-media-view>`;
            case 'editor':
                return html`
                    <lesson-editor 
                        .lesson="${this._currentData}"
                        @lesson-updated="${this._onLessonCreatedOrUpdated}"
                        @navigate="${this._handleNavigation}">
                    </lesson-editor>
                `;
            case 'timeline':
                return html`<timeline-view .lesson="${this._currentData}"></timeline-view>`;
            case 'students':
                return html`<professor-students-view></professor-students-view>`;
            case 'student-profile':
                return html`<professor-student-profile-view .studentId="${this._currentData?.id}"></professor-student-profile-view>`;
            case 'interactions':
                return html`<professor-interactions-view></professor-interactions-view>`;
            case 'analytics':
                return html`<professor-analytics-view></professor-analytics-view>`;
            case 'admin-users':
                return html`<admin-user-management-view></admin-user-management-view>`;
            case 'admin-settings':
                return html`<admin-settings-view></admin-settings-view>`;
            case 'admin-dashboard':
                return html`<admin-dashboard-view></admin-dashboard-view>`;

            default:
                return html`
                    <div class="flex flex-col items-center justify-center h-full text-slate-400">
                        <h2 class="text-xl font-semibold mb-2">Stránka nenájdená</h2>
                        <button @click="${() => this._currentView = 'dashboard'}" class="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">Späť na nástenku</button>
                    </div>
                `;
        }
    }
}

customElements.define('professor-app', ProfessorApp);

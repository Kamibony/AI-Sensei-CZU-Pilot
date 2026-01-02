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
import './admin-dashboard-view.js'; // Nový import pre Dashboard

import '../../components/guide-bot.js';
import './navigation.js'; 

// New Class-Centric Views
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

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._fetchLessons();
        
        this._boundHandleNavigation = this._handleNavigation.bind(this);
        this._boundHandleAddToTimeline = this._handleAddToTimeline.bind(this);
        this._boundHandleHashChange = this._handleHashChange.bind(this);

        this.addEventListener('navigate', this._boundHandleNavigation);
        document.addEventListener('add-lesson-to-timeline', this._boundHandleAddToTimeline);
        window.addEventListener('hashchange', this._boundHandleHashChange);
        
        // Globálny listener pre navigáciu z ľavého menu
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
        const navContainer = document.getElementById('main-nav');
        if (navContainer) {
            navContainer.innerHTML = '<professor-navigation></professor-navigation>';
        }

        const logoutBtn = document.getElementById('logout-btn-nav');
        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

        this._handleHashChange();
    }

    _handleHashChange() {
        const hash = window.location.hash.slice(1);
        const [view, id] = hash.split('/');

        if (view === 'editor' && id) {
            // Ak ideme priamo na URL editora s ID, musíme načítať dáta lekcie, ak ich nemáme
            if (!this._currentData || this._currentData.id !== id) {
                this._fetchLessonById(id).then(lesson => {
                    if (lesson) {
                        this._currentView = 'editor';
                        this._currentData = lesson;
                        // Notifikujeme guide bota o zmene kontextu
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
            // Update bot context
            this._updateBotContext(view);
        } else {
            this._currentView = 'dashboard';
            this._updateBotContext('dashboard');
        }
    }

    async _fetchLessonById(id) {
        try {
            const db = firebaseInit.getDb();
            const q = query(collection(db, 'lessons'), where('id', '==', id));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                const doc = querySnapshot.docs[0];
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error("Error fetching lesson by ID:", error);
            showToast("Chyba pri načítaní lekcie.", "error");
            return null;
        }
    }

    async _fetchLessons() {
        try {
            const db = firebaseInit.getDb();
            const q = query(collection(db, "lessons"), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            this._lessonsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            // Update bot with lessons count
            this._updateBotContext(this._currentView);
        } catch (error) {
            console.error("Error fetching lessons:", error);
            showToast("Nepodarilo sa načítať dáta lekcí.", true);
        }
    }

    _handleNavigation(e) {
        const { view, ...data } = e.detail;
        
        // If navigating from nav menu, e.detail might contain generic event data, ignore it if not intended
        if (!view && e.type === 'navigate') {
             // Toto ošetrí situáciu, ak event neobsahuje view (chyba v dispatch)
             return; 
        }

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
        this._currentData = null; // Reset pre novú lekciu
        this._currentView = 'editor';
        window.location.hash = 'editor';
    }

    _onLessonCreatedOrUpdated(e) {
        // FIX: Merge new data with existing data to prevent ID loss and navigation reset
        this._currentData = { ...this._currentData, ...e.detail };
        
        // Ak sme v editore, nevoláme fetchLessons, aby sme neprekreslili UI zbytočne
        if (this._currentView !== 'editor') {
            this._fetchLessons();
        }
        // Update URL if ID is available and not set
        if (this._currentData.id && !window.location.hash.includes(this._currentData.id)) {
             window.location.hash = `editor/${this._currentData.id}`;
        }
    }

    _updateBotContext(view) {
        const bot = this.shadowRoot.getElementById('guide-bot');
        if (bot) {
            // Safely get counts
            const lessonsCount = this._lessonsData ? this._lessonsData.length : 0;
            // Note: classes are managed in professor-classes-view, so we might not have access to them here directly 
            // unless we lift state up. For now, sending what we have.
            bot.updateContext(view, { 
                lessons: lessonsCount,
                role: 'professor'
            });
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
            
            // Admin Views
            case 'admin-users':
                return html`<admin-user-management-view></admin-user-management-view>`;
            case 'admin-settings':
                return html`<admin-settings-view></admin-settings-view>`;
            case 'admin-dashboard':
                return html`<admin-dashboard-view></admin-dashboard-view>`;

            default:
                return html`
                    <div class="flex flex-col items-center justify-center h-full text-slate-400">
                        <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <h2 class="text-xl font-semibold mb-2">Stránka nenájdená</h2>
                        <p>Požadovaná stránka "${this._currentView}" neexistuje.</p>
                        <button @click="${() => this._currentView = 'dashboard'}" class="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">Späť na nástenku</button>
                    </div>
                `;
        }
    }
}

customElements.define('professor-app', ProfessorApp);

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

// === DÔLEŽITÁ ZMENA: Importujeme nový navigačný komponent ako vedľajší efekt ===
import './navigation.js'; 
// ==============================================================================

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
        
        // Globálny listener pre navigáciu z ľavého menu (ktoré je teraz mimo Shadow DOM tohto prvku v niektorých prípadoch, ale tu sme v Light DOM)
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
        // === OPRAVA: Odstránené volanie neexistujúcej funkcie setupProfessorNav ===
        // Namiesto toho vložíme komponent <professor-navigation> do kontajnera #main-nav
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
        if (!hash) {
            if (this._currentView !== 'dashboard') {
                this._showProfessorContent('dashboard');
            }
            return;
        }

        const [view, queryStr] = hash.split('?');
        const params = new URLSearchParams(queryStr);
        const data = {};
        for (const [key, value] of params.entries()) {
            data[key] = value;
        }

        if (view === 'class-detail' && data.groupId) {
             this._showProfessorContent(view, data);
        } else if (view === 'student-profile' && data.studentId) {
             this._showProfessorContent(view, data.studentId);
        } else if (view === 'editor') {
             this._showProfessorContent(view, data.id ? { id: data.id } : null);
        } else {
             this._showProfessorContent(view, data);
        }

        // Synchronizácia stavu navigácie
        const nav = document.querySelector('professor-navigation');
        if (nav) {
            nav.currentView = view;
        }
    }

    async _fetchLessons() {
        try {
            const user = firebaseInit.auth.currentUser;
            if (!user) {
                this._lessonsData = [];
                return;
            }

            const lessonsCollection = collection(firebaseInit.db, 'lessons');
            let lessonQuery;

            if (user.email === 'profesor@profesor.cz') {
                lessonQuery = query(lessonsCollection, orderBy("createdAt"));
            } else {
                lessonQuery = query(lessonsCollection, where("ownerId", "==", user.uid), orderBy("createdAt"));
            }

            const querySnapshot = await getDocs(lessonQuery);
            this._lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        } catch (error) {
            console.error("Error fetching lessons:", error);
            showToast("Nepodařilo se načíst data lekcí.", true);
        }
    }

    _handleNavigation(e) {
        // Ignorujeme udalosť, ak prišla z tohto istého komponentu (aby sme sa nezacyklili), 
        // ale v Light DOM to nie je taký problém. Hlavne chceme zachytiť bublajúce eventy.
        const { view, ...data } = e.detail;

        let newHash = `#${view}`;
        const params = new URLSearchParams();

        if (data) {
            if (data.groupId) params.set('groupId', data.groupId);
            if (data.studentId) params.set('studentId', data.studentId);
            if (typeof data === 'string') {
                 if (view === 'student-profile') params.set('studentId', data);
            }
        }

        const paramStr = params.toString();
        if (paramStr) {
            newHash += `?${paramStr}`;
        }

        if (window.location.hash !== newHash) {
             history.pushState(null, '', newHash);
        }

        const nav = document.querySelector('professor-navigation');
        if (nav) {
            nav.currentView = view;
        }

        this._showProfessorContent(view, data);
    }

    _showProfessorContent(view, data = null) {
        const fullWidthViews = ['dashboard', 'class-detail', 'students', 'student-profile', 'interactions', 'analytics', 'media', 'editor', 'classes', 'admin', 'admin-settings', 'timeline', 'library'];
        this._sidebarVisible = !fullWidthViews.includes(view);
        if (view === 'timeline') this._fetchLessons();
        this._currentView = view;
        this._currentData = data;
    }

    _onLessonSelected(e) { this._showProfessorContent('editor', e.detail); }
    _onAddNewLesson() { this._showProfessorContent('editor', null); }
    _onLessonCreatedOrUpdated(e) {
        this._currentData = e.detail;
        if (this._currentView !== 'editor') this._fetchLessons();
    }
    _onNavigateToProfile(e) { this._showProfessorContent('student-profile', e.detail.studentId); }
    _onBackToList() { this._showProfessorContent('students'); }
    _onEditorExit(e) {
        // Allow passing a target view on exit, default to library if not provided or if it was dashboard
        const targetView = e.detail?.view || 'library';
        this._showProfessorContent(targetView);
    }

    _handleAddToTimeline(e) {
        const lesson = e.detail;
        if (this._currentView !== 'timeline') {
            this._showProfessorContent('timeline');
            setTimeout(() => {
                 const timelineView = this.querySelector('professor-timeline-view');
                 if (timelineView) timelineView.requestUpdate(); // Timeline si načíta dáta sám
            }, 500);
        }
    }

    render() {
        return html`
            <div id="dashboard-professor" class="w-full flex flex-row main-view active h-screen overflow-hidden">
                <aside id="professor-sidebar"
                       class="w-full md:w-80 lg:w-96 bg-slate-100 border-r border-slate-200 flex-col flex-shrink-0 h-full ${this._sidebarVisible ? 'flex' : 'hidden'} overflow-hidden z-10">
                    ${this._renderSidebar()}
                </aside>

                <div class="flex-grow flex flex-col h-full overflow-hidden">
                    ${this._currentView !== 'dashboard' ? html`<professor-header></professor-header>` : ''}

                    <main id="main-content-area" class="flex-grow bg-slate-50 flex flex-col h-full overflow-hidden">
                        ${this._renderMainContent()}
                    </main>
                </div>
            </div>
        `;
    }

    _renderSidebar() {
        if (this._sidebarVisible) {
             return html`<lesson-library
                            class="h-full flex flex-col"
                            .lessonsData=${this._lessonsData}
                            @lesson-selected=${this._onLessonSelected}
                            @add-new-lesson=${this._onAddNewLesson}>
                        </lesson-library>`;
        }
        return html``;
    }

    _renderMainContent() {
        switch (this._currentView) {
            case 'dashboard': return html`<professor-dashboard-view class="h-full flex flex-col"></professor-dashboard-view>`;
            case 'class-detail': return html`<professor-class-detail-view class="h-full flex flex-col" .groupId=${this._currentData?.groupId}></professor-class-detail-view>`;
            case 'classes': return html`<professor-classes-view class="h-full flex flex-col"></professor-classes-view>`;
            case 'library': return html`<professor-library-view class="h-full flex flex-col"></professor-library-view>`;
            case 'timeline': return html`<professor-timeline-view class="h-full flex flex-col" .lessonsData=${this._lessonsData}></professor-timeline-view>`;
            case 'media': return html`<professor-media-view class="h-full flex flex-col"></professor-media-view>`;
            case 'editor': return html`<lesson-editor class="h-full flex flex-col" .lesson=${this._currentData} @lesson-updated=${this._onLessonCreatedOrUpdated} @editor-exit=${this._onEditorExit}></lesson-editor>`;
            case 'students': return html`<professor-students-view class="h-full flex flex-col" @navigate-to-profile=${this._onNavigateToProfile}></professor-students-view>`;
            case 'student-profile': return html`<professor-student-profile-view class="h-full flex flex-col" .studentId=${this._currentData} @back-to-list=${this._onBackToList}></professor-student-profile-view>`;
            case 'interactions': return html`<professor-interactions-view class="flex flex-grow h-full"></professor-interactions-view>`;
            case 'analytics': return html`<professor-analytics-view class="h-full flex flex-col"></professor-analytics-view>`;
            case 'admin': return html`<admin-user-management-view class="h-full flex flex-col"></admin-user-management-view>`;
            case 'admin-settings': return html`<admin-settings-view class="h-full flex flex-col"></admin-settings-view>`;
            default: return html`<professor-dashboard-view class="h-full flex flex-col"></professor-dashboard-view>`;
        }
    }
}
customElements.define('professor-app', ProfessorApp);

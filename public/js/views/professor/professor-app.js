// public/js/views/professor/professor-app.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, getDocs, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Importy komponentov
import './professor-header.js';
import './lesson-library.js';
import './timeline-view.js';
import './professor-media-view.js';
import './lesson-editor.js';
import './professor-students-view.js';
import './professor-student-profile-view.js';
import './professor-interactions-view.js';
import './professor-analytics-view.js';
import './admin-user-management-view.js';

// New Class-Centric Views
import './professor-dashboard-view.js';
import './professor-class-detail-view.js';
import './professor-classes-view.js';


import { setupProfessorNav } from './navigation.js';
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
        this._currentView = 'dashboard'; // Default to the new dashboard
        this._currentData = null;
        this._lessonsData = [];
        this._sidebarVisible = false; // Dashboard is full-width
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._fetchLessons();
        this.addEventListener('navigate', this._handleNavigation);
        document.addEventListener('add-lesson-to-timeline', this._handleAddToTimeline.bind(this));
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('navigate', this._handleNavigation);
        document.removeEventListener('add-lesson-to-timeline', this._handleAddToTimeline.bind(this));
    }

    firstUpdated() {
        setupProfessorNav(this._showProfessorContent.bind(this));
        const logoutBtn = document.getElementById('logout-btn-nav');
        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
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
            console.error("Error fetching lessons for app: ", error);
            showToast("Nepodařilo se načíst data lekcí.", true);
        }
    }

    _handleNavigation(e) {
        const { view, ...data } = e.detail;
        this._showProfessorContent(view, data);
    }

    _showProfessorContent(view, data = null) {
        const fullWidthViews = ['dashboard', 'class-detail', 'students', 'student-profile', 'interactions', 'analytics', 'media', 'editor', 'classes', 'admin'];
        this._sidebarVisible = !fullWidthViews.includes(view);
        if (view === 'timeline') this._fetchLessons(); // Keep for legacy nav
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
    _onEditorExit() { this._showProfessorContent('dashboard'); } // Go back to dashboard after editing

    _handleAddToTimeline(e) {
        const lesson = e.detail;
        if (this._currentView !== 'timeline') {
            this._showProfessorContent('timeline');
            setTimeout(() => {
                 const timelineView = this.querySelector('professor-timeline-view');
                 if (timelineView) timelineView.addLessonToFirstAvailableSlot(lesson);
            }, 500);
        } else {
            const timelineView = this.querySelector('professor-timeline-view');
            if (timelineView) timelineView.addLessonToFirstAvailableSlot(lesson);
        }
    }

    render() {
        // Changed: Added pl-64 to accommodate the fixed sidebar
        return html`
            <div id="dashboard-professor" class="pl-64 w-full flex flex-row main-view active h-screen overflow-hidden">
                <aside id="professor-sidebar"
                       class="w-full md:w-80 lg:w-96 bg-slate-100 border-r border-slate-200 flex-col flex-shrink-0 h-full ${this._sidebarVisible ? 'flex' : 'hidden'} overflow-hidden z-10">
                    ${this._renderSidebar()}
                </aside>

                <div class="flex-grow flex flex-col h-full overflow-hidden">
                    <professor-header></professor-header>
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
            case 'class-detail': return html`<professor-class-detail-view class="h-full flex flex-col" .groupId=${this._currentData.groupId}></professor-class-detail-view>`;
            case 'classes': return html`<professor-classes-view class="h-full flex flex-col"></professor-classes-view>`;
            case 'timeline': return html`<professor-timeline-view class="h-full flex flex-col" .lessonsData=${this._lessonsData}></professor-timeline-view>`;
            case 'media': return html`<professor-media-view class="h-full flex flex-col"></professor-media-view>`;
            case 'editor': return html`<lesson-editor class="h-full flex flex-col" .lesson=${this._currentData} @lesson-updated=${this._onLessonCreatedOrUpdated} @editor-exit=${this._onEditorExit}></lesson-editor>`;
            case 'students': return html`<professor-students-view class="h-full flex flex-col" @navigate-to-profile=${this._onNavigateToProfile}></professor-students-view>`;
            case 'student-profile': return html`<professor-student-profile-view class="h-full flex flex-col" .studentId=${this._currentData} @back-to-list=${this._onBackToList}></professor-student-profile-view>`;
            case 'interactions': return html`<professor-interactions-view class="flex flex-grow h-full"></professor-interactions-view>`;
            case 'analytics': return html`<professor-analytics-view class="h-full flex flex-col"></professor-analytics-view>`;
            case 'admin': return html`<admin-user-management-view class="h-full flex flex-col"></admin-user-management-view>`;
            case 'chat': return html`<div><h2>Chat s ${this._currentData.studentId}</h2></div>`;
            case 'class-settings': return html`<div><h2>Nastavení třídy ${this._currentData.groupId}</h2></div>`;
            default: return html`<professor-dashboard-view class="h-full flex flex-col"></professor-dashboard-view>`;
        }
    }
}
customElements.define('professor-app', ProfessorApp);

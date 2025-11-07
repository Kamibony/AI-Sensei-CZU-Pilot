// public/js/views/professor/professor-app.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Importy komponentov
import './lesson-library.js';
import './timeline-view.js';
import './professor-media-view.js';
import './lesson-editor.js';
import './professor-students-view.js';
import './professor-student-profile-view.js';
import './professor-interactions-view.js';
import './professor-analytics-view.js';

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
        this._currentView = 'timeline';
        this._currentData = null;
        this._lessonsData = [];
        this._sidebarVisible = true;
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._fetchLessons();
        document.addEventListener('add-lesson-to-timeline', this._handleAddToTimeline.bind(this));
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener('add-lesson-to-timeline', this._handleAddToTimeline.bind(this));
    }

    firstUpdated() {
        setupProfessorNav(this._showProfessorContent.bind(this));
        const logoutBtn = document.getElementById('logout-btn-nav');
        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    }

    async _fetchLessons() {
        try {
            const lessonsCollection = collection(firebaseInit.db, 'lessons');
            const querySnapshot = await getDocs(query(lessonsCollection, orderBy("createdAt")));
            this._lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching lessons for app: ", error);
            showToast("Nepodařilo se načíst data lekcí.", true);
        }
    }

    _showProfessorContent(view, data = null) {
        const fullWidthViews = ['students', 'student-profile', 'interactions', 'analytics', 'media', 'editor'];
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
    _onEditorExit() { this._showProfessorContent('timeline'); }

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
        return html`
            <div id="dashboard-professor" class="w-full flex flex-row main-view active h-screen overflow-hidden">
                <aside id="professor-sidebar"
                       class="w-full md:w-80 lg:w-96 bg-slate-100 border-r border-slate-200 flex-col flex-shrink-0 h-full ${this._sidebarVisible ? 'flex' : 'hidden'} overflow-hidden z-10">
                    ${this._renderSidebar()}
                </aside>

                <main id="main-content-area" class="flex-grow bg-slate-50 flex flex-col h-full overflow-hidden">
                    ${this._renderMainContent()}
                </main>
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
            case 'timeline': return html`<professor-timeline-view class="h-full flex flex-col" .lessonsData=${this._lessonsData}></professor-timeline-view>`;
            case 'media': return html`<professor-media-view class="h-full flex flex-col"></professor-media-view>`;
            case 'editor': return html`<lesson-editor class="h-full flex flex-col" .lesson=${this._currentData} @lesson-updated=${this._onLessonCreatedOrUpdated} @editor-exit=${this._onEditorExit}></lesson-editor>`;
            case 'students': return html`<professor-students-view class="h-full flex flex-col" @navigate-to-profile=${this._onNavigateToProfile}></professor-students-view>`;
            case 'student-profile': return html`<professor-student-profile-view class="h-full flex flex-col" .studentId=${this._currentData} @back-to-list=${this._onBackToList}></professor-student-profile-view>`;
            case 'interactions': return html`<professor-interactions-view class="flex flex-grow h-full"></professor-interactions-view>`;
            case 'analytics': return html`<professor-analytics-view class="h-full flex flex-col"></professor-analytics-view>`;
            default: return html`<professor-timeline-view class="h-full flex flex-col" .lessonsData=${this._lessonsData}></professor-timeline-view>`;
        }
    }
}
customElements.define('professor-app', ProfessorApp);

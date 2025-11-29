import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { baseStyles } from '../../shared-styles.js';
import './student-navigation.js';
import './student-dashboard-view.js';
import './student-interactions-view.js';
import '../../student/student-lesson-detail.js';

export class StudentApp extends LitElement {
    static styles = [baseStyles, css`
        :host { display: block; height: 100vh; overflow: hidden; }
        .app-layout {
            display: grid;
            grid-template-columns: 260px 1fr; /* Fixed Sidebar + Content */
            height: 100%;
            background: var(--bg-main, #f8fafc);
        }
        main { overflow-y: auto; padding: 2rem; position: relative; }
        @media (max-width: 768px) { .app-layout { grid-template-columns: 1fr; } }
    `];

    static properties = {
        currentView: { type: String },
        selectedLessonId: { type: String }
    };

    constructor() {
        super();
        this.currentView = 'dashboard';
        this.selectedLessonId = null;
    }

    connectedCallback() {
        super.connectedCallback();
        // Listen for lesson selection from dashboard
        this.addEventListener('lesson-selected', this._handleLessonSelected);
        // Listen for back navigation from detail
        this.addEventListener('back-to-list', this._handleBackToList);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('lesson-selected', this._handleLessonSelected);
        this.removeEventListener('back-to-list', this._handleBackToList);
    }

    _handleLessonSelected(e) {
        this.selectedLessonId = e.detail.lessonId;
        this.currentView = 'lessonDetail';
    }

    _handleBackToList() {
        this.selectedLessonId = null;
        this.currentView = 'dashboard';
    }

    render() {
        return html`
            <div class="app-layout">
                <student-navigation class="hidden md:block"
                    .activeView=${this.currentView}
                    @navigate=${(e) => this.currentView = e.detail.view}>
                </student-navigation>

                <main>
                    ${this.renderCurrentView()}
                </main>
            </div>
        `;
    }

    renderCurrentView() {
        switch (this.currentView) {
            case 'dashboard':
            case 'classes':
                return html`<student-dashboard-view></student-dashboard-view>`;
            case 'interactions':
                return html`<student-interactions-view></student-interactions-view>`;
            case 'lessonDetail':
                return html`<student-lesson-detail .lessonId=${this.selectedLessonId}></student-lesson-detail>`;
            default:
                return html`<student-dashboard-view></student-dashboard-view>`;
        }
    }
}
customElements.define('student-app', StudentApp);

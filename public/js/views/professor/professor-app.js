// public/js/views/professor/professor-app.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
// Odstránili sme import httpsCallable a query
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Importy komponentov
import './lesson-library.js';
import './timeline-view.js';
import './professor-media-view.js'; 
import './lesson-editor-menu.js'; 
import './lesson-editor.js'; 
import './professor-students-view.js'; // === PRIDANÝ IMPORT ===
import './professor-student-profile-view.js'; // === PRIDANÝ IMPORT ===
import './professor-interactions-view.js'; // === PRIDANÝ IMPORT ===
import './professor-analytics-view.js'; // === PRIDANÝ IMPORT ===

// Importy pôvodných procedurálnych funkcií sú PREČ
// import { renderStudentsView } from './students-view.js';
// import { renderStudentProfile } from './student-profile-view.js';
// import { renderStudentInteractions } from './interactions-view.js';
import { setupProfessorNav } from './navigation.js'; // Tento zostáva
import { handleLogout } from '../../auth.js'; // Tento zostáva
import * as firebaseInit from '../../firebase-init.js'; // Tento zostáva pre fetchLessons
import { showToast } from '../../utils.js'; // Tento zostáva

export class ProfessorApp extends LitElement {
    static properties = {
        _currentView: { state: true, type: String },
        _currentData: { state: true }, // Pre lekciu alebo ID študenta
        _currentEditorView: { state: true, type: String }, 
        _lessonsData: { state: true, type: Array },
        _sidebarComponent: { state: true, type: String },
    };

    constructor() {
        super();
        this._currentView = 'timeline';
        this._currentData = null;
        this._currentEditorView = 'details'; 
        this._lessonsData = [];
        this._sidebarComponent = 'library'; 
        
        // Unsubscribe handlery už nie sú potrebné
        // this.conversationsUnsubscribe = null;
        // this.studentsUnsubscribe = null;
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this._fetchLessons(); 
    }
    
    firstUpdated() {
        setupProfessorNav(this._showProfessorContent.bind(this));
        const logoutBtn = document.getElementById('logout-btn-nav');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }
    }

    // disconnectedCallback už nie je potrebný

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
    
    // Zjednodušená metóda - už nemusí manažovať unsubscribe
    _showProfessorContent(view, data = null) {
        const fullWidthViews = ['students', 'student-profile', 'interactions', 'analytics', 'media'];
        
        if (fullWidthViews.includes(view)) {
             this._sidebarComponent = 'none';
        } else {
             this._sidebarComponent = (view === 'editor') ? 'editor' : 'library';
        }

        if (view === 'editor' && this._currentView !== 'editor') {
            this._currentEditorView = 'details';
        }
        if (view === 'timeline') {
             this._fetchLessons();
        }

        this._currentView = view;
        this._currentData = data; // Uložíme ID študenta alebo objekt lekcie
    }

    // --- Event Handlery ---
    _onLessonSelected(e) {
        this._showProfessorContent('editor', e.detail);
    }
    
    _onAddNewLesson() {
        this._showProfessorContent('editor', null);
    }

    _onEditorViewChanged(e) {
        this._currentEditorView = e.detail.view;
    }

    _onBackToTimeline() {
        this._showProfessorContent('timeline');
    }
    
    _onLessonCreatedOrUpdated(e) {
        this._currentData = e.detail; // Aktualizujeme lekciu
        this._fetchLessons(); // Znovu načítame knižnicu
    }
    
    // Nový handler pre navigáciu zo zoznamu študentov na profil
    _onNavigateToProfile(e) {
        this._showProfessorContent('student-profile', e.detail.studentId);
    }
    
    // Nový handler pre návrat z profilu na zoznam
    _onBackToList() {
         this._showProfessorContent('students');
    }

    // --- Renderovacie Metódy ---

    render() {
        return html`
            <div id="dashboard-professor" class="w-full flex main-view active h-screen">
                <aside id="professor-sidebar" 
                       class="w-full md:w-80 lg:w-96 bg-slate-100 border-r border-slate-200 flex-col flex-shrink-0 h-full ${this._sidebarComponent === 'none' ? 'hidden' : 'flex'}">
                    ${this._renderSidebar()}
                </aside>
                <main id="main-content-area" class="flex-grow bg-slate-50 flex flex-col h-screen overflow-y-auto">
                    ${this._renderMainContent()}
                </main>
            </div>
        `;
    }

    _renderSidebar() {
        switch (this._sidebarComponent) {
            case 'library':
                return html`<lesson-library 
                                .lessonsData=${this._lessonsData}
                                @lesson-selected=${this._onLessonSelected}
                                @add-new-lesson=${this._onAddNewLesson}>
                            </lesson-library>`;
            case 'editor':
                return html`<lesson-editor-menu
                                .lesson=${this._currentData}
                                .activeView=${this._currentEditorView}
                                @view-changed=${this._onEditorViewChanged}
                                @back-to-timeline=${this._onBackToTimeline}>
                            </lesson-editor-menu>`;
            case 'none':
            default:
                return html``; 
        }
    }

    // === ZMENA: Všetky pohľady sú teraz komponenty ===
    _renderMainContent() {
        switch (this._currentView) {
            case 'timeline':
                return html`<professor-timeline-view .lessonsData=${this._lessonsData}></professor-timeline-view>`;
            case 'media':
                return html`<professor-media-view></professor-media-view>`;
            case 'editor':
                return html`<lesson-editor
                                .lesson=${this._currentData}
                                .view=${this._currentEditorView}
                                @lesson-updated=${this._onLessonCreatedOrUpdated}>
                            </lesson-editor>`;
            case 'students':
                return html`<professor-students-view @navigate-to-profile=${this._onNavigateToProfile}></professor-students-view>`;
            case 'student-profile':
                // Odovzdáme ID študenta ako property
                return html`<professor-student-profile-view .studentId=${this._currentData} @back-to-list=${this._onBackToList}></professor-student-profile-view>`;
            case 'interactions':
                // Tento komponent si spravuje vnútorný stav sám
                return html`<professor-interactions-view class="flex flex-grow h-full"></professor-interactions-view>`;
            case 'analytics':
                 // Tento komponent si spravuje vnútorný stav sám
                return html`<professor-analytics-view></professor-analytics-view>`;
            default:
                // Fallback
                return html`<professor-timeline-view .lessonsData=${this._lessonsData}></professor-timeline-view>`;
        }
    }
    
    // === ZMENA: Metóda updated() je ODOBRANÁ ===
    // Už nie je potrebná, pretože všetky pohľady sú komponenty a spravujú sa samé.

    // === ZMENA: Metódy pre analýzu sú ODOBRANÉ ===
    // _renderAnalytics, _createStatCard a _getGlobalAnalyticsCallable sú preč.
}

customElements.define('professor-app', ProfessorApp);

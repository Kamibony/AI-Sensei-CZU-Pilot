// public/js/views/professor/professor-app.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Importy komponentov
import './lesson-library.js';
import './timeline-view.js';
// ... ďalšie komponenty prídu sem, keď budú prerobené

// Importy pôvodných procedurálnych funkcií
import { renderEditorMenu } from '../../editor-handler.js';
import { initializeCourseMediaUpload } from '../../upload-handler.js';
import { setupProfessorNav } from './navigation.js';
import { renderStudentsView } from './students-view.js';
import { renderStudentProfile } from './student-profile-view.js';
import { renderStudentInteractions } from './interactions-view.js';
import { handleLogout } from '../../auth.js';
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';

export class ProfessorApp extends LitElement {
    static properties = {
        _currentView: { state: true, type: String },
        _currentData: { state: true },
        _lessonsData: { state: true, type: Array },
        _sidebarComponent: { state: true, type: String },
    };

    constructor() {
        super();
        this._currentView = 'timeline';
        this._currentData = null;
        this._lessonsData = [];
        this._sidebarComponent = 'library'; // 'library', 'editor', 'none'
        
        this.conversationsUnsubscribe = null;
        this.studentsUnsubscribe = null;
    }

    // Kľúčové: Povieme Lit, aby renderoval do Light DOM
    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        // Načítame dáta lekcií, ktoré potrebuje <professor-timeline-view> a <lesson-library>
        this._fetchLessons(); 
    }
    
    firstUpdated() {
        // Presunuté z connectedCallback, aby sa zaistilo, že <nav> existuje
        setupProfessorNav(this._showProfessorContent.bind(this));
        const logoutBtn = document.getElementById('logout-btn-nav');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.conversationsUnsubscribe) { this.conversationsUnsubscribe(); }
        if (this.studentsUnsubscribe) { this.studentsUnsubscribe(); }
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
        if (this.conversationsUnsubscribe) { this.conversationsUnsubscribe(); this.conversationsUnsubscribe = null; }
        if (this.studentsUnsubscribe) { this.studentsUnsubscribe(); this.studentsUnsubscribe = null; }

        const fullWidthViews = ['students', 'student-profile', 'interactions', 'analytics', 'media'];
        
        if (fullWidthViews.includes(view)) {
             this._sidebarComponent = 'none';
        } else {
             this._sidebarComponent = (view === 'editor') ? 'editor' : 'library';
        }

        this._currentView = view;
        this._currentData = data;
        
        if (this._sidebarComponent === 'library' || view === 'timeline') {
             // Znovu načítame lekcie pre knižnicu A timeline
             this._fetchLessons();
        }
    }

    // --- Event Handlery ---
    _onLessonSelected(e) {
        this._showProfessorContent('editor', e.detail);
    }
    
    _onAddNewLesson() {
        this._showProfessorContent('editor', null);
    }

    // --- Renderovacie Metódy ---

    render() {
        // Renderuje hlavný layout, ktorý bol predtým v `initProfessorDashboard`
        // Toto je JEDINÉ miesto, kde sa deklaruje štruktúra.
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
                return html`<div id="editor-sidebar-container" class="w-full h-full flex flex-col"></div>`;
            case 'none':
            default:
                return html``; // Prázdne
        }
    }

    _renderMainContent() {
        // Renderujeme buď nový komponent, alebo PRÁZDNY kontajner pre staré funkcie
        switch (this._currentView) {
            case 'timeline':
                return html`<professor-timeline-view .lessonsData=${this._lessonsData}></professor-timeline-view>`;
            case 'editor':
                // `showEditorContent` sa volá v `updated`
                return html``; 
            case 'student-profile':
                return html`<div id="student-profile-container" class="w-full h-full"></div>`;
            case 'media':
                return html`<div id="media-container" class="w-full h-full"></div>`;
            case 'students':
                return html`<div id="students-container" class="w-full h-full"></div>`;
            case 'interactions':
                return html`<div id="interactions-container" class="w-full h-full"></div>`;
            case 'analytics':
                return html`<div id="analytics-container" class="w-full h-full"></div>`;
            default:
                return html`<professor-timeline-view .lessonsData=${this._lessonsData}></professor-timeline-view>`;
        }
    }

    // --- updated() - Most medzi Lit a starým kódom ---
    
    // Táto funkcia sa spustí po každom `render()`
    // **OPRAVENÁ LOGIKA:** Už nemanipulujeme `mainArea.innerHTML`.
    // Iba nájdeme kontajnery, ktoré `render()` vytvoril, a odovzdáme ich starým funkciám.
    updated(changedProperties) {
        if (changedProperties.has('_currentView') || changedProperties.has('_currentData')) {
            
            // Volanie starých procedurálnych funkcií
            switch (this._currentView) {
                case 'editor':
                    const sidebarContainer = this.querySelector('#editor-sidebar-container');
                    if(sidebarContainer) {
                        renderEditorMenu(sidebarContainer, this._currentData); 
                        // `renderEditorMenu` potom zavolá `showEditorContent`, ktorý vyplní `main-content-area`
                    }
                    break;
                case 'student-profile':
                    const profileContainer = this.querySelector('#student-profile-container');
                    if (profileContainer) { // Vždy kontrolujeme, či kontajner existuje
                        const backToStudentsList = () => this._showProfessorContent('students');
                        renderStudentProfile(profileContainer, this._currentData, backToStudentsList);
                    }
                    break;
                case 'media':
                    const mediaContainer = this.querySelector('#media-container');
                    if (mediaContainer) {
                        // Stará funkcia neexistovala, takže jej obsah bol v `showProfessorContent`
                        // Tento obsah musíme vložiť do kontajnera
                        mediaContainer.innerHTML = `<header class="text-center p-6 border-b border-slate-200 bg-white"><h1 class="text-3xl font-extrabold text-slate-800">Knihovna médií</h1><p class="text-slate-500 mt-1">Spravujte všechny soubory pro váš kurz na jednom místě.</p></header>
                                              <div class="flex-grow overflow-y-auto p-4 md:p-6">
                                                <div id="course-media-library-container" class="bg-white p-6 rounded-2xl shadow-lg">
                                                    <p class="text-slate-500 mb-4">Nahrajte soubory (PDF), které chcete použít pro generování obsahu.</p>
                                                    <div id="course-media-upload-area" class="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center text-slate-500 cursor-pointer hover:bg-green-50 hover:border-green-400">
                                                        <p class="font-semibold">Přetáhněte soubory sem nebo klikněte pro výběr</p>
                                                    </div>
                                                    <input type="file" id="course-media-file-input" multiple class="hidden" accept=".pdf">
                                                    <h3 class="font-bold text-slate-700 mt-6 mb-2">Nahrané soubory:</h3>
                                                    <ul id="course-media-list" class="space-y-2"></ul>
                                                </div>
                                              </div>`;
                        initializeCourseMediaUpload("main-course");
                    }
                    break;
                case 'students':
                    const studentsContainer = this.querySelector('#students-container');
                    if (studentsContainer) {
                        const navigateToStudentProfile = (studentId) => {
                            this._showProfessorContent('student-profile', studentId);
                        };
                        this.studentsUnsubscribe = renderStudentsView(studentsContainer, firebaseInit.db, this.studentsUnsubscribe, navigateToStudentProfile);
                    }
                    break;
                case 'interactions':
                    const interactionsContainer = this.querySelector('#interactions-container');
                    if (interactionsContainer) {
                        this.conversationsUnsubscribe = renderStudentInteractions(interactionsContainer, firebaseInit.db, firebaseInit.functions, this.conversationsUnsubscribe);
                    }
                    break;
                case 'analytics':
                    const analyticsContainer = this.querySelector('#analytics-container');
                    if (analyticsContainer) {
                        this._renderAnalytics(analyticsContainer); // Vytvoríme pomocnú funkciu
                    }
                    break;
            }
        }
    }

    // Pomocná funkcia pre analytiku (presunutá z `showProfessorContent`)
    async _renderAnalytics(container) {
        // Tento kód je v poriadku, pretože `_renderAnalytics` sa volá iba raz
        // a modifikuje iba `container`, ktorý mu bol odovzdaný.
        container.innerHTML = `
            <div class="p-6 md:p-8">
                <h2 class="text-3xl font-extrabold text-slate-800 mb-6">Analýza platformy</h2>
                <div id="analytics-loading" class="text-center text-slate-500">
                    <p>Načítám analytická data...</p>
                </div>
                <div id="analytics-content" class="hidden grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    </div>
            </div>`;

        try {
            if (!this._getGlobalAnalyticsCallable) {
                 if (!firebaseInit.functions) {
                     console.error("CRITICAL: Firebase Functions object is not available for getGlobalAnalyticsCallable!");
                     showToast("Chyba inicializace funkcí.", true);
                     throw new Error("Firebase Functions not initialized.");
                 }
                 this._getGlobalAnalyticsCallable = httpsCallable(firebaseInit.functions, 'getGlobalAnalytics');
            }
            
            const getAnalytics = this._getGlobalAnalyticsCallable;
            const result = await getAnalytics();
            const data = result.data;

            // Používame `this.querySelector`, pretože sme v Light DOM
            const contentContainer = this.querySelector('#analytics-content'); 
            if (!contentContainer) return;

            const studentCard = this._createStatCard('Celkový počet studentů', data.studentCount, '👥');
            const quizCard = this._createStatCard('Průměrné skóre (Kvízy)', `${data.avgQuizScore}%`, '❓', `(z ${data.quizSubmissionCount} odevzdání)`);
            const testCard = this._createStatCard('Průměrné skóre (Testy)', `${data.avgTestScore}%`, '✅', `(z ${data.testSubmissionCount} odevzdání)`);

            contentContainer.appendChild(studentCard);
            contentContainer.appendChild(quizCard);
            contentContainer.appendChild(testCard);

            const activityCard = document.createElement('div');
            activityCard.className = 'bg-white p-6 rounded-xl shadow-lg md:col-span-2 lg:col-span-3';
            let topStudentsHtml = (data.topStudents || []).map(student => 
                `<li class="flex justify-between items-center py-2 border-b last:border-b-0">
                    <span class="text-slate-700">${student.name}</span>
                    <span class="font-semibold text-green-700">${student.submissions} odevzdání</span>
                </li>`
            ).join('');

            activityCard.innerHTML = `
                <h4 class="text-lg font-semibold text-slate-800 mb-4">Top 5 nejaktivnějších studentů</h4>
                <ul class="divide-y divide-slate-100">
                    ${topStudentsHtml || '<p class="text-slate-500 py-4">Žádná aktivita k zobrazení.</p>'}
                </ul>
            `;
            contentContainer.appendChild(activityCard);

            const loadingEl = this.querySelector('#analytics-loading');
            if (loadingEl) loadingEl.classList.add('hidden');
            contentContainer.classList.remove('hidden');

        } catch (error) {
            console.error("Error fetching analytics:", error);
            const loadingEl = this.querySelector('#analytics-loading');
            if (loadingEl) {
                loadingEl.innerHTML = `<p class="text-red-500">Nepodařilo se načíst analytická data: ${error.message}</p>`;
            }
            showToast("Chyba při načítání analýzy.", true);
        }
    }
    
    // Pomocná funkcia (presunutá z `professor.js`)
    _createStatCard(title, value, emoji, subtitle = '') {
        const card = document.createElement('div');
        card.className = 'bg-white p-6 rounded-xl shadow-lg flex items-center space-x-4';
        card.innerHTML = `
            <div class="text-4xl">${emoji}</div>
            <div>
                <h4 class="text-sm font-medium text-slate-500 uppercase tracking-wider">${title}</h4>
                <p class="text-3xl font-bold text-slate-900">${value}</p>
                ${subtitle ? `<p class="text-xs text-slate-400 mt-1">${subtitle}</p>` : ''}
            </div>
        `;
        return card;
    }
}

customElements.define('professor-app', ProfessorApp);

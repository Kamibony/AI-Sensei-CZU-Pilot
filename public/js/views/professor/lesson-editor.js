// public/js/views/professor/lesson-editor.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { showToast } from '../../utils.js'; // Potrebujeme pre download funkciu

// Importujeme všetky view komponenty editora
import './editor/editor-view-details.js';
import './editor/editor-view-text.js';
import './editor/editor-view-presentation.js';
import './editor/editor-view-video.js';
import './editor/editor-view-quiz.js';
import './editor/editor-view-test.js';
import './editor/editor-view-post.js';

export class LessonEditor extends LitElement {
    static properties = {
        lesson: { type: Object },
        _activeView: { state: true, type: String },
        _currentLessonData: { state: true, type: Object }, // Interná kópia pre úpravy
    };

    constructor() {
        super();
        this.lesson = null;
        this._activeView = 'details'; // Predvolený otvorený view
        this._currentLessonData = null;
        this.menuItems = [
            { id: 'details', label: 'Detaily lekce', icon: '📝' },
            { id: 'text', label: 'Text pro studenty', icon: '✍️' },
            { id: 'presentation', label: 'Prezentace', icon: '🖼️' },
            { id: 'video', label: 'Video', icon: '▶️' },
            { id: 'quiz', label: 'Kvíz', icon: '❓' },
            { id: 'test', label: 'Test', icon: '✅' },
            { id: 'post', label: 'Podcast Skript', icon: '🎙️' },
        ];
    }

    createRenderRoot() {
        return this; // Renderujeme do Light DOM
    }

    // Keď sa zmení vstupná `lesson` property, aktualizujeme interný stav
    willUpdate(changedProperties) {
        if (changedProperties.has('lesson')) {
            this._currentLessonData = this.lesson ? { ...this.lesson } : null;
            // Vždy resetujeme na 'details' pri načítaní novej lekcie
            this._activeView = 'details';
        }
    }

    // Handler pre kliknutie na kartu/tlačidlo sekcie
    _toggleView(viewId) {
        // Ak klikneme na už otvorenú sekciu, zatvoríme ju (žiadna nie je aktívna)
        // Ak klikneme na inú, otvoríme ju
        this._activeView = this._activeView === viewId ? null : viewId;
    }

    // Handler pre udalosť `lesson-updated` z pod-komponentov
    _handleLessonUpdate(e) {
        this._currentLessonData = e.detail; // Aktualizujeme interné dáta
        // Pošleme udalosť vyššie do professor-app
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: e.detail,
            bubbles: true,
            composed: true
        }));
    }

    // Handler pre tlačidlo späť
    _handleBackClick() {
        this.dispatchEvent(new CustomEvent('editor-exit', { bubbles: true, composed: true }));
    }

    // Funkcia na stiahnutie (presunutá sem)
     _handleDownloadLessonContent() {
        const currentLesson = this._currentLessonData;
        if (!currentLesson) {
            showToast("Lekce není načtena, nelze stáhnout obsah.", true);
            return;
        }
        let contentString = "";
        const title = currentLesson.title || "Nova_lekce";
        contentString += `# ${currentLesson.title || "Nová lekce"}\n`;
        if (currentLesson.subtitle) contentString += `## ${currentLesson.subtitle}\n`;
        contentString += `\n---\n\n`;
        if (currentLesson.text_content) contentString += `### Text pro studenty\n\n${currentLesson.text_content}\n\n---\n\n`;
        if (currentLesson.presentation?.slides) contentString += `### Prezentace (Styl: ${currentLesson.presentation.styleId || 'default'})\n\n${currentLesson.presentation.slides.map((s, i) => `**Slide ${i + 1}: ${s.title}**\n${(s.points || []).map(p => `- ${p}`).join('\n')}\n`).join('\n')}\n---\n\n`;
        if (currentLesson.videoUrl) contentString += `### Video\n\n${currentLesson.videoUrl}\n\n---\n\n`;
        if (currentLesson.quiz?.questions) contentString += `### Kvíz\n\n${currentLesson.quiz.questions.map((q, i) => `${i + 1}. ${q.question_text}\n${(q.options || []).map((o, j) => `  - ${o}${j === q.correct_option_index ? " (Správně)" : ""}`).join('\n')}`).join('\n\n')}\n\n---\n\n`;
        if (currentLesson.test?.questions) contentString += `### Test\n\n${currentLesson.test.questions.map((q, i) => `${i + 1}. ${q.question_text}\n${(q.options || []).map((o, j) => `  - ${o}${j === q.correct_option_index ? " (Správně)" : ""}`).join('\n')}`).join('\n\n')}\n\n---\n\n`;
        if (currentLesson.podcast_script?.episodes) contentString += `### Podcast Skript\n\n${currentLesson.podcast_script.episodes.map((ep, i) => `**Epizoda ${i + 1}: ${ep.title}**\n\n${ep.script}\n\n`).join('')}---\n\n`;
        const blob = new Blob([contentString], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url); showToast("Obsah lekce byl stažen.");
    }


    // Funkcia na renderovanie jednotlivých sekcií editora
    renderEditorSection(viewId) {
        switch(viewId) {
            case 'details':
                return html`<editor-view-details .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-details>`;
            case 'text':
                return html`<editor-view-text .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-text>`;
            case 'presentation':
                return html`<editor-view-presentation .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-presentation>`;
            case 'video':
                return html`<editor-view-video .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-video>`;
            case 'quiz':
                return html`<editor-view-quiz .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-quiz>`;
            case 'test':
                return html`<editor-view-test .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-test>`;
            case 'post':
                return html`<editor-view-post .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-post>`;
            default:
                return html``; // Nič nezobrazíme, ak nie je aktívny view
        }
    }

    render() {
        const lessonTitle = this._currentLessonData ? this._currentLessonData.title : 'Vytvořit novou lekci';
        const lessonIcon = this._currentLessonData ? this._currentLessonData.icon : '🆕';

        return html`
            <div class="p-4 sm:p-6 md:p-8 overflow-y-auto h-full">
                <header class="mb-6 flex justify-between items-center">
                    <div>
                        <button @click=${this._handleBackClick} class="flex items-center text-sm text-green-700 hover:underline mb-2">
                             &larr; Zpět na plán výuky
                        </button>
                        <div class="flex items-center space-x-3">
                             <span class="text-3xl">${lessonIcon}</span>
                             <h1 class="text-2xl md:text-3xl font-bold text-slate-800 truncate" title="${lessonTitle}">
                                 ${lessonTitle}
                             </h1>
                        </div>
                    </div>
                     <button @click=${this._handleDownloadLessonContent} title="Stáhnout obsah lekce" class="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors flex-shrink-0 ml-4">
                         <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2 2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                     </button>
                 </header>

                <div class="space-y-4">
                    ${this.menuItems.map(item => {
                        const isActive = this._activeView === item.id;
                        // Pridáme triedy pre aktívny stav a animáciu
                        const cardClasses = isActive
                            ? 'bg-white border-green-300 shadow-md'
                            : 'bg-white hover:bg-slate-50 border-slate-200 hover:shadow-sm';
                        const headerClasses = isActive
                            ? 'text-green-800 font-semibold'
                            : 'text-slate-700';

                        return html`
                            <div class="border rounded-lg overflow-hidden transition-all duration-300 ${cardClasses}">
                                <button @click=${() => this._toggleView(item.id)}
                                        class="w-full flex items-center justify-between p-4 focus:outline-none">
                                    <span class="flex items-center text-lg ${headerClasses}">
                                        <span class="mr-3 text-xl">${item.icon}</span>
                                        ${item.label}
                                    </span>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="transform transition-transform duration-300 ${isActive ? 'rotate-180' : 'rotate-0'}">
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                </button>

                                <div class="transition-all duration-300 ease-in-out overflow-hidden ${isActive ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}">
                                     <div class="p-4 border-t border-slate-200">
                                          ${isActive ? this.renderEditorSection(item.id) : ''}
                                     </div>
                                </div>
                            </div>
                        `;
                    })}
                </div>
            </div>
        `;
    }
}

customElements.define('lesson-editor', LessonEditor);

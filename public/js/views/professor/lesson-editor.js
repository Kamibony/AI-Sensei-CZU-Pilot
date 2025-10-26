// public/js/views/professor/lesson-editor.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { showToast } from '../../utils.js';

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
        _currentLessonData: { state: true, type: Object },
    };

    constructor() {
        super();
        this.lesson = null;
        this._activeView = 'details';
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
        return this;
    }

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson')) {
            this._currentLessonData = this.lesson ? { ...this.lesson } : null;
            // Pri novej lekcii vždy začneme detailmi
            if (!this.lesson || (changedProperties.get('lesson') && changedProperties.get('lesson').id !== this.lesson.id)) {
                 this._activeView = 'details';
            }
        }
    }

    _setActiveView(viewId) {
        this._activeView = viewId;
    }

    _handleLessonUpdate(e) {
        this._currentLessonData = e.detail;
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: e.detail, bubbles: true, composed: true
        }));
    }

    _handleBackClick() {
        this.dispatchEvent(new CustomEvent('editor-exit', { bubbles: true, composed: true }));
    }

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

    renderEditorSection(viewId) {
        // Renderuje iba aktívnu sekciu
        if (this._activeView !== viewId) return '';

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
                return html``;
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

                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
                    ${this.menuItems.map(item => {
                        const isActive = this._activeView === item.id;
                        // Štýly pre tlačidlá, podobné ako v student-lesson-list
                        const buttonClasses = isActive
                            ? 'bg-green-700 text-white shadow-lg scale-105' // Aktívne
                            : 'bg-white text-slate-700 hover:bg-green-50 hover:text-green-800 hover:shadow-md border border-slate-200'; // Neaktívne

                        return html`
                            <button @click=${() => this._setActiveView(item.id)}
                                    class="flex flex-col items-center justify-center p-4 rounded-xl text-center transition-all duration-200 ease-in-out transform ${buttonClasses}">
                                <span class="text-3xl mb-2">${item.icon}</span>
                                <span class="text-sm font-semibold">${item.label}</span>
                            </button>
                        `;
                    })}
                </div>

                <div class="mt-6 editor-section-content">
                    ${this.renderEditorSection(this._activeView)}
                </div>
            </div>
        `;
    }
}

customElements.define('lesson-editor', LessonEditor);

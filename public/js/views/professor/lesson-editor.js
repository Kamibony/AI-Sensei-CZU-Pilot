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
        // Pridané popisy ku každej položke
        this.menuItems = [
            { id: 'details', label: 'Detaily lekce', icon: '📝', field: null, description: 'Základní informace o lekci (název, ikona, RAG soubory).' },
            { id: 'text', label: 'Text pro studenty', icon: '✍️', field: 'text_content', description: 'Vytvořte nebo vložte hlavní studijní text pro tuto lekci.' },
            { id: 'presentation', label: 'Prezentace', icon: '🖼️', field: 'presentation', description: 'Vygenerujte AI prezentaci shrnující klíčové body lekce.' },
            { id: 'video', label: 'Video', icon: '▶️', field: 'videoUrl', description: 'Vložte odkaz na doplňkové video z YouTube.' },
            { id: 'quiz', label: 'Kvíz', icon: '❓', field: 'quiz', description: 'Vytvořte rychlý interaktivní kvíz pro ověření znalostí.' },
            { id: 'test', label: 'Test', icon: '✅', field: 'test', description: 'Navrhněte komplexnější test pro hodnocení studentů.' },
            { id: 'post', label: 'Podcast Skript', icon: '🎙️', field: 'podcast_script', description: 'Vygenerujte skripty pro audio verzi lekce.' },
        ];
    }

    createRenderRoot() {
        return this;
    }

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson')) {
            this._currentLessonData = this.lesson ? { ...this.lesson } : null;
             if (!this.lesson || (changedProperties.get('lesson') && changedProperties.get('lesson')?.id !== this.lesson.id)) {
                 this._activeView = 'details';
            }
        }
    }

    _toggleView(viewId) {
        this._activeView = this._activeView === viewId ? null : viewId;
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
        if (!currentLesson) { showToast("Lekce není načtena.", true); return; }
        let contentString = ""; const title = currentLesson.title || "Nova_lekce";
        contentString += `# ${currentLesson.title || "Nová lekce"}\n`;
        if (currentLesson.subtitle) contentString += `## ${currentLesson.subtitle}\n`; contentString += `\n---\n\n`;
        if (currentLesson.text_content) contentString += `### Text pro studenty\n\n${currentLesson.text_content}\n\n---\n\n`;
        if (currentLesson.presentation?.slides) contentString += `### Prezentace (Styl: ${currentLesson.presentation.styleId || 'default'})\n\n${currentLesson.presentation.slides.map((s, i) => `**Slide ${i + 1}: ${s.title}**\n${(s.points || []).map(p => `- ${p}`).join('\n')}\n`).join('\n')}\n---\n\n`;
        if (currentLesson.videoUrl) contentString += `### Video\n\n${currentLesson.videoUrl}\n\n---\n\n`;
        if (currentLesson.quiz?.questions) contentString += `### Kvíz\n\n${currentLesson.quiz.questions.map((q, i) => `${i + 1}. ${q.question_text}\n${(q.options || []).map((o, j) => `  - ${o}${j === q.correct_option_index ? " (Správně)" : ""}`).join('\n')}`).join('\n\n')}\n\n---\n\n`;
        if (currentLesson.test?.questions) contentString += `### Test\n\n${currentLesson.test.questions.map((q, i) => `${i + 1}. ${q.question_text}\n${(q.options || []).map((o, j) => `  - ${o}${j === q.correct_option_index ? " (Správně)" : ""}`).join('\n')}`).join('\n\n')}\n\n---\n\n`;
        if (currentLesson.podcast_script?.episodes) contentString += `### Podcast Skript\n\n${currentLesson.podcast_script.episodes.map((ep, i) => `**Epizoda ${i + 1}: ${ep.title}**\n\n${ep.script}\n\n`).join('')}---\n\n`;
        const blob = new Blob([contentString], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); showToast("Obsah lekce byl stažen.");
    }

    renderEditorSection(viewId) {
        if (this._activeView !== viewId) return '';
        return html`<div class="p-4 sm:p-6 border-t border-slate-200 bg-white"> ${this._renderSpecificEditorView(viewId)}
                   </div>`;
    }

    _renderSpecificEditorView(viewId) {
         switch(viewId) {
            case 'details': return html`<editor-view-details .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-details>`;
            case 'text': return html`<editor-view-text .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-text>`;
            case 'presentation': return html`<editor-view-presentation .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-presentation>`;
            case 'video': return html`<editor-view-video .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-video>`;
            case 'quiz': return html`<editor-view-quiz .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-quiz>`;
            case 'test': return html`<editor-view-test .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-test>`;
            case 'post': return html`<editor-view-post .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-post>`;
            default: return html``;
        }
    }

    render() {
        const lessonTitle = this._currentLessonData ? this._currentLessonData.title : 'Vytvořit novou lekci';
        const lessonIcon = this._currentLessonData ? this._currentLessonData.icon : '🆕';

        return html`
            <div class="p-4 sm:p-6 md:p-8 overflow-y-auto h-full">
                 <header class="mb-8 flex justify-between items-center"> <div>
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

                <div class="space-y-4 max-w-4xl mx-auto"> ${this.menuItems.map(item => {
                        const isActive = this._activeView === item.id;
                        const hasContent = item.field ? !!this._currentLessonData?.[item.field] : true;
                        const statusColor = hasContent ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500';
                        const statusText = item.id === 'details' ? '' : (hasContent ? 'Vytvořeno' : 'Nevytvořeno');

                        // Väčší padding, výraznejšie tiene, upravené farby
                        const buttonClasses = isActive
                            ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-600 shadow-lg' // Aktívne
                            : 'bg-white hover:bg-slate-50 border-l-4 border-transparent hover:shadow-md'; // Neaktívne

                        return html`
                            <div class="rounded-xl overflow-hidden shadow-sm border border-slate-200 transition-shadow duration-300 ${isActive ? 'shadow-lg' : ''}">
                                <button @click=${() => this._toggleView(item.id)}
                                        class="w-full flex items-center justify-between p-6 focus:outline-none transition-colors duration-200 ${buttonClasses}"> <div class="flex items-center text-left min-w-0 mr-4"> <span class="mr-4 text-3xl flex-shrink-0">${item.icon}</span> <div class="flex-grow">
                                            <span class="font-semibold text-lg text-slate-800">${item.label}</span> <p class="text-sm text-slate-500 mt-1">${item.description}</p> </div>
                                    </div>
                                    <div class="flex items-center space-x-3 flex-shrink-0">
                                         ${statusText ? html`<span class="text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}">${statusText}</span>` : ''}
                                         <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="transform transition-transform duration-300 text-slate-500 ${isActive ? 'rotate-180' : 'rotate-0'}">
                                            <polyline points="6 9 12 15 18 9"></polyline>
                                        </svg>
                                    </div>
                                </button>

                                <div class="transition-all duration-300 ease-in-out overflow-hidden ${isActive ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}">
                                     ${isActive ? this.renderEditorSection(item.id) : ''}
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

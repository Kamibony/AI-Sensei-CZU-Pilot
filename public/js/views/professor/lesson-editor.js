// public/js/views/professor/lesson-editor.js
import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
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
        // Zmena významu: 'overview' = zoznam sekcií, inak ID aktívnej sekcie
        _activeView: { state: true, type: String },
        _currentLessonData: { state: true, type: Object },
    };

    constructor() {
        super();
        this.lesson = null;
        this._activeView = 'overview'; // Začíname prehľadom sekcií
        this._currentLessonData = null;
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
             if (!this.lesson || (changedProperties.get('lesson') && changedProperties.get('lesson')?.id !== this.lesson?.id)) {
                 this._activeView = 'overview'; // Vždy reset na overview pri zmene lekcie
            }
        }
    }

    // Nastaví, ktorú sekciu detailne zobraziť
    _setActiveView(viewId) {
        this._activeView = viewId;
    }

    // Vráti sa na prehľad sekcií
    _showOverview() {
        this._activeView = 'overview';
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
        // ... (kód zostáva rovnaký) ...
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
        // Renderuje príslušný editor
         switch(viewId) {
            case 'details': return html`<editor-view-details .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-details>`;
            case 'text': return html`<editor-view-text .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-text>`;
            case 'presentation': return html`<editor-view-presentation .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-presentation>`;
            case 'video': return html`<editor-view-video .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-video>`;
            case 'quiz': return html`<editor-view-quiz .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-quiz>`;
            case 'test': return html`<editor-view-test .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-test>`;
            case 'post': return html`<editor-view-post .lesson=${this._currentLessonData} @lesson-updated=${this._handleLessonUpdate}></editor-view-post>`;
            default: return html`<p class="text-red-500">Neznámý pohled editoru: ${viewId}</p>`;
        }
    }

    // Nová metóda na renderovanie prehľadu sekcií (veľké tlačidlá)
    renderOverview() {
        return html`
             <div class="space-y-4 max-w-4xl"> ${this.menuItems.map(item => {
                        const hasContent = item.field ? !!this._currentLessonData?.[item.field] : true;
                        const statusColor = hasContent ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500';
                        const statusText = item.id === 'details' ? '' : (hasContent ? 'Vytvořeno' : 'Nevytvořeno');

                        return html`
                            <button @click=${() => this._setActiveView(item.id)}
                                    class="w-full flex items-center justify-between p-6 rounded-xl text-left bg-white hover:bg-slate-50 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">
                                <div class="flex items-center min-w-0 mr-4">
                                    <span class="mr-4 text-3xl flex-shrink-0">${item.icon}</span>
                                    <div class="flex-grow">
                                        <span class="font-semibold text-lg text-slate-800">${item.label}</span>
                                        <p class="text-sm text-slate-500 mt-1">${item.description}</p>
                                    </div>
                                </div>
                                <div class="flex items-center space-x-3 flex-shrink-0">
                                     ${statusText ? html`<span class="text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}">${statusText}</span>` : ''}
                                     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400">
                                         <polyline points="9 18 15 12 9 6"></polyline>
                                     </svg>
                                </div>
                            </button>
                        `;
                    })}
                </div>
        `;
    }

    render() {
        const lessonTitle = this._currentLessonData ? this._currentLessonData.title : 'Vytvořit novou lekci';
        const lessonIcon = this._currentLessonData ? this._currentLessonData.icon : '🆕';

        return html`
            <div class="p-4 sm:p-6 md:p-8 overflow-y-auto h-full">
                 <header class="mb-8 flex justify-between items-center">
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

                ${this._activeView === 'overview'
                    ? this.renderOverview() // Zobrazíme zoznam sekcií
                    : html`
                        <div>
                             <button @click=${this._showOverview} class="mb-6 bg-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-300 flex items-center text-sm">
                                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1.5"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                                 Zpět na přehled sekcí
                             </button>
                             ${this.renderEditorSection(this._activeView)}
                        </div>
                    `
                }
            </div>
        `;
    }
}

customElements.define('lesson-editor', LessonEditor);

// public/js/views/professor/lesson-editor-menu.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { showToast } from '../../utils.js';
import { loadSelectedFiles } from '../../upload-handler.js';

export class LessonEditorMenu extends LitElement {
    static properties = {
        lesson: { type: Object },
        activeView: { type: String },
    };

    constructor() {
        super();
        this.lesson = null;
        this.activeView = 'details';
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
    
    // Táto funkcia sa volá VŽDY, keď sa zmenia properties (napr. lesson)
    updated(changedProperties) {
        if (changedProperties.has('lesson') || changedProperties.has('activeView')) {
            // Vždy keď sa zmení lekcia ALEBO tab, musíme načítať správne RAG súbory pre danú lekciu
            // (clearSelectedFiles() je teraz v loadSelectedFiles)
            loadSelectedFiles(this.lesson?.ragFilePaths || []);
        }
    }

    _handleMenuClick(e, viewId) {
        e.preventDefault();
        this.dispatchEvent(new CustomEvent('view-changed', {
            detail: { view: viewId },
            bubbles: true,
            composed: true
        }));
    }

    _handleBackClick() {
        this.dispatchEvent(new CustomEvent('back-to-timeline', {
            bubbles: true,
            composed: true
        }));
    }
    
    _handleDownloadLessonContent() {
        const currentLesson = this.lesson;
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
        a.href = url;
        a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Obsah lekce byl stažen.");
    }

    render() {
        const lessonTitle = this.lesson ? this.lesson.title : 'Vytvořit novou lekci';
        const lessonIcon = this.lesson ? this.lesson.icon : '🆕';

        return html`
            <header class="p-4 border-b border-slate-200 flex-shrink-0">
                <button @click=${this._handleBackClick} class="flex items-center text-sm text-green-700 hover:underline mb-3">&larr; Zpět na plán výuky</button>
                <div class="flex justify-between items-start">
                    <div class="flex items-center space-x-3 min-w-0">
                        <span class="text-3xl">${lessonIcon}</span>
                        <h2 id="editor-lesson-title" class="text-xl font-bold truncate text-slate-800" title="${lessonTitle}">${lessonTitle}</h2>
                    </div>
                    <button @click=${this._handleDownloadLessonContent} title="Stáhnout obsah lekce" class="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2 2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </button>
                </div>
            </header>
            <div class="flex-grow overflow-y-auto p-2">
                <nav id="editor-vertical-menu" class="flex flex-col space-y-1">
                    ${this.menuItems.map(item => {
                        const isActive = this.activeView === item.id;
                        const classes = isActive
                            ? 'bg-green-100 text-green-800 font-semibold'
                            : 'hover:bg-slate-100 text-slate-700';
                        return html`
                            <a href="#" @click=${(e) => this._handleMenuClick(e, item.id)}
                               data-view="${item.id}"
                               class="editor-menu-item flex items-center p-3 text-sm font-medium rounded-md transition-colors ${classes}">
                                ${item.icon}<span class="ml-3">${item.label}</span>
                            </a>`;
                    })}
                </nav>
            </div>`;
    }
}

customElements.define('lesson-editor-menu', LessonEditorMenu);

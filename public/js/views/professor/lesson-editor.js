// public/js/views/professor/lesson-editor.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

// Importujeme všetky nové pod-komponenty
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
        view: { type: String },
    };

    constructor() {
        super();
        this.view = 'details';
    }

    createRenderRoot() {
        return this; // Renderujeme do Light DOM
    }
    
    // Keď sa vytvorí nová lekcia v 'details', musíme poslať udalosť vyššie
    _handleLessonUpdate(e) {
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: e.detail,
            bubbles: true,
            composed: true
        }));
    }

    renderView() {
        // Prepínač, ktorý renderuje správny komponent
        switch(this.view) {
            case 'details':
                return html`<editor-view-details .lesson=${this.lesson} @lesson-updated=${this._handleLessonUpdate}></editor-view-details>`;
            case 'text':
                return html`<editor-view-text .lesson=${this.lesson}></editor-view-text>`;
            case 'presentation':
                return html`<editor-view-presentation .lesson=${this.lesson}></editor-view-presentation>`;
            case 'video':
                return html`<editor-view-video .lesson=${this.lesson} @lesson-updated=${this._handleLessonUpdate}></editor-view-video>`;
            case 'quiz':
                return html`<editor-view-quiz .lesson=${this.lesson}></editor-view-quiz>`;
            case 'test':
                return html`<editor-view-test .lesson=${this.lesson}></editor-view-test>`;
            case 'post':
                return html`<editor-view-post .lesson=${this.lesson}></editor-view-post>`;
            default:
                return html`<div class="p-8">Neznámý pohled: ${this.view}</div>`;
        }
    }

    render() {
        // Renderujeme obal a v ňom príslušný pohľad
        // Kľúč 'key' pomáha Lit správne prepínať medzi komponentmi
        return html`
            <div class="p-4 sm:p-6 md:p-8 overflow-y-auto h-full view-transition" .key=${this.view + (this.lesson?.id || 'new')}>
                ${this.renderView()}
            </div>
        `;
    }
}

customElements.define('lesson-editor', LessonEditor);

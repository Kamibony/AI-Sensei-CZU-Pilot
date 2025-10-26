// public/js/views/professor/editor/editor-view-quiz.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import './ai-generator-panel.js';

export class EditorViewQuiz extends LitElement {
    static properties = {
        lesson: { type: Object },
    };

    createRenderRoot() { return this; }

    render() {
        return html`
            <ai-generator-panel
                .lesson=${this.lesson}
                viewTitle="Interaktivní Kvíz"
                contentType="quiz"
                fieldToUpdate="quiz"
                description="Vytvořte rychlý kvíz. Můžete vybrat dokumenty (RAG)."
                promptPlaceholder="Např. 'Vytvoř 3 otázky s výběrem ze 4 možností...'">
            </ai-generator-panel>
        `;
    }
}
customElements.define('editor-view-quiz', EditorViewQuiz);

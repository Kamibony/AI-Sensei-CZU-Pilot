// public/js/views/professor/editor/editor-view-text.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import './ai-generator-panel.js'; // Importujeme náš super-komponent

export class EditorViewText extends LitElement {
    static properties = {
        lesson: { type: Object },
    };

    createRenderRoot() { return this; }

    render() {
        return html`
            <ai-generator-panel
                .lesson=${this.lesson}
                viewTitle="Text pro studenty"
                contentType="text"
                fieldToUpdate="text_content"
                description="Zadejte AI prompt a vygenerujte hlavní studijní text. Můžete vybrat dokumenty (RAG)."
                promptPlaceholder="Např. 'Vytvoř poutavý úvodní text...'">
            </ai-generator-panel>
        `;
    }
}
customElements.define('editor-view-text', EditorViewText);

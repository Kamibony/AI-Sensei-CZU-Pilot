// public/js/views/professor/editor/editor-view-post.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import './ai-generator-panel.js';

export class EditorViewPost extends LitElement {
    static properties = {
        lesson: { type: Object },
    };

    createRenderRoot() { return this; }

    render() {
        const defaultPrompt = `Prozkoumej klíčové koncepty z lekce "${this.lesson?.title || 'aktuální lekce'}"`;
        
        return html`
            <ai-generator-panel
                .lesson=${this.lesson}
                viewTitle="Podcast Skript"
                contentType="post"
                fieldToUpdate="podcast_script"
                description="Vytvořte sérii podcastových skriptů. Můžete vybrat dokumenty (RAG)."
                .promptPlaceholder=${defaultPrompt}
                .inputsConfig=${[
                    { id: 'episode_count', type: 'number', label: 'Počet epizod', default: 3 }
                ]}>
            </ai-generator-panel>
        `;
    }
}
customElements.define('editor-view-post', EditorViewPost);

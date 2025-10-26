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
                .promptPlaceholder=${defaultPrompt}>
                
                <div slot="ai-inputs" class="bg-slate-50 p-4 rounded-lg mb-4">
                    <h4 class="font-bold text-slate-800 mb-3">🎙️ Generátor Podcastové Série</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block font-medium text-slate-600 text-sm">Počet epizod</label>
                            <input id="episode-count-input" type="number" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="3">
                        </div>
                    </div>
                </div>
            </ai-generator-panel>
        `;
    }
}
customElements.define('editor-view-post', EditorViewPost);

import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { translationService } from '../../../services/translation-service.js';

export class EditorViewAi extends LitElement {
    static properties = {
        lesson: { type: Object }
    };

    createRenderRoot() { return this; }

    render() {
        const t = (key) => translationService.t(key);
        return html`
            <div class="p-6 text-center">
                <p class="text-slate-500 mb-4">AI Editor</p>
                <p class="text-sm text-slate-400">Tento editor je momentálně ve vývoji.</p>
            </div>
        `;
    }
}
customElements.define('editor-view-ai', EditorViewAi);

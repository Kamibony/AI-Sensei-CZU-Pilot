import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { translationService } from '../../../utils/translation-service.js';
import './professor-header-editor.js';

export class EditorViewAi extends LitElement {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean }
    };

    createRenderRoot() { return this; } // Light DOM enabled

    render() {
        const t = (key) => translationService.t(key);
        return html`
            <div data-tour="editor-ai-start" data-editor-type="ai" class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>
                <div class="flex-1 flex items-center justify-center">
                    <div class="text-center">
                        <p class="text-slate-500 mb-4">AI Editor</p>
                        <p class="text-sm text-slate-400">Tento editor je momentálně ve vývoji.</p>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-ai', EditorViewAi);

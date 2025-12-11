// public/js/views/professor/editor/editor-view-text.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import './ai-generator-panel.js'; // Importujeme náš super-komponent
import './professor-header-editor.js';

export class EditorViewText extends LitElement {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean }
    };

    createRenderRoot() { return this; }

    render() {
        return html`
            <div class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>
                <div class="flex-1 overflow-hidden relative">
                    <div class="absolute inset-0 overflow-y-auto custom-scrollbar p-6">
                        <div class="max-w-5xl mx-auto space-y-6">
                            <div class="bg-white rounded-3xl shadow-lg border border-slate-100 overflow-hidden min-h-[500px] flex flex-col relative">
                                <ai-generator-panel
                                    .lesson=${this.lesson}
                                    viewTitle="Text pro studenty"
                                    contentType="text"
                                    fieldToUpdate="text_content"
                                    description="Zadejte AI prompt a vygenerujte hlavní studijní text. Můžete vybrat dokumenty (RAG)."
                                    promptPlaceholder="Např. 'Vytvoř poutavý úvodní text...'">
                                </ai-generator-panel>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-text', EditorViewText);

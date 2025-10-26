// public/js/views/professor/editor/editor-view-test.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import './ai-generator-panel.js';

export class EditorViewTest extends LitElement {
    static properties = {
        lesson: { type: Object },
    };

    createRenderRoot() { return this; }

    render() {
        return html`
            <ai-generator-panel
                .lesson=${this.lesson}
                viewTitle="Pokročilý Test"
                contentType="test"
                fieldToUpdate="test"
                description="Navrhněte komplexnější test. Můžete vybrat dokumenty (RAG)."
                promptPlaceholder="Zadejte hlavní téma testu...">
                
                <div slot="ai-inputs" class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                        <label class="block font-medium text-slate-600">Počet otázek</label>
                        <input id="question-count-input" type="number" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="5">
                    </div>
                    <div>
                        <label class="block font-medium text-slate-600">Obtížnost</label>
                        <select id="difficulty-select" class="w-full border-slate-300 rounded-lg p-2 mt-1">
                            <option>Lehká</option>
                            <option selected>Střední</option>
                            <option>Těžká</option>
                        </select>
                    </div>
                    <div>
                        <label class="block font-medium text-slate-600">Typy otázek</label>
                        <select id="type-select" class="w-full border-slate-300 rounded-lg p-2 mt-1">
                            <option value="Multiple Choice">Výběr z možností</option>
                        </select>
                    </div>
                </div>

            </ai-generator-panel>
        `;
    }
}
customElements.define('editor-view-test', EditorViewTest);

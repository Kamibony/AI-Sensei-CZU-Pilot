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

                <div slot="ai-inputs" class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label class="block font-medium text-slate-600">Počet otázek</label>
                        <input id="question-count-input" type="number" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="5">
                    </div>
                    <div>
                        <label class="block font-medium text-slate-600">Obtížnost</label>
                        <select id="difficulty-select" class="w-full border-slate-300 rounded-lg p-2 mt-1">
                            <option value="Lehká">Lehká</option>
                            <option value="Střední" selected>Střední</option>
                            <option value="Těžká">Těžká</option>
                        </select>
                    </div>
                </div>

            </ai-generator-panel>
        `;
    }
}
customElements.define('editor-view-quiz', EditorViewQuiz);

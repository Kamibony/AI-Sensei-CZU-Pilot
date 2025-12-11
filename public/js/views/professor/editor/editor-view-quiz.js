import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import './ai-generator-panel.js';
import './professor-header-editor.js';

export class EditorViewQuiz extends LitElement {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean }
    };

    createRenderRoot() { return this; }

    render() {
        const quizConfig = [
            { 
                id: 'question_count',
                type: 'number', 
                label: 'Počet otázek', 
                default: 5,
                min: 1,
                max: 20
            },
            {
                id: 'difficulty_select',
                type: 'select',
                label: 'Obtížnost',
                options: ['Lehká', 'Střední', 'Těžká'],
                default: 'Střední'
            }
        ];

        return html`
            <div class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>
                <div class="flex-1 overflow-hidden relative">
                    <div class="absolute inset-0 overflow-y-auto custom-scrollbar p-6">
                        <div class="max-w-5xl mx-auto space-y-6">
                            <div class="bg-white rounded-3xl shadow-lg border border-slate-100 overflow-hidden min-h-[500px] flex flex-col relative">
                                <ai-generator-panel
                                    .lesson=${this.lesson}
                                    viewTitle="Interaktivní Kvíz"
                                    contentType="quiz"
                                    fieldToUpdate="quiz"
                                    description="Vytvořte rychlý kvíz. Vyberte počet otázek a obtížnost."
                                    promptPlaceholder="Např. 'Zaměř se hlavně na data a letopočty...'"
                                    .inputsConfig=${quizConfig}
                                >
                                </ai-generator-panel>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-quiz', EditorViewQuiz);

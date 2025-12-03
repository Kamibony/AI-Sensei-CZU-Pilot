import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import './ai-generator-panel.js';

export class EditorViewQuiz extends LitElement {
    static properties = {
        lesson: { type: Object },
    };

    createRenderRoot() { return this; }

    render() {
        // === KONFIGURÁCIA UI ===
        // Toto zabezpečí, že backend dostane presne to, čo očakáva
        const quizConfig = [
            { 
                id: 'question_count', // Backend čaká 'question_count'
                type: 'number', 
                label: 'Počet otázek', 
                default: 5,
                min: 1,
                max: 20
            },
            {
                id: 'difficulty_select', // Backend čaká 'difficulty_select'
                type: 'select',
                label: 'Obtížnost',
                options: ['Lehká', 'Střední', 'Těžká'],
                default: 'Střední'
            }
        ];

        return html`
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
        `;
    }
}
customElements.define('editor-view-quiz', EditorViewQuiz);

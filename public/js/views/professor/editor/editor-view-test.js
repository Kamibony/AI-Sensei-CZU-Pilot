// public/js/views/professor/editor/editor-view-test.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import './ai-generator-panel.js';
import './professor-header-editor.js';

export class EditorViewTest extends LitElement {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean }
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.lesson = {};
    }

    _handleQuestionChange(index, field, value) {
        // Create deep copy
        const content = this.lesson.content ? JSON.parse(JSON.stringify(this.lesson.content)) : {};
        if (!content.questions) content.questions = [];

        if (!content.questions[index]) {
            content.questions[index] = { question_text: '', options: ['', '', '', ''], correct_option_index: 0, type: 'Multiple Choice' };
        }

        content.questions[index][field] = value;

        this._dispatchUpdate(content);
    }

    _handleOptionChange(qIndex, oIndex, value) {
        const content = this.lesson.content ? JSON.parse(JSON.stringify(this.lesson.content)) : {};
        if (!content.questions) content.questions = [];

        content.questions[qIndex].options[oIndex] = value;
        this._dispatchUpdate(content);
    }

    _addQuestion() {
        const content = this.lesson.content ? JSON.parse(JSON.stringify(this.lesson.content)) : {};
        if (!content.questions) content.questions = [];

        content.questions.push({
            question_text: '',
            options: ['', '', '', ''],
            correct_option_index: 0,
            type: 'Multiple Choice'
        });

        this._dispatchUpdate(content);
    }

    _removeQuestion(index) {
        const content = this.lesson.content ? JSON.parse(JSON.stringify(this.lesson.content)) : {};
        if (!content.questions) content.questions = [];

        content.questions.splice(index, 1);
        this._dispatchUpdate(content);
    }

    _dispatchUpdate(content) {
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: {
                content: content
            },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        const questions = this.lesson.content?.questions || [];

        return html`
            <div class="h-full flex flex-col bg-slate-100 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                <!-- Scrollable Content Area -->
                <div class="flex-1 overflow-hidden relative">
                    <div class="absolute inset-0 overflow-y-auto custom-scrollbar p-8">
                        <div class="max-w-4xl mx-auto">

                            <!-- Paper & Desk Container -->
                            <div class="bg-white shadow-2xl relative min-h-[800px] flex flex-col" style="box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.2);">

                                <!-- Formal Exam Header -->
                                <div class="border-b-2 border-slate-900 p-12 pb-8 mb-8 text-center">
                                    <div class="uppercase tracking-widest text-slate-500 text-sm font-bold mb-2">Examination Paper</div>
                                    <h1 class="text-4xl font-serif text-slate-900 mb-4">${this.lesson.title || 'Untitled Exam'}</h1>
                                    <div class="flex justify-center gap-8 text-sm font-serif italic text-slate-600">
                                        <span>Subject: ${this.lesson.subject || 'General'}</span>
                                        <span>•</span>
                                        <span>Topic: ${this.lesson.topic || 'General'}</span>
                                        <span>•</span>
                                        <span>Questions: ${questions.length}</span>
                                    </div>
                                </div>

                                <!-- Content Padding -->
                                <div class="px-12 pb-12 flex-1">

                                    <!-- AI Generator (Styled Formally) -->
                                    <div class="mb-12 border border-slate-200 bg-slate-50 p-6">
                                        <ai-generator-panel
                                            .lesson=${this.lesson}
                                            viewTitle="Generátor Testu"
                                            contentType="test"
                                            fieldToUpdate="content"
                                            description="Vygenerovat formální zkušební otázky."
                                            promptPlaceholder="Popište téma zkoušky..."
                                            .extraParams=${{question_count: 5}}>

                                            <div slot="ai-inputs" class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4 font-serif">
                                                <div>
                                                    <label class="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">Počet otázek</label>
                                                    <input id="question-count-input" type="number" class="w-full border-slate-300 focus:border-slate-800 focus:ring-0 rounded-none p-2 bg-white" value="5">
                                                </div>
                                                <div>
                                                    <label class="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">Obtížnost</label>
                                                    <select id="difficulty-select" class="w-full border-slate-300 focus:border-slate-800 focus:ring-0 rounded-none p-2 bg-white">
                                                        <option>Lehká</option>
                                                        <option selected>Střední</option>
                                                        <option>Těžká</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label class="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">Typ otázek</label>
                                                    <select id="type-select" class="w-full border-slate-300 focus:border-slate-800 focus:ring-0 rounded-none p-2 bg-white">
                                                        <option value="Mix">Mix</option>
                                                        <option value="Multiple Choice">Výběr z možností</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </ai-generator-panel>
                                    </div>

                                    <!-- Questions List -->
                                    <div class="space-y-12">
                                        ${questions.map((q, qIndex) => html`
                                            <div class="relative group">
                                                <!-- Question Number & Text -->
                                                <div class="flex gap-4 mb-4 items-start">
                                                    <span class="font-serif font-bold text-slate-900 text-lg mt-1">${qIndex + 1}.</span>
                                                    <div class="flex-1">
                                                        <input
                                                            type="text"
                                                            .value="${q.question_text || q.question}"
                                                            @input="${e => this._handleQuestionChange(qIndex, 'question_text', e.target.value)}"
                                                            class="w-full font-serif text-lg text-slate-900 border-b border-dashed border-slate-300 focus:border-slate-900 focus:ring-0 p-1 bg-transparent placeholder-slate-400"
                                                            placeholder="Zformulujte otázku..."
                                                        >
                                                    </div>
                                                    <button
                                                        @click="${() => this._removeQuestion(qIndex)}"
                                                        class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 transition-colors p-1"
                                                        title="Odstranit otázku"
                                                    >
                                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                    </button>
                                                </div>

                                                <!-- Options (A, B, C...) -->
                                                <div class="pl-10 space-y-3">
                                                    ${q.options.map((opt, oIndex) => html`
                                                        <div class="flex items-center gap-3">
                                                            <div class="w-6 h-6 flex items-center justify-center border border-slate-300 rounded-full text-xs font-serif text-slate-500">
                                                                ${String.fromCharCode(65 + oIndex)}
                                                            </div>
                                                            <input
                                                                type="radio"
                                                                name="correct-${qIndex}"
                                                                .checked="${(q.correct_option_index ?? q.correct) === oIndex}"
                                                                @change="${() => this._handleQuestionChange(qIndex, 'correct_option_index', oIndex)}"
                                                                class="w-4 h-4 text-slate-800 border-slate-400 focus:ring-slate-800 cursor-pointer"
                                                            >
                                                            <input
                                                                type="text"
                                                                .value="${opt}"
                                                                @input="${e => this._handleOptionChange(qIndex, oIndex, e.target.value)}"
                                                                class="flex-1 font-serif text-slate-700 bg-transparent border-b border-transparent focus:border-slate-300 focus:ring-0 p-1 text-sm placeholder-slate-300"
                                                                placeholder="Možnost ${String.fromCharCode(65 + oIndex)}"
                                                            >
                                                        </div>
                                                    `)}
                                                </div>
                                            </div>
                                        `)}
                                    </div>

                                    <!-- Add Question Button (Formal) -->
                                    <div class="mt-12 pt-8 border-t border-slate-100 text-center">
                                        <button
                                            @click="${this._addQuestion}"
                                            class="inline-flex items-center gap-2 px-6 py-2 border border-slate-300 text-slate-600 font-serif hover:border-slate-800 hover:text-slate-900 transition-all uppercase tracking-wider text-xs"
                                        >
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4"></path></svg>
                                            Přidat otázku
                                        </button>
                                    </div>

                                </div>

                                <!-- Footer decor -->
                                <div class="h-4 bg-slate-100 border-t border-slate-200"></div>
                            </div>

                            <!-- Bottom Spacer -->
                            <div class="h-24"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-test', EditorViewTest);

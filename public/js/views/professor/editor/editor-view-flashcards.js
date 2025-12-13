import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { callGenerateContent } from '../../../gemini-api.js';
import { Localized } from '../../../utils/localization-mixin.js';
import { showToast } from '../../../utils.js';
import { parseAiResponse } from './utils-parsing.mjs';
import './professor-header-editor.js';

export class EditorViewFlashcards extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean },
        _cards: { state: true, type: Array },
        _isGenerating: { state: true, type: Boolean }
    };

    constructor() {
        super();
        this.lesson = null;
        this._cards = [];
        this._isGenerating = false;
    }

    createRenderRoot() { return this; }

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson') && this.lesson) {
            const parsedCards = parseAiResponse(this.lesson.flashcards, 'cards');
            // Update only if we have valid cards and local state is empty or different
            // (Avoiding overwriting local state if we are in the middle of editing could be complex,
            // but for now we follow the pattern of loading from lesson on update if available)
            // Ideally we check if it actually changed to avoid loop, but lit handles diffs.
            if (parsedCards.length > 0) {
                 // Optimization: Only update if length differs or first item differs to avoid constant re-render issues
                 // But for simplicity and correctness of "syncing", we set it.
                 // We check against _cards to avoid loop if possible, but _cards is internal state.
                 // The issue is if user edits _cards, then lesson updates from parent...
                 // Assuming parent update is authoritative source of truth.
                 this._cards = parsedCards;
            }
        }
    }

    setContentFromAi(data) {
        const cards = parseAiResponse(data, 'cards');
        if (cards.length > 0) {
            this._cards = cards;
            this.save();
        }
    }

    async _generateCards() {
        if (this._isGenerating) return;

        const title = this.lesson?.title || '';
        if (!title) {
            showToast(this.t('editor.flashcards.error_no_title'), true);
            return;
        }

        this._isGenerating = true;
        this.requestUpdate();

        try {
            const prompt = `Vytvoř sadu 10 studijních kartiček (flashcards) k tématu: ${title}. Výstup musí být JSON: [{ "front": "Pojem", "back": "Vysvětlení" }, ...]. Žádný markdown.`;

            const result = await callGenerateContent({
                contentType: 'flashcards',
                promptData: { userPrompt: prompt },
                filePaths: this.lesson.ragFilePaths ? this.lesson.ragFilePaths.map(f => f.fullPath).filter(p => p) : []
            });

            if (result.error) {
                throw new Error(result.error);
            }

            // Smart Parsing Logic
            const rawData = result.text || result;
            const cards = parseAiResponse(rawData, 'cards');

            if (cards.length > 0) {
                this._cards = cards;
                this.save();
                showToast(this.t('editor.flashcards.success_generated'));
            } else {
                 showToast(this.t('editor.flashcards.error_parse'), true);
            }

        } catch (e) {
            console.error(e);
            showToast(`${this.t('editor.flashcards.error_generation')}${e.message}`, true);
        } finally {
            this._isGenerating = false;
            this.requestUpdate();
        }
    }

    _addCard() {
        this._cards = [...this._cards, { front: '', back: '' }];
        this.requestUpdate();
    }

    _deleteCard(index) {
        this._cards.splice(index, 1);
        this._cards = [...this._cards]; // trigger update
        this.save();
    }

    _updateCard(index, field, value) {
        this._cards[index] = { ...this._cards[index], [field]: value };
        this._cards = [...this._cards];
    }

    save() {
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: { flashcards: this._cards },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
            <div class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving || this._isGenerating}"></professor-header-editor>
                <div class="flex-1 overflow-hidden relative">
                    <div class="absolute inset-0 overflow-y-auto custom-scrollbar">
                        <div class="max-w-6xl mx-auto p-8 space-y-8">
                            <div class="flex justify-between items-center">
                                <h2 class="text-2xl font-bold text-slate-800">${this.t('editor.flashcards.title')}</h2>
                                <div class="flex gap-2">
                                    <button @click=${this._generateCards} ?disabled=${this._isGenerating}
                                        class="flex items-center px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg font-medium hover:bg-indigo-100 transition-colors">
                                        ${this._isGenerating ? html`<span class="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2"></span>` : html`<span class="mr-2">✨</span>`}
                                        ${this.t('editor.flashcards.generate_ai_btn')}
                                    </button>
                                    <button @click=${this._addCard}
                                        class="flex items-center px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors">
                                        <span class="mr-2">➕</span> ${this.t('editor.flashcards.add_card_btn')}
                                    </button>
                                </div>
                            </div>

                            ${this._cards.length === 0 ? html`
                                <div class="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                    <div class="text-4xl mb-4">🗂️</div>
                                    <h3 class="text-lg font-medium text-slate-700">${this.t('editor.flashcards.empty_title')}</h3>
                                    <p class="text-slate-500 mb-6">${this.t('editor.flashcards.empty_desc')}</p>
                                    <button @click=${this._generateCards} class="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all">
                                        ✨ ${this.t('editor.flashcards.empty_action')}
                                    </button>
                                </div>
                            ` : html`
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    ${this._cards.map((card, index) => html`
                                        <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4 relative group hover:shadow-md transition-shadow">
                                            <button @click=${() => this._deleteCard(index)}
                                                class="absolute top-2 right-2 text-slate-300 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-colors">
                                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                            </button>

                                            <div class="mb-4 pr-8">
                                                <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">${this.t('editor.flashcards.front_label')}</label>
                                                <input type="text"
                                                    .value=${card.front}
                                                    @input=${(e) => this._updateCard(index, 'front', e.target.value)}
                                                    @blur=${() => this.save()}
                                                    class="w-full text-lg font-bold text-slate-800 border-none p-0 focus:ring-0 placeholder-slate-300"
                                                    placeholder="${this.t('editor.flashcards.front_placeholder')}">
                                            </div>

                                            <div class="border-t border-slate-100 pt-4">
                                                <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">${this.t('editor.flashcards.back_label')}</label>
                                                <textarea
                                                    .value=${card.back}
                                                    @input=${(e) => this._updateCard(index, 'back', e.target.value)}
                                                    @blur=${() => this.save()}
                                                    class="w-full text-sm text-slate-600 border-none p-0 focus:ring-0 resize-none h-20 placeholder-slate-300"
                                                    placeholder="${this.t('editor.flashcards.back_placeholder')}"></textarea>
                                            </div>
                                        </div>
                                    `)}
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-flashcards', EditorViewFlashcards);

import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { translationService } from '../../utils/translation-service.js';

export class FlashcardsComponent extends LitElement {
    static properties = {
        cards: { type: Array },
        _currentIndex: { state: true, type: Number },
        _isFlipped: { state: true, type: Boolean }
    };

    constructor() {
        super();
        this.cards = [];
        this._currentIndex = 0;
        this._isFlipped = false;
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._langUnsubscribe = translationService.subscribe(() => this.requestUpdate());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._langUnsubscribe) {
            this._langUnsubscribe();
        }
    }

    _nextCard() {
        if (this._currentIndex < this.cards.length - 1) {
            this._isFlipped = false;
            setTimeout(() => {
                this._currentIndex++;
            }, 200); // Small delay for smoother transition feel
        }
    }

    _prevCard() {
        if (this._currentIndex > 0) {
            this._isFlipped = false;
            setTimeout(() => {
                this._currentIndex--;
            }, 200);
        }
    }

    _flipCard() {
        this._isFlipped = !this._isFlipped;
    }

    render() {
        if (!this.cards || this.cards.length === 0) return html``;

        const currentCard = this.cards[this._currentIndex];
        const t = (key) => translationService.t(key);

        return html`
            <div class="max-w-2xl mx-auto py-8">

                <!-- Progress -->
                <div class="flex justify-between items-center mb-6 text-sm font-bold text-slate-400">
                    <span>${t('content_types.flashcards')} ${this._currentIndex + 1} / ${this.cards.length}</span>
                    <div class="flex gap-1">
                        ${this.cards.map((_, i) => html`
                            <div class="w-2 h-2 rounded-full ${i === this._currentIndex ? 'bg-indigo-600' : 'bg-slate-200'}"></div>
                        `)}
                    </div>
                </div>

                <!-- Card Scene (Perspective) -->
                <div class="perspective-1000 h-80 w-full cursor-pointer group" @click=${this._flipCard}>
                    <!-- Card Inner (Transform) -->
                    <div class="relative w-full h-full text-center transition-transform duration-500 transform-style-3d ${this._isFlipped ? 'rotate-y-180' : ''}">

                        <!-- Front -->
                        <div class="absolute inset-0 backface-hidden bg-white rounded-3xl shadow-xl shadow-slate-200 border border-slate-100 flex flex-col items-center justify-center p-8">
                            <span class="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-4">${t('content_types.flashcards')}</span>
                            <h3 class="text-3xl font-extrabold text-slate-900">${currentCard.front}</h3>
                            <div class="absolute bottom-6 text-slate-300 text-sm flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                                ${t('student_dashboard.flip_instruction')}
                            </div>
                        </div>

                        <!-- Back -->
                        <div class="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-600 rounded-3xl shadow-xl shadow-indigo-200 flex flex-col items-center justify-center p-8 text-white">
                            <span class="text-xs font-bold text-indigo-200 uppercase tracking-widest mb-4">${t('student_dashboard.explanation')}</span>
                            <p class="text-xl font-medium leading-relaxed">${currentCard.back}</p>
                        </div>
                    </div>
                </div>

                <!-- Controls -->
                <div class="flex justify-between items-center mt-8">
                    <button @click=${this._prevCard} ?disabled=${this._currentIndex === 0}
                        class="px-6 py-3 rounded-xl font-bold transition-all flex items-center ${this._currentIndex === 0 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-white hover:shadow-md'}">
                        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                        ${t('student_dashboard.previous')}
                    </button>

                    <button @click=${this._flipCard} class="w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center text-indigo-600 hover:scale-110 transition-transform">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    </button>

                    <button @click=${this._nextCard} ?disabled=${this._currentIndex === this.cards.length - 1}
                        class="px-6 py-3 rounded-xl font-bold transition-all flex items-center ${this._currentIndex === this.cards.length - 1 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-white hover:shadow-md'}">
                        ${t('student_dashboard.next')}
                        <svg class="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </button>
                </div>
            </div>

            <style>
                .perspective-1000 { perspective: 1000px; }
                .transform-style-3d { transform-style: preserve-3d; }
                .backface-hidden { backface-visibility: hidden; }
                .rotate-y-180 { transform: rotateY(180deg); }
            </style>
        `;
    }
}
customElements.define('flashcards-component', FlashcardsComponent);

import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

export class StudentComic extends LitElement {
    static properties = {
        comicData: { type: Array }
    };

    createRenderRoot() { return this; }

    _renderPanel(panel, index) {
        if (!panel.image_prompt && !panel.text && !panel.imageUrl) return nothing;

        return html`
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col h-[320px] relative transition-transform hover:scale-[1.01]">
                <div class="absolute top-3 right-3 text-xs font-bold text-slate-300">
                    PANEL ${index + 1}
                </div>

                <!-- Scene Visual (Image or Placeholder) -->
                <div class="flex-1 mb-3 bg-slate-50 rounded-lg overflow-hidden border border-slate-100 relative">
                    ${panel.imageUrl ? html`
                        <img src="${panel.imageUrl}" class="w-full h-full object-cover" alt="Panel ${index + 1}" loading="lazy" />
                    ` : html`
                         <div class="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                            <span class="text-2xl mb-2 opacity-30">🖼️</span>
                            <p class="text-xs text-slate-400 italic line-clamp-3">"${panel.image_prompt}"</p>
                        </div>
                    `}
                </div>

                <!-- Dialogue (Speech Bubble) -->
                <div class="h-[100px] flex flex-col relative">
                     <div class="absolute -top-3 left-6 w-4 h-4 bg-indigo-50 border-t border-l border-indigo-100 transform rotate-45 z-10"></div>
                     <div class="flex-1 bg-indigo-50 rounded-xl rounded-tl-none border border-indigo-100 p-3 text-sm text-slate-800 font-medium overflow-y-auto custom-scrollbar relative z-0">
                        ${panel.text}
                     </div>
                </div>
            </div>
        `;
    }

    render() {
        if (!this.comicData || !Array.isArray(this.comicData) || this.comicData.length === 0) {
             return html`<div class="p-8 text-center text-slate-400">Žádný komiks k zobrazení.</div>`;
        }

        return html`
            <div class="max-w-5xl mx-auto space-y-8">
                <div class="text-center mb-8">
                    <h2 class="text-3xl font-extrabold text-slate-900 flex items-center justify-center gap-3">
                        <span class="text-4xl">💬</span> Komiks
                    </h2>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
                    ${this.comicData.map((panel, index) => this._renderPanel(panel, index))}
                </div>
            </div>
        `;
    }
}
customElements.define('student-comic', StudentComic);

import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

export class MindmapComponent extends LitElement {
    static properties = {
        code: { type: String }
    };

    constructor() {
        super();
        this.code = '';
    }

    createRenderRoot() { return this; }

    updated(changedProperties) {
        if (changedProperties.has('code') && this.code) {
            this._renderDiagram();
        }
    }

    async _renderDiagram() {
        const container = this.renderRoot.querySelector('.mermaid-viewer');
        if (!container) return;

        container.innerHTML = `<div class="mermaid">${this.code}</div>`;

        try {
            if (window.mermaid) {
                await window.mermaid.run({
                    nodes: container.querySelectorAll('.mermaid')
                });
            }
        } catch (e) {
            console.error("Mermaid render error:", e);
            container.innerHTML = `<div class="text-red-500 p-4">Chyba zobrazení diagramu.</div>`;
        }
    }

    render() {
        return html`
            <div class="w-full bg-white rounded-3xl shadow-lg border border-slate-100 overflow-hidden">
                <div class="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                    <h3 class="font-bold text-slate-700 flex items-center">
                        <span class="text-2xl mr-3">🧠</span>
                        Mentální mapa
                    </h3>
                </div>

                <div class="mermaid-viewer w-full overflow-x-auto p-8 flex justify-center min-h-[300px]">
                    <!-- Diagram renders here -->
                </div>
            </div>
        `;
    }
}
customElements.define('mindmap-component', MindmapComponent);

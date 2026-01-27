import { html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { BaseView } from './base-view.js';
import { Localized } from '../../utils/localization-mixin.js';
import * as firebaseInit from '../../firebase-init.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

export class ArchitectView extends Localized(BaseView) {
    createRenderRoot() { return this; }

    static properties = {
        _isUploading: { state: true },
        _isAnalyzing: { state: true },
        _isMapping: { state: true },
        _statusMessage: { state: true },
        _knowledgeBaseId: { state: true },
        _graphData: { state: true },
        _selectedNode: { state: true },
        _showInsightInput: { state: true },
        _insightText: { state: true }
    };

    constructor() {
        super();
        this._isUploading = false;
        this._isAnalyzing = false;
        this._isMapping = false;
        this._statusMessage = '';
        this._knowledgeBaseId = null;
        this._graphData = null;
        this._selectedNode = null;
        this._showInsightInput = false;
        this._insightText = '';
    }

    async _handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            alert(this.t('common.error') + ': ' + (this.t('editor.pdf_only') || 'PDF only'));
            return;
        }

        this._isUploading = true;
        this._statusMessage = this.t('architect.processing_status');

        try {
            const text = await this._extractTextFromPdf(file);
            console.log('Extracted text length:', text.length);

            // Call Backend
            const generateEmbeddings = httpsCallable(firebaseInit.functions, 'generateEmbeddings');
            const result = await generateEmbeddings({
                text: text,
                title: file.name
            });

            this._knowledgeBaseId = result.data.id;

            this._showToast(this.t('common.success'), 'success');
        } catch (error) {
            console.error('Architect Upload Error:', error);
            this._showToast(this.t('common.error') + ': ' + error.message, 'error');
        } finally {
            this._isUploading = false;
            this._statusMessage = '';
            e.target.value = ''; // Reset input
        }
    }

    async _extractTextFromPdf(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }

        return fullText;
    }

    async _generateMap() {
        if (!this._knowledgeBaseId) return;

        this._isAnalyzing = true;
        this._statusMessage = this.t('architect.analyzing');

        try {
            const analyzeSyllabus = httpsCallable(firebaseInit.functions, 'analyzeSyllabus');
            const result = await analyzeSyllabus({ knowledgeBaseId: this._knowledgeBaseId });

            this._graphData = result.data.data;

            // Wait for render update then init graph
            await this.updateComplete;
            await this._renderGraph();

        } catch (error) {
            console.error('Analysis Error:', error);
             this._showToast(this.t('architect.error_analysis'), 'error');
        } finally {
            this._isAnalyzing = false;
            this._statusMessage = '';
        }
    }

    async _handleMapInsights() {
        if (!this._knowledgeBaseId || !this._insightText.trim()) return;

        this._isMapping = true;

        try {
            const mapInsightsToGraph = httpsCallable(firebaseInit.functions, 'mapInsightsToGraph');
            const result = await mapInsightsToGraph({
                knowledgeBaseId: this._knowledgeBaseId,
                insightText: this._insightText
            });

            const coveredNodeIds = result.data.coveredNodeIds;

            // Update local graph data
            this._graphData.nodes = this._graphData.nodes.map(node => {
                if (coveredNodeIds.includes(node.id)) {
                    return { ...node, status: 'covered' };
                }
                return node;
            });

            this._showToast(`Aktualizováno! Pokryto ${coveredNodeIds.length} témat.`, 'success');
            this._showInsightInput = false;
            this._insightText = '';

            // Wait for render and re-init graph to apply styles
            await this.updateComplete;
            this._renderGraph();

        } catch (error) {
            console.error('Mapping Error:', error);
            this._showToast('Chyba při aktualizaci: ' + error.message, 'error');
        } finally {
            this._isMapping = false;
        }
    }

    async _renderGraph() {
        if (!this._graphData) return;

        try {
            // Dynamic Import via CDN
            const cytoscape = (await import('https://cdn.jsdelivr.net/npm/cytoscape@3.28.1/dist/cytoscape.esm.min.js')).default;

            const container = this.renderRoot.querySelector('#competency-map');
            if (!container) {
                console.warn('Cytoscape container not found');
                return;
            }

            // Transform data for Cytoscape
            const elements = [
                ...this._graphData.nodes.map(n => ({
                    data: {
                        ...n,
                        id: n.id,
                        label: n.label,
                        bloomLevel: n.bloom_level || n.bloomLevel,
                        eqfLevel: n.eqf_level || n.eqfLevel
                    }
                })),
                ...this._graphData.edges.map(e => ({
                    data: { source: e.source, target: e.target }
                }))
            ];

            // Define colors for bloom levels
            const bloomColors = {
                1: '#86efac', // Green-300
                2: '#4ade80', // Green-400
                3: '#60a5fa', // Blue-400
                4: '#3b82f6', // Blue-500
                5: '#fb923c', // Orange-400
                6: '#f97316'  // Orange-500
            };

            this._cy = cytoscape({
                container: container,
                elements: elements,
                style: [
                    {
                        selector: 'node',
                        style: {
                            'background-color': (ele) => {
                                if (ele.data('status') === 'covered') return '#4ade80'; // Green-400
                                return bloomColors[ele.data('bloomLevel')] || '#94a3b8';
                            },
                            'label': 'data(label)',
                            'color': '#1e293b',
                            'font-size': '12px',
                            'text-valign': 'center',
                            'text-halign': 'center',
                            'width': 'label',
                            'height': 'label',
                            'padding': '12px',
                            'shape': 'round-rectangle',
                            'text-wrap': 'wrap',
                            'text-max-width': '100px',
                            'border-width': 1,
                            'border-color': '#e2e8f0'
                        }
                    },
                    {
                        selector: 'edge',
                        style: {
                            'width': 2,
                            'line-color': '#cbd5e1',
                            'target-arrow-color': '#cbd5e1',
                            'target-arrow-shape': 'triangle',
                            'curve-style': 'bezier'
                        }
                    }
                ],
                layout: {
                    name: 'breadthfirst',
                    directed: true,
                    padding: 30,
                    spacingFactor: 1.25
                }
            });

            // Add Event Listeners
            this._cy.on('tap', 'node', (evt) => {
                this._selectedNode = evt.target.data();
                this.requestUpdate();
            });

            this._cy.on('tap', (evt) => {
                if (evt.target === this._cy) {
                    this._selectedNode = null;
                    this.requestUpdate();
                }
            });

        } catch (e) {
            console.error("Failed to load or init Cytoscape:", e);
        }
    }

    _getEqfDescription(level) {
        const levels = {
            1: "basic general knowledge.",
            2: "basic factual knowledge of a field of work or study.",
            3: "knowledge of facts, principles, processes and general concepts.",
            4: "factual and theoretical knowledge in broad contexts.",
            5: "comprehensive, specialised, factual and theoretical knowledge.",
            6: "advanced knowledge of a field of work or study.",
            7: "highly specialised knowledge, some of which is at the forefront of knowledge.",
            8: "knowledge at the most advanced frontier of a field of work or study."
        };
        return levels[level] || "autonomy and responsibility.";
    }

    _showToast(message, type = 'info') {
        const event = new CustomEvent('toast-message', {
            detail: { message, type },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    render() {
        return html`
            <div data-tour="architect-start" class="p-6 max-w-7xl mx-auto space-y-8">
                <!-- Header -->
                <div class="flex flex-col gap-2">
                    <h1 class="text-3xl font-bold text-slate-800">${this.t('architect.title')}</h1>
                    <p class="text-slate-500 text-lg">${this.t('architect.description')}</p>
                </div>

                <!-- Main Grid -->
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    <!-- Left: Upload Zone -->
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col gap-6">
                        <h2 class="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <span>📚</span> ${this.t('architect.upload_zone_title')}
                        </h2>

                        <div class="border-2 border-dashed border-indigo-100 rounded-xl bg-indigo-50/50 p-8 flex flex-col items-center justify-center text-center transition-colors hover:bg-indigo-50 hover:border-indigo-300 relative group cursor-pointer">
                            <input
                                type="file"
                                accept="application/pdf"
                                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                @change=${this._handleFileUpload}
                                ?disabled=${this._isUploading || this._isAnalyzing}
                            >
                            <div class="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm text-3xl mb-4 group-hover:scale-110 transition-transform text-indigo-500">
                                📤
                            </div>
                            <p class="font-medium text-slate-700 mb-1">${this.t('architect.upload_drop_text')}</p>
                            <p class="text-sm text-slate-400">PDF (max 10MB)</p>
                        </div>

                        ${this._isUploading ? html`
                            <div class="flex items-center gap-3 p-4 bg-blue-50 text-blue-700 rounded-lg animate-pulse">
                                <div class="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                <span class="font-medium text-sm">${this._statusMessage}</span>
                            </div>
                        ` : ''}

                         <!-- Action Button -->
                         ${this._knowledgeBaseId && !this._graphData ? html`
                            <button
                                @click=${this._generateMap}
                                ?disabled=${this._isAnalyzing}
                                class="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-200">
                                ${this._isAnalyzing ? html`
                                    <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    <span>${this.t('architect.analyzing')}</span>
                                ` : html`
                                    <span>🧠</span>
                                    <span>${this.t('architect.generate_map')}</span>
                                `}
                            </button>
                        ` : ''}

                        <!-- Update Progress Button -->
                        ${this._graphData ? html`
                             <div class="mt-4 pt-4 border-t border-slate-100">
                                <button
                                    @click=${() => { this._showInsightInput = true; }}
                                    ?disabled=${this._isMapping}
                                    class="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-200">
                                    ${this._isMapping ? html`
                                        <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        <span>Aktualizuji...</span>
                                    ` : html`
                                        <span>📈</span>
                                        <span>Aktualizovat progres</span>
                                    `}
                                </button>
                                <p class="text-xs text-slate-400 mt-2 text-center">Porovná plán s realitou z hodiny.</p>
                             </div>
                        ` : ''}
                    </div>

                    <!-- Right: Map Placeholder -->
                    <div class="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 min-h-[600px] flex flex-col relative h-[600px]">
                         ${this._graphData ? html`
                            <div id="competency-map" class="absolute inset-0 w-full h-full rounded-2xl overflow-hidden z-0"></div>

                            <!-- Detail Card Overlay -->
                            ${this._selectedNode ? html`
                                <div class="absolute top-4 left-4 z-20 w-80 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 p-6 transition-all animate-fade-in-up">
                                    <div class="flex flex-col gap-4">
                                        <!-- Header -->
                                        <div>
                                            <h3 class="text-lg font-bold text-slate-800 leading-tight">${this._selectedNode.label}</h3>
                                            <p class="text-xs text-slate-500 mt-1 uppercase tracking-wider font-bold">Competency Node</p>
                                        </div>

                                        <!-- Badges -->
                                        <div class="flex flex-wrap gap-2">
                                            <!-- Bloom Badge -->
                                            <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700">
                                                <span class="text-xs font-bold">Bloom Lvl ${this._selectedNode.bloomLevel}</span>
                                            </div>

                                            <!-- EQF Badge -->
                                            <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700">
                                                <span class="text-xs font-bold">
                                                    ${this._selectedNode.eqfLevel ? `EQF Lvl ${this._selectedNode.eqfLevel}` : 'EQF N/A'}
                                                </span>
                                            </div>
                                        </div>

                                        <p class="text-sm text-slate-600 italic">
                                            ${this._selectedNode.eqfLevel ?
                                                `Level ${this._selectedNode.eqfLevel} indicates ${this._getEqfDescription(this._selectedNode.eqfLevel)}`
                                                : 'Standard Bloom-based competency node.'}
                                        </p>

                                        <button
                                            @click=${() => { this._selectedNode = null; this.requestUpdate(); }}
                                            class="text-xs text-slate-400 hover:text-slate-600 underline self-start">
                                            Close details
                                        </button>
                                    </div>
                                </div>
                            ` : ''}

                            <!-- Legend overlay -->
                            <div class="absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm p-4 rounded-xl shadow border border-slate-100 text-xs z-10">
                                <h3 class="font-bold mb-2 text-slate-700 uppercase tracking-wider text-[10px]">${this.t('architect.map_legend')}</h3>
                                <div class="space-y-1.5">
                                    <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-[#86efac]"></div> 1. Remember</div>
                                    <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-[#4ade80]"></div> 2. Understand</div>
                                    <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-[#60a5fa]"></div> 3. Apply</div>
                                    <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-[#3b82f6]"></div> 4. Analyze</div>
                                    <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-[#fb923c]"></div> 5. Evaluate</div>
                                    <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-[#f97316]"></div> 6. Create</div>
                                </div>
                            </div>
                        ` : html`
                            <div class="flex-1 flex items-center justify-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 m-2">
                                <div class="text-center text-slate-400">
                                    <div class="text-6xl mb-4 opacity-20 grayscale">🗺️</div>
                                    <p>${this.t('architect.map_placeholder')}</p>
                                </div>
                            </div>
                        `}
                    </div>

                </div>

                <!-- Insight Input Dialog -->
                ${this._showInsightInput ? html`
                    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                        <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                            <h3 class="text-xl font-bold text-slate-800 mb-4">Aktualizace progresu</h3>
                            <p class="text-slate-600 mb-4 text-sm">
                                Vložte poznámky z hodiny nebo výstup z "AI Observera". Systém analyzuje, která témata byla probrána.
                            </p>

                            <textarea
                                class="w-full h-40 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm resize-none mb-6"
                                placeholder="Např.: Dnes jsme probrali základy Bloomovy taxonomie a vysvětlili si rozdíl mezi..."
                                .value=${this._insightText}
                                @input=${e => this._insightText = e.target.value}
                            ></textarea>

                            <div class="flex justify-end gap-3">
                                <button
                                    @click=${() => { this._showInsightInput = false; }}
                                    class="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    Zrušit
                                </button>
                                <button
                                    @click=${this._handleMapInsights}
                                    ?disabled=${!this._insightText.trim() || this._isMapping}
                                    class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50"
                                >
                                    Vyhodnotit
                                </button>
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }
}
customElements.define('architect-view', ArchitectView);

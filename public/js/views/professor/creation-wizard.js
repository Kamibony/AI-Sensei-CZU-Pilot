console.log("Loading creation-wizard.js");
import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { BaseView } from './base-view.js';
import { Localized } from '../../utils/localization-mixin.js';
import * as firebaseInit from '../../firebase-init.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { ProfessorDataService } from '../../services/professor-data-service.js';

export class CreationWizard extends Localized(BaseView) {
    static get properties() {
        return {
            step: { state: true, type: Number },
            selectedType: { state: true, type: String },

            // Expedition State (Architect)
            _isUploading: { state: true },
            _isAnalyzing: { state: true },
            _statusMessage: { state: true },
            _knowledgeBaseId: { state: true },
            _graphData: { state: true },
            _selectedNode: { state: true },
            _expeditionTopic: { state: true },
            _expeditionDuration: { state: true },
            _expeditionComplexity: { state: true },

            // Standard State
            _standardTitle: { state: true },
            _standardTopic: { state: true },

            _isSaving: { state: true }
        };
    }

    constructor() {
        super();
        this.step = 1;
        this.selectedType = null; // 'standard' | 'expedition'

        this._isUploading = false;
        this._isAnalyzing = false;
        this._statusMessage = '';
        this._knowledgeBaseId = null;
        this._graphData = null;
        this._selectedNode = null;

        this._expeditionTopic = '';
        this._expeditionDuration = '45';
        this._expeditionComplexity = 'medium';

        this._standardTitle = '';
        this._standardTopic = '';

        this._isSaving = false;
        this.dataService = new ProfessorDataService();
    }

    createRenderRoot() { return this; }

    // --- Actions ---

    _selectType(type) {
        this.selectedType = type;
        this.step = 2;
    }

    _handleBack() {
        if (this.step > 1) {
            this.step--;
            if (this.step === 1) {
                this.selectedType = null;
            }
        }
    }

    async _handleNext() {
        if (this.step === 2) {
            this.step = 3;
        }
    }

    async _handleCreate() {
        this._isSaving = true;

        try {
            let lessonData = {};

            if (this.selectedType === 'standard') {
                lessonData = {
                    title: this._standardTitle || this.t('common.nameless_class'),
                    topic: this._standardTopic,
                    type: 'standard', // or 'text' / 'presentation' as default
                    contentType: 'text', // Defaulting to text for standard
                    status: 'draft'
                };
            } else if (this.selectedType === 'expedition') {
                lessonData = {
                    title: this._expeditionTopic || 'AI Expedition',
                    topic: this._expeditionTopic,
                    type: 'EXPEDITION',
                    contentType: 'project', // Project view is likely used for Expedition
                    knowledgeBaseId: this._knowledgeBaseId,
                    graphData: this._graphData,
                    duration: this._expeditionDuration,
                    complexity: this._expeditionComplexity,
                    status: 'draft',
                    isExpedition: true
                };
            }

            const result = await this.dataService.createLesson(lessonData);

            if (result) {
                this.dispatchEvent(new CustomEvent('toast-message', {
                    detail: { message: this.t('wizard.step_3.success'), type: 'success' },
                    bubbles: true,
                    composed: true
                }));

                // Redirect to Library
                this.dispatchEvent(new CustomEvent('navigate', {
                    detail: { view: 'library' },
                    bubbles: true,
                    composed: true
                }));
            }
        } catch (error) {
            console.error("Creation Error:", error);
            this.dispatchEvent(new CustomEvent('toast-message', {
                detail: { message: this.t('common.error') + ': ' + error.message, type: 'error' },
                bubbles: true,
                composed: true
            }));
        } finally {
            this._isSaving = false;
        }
    }

    // --- Architect Logic Reuse ---

    async _handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            alert(this.t('common.error') + ': ' + (this.t('editor.pdf_only') || 'PDF only'));
            return;
        }

        this._isUploading = true;
        this._statusMessage = this.t('architect.processing_status');

        // Auto-fill topic from filename if empty
        if (!this._expeditionTopic) {
            this._expeditionTopic = file.name.replace('.pdf', '');
        }

        try {
            const text = await this._extractTextFromPdf(file);

            // Call Backend
            const generateEmbeddings = httpsCallable(firebaseInit.functions, 'generateEmbeddings');
            const result = await generateEmbeddings({
                text: text,
                title: file.name
            });

            this._knowledgeBaseId = result.data.id;

            this.dispatchEvent(new CustomEvent('toast-message', {
                detail: { message: this.t('common.success'), type: 'success' },
                bubbles: true,
                composed: true
            }));
        } catch (error) {
            console.error('Architect Upload Error:', error);
            this.dispatchEvent(new CustomEvent('toast-message', {
                detail: { message: this.t('common.error') + ': ' + error.message, type: 'error' },
                bubbles: true,
                composed: true
            }));
        } finally {
            this._isUploading = false;
            this._statusMessage = '';
            e.target.value = ''; // Reset input
        }
    }

    async _extractTextFromPdf(file) {
        if (!window.pdfjsLib) {
             throw new Error("PDF.js library not loaded");
        }
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
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
            this.dispatchEvent(new CustomEvent('toast-message', {
                detail: { message: this.t('architect.error_analysis'), type: 'error' },
                bubbles: true,
                composed: true
            }));
        } finally {
            this._isAnalyzing = false;
            this._statusMessage = '';
        }
    }

    async _renderGraph() {
        if (!this._graphData) return;

        try {
            // Dynamic Import via CDN
            const cytoscape = (await import('https://cdn.jsdelivr.net/npm/cytoscape@3.28.1/dist/cytoscape.esm.min.js')).default;

            const container = this.renderRoot.querySelector('#competency-map-wizard');
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

            const bloomColors = {
                1: '#86efac', 2: '#4ade80', 3: '#60a5fa', 4: '#3b82f6', 5: '#fb923c', 6: '#f97316'
            };

            const cy = cytoscape({
                container: container,
                elements: elements,
                style: [
                    {
                        selector: 'node',
                        style: {
                            'background-color': (ele) => bloomColors[ele.data('bloomLevel')] || '#94a3b8',
                            'label': 'data(label)',
                            'color': '#1e293b',
                            'font-size': '10px',
                            'text-valign': 'center',
                            'text-halign': 'center',
                            'width': 'label',
                            'height': 'label',
                            'padding': '8px',
                            'shape': 'round-rectangle',
                            'text-wrap': 'wrap',
                            'text-max-width': '80px',
                            'border-width': 1,
                            'border-color': '#e2e8f0'
                        }
                    },
                    {
                        selector: 'edge',
                        style: {
                            'width': 1,
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
                    padding: 20,
                    spacingFactor: 1.25
                }
            });

            // Re-center on resize (hacky but works for wizard transitions)
            cy.resize();
            cy.center();

        } catch (e) {
            console.error("Failed to load or init Cytoscape:", e);
        }
    }

    // --- Renderers ---

    render() {
        return html`
            <div class="min-h-screen bg-slate-50 flex flex-col items-center py-10 px-4">
                <div class="max-w-4xl w-full">

                    <!-- Header -->
                    <div class="mb-8 text-center">
                        <h1 class="text-3xl font-bold text-slate-900 mb-2">${this.t('wizard.title')}</h1>
                        <div class="flex items-center justify-center gap-2 text-sm text-slate-500">
                             <span class="${this.step >= 1 ? 'text-indigo-600 font-bold' : ''}">1. ${this.t('wizard.step_1.title')}</span>
                             <span>→</span>
                             <span class="${this.step >= 2 ? 'text-indigo-600 font-bold' : ''}">2. ${this.selectedType === 'expedition' ? this.t('wizard.step_2.title') : this.t('wizard.step_2.standard_title')}</span>
                             <span>→</span>
                             <span class="${this.step >= 3 ? 'text-indigo-600 font-bold' : ''}">3. ${this.t('wizard.step_3.title')}</span>
                        </div>
                    </div>

                    <!-- Content -->
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 min-h-[400px]">
                        ${this._renderStep()}
                    </div>

                    <!-- Footer / Navigation -->
                    ${this.step > 1 ? html`
                        <div class="mt-6 flex justify-between">
                            <button @click="${this._handleBack}" ?disabled=${this._isSaving} class="px-6 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors">
                                ${this.t('wizard.action.back')}
                            </button>

                            ${this.step === 2 ? html`
                                <button @click="${this._handleNext}"
                                    ?disabled=${!this._canProceedToStep3()}
                                    class="px-6 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                                    ${this.t('wizard.action.next')}
                                </button>
                            ` : ''}

                            ${this.step === 3 ? html`
                                <button @click="${this._handleCreate}"
                                    ?disabled=${this._isSaving}
                                    class="px-6 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 font-medium transition-colors shadow-sm flex items-center gap-2">
                                    ${this._isSaving ? html`<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>` : ''}
                                    ${this.t('wizard.action.create')}
                                </button>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    _renderStep() {
        switch(this.step) {
            case 1: return this._renderStep1();
            case 2: return this.selectedType === 'expedition' ? this._renderStep2Expedition() : this._renderStep2Standard();
            case 3: return this._renderStep3();
            default: return nothing;
        }
    }

    _renderStep1() {
        return html`
            <div class="flex flex-col items-center">
                <h2 class="text-xl font-bold text-slate-800 mb-6">${this.t('wizard.step_1.subtitle')}</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">

                    <!-- Standard Card -->
                    <div @click="${() => this._selectType('standard')}" class="cursor-pointer group relative p-6 rounded-2xl border-2 border-slate-100 hover:border-indigo-500 hover:bg-indigo-50/10 transition-all text-center flex flex-col items-center gap-4">
                        <div class="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-4xl mb-2">
                            📚
                        </div>
                        <h3 class="text-lg font-bold text-slate-800 group-hover:text-indigo-700">${this.t('wizard.type.standard.title')}</h3>
                        <p class="text-slate-500 text-sm leading-relaxed">${this.t('wizard.type.standard.desc')}</p>
                    </div>

                    <!-- Expedition Card -->
                    <div @click="${() => this._selectType('expedition')}" class="cursor-pointer group relative p-6 rounded-2xl border-2 border-slate-100 hover:border-emerald-500 hover:bg-emerald-50/10 transition-all text-center flex flex-col items-center gap-4">
                        <div class="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-4xl mb-2">
                            🧭
                        </div>
                        <h3 class="text-lg font-bold text-slate-800 group-hover:text-emerald-700">${this.t('wizard.type.expedition.title')}</h3>
                        <p class="text-slate-500 text-sm leading-relaxed">${this.t('wizard.type.expedition.desc')}</p>
                    </div>

                </div>
            </div>
        `;
    }

    _renderStep2Standard() {
        return html`
            <div class="max-w-md mx-auto flex flex-col gap-6">
                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-1">${this.t('editor.title')}</label>
                    <input
                        type="text"
                        .value="${this._standardTitle}"
                        @input="${e => this._standardTitle = e.target.value}"
                        placeholder="${this.t('editor.lessonTitlePlaceholder')}"
                        class="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                </div>
                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-1">${this.t('editor.topic')}</label>
                    <input
                        type="text"
                        .value="${this._standardTopic}"
                        @input="${e => this._standardTopic = e.target.value}"
                        placeholder="${this.t('editor.subtitlePlaceholder')}"
                        class="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                </div>
            </div>
        `;
    }

    _renderStep2Expedition() {
        return html`
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
                <!-- Left: Inputs -->
                <div class="flex flex-col gap-6">
                    <!-- Scaffolding -->
                    <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <h4 class="font-bold text-slate-700 mb-4 text-sm uppercase tracking-wider">Scaffolding</h4>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-medium text-slate-500 mb-1">Duration (min)</label>
                                <input type="number" .value="${this._expeditionDuration}" @input="${e => this._expeditionDuration = e.target.value}" class="w-full p-2 rounded-lg border border-slate-200 text-sm">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-slate-500 mb-1">Complexity</label>
                                <select .value="${this._expeditionComplexity}" @change="${e => this._expeditionComplexity = e.target.value}" class="w-full p-2 rounded-lg border border-slate-200 text-sm">
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </div>
                            <div class="col-span-2">
                                <label class="block text-xs font-medium text-slate-500 mb-1">${this.t('editor.topic')}</label>
                                <input type="text" .value="${this._expeditionTopic}" @input="${e => this._expeditionTopic = e.target.value}" class="w-full p-2 rounded-lg border border-slate-200 text-sm">
                            </div>
                        </div>
                    </div>

                    <!-- Upload -->
                     <div class="bg-white rounded-xl border-2 border-dashed border-indigo-100 p-6 flex flex-col items-center justify-center text-center hover:bg-indigo-50 transition-colors relative group">
                        <input
                            type="file"
                            accept="application/pdf"
                            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            @change=${this._handleFileUpload}
                            ?disabled=${this._isUploading || this._isAnalyzing}
                        >
                        <div class="text-3xl mb-2 text-indigo-400">📤</div>
                        <p class="text-sm font-medium text-slate-600">${this.t('architect.upload_drop_text')}</p>
                        ${this._isUploading ? html`<p class="text-xs text-indigo-600 mt-2 animate-pulse">${this._statusMessage}</p>` : ''}
                    </div>

                     <!-- Analyze Button -->
                     <button
                        @click=${this._generateMap}
                        ?disabled=${!this._knowledgeBaseId || this._isAnalyzing}
                        class="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        ${this._isAnalyzing ? html`
                            <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            <span>${this.t('architect.analyzing')}</span>
                        ` : html`
                            <span>🧠</span>
                            <span>${this.t('architect.generate_map')}</span>
                        `}
                    </button>
                </div>

                <!-- Right: Graph Preview -->
                <div class="bg-slate-50 rounded-xl border border-slate-200 relative min-h-[300px] flex items-center justify-center overflow-hidden">
                     ${this._graphData ? html`
                        <div id="competency-map-wizard" class="absolute inset-0 w-full h-full"></div>
                     ` : html`
                        <div class="text-center text-slate-400 p-4">
                            <div class="text-4xl mb-2 opacity-20">🗺️</div>
                            <p class="text-sm">${this.t('architect.map_placeholder')}</p>
                        </div>
                     `}
                </div>
            </div>
        `;
    }

    _renderStep3() {
        return html`
            <div class="flex flex-col items-center text-center max-w-lg mx-auto">
                <div class="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mb-4">
                    ✅
                </div>
                <h3 class="text-xl font-bold text-slate-800 mb-2">${this.t('wizard.step_3.title')}</h3>
                <p class="text-slate-500 mb-8">
                    ${this.selectedType === 'standard'
                        ? `Creating "${this._standardTitle}" (${this.t('wizard.type.standard.title')})`
                        : `Creating "${this._expeditionTopic}" (${this.t('wizard.type.expedition.title')}) with AI Graph.`
                    }
                </p>

                <div class="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm w-full">
                    ${this.selectedType === 'standard'
                        ? "Standard module will be created as a draft. You can add content in the editor."
                        : "AI Expedition will be initialized with the generated Knowledge Graph. You can further refine nodes and scaffolding in the Project Editor."
                    }
                </div>
            </div>
        `;
    }

    _canProceedToStep3() {
        if (this.selectedType === 'standard') {
            return this._standardTitle && this._standardTitle.trim().length > 0;
        } else {
            // For expedition, maybe require at least a topic or a graph?
            // Let's require topic at least. Graph is optional (can be generated later).
            return this._expeditionTopic && this._expeditionTopic.trim().length > 0;
        }
    }
}
customElements.define('creation-wizard', CreationWizard);

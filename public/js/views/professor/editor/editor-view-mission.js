import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { translationService } from '../../../utils/translation-service.js';
import { showToast } from '../../../utils/utils.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from '../../../firebase-init.js';

export class EditorViewMission extends LitElement {
    static properties = {
        lesson: { type: Object },
        files: { type: Array }, // Expects list of file objects { storagePath, name, ... }
        _isGenerating: { state: true },
        _generatedData: { state: true }, // Holds { graph, mission } before save
        _selectedNode: { state: true },
        _isCrisisTriggering: { state: true },
        _triggeringCrisisTitle: { state: true },
        _editMode: { state: true } // If true, show Design mode even if mission exists
    };

    static styles = css`
        :host { display: block; height: 100%; }
        .phase-badge {
            display: inline-flex;
            align-items: center;
            padding: 4px 12px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
    `;

    constructor() {
        super();
        this._isGenerating = false;
        this._generatedData = null;
        this._selectedNode = null;
        this._isCrisisTriggering = false;
        this._triggeringCrisisTitle = null;
        this._editMode = false;
    }

    createRenderRoot() { return this; }

    get _hasMission() {
        return !!(this.lesson?.mission_config);
    }

    get _isDesignPhase() {
        return !this._hasMission || this._editMode;
    }

    async _handleAnalyze() {
        if (!this.files || this.files.length === 0) {
            // Warn or handle empty files if critical, but proceed for now
        }

        this._isGenerating = true;
        this.requestUpdate();

        try {
            const generateFn = httpsCallable(functions, 'generateContent');

            const filePaths = (this.files || []).map(f => f.storagePath).filter(Boolean);

            const promptData = {
                userPrompt: `Create a mission for lesson: ${this.lesson.title || 'Untitled'}`,
                language: 'cs'
            };

            const result = await generateFn({
                contentType: 'mission',
                promptData: promptData,
                filePaths: filePaths
            });

            this._generatedData = result.data;

            await this.updateComplete;
            if (this._generatedData.graph) {
                this._renderGraph(this._generatedData.graph);
            }

        } catch (error) {
            console.error("Mission Generation Error:", error);
            showToast(translationService.t('common.error') + ': ' + error.message, 'error');
        } finally {
            this._isGenerating = false;
        }
    }

    async _handleSaveMission() {
        if (!this._generatedData) return;

        const updates = {
            mission_config: {
                ...this._generatedData.mission,
                graph: this._generatedData.graph,
                active: true,
                createdAt: new Date().toISOString()
            }
        };

        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: updates,
            bubbles: true,
            composed: true
        }));

        this._editMode = false;
        this._generatedData = null;
        showToast(translationService.t('common.success'));
    }

    async _renderGraph(graphData) {
        if (!graphData) return;

        try {
            const cytoscape = (await import('https://cdn.jsdelivr.net/npm/cytoscape@3.28.1/dist/cytoscape.esm.min.js')).default;
            const container = this.querySelector('#mission-graph-container');

            if (!container) return;

            const elements = [
                ...(graphData.nodes || []).map(n => ({
                    data: { ...n, id: n.id, label: n.label, bloomLevel: n.bloom_level }
                })),
                ...(graphData.edges || []).map(e => ({
                    data: { source: e.source, target: e.target }
                }))
            ];

             const bloomColors = {
                1: '#86efac', 2: '#4ade80', 3: '#60a5fa',
                4: '#3b82f6', 5: '#fb923c', 6: '#f97316'
            };

            this._cy = cytoscape({
                container: container,
                elements: elements,
                style: [
                     {
                        selector: 'node',
                        style: {
                            'background-color': (ele) => bloomColors[ele.data('bloomLevel')] || '#94a3b8',
                            'label': 'data(label)',
                            'color': '#1e293b',
                            'font-size': '12px',
                            'text-valign': 'center',
                            'text-halign': 'center',
                            'width': 'label', 'height': 'label', 'padding': '12px',
                            'shape': 'round-rectangle',
                            'text-wrap': 'wrap', 'text-max-width': '100px',
                            'border-width': 1, 'border-color': '#e2e8f0'
                        }
                    },
                    {
                        selector: 'edge',
                        style: {
                            'width': 2, 'line-color': '#cbd5e1',
                            'target-arrow-color': '#cbd5e1', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier'
                        }
                    }
                ],
                layout: { name: 'breadthfirst', directed: true, padding: 30 }
            });

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
            console.error("Cytoscape Error:", e);
        }
    }

    async _handleTriggerCrisis(milestoneTitle) {
        if (!confirm(translationService.t('common.confirm'))) return;

        this._isCrisisTriggering = true;
        this._triggeringCrisisTitle = milestoneTitle;
        try {
            const triggerFn = httpsCallable(functions, 'triggerCrisis');
            await triggerFn({
                lessonId: this.lesson.id,
                milestoneTitle: milestoneTitle
            });

            showToast(translationService.t('mission.crisis_active'), "warning");
             this.dispatchEvent(new CustomEvent('refresh-lesson', { bubbles: true, composed: true }));

        } catch (e) {
            console.error(e);
            showToast(translationService.t('common.error') + ": " + e.message, 'error');
        } finally {
            this._isCrisisTriggering = false;
            this._triggeringCrisisTitle = null;
        }
    }

    async _handleResolveCrisis() {
        if (!confirm(translationService.t('common.confirm'))) return;
        try {
             const resolveFn = httpsCallable(functions, 'resolveCrisis');
             await resolveFn({ lessonId: this.lesson.id });
             showToast(translationService.t('mission.crisis_resolve'), "success");
             this.dispatchEvent(new CustomEvent('refresh-lesson', { bubbles: true, composed: true }));
        } catch (e) {
             showToast(translationService.t('common.error') + ": " + e.message, 'error');
        }
    }

    render() {
        const t = (k) => translationService.t(k);
        return html`
            <div class="h-full flex flex-col bg-slate-50">
                <!-- Toolbar -->
                <div class="flex items-center justify-between p-4 border-b border-slate-200 bg-white">
                    <div class="flex items-center gap-4">
                        <h2 class="text-xl font-bold text-slate-800">
                             ${this._hasMission ? t('mission.control_title') : t('mission.architect_title')}
                        </h2>
                        ${this._hasMission ? html`
                            <span class="phase-badge bg-emerald-100 text-emerald-700">
                                ${t('mission.phase_active')}
                            </span>
                        ` : html`
                            <span class="phase-badge bg-indigo-100 text-indigo-700">
                                ${t('mission.phase_design')}
                            </span>
                        `}
                    </div>

                    ${this._hasMission && !this._editMode ? html`
                         <button @click=${() => this._editMode = true} class="text-sm text-slate-500 hover:text-indigo-600 font-medium">
                            ✏️ ${t('mission.edit_plan')}
                         </button>
                    ` : ''}

                    ${this._editMode ? html`
                         <button @click=${() => this._editMode = false} class="text-sm text-slate-500 hover:text-slate-800 font-medium">
                            ${t('mission.cancel_edit')}
                         </button>
                    ` : ''}
                </div>

                <!-- Main Content -->
                <div class="flex-1 overflow-y-auto">
                    ${this._isDesignPhase ? this._renderDesignPhase(t) : this._renderCommandPhase(t)}
                </div>
            </div>
        `;
    }

    _renderDesignPhase(t) {
        const data = this._generatedData || (this.lesson?.mission_config && this._editMode ? { mission: this.lesson.mission_config, graph: this.lesson.mission_config.graph } : null);

        return html`
            <div class="p-6 max-w-7xl mx-auto space-y-8">

                <!-- 1. Analyze Section -->
                <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <h3 class="text-lg font-bold text-slate-800 mb-4">🧠 ${t('mission.analyze_title')}</h3>

                    <div class="flex items-center gap-4 mb-6">
                        <div class="flex-1 p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <p class="text-sm text-slate-500 mb-2">${t('mission.available_files')}</p>
                            <div class="flex flex-wrap gap-2">
                                ${(this.files || []).map(f => html`
                                    <span class="px-2 py-1 bg-white border border-slate-200 rounded text-xs text-slate-600 flex items-center gap-1">
                                        📄 ${f.name}
                                    </span>
                                `)}
                                ${(this.files || []).length === 0 ? html`<span class="text-xs text-slate-400 italic">${t('mission.no_files')}</span>` : ''}
                            </div>
                        </div>

                        <button
                            @click=${this._handleAnalyze}
                            ?disabled=${this._isGenerating}
                            class="px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all disabled:opacity-50">
                            ${this._isGenerating ? html`<span class="animate-spin inline-block mr-2">⏳</span> ${t('mission.analyzing')}` : html`✨ ${t('mission.analyze_btn')}`}
                        </button>
                    </div>

                    <!-- Graph Container -->
                    <div class="relative h-[400px] bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                        ${!data?.graph ? html`
                            <div class="absolute inset-0 flex items-center justify-center text-slate-400">
                                <p>${t('mission.graph_placeholder')}</p>
                            </div>
                        ` : ''}
                        <div id="mission-graph-container" class="absolute inset-0 w-full h-full"></div>
                    </div>
                </div>

                <!-- 2. Roles & Milestones -->
                ${data?.mission ? html`
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4">
                        <!-- Roles -->
                        <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                            <h3 class="text-lg font-bold text-slate-800 mb-4">👥 ${t('mission.roles_title')}</h3>
                            <div class="space-y-4">
                                ${(data.mission.roles || []).map(role => html`
                                    <div class="p-4 border border-slate-200 rounded-xl hover:border-indigo-300 transition-colors">
                                        <div class="font-bold text-slate-800">${role.title}</div>
                                        <p class="text-sm text-slate-600 mt-1">${role.description}</p>
                                        <div class="flex flex-wrap gap-1 mt-2">
                                            ${(role.skills || []).map(s => html`
                                                <span class="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">${s}</span>
                                            `)}
                                        </div>
                                    </div>
                                `)}
                            </div>
                        </div>

                        <!-- Milestones -->
                        <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                            <h3 class="text-lg font-bold text-slate-800 mb-4">🚩 ${t('mission.milestones_title')}</h3>
                            <div class="space-y-4">
                                ${(data.mission.milestones || []).map((m, i) => html`
                                    <div class="flex gap-4">
                                        <div class="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                                            ${i + 1}
                                        </div>
                                        <div class="flex-1 pt-1">
                                            <div class="font-bold text-slate-800">${m.title}</div>
                                            <p class="text-sm text-slate-600 mt-1">${m.description}</p>
                                        </div>
                                    </div>
                                `)}
                            </div>
                        </div>
                    </div>

                    <!-- Save Action -->
                    <div class="flex justify-end pt-4 pb-8">
                        <button
                            @click=${this._handleSaveMission}
                            class="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition-all flex items-center gap-2">
                            <span>🚀</span> ${t('mission.save_launch')}
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    _renderCommandPhase(t) {
        const config = this.lesson.mission_config;
        const activeCrisis = this.lesson.activeCrisis;

        return html`
            <div class="grid grid-cols-1 lg:grid-cols-3 h-full">
                <!-- Left: Observer & Status -->
                <div class="lg:col-span-2 border-r border-slate-200 p-6 overflow-y-auto">

                    <!-- Crisis Banner -->
                    ${activeCrisis ? html`
                        <div class="bg-red-50 border border-red-200 rounded-xl p-6 mb-8 animate-pulse">
                            <div class="flex items-start justify-between">
                                <div class="flex items-center gap-3">
                                    <span class="text-3xl">🚨</span>
                                    <div>
                                        <h3 class="text-xl font-bold text-red-800">${t('mission.crisis_active')}: ${activeCrisis.title}</h3>
                                        <p class="text-red-700 mt-1">${activeCrisis.description}</p>
                                    </div>
                                </div>
                                <button @click=${this._handleResolveCrisis} class="px-4 py-2 bg-white text-red-600 border border-red-200 hover:bg-red-50 rounded-lg text-sm font-bold shadow-sm">
                                    ${t('mission.crisis_resolve')}
                                </button>
                            </div>
                            <div class="mt-4 pt-4 border-t border-red-100 grid grid-cols-2 gap-4">
                                <div>
                                    <span class="text-xs font-bold text-red-500 uppercase">${t('mission.crisis_consequence')}</span>
                                    <p class="text-sm text-red-800 font-medium">${activeCrisis.consequence}</p>
                                </div>
                                <div>
                                    <span class="text-xs font-bold text-red-500 uppercase">${t('mission.crisis_task')}</span>
                                    <p class="text-sm text-red-800 font-medium">${activeCrisis.recovery_task}</p>
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    <!-- AI Observer Embedded -->
                    <div class="mb-8">
                         <div class="flex items-center justify-between mb-4">
                            <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <span>👁️</span> ${t('mission.observer_title')}
                            </h3>
                            <span class="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">${t('mission.observer_subtitle')}</span>
                         </div>
                         <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                             <observer-view .embedded=${true}></observer-view>
                         </div>
                    </div>

                </div>

                <!-- Right: Control Panel -->
                <div class="bg-slate-50 p-6 overflow-y-auto space-y-6">

                    <!-- Progress Status -->
                    <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                        <h4 class="font-bold text-slate-700 mb-3 text-sm uppercase tracking-wide">${t('mission.project_phases')}</h4>
                        <div class="space-y-4">
                            ${(config.milestones || []).map((m, i) => html`
                                <div class="relative pl-4 border-l-2 ${i === 0 ? 'border-indigo-500' : 'border-slate-200'}">
                                    <div class="text-sm font-bold ${i === 0 ? 'text-indigo-700' : 'text-slate-600'}">${m.title}</div>
                                    ${i === 0 ? html`<span class="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">Active</span>` : ''}
                                </div>
                            `)}
                        </div>
                    </div>

                    <!-- Crisis Controls -->
                    <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                        <h4 class="font-bold text-slate-700 mb-3 text-sm uppercase tracking-wide flex items-center gap-2">
                            <span>🔥</span> ${t('mission.crisis_scenarios')}
                        </h4>

                        ${activeCrisis ? html`
                            <p class="text-sm text-slate-400 italic">Ovládací prvky uzamčeny během aktivní krize.</p>
                        ` : html`
                             <div class="space-y-2">
                                ${(config.milestones || []).map(m => html`
                                    <button
                                        @click=${() => this._handleTriggerCrisis(m.title)}
                                        ?disabled=${this._isCrisisTriggering}
                                        class="w-full text-left px-3 py-2 rounded-lg hover:bg-red-50 text-slate-600 hover:text-red-700 text-sm transition-colors border border-transparent hover:border-red-100 group flex items-center gap-2">
                                        ${this._isCrisisTriggering && this._triggeringCrisisTitle === m.title
                                            ? html`<span class="animate-spin h-4 w-4 border-2 border-red-500 border-t-transparent rounded-full"></span>`
                                            : html`<span class="font-medium group-hover:underline">⚠ ${t('mission.crisis_trigger')}:</span>`
                                        }
                                        <span class="opacity-75">${m.title}</span>
                                    </button>
                                `)}
                             </div>
                        `}
                    </div>

                    <!-- Roles Summary -->
                    <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                        <h4 class="font-bold text-slate-700 mb-3 text-sm uppercase tracking-wide">${t('mission.active_roles')}</h4>
                         <div class="flex flex-wrap gap-2">
                            ${(config.roles || []).map(r => html`
                                <div class="px-2 py-1 bg-slate-50 border border-slate-100 rounded text-xs text-slate-600" title="${r.description}">
                                    ${r.title}
                                </div>
                            `)}
                         </div>
                    </div>

                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-mission', EditorViewMission);

import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { ProfessorDataService } from '../../services/professor-data-service.js';
import { Localized } from '../../utils/localization-mixin.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { collection, query, where, getDocs, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { functions, db, auth } from '../../firebase-init.js';
import { showToast, getCollectionPath } from '../../utils/utils.js';
import Chart from 'https://esm.sh/chart.js/auto';

export class ProfessorAnalyticsView extends Localized(LitElement) {
    static properties = {
        _analyticsData: { state: true, type: Object },
        _isLoading: { state: true, type: Boolean },
        _error: { state: true, type: String },

        // Research Engine State
        _classes: { state: true, type: Array },
        _selectedClassId: { state: true, type: String },
        _classReport: { state: true, type: Object },
        _generatingReport: { state: true, type: Boolean },
        _exporting: { state: true, type: Boolean }
    };

    constructor() {
        super();
        this._analyticsData = null;
        this._isLoading = true;
        this._error = null;
        this._dataService = new ProfessorDataService();
        this._activityChart = null;
        this._gradesChart = null;
        this._knowledgeChart = null;

        this._classes = [];
        this._selectedClassId = '';
        this._classReport = null;
        this._generatingReport = false;
        this._exporting = false;
        this._reportUnsubscribe = null;
    }

    createRenderRoot() { return this; }

    async connectedCallback() {
        super.connectedCallback();
        await this._fetchData();
        await this._fetchClasses();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._reportUnsubscribe) this._reportUnsubscribe();
    }

    async _fetchData() {
        this._isLoading = true;
        this._error = null;
        try {
            // Verify Role: Check claims
            if (auth.currentUser) {
                auth.currentUser.getIdTokenResult()
                    .then(idTokenResult => console.log("[Analytics] User Claims:", idTokenResult.claims))
                    .catch(err => console.error("[Analytics] Error fetching claims:", err));
            }

            this._analyticsData = await this._dataService.getAdvancedAnalytics();
        } catch (e) {
            console.error("Error loading analytics:", e);
            this._error = "Nepodařilo se načíst data.";
        } finally {
            this._isLoading = false;
        }
    }

    async _fetchClasses() {
        const user = auth.currentUser;
        if (!user) return;

        try {
            const groupsPath = getCollectionPath('groups');
            const q = query(collection(db, groupsPath), where("ownerId", "==", user.uid));
            const snap = await getDocs(q);
            this._classes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Auto-select first class if available
            if (this._classes.length > 0 && !this._selectedClassId) {
                this._selectClass(this._classes[0].id);
            }
        } catch (e) {
            console.error("Error fetching classes:", e);
        }
    }

    _selectClass(classId) {
        this._selectedClassId = classId;
        this._classReport = null;

        if (this._reportUnsubscribe) {
            this._reportUnsubscribe();
            this._reportUnsubscribe = null;
        }

        if (classId) {
            const reportRef = doc(db, 'groups', classId, 'analytics', 'latest_report');
            this._reportUnsubscribe = onSnapshot(reportRef, (docSnap) => {
                if (docSnap.exists()) {
                    this._classReport = docSnap.data();
                    this.requestUpdate();
                } else {
                    this._classReport = null;
                }
            });
        }
    }

    updated(changedProperties) {
        if (!this._isLoading && this._analyticsData) {
            this._renderCharts();
        }
        if (this._classReport) {
            this._renderClassCharts();
        }
    }

    _renderCharts() {
        if (!this._analyticsData || !this._analyticsData.charts) return;

        // 1. Activity Heatmap (Global)
        const ctxActivity = this.querySelector('#activityChart')?.getContext('2d');
        if (ctxActivity) {
            if (this._activityChart) this._activityChart.destroy();
            const activityLabels = [];
            for (let i = 13; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                activityLabels.push(d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }));
            }
            this._activityChart = new Chart(ctxActivity, {
                type: 'bar',
                data: {
                    labels: activityLabels,
                    datasets: [{
                        label: 'Interakce',
                        data: this._analyticsData.charts.activity,
                        backgroundColor: '#6366f1',
                        borderRadius: 4,
                        hoverBackgroundColor: '#4f46e5'
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } } } }
            });
        }

        // 2. Grade Distribution (Global)
        const ctxGrades = this.querySelector('#gradesChart')?.getContext('2d');
        if (ctxGrades) {
            if (this._gradesChart) this._gradesChart.destroy();
            this._gradesChart = new Chart(ctxGrades, {
                type: 'bar',
                data: {
                    labels: ['A', 'B', 'C', 'D', 'F'],
                    datasets: [{
                        label: 'Počet studentů',
                        data: this._analyticsData.charts.grades,
                        backgroundColor: ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'],
                        borderRadius: 4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } } } }
            });
        }
    }

    _renderClassCharts() {
        if (!this._classReport || !this._classReport.metrics?.cognitive?.knowledgeHeatmap) return;

        // 3. Knowledge Heatmap (Class Specific)
        const ctxKnowledge = this.querySelector('#knowledgeChart')?.getContext('2d');
        if (ctxKnowledge) {
            if (this._knowledgeChart) this._knowledgeChart.destroy();

            const data = this._classReport.metrics.cognitive.knowledgeHeatmap; // [{topic, failureRate}]
            const labels = data.map(d => d.topic.length > 15 ? d.topic.substring(0, 15) + '...' : d.topic);
            const values = data.map(d => d.failureRate);

            this._knowledgeChart = new Chart(ctxKnowledge, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Míra neúspěchu (%)',
                        data: values,
                        backgroundColor: values.map(v => v > 50 ? '#ef4444' : '#eab308'),
                        borderRadius: 4
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { beginAtZero: true, max: 100 } }
                }
            });
        }
    }

    async _handleGenerateReport() {
        if (!this._selectedClassId) return;
        this._generatingReport = true;
        try {
            const func = httpsCallable(functions, 'generateClassReport');
            await func({ classId: this._selectedClassId });
            showToast("Report byl úspěšně vygenerován.", false);
            // Snapshot listener will update UI
        } catch (e) {
            console.error("Report gen failed:", e);
            showToast("Generování selhalo: " + e.message, true);
        } finally {
            this._generatingReport = false;
        }
    }

    async _handleExport(format) {
        if (!this._selectedClassId) return;
        this._exporting = true;
        try {
            const func = httpsCallable(functions, 'exportAnonymizedData');
            const result = await func({ classId: this._selectedClassId, format: format });

            if (result.data && result.data.url) {
                // Trigger download
                const a = document.createElement('a');
                a.href = result.data.url;
                a.download = result.data.fileName || `export.${format}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                showToast("Export stažen.", false);
            }
        } catch (e) {
            console.error("Export failed:", e);
            showToast("Export selhal: " + e.message, true);
        } finally {
            this._exporting = false;
        }
    }

    _renderMetricCard(title, value, trend, explanation) {
        return html`
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative group transition-all hover:shadow-md">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex items-center gap-2">
                        <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wider">${title}</h3>
                        <div class="relative z-10">
                            <svg class="w-4 h-4 text-slate-400 cursor-help hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-56 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none text-center leading-relaxed z-50">
                                ${explanation}
                                <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                            </div>
                        </div>
                    </div>
                    ${trend && trend !== '-' ? html`
                        <span class="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
                            ${trend}
                        </span>` : ''}
                </div>
                <div class="text-3xl font-extrabold text-slate-900 tracking-tight">${value}</div>
            </div>
        `;
    }

    render() {
        if (this._isLoading) {
            return html`<div class="flex justify-center items-center h-full"><div class="spinner w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>`;
        }

        if (this._error) return html`<div class="text-center p-10 text-red-500">${this._error}</div>`;

        const { metrics, insights, meta } = this._analyticsData;

        return html`
            <div class="h-full flex flex-col bg-slate-50 overflow-hidden">
                <header class="bg-white p-6 md:px-8 md:py-6 border-b border-slate-200 flex-shrink-0">
                    <div class="max-w-7xl mx-auto w-full flex justify-between items-end">
                        <div>
                            <h1 class="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Přehled a Analytika</h1>
                            <p class="text-slate-500 mt-1 font-medium text-sm">Expertní pohled na výkonnost vašich tříd.</p>
                        </div>
                        <button @click="${() => this._fetchData()}" class="p-2 text-slate-400 hover:text-indigo-600 bg-slate-50 rounded-lg">🔄</button>
                    </div>
                </header>

                <div class="flex-grow overflow-y-auto p-6 md:p-8">
                    <div class="max-w-7xl mx-auto space-y-10">

                        <!-- GLOBAL METRICS -->
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            ${this._renderMetricCard('Celkový Dosah', metrics.totalReach.value, metrics.totalReach.trend, metrics.totalReach.explanation)}
                            ${this._renderMetricCard('Skóre Zapojení', metrics.engagementScore.value, metrics.engagementScore.trend, metrics.engagementScore.explanation)}
                            ${this._renderMetricCard('Znalostní Úroveň', metrics.knowledgeMastery.value, metrics.knowledgeMastery.trend, metrics.knowledgeMastery.explanation)}
                            ${this._renderMetricCard('Rychlost Výuky', metrics.contentVelocity.value, metrics.contentVelocity.trend, metrics.contentVelocity.explanation)}
                        </div>

                        <!-- GLOBAL CHARTS -->
                        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 h-80">
                            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 lg:col-span-2 flex flex-col">
                                <h3 class="text-lg font-bold text-slate-800 mb-4">Globální Aktivita</h3>
                                <div class="flex-grow relative w-full h-full min-h-0"><canvas id="activityChart"></canvas></div>
                            </div>
                            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                                <h3 class="text-lg font-bold text-slate-800 mb-4">Rozložení Známek</h3>
                                <div class="flex-grow relative w-full h-full min-h-0"><canvas id="gradesChart"></canvas></div>
                            </div>
                        </div>

                        <!-- RESEARCH ENGINE SECTION -->
                        <div class="bg-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                            <div class="absolute top-0 right-0 w-64 h-64 bg-indigo-600 rounded-full blur-3xl -mr-16 -mt-16 opacity-20 pointer-events-none"></div>

                            <div class="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 border-b border-slate-700 pb-8">
                                <div>
                                    <h2 class="text-2xl font-bold flex items-center gap-3">
                                        <span class="text-3xl">🔬</span> ${this.t('research.engine_title')}
                                    </h2>
                                    <p class="text-slate-400 mt-2">${this.t('research.engine_desc')}</p>
                                </div>
                                <div class="flex items-center gap-3 bg-slate-800 p-2 rounded-xl">
                                    <span class="text-sm font-bold text-slate-400 px-2">${this.t('research.select_class_label')}</span>
                                    <select
                                        class="bg-slate-700 text-white border-none rounded-lg py-2 px-4 focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                                        @change="${(e) => this._selectClass(e.target.value)}">
                                        <option value="" disabled ?selected="${!this._selectedClassId}">${this.t('research.select_class_placeholder')}</option>
                                        ${this._classes.map(c => html`
                                            <option value="${c.id}" ?selected="${this._selectedClassId === c.id}">${c.name}</option>
                                        `)}
                                    </select>
                                </div>
                            </div>

                            ${this._selectedClassId ? html`
                                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                    <!-- Controls -->
                                    <div class="space-y-4">
                                        <div class="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
                                            <h3 class="font-bold text-lg mb-4">${this.t('research.actions')}</h3>
                                            <button @click="${this._handleGenerateReport}" ?disabled="${this._generatingReport}"
                                                class="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold transition-all mb-3 flex justify-center items-center gap-2">
                                                ${this._generatingReport ? html`<div class="spinner w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>` : '📊'}
                                                ${this.t('research.generate_report')}
                                            </button>
                                            <div class="grid grid-cols-2 gap-3">
                                                <button @click="${() => this._handleExport('json')}" ?disabled="${this._exporting}"
                                                    class="py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold transition-all flex justify-center items-center gap-2">
                                                    ${this.t('research.export_json')}
                                                </button>
                                                <button @click="${() => this._handleExport('csv')}" ?disabled="${this._exporting}"
                                                    class="py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold transition-all flex justify-center items-center gap-2">
                                                    ${this.t('research.export_csv')}
                                                </button>
                                            </div>
                                            ${this._classReport ? html`
                                                <div class="mt-4 text-xs text-slate-500 text-center">
                                                    ${this.t('research.last_generated')} ${this._classReport.generatedAt?.toDate ? this._classReport.generatedAt.toDate().toLocaleString() : 'N/A'}
                                                </div>
                                            ` : nothing}
                                        </div>

                                        <!-- Simple Metrics -->
                                        ${this._classReport ? html`
                                            <div class="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
                                                <h3 class="font-bold text-slate-400 text-xs uppercase mb-4">${this.t('research.class_resilience')}</h3>
                                                <div class="flex items-end gap-2">
                                                    <span class="text-4xl font-black text-white">${this._classReport.metrics.behavioral.avgCrisisResolutionSeconds}s</span>
                                                    <span class="text-sm text-slate-400 mb-1">${this.t('research.avg_response')}</span>
                                                </div>
                                                <div class="w-full bg-slate-700 h-2 rounded-full mt-2 overflow-hidden">
                                                    <div class="bg-green-500 h-full" style="width: ${Math.min(100, (60 / Math.max(1, this._classReport.metrics.behavioral.avgCrisisResolutionSeconds)) * 100)}%"></div>
                                                </div>
                                            </div>
                                        ` : nothing}
                                    </div>

                                    <!-- Charts -->
                                    <div class="lg:col-span-2 bg-slate-800/50 p-6 rounded-2xl border border-slate-700 flex flex-col">
                                        <h3 class="font-bold text-lg mb-2">Knowledge Heatmap (Topic Failure Rate)</h3>
                                        ${this._classReport
                                            ? html`<div class="flex-grow relative h-64"><canvas id="knowledgeChart"></canvas></div>`
                                            : html`<div class="flex-grow flex items-center justify-center text-slate-500 italic">Report nebyl vygenerován.</div>`
                                        }
                                    </div>
                                </div>
                            ` : html`
                                <div class="text-center py-12 text-slate-500">
                                    <div class="text-4xl mb-4 opacity-50">👈</div>
                                    <p>${this.t('research.select_class_prompt')}</p>
                                </div>
                            `}
                        </div>

                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('professor-analytics-view', ProfessorAnalyticsView);

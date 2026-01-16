import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { ProfessorDataService } from '../../services/professor-data-service.js';
import { Localized } from '../../utils/localization-mixin.js';
import Chart from 'https://esm.sh/chart.js/auto';

export class ProfessorAnalyticsView extends Localized(LitElement) {
    static properties = {
        _analyticsData: { state: true, type: Object },
        _isLoading: { state: true, type: Boolean },
        _error: { state: true, type: String },
    };

    constructor() {
        super();
        this._analyticsData = null;
        this._isLoading = true;
        this._error = null;
        this._dataService = new ProfessorDataService();
        this._activityChart = null;
        this._gradesChart = null;
    }

    createRenderRoot() { return this; }

    async connectedCallback() {
        super.connectedCallback();
        await this._fetchData();
    }

    async _fetchData() {
        this._isLoading = true;
        this._error = null;
        try {
            this._analyticsData = await this._dataService.getAdvancedAnalytics();
        } catch (e) {
            console.error("Error loading analytics:", e);
            this._error = "Nepodařilo se načíst data.";
        } finally {
            this._isLoading = false;
        }
    }

    updated(changedProperties) {
        if (!this._isLoading && this._analyticsData) {
            this._renderCharts();
        }
    }

    _renderCharts() {
        if (!this._analyticsData || !this._analyticsData.charts) return;

        // 1. Activity Heatmap
        const ctxActivity = this.querySelector('#activityChart')?.getContext('2d');
        if (ctxActivity) {
            if (this._activityChart) this._activityChart.destroy();

            // Generate labels for last 14 days
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
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                title: (items) => `Datum: ${items[0].label}`,
                                label: (item) => `${item.raw} interakcí`
                            }
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { stepSize: 1 } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }

        // 2. Grade Distribution
        const ctxGrades = this.querySelector('#gradesChart')?.getContext('2d');
        if (ctxGrades) {
            if (this._gradesChart) this._gradesChart.destroy();
            this._gradesChart = new Chart(ctxGrades, {
                type: 'bar',
                data: {
                    labels: ['A (Výborně)', 'B (Chvalitebně)', 'C (Dobře)', 'D (Dostatečně)', 'F (Nedostatečně)'],
                    datasets: [{
                        label: 'Počet studentů',
                        data: this._analyticsData.charts.grades,
                        backgroundColor: ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'],
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { stepSize: 1 } },
                        x: { grid: { display: false } }
                    }
                }
            });
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
                            <!-- Tooltip -->
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
        // Loading State
        if (this._isLoading) {
            return html`
                <div class="h-full flex flex-col bg-slate-50 p-6 md:p-8 animate-pulse">
                    <div class="h-8 w-48 bg-slate-200 rounded mb-4"></div>
                    <div class="h-4 w-96 bg-slate-200 rounded mb-8"></div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        ${[1,2,3,4].map(() => html`<div class="h-32 bg-slate-200 rounded-2xl"></div>`)}
                    </div>
                    <div class="flex-grow bg-slate-200 rounded-2xl"></div>
                </div>
            `;
        }

        // Error State
        if (this._error) {
            return html`
                <div class="h-full flex items-center justify-center bg-slate-50">
                    <div class="text-center p-8">
                        <div class="text-red-500 text-5xl mb-4">⚠️</div>
                        <h3 class="text-xl font-bold text-slate-800 mb-2">Chyba při načítání</h3>
                        <p class="text-slate-500 mb-6">${this._error}</p>
                        <button @click="${() => this._fetchData()}" class="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">Zkusit znovu</button>
                    </div>
                </div>
            `;
        }

        const { metrics, insights, meta } = this._analyticsData;

        return html`
            <div class="h-full flex flex-col bg-slate-50 overflow-hidden">
                <!-- Header -->
                <header class="bg-white p-6 md:px-8 md:py-6 border-b border-slate-200 flex-shrink-0">
                    <div class="max-w-7xl mx-auto w-full">
                        <div class="flex justify-between items-end">
                            <div>
                                <h1 class="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Přehled a Analytika</h1>
                                <p class="text-slate-500 mt-1 font-medium text-sm">
                                    Expertní pohled na výkonnost vašich tříd a studentů.
                                    <span class="text-slate-400 text-xs ml-2 font-normal">Aktualizováno: ${new Date(meta.lastUpdated).toLocaleTimeString('cs-CZ', {hour:'2-digit', minute:'2-digit'})}</span>
                                </p>
                            </div>
                            <button @click="${() => this._fetchData()}" class="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Obnovit data">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                            </button>
                        </div>
                    </div>
                </header>

                <!-- Scrollable Content -->
                <div class="flex-grow overflow-y-auto p-6 md:p-8">
                    <div class="max-w-7xl mx-auto space-y-8">

                        <!-- 1. Metrics Cards -->
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            ${this._renderMetricCard(
                                'Celkový Dosah',
                                metrics.totalReach.value,
                                metrics.totalReach.trend,
                                metrics.totalReach.explanation
                            )}
                            ${this._renderMetricCard(
                                'Skóre Zapojení',
                                metrics.engagementScore.value,
                                metrics.engagementScore.trend,
                                metrics.engagementScore.explanation
                            )}
                            ${this._renderMetricCard(
                                'Znalostní Úroveň',
                                metrics.knowledgeMastery.value,
                                metrics.knowledgeMastery.trend,
                                metrics.knowledgeMastery.explanation
                            )}
                            ${this._renderMetricCard(
                                'Rychlost Výuky',
                                metrics.contentVelocity.value,
                                metrics.contentVelocity.trend,
                                metrics.contentVelocity.explanation
                            )}
                        </div>

                        <!-- 2. Charts Section -->
                        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 h-96">
                            <!-- Activity Heatmap -->
                            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 lg:col-span-2 flex flex-col">
                                <h3 class="text-lg font-bold text-slate-800 mb-1">Aktivita Studentů</h3>
                                <p class="text-sm text-slate-500 mb-6">Počet interakcí a odevzdání za posledních 14 dní.</p>
                                <div class="flex-grow relative w-full h-full min-h-0">
                                    <canvas id="activityChart"></canvas>
                                </div>
                            </div>

                            <!-- Grade Distribution -->
                            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                                <h3 class="text-lg font-bold text-slate-800 mb-1">Rozložení Známek</h3>
                                <p class="text-sm text-slate-500 mb-6">Přehled úspěšnosti studentů (A-F).</p>
                                <div class="flex-grow relative w-full h-full min-h-0">
                                    <canvas id="gradesChart"></canvas>
                                </div>
                            </div>
                        </div>

                        <!-- 3. Insights Panel -->
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

                            <!-- Needs Attention -->
                            <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                <div class="p-6 border-b border-slate-50 bg-red-50/30">
                                    <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                                        <span class="w-2 h-2 rounded-full bg-red-500"></span>
                                        Vyžaduje Pozornost
                                    </h3>
                                    <p class="text-sm text-slate-500 mt-1">Studenti s nízkou aktivitou nebo podprůměrnými výsledky.</p>
                                </div>
                                <ul class="divide-y divide-slate-50">
                                    ${insights.needsAttention.length > 0 ? insights.needsAttention.map(s => html`
                                        <li class="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group">
                                            <div class="flex items-center gap-3">
                                                <div class="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-sm">
                                                    ${s.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p class="font-semibold text-slate-800 text-sm">${s.name}</p>
                                                    <p class="text-xs text-red-500 font-medium">${s.reason}</p>
                                                </div>
                                            </div>
                                            <span class="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded group-hover:bg-white group-hover:shadow-sm transition-all">
                                                ${s.detail}
                                            </span>
                                        </li>
                                    `) : html`
                                        <li class="p-8 text-center text-slate-400">
                                            <div class="text-4xl mb-2">🎉</div>
                                            <p>Vše vypadá skvěle! Žádní studenti v riziku.</p>
                                        </li>
                                    `}
                                </ul>
                            </div>

                            <!-- Top Performers -->
                            <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                <div class="p-6 border-b border-slate-50 bg-green-50/30">
                                    <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                                        <span class="w-2 h-2 rounded-full bg-green-500"></span>
                                        Lídři Třídy
                                    </h3>
                                    <p class="text-sm text-slate-500 mt-1">Studenti s excelentními výsledky a vysokou aktivitou.</p>
                                </div>
                                <ul class="divide-y divide-slate-50">
                                    ${insights.topPerformers.length > 0 ? insights.topPerformers.map((s, index) => html`
                                        <li class="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group">
                                            <div class="flex items-center gap-3">
                                                <div class="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold text-sm relative">
                                                    ${s.name.charAt(0)}
                                                    ${index === 0 ? html`<span class="absolute -top-1 -right-1 text-xs">👑</span>` : ''}
                                                </div>
                                                <div>
                                                    <p class="font-semibold text-slate-800 text-sm">${s.name}</p>
                                                    <p class="text-xs text-slate-500">Skóre: <span class="text-green-600 font-bold">${s.avgScore}%</span></p>
                                                </div>
                                            </div>
                                            <div class="flex items-center gap-1">
                                                ${[...Array(Math.min(3, 4 - index))].map(() => html`<span>⭐</span>`)}
                                            </div>
                                        </li>
                                    `) : html`
                                        <li class="p-8 text-center text-slate-400">
                                            <div class="text-4xl mb-2">📊</div>
                                            <p>Zatím nemáme dostatek dat pro vyhodnocení lídrů.</p>
                                        </li>
                                    `}
                                </ul>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('professor-analytics-view', ProfessorAnalyticsView);

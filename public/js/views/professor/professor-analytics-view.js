// public/js/views/professor/professor-analytics-view.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';

let _getGlobalAnalyticsCallable = null;

export class ProfessorAnalyticsView extends LitElement {
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

        if (!_getGlobalAnalyticsCallable) {
            if (!firebaseInit.functions) {
                console.error("CRITICAL: Firebase Functions object is not available for getGlobalAnalyticsCallable!");
                throw new Error("Firebase Functions not initialized.");
            }
            _getGlobalAnalyticsCallable = httpsCallable(firebaseInit.functions, 'getGlobalAnalytics');
        }
    }

    createRenderRoot() { return this; } // Light DOM

    connectedCallback() {
        super.connectedCallback();
        this._loadAnalytics();
    }

    async _loadAnalytics() {
        this._isLoading = true;
        this._error = null;
        try {
            const result = await _getGlobalAnalyticsCallable();
            this._analyticsData = result.data;
        } catch (error) {
            console.error("Error fetching analytics:", error);
            this._error = `Nepodařilo se načíst analytická data: ${error.message}`;
            showToast("Chyba při načítání analýzy.", true);
        } finally {
            this._isLoading = false;
        }
    }

    _createStatCard(title, value, emoji, subtitle = '') {
        return html`
            <div class="bg-white p-6 rounded-xl shadow-lg flex items-center space-x-4">
                <div class="text-4xl">${emoji}</div>
                <div>
                    <h4 class="text-sm font-medium text-slate-500 uppercase tracking-wider">${title}</h4>
                    <p class="text-3xl font-bold text-slate-900">${value}</p>
                    ${subtitle ? html`<p class="text-xs text-slate-400 mt-1">${subtitle}</p>` : ''}
                </div>
            </div>`;
    }

    renderContent() {
        const data = this._analyticsData;
        
        const topStudentsHtml = (data.topStudents || []).map(student => html`
            <li class="flex justify-between items-center py-2 border-b last:border-b-0">
                <span class="text-slate-700">${student.name}</span>
                <span class="font-semibold text-green-700">${student.submissions} odevzdání</span>
            </li>`);

        return html`
            <div id="analytics-content" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${this._createStatCard('Celkový počet studentů', data.studentCount, '👥')}
                ${this._createStatCard('Průměrné skóre (Kvízy)', `${data.avgQuizScore}%`, '❓', `(z ${data.quizSubmissionCount} odevzdání)`)}
                ${this._createStatCard('Průměrné skóre (Testy)', `${data.avgTestScore}%`, '✅', `(z ${data.testSubmissionCount} odevzdání)`)}
                
                <div class="bg-white p-6 rounded-xl shadow-lg md:col-span-2 lg:col-span-3">
                    <h4 class="text-lg font-semibold text-slate-800 mb-4">Top 5 nejaktivnějších studentů</h4>
                    <ul class="divide-y divide-slate-100">
                        ${topStudentsHtml.length > 0 ? topStudentsHtml : html`<p class="text-slate-500 py-4">Žádná aktivita k zobrazení.</p>`}
                    </ul>
                </div>
            </div>
        `;
    }

    render() {
        let content;
        if (this._isLoading) {
            content = html`<div id="analytics-loading" class="text-center text-slate-500"><p>Načítám analytická data...</p></div>`;
        } else if (this._error) {
            content = html`<div id="analytics-loading" class="text-center text-red-500"><p>${this._error}</p></div>`;
        } else if (this._analyticsData) {
            content = this.renderContent();
        } else {
             content = html`<div id="analytics-loading" class="text-center text-slate-500"><p>Žádná analytická data k dispozici.</p></div>`;
        }
        
        return html`
            <div class="p-6 md:p-8">
                <h2 class="text-3xl font-extrabold text-slate-800 mb-6">Analýza platformy</h2>
                ${content}
            </div>
        `;
    }
}

customElements.define('professor-analytics-view', ProfessorAnalyticsView);

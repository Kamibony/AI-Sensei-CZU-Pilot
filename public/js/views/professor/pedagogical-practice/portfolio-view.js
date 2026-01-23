import { LitElement, html, css, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';
import { PracticeService } from '../../../services/practice-service.js';
import { auth } from '../../../firebase-init.js';
import { TIMELINE_EVENT_TYPES } from '../../../shared-constants.js';
import { jsPDF } from 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm';
import autoTable from 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/+esm';
import { addCzechFont } from '../../../utils/pdf-font-utils.js';

export class PortfolioView extends Localized(LitElement) {
    static properties = {
        portfolio: { type: Object },
        observations: { type: Array },
        analyses: { type: Array },
        loading: { type: Boolean },
        stats: { type: Object },
        isSaving: { type: Boolean }
    };

    constructor() {
        super();
        this.practiceService = new PracticeService();
        this.portfolio = null;
        this.observations = [];
        this.analyses = [];
        this.loading = true;
        this.isSaving = false;
        this.stats = {
            totalObservations: 0,
            teachingHours: 0
        };
        this._saveDebounceTimer = null;
    }

    createRenderRoot() { return this; }

    async connectedCallback() {
        super.connectedCallback();
        // Wait for auth to be ready if needed, or assume parent handles it.
        // Better to wait a bit or check auth state.
        if (auth.currentUser) {
            this._loadData(auth.currentUser.uid);
        } else {
            // Wait for auth state change
            auth.onAuthStateChanged(user => {
                if (user) {
                    this._loadData(user.uid);
                } else {
                    this.loading = false;
                }
            });
        }
    }

    async _loadData(uid) {
        this.loading = true;
        try {
            // 1. Ensure portfolio exists
            await this.practiceService.generatePortfolio(uid);

            // 2. Load data
            const [portfolio, observations, analyses] = await Promise.all([
                this.practiceService.getPortfolio(uid),
                this.practiceService.getObservations(uid),
                this.practiceService.getAnalyses(uid)
            ]);

            this.portfolio = portfolio;
            this.observations = observations || [];
            this.analyses = analyses || [];

            this._calculateStats();
        } catch (e) {
            console.error("Failed to load portfolio data", e);
        } finally {
            this.loading = false;
        }
    }

    _calculateStats() {
        const totalObservations = this.observations.length;
        let totalMs = 0;

        this.observations.forEach(obs => {
            if (!obs.timeline || obs.timeline.length === 0) return;

            const endTime = obs.endTime || (obs.timeline[obs.timeline.length - 1].timestamp + 60000); // fallback 1 min

            for (let i = 0; i < obs.timeline.length; i++) {
                const event = obs.timeline[i];
                if (event.type === TIMELINE_EVENT_TYPES.TEACHER_ACTIVITY) {
                    const nextTime = (i < obs.timeline.length - 1) ? obs.timeline[i+1].timestamp : endTime;
                    totalMs += (nextTime - event.timestamp);
                }
            }
        });

        // Convert ms to hours (decimal)
        const teachingHours = (totalMs / (1000 * 60 * 60)).toFixed(1);

        this.stats = {
            totalObservations,
            teachingHours
        };
    }

    _handleSwotChange(type, value) {
        if (!this.portfolio) return;
        const swot = { ...(this.portfolio.swot || {}), [type]: value };
        this.portfolio = { ...this.portfolio, swot };
        this._triggerAutoSave();
    }

    _handleReflectionChange(value) {
        if (!this.portfolio) return;
        this.portfolio = { ...this.portfolio, selfReflection: value };
        this._triggerAutoSave();
    }

    _triggerAutoSave() {
        if (this._saveDebounceTimer) clearTimeout(this._saveDebounceTimer);
        this.isSaving = true;
        this._saveDebounceTimer = setTimeout(async () => {
            if (this.portfolio && this.portfolio.id) {
                try {
                    // We need to implement updatePortfolio in PracticeService or use generic update
                    // Assuming PracticeService.updatePortfolio will be implemented in Step 3
                    if (this.practiceService.updatePortfolio) {
                        await this.practiceService.updatePortfolio(this.portfolio.id, {
                            swot: this.portfolio.swot,
                            selfReflection: this.portfolio.selfReflection
                        });
                    } else {
                        // Fallback or todo
                        console.warn("updatePortfolio method missing in PracticeService");
                    }
                } catch (e) {
                    console.error("Auto-save failed", e);
                } finally {
                    this.isSaving = false;
                }
            }
        }, 1000);
    }

    async _generatePDF() {
        // Fix for autoTable not being applied automatically in some ESM environments
        if (typeof autoTable === 'object' && autoTable.applyPlugin) {
            autoTable.applyPlugin(jsPDF);
        }

        const doc = new jsPDF();
        addCzechFont(doc);

        const margin = 20;
        let y = margin;

        // Header
        doc.setFontSize(22);
        doc.text(this.t('portfolio.export_title'), margin, y);
        y += 10;

        doc.setFontSize(12);
        doc.text(`${this.t('portfolio.generated_on')}: ${new Date().toLocaleDateString()}`, margin, y);
        y += 10;
        doc.text(`Student: ${auth.currentUser?.displayName || auth.currentUser?.email}`, margin, y);
        y += 20;

        // Section 1: Summary Table
        doc.setFontSize(16);
        doc.text("Přehled náslechů", margin, y);
        y += 10;

        const summaryData = this.observations.map(obs => [
            new Date(obs.startTime).toLocaleDateString(),
            new Date(obs.startTime).toLocaleTimeString(),
            obs.id.substring(0, 8) // Short ID as placeholder for class/school if missing
        ]);

        doc.autoTable({
            startY: y,
            head: [['Datum', 'Čas', 'ID / Třída']],
            body: summaryData,
            styles: { font: 'Roboto', fontStyle: 'normal' }
        });

        y = doc.lastAutoTable.finalY + 20;

        // Section 2: Stats Table
        doc.text("Statistika času (Učitel vs. Student)", margin, y);
        y += 10;

        const statsData = this.observations.map(obs => {
            // Recalculate % for each
            let teacherTime = 0;
            let studentTime = 0;
            let otherTime = 0;

            if (obs.timeline) {
                const endTime = obs.endTime || (obs.timeline.length > 0 ? obs.timeline[obs.timeline.length-1].timestamp : obs.startTime);
                 for (let i = 0; i < obs.timeline.length; i++) {
                    const event = obs.timeline[i];
                    const nextTime = (i < obs.timeline.length - 1) ? obs.timeline[i+1].timestamp : endTime;
                    const duration = nextTime - event.timestamp;

                    if (event.type === TIMELINE_EVENT_TYPES.TEACHER_ACTIVITY) teacherTime += duration;
                    else if (event.type === TIMELINE_EVENT_TYPES.STUDENT_ACTIVITY) studentTime += duration;
                    else otherTime += duration;
                }
            }
            const total = teacherTime + studentTime + otherTime || 1;
            const teacherPct = Math.round((teacherTime / total) * 100);
            const studentPct = Math.round((studentTime / total) * 100);

            return [
                new Date(obs.startTime).toLocaleDateString(),
                `${teacherPct}%`,
                `${studentPct}%`
            ];
        });

        doc.autoTable({
            startY: y,
            head: [['Datum', 'Čas učitele', 'Čas žáků']],
            body: statsData,
            styles: { font: 'Roboto', fontStyle: 'normal' }
        });

        y = doc.lastAutoTable.finalY + 20;

        // Section 3: Microteaching
        doc.text("Mikrovýstupy", margin, y);
        y += 10;

        const microteachingData = this.analyses.map(analysis => [
             // Goal formulation
             analysis.goalFormulation || "(Neuvedeno)",
             // Status/ID
             analysis.id.substring(0, 8)
        ]);

        doc.autoTable({
            startY: y,
            head: [['Formulace cíle', 'ID']],
            body: microteachingData,
            styles: { font: 'Roboto', fontStyle: 'normal' }
        });

        y = doc.lastAutoTable.finalY + 20;

        // Check page break
        if (y > 250) {
            doc.addPage();
            y = margin;
        }

        // Section 4: Reflection
        doc.text("Reflexe", margin, y);
        y += 10;

        // SWOT
        const swot = this.portfolio?.swot || {};
        const swotData = [
            ['Silné stránky', swot.strengths || ''],
            ['Slabé stránky', swot.weaknesses || ''],
            ['Příležitosti', swot.opportunities || ''],
            ['Hrozby', swot.threats || '']
        ];

        doc.autoTable({
            startY: y,
            body: swotData,
            theme: 'grid',
            styles: { font: 'Roboto', fontStyle: 'normal' },
            columnStyles: { 0: { fontStyle: 'bold', width: 50 } }
        });

        y = doc.lastAutoTable.finalY + 20;

        if (y > 250) {
            doc.addPage();
            y = margin;
        }

        doc.text("Celkové zhodnocení", margin, y);
        y += 10;

        const reflectionText = this.portfolio?.selfReflection || "";
        const splitText = doc.splitTextToSize(reflectionText, 170);
        doc.setFontSize(11);
        doc.text(splitText, margin, y);

        // Footer / Signature
        const pageHeight = doc.internal.pageSize.height;
        doc.line(margin, pageHeight - 30, margin + 60, pageHeight - 30);
        doc.text("Podpis studenta", margin, pageHeight - 20);

        doc.line(pageHeight - margin - 60, pageHeight - 30, pageHeight - margin, pageHeight - 30); // Right align roughly
        // Actually simplified right align:
        doc.line(130, pageHeight - 30, 190, pageHeight - 30);
        doc.text("Podpis garanta", 130, pageHeight - 20);

        doc.save('portfolio.pdf');
    }

    render() {
        if (this.loading) {
            return html`
                <div class="p-12 text-center text-slate-500">
                    ${this.t('common.loading', 'Načítám portfolio...')}
                </div>
            `;
        }

        const swot = this.portfolio?.swot || {};

        return html`
            <div class="space-y-8 pb-24 max-w-6xl mx-auto p-6">
                <!-- Header -->
                <div class="flex justify-between items-start">
                    <div>
                        <h1 class="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">📘 ${this.t('portfolio.title', 'Reflexe (Portfólio)')}</h1>
                        <p class="text-slate-500 max-w-2xl">
                            ${this.t('portfolio.subtitle', 'Finální agregace dat pro zápočet...')}
                        </p>
                    </div>
                    <button
                        @click="${this._generatePDF}"
                        class="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-bold">
                        <span>📄</span> ${this.t('portfolio.export_btn', 'Stáhnout Portfólio (PDF)')}
                    </button>
                </div>

                <!-- Dashboard Cards -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white shadow-md">
                        <div class="text-indigo-100 font-medium mb-1">${this.t('portfolio.dashboard.total_observations', 'Absolvované náslechy')}</div>
                        <div class="text-5xl font-bold">${this.stats.totalObservations}</div>
                        <div class="text-indigo-200 text-sm mt-2">${this.t('portfolio.dashboard.records_count', 'záznamů v systému')}</div>
                    </div>
                    <div class="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-6 text-white shadow-md">
                        <div class="text-emerald-100 font-medium mb-1">${this.t('portfolio.dashboard.teaching_hours', 'Odučené hodiny')}</div>
                        <div class="text-5xl font-bold">${this.stats.teachingHours}</div>
                        <div class="text-emerald-200 text-sm mt-2">${this.t('portfolio.dashboard.teaching_hours_desc', 'hodin (čistého času výkladu)')}</div>
                    </div>
                </div>

                <!-- SWOT Analysis -->
                <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div class="p-6 border-b border-slate-100 flex justify-between items-center">
                        <h2 class="text-xl font-bold text-slate-800">${this.t('portfolio.swot.title', 'SWOT Analýza')}</h2>
                        ${this.isSaving ? html`<span class="text-xs text-slate-400 animate-pulse">${this.t('common.saving', 'Ukládám...')}</span>` : nothing}
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                        <!-- Strengths -->
                        <div class="p-6 bg-green-50/30">
                            <label class="block font-bold text-green-800 mb-2">💪 ${this.t('portfolio.swot.strengths', 'Silné stránky')}</label>
                            <textarea
                                .value="${swot.strengths || ''}"
                                @input="${e => this._handleSwotChange('strengths', e.target.value)}"
                                class="w-full h-32 rounded-lg border-green-200 bg-white focus:border-green-500 focus:ring-green-500"
                                placeholder="${this.t('portfolio.swot.strengths_ph', 'V čem jste dobří?')}"></textarea>
                        </div>
                        <!-- Weaknesses -->
                        <div class="p-6 bg-red-50/30">
                            <label class="block font-bold text-red-800 mb-2">🐢 ${this.t('portfolio.swot.weaknesses', 'Slabé stránky')}</label>
                            <textarea
                                .value="${swot.weaknesses || ''}"
                                @input="${e => this._handleSwotChange('weaknesses', e.target.value)}"
                                class="w-full h-32 rounded-lg border-red-200 bg-white focus:border-red-500 focus:ring-red-500"
                                placeholder="${this.t('portfolio.swot.weaknesses_ph', 'Kde máte rezervy?')}"></textarea>
                        </div>
                        <!-- Opportunities -->
                        <div class="p-6 bg-blue-50/30 border-t border-slate-100">
                            <label class="block font-bold text-blue-800 mb-2">🚀 ${this.t('portfolio.swot.opportunities', 'Příležitosti')}</label>
                            <textarea
                                .value="${swot.opportunities || ''}"
                                @input="${e => this._handleSwotChange('opportunities', e.target.value)}"
                                class="w-full h-32 rounded-lg border-blue-200 bg-white focus:border-blue-500 focus:ring-blue-500"
                                placeholder="${this.t('portfolio.swot.opportunities_ph', 'Co vám může pomoci růst?')}"></textarea>
                        </div>
                        <!-- Threats -->
                        <div class="p-6 bg-amber-50/30 border-t border-slate-100">
                            <label class="block font-bold text-amber-800 mb-2">⚠️ ${this.t('portfolio.swot.threats', 'Hrozby')}</label>
                            <textarea
                                .value="${swot.threats || ''}"
                                @input="${e => this._handleSwotChange('threats', e.target.value)}"
                                class="w-full h-32 rounded-lg border-amber-200 bg-white focus:border-amber-500 focus:ring-amber-500"
                                placeholder="${this.t('portfolio.swot.threats_ph', 'Co vás může ohrozit?')}"></textarea>
                        </div>
                    </div>
                </div>

                <!-- Global Reflection -->
                <div class="bg-white rounded-xl shadow-sm border border-slate-200">
                    <div class="p-6 border-b border-slate-100">
                        <h2 class="text-xl font-bold text-slate-800">${this.t('portfolio.reflection.title', 'Celkové zhodnocení praxe')}</h2>
                    </div>
                    <div class="p-6">
                        <textarea
                            .value="${this.portfolio?.selfReflection || ''}"
                            @input="${e => this._handleReflectionChange(e.target.value)}"
                            class="w-full h-64 rounded-lg border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                            placeholder="${this.t('portfolio.reflection.placeholder', 'Popište celkový průběh...')}"></textarea>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('portfolio-view', PortfolioView);

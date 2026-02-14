import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { translationService } from '../../utils/translation-service.js';
import './mission-comms.js';

export class MissionDashboard extends LitElement {
    static get properties() {
        return {
            lessonData: { type: Object },
            progress: { type: Object },
            currentUserData: { type: Object },
            lessonId: { type: String },
            isCrisisActive: { type: Boolean },
            activeCrisis: { type: Object }
        };
    }

    createRenderRoot() {
        return this;
    }

    render() {
        if (!this.lessonData) return html``;

        const isCrisisActive = this.isCrisisActive || false;
        const phase = this.lessonData.mission_config?.phase || translationService.t('mission.dashboard.unknown');

        const userRole = this.progress?.role || translationService.t('mission.dashboard.no_role');
        const secretObjective = this.progress?.secret_objective || translationService.t('mission.dashboard.no_objective');

        return html`
            <div class="mission-dashboard-container w-full h-[calc(100vh-140px)] bg-slate-900 rounded-3xl overflow-hidden flex flex-col md:flex-row shadow-2xl border-4 ${isCrisisActive ? 'border-red-500 animate-pulse-border' : 'border-slate-700'} transition-colors duration-500">
                <style>
                    /* Custom styles for Mission Dashboard */
                    .mission-dashboard-container mission-comms > div:first-child {
                        height: 100% !important;
                        border-radius: 0.75rem !important;
                        box-shadow: none !important;
                    }

                    @keyframes pulse-border {
                        0%, 100% { border-color: rgba(239, 68, 68, 1); }
                        50% { border-color: rgba(239, 68, 68, 0.4); }
                    }
                    .animate-pulse-border {
                        animation: pulse-border 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                    }
                </style>

                <!-- Zone A: Identity (Left) -->
                <div class="w-full md:w-1/4 bg-slate-800 text-slate-200 p-6 flex flex-col gap-6 border-b md:border-b-0 md:border-r border-slate-700">
                    <div>
                        <h3 class="text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">${translationService.t('mission.dashboard.role_label')}</h3>
                        <div class="bg-slate-700/50 p-3 rounded-lg border border-slate-600 flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                                ${userRole.charAt(0).toUpperCase()}
                            </div>
                            <span class="font-bold text-white text-lg">${userRole}</span>
                        </div>
                    </div>

                    <div class="flex-grow">
                        <h3 class="text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">${translationService.t('mission.dashboard.objective_label')}</h3>
                        <div class="bg-slate-700/30 p-4 rounded-xl border border-slate-600 h-full relative overflow-hidden group">
                            <div class="absolute inset-0 bg-emerald-500/5 group-hover:bg-emerald-500/10 transition-colors"></div>
                            <p class="text-sm font-mono text-emerald-300 leading-relaxed relative z-10">
                                ${secretObjective}
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Zone B: Comms (Center) -->
                <div class="w-full md:w-1/2 bg-slate-100 flex flex-col relative">
                     <!-- Chat Panel takes full height of this container -->
                     <div class="absolute inset-0 p-2 md:p-3 bg-slate-900">
                        <mission-comms
                            .lessonId=${this.lessonId}
                            .currentUserData=${this.currentUserData}
                            .activeCrisis=${this.activeCrisis}
                            .role=${userRole}
                            .topic=${this.lessonData.title || 'Misia'}
                            .missionStarted=${this.progress?.has_started_mission || false}
                            class="h-full w-full block">
                        </mission-comms>
                     </div>
                </div>

                <!-- Zone C: Status (Right) -->
                <div class="w-full md:w-1/4 bg-slate-800 text-slate-200 p-6 flex flex-col gap-6 border-t md:border-t-0 md:border-l border-slate-700">

                    <!-- Crisis Monitor -->
                    <div class="p-5 rounded-xl border-2 ${isCrisisActive ? 'bg-red-900/30 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-slate-700/30 border-slate-600'} transition-all duration-500">
                        <h3 class="text-xs uppercase tracking-widest text-slate-500 font-bold mb-3 border-b border-slate-600/50 pb-2">${translationService.t('mission.dashboard.status_label')}</h3>

                        ${isCrisisActive ? html`
                            <div class="flex flex-col gap-3 animate-in fade-in zoom-in duration-300">
                                <div class="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest self-start animate-pulse">
                                    ${translationService.t('mission.dashboard.crisis_alert')}
                                </div>

                                <div>
                                    <h4 class="text-lg font-black text-white leading-tight mb-1">
                                        ${this.activeCrisis?.title || 'Unknown Crisis'}
                                    </h4>
                                    <p class="text-xs text-red-200 font-medium leading-relaxed">
                                        ${this.activeCrisis?.description || 'No briefing available.'}
                                    </p>
                                </div>

                                <div class="bg-black/40 rounded-lg p-2 border border-red-500/30">
                                    <p class="text-xs text-red-300 font-bold text-center">
                                        ⚠️ Použijte chat k vyřešení situace!
                                    </p>
                                </div>
                            </div>
                        ` : html`
                            <div class="flex flex-col items-center text-center gap-2 text-emerald-400 font-bold opacity-80">
                                <svg class="w-12 h-12 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span class="text-sm tracking-widest">${translationService.t('mission.dashboard.system_nominal')}</span>
                            </div>
                        `}
                    </div>

                    <!-- Mission Progress -->
                    <div class="mt-auto">
                        <h3 class="text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">${translationService.t('mission.dashboard.phase_label')}</h3>
                        <div class="bg-slate-700/50 p-4 rounded-xl border border-slate-600">
                            <div class="text-2xl font-black text-white tracking-tighter opacity-90 mb-2">
                                ${phase.toUpperCase()}
                            </div>
                            <div class="w-full bg-slate-900 h-3 rounded-full overflow-hidden shadow-inner">
                                <div class="bg-gradient-to-r from-indigo-500 to-purple-500 h-full w-2/3 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
                            </div>
                        </div>
                    </div>

                </div>

            </div>
        `;
    }
}

customElements.define('mission-dashboard', MissionDashboard);

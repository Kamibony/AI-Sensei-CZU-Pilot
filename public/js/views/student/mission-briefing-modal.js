import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { translationService } from '../../utils/translation-service.js';

export class MissionBriefingModal extends LitElement {
    static properties = {
        roleData: { type: Object },
        isLoading: { type: Boolean }
    };

    static styles = css`
        :host { display: block; }
    `;

    constructor() {
        super();
        this.roleData = null;
        this.isLoading = false;
    }

    createRenderRoot() { return this; }

    _handleAccept() {
        this.isLoading = true;
        this.dispatchEvent(new CustomEvent('mission-accepted', {
            bubbles: true,
            composed: true
        }));
    }

    render() {
        if (!this.roleData) return html``;

        const t = (k) => translationService.t(k);

        return html`
            <div class="fixed inset-0 z-[100] bg-black bg-opacity-95 flex items-center justify-center p-4 overflow-hidden animate-fade-in">
                <!-- Background visual noise/grid could be here -->

                <div class="relative w-full max-w-2xl bg-gray-900 border-2 border-green-500 shadow-[0_0_50px_rgba(34,197,94,0.3)] rounded-lg overflow-hidden flex flex-col font-mono text-green-400">

                    <!-- Header -->
                    <div class="p-6 border-b border-green-800 flex justify-between items-center bg-gray-950">
                        <div class="flex items-center gap-3">
                            <span class="animate-pulse text-2xl">🕵️‍♂️</span>
                            <h2 class="text-xl md:text-2xl font-bold tracking-[0.2em] uppercase text-green-500 shadow-green-glow">
                                ${t('mission.onboarding.title')}
                            </h2>
                        </div>
                        <div class="text-xs text-green-700 animate-pulse border border-green-900 px-2 py-1 rounded">
                            ${t('mission.onboarding.encrypted')}
                        </div>
                    </div>

                    <!-- Content -->
                    <div class="p-8 space-y-8 relative">
                        <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-green-500 to-transparent animate-scanline"></div>

                        <!-- Role Identity -->
                        <div class="space-y-2 animate-typewriter-1">
                            <label class="text-xs uppercase tracking-widest text-green-600 block mb-1">
                                ${t('mission.onboarding.role_label')}
                            </label>
                            <h1 class="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter">
                                ${this.roleData.title}
                            </h1>
                            <p class="text-green-300 leading-relaxed text-lg border-l-4 border-green-700 pl-4 py-1 mt-2">
                                ${this.roleData.description}
                            </p>
                        </div>

                        <!-- Objective -->
                        <div class="space-y-2 bg-green-900/10 p-4 rounded border border-green-800/50 animate-typewriter-2 delay-500">
                            <label class="text-xs uppercase tracking-widest text-green-600 block mb-1 flex items-center gap-2">
                                <span>🎯</span> ${t('mission.onboarding.objective_label')}
                            </label>
                            <p class="text-white font-bold text-lg">
                                ${this.roleData.secret_objective || this.roleData.secret_task || t('mission.onboarding.no_objective')}
                            </p>
                        </div>

                    </div>

                    <!-- Footer / Actions -->
                    <div class="p-6 border-t border-green-800 bg-gray-950 flex justify-center">
                        <button
                            @click=${this._handleAccept}
                            ?disabled=${this.isLoading}
                            class="group relative px-8 py-4 bg-green-700 hover:bg-green-600 text-white font-bold tracking-widest uppercase rounded transition-all transform hover:scale-105 hover:shadow-[0_0_20px_rgba(34,197,94,0.6)] disabled:opacity-50 disabled:cursor-not-allowed w-full md:w-auto overflow-hidden">

                            <span class="relative z-10 flex items-center gap-3">
                                ${this.isLoading
                                    ? html`<span class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span> ${t('mission.onboarding.loading')}`
                                    : html`<span>${t('mission.onboarding.accept_btn')}</span> <span class="group-hover:translate-x-1 transition-transform">➤</span>`
                                }
                            </span>

                            <!-- Button Glitch Effect -->
                            <div class="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-75"></div>
                        </button>
                    </div>

                </div>
            </div>

            <style>
                .shadow-green-glow { text-shadow: 0 0 10px rgba(34, 197, 94, 0.5); }
                @keyframes scanline {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                .animate-scanline {
                    animation: scanline 3s linear infinite;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in {
                    animation: fadeIn 0.5s ease-out forwards;
                }
            </style>
        `;
    }
}

customElements.define('mission-briefing-modal', MissionBriefingModal);

import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';
import { PracticeService } from '../../../services/practice-service.js';
import { TIMELINE_EVENT_TYPES, OBSERVATION_QUESTIONS } from '../../../shared-constants.js';
import { auth } from '../../../firebase-init.js';

export class ObservationView extends Localized(LitElement) {
    static properties = {
        isRecording: { type: Boolean },
        currentSession: { type: Object },
        elapsedTime: { type: String },
        // Internal state for stats
        stats: { type: Object },
        studentId: { type: String }
    };

    constructor() {
        super();
        this.practiceService = new PracticeService();
        this.isRecording = false;
        this.currentSession = null;
        this.elapsedTime = "00:00";
        this.timerInterval = null;
        this.stats = { teacher: 0, student: 0 };
    }

    createRenderRoot() { return this; }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopTimer();
    }

    async _startObservation() {
        try {
            const data = {
                startTime: Date.now(),
                status: 'recording',
                questions: {}, // Initialize answers
                studentId: this.studentId || auth.currentUser?.uid
            };
            const id = await this.practiceService.createObservation(data);
            this.currentSession = { id, ...data, timeline: [] };
            this.isRecording = true;
            this._startTimer();
        } catch (e) {
            console.error("Failed to start observation", e);
            alert("Failed to start observation");
        }
    }

    _startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        const start = this.currentSession.startTime;
        this.timerInterval = setInterval(() => {
            const now = Date.now();
            const diff = Math.floor((now - start) / 1000);
            const m = Math.floor(diff / 60).toString().padStart(2, '0');
            const s = (diff % 60).toString().padStart(2, '0');
            this.elapsedTime = `${m}:${s}`;
        }, 1000);
    }

    _stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    async _finishObservation() {
        this._stopTimer();
        this.isRecording = false;
        if (this.currentSession) {
            await this._updateSession({ status: 'finished', endTime: Date.now() });
            this._calculateStats();
        }
    }

    async _logEvent(type) {
        if (!this.currentSession) return;
        try {
            const event = await this.practiceService.logTimelineEvent(this.currentSession.id, type);
            // Update local state
            this.currentSession = {
                ...this.currentSession,
                timeline: [...(this.currentSession.timeline || []), event]
            };
            this._calculateStats(); // Update stats in real-time if needed
        } catch (e) {
            console.error("Failed to log event", e);
        }
    }

    async _updateSession(updates) {
        if (!this.currentSession) return;
        try {
            await this.practiceService.updateObservation(this.currentSession.id, updates);
            this.currentSession = { ...this.currentSession, ...updates };
        } catch (e) {
            console.error("Failed to update session", e);
        }
    }

    async _handleQuestionChange(key, value) {
        if (!this.currentSession) return;
        const questions = { ...(this.currentSession.questions || {}), [key]: value };
        // Debounce could be added here, but for now direct update
        // We'll update local state immediately
        this.currentSession = { ...this.currentSession, questions };
        // And trigger save (maybe debounced in real app, here simple)
        await this._updateSession({ questions });
    }

    async _updateEventNote(index, note) {
        if (!this.currentSession) return;
        const timeline = [...this.currentSession.timeline];
        timeline[index] = { ...timeline[index], note };
        // Optimistic update
        this.currentSession = { ...this.currentSession, timeline };
        // Save full timeline - limitation of Firestore array update, might need to rewrite whole timeline
        // PracticeService doesn't have updateTimelineEvent, so we use updateObservation with full timeline
        await this._updateSession({ timeline });
    }

    _calculateStats() {
        if (!this.currentSession || !this.currentSession.timeline) return;

        // Simple calculation: sum durations between events
        // This is tricky without end times for events.
        // We assume an event lasts until the next event.

        let teacherTime = 0;
        let studentTime = 0;
        let otherTime = 0;

        const timeline = this.currentSession.timeline;
        const endTime = this.currentSession.endTime || Date.now();

        for (let i = 0; i < timeline.length; i++) {
            const event = timeline[i];
            const nextTime = (i < timeline.length - 1) ? timeline[i+1].timestamp : endTime;
            const duration = nextTime - event.timestamp;

            if (event.type === TIMELINE_EVENT_TYPES.TEACHER_ACTIVITY || event.type === TIMELINE_EVENT_TYPES.ADMIN) {
                teacherTime += duration;
            } else if (event.type === TIMELINE_EVENT_TYPES.STUDENT_ACTIVITY) {
                studentTime += duration;
            } else {
                otherTime += duration;
            }
        }

        const total = teacherTime + studentTime + otherTime || 1; // Avoid div by zero

        this.stats = {
            teacher: Math.round((teacherTime / total) * 100),
            student: Math.round((studentTime / total) * 100),
            other: Math.round((otherTime / total) * 100)
        };
        this.requestUpdate();
    }

    render() {
        if (this.isRecording) {
            return this._renderLiveLogger();
        } else if (this.currentSession) {
            return this._renderDetailView();
        } else {
            return this._renderEmptyState();
        }
    }

    _renderEmptyState() {
        return html`
            <div class="p-6 bg-white rounded-xl shadow-sm border border-slate-200 h-full flex items-center justify-center">
                <div class="text-center py-12">
                    <div class="text-6xl mb-4">🦻</div>
                    <h2 class="text-2xl font-bold text-slate-800 mb-2">${this.t('observation.new_btn')}</h2>
                    <p class="text-slate-500 mb-6 max-w-lg mx-auto">
                        Zde budete zaznamenávat náslechy z výuky. Modul bude obsahovat formulář pro záznam didaktických otázek a časovou osu hodiny.
                    </p>
                    <button
                        @click="${this._startObservation}"
                        class="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 mx-auto">
                        <span>➕</span> ${this.t('observation.new_btn')}
                    </button>
                </div>
            </div>
        `;
    }

    _renderLiveLogger() {
        return html`
            <div class="flex flex-col h-full bg-slate-50 p-4 gap-4">
                <!-- Header / Timer -->
                <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
                    <div class="flex items-center gap-2">
                        <div class="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                        <span class="font-bold text-red-600">${this.t('observation.status.recording')}</span>
                    </div>
                    <div class="text-4xl font-mono font-bold text-slate-800">
                        ${this.elapsedTime}
                    </div>
                    <button
                        @click="${this._finishObservation}"
                        class="text-slate-500 hover:text-slate-700 font-medium">
                        ${this.t('common.done')} ⏹
                    </button>
                </div>

                <!-- Activity Buttons -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                    <button
                        @click="${() => this._logEvent(TIMELINE_EVENT_TYPES.TEACHER_ACTIVITY)}"
                        class="bg-red-50 hover:bg-red-100 border-2 border-red-200 rounded-xl p-6 flex flex-col items-center justify-center gap-4 transition-all active:scale-95 group">
                        <div class="text-6xl group-hover:scale-110 transition-transform">🔴</div>
                        <span class="text-xl font-bold text-red-800">${this.t('observation.btn.teacher_activity')}</span>
                    </button>

                    <button
                        @click="${() => this._logEvent(TIMELINE_EVENT_TYPES.STUDENT_ACTIVITY)}"
                        class="bg-green-50 hover:bg-green-100 border-2 border-green-200 rounded-xl p-6 flex flex-col items-center justify-center gap-4 transition-all active:scale-95 group">
                        <div class="text-6xl group-hover:scale-110 transition-transform">🟢</div>
                        <span class="text-xl font-bold text-green-800">${this.t('observation.btn.student_activity')}</span>
                    </button>

                    <button
                        @click="${() => this._logEvent(TIMELINE_EVENT_TYPES.ADMIN)}"
                        class="bg-slate-50 hover:bg-slate-100 border-2 border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center gap-4 transition-all active:scale-95 group">
                        <div class="text-6xl group-hover:scale-110 transition-transform">⚪</div>
                        <span class="text-xl font-bold text-slate-800">${this.t('observation.btn.admin')}</span>
                    </button>
                </div>
            </div>
        `;
    }

    _renderDetailView() {
        return html`
            <div class="flex flex-col h-full bg-slate-50 overflow-y-auto">
                <div class="p-6 max-w-5xl mx-auto w-full space-y-6">
                    <!-- Header -->
                    <div class="flex justify-between items-center">
                        <h2 class="text-2xl font-bold text-slate-800">Detail Náslechu</h2>
                        <div class="flex gap-2">
                             <button
                                @click="${() => this.currentSession = null}"
                                class="text-slate-500 hover:text-slate-700 px-4 py-2">
                                ${this.t('common.back')}
                            </button>
                            <button
                                @click="${() => this._updateSession(this.currentSession)}"
                                class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-sm flex items-center gap-2">
                                <span>💾</span> ${this.t('observation.save_btn')}
                            </button>
                        </div>
                    </div>

                    <!-- Chart -->
                    <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 class="font-bold text-slate-700 mb-4">${this.t('observation.chart.title')}</h3>
                        <div class="flex h-8 w-full rounded-full overflow-hidden bg-slate-100 mb-2">
                            <div style="width: ${this.stats.teacher}%" class="bg-red-500 h-full transition-all duration-500"></div>
                            <div style="width: ${this.stats.student}%" class="bg-green-500 h-full transition-all duration-500"></div>
                            <div style="width: ${this.stats.other}%" class="bg-slate-300 h-full transition-all duration-500"></div>
                        </div>
                        <div class="flex gap-6 text-sm">
                            <div class="flex items-center gap-2">
                                <div class="w-3 h-3 rounded-full bg-red-500"></div>
                                <span>${this.t('observation.chart.teacher')} (${this.stats.teacher}%)</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <div class="w-3 h-3 rounded-full bg-green-500"></div>
                                <span>${this.t('observation.chart.student')} (${this.stats.student}%)</span>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <!-- Form -->
                        <div class="space-y-4">
                            <h3 class="font-bold text-slate-700 text-lg">${this.t('observation.questions.title')}</h3>
                            ${OBSERVATION_QUESTIONS.map(key => html`
                                <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                                    <label class="block text-sm font-medium text-slate-700 mb-2">
                                        ${this.t(`observation.questions.${key}`)}
                                    </label>
                                    <textarea
                                        .value="${this.currentSession.questions?.[key] || ''}"
                                        @input="${(e) => this._handleQuestionChange(key, e.target.value)}"
                                        class="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 min-h-[100px]"
                                        placeholder="..."></textarea>
                                </div>
                            `)}
                        </div>

                        <!-- Timeline -->
                        <div class="space-y-4">
                            <h3 class="font-bold text-slate-700 text-lg">${this.t('observation.timeline.title')}</h3>
                            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                <div class="divide-y divide-slate-100">
                                    ${this.currentSession.timeline?.map((event, index) => {
                                        const date = new Date(event.timestamp);
                                        const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                                        let icon = '⚪';
                                        let color = 'text-slate-600';
                                        if (event.type === TIMELINE_EVENT_TYPES.TEACHER_ACTIVITY) { icon = '🔴'; color = 'text-red-600'; }
                                        if (event.type === TIMELINE_EVENT_TYPES.STUDENT_ACTIVITY) { icon = '🟢'; color = 'text-green-600'; }

                                        return html`
                                            <div class="p-4 hover:bg-slate-50 transition-colors">
                                                <div class="flex items-start gap-3">
                                                    <div class="text-2xl">${icon}</div>
                                                    <div class="flex-1 min-w-0">
                                                        <div class="flex justify-between items-baseline mb-1">
                                                            <span class="font-medium ${color} truncate">
                                                                ${this.t(`observation.btn.${event.type}`) || event.type}
                                                            </span>
                                                            <span class="text-xs text-slate-400 font-mono">${time}</span>
                                                        </div>
                                                        <input
                                                            type="text"
                                                            .value="${event.note || ''}"
                                                            @change="${(e) => this._updateEventNote(index, e.target.value)}"
                                                            class="w-full text-sm border-0 border-b border-transparent bg-transparent hover:border-slate-300 focus:border-indigo-500 focus:ring-0 px-0 py-1 transition-colors placeholder-slate-300"
                                                            placeholder="${this.t('observation.timeline.note_placeholder')}">
                                                    </div>
                                                </div>
                                            </div>
                                        `;
                                    })}
                                    ${(!this.currentSession.timeline || this.currentSession.timeline.length === 0) ? html`
                                        <div class="p-8 text-center text-slate-400 italic">
                                            Žádné události
                                        </div>
                                    ` : nothing}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('observation-view', ObservationView);

import { LitElement, html, css, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../utils/localization-mixin.js';
import { doc, onSnapshot, setDoc, updateDoc, arrayUnion, arrayRemove, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { db, auth, functions } from '../../firebase-init.js';
import confetti from 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/+esm';
import { showToast } from '../../utils/utils.js';

export class StudentProjectView extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        _progress: { state: true },
        _loading: { state: true },
        _activeCrisis: { state: true },
        _isResolvingCrisis: { state: true }
    };

    constructor() {
        super();
        this.lesson = null;
        this._progress = null; // { selectedRole: string, completedTasks: [] }
        this._loading = true;
        this._unsubscribe = null;
        this._activeCrisis = null;
        this._crisisUnsubscribe = null;
        this._isResolvingCrisis = false;
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        if (this.lesson && this.lesson.id) {
            this._initProgressTracking();
            this._initCrisisListener();
        }
    }

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson') && this.lesson && this.lesson.id) {
            if (!this._unsubscribe) {
                this._initProgressTracking();
            }
            if (!this._crisisUnsubscribe) {
                this._initCrisisListener();
            }
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubscribe) this._unsubscribe();
        if (this._crisisUnsubscribe) this._crisisUnsubscribe();
    }

    _initProgressTracking() {
        const user = auth.currentUser;
        if (!user || !this.lesson) return;

        const progressRef = doc(db, `students/${user.uid}/progress/${this.lesson.id}`);
        this._unsubscribe = onSnapshot(progressRef, (docSnap) => {
            if (docSnap.exists()) {
                this._progress = docSnap.data();
            } else {
                this._progress = { selectedRole: null, completedTasks: [] };
            }
            this._loading = false;
        });
    }

    _initCrisisListener() {
        if (!this.lesson || !this.lesson.id) return;
        const lessonRef = doc(db, 'lessons', this.lesson.id);
        this._crisisUnsubscribe = onSnapshot(lessonRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                this._activeCrisis = data.activeCrisis || null;

                // Optional: Play sound if crisis just appeared
                if (this._activeCrisis && !this._previousCrisisState) {
                    // console.log("Crisis started!");
                }
                this._previousCrisisState = !!this._activeCrisis;
            }
        });
    }

    async _selectRole(roleId) {
        const user = auth.currentUser;
        if (!user) return;

        const progressRef = doc(db, `students/${user.uid}/progress/${this.lesson.id}`);

        // Optimistic update
        this._progress = { ...this._progress, selectedRole: roleId };

        await setDoc(progressRef, {
            selectedRole: roleId,
            startedAt: new Date().toISOString()
        }, { merge: true });

        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });
    }

    async _toggleTask(taskId) {
        const user = auth.currentUser;
        if (!user) return;

        const isCompleted = this._progress?.completedTasks?.includes(taskId);
        const progressRef = doc(db, `students/${user.uid}/progress/${this.lesson.id}`);

        if (isCompleted) {
             await updateDoc(progressRef, {
                completedTasks: arrayRemove(taskId)
            });
        } else {
            await updateDoc(progressRef, {
                completedTasks: arrayUnion(taskId)
            });
            confetti({
                particleCount: 30,
                spread: 50,
                origin: { y: 0.7 },
                scalar: 0.7
            });
        }
    }

    _handleChangeRole() {
        if (confirm("Are you sure you want to change your role?")) {
             this._selectRole(null);
        }
    }

    async _handleResolveCrisis() {
        if (!this.lesson || !this.lesson.id) return;
        this._isResolvingCrisis = true;
        try {
            const resolveFunc = httpsCallable(functions, 'resolveCrisis');
            await resolveFunc({ lessonId: this.lesson.id });

            confetti({
                particleCount: 150,
                spread: 100,
                origin: { y: 0.6 },
                colors: ['#22c55e', '#ffffff'] // Green and White
            });
            showToast("Great job! Crisis averted.", false);
        } catch (error) {
            console.error("Failed to resolve crisis:", error);
            showToast("Failed to resolve crisis. Try again.", true);
        } finally {
            this._isResolvingCrisis = false;
        }
    }

    render() {
        if (this._loading) {
            return html`<div class="flex justify-center items-center h-64"><div class="spinner border-4 border-indigo-600 border-t-transparent rounded-full w-10 h-10 animate-spin"></div></div>`;
        }

        const projectData = this.lesson.projectData;
        if (!projectData) return html`<div class="p-8 text-center text-red-500">Project data missing.</div>`;

        return html`
            ${this._renderCrisisOverlay()}
            ${!this._progress?.selectedRole
                ? this._renderRoleSelection(projectData.roles)
                : this._renderDashboard(projectData)}
        `;
    }

    _renderCrisisOverlay() {
        if (!this._activeCrisis) return nothing;
        const { title, description, consequence, recovery_task } = this._activeCrisis;

        return html`
            <div class="fixed inset-0 z-[100] flex items-center justify-center bg-red-900/90 backdrop-blur-sm animate-fade-in p-4">
                <div class="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border-4 border-red-600 relative">
                    <!-- Header -->
                    <div class="bg-red-600 p-6 flex items-center justify-between text-white">
                        <div class="flex items-center gap-3">
                            <span class="text-4xl">🚨</span>
                            <div>
                                <h2 class="text-3xl font-black uppercase tracking-wider">${this.t('crisis.alert_title')}</h2>
                                <p class="text-red-100 font-bold opacity-80">${this.t('crisis.critical_detected')}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Content -->
                    <div class="p-8 space-y-6">
                        <div>
                            <h3 class="text-2xl font-bold text-slate-800 mb-2">${title}</h3>
                            <p class="text-slate-600 text-lg leading-relaxed">${description}</p>
                        </div>

                        <div class="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl">
                            <h4 class="font-bold text-red-700 uppercase text-sm mb-1">${this.t('crisis.potential_consequence')}</h4>
                            <p class="text-red-600 font-medium">${consequence}</p>
                        </div>

                        <div class="bg-slate-100 p-6 rounded-2xl border-2 border-slate-200">
                            <h4 class="font-bold text-slate-500 uppercase text-xs mb-3">${this.t('crisis.recovery_protocol')}</h4>
                            <div class="flex items-start gap-3">
                                <span class="text-2xl">🛠️</span>
                                <p class="text-slate-800 font-bold text-lg">${recovery_task}</p>
                            </div>
                        </div>

                        <button @click="${this._handleResolveCrisis}" ?disabled="${this._isResolvingCrisis}"
                            class="w-full py-4 bg-gradient-to-r from-red-600 to-orange-600 text-white font-black text-xl rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all flex justify-center items-center gap-2">
                             ${this._isResolvingCrisis ? html`<div class="spinner w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>` : '✅'}
                            ${this.t('crisis.execute_recovery')}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    _renderRoleSelection(roles) {
        return html`
            <div class="max-w-5xl mx-auto py-10 px-4">
                <div class="text-center mb-10">
                    <h1 class="text-3xl font-extrabold text-slate-800 mb-2">${this.t('roles.selection_title')}</h1>
                    <p class="text-slate-500">${this.t('roles.selection_desc')}</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${roles.map(role => html`
                        <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col h-full group cursor-pointer"
                            @click="${() => this._selectRole(role.id)}">
                            <div class="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                🎭
                            </div>
                            <h3 class="text-xl font-bold text-slate-800 mb-2">${role.title}</h3>
                            <p class="text-slate-500 text-sm mb-4 flex-grow">${role.description}</p>

                            <div class="space-y-2 mb-6">
                                ${role.skills ? role.skills.map(skill => html`
                                    <div class="inline-block px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-semibold mr-1">
                                        ${skill}
                                    </div>
                                `) : ''}
                            </div>

                            <button class="w-full py-2 bg-slate-50 text-slate-700 font-bold rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                ${this.t('roles.select_btn')}
                            </button>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }

    _renderDashboard(projectData) {
        const roleId = this._progress.selectedRole;
        const role = projectData.roles.find(r => r.id === roleId);
        const milestones = projectData.milestones || [];
        const roleTasks = projectData.role_tasks || {};
        const completedTasks = this._progress.completedTasks || [];

        return html`
            <div class="max-w-6xl mx-auto py-8 px-4 space-y-8">
                <!-- Header -->
                <div class="flex justify-between items-center bg-indigo-600 rounded-3xl p-8 text-white shadow-lg relative overflow-hidden">
                    <div class="relative z-10">
                        <div class="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-bold mb-3">
                            <span>🎭</span> ${role?.title || 'Team Member'}
                        </div>
                        <h1 class="text-3xl font-extrabold mb-2">${this.lesson.title}</h1>
                        <p class="text-indigo-100 max-w-2xl text-sm opacity-90">${this.lesson.description || 'Welcome to your project dashboard.'}</p>
                    </div>

                    <button @click="${this._handleChangeRole}" class="relative z-10 p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors" title="Change Role">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                    </button>

                    <!-- Decor -->
                    <div class="absolute right-0 top-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                </div>

                <!-- Timeline & Tasks -->
                <div class="space-y-8">
                    ${milestones.map((milestone, idx) => {
                        const tasks = roleTasks[milestone.id]?.[roleId] || [];
                        const isCurrent = idx === 0; // Simplified "current" logic for MVP

                        return html`
                            <div class="flex gap-4 md:gap-8 group">
                                <!-- Timeline Line -->
                                <div class="flex flex-col items-center">
                                    <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm z-10
                                        ${isCurrent ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-slate-200 text-slate-500'}">
                                        ${idx + 1}
                                    </div>
                                    ${idx < milestones.length - 1 ? html`<div class="w-0.5 flex-grow bg-slate-200 my-2"></div>` : ''}
                                </div>

                                <!-- Content -->
                                <div class="flex-1 pb-8">
                                    <div class="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm transition-all hover:shadow-md">
                                        <div class="flex justify-between items-start mb-4">
                                            <div>
                                                <h3 class="text-xl font-bold text-slate-800">${milestone.title}</h3>
                                                <p class="text-slate-500 text-sm">${milestone.description}</p>
                                            </div>
                                            ${isCurrent ? html`<span class="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-md">Active Phase</span>` : ''}
                                        </div>

                                        <div class="space-y-3">
                                            ${tasks.length > 0 ? tasks.map((task, tIdx) => {
                                                const taskId = `${milestone.id}_${roleId}_${tIdx}`; // Stable ID generation
                                                const isDone = completedTasks.includes(taskId);

                                                return html`
                                                    <label class="flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer
                                                        ${isDone ? 'bg-slate-50 border-slate-100 opacity-75' : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'}">
                                                        <div class="relative flex items-center mt-0.5">
                                                            <input type="checkbox" .checked="${isDone}" @change="${() => this._toggleTask(taskId)}"
                                                                class="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 transition-all">
                                                        </div>
                                                        <span class="text-sm font-medium ${isDone ? 'text-slate-400 line-through' : 'text-slate-700'}">
                                                            ${task}
                                                        </span>
                                                    </label>
                                                `;
                                            }) : html`<div class="text-slate-400 text-sm italic">No specific tasks for this phase.</div>`}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    })}
                </div>
            </div>
        `;
    }
}
customElements.define('student-project-view', StudentProjectView);

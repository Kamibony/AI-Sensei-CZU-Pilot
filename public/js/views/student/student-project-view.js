import { LitElement, html, css, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, onSnapshot, setDoc, updateDoc, arrayUnion, arrayRemove, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, auth } from '../../firebase-init.js';
import confetti from 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/+esm';

export class StudentProjectView extends LitElement {
    static properties = {
        lesson: { type: Object },
        _progress: { state: true },
        _loading: { state: true }
    };

    constructor() {
        super();
        this.lesson = null;
        this._progress = null; // { selectedRole: string, completedTasks: [] }
        this._loading = true;
        this._unsubscribe = null;
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        if (this.lesson && this.lesson.id) {
            this._initProgressTracking();
        }
    }

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson') && this.lesson && this.lesson.id) {
            if (!this._unsubscribe) {
                this._initProgressTracking();
            }
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubscribe) this._unsubscribe();
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

    render() {
        if (this._loading) {
            return html`<div class="flex justify-center items-center h-64"><div class="spinner border-4 border-indigo-600 border-t-transparent rounded-full w-10 h-10 animate-spin"></div></div>`;
        }

        const projectData = this.lesson.projectData;
        if (!projectData) return html`<div class="p-8 text-center text-red-500">Project data missing.</div>`;

        if (!this._progress?.selectedRole) {
            return this._renderRoleSelection(projectData.roles);
        }

        return this._renderDashboard(projectData);
    }

    _renderRoleSelection(roles) {
        return html`
            <div class="max-w-5xl mx-auto py-10 px-4">
                <div class="text-center mb-10">
                    <h1 class="text-3xl font-extrabold text-slate-800 mb-2">Choose Your Role</h1>
                    <p class="text-slate-500">Select a role to contribute to the project team.</p>
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
                                Select Role
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

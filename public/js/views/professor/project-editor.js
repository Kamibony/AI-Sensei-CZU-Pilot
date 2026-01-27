import { LitElement, html, css, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { collection, doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { functions, db, auth } from '../../firebase-init.js';
import { translationService } from '../../utils/translation-service.js';
import { showToast } from '../../utils/utils.js';

export class ProjectEditor extends LitElement {
    static properties = {
        lesson: { type: Object },
        _topic: { state: true },
        _duration: { state: true },
        _complexity: { state: true },
        _isGenerating: { state: true },
        _projectData: { state: true },
        _isSaving: { state: true }
    };

    constructor() {
        super();
        this.lesson = null; // Can be passed if editing existing project
        this._topic = '';
        this._duration = '4 weeks';
        this._complexity = 'Intermediate';
        this._isGenerating = false;
        this._projectData = null; // { roles: [], milestones: [], role_tasks: {} }
        this._isSaving = false;
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        if (this.lesson) {
            this._topic = this.lesson.topic || this.lesson.title || '';
            this._projectData = this.lesson.projectData || null;
            if (this.lesson.projectParams) {
                this._duration = this.lesson.projectParams.duration || '4 weeks';
                this._complexity = this.lesson.projectParams.complexity || 'Intermediate';
            }
        }
    }

    async _handleGenerate() {
        if (!this._topic) {
            showToast("Please enter a project topic/goal.", true);
            return;
        }

        this._isGenerating = true;
        try {
            const generateFunc = httpsCallable(functions, 'generateProjectScaffolding');
            const result = await generateFunc({
                topic: this._topic,
                duration: this._duration,
                complexity: this._complexity
            });

            this._projectData = result.data;
            showToast("Project scaffolding generated!");
        } catch (error) {
            console.error("Generation failed:", error);
            showToast("Failed to generate project. Please try again.", true);
        } finally {
            this._isGenerating = false;
        }
    }

    async _handleSave() {
        if (!this._projectData) return;
        if (!this._topic) {
            showToast("Please enter a title.", true);
            return;
        }

        this._isSaving = true;
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("User not authenticated");

            const lessonData = {
                title: this._topic, // Use topic as title by default
                topic: this._topic,
                type: 'project', // Explicit type
                contentType: 'project', // For compatibility
                projectData: this._projectData,
                projectParams: {
                    duration: this._duration,
                    complexity: this._complexity
                },
                ownerId: user.uid,
                updatedAt: new Date().toISOString(),
                language: translationService.currentLanguage || 'cs'
            };

            if (this.lesson && this.lesson.id) {
                await updateDoc(doc(db, 'lessons', this.lesson.id), lessonData);
                showToast("Project saved.");
            } else {
                lessonData.createdAt = new Date().toISOString();
                lessonData.status = 'draft';
                const docRef = doc(collection(db, 'lessons'));
                await setDoc(docRef, lessonData);
                this.lesson = { id: docRef.id, ...lessonData }; // Update local state
                showToast("New project created.");
            }

            // Navigate back or refresh? For now stay here.
        } catch (error) {
            console.error("Save failed:", error);
            showToast("Failed to save project.", true);
        } finally {
            this._isSaving = false;
        }
    }

    _handleBack() {
        this.dispatchEvent(new CustomEvent('navigate', {
            detail: { view: 'library' },
            bubbles: true,
            composed: true
        }));
    }

    _updateRole(index, field, value) {
        if (!this._projectData) return;
        const newRoles = [...this._projectData.roles];
        if (field === 'skills') {
            newRoles[index][field] = value.split(',').map(s => s.trim());
        } else {
            newRoles[index][field] = value;
        }
        this._projectData = { ...this._projectData, roles: newRoles };
    }

    _updateMilestone(index, field, value) {
        if (!this._projectData) return;
        const newMilestones = [...this._projectData.milestones];
        newMilestones[index][field] = value;
        this._projectData = { ...this._projectData, milestones: newMilestones };
    }

    render() {
        return html`
            <div class="h-full flex flex-col bg-slate-50 relative overflow-hidden">
                <!-- Header -->
                <div class="px-8 py-6 flex justify-between items-center border-b border-slate-200 bg-white z-10">
                    <div class="flex items-center gap-4">
                        <button @click="${this._handleBack}" class="p-2 -ml-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-full transition-colors">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                        </button>
                        <div>
                            <h1 class="text-2xl font-bold text-slate-800">New Project Scaffolding</h1>
                            <p class="text-slate-500 text-sm">Design Project-Based Learning Experience</p>
                        </div>
                    </div>
                    ${this._projectData ? html`
                        <button @click="${this._handleSave}" ?disabled="${this._isSaving}" class="px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50">
                            ${this._isSaving ? html`<div class="spinner w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>` : '💾'}
                            Save Project
                        </button>
                    ` : nothing}
                </div>

                <!-- Main Content -->
                <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">

                    ${!this._projectData ? this._renderInputForm() : this._renderCanvas()}

                </div>
            </div>
        `;
    }

    _renderInputForm() {
        return html`
            <div class="max-w-2xl mx-auto mt-10">
                <div class="bg-white/80 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl p-8 space-y-6 relative overflow-hidden">
                     <!-- Glassmorphism decorative elements -->
                    <div class="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
                    <div class="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

                    <div class="relative z-10 space-y-6">
                        <h2 class="text-2xl font-bold text-slate-800">Project Parameters</h2>

                        <div>
                            <label class="block text-sm font-bold text-slate-700 mb-2">Project Topic / Goal</label>
                            <input type="text" .value="${this._topic}" @input="${e => this._topic = e.target.value}"
                                class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all text-lg"
                                placeholder="e.g., Sustainable City Design">
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-bold text-slate-700 mb-2">Duration</label>
                                <select .value="${this._duration}" @change="${e => this._duration = e.target.value}"
                                    class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all">
                                    <option value="1 week">1 Week</option>
                                    <option value="2 weeks">2 Weeks</option>
                                    <option value="4 weeks">4 Weeks</option>
                                    <option value="8 weeks">8 Weeks</option>
                                    <option value="1 semester">1 Semester</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-bold text-slate-700 mb-2">Complexity</label>
                                <select .value="${this._complexity}" @change="${e => this._complexity = e.target.value}"
                                    class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all">
                                    <option value="Beginner">Beginner</option>
                                    <option value="Intermediate">Intermediate</option>
                                    <option value="Advanced">Advanced</option>
                                </select>
                            </div>
                        </div>

                        <button @click="${this._handleGenerate}" ?disabled="${this._isGenerating}"
                            class="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex justify-center items-center gap-2">
                            ${this._isGenerating ? html`
                                <div class="spinner w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Generating Scaffolding...
                            ` : html`
                                <span>✨</span> Generate Project Structure
                            `}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    _renderCanvas() {
        return html`
            <div class="space-y-8 animate-fade-in-up">

                <!-- Roles Section -->
                <div>
                    <h3 class="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <span class="p-2 bg-indigo-100 text-indigo-700 rounded-lg">🎭</span> Student Roles
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        ${this._projectData.roles.map((role, idx) => html`
                            <div class="bg-white/60 backdrop-blur-md border border-white/50 shadow-sm rounded-2xl p-5 hover:shadow-md transition-all">
                                <input type="text" .value="${role.title}" @change="${e => this._updateRole(idx, 'title', e.target.value)}"
                                    class="w-full bg-transparent font-bold text-lg text-slate-800 border-b border-transparent focus:border-indigo-500 focus:outline-none mb-2" />

                                <textarea .value="${role.description}" @change="${e => this._updateRole(idx, 'description', e.target.value)}"
                                    class="w-full bg-transparent text-sm text-slate-600 resize-none border-none focus:ring-0 p-0 h-20 mb-3"
                                    placeholder="Role description..."></textarea>

                                <div class="text-xs text-slate-500">
                                    <strong>Skills:</strong>
                                    <input type="text" .value="${role.skills ? role.skills.join(', ') : ''}" @change="${e => this._updateRole(idx, 'skills', e.target.value)}"
                                        class="w-full bg-transparent border-b border-slate-200 focus:border-indigo-500 focus:outline-none mt-1" />
                                </div>
                            </div>
                        `)}
                    </div>
                </div>

                <!-- Timeline Section -->
                <div>
                    <h3 class="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <span class="p-2 bg-emerald-100 text-emerald-700 rounded-lg">📅</span> Project Timeline
                    </h3>
                    <div class="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                        ${this._projectData.milestones.map((milestone, idx) => html`
                            <div class="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">

                                <div class="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-300 group-[.is-active]:bg-emerald-500 text-slate-500 group-[.is-active]:text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                                    <span class="font-bold text-xs">${idx + 1}</span>
                                </div>

                                <div class="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-white/50 shadow-sm hover:shadow-lg transition-all">
                                    <div class="flex items-center justify-between mb-2">
                                        <input type="text" .value="${milestone.title}" @change="${e => this._updateMilestone(idx, 'title', e.target.value)}"
                                            class="font-bold text-lg text-slate-800 bg-transparent border-none focus:ring-0 p-0 w-full" />
                                    </div>
                                    <p class="text-slate-500 text-sm mb-4">${milestone.description}</p>

                                    <div class="border-t border-slate-100 pt-3">
                                        <h4 class="text-xs font-bold uppercase text-slate-400 mb-2">Tasks per Role</h4>
                                        <div class="space-y-2">
                                            ${this._projectData.roles.map(role => {
                                                const tasks = this._projectData.role_tasks[milestone.id]?.[role.id] || [];
                                                return html`
                                                    <div class="text-sm">
                                                        <span class="font-semibold text-indigo-600">${role.title}:</span>
                                                        <span class="text-slate-600 ml-1">${tasks.join(', ')}</span>
                                                    </div>
                                                `;
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `)}
                    </div>
                </div>

            </div>
        `;
    }
}
customElements.define('project-editor', ProjectEditor);

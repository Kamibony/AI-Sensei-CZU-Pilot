import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';
import { translationService } from '../../utils/translation-service.js';

export class ProfessorDashboardView extends LitElement {
    static properties = {
        _classes: { state: true, type: Array },
        _students: { state: true, type: Array },
        _lessons: { state: true, type: Array },
        _isLoading: { state: true, type: Boolean },
    };

    constructor() {
        super();
        this._classes = [];
        this._students = [];
        this._lessons = [];
        this._isLoading = true;
        this.unsubscribes = [];
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._fetchDashboardData();
        // Subscribe to language changes
        this._langUnsubscribe = translationService.subscribe(() => this.requestUpdate());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.unsubscribes.forEach(unsub => unsub());
        if (this._langUnsubscribe) {
            this._langUnsubscribe();
        }
    }

    _fetchDashboardData() {
        // Wrap in onAuthStateChanged to ensure we have a user
        const authUnsub = firebaseInit.auth.onAuthStateChanged(user => {
            if (!user) {
                // Not logged in or logged out
                this._isLoading = false;
                return;
            }

            this._isLoading = true;

            // Clear old listeners if any
            this.unsubscribes.forEach(unsub => unsub());
            this.unsubscribes = [];

            // Keep track of this listener to unsubscribe it too if needed,
            // though typically onAuthStateChanged persists.
            // But for this component, we just want to trigger the data fetch logic once we have a user.
            // Actually, we should probably keep this listener active if the user changes?
            // For now, let's just proceed with data fetching.

            // Fetch Classes
            const classesQuery = query(collection(firebaseInit.db, 'groups'), where("ownerId", "==", user.uid));
            const classesUnsubscribe = onSnapshot(classesQuery, (snapshot) => {
                this._classes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }, err => console.error("Error fetching classes:", err));
            this.unsubscribes.push(classesUnsubscribe);

            // Fetch Students of this Professor
            const studentsQuery = query(collection(firebaseInit.db, 'students'), where("ownerId", "==", user.uid));
            const studentsUnsubscribe = onSnapshot(studentsQuery, (snapshot) => {
                this._students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }, err => console.error("Error fetching students:", err));
            this.unsubscribes.push(studentsUnsubscribe);

            // Fetch Lessons of this Professor
            const lessonsQuery = query(collection(firebaseInit.db, 'lessons'), where("ownerId", "==", user.uid));
            const lessonsUnsubscribe = onSnapshot(lessonsQuery, (snapshot) => {
                this._lessons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this._isLoading = false;
            }, err => {
                console.error("Error fetching lessons:", err);
                this._isLoading = false;
            });
            this.unsubscribes.push(lessonsUnsubscribe);
        });

        // Add auth listener to unsubscribes so it gets cleaned up on disconnect
        this.unsubscribes.push(authUnsub);
    }

    get _stats() {
        const totalStudents = new Set(this._classes.flatMap(c => c.studentIds || [])).size;
        const activeLessons = this._lessons.filter(l => l.assignedToGroups && l.assignedToGroups.length > 0).length;
        const totalLessons = this._lessons.length;
        const totalClasses = this._classes.length;
        return { totalStudents, activeLessons, totalClasses, totalLessons };
    }

    _navigateToClassDetail(groupId) {
        this.dispatchEvent(new CustomEvent('navigate', {
            detail: { view: 'class-detail', groupId },
            bubbles: true,
            composed: true
        }));
    }

    _generateJoinCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    async _handleCreateClass() {
        // NOTE: Prompt strings are not yet in translation service as they are browser native.
        // Ideally we would replace prompt() with a custom modal.
        // For now, we leave them or try to translate if possible, but t() is synchronous.
        const className = prompt(translationService.t('dashboard.enter_class_name'), translationService.t('dashboard.class_name_placeholder'));
        if (className && className.trim() !== "") {
            const user = firebaseInit.auth.currentUser;
            if (!user) return;
            try {
                await addDoc(collection(firebaseInit.db, 'groups'), {
                    name: className.trim(),
                    ownerId: user.uid,
                    joinCode: this._generateJoinCode(),
                    createdAt: serverTimestamp(),
                    studentIds: []
                });
                showToast(translationService.t('common.saved'));
            } catch (error) {
                console.error("Error creating class:", error);
                showToast(translationService.t('professor.error_create_class'), true);
            }
        }
    }

    _copyJoinCode(e, joinCode) {
        e.stopPropagation();
        if (!joinCode) {
             showToast(translationService.t('common.no_code'), true);
             return;
        }
        navigator.clipboard.writeText(joinCode).then(() => {
            showToast(translationService.t('common.code_copied'));
        }, () => {
            showToast(translationService.t('common.copy_failed'), true);
        });
    }

    render() {
        const t = (key) => translationService.t(key);
        if (this._isLoading) {
            return html`<div class="flex justify-center items-center h-full"><p class="text-xl text-slate-400 animate-pulse">${t('common.loading')}</p></div>`;
        }

        const userName = firebaseInit.auth.currentUser?.displayName || 'Profesore';
        const t = (key) => translationService.t(key);

        return html`
            <div class="h-full bg-slate-50 overflow-y-auto font-['Plus_Jakarta_Sans'] p-4 lg:p-8">

                <!-- Header Section -->
                <div class="max-w-[1600px] mx-auto mb-10 flex flex-col md:flex-row md:items-end justify-between">
                     <div>
                        <h1 class="text-3xl font-bold text-slate-900 tracking-tight mb-1">${t('dashboard.greeting')}, ${userName}</h1>
                        <p class="text-slate-500">${t('dashboard.subtitle')}</p>
                    </div>
                     <div class="mt-4 md:mt-0">
                        <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                            <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2"></span>
                            ${t('professor.system_online')}
                        </span>
                    </div>
                </div>

                <div class="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">

                    <!-- LEFT COLUMN: Management Stats (70%) -->
                    <div class="lg:col-span-8 space-y-8">

                        <!-- Section: Management Stats (Bento Grid) -->
                        <div>
                            <h2 class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4 pl-1">${t('dashboard.management_overview')}</h2>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                ${this._renderStatCard(t('professor.stats_students'), this._stats.totalStudents, "users", "students")}
                                ${this._renderStatCard(t('professor.stats_classes'), this._stats.totalClasses, "briefcase", "classes")}
                                ${this._renderStatCard(t('professor.stats_lessons'), this._stats.totalLessons, "book", "timeline")}
                            </div>
                        </div>

                    </div>

                    <!-- RIGHT COLUMN: Lesson Workflow (30%) -->
                    <div class="lg:col-span-4 space-y-6">

                        <h2 class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">${t('dashboard.creative_studio')}</h2>

                        <div @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'editor', lesson: null }, bubbles: true, composed: true }))}
                             class="group relative overflow-hidden bg-white rounded-3xl shadow-xl shadow-indigo-200/50 cursor-pointer transition-all duration-300 hover:shadow-indigo-300/60 hover:-translate-y-1 min-h-[300px] flex flex-col p-0 border border-indigo-100">

                            <!-- Header -->
                            <div class="p-6 pb-2 relative z-10">
                                <h3 class="text-xl font-bold text-slate-900 tracking-tight flex items-center">
                                    <span class="text-2xl mr-2">✨</span> ${t('professor.new_lesson_card')}
                                </h3>
                                <p class="text-slate-500 text-sm mt-1">Automatizovaná tvorba</p>
                            </div>

                            <!-- Workflow Visualization -->
                            <div class="flex-grow flex flex-col justify-center px-6 relative z-10 space-y-3">
                                <!-- Step 1 -->
                                <div class="flex items-center p-3 bg-slate-50 rounded-xl border border-slate-100 transition-colors group-hover:bg-indigo-50 group-hover:border-indigo-100">
                                    <div class="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-xl shadow-sm">📄</div>
                                    <div class="ml-3">
                                        <div class="text-xs font-bold text-slate-500 uppercase tracking-wide">${t('professor.workflow_input')}</div>
                                        <div class="font-bold text-slate-800">${t('professor.workflow_docs')}</div>
                                    </div>
                                </div>

                                <!-- Arrow -->
                                <div class="flex justify-center -my-1">
                                    <svg class="w-5 h-5 text-slate-300 group-hover:text-indigo-400 transition-colors animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
                                </div>

                                <!-- Step 2 -->
                                <div class="flex items-center p-3 bg-slate-50 rounded-xl border border-slate-100 transition-colors group-hover:bg-indigo-50 group-hover:border-indigo-100">
                                    <div class="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-xl shadow-sm">⚡</div>
                                    <div class="ml-3">
                                        <div class="text-xs font-bold text-slate-500 uppercase tracking-wide">${t('professor.workflow_process')}</div>
                                        <div class="font-bold text-slate-800">${t('professor.workflow_ai')}</div>
                                    </div>
                                </div>

                                <!-- Arrow -->
                                <div class="flex justify-center -my-1">
                                    <svg class="w-5 h-5 text-slate-300 group-hover:text-indigo-400 transition-colors animate-pulse" style="animation-delay: 0.1s" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
                                </div>

                                <!-- Step 3 -->
                                <div class="flex items-center p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-100">
                                    <div class="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-xl shadow-sm text-emerald-600">🎓</div>
                                    <div class="ml-3">
                                        <div class="text-xs font-bold text-emerald-600 uppercase tracking-wide">${t('professor.workflow_result')}</div>
                                        <div class="font-bold text-emerald-900">${t('professor.workflow_final')}</div>
                                    </div>
                                </div>
                            </div>

                            <!-- CTA Footer -->
                            <div class="p-6 pt-4 bg-slate-50 border-t border-slate-100 relative z-10 group-hover:bg-indigo-50/50 transition-colors">
                                <div class="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-center shadow-lg shadow-indigo-500/30 group-hover:shadow-indigo-500/50 transition-all group-hover:scale-[1.02]">
                                    ${t('lesson.magic_btn')}
                                </div>
                            </div>

                        </div>

                    </div>
                </div>
            </div>
        `;
    }

    // Bento Grid Stat Card
    _renderStatCard(title, value, iconName, targetView) {
        const icons = {
            "users": "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
            "briefcase": "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
            "activity": "M13 10V3L4 14h7v7l9-11h-7z",
            "book": "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        };
        const d = icons[iconName] || icons["users"];
        const displayValue = (value !== undefined && value !== null) ? value : 0;

        return html`
            <div @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: targetView }, bubbles: true, composed: true }))}
                 class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm shadow-slate-200/50 flex flex-col justify-between h-32 hover:shadow-md cursor-pointer hover:scale-105 transition-transform relative group">
                <div class="flex justify-between items-start">
                    <div class="text-slate-400">
                         <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${d}"></path></svg>
                    </div>
                    <div class="text-slate-300 group-hover:text-indigo-500 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                    </div>
                </div>
                <div>
                    <p class="text-2xl font-bold text-slate-800">${displayValue}</p>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">${title}</p>
                </div>
            </div>
        `;
    }

    // Clean List Row for Classes
    _renderClassRow(cls) {
        const t = (key) => translationService.t(key);
        const studentCount = cls.studentIds ? cls.studentIds.length : 0;
        const name = cls.name || t('common.nameless_class');
        const joinCode = cls.joinCode || '---';

        return html`
            <div @click=${() => this._navigateToClassDetail(cls.id)} class="group flex items-center justify-between p-5 hover:bg-slate-50 cursor-pointer transition-colors">
                <div class="flex items-center space-x-4">
                    <div class="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-lg group-hover:bg-white group-hover:shadow-sm transition-all">
                        ${name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 class="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">${name}</h3>
                        <div class="flex items-center mt-1 space-x-2">
                            <span class="text-xs text-slate-500 flex items-center">
                                <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                                ${studentCount} ${t('common.students_count')}
                            </span>
                             <span class="text-xs text-slate-300">|</span>
                             <span class="text-xs text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                                ${joinCode}
                             </span>
                        </div>
                    </div>
                </div>

                <div class="flex items-center">
                    <button @click=${(e) => this._copyJoinCode(e, joinCode)} class="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-all opacity-0 group-hover:opacity-100 mr-2" title="Zkopírovat kód">
                         <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    </button>
                    <div class="text-slate-300 group-hover:translate-x-1 transition-transform">
                         <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </div>
                </div>
            </div>
        `;
    }

    _renderEmptyState() {
        const t = (key) => translationService.t(key);
        return html`
            <div class="p-12 text-center flex flex-col items-center justify-center">
                <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <svg class="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                </div>
                <h3 class="text-slate-900 font-semibold text-lg">${t('dashboard.no_classes_title')}</h3>
                <p class="text-slate-500 text-sm mt-1 max-w-xs">${t('dashboard.no_classes_desc')}</p>
                <button @click=${this._handleCreateClass} class="mt-6 text-indigo-600 font-bold text-sm hover:underline">${t('dashboard.create_first_class')}</button>
            </div>
        `;
    }
}
customElements.define('professor-dashboard-view', ProfessorDashboardView);

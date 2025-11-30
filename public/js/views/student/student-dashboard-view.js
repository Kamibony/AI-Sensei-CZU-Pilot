import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, onSnapshot, collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';
import { translationService } from '../../utils/translation-service.js';

export class StudentDashboardView extends LitElement {
    static properties = {
        _studentName: { type: String, state: true },
        _studentStreak: { type: Number, state: true },
        _recentLessons: { type: Array, state: true },
        _groups: { type: Array, state: true },
        _isLoading: { type: Boolean, state: true },
        _showJoinModal: { type: Boolean, state: true },
        _joinCodeInput: { type: String, state: true },
        _joining: { type: Boolean, state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this._studentName = '';
        this._studentStreak = 0;
        this._recentLessons = [];
        this._groups = [];
        this._isLoading = true;
        this._studentUnsubscribe = null;
        this._showJoinModal = false;
        this._joinCodeInput = '';
        this._joining = false;
    }

    connectedCallback() {
        super.connectedCallback();
        this._fetchData();
        this._langUnsubscribe = translationService.subscribe(() => this.requestUpdate());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._studentUnsubscribe) this._studentUnsubscribe();
        if (this._langUnsubscribe) this._langUnsubscribe();
    }

    async _fetchData() {
        const user = firebaseInit.auth.currentUser;
        if (!user) return;

        const userDocRef = doc(firebaseInit.db, "students", user.uid);
        this._studentUnsubscribe = onSnapshot(userDocRef, async (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                this._studentName = data.name || 'Studente';
                this._studentStreak = data.streak || 0;
                const groupIds = data.memberOfGroups || [];

                if (groupIds.length > 0) {
                    await this._fetchGroupsInfo(groupIds);
                    await this._fetchRecentLessons(groupIds);
                } else {
                    this._groups = [];
                    this._recentLessons = [];
                    this._isLoading = false;
                }
            }
        });
    }

    async _fetchGroupsInfo(groupIds) {
        const safeGroupIds = groupIds.slice(0, 10);
        if (safeGroupIds.length === 0) return;

        try {
            const q = query(collection(firebaseInit.db, "groups"), where("__name__", "in", safeGroupIds));
            const querySnapshot = await getDocs(q);
            this._groups = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching groups:", error);
            this._groups = safeGroupIds.map(id => ({ id, name: 'Třída' }));
        }
    }

    async _fetchRecentLessons(groupIds) {
        try {
             let searchGroups = groupIds;
             if (searchGroups.length > 30) searchGroups = searchGroups.slice(0, 30);

            const q = query(
                collection(firebaseInit.db, "lessons"),
                where("assignedToGroups", "array-contains-any", searchGroups),
                orderBy("createdAt", "desc"),
                limit(5)
            );

            const querySnapshot = await getDocs(q);
            this._recentLessons = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching recent lessons:", error);
            this._recentLessons = [];
        } finally {
            this._isLoading = false;
        }
    }

    _handleLessonSelected(lessonId) {
        this.dispatchEvent(new CustomEvent('lesson-selected', {
            detail: { lessonId: lessonId },
            bubbles: true,
            composed: true
        }));
    }

    async _handleJoinClass() {
        const code = this._joinCodeInput.trim();
        if (!code) {
            showToast(translationService.t('student.join_modal_desc'), true);
            return;
        }

        this._joining = true;
        try {
            const joinClassFn = httpsCallable(firebaseInit.functions, 'joinClass');
            await joinClassFn({ joinCode: code });
            showToast(translationService.t('student.join_success'));
            this._showJoinModal = false;
            this._joinCodeInput = '';
        } catch (error) {
            console.error("Error joining class:", error);
            showToast(translationService.t('student.error_join') + ": " + error.message, true);
        } finally {
            this._joining = false;
        }
    }

    render() {
        const t = (key) => translationService.t(key);
        
        if (this._isLoading) {
             return html`
                <div class="flex justify-center items-center h-full min-h-[50vh]">
                     <div class="spinner w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>`;
        }

        const firstName = this._studentName.split(' ')[0];
        const lastLesson = this._recentLessons.length > 0 ? this._recentLessons[0] : null;

        return html`
            <div class="w-full p-6 md:p-8 space-y-8">

                <header class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 class="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">${t('student.dashboard_title')}</h1>
                        <p class="text-slate-500 mt-1">Vítej zpět, ${firstName}! 👋</p>
                    </div>
                    
                    <div class="flex items-center gap-3">
                        ${this._studentStreak > 0 ? html`
                            <div class="bg-orange-50 text-orange-600 px-3 py-1.5 rounded-full font-bold text-sm shadow-sm border border-orange-100 flex items-center gap-1.5">
                                <span>🔥</span> ${this._studentStreak} Dní
                            </div>
                        ` : nothing}
                        
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold shadow-md cursor-pointer hover:opacity-90 transition-opacity"
                             @click=${() => this.dispatchEvent(new CustomEvent('back-to-list', { bubbles: true, composed: true })) /* Quick hack to reset to home if needed, or open profile */}>
                            ${firstName.charAt(0).toUpperCase()}
                        </div>
                    </div>
                </header>

                ${lastLesson ? html`
                    <section class="relative overflow-hidden rounded-3xl bg-indigo-600 text-white shadow-xl shadow-indigo-200 transition-all hover:-translate-y-1 cursor-pointer group"
                             @click=${() => this._handleLessonSelected(lastLesson.id)}>
                        
                        <div class="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl"></div>
                        <div class="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-purple-500 opacity-20 rounded-full blur-2xl"></div>

                        <div class="relative p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                            <div class="space-y-2 max-w-2xl">
                                <span class="inline-block px-3 py-1 rounded-full bg-indigo-500/50 border border-indigo-400/30 text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
                                    ▶️ ${t('student_dashboard.jump_back')}
                                </span>
                                <h2 class="text-2xl md:text-3xl font-bold leading-tight group-hover:text-indigo-100 transition-colors">
                                    ${lastLesson.title}
                                </h2>
                                <p class="text-indigo-100 text-sm md:text-base line-clamp-2 opacity-90">
                                    ${lastLesson.subtitle || 'Pokračujte tam, kde jste přestali.'}
                                </p>
                            </div>
                            
                            <div class="flex-shrink-0 bg-white text-indigo-600 rounded-full w-14 h-14 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                                <svg class="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            </div>
                        </div>
                    </section>
                ` : nothing}

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    <div class="lg:col-span-2 space-y-6">
                        <div class="flex items-center justify-between">
                            <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <span class="bg-blue-100 text-blue-600 p-1.5 rounded-lg text-sm">📚</span>
                                ${t('nav.classes')}
                            </h3>
                            <button class="text-sm font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors" @click=${() => this._showJoinModal = true}>
                                + ${t('student.join')}
                            </button>
                        </div>

                        ${this._groups.length > 0 ? html`
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                ${this._groups.map(group => html`
                                    <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer group">
                                        <div class="flex items-start justify-between mb-3">
                                            <div class="w-10 h-10 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center font-bold text-lg group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                                ${group.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div class="text-xs font-mono text-slate-300 bg-slate-50 px-2 py-1 rounded">
                                                ID: ${group.id.substring(0,4)}
                                            </div>
                                        </div>
                                        <h4 class="font-bold text-slate-800 text-lg truncate">${group.name}</h4>
                                        <p class="text-sm text-slate-400 mt-1 flex items-center gap-1">
                                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                                            ${group.ownerName || group.ownerEmail || t('common.unknown_teacher')}
                                        </p>
                                    </div>
                                `)}
                            </div>
                        ` : html`
                            <div class="text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                <p class="text-slate-400 mb-2">Zatím nejste v žádné třídě.</p>
                                <button @click=${() => this._showJoinModal = true} class="text-indigo-600 font-bold hover:underline">Připojit se k první třídě</button>
                            </div>
                        `}
                    </div>

                    <div class="space-y-6">
                        <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <span class="bg-purple-100 text-purple-600 p-1.5 rounded-lg text-sm">📅</span>
                            ${t('student.next_up')}
                        </h3>

                        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-2 space-y-1">
                            ${this._recentLessons.length > 0 ? this._recentLessons.map(lesson => html`
                                <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group"
                                     @click=${() => this._handleLessonSelected(lesson.id)}>
                                    <div class="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0 font-bold group-hover:bg-indigo-100 transition-colors">
                                        ${lesson.icon || '📖'}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <h4 class="text-sm font-bold text-slate-800 truncate group-hover:text-indigo-700 transition-colors">${lesson.title}</h4>
                                        <p class="text-xs text-slate-400 truncate">${lesson.topic || 'Nová lekce'}</p>
                                    </div>
                                    <div class="text-xs font-bold text-slate-300 group-hover:text-indigo-400 transition-colors">→</div>
                                </div>
                            `) : html`
                                <div class="text-center p-4 text-slate-400 text-sm">Žádné nové lekce.</div>
                            `}
                        </div>
                    </div>
                </div>
            </div>

            ${this._showJoinModal ? html`
                <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div class="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl relative transform scale-100 transition-all">
                        <button @click=${() => this._showJoinModal = false} class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-50 rounded-full p-2 transition-colors">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>

                        <div class="text-center mb-6 mt-2">
                            <div class="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl shadow-sm border border-indigo-100">🚀</div>
                            <h3 class="text-xl font-black text-slate-900">${t('student.join_modal_title')}</h3>
                            <p class="text-slate-500 text-sm mt-2">${t('student.join_modal_desc')}</p>
                        </div>

                        <div class="space-y-4">
                            <input type="text"
                                .value=${this._joinCodeInput}
                                @input=${e => this._joinCodeInput = e.target.value.toUpperCase()}
                                placeholder="KÓD (např. X9Y2Z1)"
                                class="w-full text-center text-2xl font-black tracking-widest border-2 border-slate-200 rounded-xl py-4 uppercase focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 outline-none text-slate-800 placeholder-slate-300 transition-all"
                            />

                            <button @click=${this._handleJoinClass} ?disabled=${this._joining}
                                class="w-full bg-indigo-600 text-white font-bold text-lg py-3.5 rounded-xl shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center">
                                ${this._joining ? html`<span class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>` : t('student.join')}
                            </button>
                        </div>
                    </div>
                </div>
            ` : nothing}
        `;
    }
}
customElements.define('student-dashboard-view', StudentDashboardView);

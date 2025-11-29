import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, onSnapshot, collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';
import { translationService } from '../../utils/translation-service.js';
import { baseStyles } from '../../shared-styles.js';

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

    static styles = [baseStyles];

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

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this._fetchData();
        this._langUnsubscribe = translationService.subscribe(() => this.requestUpdate());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._studentUnsubscribe) {
            this._studentUnsubscribe();
        }
        if (this._langUnsubscribe) {
            this._langUnsubscribe();
        }
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
            this._groups = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error("Error fetching groups:", error);
            this._groups = safeGroupIds.map(id => ({ id, name: 'Třída' }));
        }
    }

    async _fetchRecentLessons(groupIds) {
        try {
             let searchGroups = groupIds;
             if (searchGroups.length > 30) {
                searchGroups = searchGroups.slice(0, 30);
             }

            const q = query(
                collection(firebaseInit.db, "lessons"),
                where("assignedToGroups", "array-contains-any", searchGroups),
                orderBy("createdAt", "desc"),
                limit(3)
            );

            const querySnapshot = await getDocs(q);
            this._recentLessons = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
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
        if (this._isLoading) {
             return html`
                <div class="flex justify-center items-center h-full min-h-[50vh]">
                     <div class="spinner w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>`;
        }

        const firstName = this._studentName.split(' ')[0];
        const t = (key) => translationService.t(key);

        const jumpBackLesson = this._recentLessons.length > 0 ? this._recentLessons[0] : null;

        return html`
            <div class="space-y-8 pb-24 px-4 md:px-8 max-w-7xl mx-auto">

                <!-- A. Hero Section -->
                <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 pt-6">
                    <div>
                        <h1 class="text-3xl font-black text-slate-900 tracking-tight">
                        ${t('student.dashboard_title')},<br>
                        <span class="text-indigo-600">${firstName}!</span> 👋
                        </h1>
                    </div>

                    ${this._studentStreak > 0 ? html`
                        <div class="bg-white border border-orange-100 p-3 rounded-2xl shadow-sm flex items-center gap-3">
                            <div class="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-xl animate-pulse">🔥</div>
                            <div>
                                <div class="text-xs text-slate-400 font-bold uppercase tracking-wider">Tvoje tempo</div>
                                <div class="text-orange-600 font-black text-lg leading-none">${this._studentStreak} dní</div>
                            </div>
                        </div>
                    ` : nothing}
                </div>

                <!-- B. My Classes Section -->
                <div>
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-lg font-bold text-slate-800">Moje Třídy</h2>
                    </div>

                    <div class="flex overflow-x-auto snap-x pb-4 -mx-4 px-4 gap-4 md:grid md:grid-cols-3 lg:grid-cols-4 md:overflow-visible md:pb-0 md:mx-0 md:px-0">

                         <!-- Jump Back In Card (Integrated) -->
                         ${jumpBackLesson ? html`
                            <div class="min-w-[160px] h-32 md:h-auto bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-2xl flex flex-col justify-between p-4 shadow-lg shadow-indigo-200 hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer flex-shrink-0 snap-start relative overflow-hidden group"
                                 @click=${() => this._handleLessonSelected(jumpBackLesson.id)}>
                                <div class="absolute top-0 right-0 p-3 opacity-20 text-4xl group-hover:scale-110 transition-transform">▶️</div>
                                <div>
                                    <span class="text-[10px] font-bold uppercase opacity-80 tracking-wider block mb-1">${t('student_dashboard.jump_back')}</span>
                                    <h3 class="font-bold leading-tight line-clamp-2">${jumpBackLesson.title}</h3>
                                </div>
                                <div class="mt-2 text-xs font-medium opacity-90 flex items-center gap-1">
                                    Pokračovat
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                                </div>
                            </div>
                        ` : nothing}

                        <!-- Class Cards -->
                        ${this._groups.map(group => html`
                            <div class="min-w-[160px] h-32 md:h-auto bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md hover:border-indigo-200 hover:-translate-y-1 transition-all cursor-pointer flex-shrink-0 snap-start"
                                 @click=${() => showToast(`Třída: ${group.name}`)}>
                                <div class="flex justify-between items-start">
                                    <div class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold">
                                        ${group.name.substring(0, 1).toUpperCase()}
                                    </div>
                                    <!-- Optional: Indicator if new content -->
                                </div>
                                <div>
                                    <h3 class="font-bold text-slate-800 truncate">${group.name}</h3>
                                    <p class="text-xs text-slate-400 truncate mt-1">
                                        ${group.ownerName || group.ownerEmail || t('common.unknown_teacher')}
                                    </p>
                                </div>
                            </div>
                        `)}

                        <!-- Join Class Card -->
                        <div class="min-w-[160px] h-32 md:h-auto bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-2 hover:bg-slate-100 hover:border-indigo-300 transition-all cursor-pointer flex-shrink-0 snap-start group"
                             @click=${() => this._showJoinModal = true}>
                            <div class="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                                <svg class="w-5 h-5 text-slate-400 group-hover:text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                            </div>
                            <span class="text-sm font-bold text-slate-500 group-hover:text-indigo-600">${t('student.join')}</span>
                        </div>
                    </div>
                </div>

                <!-- C. Next Up Section -->
                <div>
                    <h2 class="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        ${t('student.next_up')} 📅
                    </h2>

                     ${this._recentLessons.length === 0 ? html`
                         <div class="w-full p-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-center">
                            <div class="text-4xl mb-3">🎉</div>
                            <h3 class="font-bold text-slate-700">Vše hotovo!</h3>
                            <p class="text-sm text-slate-500 mt-1">Momentálně nemáš žádné nové lekce.</p>
                         </div>
                    ` : html`
                        <div class="space-y-3">
                            ${this._recentLessons.map((lesson, index) => html`
                                <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md hover:border-indigo-100 transition-all group cursor-pointer"
                                     @click=${() => this._handleLessonSelected(lesson.id)}>

                                    <!-- Index/Icon -->
                                    <div class="w-12 h-12 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center shrink-0 font-bold text-lg group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                        ${index + 1}
                                    </div>

                                    <!-- Content -->
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2 mb-1">
                                            <h4 class="font-bold text-slate-900 truncate group-hover:text-indigo-700 transition-colors">${lesson.title}</h4>
                                            <span class="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Nový</span>
                                        </div>
                                        <p class="text-xs text-slate-500 font-medium flex items-center gap-2">
                                            <span class="truncate max-w-[150px]">${lesson.topic || 'Obecné'}</span>
                                            <span class="w-1 h-1 rounded-full bg-slate-300"></span>
                                            <span>${lesson.estimatedDuration || '15 min'}</span>
                                        </p>
                                    </div>

                                    <!-- Play Button Action -->
                                    <button class="w-10 h-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                                        <svg class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                    </button>
                                </div>
                            `)}
                        </div>
                    `}
                </div>

            </div>

            <!-- Join Modal (Zen Style) -->
            ${this._showJoinModal ? html`
                <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div class="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl relative">
                        <button @click=${() => this._showJoinModal = false} class="absolute top-5 right-5 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-2 transition-colors">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>

                        <div class="text-center mb-8 mt-2">
                            <div class="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-5 text-4xl shadow-sm border border-indigo-100">🚀</div>
                            <h3 class="text-2xl font-black text-slate-900">${t('student.join_modal_title')}</h3>
                            <p class="text-slate-500 font-medium mt-2">${t('student.join_modal_desc')}</p>
                        </div>

                        <div class="space-y-4">
                            <div>
                                <input type="text"
                                    .value=${this._joinCodeInput}
                                    @input=${e => this._joinCodeInput = e.target.value.toUpperCase()}
                                    placeholder="${t('student.join_placeholder')}"
                                    class="w-full text-center text-3xl font-black tracking-[0.2em] border-2 border-slate-200 rounded-2xl py-5 uppercase focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 outline-none text-slate-800 placeholder-slate-300 transition-all"
                                />
                            </div>

                            <button @click=${this._handleJoinClass} ?disabled=${this._joining}
                                class="w-full bg-indigo-600 text-white font-bold text-lg py-4 rounded-2xl shadow-xl shadow-indigo-500/30 hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center">
                                ${this._joining ? html`<span class="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin mr-3"></span> ${t('student.joining')}` : t('student.join')}
                            </button>
                        </div>
                    </div>
                </div>
            ` : nothing}
        `;
    }
}
customElements.define('student-dashboard-view', StudentDashboardView);

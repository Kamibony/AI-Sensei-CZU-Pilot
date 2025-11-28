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
            <div class="space-y-8 pb-24 px-4 md:px-0">

                <!-- A. Header Section -->
                <div class="flex items-center justify-between pt-4">
                    <div>
                        <h1 class="text-2xl font-black text-slate-900 tracking-tight leading-tight">
                            ${t('student.dashboard_title')},<br>
                            ${firstName}! 👋
                        </h1>
                    </div>
                    ${this._studentStreak > 0 ? html`
                        <div class="flex items-center gap-1.5 bg-orange-100 text-orange-600 px-3 py-1.5 rounded-full font-bold text-sm shadow-sm">
                            <span>🔥</span>
                            <span>${this._studentStreak} ${t('student.streak')}</span>
                        </div>
                    ` : nothing}
                </div>

                <!-- B. "My Classes" as Rectangular Cards -->
                <div>
                    <div class="flex overflow-x-auto gap-4 pb-4 -mx-4 px-4 no-scrollbar snap-x">
                        ${this._groups.map(group => html`
                            <div class="min-w-[140px] h-24 bg-white border border-slate-200 rounded-xl flex flex-col justify-center items-center shadow-sm hover:border-indigo-400 transition-all cursor-pointer flex-shrink-0 snap-start" @click=${() => showToast(`Třída: ${group.name}`)}>
                                <div class="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center mb-2">
                                     <span class="text-sm font-bold text-indigo-600">${group.name.substring(0, 2).toUpperCase()}</span>
                                </div>
                                <span class="text-sm font-bold text-slate-700 truncate max-w-[120px]">${group.name}</span>
                            </div>
                        `)}

                        <!-- Add/Join Class Action -->
                        <div class="min-w-[140px] h-24 bg-white border border-slate-200 border-dashed rounded-xl flex flex-col justify-center items-center shadow-sm hover:border-indigo-400 hover:bg-slate-50 transition-all cursor-pointer flex-shrink-0 snap-start" @click=${() => this._showJoinModal = true}>
                            <div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                                <span class="text-xl font-bold text-slate-400">+</span>
                            </div>
                            <span class="text-xs font-bold text-slate-400">${t('student.join')}</span>
                        </div>
                    </div>
                </div>

                <!-- C. "Jump Back In" (Hero) -->
                <div>
                     ${jumpBackLesson ? html`
                        <div class="w-full p-6 bg-white border-l-4 border-indigo-600 rounded-xl shadow-md flex justify-between items-center cursor-pointer hover:shadow-lg transition-all group"
                             @click=${() => this._handleLessonSelected(jumpBackLesson.id)}>
                            <div>
                                <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">${t('student_dashboard.jump_back')}</p>
                                <h2 class="text-lg md:text-xl font-bold text-slate-900 line-clamp-1 group-hover:text-indigo-600 transition-colors">
                                    ${jumpBackLesson.title}
                                </h2>
                            </div>
                            <button class="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-full shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-2">
                                <span>▶️</span>
                                <span class="hidden sm:inline">Pokračovat</span>
                            </button>
                        </div>
                    ` : html`
                         <!-- Empty State -->
                        <div class="w-full p-8 bg-white border border-slate-200 rounded-xl shadow-sm text-center">
                            <div class="text-4xl mb-3">🎉</div>
                            <h3 class="text-lg font-bold text-slate-900">Vše hotovo!</h3>
                            <p class="text-sm text-slate-500 max-w-[200px] mx-auto mt-1">${t('student.empty_classes')}</p>
                        </div>
                    `}
                </div>

                <!-- D. "Next Up" (Real Data) -->
                <div>
                    <h2 class="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                        ${t('student.next_up')} 📅
                    </h2>

                    ${this._recentLessons.length === 0 ? html`
                         <div class="w-full p-6 bg-slate-50 rounded-xl border border-slate-200 border-dashed text-center">
                            <h3 class="font-bold text-slate-700">Vše hotovo! 🎉</h3>
                            <p class="text-sm text-slate-500 mt-1">Užij si volno.</p>
                         </div>
                    ` : html`
                        <div class="space-y-3">
                            ${this._recentLessons.map((lesson, index) => html`
                                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-indigo-300 transition-all cursor-pointer"
                                     @click=${() => this._handleLessonSelected(lesson.id)}>
                                    <div class="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 font-bold text-lg">
                                        ${index + 1}
                                    </div>
                                    <div class="flex-1">
                                        <h4 class="font-bold text-slate-900 line-clamp-1">${lesson.title}</h4>
                                        <p class="text-xs text-slate-500 font-medium">${lesson.topic || 'Obecné'}</p>
                                    </div>
                                    <div class="text-right">
                                        <span class="block text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">Nový</span>
                                    </div>
                                </div>
                            `)}
                        </div>
                    `}
                </div>
            </div>

            <!-- Join Modal -->
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

import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, onSnapshot, collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';
import { translationService } from '../../utils/translation-service.js';
import { baseStyles } from '../../shared-styles.js';
import { handleLogout } from '../../auth.js'; // Need to import logout

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

        const t = (key) => translationService.t(key);

        return html`
            <div class="space-y-8 pb-24 px-4 md:px-0 max-w-7xl mx-auto">

                <!-- Header Section -->
                <div class="flex items-center justify-between pt-4">
                    <div>
                        <h1 class="text-2xl font-black text-slate-900 tracking-tight">
                            ${this._studentName}
                        </h1>
                    </div>

                    <div class="flex items-center gap-4">
                        ${this._studentStreak > 0 ? html`
                            <div class="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2 border border-indigo-100 shadow-sm">
                                <span>🔥</span>
                                <span>${this._studentStreak} dní</span>
                            </div>
                        ` : nothing}

                        <button @click=${handleLogout} class="bg-slate-100 text-slate-600 px-4 py-2 rounded-full text-sm font-bold hover:bg-slate-200 transition-colors shadow-sm">
                            Odhlásit
                        </button>
                    </div>
                </div>

                <!-- Moje Třídy (My Classes) -->
                <div>
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-lg font-bold text-slate-800">Moje Třídy</h2>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        <!-- Add Class Button -->
                        <div class="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-3 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group h-40"
                             @click=${() => this._showJoinModal = true}>
                            <div class="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                                <span class="text-2xl text-slate-400 group-hover:text-indigo-600">+</span>
                            </div>
                            <span class="text-sm font-bold text-slate-500 group-hover:text-indigo-600">Připojit se kód</span>
                        </div>

                        <!-- Class Cards -->
                        ${this._groups.map(group => html`
                            <div class="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer h-40">
                                <div class="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xl mb-4">
                                    ${(group?.name || 'T').substring(0, 1).toUpperCase()}
                                </div>
                                <div>
                                    <h3 class="font-bold text-slate-800 truncate text-lg">${group?.name || 'Bez názvu'}</h3>
                                    <p class="text-xs text-slate-400 truncate mt-1">
                                        ${group?.ownerName || 'Neznámý učitel'}
                                    </p>
                                </div>
                            </div>
                        `)}
                    </div>
                </div>

                <!-- Moje Lekce (Next Up) -->
                <div>
                    <h2 class="text-lg font-bold text-slate-800 mb-4">Moje Lekce</h2>

                     ${this._recentLessons.length === 0 ? html`
                         <div class="w-full p-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-center">
                            <div class="text-4xl mb-3">🎉</div>
                            <h3 class="font-bold text-slate-700">Vše hotovo!</h3>
                            <p class="text-sm text-slate-500 mt-1">Momentálně nemáš žádné nové lekce.</p>
                         </div>
                    ` : html`
                        <div class="flex flex-col gap-3">
                            ${this._recentLessons.map((lesson) => html`
                                <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer group"
                                     @click=${() => this._handleLessonSelected(lesson.id)}>

                                    <div class="flex-1">
                                        <h4 class="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">${lesson.title}</h4>
                                        <p class="text-sm text-slate-500">${lesson.topic || 'Obecné'}</p>
                                    </div>

                                    <button class="w-10 h-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shadow-sm group-hover:scale-110">
                                        <svg class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                    </button>
                                </div>
                            `)}
                        </div>
                    `}
                </div>

            </div>

            <!-- Join Modal -->
            ${this._showJoinModal ? html`
                <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div class="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl relative">
                        <button @click=${() => this._showJoinModal = false} class="absolute top-5 right-5 text-slate-400 hover:text-slate-600">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>

                        <div class="text-center mb-6">
                            <h3 class="text-2xl font-bold text-slate-900">${t('student.join_modal_title')}</h3>
                            <p class="text-slate-500 mt-2 text-sm">${t('student.join_modal_desc')}</p>
                        </div>

                        <div class="space-y-4">
                            <input type="text"
                                .value=${this._joinCodeInput}
                                @input=${e => this._joinCodeInput = e.target.value.toUpperCase()}
                                placeholder="${t('student.join_placeholder')}"
                                class="w-full text-center text-2xl font-bold border-2 border-slate-200 rounded-xl py-4 uppercase focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all"
                            />

                            <button @click=${this._handleJoinClass} ?disabled=${this._joining}
                                class="w-full bg-indigo-600 text-white font-bold text-lg py-3 rounded-xl hover:bg-indigo-700 hover:scale-[1.02] transition-all flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed">
                                ${this._joining ? html`<span class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>` : ''}
                                ${this._joining ? t('student.joining') : t('student.join')}
                            </button>
                        </div>
                    </div>
                </div>
            ` : nothing}
        `;
    }
}
customElements.define('student-dashboard-view', StudentDashboardView);

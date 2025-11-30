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
        _selectedClass: { type: Object, state: true },
        _classLessons: { type: Array, state: true },
        _loadingClassLessons: { type: Boolean, state: true }
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
        this._selectedClass = null;
        this._classLessons = [];
        this._loadingClassLessons = false;
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
                limit(10) // Increased limit slightly
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

    async _openClassDetail(group) {
        this._selectedClass = group;
        this._loadingClassLessons = true;
        this._classLessons = [];

        try {
            // Fetch lessons specifically for this group
            const q = query(
                collection(firebaseInit.db, "lessons"),
                where("assignedToGroups", "array-contains", group.id),
                orderBy("createdAt", "desc"),
                limit(20)
            );
            const querySnapshot = await getDocs(q);
            this._classLessons = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching class lessons:", error);
            showToast("Nepodařilo se načíst lekce třídy.", true);
        } finally {
            this._loadingClassLessons = false;
        }
    }

    _closeClassDetail() {
        this._selectedClass = null;
        this._classLessons = [];
    }

    // --- RENDER METHODS ---

    render() {
        const t = (key) => translationService.t(key);
        
        if (this._isLoading) {
             return html`
                <div class="flex justify-center items-center h-full min-h-[50vh]">
                     <div class="spinner w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>`;
        }

        const firstName = this._studentName.split(' ')[0];

        // --- 1. Hero / Continue Section ---
        const lastActiveLesson = this._recentLessons.length > 0 ? this._recentLessons[0] : null;

        return html`
            <div class="w-full flex flex-col gap-8 pb-20 md:pb-8 p-4 md:p-8 max-w-3xl mx-auto">

                <!-- Header -->
                <header class="flex items-center justify-between">
                    <div>
                        <h1 class="text-2xl font-extrabold text-slate-900 tracking-tight">Ahoj, ${firstName}! 👋</h1>
                        <p class="text-slate-500 text-sm mt-0.5">Připraven se učit?</p>
                    </div>
                    ${this._studentStreak > 0 ? html`
                        <div class="bg-orange-50 text-orange-600 px-3 py-1.5 rounded-full font-bold text-xs shadow-sm border border-orange-100 flex items-center gap-1">
                            <span>🔥</span> ${this._studentStreak}
                        </div>
                    ` : nothing}
                </header>

                <!-- A. Hero Section (Pokračovat) -->
                ${lastActiveLesson ? html`
                    <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-700 text-white shadow-xl shadow-indigo-200 cursor-pointer group transform transition-all hover:scale-[1.02]"
                         @click=${() => this._handleLessonSelected(lastActiveLesson.id)}>
                        
                        <!-- Decorative Background -->
                        <div class="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-white opacity-10 rounded-full blur-2xl"></div>
                        <div class="absolute bottom-0 left-0 -mb-8 -ml-8 w-32 h-32 bg-purple-400 opacity-20 rounded-full blur-xl"></div>

                        <div class="relative p-6 flex flex-col gap-4">
                            <div class="flex items-center justify-between">
                                <span class="inline-flex items-center px-2.5 py-1 rounded-lg bg-white/20 border border-white/10 text-xs font-bold backdrop-blur-md">
                                    ▶️ Pokračovat
                                </span>
                                <span class="text-xs font-medium text-indigo-100 opacity-80">
                                    Naposledy otevřeno
                                </span>
                            </div>
                            
                            <div>
                                <h2 class="text-2xl font-bold leading-tight mb-1 group-hover:text-white transition-colors">
                                    ${lastActiveLesson.title}
                                </h2>
                                <p class="text-indigo-100 text-sm line-clamp-1 opacity-90">
                                    ${lastActiveLesson.subtitle || 'Klikni pro pokračování ve studiu'}
                                </p>
                            </div>

                            <button class="mt-2 w-full bg-white text-indigo-600 font-bold py-3 rounded-xl shadow-lg hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2">
                                Pokračovat v lekci <span class="text-lg">→</span>
                            </button>
                        </div>
                    </div>
                ` : nothing}

                <!-- B. Sekcia "Moje Třídy" -->
                <section>
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <span class="bg-blue-100 text-blue-600 p-1.5 rounded-lg text-sm">📚</span>
                            ${t('nav.classes')}
                        </h3>
                        <button class="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
                                @click=${() => this._showJoinModal = true}>
                            + Připojit se
                        </button>
                    </div>

                    ${this._groups.length > 0 ? html`
                        <div class="flex flex-col gap-3">
                            ${this._groups.map(group => html`
                                <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer flex items-center justify-between group"
                                     @click=${() => this._openClassDetail(group)}>
                                    <div class="flex items-center gap-4">
                                        <div class="w-12 h-12 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center font-bold text-lg group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                            ${group.name.substring(0, 1).toUpperCase()}
                                        </div>
                                        <div>
                                            <h4 class="font-bold text-slate-800 text-base">${group.name}</h4>
                                            <p class="text-xs text-slate-400 flex items-center gap-1">
                                                ${group.ownerName || 'Učitel'}
                                            </p>
                                        </div>
                                    </div>
                                    <div class="text-slate-300 group-hover:text-indigo-400">
                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                                    </div>
                                </div>
                            `)}
                        </div>
                    ` : html`
                         <div class="text-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            <p class="text-slate-400 text-sm mb-2">Zatím nejste v žádné třídě.</p>
                            <button @click=${() => this._showJoinModal = true} class="text-indigo-600 text-sm font-bold hover:underline">Připojit se</button>
                        </div>
                    `}
                </section>

                <!-- C. Sekcia "Moje Lekce" -->
                <section>
                    <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                        <span class="bg-purple-100 text-purple-600 p-1.5 rounded-lg text-sm">⚡</span>
                        ${t('student.next_up')}
                    </h3>

                    <div class="flex flex-col gap-3">
                        ${this._recentLessons.length > 0 ? this._recentLessons.map(lesson => html`
                            <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer flex items-center gap-4 group"
                                 @click=${() => this._handleLessonSelected(lesson.id)}>

                                <div class="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xl flex-shrink-0 group-hover:scale-110 transition-transform">
                                    ${lesson.icon || '📖'}
                                </div>

                                <div class="flex-1 min-w-0">
                                    <h4 class="font-bold text-slate-800 text-base truncate group-hover:text-indigo-600 transition-colors">
                                        ${lesson.title}
                                    </h4>
                                    <p class="text-xs text-slate-400 truncate">
                                        ${lesson.subtitle || 'Lekce'}
                                    </p>
                                </div>

                                <button class="px-3 py-1.5 bg-slate-50 text-slate-600 text-xs font-bold rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    Otevřít
                                </button>
                            </div>
                        `) : html`
                            <div class="text-center p-6 text-slate-400 text-sm">Žádné lekce k zobrazení.</div>
                        `}
                    </div>
                </section>

                <!-- Spacer for bottom nav on mobile -->
                <div class="h-16 md:hidden"></div>
            </div>

            <!-- Join Class Modal -->
            ${this._renderJoinModal(t)}

            <!-- Class Detail Modal -->
            ${this._renderClassDetailModal()}
        `;
    }

    _renderJoinModal(t) {
        if (!this._showJoinModal) return nothing;
        return html`
            <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
                <div class="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative transform scale-100 transition-all">
                    <button @click=${() => this._showJoinModal = false} class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-50 rounded-full p-2 transition-colors">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>

                    <div class="text-center mb-6 mt-2">
                        <div class="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl shadow-sm border border-indigo-100">🚀</div>
                        <h3 class="text-xl font-black text-slate-900">${t('student.join_modal_title')}</h3>
                        <p class="text-slate-500 text-sm mt-1">${t('student.join_modal_desc')}</p>
                    </div>

                    <div class="space-y-4">
                        <input type="text"
                            .value=${this._joinCodeInput}
                            @input=${e => this._joinCodeInput = e.target.value.toUpperCase()}
                            placeholder="KÓD (např. X9Y2Z1)"
                            class="w-full text-center text-xl font-black tracking-widest border-2 border-slate-200 rounded-xl py-3 uppercase focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 outline-none text-slate-800 placeholder-slate-300 transition-all"
                        />
                        <button @click=${this._handleJoinClass} ?disabled=${this._joining}
                            class="w-full bg-indigo-600 text-white font-bold text-base py-3 rounded-xl shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center">
                            ${this._joining ? html`<span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>` : t('student.join')}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    _renderClassDetailModal() {
        if (!this._selectedClass) return nothing;

        return html`
            <div class="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-slate-900/50 backdrop-blur-sm sm:p-4 animate-fade-in">

                <!-- Modal Content -->
                <div class="bg-white w-full max-w-lg md:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] md:max-h-[80vh] relative animate-slide-up-mobile md:animate-scale-up">

                    <!-- Header -->
                    <div class="p-6 border-b border-slate-100 flex items-start justify-between bg-white sticky top-0 z-10">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="bg-indigo-50 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider">Třída</span>
                            </div>
                            <h2 class="text-2xl font-black text-slate-900 leading-tight">${this._selectedClass.name}</h2>
                            <p class="text-slate-500 text-sm mt-1 flex items-center gap-1">
                                👨‍🏫 ${this._selectedClass.ownerName || 'Neznámý učitel'}
                            </p>
                        </div>
                        <button @click=${this._closeClassDetail} class="text-slate-400 hover:text-slate-600 bg-slate-50 p-2 rounded-full transition-colors">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>

                    <!-- Scrollable Content -->
                    <div class="overflow-y-auto p-6 space-y-8 flex-1">

                        <!-- Agenda Placeholder -->
                        <div class="bg-amber-50 rounded-xl p-4 border border-amber-100 flex items-start gap-3">
                            <span class="text-xl">📅</span>
                            <div>
                                <h4 class="font-bold text-amber-800 text-sm">Rozvrh a Agenda</h4>
                                <p class="text-amber-700/80 text-xs mt-1">Zde brzy uvidíte plánované události a termíny pro tuto třídu.</p>
                            </div>
                        </div>

                        <!-- Lessons List -->
                        <div>
                            <h3 class="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                                <span>📚</span> Lekce třídy
                            </h3>

                            ${this._loadingClassLessons ? html`
                                <div class="flex justify-center py-8">
                                    <div class="spinner w-8 h-8 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin"></div>
                                </div>
                            ` : this._classLessons.length > 0 ? html`
                                <div class="space-y-2">
                                    ${this._classLessons.map(lesson => html`
                                        <div class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-white hover:border-indigo-200 hover:shadow-sm cursor-pointer transition-all group"
                                             @click=${() => { this._closeClassDetail(); this._handleLessonSelected(lesson.id); }}>
                                            <div class="w-10 h-10 rounded-lg bg-white text-indigo-600 border border-slate-200 flex items-center justify-center text-lg shadow-sm group-hover:scale-105 transition-transform">
                                                ${lesson.icon || '📖'}
                                            </div>
                                            <div class="flex-1">
                                                <h4 class="text-sm font-bold text-slate-800 group-hover:text-indigo-700 transition-colors">${lesson.title}</h4>
                                                <div class="flex items-center gap-2 mt-0.5">
                                                    <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">${lesson.topic || 'Obecné'}</span>
                                                </div>
                                            </div>
                                            <span class="text-slate-300 group-hover:text-indigo-500">→</span>
                                        </div>
                                    `)}
                                </div>
                            ` : html`
                                <div class="text-center py-6 text-slate-400 text-sm border-2 border-dashed border-slate-100 rounded-xl">
                                    Zatím žádné lekce.
                                </div>
                            `}
                        </div>
                    </div>

                    <!-- Footer / Actions -->
                    <div class="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                        <button class="text-red-500 text-sm font-bold px-4 py-2 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
                                @click=${() => showToast("Funkce opuštění třídy bude dostupná brzy.", true)}>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                            Opustit třídu
                        </button>

                        <span class="text-xs text-slate-400 font-mono">ID: ${this._selectedClass.id.substring(0, 6)}</span>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('student-dashboard-view', StudentDashboardView);

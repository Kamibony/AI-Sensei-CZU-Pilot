import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, onSnapshot, collection, query, where, orderBy, limit, getDocs, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';

export class StudentDashboardView extends LitElement {
    static properties = {
        _studentName: { type: String, state: true },
        _recentLesson: { type: Object, state: true },
        _groups: { type: Array, state: true },
        _isLoading: { type: Boolean, state: true },
        _showJoinModal: { type: Boolean, state: true },
        _joinCodeInput: { type: String, state: true },
        _joining: { type: Boolean, state: true },
    };

    constructor() {
        super();
        this._studentName = '';
        this._recentLesson = null;
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
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._studentUnsubscribe) {
            this._studentUnsubscribe();
        }
    }

    async _fetchData() {
        const user = firebaseInit.auth.currentUser;
        if (!user) return;

        // 1. Fetch Student Profile & Groups
        const userDocRef = doc(firebaseInit.db, "students", user.uid);
        this._studentUnsubscribe = onSnapshot(userDocRef, async (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                this._studentName = data.name || 'Studente';
                const groupIds = data.memberOfGroups || [];

                if (groupIds.length > 0) {
                    await this._fetchGroupsInfo(groupIds);
                    await this._fetchRecentLesson(groupIds);
                } else {
                    this._groups = [];
                    this._recentLesson = null;
                    this._isLoading = false;
                }
            }
        });
    }

    async _fetchGroupsInfo(groupIds) {
        // Limitation: Firestore 'in' query supports max 10 (or 30) items.
        // For simplicity/robustness in pilot, we'll fetch the first 10 if there are many.
        const safeGroupIds = groupIds.slice(0, 10);
        if (safeGroupIds.length === 0) return;

        try {
            // Note: In a real app with many groups, we might need a better way than 'in' or multiple fetches.
            // But for now, we assume we want to show details for groups the student is in.
            // However, the prompt implies these are "Stories" (Třídy).
            // We need to fetch group names.

            // Optimization: If we have many groups, maybe we just use the IDs or fetch them individually?
            // Let's try to fetch them.
            const q = query(collection(firebaseInit.db, "groups"), where("__name__", "in", safeGroupIds));
            const querySnapshot = await getDocs(q);
            this._groups = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error("Error fetching groups:", error);
            // Fallback if permission denied or other error
            this._groups = safeGroupIds.map(id => ({ id, name: 'Třída' }));
        }
    }

    async _fetchRecentLesson(groupIds) {
        // Fetch most recent lesson assigned to student's groups
        try {
            // Firestore limits 'array-contains-any' to 30 elements
            let searchGroups = groupIds;
            if (searchGroups.length > 30) {
                searchGroups = searchGroups.slice(0, 30);
            }

            const q = query(
                collection(firebaseInit.db, "lessons"),
                where("assignedToGroups", "array-contains-any", searchGroups),
                orderBy("createdAt", "desc"),
                limit(1)
            );

            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                const doc = querySnapshot.docs[0];
                this._recentLesson = {
                    id: doc.id,
                    ...doc.data()
                };
            } else {
                this._recentLesson = null;
            }
        } catch (error) {
            console.error("Error fetching recent lesson:", error);
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
            showToast("Zadejte kód třídy", true);
            return;
        }

        this._joining = true;
        try {
            // 1. Find group by code
            const q = query(collection(firebaseInit.db, "groups"), where("joinCode", "==", code));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                showToast("Třída s tímto kódem neexistuje", true);
                this._joining = false;
                return;
            }

            const groupDoc = querySnapshot.docs[0];
            const groupId = groupDoc.id;

            // 2. Add student to group (update student doc)
            const user = firebaseInit.auth.currentUser;
            await updateDoc(doc(firebaseInit.db, "students", user.uid), {
                memberOfGroups: arrayUnion(groupId)
            });

            // 3. Add student to group's student list (update group doc)
            // Note: This dual-write ideally happens in a transaction or Cloud Function 'joinClass',
            // but we follow the instruction to use updateDoc on student here.
            // We do best effort on the group doc too.
            try {
                await updateDoc(doc(firebaseInit.db, "groups", groupId), {
                    studentIds: arrayUnion(user.uid)
                });
            } catch (e) {
                console.warn("Could not update group list directly (likely permissions).", e);
            }

            showToast("Úspěšně připojeno k třídě!");
            this._showJoinModal = false;
            this._joinCodeInput = '';
            // Data will refresh automatically via listener

        } catch (error) {
            console.error("Error joining class:", error);
            showToast("Chyba při připojování: " + error.message, true);
        } finally {
            this._joining = false;
        }
    }

    render() {
        if (this._isLoading) {
            return html`
                <div class="flex flex-col justify-center items-center h-full min-h-[50vh] space-y-4">
                     <div class="spinner w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                     <p class="text-sm font-bold text-indigo-300 animate-pulse">Načítám tvůj svět...</p>
                </div>`;
        }

        return html`
            <div class="space-y-8 pb-24 font-['Plus_Jakarta_Sans']"> <!-- Padding bottom for sticky nav -->

                <!-- Header & Streak -->
                <div class="pt-2 flex justify-between items-start">
                    <div>
                        <h1 class="text-3xl font-extrabold text-slate-900 tracking-tight">
                            Dobré ráno, <br>
                            <span class="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">${this._studentName}! 👋</span>
                        </h1>
                    </div>
                    <!-- Mock Streak -->
                    <div class="flex flex-col items-center">
                        <div class="flex items-center space-x-1 bg-orange-50 px-3 py-1.5 rounded-full border border-orange-100 shadow-sm">
                            <span class="text-lg">🔥</span>
                            <span class="font-black text-orange-500">3</span>
                        </div>
                        <span class="text-[10px] font-bold text-orange-300 uppercase tracking-wider mt-1">Dny v řadě</span>
                    </div>
                </div>

                <!-- Section 1: Stories (Třídy) -->
                <div>
                    <div class="flex items-center justify-between mb-4 px-1">
                        <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Moje Třídy</h2>
                        <span class="text-xs font-bold text-indigo-500 cursor-pointer">Všechny</span>
                    </div>
                    
                    <div class="flex overflow-x-auto gap-5 pb-4 -mx-4 px-4 no-scrollbar snap-x">
                        ${this._groups.length > 0 ? this._groups.map(group => html`
                            <div class="flex flex-col items-center flex-shrink-0 snap-start group cursor-pointer">
                                <div class="w-[4.5rem] h-[4.5rem] rounded-[1.5rem] bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-[3px] shadow-lg shadow-indigo-200 group-hover:scale-105 transition-transform duration-300">
                                    <div class="w-full h-full rounded-[1.3rem] bg-white flex items-center justify-center border-4 border-white relative overflow-hidden">
                                        <!-- Placeholder Icon or Initials -->
                                        <span class="text-2xl font-black text-slate-700">${group.name.charAt(0)}</span>
                                    </div>
                                </div>
                                <span class="text-xs font-bold text-slate-600 mt-2 max-w-[4.5rem] truncate text-center leading-tight">${group.name}</span>
                            </div>
                        `) : nothing}

                        <!-- Add Button -->
                        <div @click=${() => this._showJoinModal = true} class="flex flex-col items-center flex-shrink-0 cursor-pointer group">
                            <div class="w-[4.5rem] h-[4.5rem] rounded-[1.5rem] bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center group-hover:bg-indigo-50 group-hover:border-indigo-300 transition-all duration-300">
                                <span class="text-2xl text-slate-400 group-hover:text-indigo-500 transition-colors">+</span>
                            </div>
                            <span class="text-xs font-bold text-slate-400 mt-2 group-hover:text-indigo-500 transition-colors">Připojit</span>
                        </div>
                    </div>
                </div>

                <!-- Section 2: Jump Back In (Hero Card) -->
                <div>
                    <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-1">Pokračovat v učení</h2>
                    ${this._recentLesson ? html`
                        <div class="relative min-h-[220px] rounded-[2rem] overflow-hidden shadow-2xl shadow-indigo-500/30 bg-slate-900 p-8 flex flex-col justify-between transform transition-all active:scale-95 group cursor-pointer">
                            
                            <!-- Background Gradient & Effects -->
                            <div class="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-700 to-indigo-900 opacity-90"></div>
                            <div class="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full translate-x-1/3 -translate-y-1/3 blur-3xl group-hover:opacity-20 transition-opacity duration-500"></div>
                            <div class="absolute bottom-0 left-0 w-40 h-40 bg-pink-500 opacity-20 rounded-full -translate-x-1/3 translate-y-1/3 blur-2xl group-hover:opacity-30 transition-opacity duration-500"></div>

                            <div class="relative z-10">
                                <span class="inline-block px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold text-white mb-3 border border-white/10">
                                    🎯 Poslední aktivita
                                </span>
                                <h3 class="text-3xl font-black text-white leading-tight tracking-tight mb-2">${this._recentLesson.title}</h3>
                                ${this._recentLesson.subtitle ? html`<p class="text-indigo-200 text-sm font-medium line-clamp-2">${this._recentLesson.subtitle}</p>` : nothing}
                            </div>

                            <div class="relative z-10 flex items-end justify-between mt-6">
                                <div>
                                    <p class="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-1">Progress</p>
                                    <div class="w-32 h-2 bg-slate-800/50 rounded-full overflow-hidden backdrop-blur-sm">
                                        <div class="h-full bg-gradient-to-r from-green-400 to-emerald-500 w-2/3 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.5)]"></div>
                                    </div>
                                </div>

                                <button @click=${() => this._handleLessonSelected(this._recentLesson.id)}
                                        class="w-14 h-14 rounded-2xl bg-white text-indigo-600 flex items-center justify-center shadow-lg shadow-black/20 hover:scale-110 hover:rotate-3 transition-all duration-300 group-hover:bg-indigo-50">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-7 h-7 ml-1">
                                        <path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ` : html`
                         <div class="min-h-[140px] rounded-[2rem] bg-slate-50 flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-slate-200">
                            <span class="text-4xl mb-3">zzz...</span>
                            <p class="text-slate-500 font-bold">Zatím žádné úkoly</p>
                            <p class="text-slate-400 text-xs mt-1">Užívej si volna, dokud to jde! 😎</p>
                         </div>
                    `}
                </div>

                <!-- Section 3: Coming Up (Modern List) -->
                <div>
                    <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-1">Co tě čeká</h2>
                    <div class="space-y-3">
                        <!-- Mock Item 1 -->
                        <div class="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-5 hover:shadow-md transition-shadow cursor-pointer">
                            <div class="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 text-xl shadow-sm">
                                🧠
                            </div>
                            <div class="flex-grow">
                                <h4 class="font-bold text-slate-800">Kvíz z Biologie</h4>
                                <p class="text-xs text-slate-500 font-medium mt-0.5">Zítra, 9:00 • 15 min</p>
                            </div>
                            <div class="w-8 h-8 rounded-full border-2 border-slate-200 flex items-center justify-center">
                                <div class="w-4 h-4 rounded-full bg-slate-200"></div>
                            </div>
                        </div>

                        <!-- Mock Item 2 -->
                        <div class="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-5 hover:shadow-md transition-shadow cursor-pointer">
                            <div class="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 text-xl shadow-sm">
                                ⚡
                            </div>
                            <div class="flex-grow">
                                <h4 class="font-bold text-slate-800">Nový úkol - Fyzika</h4>
                                <p class="text-xs text-slate-500 font-medium mt-0.5">Pátek, 23:59 • Projekt</p>
                            </div>
                            <div class="w-8 h-8 rounded-full border-2 border-slate-200 flex items-center justify-center">
                                <div class="w-4 h-4 rounded-full bg-slate-200"></div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            <!-- Join Class Modal (Modernized) -->
            ${this._showJoinModal ? html`
                <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-fade-in">
                    <div class="bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl relative overflow-hidden">
                        <!-- Decorative bg -->
                        <div class="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-indigo-50 to-white"></div>

                        <button @click=${() => this._showJoinModal = false} class="absolute top-6 right-6 text-slate-400 hover:text-slate-600 z-10 bg-white rounded-full p-2 shadow-sm">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>

                        <div class="text-center mb-8 relative z-10 mt-4">
                            <div class="w-20 h-20 bg-white rounded-3xl shadow-xl shadow-indigo-100 flex items-center justify-center mx-auto mb-6 text-4xl border border-slate-50">🔑</div>
                            <h3 class="text-2xl font-black text-slate-900 tracking-tight">Připojit se</h3>
                            <p class="text-slate-500 text-sm mt-2 font-medium">Zadej kód od učitele a naskoč do třídy.</p>
                        </div>

                        <div class="space-y-4 relative z-10">
                            <input type="text"
                                .value=${this._joinCodeInput}
                                @input=${e => this._joinCodeInput = e.target.value.toUpperCase()}
                                placeholder="A1B2C"
                                class="w-full text-center text-3xl font-mono font-black tracking-[0.5em] border-2 border-slate-200 rounded-2xl py-5 uppercase focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 text-indigo-600 placeholder-slate-200 transition-all outline-none"
                            />

                            <button @click=${this._handleJoinClass} ?disabled=${this._joining}
                                class="w-full bg-indigo-600 text-white font-bold py-5 rounded-2xl shadow-xl shadow-indigo-500/30 hover:bg-indigo-700 hover:shadow-indigo-500/50 hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center text-lg">
                                ${this._joining ? html`<span class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span> Momentík...` : 'Vstoupit 🚀'}
                            </button>
                        </div>
                    </div>
                </div>
            ` : nothing}
        `;
    }
}
customElements.define('student-dashboard-view', StudentDashboardView);

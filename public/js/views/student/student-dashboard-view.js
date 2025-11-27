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
                <div class="flex justify-center items-center h-full min-h-[50vh]">
                     <div class="spinner w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>`;
        }

        const firstName = this._studentName.split(' ')[0];

        return html`
            <div class="space-y-8 pb-24 px-4 md:px-0">

                <!-- A. Header Section -->
                <div class="flex items-center justify-between pt-4">
                    <div>
                        <h1 class="text-2xl font-black text-slate-900 tracking-tight leading-tight">
                            Dobré ráno,<br>
                            ${firstName}! 👋
                        </h1>
                    </div>
                    <div class="flex items-center gap-1.5 bg-orange-100 text-orange-600 px-3 py-1.5 rounded-full font-bold text-sm shadow-sm">
                        <span>🔥</span>
                        <span>3 dny</span>
                    </div>
                </div>

                <!-- B. "My Classes" as Stories -->
                <div>
                    <div class="flex overflow-x-auto gap-4 pb-4 -mx-4 px-4 no-scrollbar snap-x">

                        ${this._groups.map(group => html`
                            <div class="flex flex-col items-center flex-shrink-0 snap-start cursor-pointer group" @click=${() => showToast(`Třída: ${group.name}`)}>
                                <div class="w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 to-fuchsia-600 shadow-md transition-transform transform group-active:scale-95">
                                    <div class="w-full h-full rounded-full bg-white flex items-center justify-center border-[3px] border-white overflow-hidden">
                                        <!-- Initials or Icon -->
                                        <span class="text-sm font-bold text-slate-700">${group.name.substring(0, 2).toUpperCase()}</span>
                                    </div>
                                </div>
                                <span class="text-xs font-bold text-slate-600 mt-2 max-w-[4.5rem] truncate text-center leading-tight">${group.name}</span>
                            </div>
                        `)}

                        <!-- Add/Join Class Action -->
                        <div class="flex flex-col items-center flex-shrink-0 snap-start cursor-pointer group" @click=${() => this._showJoinModal = true}>
                            <div class="w-16 h-16 rounded-full p-[2px] bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center shadow-sm transition-transform transform group-active:scale-95">
                                <span class="text-2xl text-slate-400 font-bold">+</span>
                            </div>
                            <span class="text-xs font-bold text-slate-400 mt-2">Připojit</span>
                        </div>
                    </div>
                </div>

                <!-- C. "Jump Back In" (Hero Card) -->
                <div>
                    ${this._recentLesson ? html`
                        <div class="w-full aspect-[4/3] md:aspect-[21/9] rounded-3xl relative overflow-hidden shadow-xl shadow-indigo-500/20 group cursor-pointer transition-all hover:shadow-indigo-500/30"
                             @click=${() => this._handleLessonSelected(this._recentLesson.id)}>

                            <!-- Background -->
                            <div class="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500"></div>

                            <!-- Glass/Texture Overlay -->
                            <div class="absolute inset-0 bg-white/10 backdrop-blur-[1px]"></div>
                            <div class="absolute -top-24 -right-24 w-64 h-64 bg-pink-500/30 rounded-full blur-3xl"></div>
                            <div class="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-500/30 rounded-full blur-3xl"></div>

                            <!-- Content -->
                            <div class="absolute inset-0 p-6 flex flex-col justify-between">
                                <div>
                                    <p class="text-xs font-bold text-white/80 uppercase tracking-widest mb-2">Pokračovat v lekci</p>
                                    <h2 class="text-3xl md:text-4xl font-black text-white leading-tight line-clamp-3">
                                        ${this._recentLesson.title}
                                    </h2>
                                </div>

                                <div class="flex items-center gap-4">
                                    <!-- Play Button -->
                                    <div class="w-14 h-14 rounded-full bg-white text-indigo-600 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-8 h-8 ml-1">
                                            <path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" />
                                        </svg>
                                    </div>

                                    <!-- Progress (Visual) -->
                                    <div class="flex-1">
                                        <div class="h-2 w-full bg-black/20 rounded-full overflow-hidden">
                                            <div class="h-full bg-white/90 w-[40%] rounded-full"></div>
                                        </div>
                                        <p class="text-xs text-white/90 font-bold mt-1.5 ml-1">Zbývá 15 min</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ` : html`
                        <!-- Empty State -->
                        <div class="w-full aspect-[4/3] md:aspect-[21/9] rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-8 text-center">
                            <div class="text-4xl mb-3">🎉</div>
                            <h3 class="text-lg font-bold text-slate-900">Vše hotovo!</h3>
                            <p class="text-sm text-slate-500 max-w-[200px] mx-auto mt-1">Momentálně nemáte žádné rozpracované lekce.</p>
                            <button @click=${() => this._showJoinModal = true} class="mt-4 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-indigo-600 shadow-sm">
                                Připojit se ke třídě
                            </button>
                        </div>
                    `}
                </div>

                <!-- D. "Next Up" (Activity Feed) -->
                <div>
                    <h2 class="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                        Co tě čeká 📅
                    </h2>
                    <div class="space-y-3">
                        <!-- Mock Task 1 -->
                        <div class="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4 active:scale-[0.98] transition-transform">
                            <div class="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
                                    <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm14.024-.983a.75.75 0 010 1.06l-2.75 2.75a.75.75 0 01-1.06 0l-2.75-2.75a.75.75 0 011.06-1.06l1.47 1.47V7.875a.75.75 0 011.5 0V12.53l1.47-1.47a.75.75 0 011.06 0z" clip-rule="evenodd" />
                                </svg>
                            </div>
                            <div class="flex-1">
                                <h4 class="font-bold text-slate-900">Kvíz: Organická chemie</h4>
                                <p class="text-xs text-slate-500 font-medium">Třída 3.B • Pan Novák</p>
                            </div>
                            <div class="text-right">
                                <span class="block text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded-lg">Do zítra</span>
                            </div>
                        </div>

                        <!-- Mock Task 2 -->
                        <div class="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4 active:scale-[0.98] transition-transform">
                            <div class="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
                                    <path d="M11.25 4.533A9.707 9.707 0 006 3.75a9.753 9.753 0 00-5.963 2.033 9.75 9.75 0 00-2.422 6.578 9.75 9.75 0 002.422 6.578A9.753 9.753 0 006 21c2.133.08 4.155-.572 5.963-1.783A9.707 9.707 0 0012 18.217a9.707 9.707 0 00.787 1c1.808 1.21 3.83 1.863 5.963 1.783A9.753 9.753 0 0021.385 18.9 9.75 9.75 0 0023.807 12.322a9.75 9.75 0 00-2.422-6.578A9.753 9.753 0 0015.42 3.75a9.707 9.707 0 00-4.17 1.783z" />
                                </svg>
                            </div>
                            <div class="flex-1">
                                <h4 class="font-bold text-slate-900">Domácí četba</h4>
                                <p class="text-xs text-slate-500 font-medium">Literatura • Paní Dvořáková</p>
                            </div>
                            <div class="text-right">
                                <span class="block text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">Nové</span>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            <!-- Join Class Modal (Existing logic, just visual tweaks if needed, but existing looked OK. I'll include it to be safe) -->
            ${this._showJoinModal ? html`
                <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div class="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl relative">
                        <button @click=${() => this._showJoinModal = false} class="absolute top-5 right-5 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-2 transition-colors">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>

                        <div class="text-center mb-8 mt-2">
                            <div class="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-5 text-4xl shadow-sm border border-indigo-100">🚀</div>
                            <h3 class="text-2xl font-black text-slate-900">Nová mise?</h3>
                            <p class="text-slate-500 font-medium mt-2">Zadej kód od učitele a naskoč do třídy.</p>
                        </div>

                        <div class="space-y-4">
                            <div>
                                <input type="text"
                                    .value=${this._joinCodeInput}
                                    @input=${e => this._joinCodeInput = e.target.value.toUpperCase()}
                                    placeholder="KÓD TŘÍDY"
                                    class="w-full text-center text-3xl font-black tracking-[0.2em] border-2 border-slate-200 rounded-2xl py-5 uppercase focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 outline-none text-slate-800 placeholder-slate-300 transition-all"
                                />
                            </div>

                            <button @click=${this._handleJoinClass} ?disabled=${this._joining}
                                class="w-full bg-indigo-600 text-white font-bold text-lg py-4 rounded-2xl shadow-xl shadow-indigo-500/30 hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center">
                                ${this._joining ? html`<span class="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin mr-3"></span> Připojuji...` : 'Vstoupit'}
                            </button>
                        </div>
                    </div>
                </div>
            ` : nothing}
        `;
    }
}
customElements.define('student-dashboard-view', StudentDashboardView);

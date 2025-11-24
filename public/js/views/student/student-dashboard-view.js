import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, onSnapshot, collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';

export class StudentDashboardView extends LitElement {
    static properties = {
        _studentName: { type: String, state: true },
        _recentLesson: { type: Object, state: true },
        _groups: { type: Array, state: true },
        _isLoading: { type: Boolean, state: true },
    };

    constructor() {
        super();
        this._studentName = '';
        this._recentLesson = null;
        this._groups = [];
        this._isLoading = true;
        this._studentUnsubscribe = null;
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

    render() {
        if (this._isLoading) {
             return html`
                <div class="flex justify-center items-center h-full min-h-[50vh]">
                     <div class="spinner w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>`;
        }

        return html`
            <div class="space-y-8 pb-24"> <!-- Padding bottom for sticky nav -->

                <!-- Header -->
                <div class="pt-4">
                    <h1 class="text-3xl font-extrabold text-slate-900 tracking-tight">
                        Dobré ráno, <br>
                        <span class="text-indigo-600">${this._studentName}! 👋</span>
                    </h1>
                </div>

                <!-- Section 1: Stories (Třídy) -->
                <div>
                    <h2 class="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 px-1">Moje Třídy</h2>
                    <div class="flex overflow-x-auto gap-4 pb-4 -mx-4 px-4 no-scrollbar snap-x">
                        ${this._groups.length > 0 ? this._groups.map(group => html`
                            <div class="flex flex-col items-center flex-shrink-0 snap-start">
                                <div class="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 p-[2px] shadow-md">
                                    <div class="w-full h-full rounded-full bg-white flex items-center justify-center border-2 border-transparent">
                                        <span class="text-xl">🏫</span>
                                    </div>
                                </div>
                                <span class="text-xs font-medium text-slate-700 mt-2 max-w-[4rem] truncate text-center">${group.name}</span>
                            </div>
                        `) : html`
                            <div class="flex flex-col items-center flex-shrink-0">
                                <div class="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center">
                                    <span class="text-2xl text-slate-400">+</span>
                                </div>
                                <span class="text-xs font-medium text-slate-500 mt-2">Žádné třídy</span>
                            </div>
                        `}
                    </div>
                </div>

                <!-- Section 2: Jump Back In -->
                <div>
                    <h2 class="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 px-1">Pokračovat</h2>
                    ${this._recentLesson ? html`
                        <div class="relative min-h-[200px] rounded-3xl overflow-hidden shadow-xl shadow-indigo-200/50 bg-gradient-to-br from-indigo-600 to-purple-600 p-6 flex flex-col justify-between transform transition-transform active:scale-95">
                            <!-- Decorative circles -->
                            <div class="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full translate-x-1/3 -translate-y-1/3 blur-xl"></div>
                            <div class="absolute bottom-0 left-0 w-24 h-24 bg-purple-400 opacity-20 rounded-full -translate-x-1/3 translate-y-1/3 blur-lg"></div>

                            <div class="relative z-10">
                                <p class="text-indigo-100 text-sm font-medium mb-1">Pokračovat v lekci:</p>
                                <h3 class="text-2xl font-bold text-white leading-tight">${this._recentLesson.title}</h3>
                                ${this._recentLesson.subtitle ? html`<p class="text-indigo-200 text-sm mt-2 line-clamp-1">${this._recentLesson.subtitle}</p>` : nothing}
                            </div>

                            <div class="relative z-10 flex justify-end mt-4">
                                <button @click=${() => this._handleLessonSelected(this._recentLesson.id)}
                                        class="w-12 h-12 rounded-full bg-white text-indigo-600 flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 ml-0.5">
                                        <path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ` : html`
                         <div class="min-h-[120px] rounded-3xl bg-slate-100 flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-slate-200">
                            <p class="text-slate-500 font-medium">Zatím žádné aktivní lekce</p>
                            <p class="text-slate-400 text-sm mt-1">Počkejte na zadání od profesora</p>
                         </div>
                    `}
                </div>

                <!-- Section 3: Coming Up -->
                <div>
                    <h2 class="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 px-1">Co tě čeká</h2>
                    <div class="space-y-3">
                        <!-- Mock Item 1 -->
                        <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                            <div class="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                                    <path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clip-rule="evenodd" />
                                </svg>
                            </div>
                            <div>
                                <h4 class="font-bold text-slate-800 text-sm">Kvíz z Biologie</h4>
                                <p class="text-xs text-slate-500">Zítra, 9:00</p>
                            </div>
                        </div>

                        <!-- Mock Item 2 -->
                        <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                            <div class="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                                    <path d="M11.25 4.533A9.707 9.707 0 006 3.75a9.753 9.753 0 00-5.963 2.033 9.75 9.75 0 00-2.422 6.578 9.75 9.75 0 002.422 6.578A9.753 9.753 0 006 21c2.133.08 4.155-.572 5.963-1.783A9.707 9.707 0 0012 18.217a9.707 9.707 0 00.787 1c1.808 1.21 3.83 1.863 5.963 1.783A9.753 9.753 0 0021.385 18.9 9.75 9.75 0 0023.807 12.322a9.75 9.75 0 00-2.422-6.578A9.753 9.753 0 0015.42 3.75a9.707 9.707 0 00-4.17 1.783z" />
                                </svg>
                            </div>
                            <div>
                                <h4 class="font-bold text-slate-800 text-sm">Nový úkol - Fyzika</h4>
                                <p class="text-xs text-slate-500">Pátek, 23:59</p>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        `;
    }
}
customElements.define('student-dashboard-view', StudentDashboardView);

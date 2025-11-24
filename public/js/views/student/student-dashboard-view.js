import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, onSnapshot, collection, query, where, orderBy, documentId, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';

export class StudentDashboardView extends LitElement {

    static properties = {
        lessons: { type: Array, state: true },
        groups: { type: Array, state: true }, // Array of { id, name, ... }
        studentName: { type: String, state: true },
        isLoading: { type: Boolean, state: true },
        error: { type: String, state: true },
        selectedGroupId: { type: String, state: true }
    };

    constructor() {
        super();
        this.lessons = [];
        this.groups = [];
        this.studentName = '';
        this.isLoading = true;
        this.error = null;
        this.selectedGroupId = null;

        this.studentUnsubscribe = null;
        this.lessonsUnsubscribe = null;
    }

    createRenderRoot() { return this; } // Disable Shadow DOM for global styles

    connectedCallback() {
        super.connectedCallback();
        this._initData();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.studentUnsubscribe) this.studentUnsubscribe();
        if (this.lessonsUnsubscribe) this.lessonsUnsubscribe();
    }

    _initData() {
        this.isLoading = true;
        const currentUser = firebaseInit.auth.currentUser;

        if (!currentUser) {
            this.error = "Pro zobrazení dashboardu se musíte přihlásit.";
            this.isLoading = false;
            return;
        }

        const studentDocRef = doc(firebaseInit.db, "students", currentUser.uid);

        this.studentUnsubscribe = onSnapshot(studentDocRef, async (studentSnap) => {
            if (this.lessonsUnsubscribe) this.lessonsUnsubscribe();

            if (!studentSnap.exists()) {
                this.error = "Profil studenta nenalezen.";
                this.isLoading = false;
                return;
            }

            const data = studentSnap.data();
            this.studentName = data.name || 'Studente';
            const groupIds = data.memberOfGroups || [];

            // 1. Fetch Group Details (One-time fetch for names)
            if (groupIds.length > 0) {
                try {
                    // chunking for 'in' query limit of 10 (or 30)
                    const chunks = [];
                    for (let i = 0; i < groupIds.length; i += 10) {
                        chunks.push(groupIds.slice(i, i + 10));
                    }

                    let loadedGroups = [];
                    for (const chunk of chunks) {
                         const q = query(collection(firebaseInit.db, "groups"), where(documentId(), 'in', chunk));
                         const snapshot = await getDocs(q);
                         snapshot.forEach(doc => loadedGroups.push({ id: doc.id, ...doc.data() }));
                    }
                    this.groups = loadedGroups;
                } catch (e) {
                    console.error("Error fetching groups:", e);
                    // Fallback if fetch fails
                    this.groups = groupIds.map(id => ({ id, name: 'Třída' }));
                }
            } else {
                this.groups = [];
            }

            // 2. Fetch Lessons (Real-time)
            if (groupIds.length === 0) {
                this.lessons = [];
                this.isLoading = false;
                return;
            }

            let filterGroups = groupIds;
            // Firestore limit
            if (filterGroups.length > 30) filterGroups = filterGroups.slice(0, 30);

            const lessonsQuery = query(
                collection(firebaseInit.db, "lessons"),
                where("assignedToGroups", "array-contains-any", filterGroups),
                orderBy("createdAt", "desc")
            );

            this.lessonsUnsubscribe = onSnapshot(lessonsQuery, (querySnapshot) => {
                this.lessons = querySnapshot.docs.map(doc => {
                    const d = doc.data();
                    return {
                        id: doc.id,
                        ...d,
                        createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date()
                    };
                });
                this.isLoading = false;
            }, (err) => {
                console.error("Error fetching lessons:", err);
                this.error = "Nepodařilo se načíst lekce.";
                this.isLoading = false;
            });

        }, (err) => {
            console.error("Error fetching student:", err);
            this.error = "Chyba při načítání profilu.";
            this.isLoading = false;
        });
    }

    _handleStoryClick(groupId) {
        if (this.selectedGroupId === groupId) {
            this.selectedGroupId = null; // Toggle off
        } else {
            this.selectedGroupId = groupId;
        }
    }

    _handleLessonClick(lessonId) {
        this.dispatchEvent(new CustomEvent('lesson-selected', {
            detail: { lessonId },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        if (this.isLoading) {
             return html`
                <div class="flex justify-center items-center h-screen">
                     <div class="spinner w-12 h-12 border-4 border-slate-200 border-t-green-600 rounded-full animate-spin"></div>
                </div>`;
        }

        if (this.error) {
             return html`<div class="p-8 text-center text-red-600">${this.error}</div>`;
        }

        const firstName = this.studentName.split(' ')[0];

        // Filter lessons if a group is selected
        const displayedLessons = this.selectedGroupId
            ? this.lessons.filter(l => l.assignedToGroups?.includes(this.selectedGroupId))
            : this.lessons;

        const latestLesson = displayedLessons.length > 0 ? displayedLessons[0] : null;

        // Mock "Coming Up" tasks based on lessons (just taking next 3)
        const comingUp = displayedLessons.slice(1, 4);

        return html`
            <div class="max-w-md mx-auto md:max-w-4xl pb-20 md:pb-0">

                <!-- Header -->
                <header class="mb-6">
                    <h1 class="text-3xl font-bold text-slate-900">Dobré ráno, <br><span class="text-green-600">${firstName}! 👋</span></h1>
                </header>

                <!-- Section 1: Stories (Třídy) -->
                ${this.groups.length > 0 ? html`
                <section class="mb-8">
                    <div class="flex space-x-4 overflow-x-auto pb-4 scrollbar-hide">
                        ${this.groups.map(group => html`
                            <div @click=${() => this._handleStoryClick(group.id)}
                                 class="flex flex-col items-center space-y-2 cursor-pointer min-w-[70px]">
                                <div class="w-16 h-16 rounded-full p-1 ${this.selectedGroupId === group.id ? 'bg-gradient-to-tr from-green-400 to-emerald-600' : 'bg-transparent border-2 border-slate-200'} transition-all duration-300">
                                    <div class="w-full h-full rounded-full bg-white flex items-center justify-center text-2xl shadow-sm">
                                        ${this._getGroupIcon(group.name)}
                                    </div>
                                </div>
                                <span class="text-xs font-medium text-slate-600 truncate w-16 text-center ${this.selectedGroupId === group.id ? 'text-green-700 font-bold' : ''}">
                                    ${group.name}
                                </span>
                            </div>
                        `)}
                    </div>
                </section>
                ` : nothing}

                <!-- Section 2: Jump Back In -->
                ${latestLesson ? html`
                <section class="mb-8">
                    <h2 class="text-lg font-bold text-slate-800 mb-3">Pokračovat</h2>
                    <div @click=${() => this._handleLessonClick(latestLesson.id)}
                         class="relative w-full h-64 rounded-3xl overflow-hidden cursor-pointer shadow-xl group transform transition-transform hover:scale-[1.02]">
                        <!-- Background Gradient -->
                        <div class="absolute inset-0 bg-gradient-to-br from-green-500 to-emerald-800"></div>

                        <!-- Decorative Circles -->
                        <div class="absolute top-[-20%] right-[-20%] w-64 h-64 rounded-full bg-white opacity-10 blur-3xl"></div>
                        <div class="absolute bottom-[-10%] left-[-10%] w-40 h-40 rounded-full bg-yellow-300 opacity-20 blur-2xl"></div>

                        <!-- Content -->
                        <div class="absolute inset-0 p-6 flex flex-col justify-between">
                            <div class="flex justify-between items-start">
                                <span class="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-white text-xs font-bold border border-white/10">
                                    NOVÁ LEKCE
                                </span>
                            </div>

                            <div>
                                <h3 class="text-3xl font-extrabold text-white mb-2 leading-tight drop-shadow-md">
                                    ${latestLesson.title}
                                </h3>
                                <p class="text-green-100 line-clamp-1 mb-4 font-medium">
                                    ${latestLesson.subtitle || 'Klikněte pro spuštění'}
                                </p>

                                <button class="w-full py-3 bg-white text-green-700 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 group-hover:bg-green-50 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
                                    </svg>
                                    Spustit lekci
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
                ` : html`
                <section class="mb-8">
                    <div class="w-full p-8 bg-slate-100 rounded-3xl text-center border border-dashed border-slate-300">
                        <p class="text-slate-500 font-medium">Zatím žádné lekce.</p>
                    </div>
                </section>
                `}

                <!-- Section 3: Coming Up (Mock/Derived) -->
                ${comingUp.length > 0 ? html`
                <section>
                    <h2 class="text-lg font-bold text-slate-800 mb-3">Další úkoly</h2>
                    <div class="space-y-3">
                        ${comingUp.map(lesson => html`
                            <div @click=${() => this._handleLessonClick(lesson.id)}
                                 class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors">
                                <div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-xl text-slate-500 flex-shrink-0">
                                    📚
                                </div>
                                <div class="flex-grow min-w-0">
                                    <h4 class="font-bold text-slate-800 truncate">${lesson.title}</h4>
                                    <p class="text-xs text-slate-500">Doporučená další lekce</p>
                                </div>
                                <div class="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                                    </svg>
                                </div>
                            </div>
                        `)}
                    </div>
                </section>
                ` : nothing}

            </div>
        `;
    }

    _getGroupIcon(groupName) {
        // Simple heuristic for icon based on name
        const lower = (groupName || '').toLowerCase();
        if (lower.includes('mat')) return '📐';
        if (lower.includes('fyz')) return '⚡';
        if (lower.includes('chem')) return '🧪';
        if (lower.includes('bio')) return '🧬';
        if (lower.includes('díj') || lower.includes('his')) return '🏛️';
        if (lower.includes('zem')) return '🌍';
        if (lower.includes('ang') || lower.includes('jaz')) return '🗣️';
        if (lower.includes('prog') || lower.includes('inf')) return '💻';
        return '🎓';
    }
}
customElements.define('student-dashboard-view', StudentDashboardView);

import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';

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
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.unsubscribes.forEach(unsub => unsub());
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
        const className = prompt("Zadejte název nové třídy:", "Např. Pokročilá Analýza Dat");
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
                showToast("Třída byla úspěšně vytvořena.");
            } catch (error) {
                console.error("Error creating class:", error);
                showToast("Chyba při vytváření třídy.", true);
            }
        }
    }

    _copyJoinCode(e, joinCode) {
        e.stopPropagation();
        if (!joinCode) {
            showToast('Kód není k dispozici.', true);
            return;
        }
        navigator.clipboard.writeText(joinCode).then(() => {
            showToast('Kód zkopírován do schránky!');
        }, () => {
            showToast('Nepodařilo se zkopírovat kód.', true);
        });
    }

    render() {
        if (this._isLoading) {
            return html`
                <div class="flex flex-col justify-center items-center h-full space-y-4">
                    <div class="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p class="text-sm font-medium text-slate-400 animate-pulse">Načítám váš přehled...</p>
                </div>
            `;
        }

        const userName = firebaseInit.auth.currentUser?.displayName || 'Profesore';

        return html`
            <div class="h-full bg-slate-50 overflow-y-auto font-['Plus_Jakarta_Sans'] p-6 lg:p-10">

                <!-- Header Section -->
                <div class="max-w-7xl mx-auto mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
                     <div>
                        <h1 class="text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
                            Vítejte zpět, <span class="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">${userName}</span>
                        </h1>
                        <p class="text-slate-500 text-lg">Máte <span class="font-bold text-slate-700">${this._stats.activeLessons} aktivních lekcí</span> a <span class="font-bold text-slate-700">${this._stats.totalStudents} studentů</span>.</p>
                    </div>
                     <div class="flex gap-3">
                        <button @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'editor', lesson: null }, bubbles: true, composed: true }))} 
                            class="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:shadow-indigo-300 hover:-translate-y-0.5 transition-all flex items-center">
                            <span class="text-xl mr-2">+</span> Nová Lekce
                        </button>
                    </div>
                </div>

                <div class="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">

                    <!-- LEFT COLUMN: Main Content (8 cols) -->
                    <div class="lg:col-span-8 space-y-10">

                        <!-- Quick Stats Row -->
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
                            ${this._renderStatCard("Vaši Studenti", this._stats.totalStudents, "users", "students", "bg-blue-50 text-blue-600")}
                            ${this._renderStatCard("Aktivní Třídy", this._stats.totalClasses, "briefcase", "classes", "bg-emerald-50 text-emerald-600")}
                            ${this._renderStatCard("Knihovna Lekcí", this._stats.totalLessons, "book", "timeline", "bg-purple-50 text-purple-600")}
                        </div>

                        <!-- Recent Classes Section -->
                        <div>
                            <div class="flex items-center justify-between mb-6">
                                <h2 class="text-xl font-bold text-slate-800">Moje Třídy</h2>
                                <button @click=${this._handleCreateClass} class="text-sm font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors">
                                    + Vytvořit třídu
                                </button>
                            </div>
                            
                            <div class="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                                ${this._classes.length > 0
                ? html`
                                        <div class="divide-y divide-slate-100">
                                            ${this._classes.map(cls => this._renderClassRow(cls))}
                                        </div>
                                    `
                : this._renderEmptyState()
            }
                            </div>
                        </div>

                    </div>

                    <!-- RIGHT COLUMN: Sidebar / Actions (4 cols) -->
                    <div class="lg:col-span-4 space-y-8">

                        <!-- Quick Actions Card -->
                        <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                            <h3 class="font-bold text-slate-800 mb-4">Rychlé Akce</h3>
                            <div class="space-y-3">
                                <button @click=${this._handleCreateClass} class="w-full text-left p-3 rounded-xl hover:bg-slate-50 flex items-center group transition-colors">
                                    <div class="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                                    </div>
                                    <div>
                                        <div class="font-bold text-slate-700 text-sm">Vytvořit novou třídu</div>
                                        <div class="text-xs text-slate-400">Přidat skupinu studentů</div>
                                    </div>
                                </button>

                                <button @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'editor', lesson: null }, bubbles: true, composed: true }))} 
                                    class="w-full text-left p-3 rounded-xl hover:bg-slate-50 flex items-center group transition-colors">
                                    <div class="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center mr-3 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                                    </div>
                                    <div>
                                        <div class="font-bold text-slate-700 text-sm">AI Generátor Lekcí</div>
                                        <div class="text-xs text-slate-400">Vytvořit z PDF materiálů</div>
                                    </div>
                                </button>
                            </div>
                        </div>

                        <!-- Tips / Updates Card -->
                        <div class="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 text-white shadow-lg shadow-indigo-200 relative overflow-hidden">
                            <div class="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full translate-x-1/3 -translate-y-1/3 blur-2xl"></div>
                            
                            <h3 class="font-bold text-lg mb-2 relative z-10">Tip pro vás</h3>
                            <p class="text-indigo-100 text-sm mb-4 relative z-10">Vyzkoušejte novou funkci <span class="font-bold text-white">Komiksový Editor</span>! Vysvětlete složité koncepty zábavnou formou.</p>
                            
                            <button @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'editor', lesson: null }, bubbles: true, composed: true }))} 
                                class="w-full py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg text-sm font-bold transition-colors relative z-10 border border-white/10">
                                Vyzkoušet
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        `;
    }

    // Modern Stat Card
    _renderStatCard(title, value, iconName, targetView, colorClass) {
        const icons = {
            "users": "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
            "briefcase": "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
            "book": "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        };
        const d = icons[iconName] || icons["users"];
        const displayValue = (value !== undefined && value !== null) ? value : 0;

        return html`
            <div @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: targetView }, bubbles: true, composed: true }))}
                 class="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer group">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-2xl ${colorClass} flex items-center justify-center">
                         <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${d}"></path></svg>
                    </div>
                    <div class="text-slate-300 group-hover:text-indigo-500 transition-colors">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </div>
                </div>
                <div>
                    <p class="text-3xl font-extrabold text-slate-900 tracking-tight">${displayValue}</p>
                    <p class="text-sm font-bold text-slate-400 mt-1">${title}</p>
                </div>
            </div>
        `;
    }

    // Clean List Row for Classes
    _renderClassRow(cls) {
        const studentCount = cls.studentIds ? cls.studentIds.length : 0;
        const name = cls.name || 'Bezejmenná třída';
        const joinCode = cls.joinCode || '---';

        return html`
            <div @click=${() => this._navigateToClassDetail(cls.id)} class="group flex items-center justify-between p-5 hover:bg-slate-50 cursor-pointer transition-colors">
                <div class="flex items-center space-x-4">
                    <div class="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xl group-hover:bg-white group-hover:shadow-sm transition-all border border-slate-200 group-hover:border-indigo-200 group-hover:text-indigo-600">
                        ${name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 class="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">${name}</h3>
                        <div class="flex items-center mt-1 space-x-3">
                            <span class="text-xs font-medium text-slate-500 flex items-center">
                                <svg class="w-3.5 h-3.5 mr-1.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                                ${studentCount} studentů
                            </span>
                             <span class="text-xs text-slate-300">|</span>
                             <span class="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                ${joinCode}
                             </span>
                        </div>
                    </div>
                </div>

                <div class="flex items-center">
                    <button @click=${(e) => this._copyJoinCode(e, joinCode)} class="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 mr-2" title="Zkopírovat kód">
                         <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    </button>
                    <div class="text-slate-300 group-hover:translate-x-1 transition-transform">
                         <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </div>
                </div>
            </div>
        `;
    }

    _renderEmptyState() {
        return html`
            <div class="p-12 text-center flex flex-col items-center justify-center">
                <div class="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 border border-slate-100">
                    <svg class="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                </div>
                <h3 class="text-slate-900 font-bold text-xl mb-2">Zatím žádné třídy</h3>
                <p class="text-slate-500 text-sm max-w-xs mx-auto mb-8">Vytvořte svou první třídu a začněte zvát studenty do světa AI výuky.</p>
                <button @click=${this._handleCreateClass} class="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all hover:-translate-y-0.5">
                    Vytvořit první třídu
                </button>
            </div>
        `;
    }
}
customElements.define('professor-dashboard-view', ProfessorDashboardView);

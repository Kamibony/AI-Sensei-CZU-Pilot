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
        const user = firebaseInit.auth.currentUser;
        if (!user) return;

        this._isLoading = true;

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
    }

    get _stats() {
        const totalStudents = new Set(this._classes.flatMap(c => c.studentIds || [])).size;
        const activeLessons = this._lessons.filter(l => l.assignedToGroups && l.assignedToGroups.length > 0).length;
        const totalClasses = this._classes.length;
        return { totalStudents, activeLessons, totalClasses };
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
            return html`<div class="flex justify-center items-center h-full"><p class="text-xl text-slate-400 animate-pulse">Načítám dashboard...</p></div>`;
        }

        const userName = firebaseInit.auth.currentUser?.displayName || 'Profesore';

        return html`
            <div class="h-full bg-slate-50 overflow-y-auto font-['Plus_Jakarta_Sans'] p-4 lg:p-8">

                <!-- Header Section -->
                <div class="max-w-[1600px] mx-auto mb-10 flex flex-col md:flex-row md:items-end justify-between">
                     <div>
                        <h1 class="text-3xl font-bold text-slate-900 tracking-tight mb-1">Dobré ráno, ${userName}</h1>
                        <p class="text-slate-500">Váš přehled výuky je aktuální.</p>
                    </div>
                     <div class="mt-4 md:mt-0">
                        <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                            <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2"></span>
                            Systém je online
                        </span>
                    </div>
                </div>

                <div class="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">

                    <!-- LEFT COLUMN: The Office (70%) -->
                    <div class="lg:col-span-8 space-y-8">

                        <!-- Section: Management Stats (Bento Grid) -->
                        <div>
                            <h2 class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4 pl-1">Přehled Managementu</h2>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                ${this._renderStatCard("Studenti", this._stats.totalStudents, "users")}
                                ${this._renderStatCard("Třídy", this._stats.totalClasses, "briefcase")}
                                ${this._renderStatCard("Aktivity", "12", "activity")} <!-- Placeholder for more stats -->
                            </div>
                        </div>

                        <!-- Section: Classes List -->
                        <div id="classes-section">
                             <div class="flex items-center justify-between mb-4 pl-1">
                                <h2 class="text-lg font-bold text-slate-900">Vaše Třídy</h2>
                                <button @click=${this._handleCreateClass} class="text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors flex items-center">
                                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                                    Nová třída
                                </button>
                            </div>

                            <div class="bg-white border border-slate-100 rounded-2xl shadow-sm shadow-slate-200/50 overflow-hidden">
                                ${this._classes.length === 0 ? this._renderEmptyState() : html`
                                    <div class="divide-y divide-slate-50">
                                        ${this._classes.map(cls => this._renderClassRow(cls))}
                                    </div>
                                `}
                            </div>
                        </div>

                    </div>

                    <!-- RIGHT COLUMN: The Studio (30%) -->
                    <div class="lg:col-span-4 space-y-6">

                        <h2 class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">Creative Studio</h2>

                        <!-- Action Card: Create Lesson -->
                         <div @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'editor', lesson: null }, bubbles: true, composed: true }))}
                             class="group relative overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-600 rounded-3xl shadow-xl shadow-indigo-500/20 cursor-pointer transition-all duration-300 hover:shadow-indigo-500/40 hover:-translate-y-1 min-h-[240px] flex flex-col justify-between p-8">

                            <!-- Decorative Blob -->
                            <div class="absolute top-0 right-0 w-40 h-40 bg-white opacity-10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

                            <div class="relative z-10">
                                <div class="w-12 h-12 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl flex items-center justify-center mb-4 shadow-inner">
                                    <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                                </div>
                                <h3 class="text-2xl font-bold text-white tracking-tight">Start New Lesson</h3>
                                <p class="text-indigo-100 text-sm mt-2 leading-relaxed opacity-90">Využijte AI k vytvoření interaktivních materiálů, testů a prezentací během sekund.</p>
                            </div>

                            <div class="relative z-10 flex items-center text-white text-sm font-bold mt-4 group-hover:translate-x-1 transition-transform">
                                Otevřít Editor <svg class="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                            </div>
                        </div>

                        <!-- Stat: Active Lessons -->
                         <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm shadow-slate-200/50 flex items-center justify-between">
                            <div>
                                <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Publikované Lekce</p>
                                <p class="text-3xl font-bold text-slate-800 mt-1">${this._stats.activeLessons}</p>
                            </div>
                            <div class="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        `;
    }

    // Bento Grid Stat Card
    _renderStatCard(title, value, iconName) {
        const icons = {
            "users": "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
            "briefcase": "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
            "activity": "M13 10V3L4 14h7v7l9-11h-7z"
        };
        const d = icons[iconName] || icons["users"];
        const displayValue = (value !== undefined && value !== null) ? value : 0;

        return html`
            <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm shadow-slate-200/50 flex flex-col justify-between h-32 hover:shadow-md transition-shadow">
                <div class="flex justify-between items-start">
                    <div class="text-slate-400">
                         <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${d}"></path></svg>
                    </div>
                </div>
                <div>
                    <p class="text-2xl font-bold text-slate-800">${displayValue}</p>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">${title}</p>
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
                    <div class="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-lg group-hover:bg-white group-hover:shadow-sm transition-all">
                        ${name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 class="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">${name}</h3>
                        <div class="flex items-center mt-1 space-x-2">
                            <span class="text-xs text-slate-500 flex items-center">
                                <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                                ${studentCount} studentů
                            </span>
                             <span class="text-xs text-slate-300">|</span>
                             <span class="text-xs text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                                ${joinCode}
                             </span>
                        </div>
                    </div>
                </div>

                <div class="flex items-center">
                    <button @click=${(e) => this._copyJoinCode(e, joinCode)} class="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-all opacity-0 group-hover:opacity-100 mr-2" title="Zkopírovat kód">
                         <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
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
                <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <svg class="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                </div>
                <h3 class="text-slate-900 font-semibold text-lg">Zatím žádné třídy</h3>
                <p class="text-slate-500 text-sm mt-1 max-w-xs">Začněte vytvořením své první třídy pro správu studentů.</p>
                <button @click=${this._handleCreateClass} class="mt-6 text-indigo-600 font-bold text-sm hover:underline">Vytvořit první třídu</button>
            </div>
        `;
    }
}
customElements.define('professor-dashboard-view', ProfessorDashboardView);

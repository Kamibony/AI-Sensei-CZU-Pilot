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
            return html`<div class="flex justify-center items-center h-full"><p class="text-xl text-slate-500">Načítám dashboard...</p></div>`;
        }

        const userName = firebaseInit.auth.currentUser?.displayName || 'Profesore';

        return html`
            <div class="h-full bg-slate-50 overflow-y-auto font-['Plus_Jakarta_Sans']">
                <!-- Modern Header with Pattern -->
                <header class="bg-white border-b border-slate-100 relative overflow-hidden">
                     <div class="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-gradient-to-br from-green-100 to-transparent rounded-full opacity-50 blur-3xl"></div>

                    <div class="max-w-7xl mx-auto px-8 py-10 relative z-10">
                        <div class="flex flex-col md:flex-row md:items-center md:justify-between">
                            <div>
                                <h1 class="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">Vítejte zpět, ${userName}</h1>
                                <p class="text-slate-500 mt-2 text-lg">Máte před sebou skvělý den pro výuku.</p>
                            </div>
                            <div class="mt-6 md:mt-0 flex space-x-3">
                                <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                                    <span class="w-2 h-2 bg-green-500 rounded-full mr-2"></span> Online
                                </span>
                            </div>
                        </div>
                    </div>
                </header>

                <div class="max-w-7xl mx-auto p-8">

                    <!-- Main Grid Layout: Management (Left) vs Creative (Right) -->
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">

                        <!-- LEFT COLUMN: Management Overview (2/3 width) -->
                        <div class="lg:col-span-2 space-y-10">

                            <!-- Management Stats -->
                            <div>
                                <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Management Overview</h2>
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    ${this._renderStatCard("Počet studentů", this._stats.totalStudents, "users")}
                                    ${this._renderStatCard("Celkem tříd", this._stats.totalClasses, "briefcase")}
                                </div>
                            </div>

                            <!-- My Classes Section -->
                            <div id="classes-section">
                                <div class="flex items-center justify-between mb-6">
                                    <div>
                                        <h2 class="text-xl font-bold text-slate-900">Vaše Třídy</h2>
                                        <p class="text-slate-500 text-sm mt-1">Spravujte studenty a skupiny.</p>
                                    </div>
                                    <button @click=${this._handleCreateClass} class="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg px-4 py-2 shadow-sm transition-all flex items-center gap-2">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                                        <span class="font-semibold text-sm">Nová třída</span>
                                    </button>
                                </div>
                                ${this._classes.length === 0 ? this._renderEmptyState() : this._renderClassGrid()}
                            </div>
                        </div>


                        <!-- RIGHT COLUMN: Creative Studio (1/3 width) -->
                        <div class="lg:col-span-1 space-y-8">
                             <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Creative Studio</h2>

                            <!-- Hero Card: New Lesson -->
                            <div @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'editor', lesson: null }, bubbles: true, composed: true }))}
                                 class="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl shadow-xl cursor-pointer group transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">

                                <!-- Decorative Background Elements -->
                                <div class="absolute top-0 right-0 w-32 h-32 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-20"></div>
                                <div class="absolute -bottom-8 -left-8 w-32 h-32 bg-purple-400 rounded-full mix-blend-overlay filter blur-3xl opacity-20"></div>

                                <div class="relative p-8 h-full flex flex-col justify-between min-h-[300px]">
                                    <div>
                                        <div class="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-6 border border-white/10 shadow-inner">
                                             <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                        </div>
                                        <h3 class="text-2xl font-bold text-white leading-tight">Vytvořit novou lekci s AI</h3>
                                        <p class="text-indigo-100 mt-4 text-sm leading-relaxed">Spustit průvodce tvorbou obsahu a generovat materiály během sekund.</p>
                                    </div>

                                    <div class="mt-8 flex items-center text-white font-semibold group-hover:translate-x-2 transition-transform">
                                        <span>Spustit Editor</span>
                                        <svg class="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                                    </div>
                                </div>
                            </div>

                             <!-- Stats: Active Lessons (Moved here for context) -->
                             ${this._renderStatCard("Aktivní lekce", this._stats.activeLessons, "book-open")}

                        </div>

                    </div>
                </div>
            </div>
        `;
    }

    _renderStatCard(title, value, iconName) {
        const icons = {
            "users": "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
            "book-open": "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
            "briefcase": "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        };
        // Fallback icon (book icon) if iconName is invalid or missing
        const d = icons[iconName] || "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253";

        // Fallback for value (e.g., 0)
        const displayValue = (value !== undefined && value !== null) ? value : 0;

        return html`
            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
                <div class="bg-slate-50 p-3 rounded-full">
                    <svg class="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${d}"></path></svg>
                </div>
                <div>
                    <p class="text-slate-500 text-sm font-medium">${title}</p>
                    <p class="text-2xl font-bold text-slate-800">${displayValue}</p>
                </div>
            </div>
        `;
    }

    _renderClassGrid() {
        return html`
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${this._classes.map(cls => this._renderClassCard(cls))}
            </div>
        `;
    }

    _renderClassCard(cls) {
        const studentCount = cls.studentIds ? cls.studentIds.length : 0;
        const name = cls.name || 'Bezejmenná třída';
        const joinCode = cls.joinCode || '---';

        return html`
            <div @click=${() => this._navigateToClassDetail(cls.id)}
                 class="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col justify-between border border-slate-100">
                <div>
                    <h3 class="text-xl font-bold text-slate-800 truncate">${name}</h3>
                    <div class="mt-4 flex items-center justify-between bg-slate-50 p-2 rounded-lg">
                        <span class="text-sm text-slate-500 pl-2">Kód:</span>
                        <div class="flex items-center">
                            <strong class="text-lg font-mono text-slate-700 px-2">${joinCode}</strong>
                            <button @click=${(e) => this._copyJoinCode(e, joinCode)} class="p-1.5 rounded-md hover:bg-slate-200 transition-colors" title="Zkopírovat kód">
                               <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="mt-6 pt-4 border-t border-slate-100 flex items-center justify-start space-x-2">
                    <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    <span class="text-slate-600 font-medium">${studentCount} ${studentCount === 1 ? 'Student' : 'Studentů'}</span>
                </div>
            </div>
        `;
    }

    _renderEmptyState() {
        return html`
            <div class="text-center p-12 bg-white rounded-xl shadow-sm border border-slate-100 border-dashed">
                <div class="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                </div>
                <h3 class="text-xl font-semibold text-slate-700">Zatím nemáte žádné třídy</h3>
                <p class="text-slate-500 mt-2 max-w-sm mx-auto">Vytvořte svou první třídu pro správu studentů a lekcí.</p>
                <button @click=${this._handleCreateClass} class="mt-6 bg-green-600 hover:bg-green-700 text-white rounded-lg px-6 py-2 shadow-sm transition-colors">
                    Vytvořit první třídu
                </button>
            </div>
        `;
    }
}
customElements.define('professor-dashboard-view', ProfessorDashboardView);

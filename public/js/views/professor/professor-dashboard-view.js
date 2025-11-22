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

                <div class="max-w-7xl mx-auto p-8 space-y-10">

                    <!-- Bento Grid Layout for Actions -->
                    <div class="grid grid-cols-1 md:grid-cols-12 gap-6">

                        <!-- Large Action Card: Nová Lekce (Span 6) -->
                         <div @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'editor', lesson: null }, bubbles: true, composed: true }))}
                             class="md:col-span-6 relative overflow-hidden bg-slate-900 rounded-3xl shadow-xl cursor-pointer group transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                            <div class="absolute top-0 right-0 w-64 h-64 bg-green-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
                            <div class="absolute -bottom-8 -left-8 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>

                            <div class="relative p-8 h-full flex flex-col justify-between z-10">
                                <div>
                                    <div class="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-4 border border-white/10">
                                         <svg class="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                                    </div>
                                    <h3 class="text-2xl font-bold text-white">Vytvořit Novou Lekci</h3>
                                    <p class="text-slate-400 mt-2">Použijte editor pro vytvoření interaktivního obsahu pro studenty.</p>
                                </div>
                                <div class="flex justify-end">
                                     <span class="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white group-hover:scale-110 transition-transform shadow-lg shadow-green-500/30">
                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                                     </span>
                                </div>
                            </div>
                        </div>

                        <!-- Medium Action: Moje Třídy (Span 3) -->
                        <div @click=${() => {
                                const el = this.querySelector('#classes-section');
                                if (el) el.scrollIntoView({ behavior: 'smooth' });
                             }}
                             class="md:col-span-3 bg-white rounded-3xl shadow-sm border border-slate-100 p-6 cursor-pointer group hover:border-blue-200 hover:shadow-md transition-all">
                             <div class="h-full flex flex-col justify-between">
                                <div>
                                    <div class="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                                        <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                                    </div>
                                    <h3 class="text-lg font-bold text-slate-800">Moje Třídy</h3>
                                </div>
                                <div class="mt-4">
                                    <span class="text-sm font-semibold text-blue-600 group-hover:underline">Spravovat třídy &rarr;</span>
                                </div>
                             </div>
                        </div>

                        <!-- Medium Action: Knihovna (Span 3) -->
                        <div @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'media' }, bubbles: true, composed: true }))}
                             class="md:col-span-3 bg-white rounded-3xl shadow-sm border border-slate-100 p-6 cursor-pointer group hover:border-purple-200 hover:shadow-md transition-all">
                             <div class="h-full flex flex-col justify-between">
                                <div>
                                    <div class="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-purple-100 transition-colors">
                                        <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                    </div>
                                    <h3 class="text-lg font-bold text-slate-800">Knihovna</h3>
                                </div>
                                <div class="mt-4">
                                    <span class="text-sm font-semibold text-purple-600 group-hover:underline">Otevřít soubory &rarr;</span>
                                </div>
                             </div>
                        </div>
                    </div>

                    <!-- Stats Section - Minimalist -->
                    <div>
                        <h2 class="text-lg font-bold text-slate-400 uppercase tracking-wider mb-4 ml-1">Statistiky</h2>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            ${this._renderStatCard("Počet studentů", this._stats.totalStudents, "users")}
                            ${this._renderStatCard("Aktivní lekce", this._stats.activeLessons, "book-open")}
                            ${this._renderStatCard("Celkem tříd", this._stats.totalClasses, "briefcase")}
                        </div>
                    </div>

                    <!-- Class Grid (Preserved Functionality) -->
                    <div id="classes-section" class="pt-8 border-t border-slate-100">
                        <div class="flex items-center justify-between mb-8">
                            <div>
                                <h2 class="text-2xl font-bold text-slate-900">Vaše Třídy</h2>
                                <p class="text-slate-500 text-sm mt-1">Spravujte studenty a obsah pro jednotlivé skupiny.</p>
                            </div>
                            <button @click=${this._handleCreateClass} class="bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-5 py-3 shadow-lg shadow-slate-200 transition-all flex items-center gap-2 transform hover:-translate-y-0.5">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                                <span class="font-semibold">Nová třída</span>
                            </button>
                        </div>
                        ${this._classes.length === 0 ? this._renderEmptyState() : this._renderClassGrid()}
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

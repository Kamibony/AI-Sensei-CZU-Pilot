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

        return html`
            <div class="h-full bg-slate-50 overflow-y-auto">
                <!-- Header -->
                <header class="bg-white p-6 border-b border-slate-200">
                    <h1 class="text-3xl font-extrabold text-slate-800">Command Center</h1>
                    <p class="text-slate-500 mt-1">Spravujte své třídy a studenty z jednoho místa.</p>
                </header>

                <!-- Stats Bar -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
                    ${this._renderStatCard("Total Students", this._stats.totalStudents, "users")}
                    ${this._renderStatCard("Active Lessons", this._stats.activeLessons, "book-open")}
                    ${this._renderStatCard("Total Classes", this._stats.totalClasses, "briefcase")}
                </div>

                <!-- Class Grid -->
                <div class="px-6 pb-6">
                    <h2 class="text-2xl font-bold text-slate-700 mb-4">Vaše Třídy</h2>
                    ${this._classes.length === 0 ? this._renderEmptyState() : this._renderClassGrid()}
                </div>

                <!-- FAB Quick Actions -->
                <div class="fixed bottom-8 right-8 flex flex-col items-center space-y-4">
                     <button @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'media' }, bubbles: true, composed: true }))} class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-3 rounded-full shadow-lg transition transform hover:scale-110">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                    </button>
                    <button @click=${this._handleCreateClass} class="bg-green-700 hover:bg-green-800 text-white font-bold py-4 px-4 rounded-full shadow-lg transition transform hover:scale-110">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    </button>
                </div>
            </div>
        `;
    }

    _renderStatCard(title, value, icon) {
        return html`
            <div class="bg-white p-6 rounded-2xl shadow-lg flex items-center space-x-4">
                <div class="bg-green-100 p-3 rounded-full">
                    <svg class="w-6 h-6 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="..."></path></svg>
                </div>
                <div>
                    <p class="text-slate-500 text-sm font-medium">${title}</p>
                    <p class="text-3xl font-bold text-slate-800">${value}</p>
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
        return html`
            <div @click=${() => this._navigateToClassDetail(cls.id)}
                 class="bg-white p-6 rounded-2xl shadow-lg hover:shadow-2xl transition-shadow cursor-pointer flex flex-col justify-between">
                <div>
                    <h3 class="text-xl font-bold text-slate-800 truncate">${cls.name}</h3>
                    <div class="mt-4 flex items-center justify-between">
                        <span class="text-sm text-slate-500">Kód pro připojení:</span>
                        <div class="flex items-center">
                            <strong class="text-lg font-mono bg-slate-100 text-slate-700 px-3 py-1 rounded-md">${cls.joinCode}</strong>
                            <button @click=${(e) => this._copyJoinCode(e, cls.joinCode)} class="ml-2 p-2 rounded-full hover:bg-slate-200">
                               <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="mt-6 pt-4 border-t border-slate-100 flex items-center justify-start space-x-2">
                    <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    <span class="text-slate-600 font-semibold">${studentCount} ${studentCount === 1 ? 'Student' : 'Studentů'}</span>
                </div>
            </div>
        `;
    }

    _renderEmptyState() {
        return html`
            <div class="text-center p-12 bg-white rounded-2xl shadow-lg">
                <h3 class="text-xl font-semibold text-slate-700">Zatím nemáte žádné třídy</h3>
                <p class="text-slate-500 mt-2">Klikněte na zelené tlačítko pro vytvoření vaší první třídy a začněte přidávat studenty.</p>
            </div>
        `;
    }
}
customElements.define('professor-dashboard-view', ProfessorDashboardView);

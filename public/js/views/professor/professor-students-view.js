// public/js/views/professor/professor-students-view.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';

export class ProfessorStudentsView extends LitElement {
    static properties = {
        _students: { state: true, type: Array },
        _isLoading: { state: true, type: Boolean },
    };

    constructor() {
        super();
        this._students = [];
        this._isLoading = true;
        this.studentsUnsubscribe = null;
    }

    createRenderRoot() { return this; } // Light DOM

    connectedCallback() {
        super.connectedCallback();
        this._listenForStudents();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.studentsUnsubscribe) {
            this.studentsUnsubscribe();
            this.studentsUnsubscribe = null;
        }
    }

    _listenForStudents() {
        this._isLoading = true;
        const q = query(collection(firebaseInit.db, 'students'), orderBy("createdAt", "desc"));

        if (this.studentsUnsubscribe) this.studentsUnsubscribe(); // Zastavíme predchádzajúci listener

        this.studentsUnsubscribe = onSnapshot(q, (querySnapshot) => {
            this._students = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this._isLoading = false;
        }, (error) => {
            console.error("Error fetching students:", error);
            showToast("Nepodařilo se načíst studenty.", true);
            this._isLoading = false;
            this._students = []; // V prípade chyby zobrazíme prázdny zoznam
        });
    }

    _navigateToProfile(studentId) {
        this.dispatchEvent(new CustomEvent('navigate-to-profile', {
            detail: { studentId: studentId },
            bubbles: true,
            composed: true
        }));
    }

    renderStudentRow(student) {
        return html`
            <div class="student-row flex items-center justify-between p-4 border-b border-slate-100 hover:bg-slate-50 cursor-pointer" 
                 data-student-id="${student.id}"
                 @click=${() => this._navigateToProfile(student.id)}>
                <div>
                    <p class="text-slate-800 font-semibold">${student.name || 'Jméno neuvedeno'}</p>
                    <p class="text-sm text-slate-500">${student.email}</p>
                </div>
                <div class="flex items-center space-x-4">
                    <span class="text-xs font-medium px-2 py-1 rounded-full ${student.telegramChatId ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'}">
                        ${student.telegramChatId ? 'Telegram připojen' : 'Telegram nepřipojen'}
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
            </div>
        `;
    }

    render() {
        let content;
        if (this._isLoading) {
            content = html`<p class="text-center p-8 text-slate-400">Načítám studenty...</p>`;
        } else if (this._students.length === 0) {
            content = html`<p class="text-center p-8 text-slate-500">Zatím se nezaregistroval žádný student.</p>`;
        } else {
            content = html`<div class="divide-y divide-slate-100">${this._students.map(student => this.renderStudentRow(student))}</div>`;
        }

        return html`
            <header class="text-center p-6 border-b border-slate-200 bg-white">
                <h1 class="text-3xl font-extrabold text-slate-800">Studenti</h1>
                <p class="text-slate-500 mt-1">Kliknutím na studenta zobrazíte jeho detailní profil.</p>
            </header>
            <div class="flex-grow overflow-y-auto p-4 md:p-6">
                <div id="students-list-container" class="bg-white p-6 rounded-2xl shadow-lg">
                    ${content}
                </div>
            </div>
        `;
    }
}

customElements.define('professor-students-view', ProfessorStudentsView);

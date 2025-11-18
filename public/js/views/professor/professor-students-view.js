// public/js/views/professor/professor-students-view.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, query, where, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';

export class ProfessorStudentsView extends LitElement {
    static properties = {
        _students: { state: true, type: Array },
        _isLoading: { state: true, type: Boolean },
        _searchTerm: { state: true, type: String },
    };

    constructor() {
        super();
        this._students = [];
        this._isLoading = true;
        this._searchTerm = '';
        this._unsubscribeListeners = [];
        this._studentData = new Map();
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._initializeListeners();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._unsubscribeListeners.forEach(item => item.unsub());
    }

    _createBatchedStudentListeners(groupIds) {
        this._unsubscribeByIds('students'); // Clear previous student listeners
        this._studentData.clear();

        if (groupIds.length === 0) {
            this._students = [];
            this._isLoading = false;
            this.requestUpdate();
            return;
        }

        const BATCH_SIZE = 30;
        for (let i = 0; i < groupIds.length; i += BATCH_SIZE) {
            const batch = groupIds.slice(i, i + BATCH_SIZE);
            const studentsQuery = query(
                collection(firebaseInit.db, 'students'),
                where("memberOfGroups", "array-contains-any", batch)
            );

            const unsub = onSnapshot(studentsQuery, (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === "removed") {
                        this._studentData.delete(change.doc.id);
                    } else {
                        this._studentData.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
                    }
                });
                this._students = Array.from(this._studentData.values());
                this._isLoading = false;
            }, (error) => {
                console.error("Error fetching students batch:", error);
                showToast("Nepodařilo se načíst část studentů.", true);
            });
            this._unsubscribeListeners.push({ id: 'students', unsub });
        }
    }

    _unsubscribeByIds(id) {
        const newUnsubscribes = [];
        this._unsubscribeListeners.forEach(item => {
            if (item.id === id) {
                item.unsub();
            } else {
                newUnsubscribes.push(item);
            }
        });
        this._unsubscribeListeners = newUnsubscribes;
    }

    _initializeListeners() {
        this._isLoading = true;
        const currentUser = firebaseInit.auth.currentUser;
        if (!currentUser) return;

        const groupsQuery = query(collection(firebaseInit.db, 'groups'), where("ownerId", "==", currentUser.uid));

        const unsubGroups = onSnapshot(groupsQuery, (groupsSnapshot) => {
            const groupIds = groupsSnapshot.docs.map(doc => doc.id);
            this._createBatchedStudentListeners(groupIds);
        }, (error) => {
            console.error("Error fetching professor's groups:", error);
            showToast("Chyba při načítání skupin profesora.", true);
            this._isLoading = false;
        });
        this._unsubscribeListeners.push({ id: 'groups', unsub: unsubGroups });
    }

    _navigateToProfile(studentId) {
        this.dispatchEvent(new CustomEvent('navigate-to-profile', {
            detail: { studentId: studentId },
            bubbles: true,
            composed: true
        }));
    }

    _handleSearchInput(e) {
        this._searchTerm = e.target.value.toLowerCase();
    }

    get _filteredStudents() {
        if (!this._searchTerm) {
            return this._students;
        }
        return this._students.filter(student =>
            (student.name?.toLowerCase() || '').includes(this._searchTerm) ||
            (student.email?.toLowerCase() || '').includes(this._searchTerm)
        );
    }

    renderStudentCard(student) {
        const initials = (student.name || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const avatarBgColor = this._getAvatarColor(student.id);

        return html`
            <div class="student-card bg-white rounded-xl shadow-md overflow-hidden transition-shadow duration-200 hover:shadow-lg cursor-pointer border border-slate-200"
                 @click=${() => this._navigateToProfile(student.id)}>
                <div class="p-5 flex items-center space-x-4">
                    <div class="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg ${avatarBgColor}">
                        ${initials}
                    </div>
                    <div class="flex-grow min-w-0">
                         <p class="text-lg font-semibold text-slate-800 truncate" title="${student.name || 'Jméno neuvedeno'}">${student.name || 'Jméno neuvedeno'}</p>
                         <p class="text-sm text-slate-500 truncate" title="${student.email}">${student.email}</p>
                    </div>
                     <div class="flex-shrink-0">
                          <span class="text-xs font-medium px-2.5 py-1 rounded-full ${student.telegramChatId ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'}">
                              ${student.telegramChatId ? 'Telegram ✓' : 'Telegram ✕'}
                          </span>
                     </div>
                </div>
                 </div>
        `;
    }

    _getAvatarColor(id) {
        const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500'];
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = id.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash % colors.length);
        return colors[index];
    }

    render() {
        const filteredStudents = this._filteredStudents;
        let content;

        if (this._isLoading) {
            content = html`<p class="text-center p-8 text-slate-400">Načítám studenty...</p>`;
        } else if (this._students.length === 0) {
            content = html`<p class="text-center p-8 text-slate-500">Zatím se nezaregistroval žádný student.</p>`;
        } else if (filteredStudents.length === 0) {
             content = html`<p class="text-center p-8 text-slate-500">Nebyly nalezeny žádné odpovídající studenti.</p>`;
        } else {
            content = html`
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${filteredStudents.map(student => this.renderStudentCard(student))}
                </div>`;
        }

        return html`
            <header class="text-center p-6 border-b border-slate-200 bg-white">
                <h1 class="text-3xl font-extrabold text-slate-800">Studenti</h1>
                <p class="text-slate-500 mt-1">Přehled registrovaných studentů v kurzu.</p>
            </header>
            <div class="flex-grow overflow-y-auto p-4 md:p-6">
                <div class="mb-6 max-w-md mx-auto">
                    <input type="search"
                           placeholder="Hledat studenta (jméno, email)..."
                           .value=${this._searchTerm}
                           @input=${this._handleSearchInput}
                           class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                 </div>

                <div id="students-list-container">
                    ${content}
                </div>
            </div>
        `;
    }
}

customElements.define('professor-students-view', ProfessorStudentsView);

import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, onSnapshot, collection, query, where, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';

export class ProfessorClassDetailView extends LitElement {
    static properties = {
        groupId: { type: String },
        _group: { state: true },
        _students: { state: true, type: Array },
        _lessons: { state: true, type: Array },
        _activeTab: { state: true, type: String },
        _isLoading: { state: true, type: Boolean },
    };

    constructor() {
        super();
        this.groupId = '';
        this._group = null;
        this._students = [];
        this._lessons = [];
        this._activeTab = 'curriculum'; // Default to the magic tab
        this._isLoading = true;
        this.unsubscribes = [];
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        if (this.groupId) {
            this._fetchData();
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.unsubscribes.forEach(unsub => unsub());
    }

    _fetchData() {
        const user = firebaseInit.auth.currentUser;
        if (!user || !this.groupId) return;

        this._isLoading = true;

        // Fetch Group Details
        const groupDocRef = doc(firebaseInit.db, 'groups', this.groupId);
        const groupUnsubscribe = onSnapshot(groupDocRef, (doc) => {
            if (doc.exists()) {
                this._group = { id: doc.id, ...doc.data() };
                this._fetchStudents(doc.data().studentIds || []);
            } else {
                console.error("Group not found");
                this._isLoading = false;
            }
        });
        this.unsubscribes.push(groupUnsubscribe);

        // Fetch Professor's Lessons
        const lessonsQuery = query(collection(firebaseInit.db, 'lessons'), where("ownerId", "==", user.uid));
        const lessonsUnsubscribe = onSnapshot(lessonsQuery, (snapshot) => {
            this._lessons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
        this.unsubscribes.push(lessonsUnsubscribe);
    }

    _fetchStudents(studentIds) {
        if (studentIds.length === 0) {
            this._students = [];
            this._isLoading = false;
            return;
        }
        // Firestore 'in' query is limited to 10 items. For a larger class, this needs chunking.
        // For this implementation, assuming classes are smaller than 10.
        const studentsQuery = query(collection(firebaseInit.db, 'students'), where('__name__', 'in', studentIds));
        const studentsUnsubscribe = onSnapshot(studentsQuery, (snapshot) => {
            this._students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this._isLoading = false;
        }, err => {
            console.error("Error fetching students:", err);
            this._isLoading = false;
        });
        this.unsubscribes.push(studentsUnsubscribe);
    }

    async _handleToggleLesson(lesson) {
        const lessonRef = doc(firebaseInit.db, 'lessons', lesson.id);
        const isAssigned = lesson.assignedToGroups && lesson.assignedToGroups.includes(this.groupId);

        try {
            if (isAssigned) {
                await updateDoc(lessonRef, {
                    assignedToGroups: arrayRemove(this.groupId)
                });
                showToast(`Lekce "${lesson.title}" byla odebrána ze třídy.`);
            } else {
                await updateDoc(lessonRef, {
                    assignedToGroups: arrayUnion(this.groupId)
                });
                showToast(`Lekce "${lesson.title}" byla přidána do třídy.`);
            }
        } catch (error) {
            console.error("Error updating lesson assignment:", error);
            showToast("Chyba při aktualizaci lekce.", true);
        }
    }

    _navigateBack() {
        this.dispatchEvent(new CustomEvent('navigate', {
            detail: { view: 'dashboard' },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        if (this._isLoading || !this._group) {
            return html`<div class="flex justify-center items-center h-full"><p class="text-xl text-slate-500">Načítám detaily třídy...</p></div>`;
        }

        return html`
            <div class="h-full bg-slate-50 flex flex-col">
                <!-- Header -->
                <header class="bg-white p-6 border-b border-slate-200 flex items-center justify-between">
                    <div>
                        <button @click=${this._navigateBack} class="text-slate-500 hover:text-slate-800 mb-2 flex items-center">
                            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                            Zpět na Dashboard
                        </button>
                        <h1 class="text-3xl font-extrabold text-slate-800">${this._group.name || 'Bezejmenná třída'}</h1>
                        <div class="flex items-center mt-2">
                             <span class="text-sm text-slate-500 mr-2">Kód pro připojení:</span>
                             <strong class="text-lg font-mono bg-slate-100 text-slate-700 px-3 py-1 rounded-md">${this._group.joinCode || '---'}</strong>
                        </div>
                    </div>
                    <button @click=${() => this._navigateTo('class-settings', { groupId: this.groupId })}
                            class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg">
                        Nastavení Třídy
                    </button>
                </header>

                <!-- Tabs -->
                <div class="px-6 bg-white border-b border-slate-200">
                    <nav class="flex space-x-4">
                        <button @click=${() => this._activeTab = 'curriculum'} class="${this._activeTab === 'curriculum' ? 'border-green-700 text-green-700' : 'border-transparent text-slate-500'} hover:text-green-700 py-4 px-1 border-b-2 font-medium">Kurikulum</button>
                        <button @click=${() => this._activeTab = 'students'} class="${this._activeTab === 'students' ? 'border-green-700 text-green-700' : 'border-transparent text-slate-500'} hover:text-green-700 py-4 px-1 border-b-2 font-medium">Studenti</button>
                    </nav>
                </div>

                <!-- Tab Content -->
                <div class="flex-grow overflow-y-auto p-6">
                    ${this._activeTab === 'curriculum' ? this._renderCurriculum() : this._renderStudents()}
                </div>
            </div>
        `;
    }

    _renderCurriculum() {
        return html`
            <div class="bg-white p-6 rounded-2xl shadow-lg">
                <h2 class="text-xl font-bold text-slate-700 mb-4">Přiřazení Lekcí do Kurikula Třídy</h2>
                <div class="divide-y divide-slate-100">
                    ${this._lessons.map(lesson => this._renderLessonToggle(lesson))}
                </div>
            </div>
        `;
    }

    _renderLessonToggle(lesson) {
        const isAssigned = lesson.assignedToGroups && lesson.assignedToGroups.includes(this.groupId);
        const title = lesson.title || 'Lekce bez názvu';
        return html`
            <div class="flex items-center justify-between p-4">
                <div>
                    <p class="font-semibold text-slate-800">${title}</p>
                    <p class="text-sm text-slate-500">${lesson.status || 'Neznámý status'}</p>
                </div>
                <div class="flex items-center">
                    <span class="mr-3 text-sm font-medium ${isAssigned ? 'text-green-800' : 'text-slate-500'}">
                        ${isAssigned ? 'Aktivní v této třídě' : 'Neaktivní v této třídě'}
                    </span>
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" .checked=${isAssigned} @change=${() => this._handleToggleLesson(lesson)} class="sr-only peer">
                      <div class="w-11 h-6 bg-slate-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-green-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-700"></div>
                    </label>
                </div>
            </div>
        `;
    }

    _renderStudents() {
        return html`
            <div class="bg-white p-6 rounded-2xl shadow-lg">
                <h2 class="text-xl font-bold text-slate-700 mb-4">Seznam Studentů Třídy</h2>
                ${this._students.length === 0 ? html`<p class="text-center p-8 text-slate-500">V této třídě zatím nejsou žádní studenti.</p>` : ''}
                <div class="divide-y divide-slate-100">
                     ${this._students.map(student => this._renderStudentRow(student))}
                </div>
            </div>
        `;
    }

    _renderStudentRow(student) {
        return html`
            <div class="flex items-center justify-between p-4">
                <div>
                    <p class="font-semibold text-slate-800">${student.name || 'Jméno neuvedeno'}</p>
                    <p class="text-sm text-slate-500">${student.email || 'Email neuveden'}</p>
                </div>
                <button @click=${() => this._navigateTo('chat', { studentId: student.id })}
                        class="bg-blue-100 hover:bg-blue-200 text-blue-800 font-semibold py-2 px-4 rounded-lg text-sm">
                    Message
                </button>
            </div>
        `;
    }

    _navigateTo(view, data) {
        this.dispatchEvent(new CustomEvent('navigate', {
            detail: { view, ...data },
            bubbles: true,
            composed: true
        }));
    }
}
customElements.define('professor-class-detail-view', ProfessorClassDetailView);

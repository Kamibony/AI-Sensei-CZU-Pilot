import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, onSnapshot, collection, query, where, updateDoc, arrayUnion, arrayRemove, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';

export class ProfessorClassDetailView extends LitElement {
    static properties = {
        groupId: { type: String },
        _group: { state: true },
        _students: { state: true, type: Array },
        _assignedLessons: { state: true, type: Array },
        _allLessons: { state: true, type: Array },
        _activeTab: { state: true, type: String },
        _isLoading: { state: true, type: Boolean },
        _showLessonSelector: { state: true, type: Boolean }
    };

    constructor() {
        super();
        this.groupId = '';
        this._group = null;
        this._students = [];
        this._assignedLessons = [];
        this._allLessons = [];
        this._activeTab = 'students';
        this._isLoading = true;
        this._showLessonSelector = false;
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

        // 1. Fetch Group Details
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

        // 2. Fetch Assigned Lessons
        // Note: Firestore array-contains query
        // Must filter by ownerId to satisfy security rules
        const assignedLessonsQuery = query(
            collection(firebaseInit.db, 'lessons'),
            where("assignedToGroups", "array-contains", this.groupId),
            where("ownerId", "==", user.uid)
        );

        const lessonsUnsubscribe = onSnapshot(assignedLessonsQuery, (snapshot) => {
            this._assignedLessons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
        this.unsubscribes.push(lessonsUnsubscribe);

        // 3. Fetch All Professor's Lessons (for assignment selector)
        // We can fetch this once or subscribe. Subscription is safer for real-time.
        const allLessonsQuery = query(
            collection(firebaseInit.db, 'lessons'),
            where("ownerId", "==", user.uid)
        );
        // We don't necessarily need real-time for the picker list, but let's be consistent
        const allLessonsUnsubscribe = onSnapshot(allLessonsQuery, (snapshot) => {
            this._allLessons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
        this.unsubscribes.push(allLessonsUnsubscribe);
    }

    _fetchStudents(studentIds) {
        if (!studentIds || studentIds.length === 0) {
            this._students = [];
            this._isLoading = false;
            return;
        }

        // Handle chunking for 'in' query if needed (limit 10), or filter client side if list is huge.
        // For simplicity and robustness with small classes (<10), we use 'in'.
        // If > 10, we'll fetch chunks.

        const chunks = [];
        const chunkSize = 10;
        for (let i = 0; i < studentIds.length; i += chunkSize) {
            chunks.push(studentIds.slice(i, i + chunkSize));
        }

        // Clear previous student listeners if any (though we re-render usually)
        // Ideally we should manage these nested listeners better, but for now simple refresh is okay.
        // Actually, let's just do one-time fetch for students if the list changes to avoid complex nested unsubscribes logic in this refactor,
        // OR better: use a simpler approach.
        // Let's implement robust chunked subscription.

        // Reset students array to avoid duplicates on re-subscription
        let allStudents = new Map(); // Use Map to merge chunks by ID

        this._studentUnsubscribes = this._studentUnsubscribes || [];
        this._studentUnsubscribes.forEach(unsub => unsub());
        this._studentUnsubscribes = [];

        chunks.forEach(chunk => {
            const q = query(collection(firebaseInit.db, 'students'), where('__name__', 'in', chunk));
            const unsub = onSnapshot(q, (snapshot) => {
                snapshot.docs.forEach(doc => {
                    allStudents.set(doc.id, { id: doc.id, ...doc.data() });
                });
                // Check if any were removed from this specific snapshot (hard in onSnapshot without docChanges analysis)
                // Simpler: Just rebuild the array from the Map on every update
                this._students = Array.from(allStudents.values());
                this._isLoading = false;
            });
            this._studentUnsubscribes.push(unsub);
            this.unsubscribes.push(unsub);
        });
    }

    async _handleRenameClass() {
        const newName = prompt("Zadejte nový název třídy:", this._group.name);
        if (newName && newName.trim() !== "") {
            try {
                await updateDoc(doc(firebaseInit.db, 'groups', this.groupId), {
                    name: newName.trim()
                });
                showToast("Třída byla přejmenována.");
            } catch (e) {
                console.error(e);
                showToast("Chyba při přejmenování.", true);
            }
        }
    }

    async _handleRemoveStudent(studentId) {
        if (confirm("Opravdu chcete odebrat tohoto studenta ze třídy?")) {
            try {
                await updateDoc(doc(firebaseInit.db, 'groups', this.groupId), {
                    studentIds: arrayRemove(studentId)
                });
                // Note: The student's 'memberOfGroups' should also be updated.
                // Ideally via Cloud Function or batch write if we have permission.
                // Assuming backend rules or triggers handle consistency, or we do best effort here.
                showToast("Student byl odebrán ze třídy.");
            } catch (e) {
                console.error(e);
                showToast("Chyba při odebírání studenta.", true);
            }
        }
    }

    async _assignLesson(lessonId) {
        try {
            const lessonRef = doc(firebaseInit.db, 'lessons', lessonId);
            await updateDoc(lessonRef, {
                assignedToGroups: arrayUnion(this.groupId)
            });
            showToast("Lekce byla úspěšně přiřazena.");
            this._showLessonSelector = false;
        } catch (e) {
            console.error(e);
            showToast("Chyba při přiřazování lekce.", true);
        }
    }

    async _removeLessonAssignment(lessonId) {
         if (confirm("Opravdu chcete odebrat tuto lekci ze třídy?")) {
            try {
                const lessonRef = doc(firebaseInit.db, 'lessons', lessonId);
                await updateDoc(lessonRef, {
                    assignedToGroups: arrayRemove(this.groupId)
                });
                showToast("Lekce byla odebrána.");
            } catch (e) {
                console.error(e);
                showToast("Chyba při odebírání lekce.", true);
            }
        }
    }

    _navigateBack() {
        this.dispatchEvent(new CustomEvent('navigate', {
            detail: { view: 'classes' }, // Go back to Classes Hub
            bubbles: true,
            composed: true
        }));
    }

    render() {
        if (this._isLoading && !this._group) {
            return html`<div class="flex justify-center items-center h-full"><p class="text-xl text-slate-500">Načítám...</p></div>`;
        }

        if (!this._group) {
             return html`<div class="p-8 text-center text-red-500">Třída nenalezena.</div>`;
        }

        return html`
            <div class="h-full bg-slate-50 flex flex-col">
                <!-- Header -->
                <header class="bg-white p-6 border-b border-slate-200 shadow-sm z-10">
                    <div class="flex items-center justify-between mb-4">
                        <button @click=${this._navigateBack} class="text-slate-500 hover:text-indigo-600 flex items-center transition-colors">
                            <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                            Zpět na přehled
                        </button>
                        <div class="flex space-x-2">
                             <button @click=${this._handleRenameClass} class="p-2 text-slate-400 hover:text-indigo-600 rounded-full hover:bg-slate-100" title="Přejmenovat">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                            </button>
                        </div>
                    </div>
                    <div class="flex items-end justify-between">
                        <div>
                            <h1 class="text-3xl font-extrabold text-slate-800 leading-tight">${this._group.name}</h1>
                            <div class="flex items-center mt-2 space-x-4">
                                <div class="flex items-center text-slate-500 text-sm">
                                    <span class="mr-2">Kód:</span>
                                    <code class="bg-slate-100 px-2 py-0.5 rounded font-mono font-bold text-slate-700">${this._group.joinCode}</code>
                                </div>
                                <div class="text-slate-400 text-sm">|</div>
                                <div class="text-slate-500 text-sm">${this._students.length} Studentů</div>
                            </div>
                        </div>
                    </div>
                </header>

                <!-- Tabs Navigation -->
                <div class="px-6 bg-white border-b border-slate-200 sticky top-0 z-0">
                    <nav class="flex space-x-8">
                        <button @click=${() => this._activeTab = 'students'}
                                class="${this._activeTab === 'students' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'} py-4 border-b-2 font-medium transition-colors flex items-center">
                            <span class="mr-2">👥</span> Studenti
                        </button>
                        <button @click=${() => this._activeTab = 'lessons'}
                                class="${this._activeTab === 'lessons' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'} py-4 border-b-2 font-medium transition-colors flex items-center">
                            <span class="mr-2">📚</span> Lekce
                        </button>
                    </nav>
                </div>

                <!-- Tab Content -->
                <div class="flex-grow overflow-y-auto p-6">
                    <div class="max-w-5xl mx-auto">
                        ${this._activeTab === 'students' ? this._renderStudentsTab() : this._renderLessonsTab()}
                    </div>
                </div>

                <!-- Lesson Selector Modal -->
                ${this._showLessonSelector ? this._renderLessonSelector() : ''}
            </div>
        `;
    }

    _renderStudentsTab() {
        if (this._students.length === 0) {
            return html`
                <div class="text-center p-12 bg-white rounded-2xl shadow-sm border border-slate-100">
                    <div class="text-slate-300 text-5xl mb-4">👥</div>
                    <h3 class="text-lg font-bold text-slate-700">Žádní studenti</h3>
                    <p class="text-slate-500">V této třídě zatím nejsou zapsáni žádní studenti.</p>
                </div>
            `;
        }

        return html`
            <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <table class="min-w-full divide-y divide-slate-200">
                    <thead class="bg-slate-50">
                        <tr>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Jméno</th>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                            <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Akce</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-slate-200">
                        ${this._students.map(student => html`
                            <tr>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <div class="text-sm font-medium text-slate-900">${student.name || 'Neznámé jméno'}</div>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <div class="text-sm text-slate-500">${student.email || '---'}</div>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button @click=${() => this._handleRemoveStudent(student.id)} class="text-red-600 hover:text-red-900 hover:bg-red-50 px-3 py-1 rounded transition-colors">
                                        ❌ Odebrat
                                    </button>
                                </td>
                            </tr>
                        `)}
                    </tbody>
                </table>
            </div>
        `;
    }

    _renderLessonsTab() {
        return html`
            <div class="space-y-6">
                <div class="flex justify-between items-center">
                    <h2 class="text-xl font-bold text-slate-800">Přiřazené Lekce</h2>
                    <button @click=${() => this._showLessonSelector = true} class="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center">
                        <span class="mr-2">➕</span> Přiřadit lekci
                    </button>
                </div>

                ${this._assignedLessons.length === 0
                    ? html`<div class="text-center p-12 bg-white rounded-2xl border border-slate-100 text-slate-500">Tato třída nemá přiřazené žádné lekce.</div>`
                    : html`
                        <div class="grid gap-4">
                            ${this._assignedLessons.map(lesson => html`
                                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center hover:shadow-md transition-shadow">
                                    <div class="flex items-center space-x-4">
                                        <div class="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                            📚
                                        </div>
                                        <div>
                                            <h3 class="font-bold text-slate-800">${lesson.title}</h3>
                                            <p class="text-xs text-slate-500">${lesson.topic || 'Bez tématu'}</p>
                                        </div>
                                    </div>
                                    <button @click=${() => this._removeLessonAssignment(lesson.id)} class="text-slate-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors" title="Odebrat lekci">
                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    </button>
                                </div>
                            `)}
                        </div>
                    `
                }
            </div>
        `;
    }

    _renderLessonSelector() {
        // Filter out already assigned lessons
        const availableLessons = this._allLessons.filter(l =>
            !l.assignedToGroups || !l.assignedToGroups.includes(this.groupId)
        );

        return html`
            <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50" @click=${(e) => { if(e.target === e.currentTarget) this._showLessonSelector = false }}>
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4">
                    <div class="p-6 border-b border-slate-100 flex justify-between items-center">
                        <h3 class="text-xl font-bold text-slate-800">Vyberte lekci k přiřazení</h3>
                        <button @click=${() => this._showLessonSelector = false} class="text-slate-400 hover:text-slate-600">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <div class="overflow-y-auto p-6 flex-grow space-y-2">
                        ${availableLessons.length === 0
                            ? html`<p class="text-center text-slate-500 py-8">Nemáte žádné další lekce k přiřazení.</p>`
                            : availableLessons.map(lesson => html`
                                <button @click=${() => this._assignLesson(lesson.id)} class="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all group">
                                    <div class="flex justify-between items-center">
                                        <div>
                                            <h4 class="font-bold text-slate-700 group-hover:text-indigo-700">${lesson.title}</h4>
                                            <p class="text-sm text-slate-500">${lesson.topic || 'Bez tématu'}</p>
                                        </div>
                                        <span class="text-indigo-600 opacity-0 group-hover:opacity-100 font-medium text-sm transition-opacity">Přiřadit &rarr;</span>
                                    </div>
                                </button>
                            `)
                        }
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('professor-class-detail-view', ProfessorClassDetailView);

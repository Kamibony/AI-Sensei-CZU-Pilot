import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, onSnapshot, collection, query, where, updateDoc, arrayUnion, arrayRemove, getDocs, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';
import { Localized } from '../../utils/localization-mixin.js';

export class ProfessorClassDetailView extends Localized(LitElement) {
    static properties = {
        groupId: { type: String },
        _group: { state: true },
        _students: { state: true, type: Array },
        _assignedLessons: { state: true, type: Array },
        _allLessons: { state: true, type: Array },
        _activeTab: { state: true, type: String },
        _isLoading: { state: true, type: Boolean },
        _showLessonSelector: { state: true, type: Boolean },
        _grades: { state: true, type: Array } // Array of submissions
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
        this._grades = [];
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
        const assignedLessonsQuery = query(
            collection(firebaseInit.db, 'lessons'),
            where("assignedToGroups", "array-contains", this.groupId),
            where("ownerId", "==", user.uid)
        );

        const lessonsUnsubscribe = onSnapshot(assignedLessonsQuery, (snapshot) => {
            this._assignedLessons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this._fetchGrades(); // Fetch grades when lessons load
        });
        this.unsubscribes.push(lessonsUnsubscribe);

        // 3. Fetch All Professor's Lessons (for assignment selector)
        const allLessonsQuery = query(
            collection(firebaseInit.db, 'lessons'),
            where("ownerId", "==", user.uid)
        );
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

        const chunks = [];
        const chunkSize = 10;
        for (let i = 0; i < studentIds.length; i += chunkSize) {
            chunks.push(studentIds.slice(i, i + chunkSize));
        }

        let allStudents = new Map();

        this._studentUnsubscribes = this._studentUnsubscribes || [];
        this._studentUnsubscribes.forEach(unsub => unsub());
        this._studentUnsubscribes = [];

        chunks.forEach(chunk => {
            const q = query(collection(firebaseInit.db, 'students'), where('__name__', 'in', chunk));
            const unsub = onSnapshot(q, (snapshot) => {
                snapshot.docs.forEach(doc => {
                    allStudents.set(doc.id, { id: doc.id, ...doc.data() });
                });
                this._students = Array.from(allStudents.values());
                this._fetchGrades(); // Refresh grades if students load late
                this._isLoading = false;
            });
            this._studentUnsubscribes.push(unsub);
            this.unsubscribes.push(unsub);
        });
    }

    _fetchGrades() {
        // Only fetch if we have students and lessons
        if (this._students.length === 0) return;

        // Fetch submissions for all students in this group
        // We can't filter by group easily in submissions unless we store groupId there (which we might not).
        // So we query submissions where studentId IN [students list].
        // Again, chunking apply.

        // Also we want quizzes and tests.
        // Let's do a simple one-time fetch or snapshot. Snapshot is better.

        const studentIds = this._students.map(s => s.id);
        const chunks = [];
        const chunkSize = 10;
        for (let i = 0; i < studentIds.length; i += chunkSize) {
            chunks.push(studentIds.slice(i, i + chunkSize));
        }

        // We need to clear previous listeners?
        this._gradeUnsubscribes = this._gradeUnsubscribes || [];
        this._gradeUnsubscribes.forEach(unsub => unsub());
        this._gradeUnsubscribes = [];

        let allSubmissions = [];

        const updateGrades = () => {
             this._grades = [...allSubmissions];
        };

        ['quiz_submissions', 'test_submissions'].forEach(collectionName => {
             chunks.forEach(chunk => {
                const q = query(collection(firebaseInit.db, collectionName), where('studentId', 'in', chunk));
                const unsub = onSnapshot(q, (snapshot) => {
                    // Filter out old ones from this chunk/collection
                    // This logic is tricky with multiple listeners pushing to one array.
                    // Better approach: use a Map key = collection + id
                    // For simplicity, let's just REPLACE the specific ones in a map-based storage
                    // Actually, let's use a simpler approach: Just one array, and filter dupes?
                    // Or a Map of Map: studentId -> lessonId -> score.

                    snapshot.docs.forEach(doc => {
                        const data = doc.data();
                        // Find if exists
                        const existingIndex = allSubmissions.findIndex(s => s.id === doc.id);
                        if (existingIndex >= 0) {
                            allSubmissions[existingIndex] = { id: doc.id, ...data, type: collectionName };
                        } else {
                            allSubmissions.push({ id: doc.id, ...data, type: collectionName });
                        }
                    });
                    updateGrades();
                });
                this._gradeUnsubscribes.push(unsub);
                this.unsubscribes.push(unsub);
             });
        });
    }

    _generateJoinCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    async _regenerateCode() {
        if (!confirm(this.t('class.regenerate_confirm'))) return;

        try {
            const newCode = this._generateJoinCode();
            await updateDoc(doc(firebaseInit.db, 'groups', this.groupId), {
                joinCode: newCode
            });
            showToast(this.t('class.code_generated'));
        } catch (e) {
            console.error("Error regenerating code:", e);
            showToast(this.t('class.code_generated_error') || this.t('common.error'), true);
        }
    }

    _copyCode() {
        if (!this._group?.joinCode) return;
        navigator.clipboard.writeText(this._group.joinCode).then(() => {
            showToast(this.t('common.code_copied'));
        }).catch(() => {
            showToast(this.t('common.copy_failed'), true);
        });
    }

    async _handleRenameClass() {
        const newName = prompt(this.t('class.rename_prompt'), this._group.name);
        if (newName && newName.trim() !== "") {
            try {
                await updateDoc(doc(firebaseInit.db, 'groups', this.groupId), {
                    name: newName.trim()
                });
                showToast(this.t('class.renamed_success'));
            } catch (e) {
                console.error(e);
                showToast(`${this.t('common.error')}: ${e.message}`, true);
            }
        }
    }

    async _handleDeleteClass() {
        try {
            const lessonsQuery = query(
                collection(firebaseInit.db, 'lessons'),
                where('assignedToGroups', 'array-contains', this.groupId)
            );
            const snapshot = await getDocs(lessonsQuery);
            const activeLessonsCount = snapshot.size;

            if (activeLessonsCount > 0) {
                if (!confirm(this.t('class.delete_confirm_lessons', { count: activeLessonsCount }))) {
                    return;
                }

                const batch = writeBatch(firebaseInit.db);

                snapshot.docs.forEach(docSnapshot => {
                    const lessonRef = doc(firebaseInit.db, 'lessons', docSnapshot.id);
                    batch.update(lessonRef, {
                        assignedToGroups: arrayRemove(this.groupId)
                    });
                });

                const groupRef = doc(firebaseInit.db, 'groups', this.groupId);
                batch.delete(groupRef);

                await batch.commit();

            } else {
                 if (!confirm(this.t('class.delete_confirm'))) return;
                 await deleteDoc(doc(firebaseInit.db, 'groups', this.groupId));
            }

            showToast(this.t('class.deleted_success'));
            this._navigateBack();

        } catch (e) {
            console.error("Error deleting class:", e);
            showToast(`${this.t('common.error')}: ${e.message}`, true);
        }
    }

    async _handleRemoveStudent(studentId) {
        if (confirm(this.t('class.remove_student_confirm'))) {
            try {
                await updateDoc(doc(firebaseInit.db, 'groups', this.groupId), {
                    studentIds: arrayRemove(studentId)
                });
                showToast(this.t('class.student_removed'));
            } catch (e) {
                console.error(e);
                showToast(`${this.t('common.error')}: ${e.message}`, true);
            }
        }
    }

    async _assignLesson(lessonId) {
        try {
            const lessonRef = doc(firebaseInit.db, 'lessons', lessonId);
            await updateDoc(lessonRef, {
                assignedToGroups: arrayUnion(this.groupId)
            });
            showToast(this.t('class.lesson_assigned'));
            this._showLessonSelector = false;
        } catch (e) {
            console.error(e);
            showToast(`${this.t('common.error')}: ${e.message}`, true);
        }
    }

    async _removeLessonAssignment(lessonId) {
         if (confirm(this.t('class.remove_lesson_confirm'))) {
            try {
                const lessonRef = doc(firebaseInit.db, 'lessons', lessonId);
                await updateDoc(lessonRef, {
                    assignedToGroups: arrayRemove(this.groupId)
                });
                showToast(this.t('class.lesson_removed'));
            } catch (e) {
                console.error(e);
                showToast(`${this.t('common.error')}: ${e.message}`, true);
            }
        }
    }

    _navigateBack() {
        this.dispatchEvent(new CustomEvent('navigate', {
            detail: { view: 'classes' },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        if (this._isLoading && !this._group) {
            return html`<div class="flex justify-center items-center h-full"><p class="text-xl text-slate-500">${this.t('common.loading')}</p></div>`;
        }

        if (!this._group) {
             return html`<div class="p-8 text-center text-red-500">${this.t('class.not_found')}</div>`;
        }

        return html`
            <div class="h-full bg-slate-50 flex flex-col">
                <!-- Header -->
                <header class="bg-white p-6 border-b border-slate-200 shadow-sm z-10">
                    <div class="flex items-center justify-between mb-4">
                        <button @click=${this._navigateBack} class="text-slate-500 hover:text-indigo-600 flex items-center transition-colors">
                            <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                            ${this.t('common.back')}
                        </button>
                        <div class="flex space-x-2">
                             <button @click=${this._handleRenameClass} class="p-2 text-slate-400 hover:text-indigo-600 rounded-full hover:bg-slate-100" title="${this.t('common.edit')}">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                            </button>
                            <button @click=${this._handleDeleteClass} class="p-2 text-slate-400 hover:text-red-600 rounded-full hover:bg-red-50" title="${this.t('common.delete')}">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                    </div>
                    <div class="flex items-end justify-between">
                        <div>
                            <h1 class="text-3xl font-extrabold text-slate-800 leading-tight">${this._group.name}</h1>
                            <div class="flex items-center mt-2 space-x-4 flex-wrap gap-y-2">
                                <div class="flex items-center text-slate-500 text-sm bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                                    <span class="mr-2 font-medium text-indigo-800">${this.t('class.code_label')}</span>
                                    <code class="font-mono font-bold text-lg text-indigo-700 mr-3 select-all">${this._group.joinCode}</code>
                                    <div class="flex items-center border-l border-indigo-200 pl-2 space-x-1">
                                        <button @click=${this._copyCode} class="p-1 text-indigo-500 hover:text-indigo-800 hover:bg-indigo-100 rounded transition-colors" title="${this.t('classes.copy_code_tooltip')}">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                        </button>
                                        <button @click=${this._regenerateCode} class="p-1 text-indigo-500 hover:text-indigo-800 hover:bg-indigo-100 rounded transition-colors" title="${this.t('common.edit')}">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                                        </button>
                                    </div>
                                </div>
                                <div class="hidden sm:block text-slate-300 text-sm">|</div>
                                <div class="text-slate-500 text-sm font-medium flex items-center">
                                    <span class="bg-slate-100 text-slate-600 px-2 py-1 rounded-md mr-2">${this._students.length}</span>
                                    ${this.t('common.students_count')}
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                <!-- Tabs Navigation -->
                <div class="px-6 bg-white border-b border-slate-200 sticky top-0 z-0">
                    <nav class="flex space-x-8">
                        <button @click=${() => this._activeTab = 'students'}
                                class="${this._activeTab === 'students' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'} py-4 border-b-2 font-medium transition-colors flex items-center">
                            <span class="mr-2">👥</span> ${this.t('nav.students')}
                        </button>
                        <button @click=${() => this._activeTab = 'lessons'}
                                class="${this._activeTab === 'lessons' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'} py-4 border-b-2 font-medium transition-colors flex items-center">
                            <span class="mr-2">📚</span> ${this.t('professor.stats_lessons')}
                        </button>
                        <button @click=${() => this._activeTab = 'grades'}
                                class="${this._activeTab === 'grades' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'} py-4 border-b-2 font-medium transition-colors flex items-center">
                            <span class="mr-2">📊</span> ${this.t('class.tab_grades')}
                        </button>
                    </nav>
                </div>

                <!-- Tab Content -->
                <div class="flex-grow overflow-y-auto p-6">
                    <div class="w-full px-6">
                        ${this._activeTab === 'students' ? this._renderStudentsTab() :
                          this._activeTab === 'lessons' ? this._renderLessonsTab() :
                          this._renderGradesTab()}
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
                    <h3 class="text-lg font-bold text-slate-700">${this.t('students_view.none_registered')}</h3>
                </div>
            `;
        }

        return html`
            <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <table class="min-w-full divide-y divide-slate-200">
                    <thead class="bg-slate-50">
                        <tr>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">${this.t('auth.email_label')}</th>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                            <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">${this.t('class.actions')}</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-slate-200">
                        ${this._students.map(student => html`
                            <tr>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <div class="text-sm font-medium text-slate-900">${student.name || this.t('students_view.name_missing')}</div>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <div class="text-sm text-slate-500">${student.email || '---'}</div>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button @click=${() => this._handleRemoveStudent(student.id)} class="text-red-600 hover:text-red-900 hover:bg-red-50 px-3 py-1 rounded transition-colors">
                                        ❌ ${this.t('class.remove')}
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
                    <h2 class="text-xl font-bold text-slate-800">${this.t('class.assigned_lessons')}</h2>
                    <button @click=${() => this._showLessonSelector = true} class="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center">
                        <span class="mr-2">➕</span> ${this.t('class.assign_lesson_btn')}
                    </button>
                </div>

                ${this._assignedLessons.length === 0
                    ? html`<div class="text-center p-12 bg-white rounded-2xl border border-slate-100 text-slate-500">${this.t('class.no_assigned_lessons')}</div>`
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
                                            <p class="text-xs text-slate-500">${lesson.subtitle || ''}</p>
                                        </div>
                                    </div>
                                    <button @click=${() => this._removeLessonAssignment(lesson.id)} class="text-slate-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors" title="${this.t('class.remove')}">
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

    _renderGradesTab() {
        // Filter lessons that have quiz or test
        const gradableLessons = this._assignedLessons.filter(l => l.quiz || l.test);

        if (gradableLessons.length === 0) {
             return html`
                <div class="text-center p-12 bg-white rounded-2xl shadow-sm border border-slate-100">
                    <div class="text-slate-300 text-5xl mb-4">📊</div>
                    <h3 class="text-lg font-bold text-slate-700">${this.t('class.no_grades')}</h3>
                    <p class="text-slate-500">${this.t('class.no_gradable_lessons')}</p>
                </div>
            `;
        }

        return html`
            <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden overflow-x-auto">
                <table class="min-w-full divide-y divide-slate-200">
                    <thead class="bg-slate-50">
                        <tr>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                                ${this.t('class.table_student')}
                            </th>
                            ${gradableLessons.map(lesson => html`
                                <th scope="col" class="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider min-w-[120px]">
                                    ${lesson.title}
                                </th>
                            `)}
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-slate-200">
                        ${this._students.map(student => html`
                            <tr class="hover:bg-slate-50 transition-colors">
                                <td class="px-6 py-4 whitespace-nowrap sticky left-0 bg-white border-r border-slate-200 font-medium text-slate-900">
                                    ${student.name || this.t('students_view.name_missing')}
                                </td>
                                ${gradableLessons.map(lesson => {
                                    // Find submission for this student and lesson
                                    // There could be multiple (quiz + test), let's average or show both?
                                    // Simplification: Show the highest Score found for this lessonId
                                    const submissions = this._grades.filter(g => g.studentId === student.id && g.lessonId === lesson.id);

                                    if (submissions.length === 0) {
                                        return html`<td class="px-6 py-4 text-center text-slate-300">-</td>`;
                                    }

                                    // Calc score
                                    // Submissions have 'score' (percentage) usually
                                    const bestScore = Math.max(...submissions.map(s => s.score || 0));

                                    let colorClass = "text-slate-600";
                                    if (bestScore >= 90) colorClass = "text-green-600 font-bold";
                                    else if (bestScore >= 70) colorClass = "text-indigo-600";
                                    else if (bestScore < 50) colorClass = "text-red-500";

                                    return html`
                                        <td class="px-6 py-4 text-center ${colorClass}">
                                            ${Math.round(bestScore)}%
                                        </td>
                                    `;
                                })}
                            </tr>
                        `)}
                    </tbody>
                </table>
            </div>
        `;
    }

    _renderLessonSelector() {
        const availableLessons = this._allLessons.filter(l =>
            !l.assignedToGroups || !l.assignedToGroups.includes(this.groupId)
        );

        return html`
            <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50" @click=${(e) => { if(e.target === e.currentTarget) this._showLessonSelector = false }}>
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4">
                    <div class="p-6 border-b border-slate-100 flex justify-between items-center">
                        <h3 class="text-xl font-bold text-slate-800">${this.t('class.select_lesson_modal')}</h3>
                        <button @click=${() => this._showLessonSelector = false} class="text-slate-400 hover:text-slate-600">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <div class="overflow-y-auto p-6 flex-grow space-y-2">
                        ${availableLessons.length === 0
                            ? html`<p class="text-center text-slate-500 py-8">${this.t('class.no_more_lessons')}</p>`
                            : availableLessons.map(lesson => html`
                                <button @click=${() => this._assignLesson(lesson.id)} class="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all group">
                                    <div class="flex justify-between items-center">
                                        <div>
                                            <h4 class="font-bold text-slate-700 group-hover:text-indigo-700">${lesson.title}</h4>
                                            <p class="text-sm text-slate-500">${lesson.subtitle || ''}</p>
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

// public/js/views/professor/professor-students-view.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, query, where, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';
import { translationService } from '../../utils/translation-service.js';

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
        this._langUnsubscribe = translationService.subscribe(() => this.requestUpdate());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._unsubscribeListeners.forEach(item => item.unsub());
        if (this._langUnsubscribe) {
            this._langUnsubscribe();
        }
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
                showToast(translationService.t('students_view.fetch_batch_error'), true);
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
            showToast(translationService.t('students_view.fetch_groups_error'), true);
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
        const t = (key) => translationService.t(key);
        const initials = (student.name || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const avatarBgColor = this._getAvatarColor(student.id);

        return html`
            <div class="group relative bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer border border-slate-100 p-6 flex items-start space-x-4"
                 @click=${() => this._navigateToProfile(student.id)}>

                <!-- Status Badge (Absolute Positioned) -->
                <div class="absolute top-4 right-4">
                     <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${student.telegramChatId ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-700/10' : 'bg-slate-50 text-slate-500 ring-1 ring-slate-500/10'}">
                        ${student.telegramChatId ? t('students_view.telegram_connected') : t('students_view.telegram_disconnected')}
                    </span>
                </div>

                <!-- Avatar -->
                <div class="flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-sm ${avatarBgColor}">
                    ${initials}
                </div>

                <!-- Info -->
                <div class="flex-grow pt-1 min-w-0">
                     <h3 class="text-lg font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors" title="${student.name || t('students_view.name_missing')}">
                        ${student.name || t('students_view.name_missing')}
                    </h3>
                     <p class="text-sm text-slate-500 truncate mt-1" title="${student.email}">${student.email}</p>

                     <div class="mt-4 flex items-center text-xs text-slate-400 font-medium">
                        <span class="flex items-center hover:text-slate-600 transition-colors">
                            ${t('students_view.view_profile')} &rarr;
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
        const t = (key) => translationService.t(key);
        const filteredStudents = this._filteredStudents;
        let content;

        if (this._isLoading) {
            content = html`<p class="text-center p-8 text-slate-400">${t('students_view.loading')}</p>`;
        } else if (this._students.length === 0) {
            content = html`<p class="text-center p-8 text-slate-500">${t('students_view.none_registered')}</p>`;
        } else if (filteredStudents.length === 0) {
             content = html`<p class="text-center p-8 text-slate-500">${t('students_view.no_results')}</p>`;
        } else {
            content = html`
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${filteredStudents.map(student => this.renderStudentCard(student))}
                </div>`;
        }

        return html`
            <header class="text-center p-6 border-b border-slate-200 bg-white">
                <h1 class="text-3xl font-extrabold text-slate-800">${t('students_view.title')}</h1>
                <p class="text-slate-500 mt-1">${t('students_view.subtitle')}</p>
            </header>
            <div class="flex-grow overflow-y-auto p-4 md:p-6">
                <div class="mb-6 max-w-md mx-auto">
                    <input type="search"
                           placeholder="${t('students_view.search_placeholder')}"
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

// public/js/views/professor/professor-students-view.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, query, where, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils/utils.js';
import { Localized } from '../../utils/localization-mixin.js';

export class ProfessorStudentsView extends Localized(LitElement) {
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
                showToast(this.t('students_view.fetch_batch_error'), true);
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
            showToast(this.t('students_view.fetch_groups_error'), true);
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

        // Use consistent color hashing logic if desired, or random.
        // Here I'll use a dynamic gradient similar to classes for modern feel.
        const colors = [
            'from-blue-500 to-indigo-600',
            'from-purple-500 to-pink-600',
            'from-emerald-500 to-teal-600',
            'from-orange-500 to-red-600',
            'from-cyan-500 to-blue-600',
            'from-rose-500 to-orange-500'
        ];
        // Simple hash from string
        const hash = (student.id || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const bgGradient = colors[hash % colors.length];

        return html`
            <div class="group relative bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 p-5 flex items-center space-x-4 cursor-pointer"
                 @click=${() => this._navigateToProfile(student.id)}>

                <!-- Avatar -->
                <div class="flex-shrink-0 w-16 h-16 rounded-full bg-gradient-to-br ${bgGradient} flex items-center justify-center text-white font-bold text-xl shadow-md ring-4 ring-slate-50">
                    ${initials}
                </div>

                <!-- Info -->
                <div class="flex-grow min-w-0">
                     <h3 class="text-lg font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors" title="${student.name || this.t('students_view.name_missing')}">
                        ${student.name || this.t('students_view.name_missing')}
                    </h3>
                     <p class="text-sm text-slate-500 truncate mt-0.5" title="${student.email}">${student.email}</p>

                     <div class="flex items-center mt-2 space-x-2">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${student.telegramChatId ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}">
                            ${student.telegramChatId ? this.t('students_view.telegram_connected') : this.t('students_view.telegram_disconnected')}
                        </span>
                     </div>
                </div>

                <!-- Actions: Chat Button -->
                <button class="flex-shrink-0 p-3 rounded-full bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors border border-transparent hover:border-indigo-100"
                        title="${this.t('students_view.chat_tooltip')}"
                        @click=${(e) => { e.stopPropagation(); this._navigateToProfile(student.id); /* Navigate to chat tab logic handled in profile view */ }}>
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                </button>
            </div>
        `;
    }

    render() {
        const filteredStudents = this._filteredStudents;
        let content;

        if (this._isLoading) {
            content = html`
                <div class="flex justify-center items-center h-64 col-span-full">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                </div>`;
        } else if (this._students.length === 0) {
            content = html`
                <div class="col-span-full text-center p-12 bg-white rounded-3xl border border-slate-100">
                    <div class="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4 text-slate-400">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                    </div>
                    <p class="text-slate-500 font-medium">${this.t('students_view.none_registered')}</p>
                </div>
            `;
        } else if (filteredStudents.length === 0) {
             content = html`
                <div class="col-span-full text-center p-12">
                    <p class="text-slate-500">${this.t('students_view.no_results')}</p>
                </div>
             `;
        } else {
            content = html`
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${filteredStudents.map(student => this.renderStudentCard(student))}
                </div>`;
        }

        return html`
            <div class="h-full flex flex-col bg-slate-50">
                <header class="bg-white p-6 border-b border-slate-200">
                    <div>
                        <h1 class="text-3xl font-extrabold text-slate-800 tracking-tight">${this.t('students_view.title')}</h1>
                        <p class="text-slate-500 mt-1 font-medium">${this.t('students_view.subtitle')}</p>
                    </div>
                </header>

                <div class="flex-grow overflow-y-auto p-6">
                    <div class="space-y-8">

                        <!-- Search Bar (Floating) -->
                        <div class="sticky top-0 z-10 -mt-2 mb-8 pt-2">
                             <div class="relative max-w-2xl mx-auto">
                                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <svg class="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                </div>
                                <input type="search"
                                       placeholder="${this.t('students_view.search_placeholder')}"
                                       .value=${this._searchTerm}
                                       @input=${this._handleSearchInput}
                                       class="block w-full pl-12 pr-4 py-4 bg-white/90 backdrop-blur-md border border-slate-200 text-slate-700 placeholder-slate-400 rounded-full shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                >
                             </div>
                        </div>

                        <div id="students-list-container">
                            ${content}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('professor-students-view', ProfessorStudentsView);

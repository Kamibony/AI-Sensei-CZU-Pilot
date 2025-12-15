import { db, auth, functions } from './firebase-init.js';
import {
    collection,
    query,
    where,
    onSnapshot,
    doc,
    getDoc,
    orderBy,
    updateDoc,
    arrayUnion,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { showToast } from './utils.js';
import { translationService } from './utils/translation-service.js'; // Import prekladov
import './student/student-classes-view.js';
import './student/student-lesson-list.js';
import './student/student-lesson-detail.js';
import './student/student-class-detail.js';
import './student/student-dashboard-view.js';

class StudentDashboard extends LitElement {
    static properties = {
        user: { type: Object },
        currentView: { type: String },
        selectedLessonId: { type: String },
        selectedClassId: { type: String },
        isSidebarOpen: { type: Boolean },
        isJoinModalOpen: { type: Boolean },
        // Premenné pre formulár (zachovaná funkčnosť)
        joinCode: { type: String },
        joinError: { type: String },
        isJoining: { type: Boolean }
    };

    constructor() {
        super();
        this.user = null;
        this.currentView = 'dashboard';
        this.selectedLessonId = null;
        this.selectedClassId = null;
        this.isSidebarOpen = false;
        this.isJoinModalOpen = false;
        this.joinCode = '';
        this.joinError = '';
        this.isJoining = false;
    }

    createRenderRoot() {
        return this;
    }

    t(key) {
        return translationService.t(key);
    }

    // --- Sledovanie zmeny jazyka ---
    connectedCallback() {
        super.connectedCallback();
        this._langUnsubscribe = translationService.subscribe(() => this.requestUpdate());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._langUnsubscribe) {
            this._langUnsubscribe();
        }
    }
    // -------------------------------

    render() {
        // Skratka pre preklady
        const t = (key) => translationService.t(key);

        if (!this.user) return html`<div>${t('common.loading')}</div>`;

        return html`
            <div class="h-full overflow-hidden bg-slate-50 flex relative">
                <nav class="fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 z-50 transform transition-transform duration-200 ease-in-out ${this.isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0">
                    <div class="flex flex-col h-full">
                        <div class="p-6 border-b border-slate-200">
                            <h1 class="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <span class="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-lg">S</span>
                                ${t('common.app_name')}
                            </h1>
                            <p class="text-sm text-slate-500 mt-1">${t('student.portal_title')}</p>
                        </div>

                        <div class="flex-1 overflow-y-auto py-6 px-3">
                            <div class="space-y-1">
                                ${this.renderNavItem('dashboard', t('student.overview'), 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6')}
                                ${this.renderNavItem('lessons', t('student.my_lessons'), 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253')}
                                ${this.renderNavItem('classes', t('student.my_classes'), 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4')}
                            </div>
                        </div>

                        <div class="p-4 border-t border-slate-200">
                            <div class="flex items-center gap-3 mb-4 px-2">
                                <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                                    ${this.user.email[0].toUpperCase()}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm font-medium text-slate-900 truncate">${this.user.email}</p>
                                    <p class="text-xs text-slate-500">${t('student.role_label')}</p>
                                </div>
                            </div>
                            <button @click="${this.handleLogout}" class="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                                </svg>
                                ${t('auth.logout')}
                            </button>
                        </div>
                    </div>
                </nav>

                <div class="fixed top-0 left-0 p-4 z-40 md:hidden">
                    <button @click="${() => this.isSidebarOpen = !this.isSidebarOpen}" class="p-2 bg-white rounded-lg shadow-sm border border-slate-200">
                        <svg class="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                        </svg>
                    </button>
                </div>

                <main class="flex-1 md:ml-64 h-full overflow-y-auto transition-all duration-200">
                    <div class="p-8 max-w-7xl mx-auto">
                        ${this.renderContent()}
                    </div>
                </main>

                ${this.isJoinModalOpen ? this.renderJoinClassModal() : ''}
            </div>
        `;
    }

    renderJoinClassModal() {
        const t = (key) => translationService.t(key);
        return html`
            <div class="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" @click="${(e) => { if(e.target === e.currentTarget) this._closeJoinClassModal(); }}">
                <div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up p-8 text-center relative">

                    <button @click="${this._closeJoinClassModal}" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
                         <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>

                    <div class="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4">
                        🚀
                    </div>

                    <h3 class="text-2xl font-bold text-slate-900 mb-2">${t('student.join_class')}</h3>
                    <p class="text-slate-500 mb-6">${t('student.enter_code')}</p>

                    <div class="mb-6">
                        <input
                            type="text"
                            .value="${this.joinCode}"
                            @input="${(e) => { this.joinCode = e.target.value; this.joinError = ''; }}"
                            @keypress="${(e) => e.key === 'Enter' && this._submitJoinClass()}"
                            placeholder="CODE"
                            class="w-full px-4 py-4 border-2 border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all text-center text-3xl font-bold tracking-[0.5em] uppercase placeholder:text-slate-300 placeholder:tracking-normal"
                            maxlength="6"
                        >
                        ${this.joinError ? html`<p class="text-red-500 text-sm mt-2 font-medium bg-red-50 py-1 rounded-lg">${this.joinError}</p>` : ''}
                    </div>

                    <div class="flex justify-center gap-3">
                        <button
                            @click="${() => this._submitJoinClass()}"
                            ?disabled="${this.isJoining || !this.joinCode}"
                            class="w-full px-6 py-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                        >
                            ${this.isJoining ? html`<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>` : ''}
                            ${t('student.join_btn')}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    _closeJoinClassModal() {
        this.isJoinModalOpen = false;
        this.joinCode = '';
        this.joinError = '';
        this.isJoining = false;
    }

    async _submitJoinClass() {
        const t = (key) => translationService.t(key);
        if (!this.joinCode) {
            showToast(t('student.enter_code'), true);
            return;
        }

        this.isJoining = true;
        this.joinError = '';

        try {
            const joinClass = httpsCallable(functions, 'joinClass');
            const result = await joinClass({ joinCode: this.joinCode });

            this._closeJoinClassModal();
            // Success alert
            alert(`${t('student.join_success')} ${result.data.groupName}!`);
            
            // Note: Components (student-dashboard-view, student-classes-view) use onSnapshot
            // on the student document, so they will automatically update when memberOfGroups changes.

        } catch (error) {
            console.error("Error joining class:", error);
            this.joinError = error.message || t('student.join_error');
        } finally {
            this.isJoining = false;
        }
    }

    renderNavItem(id, label, iconPath) {
        const isActive = this.currentView === id;
        return html`
            <button
                @click="${() => {
                    this.currentView = id;
                    this.isSidebarOpen = false;
                    this.selectedLessonId = null;
                    this.selectedClassId = null;
                }}"
                class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }"
            >
                <svg class="w-5 h-5 ${isActive ? 'text-indigo-600' : 'text-slate-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${iconPath}"></path>
                </svg>
                ${label}
            </button>
        `;
    }

    renderContent() {
        switch (this.currentView) {
            case 'lessons':
                if (this.selectedLessonId) {
                    return html`
                        <student-lesson-detail
                            .lessonId="${this.selectedLessonId}"
                            .studentId="${this.user.uid}"
                            @back-to-list="${() => this.selectedLessonId = null}">
                        </student-lesson-detail>
                    `;
                }
                return html`
                    <student-lesson-list
                        .user="${this.user}"
                        @lesson-selected="${(e) => {
                            this.selectedLessonId = e.detail.lessonId;
                        }}">
                    </student-lesson-list>
                `;
            case 'classes':
                if (this.selectedClassId) {
                    return html`
                        <student-class-detail
                            .groupId="${this.selectedClassId}"
                            .studentId="${this.user.uid}"
                            @back-to-classes="${() => this.selectedClassId = null}"
                            @lesson-selected="${(e) => {
                                this.selectedLessonId = e.detail.lessonId;
                                this.currentView = 'lessons';
                            }}">
                        </student-class-detail>
                    `;
                }
                return html`
                    <student-classes-view
                        .user="${this.user}"
                        @request-join-class="${(e) => this.isJoinModalOpen = true}"
                        @class-selected="${(e) => {
                            this.selectedClassId = e.detail.groupId;
                        }}">
                    </student-classes-view>
                `;
            case 'dashboard':
            default:
                return html`
        <div class="space-y-6 animate-fade-in-up">
            <div class="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-3xl p-8 text-white shadow-lg relative overflow-hidden">
                <div class="relative z-10">
                    <h2 class="text-3xl font-extrabold mb-2">
                        ${this.t('student.dashboard.welcome')}, ${this.user.email.split('@')[0]}! 👋
                    </h2>
                    <p class="text-indigo-100 text-lg opacity-90">
                        ${this.t('student.dashboard.welcome_subtitle') || 'Vítejte ve svém studijním centru.'}
                    </p>
                </div>
                <div class="absolute right-0 top-0 h-full w-1/3 bg-white/10 transform skew-x-12 translate-x-12"></div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                <div @click="${() => this.isJoinModalOpen = true}"
                     class="bg-white p-6 rounded-3xl shadow-sm hover:shadow-md transition-all cursor-pointer border-2 border-dashed border-indigo-100 hover:border-indigo-300 group flex flex-col items-center justify-center text-center h-48">
                    <div class="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-3xl mb-3 group-hover:scale-110 transition-transform">
                        🚀
                    </div>
                    <h3 class="font-bold text-slate-800 text-lg">${this.t('student.join_class')}</h3>
                    <p class="text-sm text-slate-500 mt-1">${this.t('student.enter_code')}</p>
                </div>

                <div @click="${() => this.currentView = 'classes'}"
                     class="bg-white p-6 rounded-3xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-slate-100 group relative overflow-hidden h-48">
                    <div class="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div class="relative z-10 flex flex-col h-full justify-between">
                        <div class="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center text-2xl">
                            📚
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-800 text-lg">${this.t('student.classes_card_title')}</h3>
                            <p class="text-sm text-slate-500">${this.t('student.classes_card_desc')}</p>
                        </div>
                    </div>
                </div>

                <div @click="${() => this.currentView = 'lessons'}"
                     class="bg-white p-6 rounded-3xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-slate-100 group relative overflow-hidden h-48">
                    <div class="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div class="relative z-10 flex flex-col h-full justify-between">
                        <div class="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl">
                            🎓
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-800 text-lg">${this.t('student.lessons_card_title')}</h3>
                            <p class="text-sm text-slate-500">${this.t('student.lessons_card_desc')}</p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
                `;
        }
    }

    async handleLogout() {
        try {
            sessionStorage.removeItem('userRole');
            await signOut(auth);
            window.location.reload();
        } catch (error) {
            console.error('Logout failed:', error);
        }
    }
}

customElements.define('student-dashboard', StudentDashboard);

export function initStudentApp(user) {
    const app = document.createElement('student-dashboard');
    app.user = user;

    const container = document.getElementById('role-content-wrapper');
    if (container) {
        container.innerHTML = '';
        container.appendChild(app);
    }
}

import { db, auth, functions } from '../../firebase-init.js';
import '../../components/guide-bot.js';
import {
    collection,
    query,
    where,
    doc,
    onSnapshot,
    orderBy,
    limit,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { showToast, getCollectionPath } from '../../utils/utils.js';
import { translationService } from '../../utils/translation-service.js';
import { Localized } from '../../utils/localization-mixin.js';

import './student-classes-view.js';
import './student-lesson-list.js';
import './student-lesson-detail.js';
import './student-class-detail.js';
import './student-practice-view.js';
import '../../views/professor/pedagogical-practice/pedagogical-practice-view.js';

class StudentDashboard extends Localized(LitElement) {
    static properties = {
        user: { type: Object },
        studentData: { type: Object },
        lastLesson: { type: Object },
        currentView: { type: String },
        selectedLessonId: { type: String },
        selectedClassId: { type: String },
        isSidebarOpen: { type: Boolean },
        isJoinModalOpen: { type: Boolean },
        joinCode: { type: String },
        joinError: { type: String },
        isJoining: { type: Boolean }
    };

    constructor() {
        super();
        this.user = null;
        this.studentData = null;
        this.lastLesson = null;
        this.currentView = 'dashboard';
        this.selectedLessonId = null;
        this.selectedClassId = null;
        this.isSidebarOpen = false;
        this.isJoinModalOpen = false;
        this.joinCode = '';
        this.joinError = '';
        this.isJoining = false;
        this._unsubStudent = null;
        this._unsubLesson = null;
        this._boundHandleHashChange = this._handleHashChange.bind(this);
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this._initData();
        window.addEventListener('hashchange', this._boundHandleHashChange);
        // Handle initial hash
        setTimeout(() => this._handleHashChange(), 0);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubStudent) this._unsubStudent();
        if (this._unsubLesson) this._unsubLesson();
        window.removeEventListener('hashchange', this._boundHandleHashChange);
    }

    _handleHashChange() {
        const hash = window.location.hash;
        if (!hash) return;

        // Pattern: #student/class/:classId/lesson/:lessonId
        // Matches standard Firestore IDs
        const lessonMatch = hash.match(/^#student\/class\/([a-zA-Z0-9_-]+)\/lesson\/([a-zA-Z0-9_-]+)$/);

        if (lessonMatch) {
            const [_, classId, lessonId] = lessonMatch;
            console.log("Routing to lesson:", lessonId, "from class:", classId);
            this.selectedClassId = classId;
            this.selectedLessonId = lessonId;
            this.currentView = 'lessons';
            return;
        }

        if (hash === '#practice-portfolio') {
            this.currentView = 'pedagogical-practice';
            this.selectedLessonId = null;
            this.selectedClassId = null;
        }
    }

    updated(changedProperties) {
        if (changedProperties.has('user') && this.user) {
            this._initData();
        }
    }

    _initData() {
        if (!this.user) return;

        // 1. Fetch student data (streak, groups)
        if (this._unsubStudent) this._unsubStudent();

        // Standard Mode: Listen to users/students profile
        const studentsPath = getCollectionPath('students');
        try {
            this._unsubStudent = onSnapshot(doc(db, studentsPath, this.user.uid), (docSnap) => {
                if (docSnap.exists()) {
                    this.studentData = docSnap.data();
                    this._fetchLastLesson();
                }
            }, (error) => {
                console.error("Error fetching student data:", error);
            });
        } catch (e) {
            console.error("Error setting up student listener:", e);
        }
    }

    _fetchLastLesson() {
        if (!this.studentData || !this.studentData.memberOfGroups || this.studentData.memberOfGroups.length === 0) {
            this.lastLesson = null;
            return;
        }

        // 2. Fetch most recent active lesson
        // Firestore 'array-contains-any' query limit is 10.
        let groups = this.studentData.memberOfGroups;
        if (groups.length > 10) groups = groups.slice(0, 10);

        try {
            const lessonsPath = getCollectionPath('lessons');
            const q = query(
                collection(db, lessonsPath),
                where('assignedToGroups', 'array-contains-any', groups),
                where('isPublished', '==', true),
                orderBy('createdAt', 'desc'),
                limit(1)
            );

            if (this._unsubLesson) this._unsubLesson();
            this._unsubLesson = onSnapshot(q, (snapshot) => {
                if (!snapshot.empty) {
                    const doc = snapshot.docs[0];
                    this.lastLesson = { id: doc.id, ...doc.data() };
                } else {
                    this.lastLesson = null;
                }
            }, (error) => {
                console.error("Error fetching last lesson:", error);
                // Fallback if index missing or other error
                this.lastLesson = null;
            });
        } catch (e) {
            console.error("Query creation failed", e);
        }
    }

    render() {
        if (!this.user) return html`<div>${this.t('common.loading')}</div>`;

        return html`
            <div class="h-full overflow-hidden bg-slate-50 flex relative">
                <!-- Desktop Sidebar (Hidden on Mobile) -->
                <nav class="hidden md:flex flex-col fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 z-50">
                    <div class="flex flex-col h-full">
                        <div class="p-6 border-b border-slate-200">
                            <h1 class="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <span class="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-lg">S</span>
                                ${this.t('common.app_name') || 'AI Sensei'}
                            </h1>
                            <p class="text-sm text-slate-500 mt-1">${this.t('student.portal_title')}</p>
                        </div>

                        <div class="flex-1 overflow-y-auto py-6 px-3">
                            <div class="space-y-1">
                                ${this.renderNavItem('dashboard', this.t('student.overview') || 'Přehled', 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6')}
                                ${this.renderNavItem('lessons', this.t('student.my_lessons') || 'Moje lekce', 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253')}
                                ${this.renderNavItem('classes', this.t('student.my_classes') || 'Moje třídy', 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4')}
                                ${this.renderNavItem('practice', this.t('student.practice') || 'Odborný výcvik', 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10')}
                                ${this.renderNavItem('pedagogical-practice', 'Praxe', 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4')}
                            </div>
                        </div>

                        <div class="p-4 border-t border-slate-200">
                            <div class="flex items-center gap-3 mb-4 px-2">
                                <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                                    ${this.user.email[0].toUpperCase()}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm font-medium text-slate-900 truncate">${this.user.email}</p>
                                    <p class="text-xs text-slate-500">${this.t('student.role_label')}</p>
                                </div>
                            </div>
                            <button @click="${this.handleLogout}" class="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors active:scale-95 transform duration-200">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                                </svg>
                                ${this.t('auth.logout')}
                            </button>
                        </div>
                    </div>
                </nav>

                <!-- Mobile Bottom Navigation (Visible on Mobile) -->
                <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-[60] pb-safe">
                    <div class="flex justify-around items-center h-16">
                        ${this.renderMobileNavItem('dashboard', 'Přehled', 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6')}
                        ${this.renderMobileNavItem('classes', 'Třídy', 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4')}
                        ${this.renderMobileNavItem('lessons', 'Lekce', 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253')}
                        ${this.renderMobileNavItem('practice', 'Výcvik', 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10')}
                        ${this.renderMobileNavItem('pedagogical-practice', 'Praxe', 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4')}
                        ${this.renderMobileNavItem('profile', 'Profil', 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z')}
                    </div>
                </nav>

                <main class="flex-1 md:ml-64 h-full overflow-y-auto transition-all duration-200 pb-24 md:pb-0">
                    <div class="p-6 md:p-8 max-w-7xl mx-auto">
                        ${this.renderContent()}
                    </div>
                </main>

                ${this.isJoinModalOpen ? this.renderJoinClassModal() : ''}

                <guide-bot
                    .userRole=${'student'}
                    .currentView=${this.currentView}
                    .contextData=${this.lastLesson}
                ></guide-bot>
            </div>
        `;
    }

    renderJoinClassModal() {
        return html`
            <div class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4" @click="${(e) => { if(e.target === e.currentTarget) this._closeJoinClassModal(); }}">
                <div class="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up p-8 text-center relative">

                    <button @click="${this._closeJoinClassModal}" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-2 active:scale-95 transform duration-200">
                         <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>

                    <div class="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4">
                        🚀
                    </div>

                    <h3 class="text-2xl font-bold text-slate-900 mb-2">${this.t('student.join_class')}</h3>
                    <p class="text-slate-500 mb-6">${this.t('student.enter_code')}</p>

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
                            class="w-full px-6 py-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-transform active:scale-95 duration-200 font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                        >
                            ${this.isJoining ? html`<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>` : ''}
                            ${this.t('student.join_btn')}
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
        if (!this.joinCode) {
            showToast(this.t('student.enter_code'), true);
            return;
        }

        this.isJoining = true;
        this.joinError = '';

        try {
            const joinClass = httpsCallable(functions, 'joinClass');
            const result = await joinClass({ joinCode: this.joinCode });

            this._closeJoinClassModal();
            // Success alert
            alert(`${this.t('student.join_success')} ${result.data.groupName}!`);
            
        } catch (error) {
            console.error("Error joining class:", error);
            this.joinError = error.message || this.t('student.join_error');
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
                    this.selectedLessonId = null;
                    this.selectedClassId = null;
                }}"
                class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 active:scale-95 transform ${
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

    renderMobileNavItem(id, label, iconPath) {
        const isActive = this.currentView === id;
        return html`
            <button
                @click="${() => {
                    this.currentView = id;
                    this.selectedLessonId = null;
                    this.selectedClassId = null;
                }}"
                class="flex flex-col items-center justify-center w-full h-full space-y-1 active:scale-90 transition-transform duration-200"
            >
                <div class="${isActive ? 'text-indigo-600' : 'text-slate-400'}">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${iconPath}"></path>
                    </svg>
                </div>
                <span class="text-[10px] font-medium ${isActive ? 'text-indigo-600' : 'text-slate-500'}">${label}</span>
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
            case 'practice':
                return html`<student-practice-view></student-practice-view>`;
            case 'pedagogical-practice':
                return html`<pedagogical-practice-view .studentId="${this.user.uid}"></pedagogical-practice-view>`;
            case 'profile':
                return html`
                    <div class="animate-fade-in-up space-y-6">
                        <h2 class="text-2xl font-bold text-slate-900">Můj profil</h2>

                        <div class="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 flex flex-col items-center text-center">
                            <div class="w-24 h-24 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-3xl mb-4">
                                ${this.user.email[0].toUpperCase()}
                            </div>
                            <h3 class="text-xl font-bold text-slate-900">${this.user.email}</h3>
                            <p class="text-slate-500 mb-6">${this.t('student.role_label')}</p>

                            <button @click="${this.handleLogout}" class="w-full max-w-sm flex items-center justify-center gap-2 px-6 py-4 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-all font-bold active:scale-95 transform duration-200">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                                </svg>
                                ${this.t('auth.logout')}
                            </button>
                        </div>

                        <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                            <h3 class="font-bold text-slate-900 mb-4">Statistiky</h3>
                            <div class="flex items-center gap-4">
                                <div class="bg-orange-100 p-3 rounded-xl text-orange-600">🔥</div>
                                <div>
                                    <p class="text-sm text-slate-500">Dní v řadě</p>
                                    <p class="font-bold text-slate-900 text-lg">${this.studentData?.streak || 0}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            case 'dashboard':
            default:
                const streakCount = this.studentData?.streak || 0;

                return html`
        <div class="space-y-8 animate-fade-in-up pb-10">
            <!-- Hero Card -->
            <div class="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-3xl p-6 md:p-8 text-white shadow-lg shadow-indigo-200 relative overflow-hidden">
                <div class="relative z-10">
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h2 class="text-2xl md:text-3xl font-extrabold mb-2">
                                ${this.t('student.dashboard.welcome')}, ${this.user.email.split('@')[0]}! 👋
                            </h2>
                            <p class="text-indigo-100 text-base md:text-lg opacity-90">
                                ${this.t('student.dashboard.welcome_subtitle') || 'Vítejte ve svém studijním centru.'}
                            </p>
                        </div>
                        <!-- Streak Counter -->
                        <div class="bg-white/20 backdrop-blur-md rounded-2xl px-4 py-2 flex items-center gap-2 border border-white/10 shadow-sm self-start md:self-auto">
                            <span class="text-xl">🔥</span>
                            <span class="font-bold text-white text-lg">${streakCount} ${this.t('student.dashboard.days_in_row') || 'dní v řadě'}</span>
                        </div>
                    </div>
                </div>
                <div class="absolute right-0 top-0 h-full w-1/3 bg-white/10 transform skew-x-12 translate-x-12 pointer-events-none"></div>
            </div>

            <!-- Primary Action: Continue Learning -->
            <div class="space-y-4">
                <h3 class="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <span class="text-2xl">▶️</span>
                    ${this.t('student.continue_learning') || 'Pokračovat ve výuce'}
                </h3>

                ${this.lastLesson ? html`
                    <div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-lg transition-shadow duration-300 group cursor-pointer"
                         @click="${() => {
                            this.selectedLessonId = this.lastLesson.id;
                            this.currentView = 'lessons';
                        }}">
                        <div class="flex flex-col md:flex-row">
                             <div class="h-32 md:h-auto md:w-1/3 bg-slate-100 relative overflow-hidden">
                                <!-- Placeholder or Image -->
                                <div class="absolute inset-0 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px] opacity-10"></div>
                                <div class="absolute inset-0 flex items-center justify-center text-6xl transform group-hover:scale-110 transition-transform duration-500">
                                    📚
                                </div>
                            </div>
                            <div class="p-6 md:p-8 flex-1 flex flex-col justify-center">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-wide">
                                        ${this.lastLesson.subject || 'Lekce'}
                                    </span>
                                    <span class="text-xs text-slate-400 font-medium flex items-center gap-1">
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                        ${new Date(this.lastLesson.createdAt?.seconds ? this.lastLesson.createdAt.toDate() : new Date()).toLocaleDateString('cs-CZ')}
                                    </span>
                                </div>
                                <h3 class="text-2xl font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">${this.lastLesson.title}</h3>
                                <p class="text-slate-500 mb-6 line-clamp-2">${this.lastLesson.subtitle || 'Klikněte pro pokračování v lekci...'}</p>

                                <button class="w-full md:w-auto px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95 transform duration-200 flex items-center justify-center gap-2">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                    ${this.t('student.start_resume') || 'Pokračovat'}
                                </button>
                            </div>
                        </div>
                    </div>
                ` : html`
                     <div class="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 text-center py-12">
                        <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 text-slate-300">
                            📭
                        </div>
                        <h3 class="text-lg font-bold text-slate-900 mb-1">Žádné aktivní lekce</h3>
                        <p class="text-slate-500 mb-6 max-w-sm mx-auto">Zatím nemáte žádné lekce k dokončení. Připojte se k třídě nebo počkejte na nové úkoly.</p>
                        <button @click="${() => this.currentView = 'classes'}" class="px-6 py-3 bg-white border-2 border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95 transform duration-200">
                            Přejít do tříd
                        </button>
                    </div>
                `}
            </div>

            <!-- Secondary Actions -->
            <div class="space-y-4">
                <h3 class="text-lg font-bold text-slate-900 opacity-80 pl-1">Rychlé akce</h3>

                <div class="grid grid-cols-2 gap-4 md:gap-6">
                    <!-- 1. Join Class -->
                    <button @click="${() => this.isJoinModalOpen = true}"
                         class="bg-white p-4 md:p-6 rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-95 duration-200 border-2 border-dashed border-indigo-100 hover:border-indigo-300 group flex flex-col items-center justify-center text-center h-40">
                        <div class="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform">
                            🚀
                        </div>
                        <span class="font-bold text-slate-800 text-base leading-tight">${this.t('student.join_class')}</span>
                        <span class="text-xs text-slate-400 mt-1 hidden md:inline">${this.t('student.enter_code')}</span>
                    </button>

                    <!-- 2. My Classes -->
                    <button @click="${() => this.currentView = 'classes'}"
                         class="bg-white p-4 md:p-6 rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-95 duration-200 border border-slate-100 group flex flex-col items-center justify-center text-center h-40">
                         <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform">
                            📚
                        </div>
                        <span class="font-bold text-slate-800 text-base leading-tight">${this.t('student.my_classes')}</span>
                        <span class="text-xs text-slate-400 mt-1 hidden md:inline">Spravovat třídy</span>
                    </button>
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

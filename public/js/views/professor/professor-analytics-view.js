// public/js/views/professor/professor-analytics-view.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';
import { translationService } from '../../utils/translation-service.js';

export class ProfessorAnalyticsView extends LitElement {
    static properties = {
        _analyticsData: { state: true, type: Object },
        _isLoading: { state: true, type: Boolean },
        _error: { state: true, type: String },
    };

    constructor() {
        super();
        this._analyticsData = null;
        this._isLoading = true;
        this._error = null;
        this._unsubscribeListeners = [];
        this._lessonIds = [];
        this._groupIds = [];
        this._quizSubmissions = new Map();
        this._testSubmissions = new Map();
        this._students = new Map();
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
        this._unsubscribeListeners = [];
        if (this._langUnsubscribe) {
            this._langUnsubscribe();
        }
    }

    _createBatchedListeners(collectionName, field, values, operator = 'in') {
        const BATCH_SIZE = 30;
        const unsubscribes = [];

        if (values.length === 0) {
            // Clear previous data if there are no values to listen for
            if (collectionName === 'quiz_submissions') this._quizSubmissions.clear();
            if (collectionName === 'test_submissions') this._testSubmissions.clear();
            if (collectionName === 'students') this._students.clear();
            this._recalculateAnalytics();
            return [];
        }

        // Split values into chunks of 30
        for (let i = 0; i < values.length; i += BATCH_SIZE) {
            const batch = values.slice(i, i + BATCH_SIZE);
            const q = query(collection(firebaseInit.db, collectionName), where(field, operator, batch));

            const unsub = onSnapshot(q, (snapshot) => {
                let targetMap;
                if (collectionName === 'quiz_submissions') targetMap = this._quizSubmissions;
                else if (collectionName === 'test_submissions') targetMap = this._testSubmissions;
                else if (collectionName === 'students') targetMap = this._students;
                else return;

                snapshot.docChanges().forEach((change) => {
                    if (change.type === "removed") {
                        targetMap.delete(change.doc.id);
                    } else {
                        targetMap.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
                    }
                });
                this._recalculateAnalytics();
            }, (error) => {
                console.error(`Error listening to ${collectionName}:`, error);
                this._error = `${translationService.t('analytics.fetch_error')} (${collectionName}).`;
                showToast(`Chyba: ${error.message}`, true);
            });
            unsubscribes.push(unsub);
        }
        return unsubscribes;
    }

    _initializeListeners() {
        this._isLoading = true;
        this._error = null;
        const currentUser = firebaseInit.auth.currentUser;

        if (!currentUser) {
            this._error = translationService.t('analytics.login_required');
            this._isLoading = false;
            return;
        }

        // 1. Listen to professor's lessons
        const lessonsQuery = query(collection(firebaseInit.db, 'lessons'), where("ownerId", "==", currentUser.uid));
        const unsubLessons = onSnapshot(lessonsQuery, (snapshot) => {
            this._lessonIds = snapshot.docs.map(doc => doc.id);
            // Re-create submission listeners when lessons change
            this._unsubscribeByIds('submissions');
            const submissionUnsubs = [
                ...this._createBatchedListeners('quiz_submissions', 'lessonId', this._lessonIds),
                ...this._createBatchedListeners('test_submissions', 'lessonId', this._lessonIds)
            ];
            submissionUnsubs.forEach(unsub => this._unsubscribeListeners.push({id: 'submissions', unsub}));
        });
        this._unsubscribeListeners.push({ id: 'lessons', unsub: unsubLessons });

        // 2. Listen to professor's groups
        const groupsQuery = query(collection(firebaseInit.db, 'groups'), where("ownerId", "==", currentUser.uid));
        const unsubGroups = onSnapshot(groupsQuery, (snapshot) => {
            this._groupIds = snapshot.docs.map(doc => doc.id);
            // Re-create student listeners when groups change
            this._unsubscribeByIds('students');
            const studentUnsubs = this._createBatchedListeners('students', 'memberOfGroups', this._groupIds, 'array-contains-any');
            studentUnsubs.forEach(unsub => this._unsubscribeListeners.push({ id: 'students', unsub }));
        });
        this._unsubscribeListeners.push({ id: 'groups', unsub: unsubGroups });
    }

    // Helper to remove a group of listeners before recreating them
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


    _recalculateAnalytics() {
        if (!this._lessonIds || !this._groupIds) return;

        const students = Array.from(this._students.values());
        const quizSubmissions = Array.from(this._quizSubmissions.values());
        const testSubmissions = Array.from(this._testSubmissions.values());

        if (this._lessonIds.length === 0) {
            this._analyticsData = {
                studentCount: 0, avgQuizScore: 0, quizSubmissionCount: 0,
                avgTestScore: 0, testSubmissionCount: 0, topStudents: []
            };
            this._isLoading = false;
            return;
        }

        const totalQuizScore = quizSubmissions.reduce((acc, sub) => acc + (sub.score || 0), 0);
        const totalTestScore = testSubmissions.reduce((acc, sub) => acc + (sub.score || 0), 0);

        const studentSubmissions = {};
        [...quizSubmissions, ...testSubmissions].forEach(sub => {
            studentSubmissions[sub.studentId] = (studentSubmissions[sub.studentId] || 0) + 1;
        });

        const topStudentIds = Object.entries(studentSubmissions)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const studentIdToNameMap = new Map(students.map(s => [s.id, s.name || translationService.t('analytics.unknown_student')]));

        const topStudents = topStudentIds.map(([studentId, submissions]) => ({
            name: studentIdToNameMap.get(studentId) || translationService.t('analytics.unknown_student'),
            submissions,
        }));

        this._analyticsData = {
            studentCount: students.length,
            avgQuizScore: quizSubmissions.length > 0 ? Math.round(totalQuizScore / quizSubmissions.length) : 0,
            quizSubmissionCount: quizSubmissions.length,
            avgTestScore: testSubmissions.length > 0 ? Math.round(totalTestScore / testSubmissions.length) : 0,
            testSubmissionCount: testSubmissions.length,
            topStudents
        };
        this._isLoading = false; // Data is ready to be displayed
    }

    _createStatCard(title, value, emoji, subtitle = '') {
        return html`
            <div class="bg-white p-6 rounded-xl shadow-lg flex items-center space-x-4">
                <div class="text-4xl">${emoji}</div>
                <div>
                    <h4 class="text-sm font-medium text-slate-500 uppercase tracking-wider">${title}</h4>
                    <p class="text-3xl font-bold text-slate-900">${value}</p>
                    ${subtitle ? html`<p class="text-xs text-slate-400 mt-1">${subtitle}</p>` : ''}
                </div>
            </div>`;
    }

    renderContent() {
        const t = (key, params) => translationService.t(key, params);
        const data = this._analyticsData;
        
        const topStudentsHtml = (data.topStudents || []).map(student => html`
            <li class="flex justify-between items-center py-2 border-b last:border-b-0">
                <span class="text-slate-700">${student.name}</span>
                <span class="font-semibold text-green-700">${student.submissions} ${t('analytics.submissions_count')}</span>
            </li>`);

        return html`
            <div id="analytics-content" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${this._createStatCard(t('analytics.total_students'), data.studentCount, '👥')}
                ${this._createStatCard(t('analytics.avg_quiz_score'), `${data.avgQuizScore}%`, '❓', `(${t('analytics.from_submissions', { count: data.quizSubmissionCount })})`)}
                ${this._createStatCard(t('analytics.avg_test_score'), `${data.avgTestScore}%`, '✅', `(${t('analytics.from_submissions', { count: data.testSubmissionCount })})`)}
                
                <div class="bg-white p-6 rounded-xl shadow-lg md:col-span-2 lg:col-span-3">
                    <h4 class="text-lg font-semibold text-slate-800 mb-4">${t('analytics.top_students')}</h4>
                    <ul class="divide-y divide-slate-100">
                        ${topStudentsHtml.length > 0 ? topStudentsHtml : html`<p class="text-slate-500 py-4">${t('analytics.no_activity')}</p>`}
                    </ul>
                </div>
            </div>
        `;
    }

    render() {
        const t = (key) => translationService.t(key);
        let content;
        if (this._isLoading) {
            content = html`<div id="analytics-loading" class="text-center text-slate-500"><p>${t('analytics.loading')}</p></div>`;
        } else if (this._error) {
            content = html`<div id="analytics-loading" class="text-center text-red-500"><p>${this._error}</p></div>`;
        } else if (this._analyticsData) {
            content = this.renderContent();
        } else {
             content = html`<div id="analytics-loading" class="text-center text-slate-500"><p>${t('analytics.no_data')}</p></div>`;
        }
        
        return html`
            <div class="p-6 md:p-8">
                <h2 class="text-3xl font-extrabold text-slate-800 mb-6">${t('analytics.title')}</h2>
                ${content}
            </div>
        `;
    }
}

customElements.define('professor-analytics-view', ProfessorAnalyticsView);

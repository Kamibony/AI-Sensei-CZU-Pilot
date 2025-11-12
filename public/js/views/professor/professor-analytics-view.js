// public/js/views/professor/professor-analytics-view.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';

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
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._loadAnalytics();
    }

    async _fetchDataWithInQuery(collectionName, field, values, operator = 'in') {
        if (values.length === 0) return [];

        const BATCH_SIZE = 30;
        if (values.length > BATCH_SIZE) {
            console.warn(`Querying for ${values.length} items, which is more than the limit of ${BATCH_SIZE}. Truncating.`);
            values = values.slice(0, BATCH_SIZE);
        }

        const q = query(collection(firebaseInit.db, collectionName), where(field, operator, values));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async _loadAnalytics() {
        this._isLoading = true;
        this._error = null;
        const currentUser = firebaseInit.auth.currentUser;

        if (!currentUser) {
            this._error = "Pro zobrazení analýzy se musíte přihlásit.";
            this._isLoading = false;
            return;
        }

        try {
            // 1. Fetch professor's lessons to get their IDs
            const lessonsQuery = query(collection(firebaseInit.db, 'lessons'), where("ownerId", "==", currentUser.uid));
            const lessonsSnapshot = await getDocs(lessonsQuery);
            const lessonIds = lessonsSnapshot.docs.map(doc => doc.id);

            if (lessonIds.length === 0) {
                // If the professor has no lessons, they have no data to analyze.
                this._analyticsData = {
                    studentCount: 0,
                    avgQuizScore: 0,
                    quizSubmissionCount: 0,
                    avgTestScore: 0,
                    testSubmissionCount: 0,
                    topStudents: []
                };
                this._isLoading = false;
                return;
            }

            // 2. Fetch quiz and test submissions for those lessons
            const quizSubmissions = await this._fetchDataWithInQuery('quiz_submissions', 'lessonId', lessonIds);
            const testSubmissions = await this._fetchDataWithInQuery('test_submissions', 'lessonId', lessonIds);

            // 3. Fetch professor's groups and students
            const groupsQuery = query(collection(firebaseInit.db, 'groups'), where("ownerId", "==", currentUser.uid));
            const groupsSnapshot = await getDocs(groupsQuery);
            const groupIds = groupsSnapshot.docs.map(doc => doc.id);

            // Správne použitie 'array-contains-any' na nájdenie študentov v skupinách
            const students = groupIds.length > 0
                ? await this._fetchDataWithInQuery('students', 'memberOfGroups', groupIds, 'array-contains-any')
                : [];

            // 4. Calculate analytics client-side
            const totalQuizScore = quizSubmissions.reduce((acc, sub) => acc + (sub.score || 0), 0);
            const totalTestScore = testSubmissions.reduce((acc, sub) => acc + (sub.score || 0), 0);

            const studentSubmissions = {};
            [...quizSubmissions, ...testSubmissions].forEach(sub => {
                studentSubmissions[sub.studentId] = (studentSubmissions[sub.studentId] || 0) + 1;
            });

            const topStudentIds = Object.entries(studentSubmissions)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            const studentIdToNameMap = new Map(students.map(s => [s.id, s.name || 'Neznámý student']));

            const topStudents = topStudentIds.map(([studentId, submissions]) => ({
                name: studentIdToNameMap.get(studentId) || 'Neznámý student',
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

        } catch (error) {
            console.error("Error fetching analytics:", error);
            this._error = `Nepodařilo se načíst analytická data: ${error.message}`;
            showToast("Chyba při načítání analýzy.", true);
        } finally {
            this._isLoading = false;
        }
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
        const data = this._analyticsData;
        
        const topStudentsHtml = (data.topStudents || []).map(student => html`
            <li class="flex justify-between items-center py-2 border-b last:border-b-0">
                <span class="text-slate-700">${student.name}</span>
                <span class="font-semibold text-green-700">${student.submissions} odevzdání</span>
            </li>`);

        return html`
            <div id="analytics-content" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${this._createStatCard('Celkový počet studentů', data.studentCount, '👥')}
                ${this._createStatCard('Průměrné skóre (Kvízy)', `${data.avgQuizScore}%`, '❓', `(z ${data.quizSubmissionCount} odevzdání)`)}
                ${this._createStatCard('Průměrné skóre (Testy)', `${data.avgTestScore}%`, '✅', `(z ${data.testSubmissionCount} odevzdání)`)}
                
                <div class="bg-white p-6 rounded-xl shadow-lg md:col-span-2 lg:col-span-3">
                    <h4 class="text-lg font-semibold text-slate-800 mb-4">Top 5 nejaktivnějších studentů</h4>
                    <ul class="divide-y divide-slate-100">
                        ${topStudentsHtml.length > 0 ? topStudentsHtml : html`<p class="text-slate-500 py-4">Žádná aktivita k zobrazení.</p>`}
                    </ul>
                </div>
            </div>
        `;
    }

    render() {
        let content;
        if (this._isLoading) {
            content = html`<div id="analytics-loading" class="text-center text-slate-500"><p>Načítám analytická data...</p></div>`;
        } else if (this._error) {
            content = html`<div id="analytics-loading" class="text-center text-red-500"><p>${this._error}</p></div>`;
        } else if (this._analyticsData) {
            content = this.renderContent();
        } else {
             content = html`<div id="analytics-loading" class="text-center text-slate-500"><p>Žádná analytická data k dispozici.</p></div>`;
        }
        
        return html`
            <div class="p-6 md:p-8">
                <h2 class="text-3xl font-extrabold text-slate-800 mb-6">Analýza platformy</h2>
                ${content}
            </div>
        `;
    }
}

customElements.define('professor-analytics-view', ProfessorAnalyticsView);

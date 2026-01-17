import { LitElement, html, css } from "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js";
import { ProfessorDataService } from "../../services/professor-data-service.js";
import { collection, query, where, onSnapshot, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../firebase-init.js";

export class PracticeView extends LitElement {
    static properties = {
        groups: { type: Array },
        selectedGroupId: { type: String },
        activeSession: { type: Object },
        students: { type: Array },
        submissions: { type: Object }, // Map: studentId -> submission
        activeTask: { type: String },
        isRecording: { type: Boolean }
    };

    static styles = css`
        :host {
            display: block;
            padding: 24px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            margin-bottom: 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .card {
            background: white;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            margin-bottom: 24px;
        }
        .task-input-container {
            display: flex;
            gap: 12px;
            align-items: center;
        }
        textarea {
            flex: 1;
            padding: 12px;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            min-height: 80px;
            font-size: 16px;
        }
        .btn {
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            border: none;
            font-weight: 500;
            transition: all 0.2s;
        }
        .btn-primary {
            background: #2563eb;
            color: white;
        }
        .btn-record {
            background: #ef4444;
            color: white;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .btn-record.recording {
            animation: pulse 1.5s infinite;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 24px;
        }
        .student-card {
            background: white;
            border-radius: 12px;
            padding: 16px;
            border: 1px solid #e2e8f0;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .student-card.done {
            border-color: #22c55e;
            background-color: #f0fdf4;
        }
        .student-card.evaluating {
            border-color: #eab308;
            background-color: #fefce8;
        }
        .student-photo {
            width: 100%;
            height: 150px;
            object-fit: cover;
            border-radius: 8px;
            background: #f1f5f9;
        }
        .feedback {
            font-size: 14px;
            color: #475569;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid #e2e8f0;
        }
        .grade {
            font-weight: bold;
            font-size: 18px;
            color: #2563eb;
        }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
    `;

    constructor() {
        super();
        this.dataService = new ProfessorDataService();
        this.groups = [];
        this.selectedGroupId = null;
        this.activeSession = null;
        this.students = [];
        this.submissions = {};
        this.activeTask = "";
        this.isRecording = false;
        this._unsubscribeSession = null;
        this._unsubscribeSubmissions = null;
    }

    async firstUpdated() {
        await this._fetchGroups();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubscribeSession) this._unsubscribeSession();
        if (this._unsubscribeSubmissions) this._unsubscribeSubmissions();
    }

    async _fetchGroups() {
        if (!db) return;
        // Ideally we use dataService, but it returns all groups for the professor
        const groupsSnap = await this.dataService.fetchLessons(); // wait, fetchLessons returns lessons.
        // ProfessorDataService has getAdvancedAnalytics that fetches groups, but no simple fetchGroups.
        // Let's implement a simple fetch here or assume we can get it.
        // Actually, let's look at `professor-classes-view.js` logic if we can.
        // For now, I will use a direct query.
        try {
            const q = query(collection(db, 'groups'), where('ownerId', '==', this.dataService.auth.currentUser.uid));
            const snapshot = await getDocs(q);
            this.groups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Auto-select if only one
            if (this.groups.length === 1) {
                this._selectGroup(this.groups[0].id);
            }
        } catch (e) {
            console.error("Error fetching groups", e);
        }
    }

    async _selectGroup(groupId) {
        this.selectedGroupId = groupId;
        this.students = await this.dataService.getStudentsByGroup(groupId);

        // Listen for active session
        if (this._unsubscribeSession) this._unsubscribeSession();

        const sessionsRef = collection(db, 'practical_sessions');
        const q = query(sessionsRef, where('groupId', '==', groupId), where('status', '==', 'active'), orderBy('startTime', 'desc')); // limit 1 not supported in snapshot listener directly easily with ordering? Actually it is.

        this._unsubscribeSession = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                this.activeSession = { id: doc.id, ...doc.data() };
                this.activeTask = this.activeSession.activeTask || "";
                this._listenForSubmissions(this.activeSession.id);
            } else {
                this.activeSession = null;
                this.activeTask = "";
                this.submissions = {};
            }
        });
    }

    _listenForSubmissions(sessionId) {
        if (this._unsubscribeSubmissions) this._unsubscribeSubmissions();

        const q = query(collection(db, 'practical_submissions'), where('sessionId', '==', sessionId));
        this._unsubscribeSubmissions = onSnapshot(q, (snapshot) => {
            const subs = {};
            snapshot.forEach(doc => {
                const data = doc.data();
                subs[data.studentId] = { id: doc.id, ...data };
            });
            this.submissions = subs;
            this.requestUpdate();
        });
    }

    async _createSession() {
        if (!this.selectedGroupId) return;
        await this.dataService.createPracticalSession(this.selectedGroupId);
    }

    async _endSession() {
        if (!this.activeSession) return;
        await this.dataService.endPracticalSession(this.activeSession.id);
    }

    async _updateTask() {
        if (!this.activeSession) return;
        await this.dataService.updateActiveTask(this.activeSession.id, this.activeTask);
    }

    _handleVoiceInput() {
        if (!('webkitSpeechRecognition' in window)) {
            alert("Váš prohlížeč nepodporuje hlasové zadávání.");
            return;
        }

        if (this.isRecording) {
            this.recognition.stop();
            return;
        }

        this.recognition = new webkitSpeechRecognition();
        this.recognition.lang = 'cs-CZ';
        this.recognition.continuous = false;
        this.recognition.interimResults = false;

        this.recognition.onstart = () => {
            this.isRecording = true;
        };

        this.recognition.onend = () => {
            this.isRecording = false;
        };

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            this.activeTask = transcript;
            this._updateTask();
        };

        this.recognition.start();
    }

    render() {
        return html`
            <div class="container">
                <div class="header">
                    <h1 class="text-2xl font-bold">Odborný Výcvik (AI Mistr)</h1>
                    <div>
                        <select @change="${e => this._selectGroup(e.target.value)}" class="p-2 border rounded">
                            <option value="">Vyberte třídu</option>
                            ${this.groups.map(g => html`<option value="${g.id}" ?selected="${this.selectedGroupId === g.id}">${g.name}</option>`)}
                        </select>
                    </div>
                </div>

                ${this.selectedGroupId ? this._renderSessionControl() : html`<p>Pro zahájení vyberte třídu.</p>`}
            </div>
        `;
    }

    _renderSessionControl() {
        if (!this.activeSession) {
            return html`
                <div class="card text-center">
                    <h2 class="text-xl mb-4">Žádný aktivní výcvik</h2>
                    <button class="btn btn-primary" @click="${this._createSession}">Zahájit výcvik</button>
                </div>
            `;
        }

        return html`
            <div class="card">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold">Zadání úkolu</h2>
                    <button class="btn bg-red-600 text-white" @click="${this._endSession}">Ukončit výcvik</button>
                </div>

                <div class="task-input-container">
                    <textarea
                        .value="${this.activeTask}"
                        @input="${e => { this.activeTask = e.target.value; }}"
                        @blur="${this._updateTask}"
                        placeholder="Zadejte úkol pro studenty (např. 'Svařte dva pláty k sobě tupým svarem...')"
                    ></textarea>
                    <button class="btn btn-record ${this.isRecording ? 'recording' : ''}" @click="${this._handleVoiceInput}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                        ${this.isRecording ? 'Poslouchám...' : 'Diktovat'}
                    </button>
                </div>
            </div>

            <div class="grid">
                ${this.students.map(student => this._renderStudentCard(student))}
            </div>
        `;
    }

    _renderStudentCard(student) {
        const sub = this.submissions[student.id];
        let statusClass = "";
        if (sub) {
            if (sub.status === 'evaluated') statusClass = 'done';
            else if (sub.status === 'error') statusClass = 'error'; // Add error style
            else statusClass = 'evaluating';
        }

        return html`
            <div class="student-card ${statusClass}">
                <div class="font-bold text-lg">${student.name}</div>
                ${sub ? html`
                    ${sub.storagePath ? html`<p class="text-xs text-gray-500">Obrázek nahrán</p>` : ''} <!-- We might want to show the image if we have a URL, but storagePath needs fetching. For now keep simple -->
                    ${sub.status === 'evaluated' ? html`
                        <div class="grade">Známka: ${sub.grade}</div>
                        <div class="feedback">${sub.feedback}</div>
                    ` : sub.status === 'error' ? html`
                        <div class="text-red-500">Chyba: ${sub.error}</div>
                    ` : html`
                        <div class="text-blue-500 flex items-center gap-2">
                            <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            AI hodnotí...
                        </div>
                    `}
                ` : html`
                    <div class="text-gray-400 italic">Čeká se na vypracování...</div>
                `}
            </div>
        `;
    }
}
customElements.define('practice-view', PracticeView);

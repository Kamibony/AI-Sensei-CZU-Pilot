import { LitElement, html } from "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js";
import { ProfessorDataService } from "../../services/professor-data-service.js";
import { collection, query, where, onSnapshot, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../firebase-init.js";
import { SUBMISSION_STATUS, SUBMISSION_OUTCOME } from "../../shared-constants.js";

export class PracticeView extends LitElement {
    static properties = {
        groups: { type: Array },
        selectedGroupId: { type: String },
        activeSession: { type: Object },
        students: { type: Array },
        submissions: { type: Object }, // Map: studentId -> submission
        activeTask: { type: String },
        isRecording: { type: Boolean },
        hasSpeechSupport: { state: true },
        saveStatus: { type: String }
    };

    createRenderRoot() { return this; }

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
        this.hasSpeechSupport = false;
        this.saveStatus = 'Synced';
        this._unsubscribeSession = null;
        this._unsubscribeSubmissions = null;
        this._debounceTimer = null;
    }

    async firstUpdated() {
        this.hasSpeechSupport = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
        await this._fetchGroups();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubscribeSession) this._unsubscribeSession();
        if (this._unsubscribeSubmissions) this._unsubscribeSubmissions();
    }

    async _fetchGroups() {
        if (!db) return;
        try {
            const q = query(collection(db, 'groups'), where('ownerId', '==', this.dataService.auth.currentUser.uid));
            const snapshot = await getDocs(q);
            this.groups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

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

        this.activeTask = "";

        if (this._unsubscribeSession) this._unsubscribeSession();

        const sessionsRef = collection(db, 'practical_sessions');
        const q = query(sessionsRef, where('groupId', '==', groupId), where('status', '==', 'active'), orderBy('startTime', 'desc'));

        this._unsubscribeSession = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                this.activeSession = { id: doc.id, ...doc.data() };
                this.activeTask = this.activeSession.task || "";
                this._listenForSubmissions(this.activeSession.id);
            } else {
                this.activeSession = null;
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
        await this.dataService.createPracticalSession(this.selectedGroupId, this.activeTask);
    }

    async _endSession() {
        if (!this.activeSession) return;
        await this.dataService.endPracticalSession(this.activeSession.id);
    }

    async _updateTask() {
        if (!this.activeSession) return;
        this.saveStatus = 'Saving...';
        await this.dataService.updateActiveTask(this.activeSession.id, this.activeTask);
        this.saveStatus = 'Synced';
    }

    _handleInput(e) {
        if (this._debounceTimer) clearTimeout(this._debounceTimer);

        const newValue = e.target.value;
        this.activeTask = newValue;
        this.saveStatus = 'Typing...';

        console.log(`%c[Tracepoint A] View Layer: User typed '${newValue.substring(0, 20)}...'`, "color: blue; font-weight: bold");

        this._debounceTimer = setTimeout(() => {
             this._triggerAutoSave();
        }, 1000);
    }

    async _triggerAutoSave() {
        console.log(`%c[Tracepoint A] View Layer: Auto-Save Triggered`, "color: blue; font-weight: bold");
        await this._updateTask();
    }

    async _handleManualSave() {
        console.log(`%c[Tracepoint A] View Layer: Manual Save Triggered`, "color: blue; font-weight: bold");
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        await this._updateTask();
    }

    _handleVoiceInput() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Váš prohlížeč nepodporuje hlasové zadávání.");
            return;
        }

        if (this.isRecording) {
            if (this.recognition) this.recognition.stop();
            return;
        }

        this.recognition = new SpeechRecognition();
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
            const current = this.activeTask ? this.activeTask.trim() + " " : "";
            this.activeTask = current + transcript;
            this._updateTask();
        };

        try {
            this.recognition.start();
        } catch (e) {
            console.error("Speech recognition start failed", e);
            this.isRecording = false;
        }
    }

    async _handleDeleteSubmission(submissionId) {
        if(!confirm("Opravdu chcete smazat tuto práci? Student bude muset úkol vypracovat znovu.")) return;
        try {
            await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js").then(m => m.deleteDoc(m.doc(db, 'practical_submissions', submissionId)));
        } catch (e) {
            console.error("Delete failed", e);
            alert("Chyba při mazání.");
        }
    }

    _handleManualEvaluate(submissionId) {
        // Placeholder for manual evaluation logic
        console.log("Manual evaluate triggered for", submissionId);
        alert("Funkce ručního hodnocení zatím není implementována.");
    }

    render() {
        return html`
            <div class="max-w-7xl mx-auto p-6 space-y-8">
                <div class="flex flex-col md:flex-row justify-between items-center gap-4" data-tour="practice-header">
                    <h1 class="text-3xl font-extrabold text-slate-900 tracking-tight" data-tour="practice-title">Odborný Výcvik (AI Mistr)</h1>
                    <div class="relative" data-tour="practice-class-select">
                        <select @change="${e => this._selectGroup(e.target.value)}" class="appearance-none bg-white border border-slate-300 text-slate-700 py-2 px-4 pr-8 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium">
                            <option value="">Vyberte třídu</option>
                            ${this.groups.map(g => html`<option value="${g.id}" ?selected="${this.selectedGroupId === g.id}">${g.name}</option>`)}
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                </div>

                ${this.selectedGroupId ? this._renderSessionControl() : html`
                    <div class="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
                        <div class="flex">
                            <div class="flex-shrink-0">
                                <svg class="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>
                            </div>
                            <div class="ml-3">
                                <p class="text-sm text-blue-700">Pro zahájení výcviku vyberte třídu z nabídky nahoře.</p>
                            </div>
                        </div>
                    </div>
                `}
            </div>
        `;
    }

    _renderSessionControl() {
        const inputArea = html`
            <div class="flex gap-3 items-start">
                <textarea
                    class="flex-1 p-4 border border-slate-200 rounded-xl min-h-[120px] text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y transition-shadow shadow-sm"
                    .value="${this.activeTask}"
                    @input="${this._handleInput}"
                    placeholder="${this._hasSpeechSupport() ? "Zadejte úkol pro studenty..." : "Zadejte úkol (Hlasové zadávání není podporováno)"}"
                ></textarea>
                ${this.hasSpeechSupport ? html`
                <button
                    class="flex-shrink-0 p-4 rounded-xl transition-all shadow-sm ${this.isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}"
                    @click="${this._handleVoiceInput}"
                    title="${this.isRecording ? 'Zastavit nahrávání' : 'Diktovat úkol'}"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                </button>
                ` : ''}
            </div>
            <div class="flex justify-between items-center mt-3">
                 <div class="text-sm font-medium transition-colors flex items-center gap-2 ${this.saveStatus === 'Synced' ? 'text-green-600' : this.saveStatus === 'Saving...' ? 'text-amber-500' : 'text-slate-500'}">
                    ${this.saveStatus === 'Synced' ? html`<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Uloženo` : this.saveStatus}
                 </div>
                 <button class="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 rounded hover:bg-blue-50 transition-colors" ?disabled="${this.saveStatus === 'Synced' || this.saveStatus === 'Saving...'}" @click="${this._handleManualSave}">Uložit nyní</button>
            </div>
        `;

        if (!this.activeSession) {
            return html`
                <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8" data-tour="practice-session-control">
                    <h2 class="text-2xl font-bold text-slate-800 mb-6">Nový výcvik</h2>
                    ${inputArea}
                    <div class="mt-8 text-center">
                        <button class="bg-blue-600 text-white font-bold py-3 px-8 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed" ?disabled="${!this.activeTask || !this.activeTask.trim()}" @click="${this._createSession}">
                            Zahájit výcvik
                        </button>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-8 ring-1 ring-blue-100" data-tour="practice-session-control">
                <div class="flex justify-between items-center mb-6">
                    <div class="flex items-center gap-3">
                        <span class="relative flex h-3 w-3">
                          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                        </span>
                        <h2 class="text-xl font-bold text-slate-800">Probíhá výcvik</h2>
                    </div>
                    <button class="bg-red-50 text-red-600 hover:bg-red-100 font-semibold py-2 px-4 rounded-lg transition-colors border border-red-200" @click="${this._endSession}">
                        Ukončit výcvik
                    </button>
                </div>
                ${inputArea}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-tour="practice-student-grid">
                ${this.students.map(student => this._renderStudentCard(student))}
            </div>
        `;
    }

    _hasSpeechSupport() {
        return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    }

    _renderStudentCard(student) {
        const sub = this.submissions[student.id];

        let statusBadge = html`<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">Čeká se</span>`;
        let cardBorder = "border-slate-200";
        let cardBg = "bg-white";

        if (sub) {
            if (sub.status === SUBMISSION_STATUS.EVALUATED) {
                if (sub.result === SUBMISSION_OUTCOME.FAIL) {
                    statusBadge = html`<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Neprošlo</span>`;
                    cardBorder = "border-red-200";
                    cardBg = "bg-red-50/50";
                } else {
                    statusBadge = html`<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Splněno</span>`;
                    cardBorder = "border-green-200";
                    cardBg = "bg-green-50/50";
                }
            } else if (sub.status === SUBMISSION_STATUS.ERROR) {
                statusBadge = html`<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Chyba</span>`;
                cardBorder = "border-red-300";
            } else {
                statusBadge = html`<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 animate-pulse">Zpracovává se</span>`;
                cardBorder = "border-yellow-200";
                cardBg = "bg-yellow-50/50";
            }
        }

        return html`
            <div class="group relative flex flex-col ${cardBg} border ${cardBorder} rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
                <!-- Header -->
                <div class="p-4 border-b ${cardBorder} flex justify-between items-center bg-white/50 backdrop-blur-sm">
                    <h3 class="font-bold text-slate-900 truncate" title="${student.name}">${student.name}</h3>
                    ${statusBadge}
                </div>

                <!-- Body -->
                <div class="p-4 flex-1">
                    ${sub ? html`
                        ${sub.imageUrl ? html`
                            <a href="${sub.imageUrl}" target="_blank" class="block relative group/image overflow-hidden rounded-lg cursor-zoom-in">
                                <img
                                    src="${sub.imageUrl}"
                                    alt="Práce studenta"
                                    class="w-full h-48 object-cover rounded-lg transform group-hover/image:scale-105 transition-transform duration-300"
                                    loading="lazy"
                                >
                                <div class="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-colors flex items-center justify-center">
                                    <div class="opacity-0 group-hover/image:opacity-100 bg-white/90 p-2 rounded-full shadow-lg transition-opacity">
                                        <svg class="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"></path></svg>
                                    </div>
                                </div>
                            </a>
                        ` : sub.storagePath ? html`
                            <div class="w-full h-48 bg-slate-100 rounded-lg flex flex-col items-center justify-center text-slate-400 gap-2">
                                <svg class="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                <span class="text-xs font-medium">Načítání obrázku...</span>
                            </div>
                        ` : ''}

                        ${sub.status === SUBMISSION_STATUS.EVALUATED ? html`
                            <div class="mt-4">
                                <div class="flex items-center justify-between mb-2">
                                    <span class="text-xs font-bold text-slate-500 uppercase tracking-wide">Hodnocení AI</span>
                                    <span class="text-lg font-bold ${sub.result === SUBMISSION_OUTCOME.FAIL ? 'text-red-600' : 'text-blue-600'}">${sub.grade}</span>
                                </div>
                                <p class="text-sm text-slate-600 bg-white/50 p-2 rounded-lg border border-slate-100">${sub.feedback}</p>
                            </div>
                        ` : sub.status === SUBMISSION_STATUS.ERROR ? html`
                            <div class="mt-4 text-red-500 text-sm bg-red-50 p-2 rounded-lg border border-red-100">
                                <strong>Chyba:</strong> ${sub.error}
                            </div>
                        ` : html`
                            <div class="mt-4 flex items-center gap-2 text-blue-600 text-sm bg-blue-50 p-2 rounded-lg border border-blue-100">
                                <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Probíhá analýza...
                            </div>
                        `}
                    ` : html`
                        <div class="h-48 flex items-center justify-center text-slate-300 border-2 border-dashed border-slate-200 rounded-lg">
                            <div class="text-center">
                                <svg class="mx-auto h-8 w-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span class="block mt-1 text-sm">Čeká na odevzdání</span>
                            </div>
                        </div>
                    `}
                </div>

                <!-- Footer (Actions) -->
                ${sub ? html`
                <div class="p-4 bg-slate-50 border-t ${cardBorder} flex justify-end gap-2">
                    <button
                        @click="${() => this._handleManualEvaluate(sub.id)}"
                        class="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Znovu vyhodnotit (Manuálně)"
                    >
                        Přehoodnotit
                    </button>
                    <button
                        @click="${() => this._handleDeleteSubmission(sub.id)}"
                        class="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Smazat pokus a nechat studenta opakovat"
                    >
                        Resetovat
                    </button>
                </div>
                ` : ''}
            </div>
        `;
    }
}
customElements.define('practice-view', PracticeView);

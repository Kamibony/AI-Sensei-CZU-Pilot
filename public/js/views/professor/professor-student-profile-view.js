// public/js/views/professor/professor-student-profile-view.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import { getDoc, doc, collection, query, where, getDocs, orderBy, Timestamp, addDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from "../../utils.js";

let _getAiStudentSummaryCallable = null;

export class ProfessorStudentProfileView extends LitElement {
    static properties = {
        studentId: { type: String },
        _studentData: { state: true, type: Object },
        _submissions: { state: true, type: Array },
        _activeTab: { state: true, type: String },
        _isLoading: { state: true, type: Boolean },
        _isGeneratingAiSummary: { state: true, type: Boolean },
        _chatMessages: { state: true, type: Array },
        _tabs: { state: true, type: Array }
    };

    constructor() {
        super();
        this.studentId = null;
        this._studentData = null;
        this._submissions = [];
        this._activeTab = 'overview';
        this._isLoading = true;
        this._isGeneratingAiSummary = false;
        this._chatMessages = [];
        this._chatUnsubscribe = null;

        this._tabs = [
            {id: 'overview', label: 'Přehled'},
            {id: 'activity', label: 'Aktivita'},
            {id: 'grades', label: 'Známky'},
            {id: 'chat', label: '💬 Chat'}
        ];

        if (!_getAiStudentSummaryCallable) {
            if (!firebaseInit.functions) {
                console.error("CRITICAL: Firebase Functions object is not available for getAiStudentSummaryCallable!");
                throw new Error("Firebase Functions not initialized.");
            }
            _getAiStudentSummaryCallable = httpsCallable(firebaseInit.functions, 'getAiStudentSummary');
        }
    }

    createRenderRoot() { return this; } // Light DOM

    connectedCallback() {
        super.connectedCallback();
        if (this.studentId) {
            this._loadStudentData();
        } else {
            this._isLoading = false;
        }
    }
    
    disconnectedCallback() {
        super.disconnectedCallback();
        this._unsubscribeFromChat();
    }

    willUpdate(changedProperties) {
        if (changedProperties.has('studentId') && this.studentId) {
            this._loadStudentData();
        }
    }

    async _loadStudentData() {
        this._isLoading = true;
        this._studentData = null;
        this._submissions = [];
        this._activeTab = 'overview';
        this._unsubscribeFromChat(); // Ensure old chat listener is cleared

        try {
            const studentDocRef = doc(firebaseInit.db, 'students', this.studentId);
            const studentDoc = await getDoc(studentDocRef);

            if (!studentDoc.exists()) {
                showToast(`Student s ID ${this.studentId} nebyl nalezen.`, true);
                this._studentData = { error: `Student s ID ${this.studentId} nebyl nalezen.` };
            } else {
                this._studentData = { id: studentDoc.id, ...studentDoc.data() };
                await this._loadSubmissions();
            }
        } catch (error) {
            console.error("Error loading student data:", error);
            showToast("Došlo k chybě při načítání profilu studenta.", true);
            this._studentData = { error: "Došlo k chybě při načítání profilu studenta." };
        } finally {
            this._isLoading = false;
        }
    }

    async _loadSubmissions() {
        try {
            const quizQuery = query(
                collection(firebaseInit.db, "quiz_submissions"),
                where("studentId", "==", this.studentId),
                orderBy('submittedAt', 'desc')
            );
            const testQuery = query(
                collection(firebaseInit.db, "test_submissions"),
                where("studentId", "==", this.studentId),
                orderBy('submittedAt', 'desc')
            );

            const [quizSnapshot, testSnapshot] = await Promise.all([
                getDocs(quizQuery),
                getDocs(testQuery)
            ]);

            let allSubmissions = [];
            quizSnapshot.forEach(doc => {
                const data = doc.data();
                allSubmissions.push({ type: 'Kvíz', lessonName: data.quizTitle || 'N/A', ...data });
            });
            testSnapshot.forEach(doc => {
                const data = doc.data();
                allSubmissions.push({ type: 'Test', lessonName: data.testTitle || 'N/A', ...data });
            });

            allSubmissions.sort((a, b) => (b.submittedAt?.toMillis() || 0) - (a.submittedAt?.toMillis() || 0));
            this._submissions = allSubmissions;
        } catch (error) {
            console.error("Error fetching submissions:", error);
            showToast("Chyba při načítání výsledků studenta.", true);
            this._submissions = [];
        }
    }

    _switchTab(tabId) {
        this._activeTab = tabId;
        if (tabId === 'chat') {
            this._subscribeToChat();
        } else {
            this._unsubscribeFromChat();
        }
    }

    _subscribeToChat() {
        if (this._chatUnsubscribe) return; // Already subscribed

        const q = query(
            collection(firebaseInit.db, 'conversations', this.studentId, 'messages'),
            orderBy('timestamp')
        );

        this._chatUnsubscribe = onSnapshot(q, (snapshot) => {
            this._chatMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.requestUpdate();
            // Scroll to bottom after update
            setTimeout(() => {
                const container = this.querySelector('#chat-messages-container');
                if (container) container.scrollTop = container.scrollHeight;
            }, 0);
        });
    }

    _unsubscribeFromChat() {
        if (this._chatUnsubscribe) {
            this._chatUnsubscribe();
            this._chatUnsubscribe = null;
        }
    }

    async _sendMessage() {
        const input = this.querySelector('#chat-input');
        const text = input.value.trim();
        if (!text) return;

        const auth = getAuth();
        const currentUser = auth.currentUser;

        if (!currentUser) {
            showToast("Nejste přihlášen.", true);
            return;
        }

        try {
            await addDoc(collection(firebaseInit.db, 'conversations', this.studentId, 'messages'), {
                text: text,
                senderId: currentUser.uid,
                senderName: 'Profesor',
                timestamp: serverTimestamp()
            });
            input.value = '';
        } catch (error) {
            console.error("Error sending message:", error);
            showToast("Nepodařilo se odeslat zprávu.", true);
        }
    }

    _goBack() {
        this.dispatchEvent(new CustomEvent('back-to-list', { bubbles: true, composed: true }));
    }

    async _refreshAiSummary() {
        if (!this._studentData || !this._studentData.id) return;
        if (!confirm("Opravdu chcete vygenerovat novou AI analýzu? Tím se přepíše ta stávající a může to chvíli trvat.")) {
            return;
        }

        this._isGeneratingAiSummary = true;
        try {
            const result = await _getAiStudentSummaryCallable({ studentId: this._studentData.id });
            const newSummaryText = result.data.summary;
            
            this._studentData = {
                ...this._studentData,
                aiSummary: {
                    text: newSummaryText,
                    generatedAt: new Date()
                }
            };
            showToast("AI analýza byla úspěšně aktualizována.");

        } catch (error) {
            console.error("Error refreshing AI summary:", error);
            showToast("Nepodařilo se aktualizovat AI analýzu.", true);
        } finally {
            this._isGeneratingAiSummary = false;
        }
    }

    // --- Renderovacie Metódy ---

    renderTabButton(tab) {
        const isActive = this._activeTab === tab.id;
        const classes = isActive 
            ? 'border-green-500 text-green-600' 
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300';
        return html`
            <button @click=${() => this._switchTab(tab.id)}
                    class="student-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${classes}">
                ${tab.label}
            </button>
        `;
    }

    renderOverviewContent() {
        const aiSummary = this._studentData?.aiSummary || null;
        let summaryHtml;

        if (aiSummary && aiSummary.text) {
            const date = (aiSummary.generatedAt && typeof aiSummary.generatedAt.toDate === 'function') 
                          ? aiSummary.generatedAt.toDate().toLocaleString('cs-CZ') 
                          : (aiSummary.generatedAt ? new Date(aiSummary.generatedAt).toLocaleString('cs-CZ') : 'Neznámé datum');
            
            // Use marked for proper Markdown rendering
            const rawMarkup = marked.parse(aiSummary.text);

            summaryHtml = html`
                <h3 class="text-lg font-semibold text-green-800 mb-3">AI Postřehy</h3>
                <p class="text-xs text-slate-500 mb-3">Poslední generování: ${date}</p>
                <!-- Render HTML from markdown safely -->
                <div class="prose prose-sm max-w-none text-slate-800">
                    <div .innerHTML="${rawMarkup}"></div>
                </div>
            `;
        } else {
            summaryHtml = html`
                <h3 class="text-lg font-semibold text-slate-700 mb-3">AI Postřehy</h3>
                <p class="text-slate-500">Pro tohoto studenta zatím nebyla vygenerována žádná AI analýza.</p>
            `;
        }
        
        return html`
            <div class="bg-white p-6 rounded-lg shadow">
                <h2 class="text-xl font-semibold mb-4">Přehled studenta</h2>
                <p><strong>Jméno:</strong> ${this._studentData?.name || 'N/A'}</p>
                <p><strong>Email:</strong> ${this._studentData?.email || 'N/A'}</p>
                
                <div class="mt-6 border-t pt-6" id="ai-summary-wrapper">
                    <div id="ai-summary-content">
                        ${summaryHtml}
                    </div>
                    
                    ${this._isGeneratingAiSummary ? html`
                        <div id="ai-summary-loader" class="text-center p-4">
                            <p class="text-slate-500 animate-pulse">Generuji novou analýzu...</p>
                            <p class="text-xs text-slate-400 mt-1">Analyzuji poslední aktivitu, výsledky testů a konverzace...</p>
                        </div>
                    ` : html`
                        <button id="refresh-ai-summary-btn" 
                                @click=${this._refreshAiSummary} 
                                ?disabled=${this._isGeneratingAiSummary}
                                class="mt-4 bg-green-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-800 transition-colors">
                            Vynutit aktualizaci AI analýzy
                        </button>
                    `}
                </div>
            </div>
        `;
    }

    renderSubmissionsTable() {
        if (this._submissions.length === 0) {
            return html`<p class="text-gray-500">Tento student zatím neodevzdal žádné testy ani kvízy.</p>`;
        }

        const rows = this._submissions.map(sub => {
            const score = typeof sub.score === 'number' ? `${(sub.score * 100).toFixed(0)}%` : 'N/A';
            const date = (sub.submittedAt && typeof sub.submittedAt.toDate === 'function') 
                          ? sub.submittedAt.toDate().toLocaleDateString('cs-CZ') 
                          : 'Neznámé datum';
            const scoreClass = typeof sub.score === 'number'
                              ? (sub.score >= 0.5 ? 'text-green-600' : 'text-red-600')
                              : 'text-gray-500';
            return html`
                <tr class="border-b">
                    <td class="py-3 px-4">${sub.lessonName || 'Neznámá lekce'}</td>
                    <td class="py-3 px-4">${sub.type}</td>
                    <td class="py-3 px-4 font-semibold ${scoreClass}">${score}</td>
                    <td class="py-3 px-4 text-sm text-gray-500">${date}</td>
                </tr>
            `;
        });

        return html`
            <div class="overflow-x-auto">
                <table class="min-w-full text-left text-sm">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="py-2 px-4 font-semibold text-gray-600">Lekce / Název</th>
                            <th class="py-2 px-4 font-semibold text-gray-600">Typ</th>
                            <th class="py-2 px-4 font-semibold text-gray-600">Skóre</th>
                            <th class="py-2 px-4 font-semibold text-gray-600">Datum odevzdání</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-100">
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderResultsContent() {
        return html`
            <div class="bg-white p-6 rounded-lg shadow">
                <h2 class="text-xl font-semibold mb-4">Historie výsledků</h2>
                ${this.renderSubmissionsTable()}
            </div>
        `;
    }

    _renderChatTab() {
        const auth = getAuth();
        const currentUser = auth.currentUser;

        return html`
            <div class="bg-white rounded-lg shadow h-[600px] flex flex-col">
                <!-- Chat Header -->
                <div class="p-4 border-b flex justify-between items-center bg-slate-50 rounded-t-lg">
                    <h3 class="font-semibold text-lg">Chat se studentem</h3>
                    <div class="text-xs text-gray-500">Real-time</div>
                </div>

                <!-- Messages Area -->
                <div id="chat-messages-container" class="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                    ${this._chatMessages.length === 0 ? html`
                        <div class="text-center text-gray-400 mt-10">
                            <p>Zatím žádné zprávy.</p>
                            <p class="text-sm">Začněte konverzaci napsáním zprávy.</p>
                        </div>
                    ` : this._chatMessages.map(msg => {
                        const isMe = msg.senderId === currentUser?.uid;
                        const isAi = msg.sender === 'ai' || msg.type === 'ai';

                        let bubbleClass = isMe
                            ? 'bg-green-100 text-green-900 ml-auto rounded-br-none'
                            : 'bg-white text-gray-800 border mr-auto rounded-bl-none';

                        if (isAi) {
                             bubbleClass = 'bg-slate-100 border-slate-200 text-slate-600 italic mr-auto rounded-bl-none';
                        }

                        const alignClass = isMe ? 'justify-end' : 'justify-start';

                        const time = msg.timestamp ? (msg.timestamp.toDate ? msg.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Teď') : '...';

                        return html`
                            <div class="flex ${alignClass}">
                                <div class="max-w-[70%] rounded-2xl p-3 shadow-sm ${bubbleClass} relative">
                                    ${isAi ? html`<div class="text-xs font-bold text-slate-400 mb-1 flex items-center gap-1">🤖 AI Asistent</div>` : ''}
                                    <div class="text-sm">${msg.text}</div>
                                    <div class="text-[10px] opacity-70 mt-1 text-right">${time}</div>
                                </div>
                            </div>
                        `;
                    })}
                </div>

                <!-- Input Area -->
                <div class="p-4 border-t bg-white rounded-b-lg">
                    <div class="flex gap-2">
                        <textarea
                            id="chat-input"
                            class="flex-1 border rounded-lg p-2 focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
                            rows="2"
                            placeholder="Napište zprávu..."
                            @keydown=${(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._sendMessage(); } }}
                        ></textarea>
                        <button
                            @click=${this._sendMessage}
                            class="bg-green-600 text-white px-6 rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center gap-2">
                            <span>Odeslat</span>
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    renderActivityContent() {
        return html`
            <div class="bg-white p-6 rounded-lg shadow">
                <h2 class="text-xl font-semibold mb-4">Aktivita studenta</h2>
                <p class="text-gray-500">Detailní přehled aktivity studenta se připravuje.</p>
            </div>
        `;
    }

    renderTabContent() {
        switch (this._activeTab) {
            case 'overview':
                return this.renderOverviewContent();
            case 'activity':
                return this.renderActivityContent();
            case 'grades': // User requested ID 'grades', map to results content or rename method. I will use renderResultsContent for now.
                return this.renderResultsContent();
            case 'chat':
                return this._renderChatTab();
            case 'results': // Fallback for backward compatibility if needed, though buttons are updated
                return this.renderResultsContent();
            default:
                return html`<p>Neznámý tab.</p>`;
        }
    }

    render() {
        if (this._isLoading) {
            return html`<div class="p-8"><div class="text-center">Načítání dat studenta...</div></div>`;
        }
        if (this._studentData && this._studentData.error) {
             return html`<div class="p-8 text-red-500">${this._studentData.error}</div>`;
        }
        if (!this._studentData) {
             return html`<div class="p-8 text-orange-500">Student nebyl vybrán.</div>`;
        }

        return html`
            <div class="p-6 md:p-8">
                <button @click=${this._goBack} class="mb-6 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    Zpět na seznam studentů
                </button>

                <div class="mb-8">
                    <h1 class="text-3xl font-bold text-gray-800">${this._studentData.name}</h1>
                    <p class="text-lg text-gray-500">${this._studentData.email}</p>
                </div>

                <div class="border-b border-gray-200">
                    <nav class="-mb-px flex space-x-8" aria-label="Tabs">
                        ${this._tabs.map(tab => this.renderTabButton(tab))}
                    </nav>
                </div>

                <div id="tab-content" class="mt-8">
                    ${this.renderTabContent()}
                </div>
            </div>
        `;
    }
}

customElements.define('professor-student-profile-view', ProfessorStudentProfileView);

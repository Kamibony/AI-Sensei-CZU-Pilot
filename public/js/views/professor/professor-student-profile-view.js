// public/js/views/professor/professor-student-profile-view.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { getDoc, doc, collection, query, where, getDocs, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
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
    };

    constructor() {
        super();
        this.studentId = null;
        this._studentData = null;
        this._submissions = [];
        this._activeTab = 'overview';
        this._isLoading = true;
        this._isGeneratingAiSummary = false;

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
            this._isLoading = false; // Ak nemáme ID, nesnažíme sa načítať
        }
    }
    
    // Načítame dáta, keď sa zmení `studentId` property
    willUpdate(changedProperties) {
        if (changedProperties.has('studentId') && this.studentId) {
            this._loadStudentData();
        }
    }

    async _loadStudentData() {
        this._isLoading = true;
        this._studentData = null;
        this._submissions = [];
        this._activeTab = 'overview'; // Vždy začneme prehľadom

        try {
            const studentDocRef = doc(firebaseInit.db, 'students', this.studentId);
            const studentDoc = await getDoc(studentDocRef);

            if (!studentDoc.exists()) {
                showToast(`Student s ID ${this.studentId} nebyl nalezen.`, true);
                this._studentData = { error: `Student s ID ${this.studentId} nebyl nalezen.` };
            } else {
                this._studentData = { id: studentDoc.id, ...studentDoc.data() };
                // Načítame výsledky hneď po načítaní študenta
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
            this._submissions = []; // Resetujeme v prípade chyby
        }
    }

    _switchTab(tabId) {
        this._activeTab = tabId;
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
            
            // Aktualizujeme _studentData, aby sa to prejavilo v UI
            this._studentData = {
                ...this._studentData,
                aiSummary: {
                    text: newSummaryText,
                    generatedAt: new Date() // Použijeme Date object, konverzia z Timestamp nie je nutná
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

    renderTabButton(tabId, label) {
        const isActive = this._activeTab === tabId;
        const classes = isActive 
            ? 'border-green-500 text-green-600' 
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300';
        return html`
            <button @click=${() => this._switchTab(tabId)}
                    class="student-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${classes}">
                ${label}
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
            
            // Jednoduché formátovanie pre HTML
            let formattedText = aiSummary.text
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n\* /g, '<br>• ')
                .replace(/\n\d+\. /g, (match) => `<br>${match.trim()} `)
                .replace(/\n/g, '<br>');

            // Použijeme ${unsafeHTML(formattedText)} alebo inú bezpečnú metódu
            // Pre jednoduchosť zatiaľ len vložíme ako text
            summaryHtml = html`
                <h3 class="text-lg font-semibold text-green-800 mb-3">AI Postřehy</h3>
                <p class="text-xs text-slate-500 mb-3">Poslední generování: ${date}</p>
                <div class="prose prose-sm max-w-none text-slate-800">${formattedText}</div> 
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

    renderTabContent() {
        switch (this._activeTab) {
            case 'overview':
                return this.renderOverviewContent();
            case 'results':
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
                        ${this.renderTabButton('overview', 'Přehled')}
                        ${this.renderTabButton('results', 'Výsledky')}
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

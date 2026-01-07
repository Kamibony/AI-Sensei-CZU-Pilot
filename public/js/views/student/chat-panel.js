// Súbor: public/js/student/chat-panel.js

import { LitElement, html } from 'https://cdn.skypack.dev/lit';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { showToast } from '../../utils/utils.js';
import { translationService } from '../../utils/translation-service.js';
import { functions, db } from '../../firebase-init.js';

// --- Sem presúvame logiku pre Firebase Function ---
let _sendMessageFromStudentCallable = null;
function getSendMessageFromStudentCallable() {
    if (!_sendMessageFromStudentCallable) {
        if (!functions) {
            console.error("CRITICAL: Firebase Functions object is still not available when trying to create sendMessageFromStudent callable!");
            throw new Error("Firebase Functions not initialized.");
        }
        _sendMessageFromStudentCallable = httpsCallable(functions, 'sendMessageFromStudent');
    }
    return _sendMessageFromStudentCallable;
}
// --- Koniec presunutej logiky ---


export class ChatPanel extends LitElement {

    // Definujeme vlastnosti (props & state)
    static get properties() {
        return {
            type: { type: String }, // 'ai' alebo 'professor'
            lessonId: { type: String },
            currentUserData: { type: Object },
            
            chatHistory: { type: Array, state: true },
            currentSubView: { type: String, state: true }, // Len pre 'ai' typ: 'web' alebo 'telegram'
            chatUnsubscribe: { type: Object }, // Pre uloženie onSnapshot listenera
        };
    }

    constructor() {
        super();
        this.type = 'professor';
        this.lessonId = null;
        this.currentUserData = null;
        this.chatHistory = []; // Bude obsahovať aj { sender: 'ai-typing' }
        this.currentSubView = 'web';
        this.chatUnsubscribe = null;
    }

    // Vypnutie Shadow DOM
    createRenderRoot() {
        return this;
    }

    // `connectedCallback` sa spustí, keď je komponent pridaný na stránku
    connectedCallback() {
        super.connectedCallback();
        // Začneme počúvať na zmeny v chate
        this._loadChatHistory();
        this._langUnsubscribe = translationService.subscribe(() => this.requestUpdate());
    }

    // `disconnectedCallback` sa spustí, keď je komponent odobratý (napr. prepnutie tabu)
    disconnectedCallback() {
        super.disconnectedCallback();
        // Zastavíme počúvanie, aby sme predišli memory leakom
        if (this.chatUnsubscribe) {
            this.chatUnsubscribe();
            console.log(`Chat listener for type '${this.type}' stopped.`);
        }
        if (this._langUnsubscribe) {
            this._langUnsubscribe();
        }
    }

    // Hlavná renderovacia metóda
    render() {
        if (this.type === 'ai') {
            return this._renderAIChatView();
        } else {
            return this._renderProfessorChatView();
        }
    }

    // --- Renderovacie metódy pre AI Asistenta ---
    
    _renderAIChatView() {
        // Pôvodná logika z `renderAIChatView`
        return html`
            <div class="bg-white p-0 rounded-2xl shadow-xl flex flex-col h-[60vh] lg:h-[70vh]">
                <div class="w-full h-full flex flex-col">
                    <div class="bg-[#56A0D3] text-white p-3 rounded-t-2xl flex items-center shadow-md flex-shrink-0">
                        <div class="w-10 h-10 bg-white rounded-full flex items-center justify-center font-bold text-xl text-[#56A0D3]">A</div>
                        <div class="ml-3">
                            <h3 class="font-semibold text-lg">AI Asistent</h3>
                            <p class="text-sm text-gray-200">Vyberte způsob komunikace</p>
                        </div>
                    </div>

                    ${this._renderAIChatMenu()}
                    ${this._renderAIChatContent()}
                </div>
            </div>
        `;
    }

    _renderAIChatMenu() {
        // Pôvodná logika z `renderAIChatView` (menu)
        return html`
            <div id="ai-chat-menu" class="flex border-b border-gray-200 bg-slate-50 flex-shrink-0">
                <button 
                    id="ai-tab-web" 
                    data-chat-type="web" 
                    class="px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${this.currentSubView === 'web' ? 'border-[#56A0D3] text-[#56A0D3]' : 'border-transparent text-slate-500 hover:text-[#56A0D3]'}"
                    @click=${() => this.currentSubView = 'web'}>
                    Web Chat
                </button>
                <button 
                    id="ai-tab-telegram" 
                    data-chat-type="telegram" 
                    class="px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${this.currentSubView === 'telegram' ? 'border-[#56A0D3] text-[#56A0D3]' : 'border-transparent text-slate-500 hover:text-[#56A0D3]'}"
                    @click=${() => this.currentSubView = 'telegram'}>
                    Telegram App
                </button>
            </div>
        `;
    }

    _renderAIChatContent() {
        // Pôvodná logika z `switchAIChatSubView`
        if (this.currentSubView === 'web') {
            // Pôvodná logika z `renderAIChatWebInterface`
            return html`
                <div id="ai-chat-history" class="flex-grow overflow-y-auto p-3 bg-[#EAEAEA]">
                    ${this._renderChatHistory()}
                </div>
                <div class="bg-white p-3 border-t flex-shrink-0">
                    <div class="flex items-center">
                        <input type="text" id="chat-input" placeholder="Zpráva" class="flex-grow bg-gray-100 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#56A0D3]" @keypress=${this._handleKeypress}>
                        <button id="send-chat-btn" class="ml-2 w-10 h-10 bg-[#56A0D3] text-white rounded-full flex items-center justify-center hover:bg-[#4396C8] transition-colors" @click=${this._sendMessage}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        </button>
                    </div>
                </div>
            `;
        } else if (this.currentSubView === 'telegram') {
            // Pôvodná logika z `renderAITelegramLink`
            const token = this.currentUserData?.telegramLinkToken || 'CHYBA: Kód nenalezen';
            return html`
                <div class="flex flex-col items-center justify-center p-8 text-center flex-grow">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 text-[#56A0D3] mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 17l-4 4-4-4"></path><path d="M13 19V5"></path><path d="M9 13l4-4 4 4"></path></svg>
                    <h3 class="text-xl font-bold mb-2">Komunikujte cez Telegram</h3>
                    <p class="text-slate-600 mb-4">Pre jednoduchšiu a rýchlejšiu komunikáciu v mobile použite nášho bota v aplikácii Telegram.</p>
                    <a href="https://t.me/ai_sensei_czu_bot" target="_blank" class="bg-[#56A0D3] text-white font-bold py-3 px-6 rounded-full hover:bg-[#4396C8] transition-colors mb-4">
                        Otvoriť Telegram Bota
                    </a>
                    <p class="text-sm text-slate-500 mt-2">Po otvorení pošlite botovi pre spárovanie tento kód:</p>
                    <strong class="block bg-gray-200 text-slate-800 p-2 rounded-lg text-lg select-all font-mono">${token}</strong>
                </div>
            `;
        }
    }

    // --- Renderovacie metódy pre Chat s Profesorom ---

    _renderProfessorChatView() {
        // Pôvodná logika z `renderProfessorChatView`
        return html`
            <div class="bg-white p-4 md:p-6 rounded-2xl shadow-lg flex flex-col h-[60vh] lg:h-[70vh]">
                <h3 class="text-2xl font-bold mb-4">Konzultace s profesorem</h3>
                <div id="prof-chat-history" class="overflow-y-auto border p-3 rounded-lg bg-slate-50 mb-4 flex-grow">
                    ${this._renderChatHistory()}
                </div>
                <div class="flex gap-2 flex-shrink-0">
                    <input type="text" id="chat-input" placeholder="Zadejte dotaz pro profesora..." class="flex-grow p-3 border rounded-lg focus:ring-2 focus:ring-blue-500" @keypress=${this._handleKeypress}>
                    <button id="send-chat-btn" class="bg-slate-700 text-white font-bold py-3 px-5 rounded-lg hover:bg-slate-800 transition-colors" @click=${this._sendMessage}>Odeslat</button>
                </div>
            </div>
        `;
    }

    // --- Zjednotené (zdieľané) metódy ---

    _renderChatHistory() {
        if (this.chatHistory.length === 0) {
            // Ak je listener aktívny, ale dáta ešte neprišli, zobrazíme "Načítání"
            // Ak už prišli a sú prázdne, zobrazíme "Začněte"
            return html`<p class="text-center text-slate-400 p-4">${this.chatUnsubscribe ? translationService.t('student_dashboard.chat_start') : translationService.t('student_dashboard.chat_loading')}</p>`;
        }

        // Mapujeme pole správ na HTML elementy
        return this.chatHistory.map(msg => this._renderChatMessage(msg));
    }

    _renderChatMessage(data) {
        // Pôvodná logika z `appendChatMessage`
        const isAI = this.type === 'ai';
        let baseClasses = 'p-2 px-3 my-1 rounded-lg text-sm clear-both max-w-[80%]';
        let senderPrefix = '';
        let alignmentClasses = '';
        let content = (data.text || '').replace(/\n/g, '<br>');

        if (data.sender === 'student') {
            alignmentClasses = 'ml-auto float-right';
            baseClasses += ` ${isAI ? 'bg-[#DCF8C6]' : 'bg-blue-500 text-white'} ${alignmentClasses} rounded-tr-none`;
        } else if (data.sender === 'ai-typing') {
            alignmentClasses = 'mr-auto float-left';
            baseClasses += ` bg-gray-200 text-gray-500 italic ${alignmentClasses} rounded-tl-none ai-typing-indicator`;
            content = translationService.t('student_dashboard.typing');
        } else if (data.sender === 'system-error') {
            alignmentClasses = 'mx-auto';
            baseClasses += ` bg-red-100 text-red-700 text-center ${alignmentClasses}`;
            senderPrefix = '<strong>Systém:</strong><br>';
        } else { // ai, professor
            alignmentClasses = 'mr-auto float-left';
            baseClasses += ` ${isAI ? 'bg-white' : 'bg-gray-200'} text-slate-800 ${alignmentClasses} rounded-tl-none`;
            if (data.sender === 'ai') senderPrefix = '<strong>AI Asistent:</strong><br>';
            if (data.sender === 'professor') senderPrefix = '<strong>Profesor:</strong><br>';
        }
        
        let timestampText = '';
        if (data.timestamp) {
            try {
                const date = (data.timestamp && typeof data.timestamp.toDate === 'function') 
                             ? data.timestamp.toDate() 
                             : new Date(data.timestamp);
                timestampText = html`<span class="block text-xs ${data.sender === 'student' ? (isAI ? 'text-gray-500' : 'text-blue-200') : 'text-gray-400'} mt-1 text-right">${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
            } catch (e) { /* ignorovať chybu formátovania */ }
        }
        
        // Vytvoríme "raw" HTML pre obsah, ktorý môže obsahovať <br> a <strong>
        const unsafeContent = document.createElement('div');
        unsafeContent.innerHTML = senderPrefix + content;

        return html`
            <div class="${baseClasses}">
                ${unsafeContent.childNodes}
                ${timestampText}
            </div>
        `;
    }

    async _loadChatHistory() {
        // Pôvodná logika z `loadChatHistory`
        if (this.chatUnsubscribe) { // Zastavíme starý listener, ak existuje
            this.chatUnsubscribe();
        }

        try {
            const q = query(
                collection(db, `conversations/${this.currentUserData.id}/messages`),
                where("lessonId", "==", this.lessonId),
                where("type", "==", this.type), 
                orderBy("timestamp", "asc")
            );
            
            // Uložíme si unsubscribe funkciu
            this.chatUnsubscribe = onSnapshot(q, async (snapshot) => {
                this.chatHistory = snapshot.docs.map(doc => doc.data());
                
                // Počkáme, kým Lit prekreslí DOM
                await this.updateComplete; 
                
                // Scrollneme na spodok
                const historyEl = this.querySelector(this.type === 'ai' ? '#ai-chat-history' : '#prof-chat-history');
                if (historyEl) {
                    historyEl.scrollTop = historyEl.scrollHeight;
                }
            }, (error) => {
                console.error(`Error with ${this.type} chat listener:`, error);
                showToast(translationService.t('student_dashboard.chat_error_load'), true);
            });

        } catch (error) {
            console.error(`Error loading ${this.type} chat history:`, error);
            showToast(translationService.t('student_dashboard.chat_error_load'), true);
        }
    }

    _handleKeypress(e) {
        if (e.key === 'Enter') {
            this._sendMessage();
        }
    }

    async _sendMessage() {
        // Pôvodná logika z `sendMessage`
        const inputEl = this.querySelector('#chat-input');
        if (!inputEl) return;
        const text = inputEl.value.trim();
        if (!text) return;

        inputEl.value = ''; // Vyčistíme input hneď

        const messageData = { 
            lessonId: this.lessonId, 
            text: text,
            sender: 'student',
            type: this.type,
            timestamp: serverTimestamp() 
        };

        try {
             const messageRef = collection(db, `conversations/${this.currentUserData.id}/messages`);
             await addDoc(messageRef, messageData);
             console.log(`Student message saved to DB for type: ${this.type}`);
             // Zobrazenie v UI rieši onSnapshot

             if (this.type === 'ai') {
                // Deklaratívne pridáme "typing" indikátor
                this.chatHistory = [...this.chatHistory, { sender: 'ai-typing', text: 'píše...' }];

                try {
                    const getAi = httpsCallable(functions, 'getAiAssistantResponse');
                    const result = await getAi({
                        lessonId: this.lessonId,
                        userQuestion: text
                    });
                    const response = result.data;
                    
                    let aiResponseText = response.error ? `Chyba AI: ${response.error}` : (response.answer || "Omlouvám se, nedostal jsem odpověď.");

                    // Uloženie odpovede AI do DB
                     await addDoc(messageRef, {
                         lessonId: this.lessonId,
                         text: aiResponseText,
                         sender: 'ai',
                         type: 'ai',
                         timestamp: serverTimestamp()
                     });
                     console.log("AI response saved to DB.");
                     // onSnapshot sa postará o zobrazenie

                } catch (aiError) {
                    console.error("Error getting AI response:", aiError);
                    const errorText = `Omlouvám se, došlo k chybě při komunikaci s AI: ${aiError.message || aiError}`;
                    await addDoc(messageRef, {
                         lessonId: this.lessonId,
                         text: errorText,
                         sender: 'ai',
                         type: 'ai',
                         timestamp: serverTimestamp()
                    });
                } finally {
                    // Odstránime "typing" indikátor
                    this.chatHistory = this.chatHistory.filter(m => m.sender !== 'ai-typing');
                }

            } else { // type === 'professor'
                try {
                    const notifyProfessorCallable = getSendMessageFromStudentCallable();
                    await notifyProfessorCallable({ text: text });
                } catch (callError) {
                     console.error("Error notifying professor:", callError);
                     showToast("Nepodařilo se upozornit profesora na zprávu.", true);
                }
            }
        } catch (error) {
            console.error("Error sending message or saving to DB:", error);
            showToast(translationService.t('student_dashboard.chat_error_send'), true);
            // Zobrazíme chybu v chate
            this.chatHistory = [...this.chatHistory, { text: `CHYBA: Zprávu "${text}" se nepodařilo odeslat.`, sender: 'system-error' }];
        }
    }
}

// Zaregistrujeme komponent
customElements.define('chat-panel', ChatPanel);

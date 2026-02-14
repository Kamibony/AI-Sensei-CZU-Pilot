// Súbor: public/js/student/chat-panel.js

import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { showToast } from '../../utils/utils.js';
import { translationService } from '../../utils/translation-service.js';
import * as firebaseInit from '../../firebase-init.js';

// --- Sem presúvame logiku pre Firebase Function ---
let _sendMessageFromStudentCallable = null;
function getSendMessageFromStudentCallable() {
    if (!_sendMessageFromStudentCallable) {
        if (!firebaseInit.functions) {
            console.error("CRITICAL: Firebase Functions object is still not available when trying to create sendMessageFromStudent callable!");
            throw new Error("Firebase Functions not initialized.");
        }
        _sendMessageFromStudentCallable = httpsCallable(firebaseInit.functions, 'sendMessageFromStudent');
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
            
            // Reactive props for Kickstart (Ready-First Protocol)
            kickstartRole: { type: String },
            kickstartTopic: { type: String },
            missionStarted: { type: Boolean },

            chatHistory: { type: Array, state: true },
            currentSubView: { type: String, state: true }, // Len pre 'ai' typ: 'web' alebo 'telegram'
            chatUnsubscribe: { type: Object }, // Pre uloženie onSnapshot listenera
            _isHistoryLoaded: { type: Boolean, state: true },
            _kickstartInProgress: { type: Boolean, state: true }
        };
    }

    constructor() {
        super();
        this.type = 'professor';
        this.lessonId = null;
        this.currentUserData = null;

        this.kickstartRole = null;
        this.kickstartTopic = null;
        this.missionStarted = false;

        this.chatHistory = []; // Bude obsahovať aj { sender: 'ai-typing' }
        this.currentSubView = 'web';
        this.chatUnsubscribe = null;
        this._isHistoryLoaded = false;
        this._kickstartInProgress = false;
    }

    // Vypnutie Shadow DOM
    createRenderRoot() {
        return this;
    }

    // `connectedCallback` sa spustí, keď je komponent pridaný na stránku
    connectedCallback() {
        super.connectedCallback();
        // Začneme počúvať na zmeny v chate
        if (this.currentUserData?.id && this.lessonId) {
            this._loadChatHistory();
        }
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

    updated(changedProperties) {
        if (changedProperties.has('currentUserData') || changedProperties.has('lessonId')) {
            this._loadChatHistory();
        }

        // Ready-First Protocol: Trigger AI Kickstart only when all data is ready
        if (this.type === 'ai' && this.missionStarted) {
            this._checkAndTriggerKickstart();
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
                            <h3 class="font-semibold text-lg">${translationService.t('chat.ai_guide')}</h3>
                            <p class="text-sm text-gray-200">${translationService.t('chat.select_communication_method')}</p>
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
                    ${translationService.t('chat.web_chat')}
                </button>
                <button 
                    id="ai-tab-telegram" 
                    data-chat-type="telegram" 
                    class="px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${this.currentSubView === 'telegram' ? 'border-[#56A0D3] text-[#56A0D3]' : 'border-transparent text-slate-500 hover:text-[#56A0D3]'}"
                    @click=${() => this.currentSubView = 'telegram'}>
                    ${translationService.t('chat.telegram_app')}
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
                        <input type="text" id="chat-input" placeholder="${translationService.t('chat.placeholder_message')}" class="flex-grow bg-gray-100 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#56A0D3]" @keypress=${this._handleKeypress}>
                        <button id="send-chat-btn" class="ml-2 w-10 h-10 bg-[#56A0D3] text-white rounded-full flex items-center justify-center hover:bg-[#4396C8] transition-colors" @click=${this._sendMessage}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        </button>
                    </div>
                </div>
            `;
        } else if (this.currentSubView === 'telegram') {
            // Pôvodná logika z `renderAITelegramLink`
            const token = this.currentUserData?.telegramLinkToken || translationService.t('chat.error_code_not_found');
            return html`
                <div class="flex flex-col items-center justify-center p-8 text-center flex-grow">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 text-[#56A0D3] mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 17l-4 4-4-4"></path><path d="M13 19V5"></path><path d="M9 13l4-4 4 4"></path></svg>
                    <h3 class="text-xl font-bold mb-2">${translationService.t('chat.communicate_via_telegram')}</h3>
                    <p class="text-slate-600 mb-4">${translationService.t('chat.telegram_instruction')}</p>
                    <a href="https://t.me/ai_sensei_czu_bot" target="_blank" class="bg-[#56A0D3] text-white font-bold py-3 px-6 rounded-full hover:bg-[#4396C8] transition-colors mb-4">
                        ${translationService.t('chat.open_telegram_bot')}
                    </a>
                    <p class="text-sm text-slate-500 mt-2">${translationService.t('chat.send_code_instruction')}</p>
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
                <h3 class="text-2xl font-bold mb-4">${translationService.t('chat.professor_consultation')}</h3>
                <div id="prof-chat-history" class="overflow-y-auto border p-3 rounded-lg bg-slate-50 mb-4 flex-grow">
                    ${this._renderChatHistory()}
                </div>
                <div class="flex gap-2 flex-shrink-0">
                    <input type="text" id="chat-input" placeholder="${translationService.t('chat.placeholder_professor')}" class="flex-grow p-3 border rounded-lg focus:ring-2 focus:ring-blue-500" @keypress=${this._handleKeypress}>
                    <button id="send-chat-btn" class="bg-slate-700 text-white font-bold py-3 px-5 rounded-lg hover:bg-slate-800 transition-colors" @click=${this._sendMessage}>${translationService.t('chat.send_button')}</button>
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
            content = translationService.t('chat.typing');
        } else if (data.sender === 'system-error') {
            alignmentClasses = 'mx-auto';
            baseClasses += ` bg-red-100 text-red-700 text-center ${alignmentClasses}`;
            senderPrefix = `<strong>${translationService.t('chat.system_sender')}</strong><br>`;
        } else { // ai, professor
            alignmentClasses = 'mr-auto float-left';
            baseClasses += ` ${isAI ? 'bg-white' : 'bg-gray-200'} text-slate-800 ${alignmentClasses} rounded-tl-none`;
            if (data.sender === 'ai') senderPrefix = `<strong>${translationService.t('chat.ai_guide')}:</strong><br>`;
            if (data.sender === 'professor') senderPrefix = `<strong>${translationService.t('chat.professor_sender')}</strong><br>`;
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
        if (!this.currentUserData?.id || !this.lessonId) return;

        // Pôvodná logika z `loadChatHistory`
        if (this.chatUnsubscribe) { // Zastavíme starý listener, ak existuje
            this.chatUnsubscribe();
            this._isHistoryLoaded = false;
        }

        try {
            const q = query(
                collection(firebaseInit.db, `conversations/${this.currentUserData.id}/messages`),
                where("lessonId", "==", this.lessonId),
                where("type", "==", this.type), 
                orderBy("timestamp", "asc")
            );
            
            // Uložíme si unsubscribe funkciu
            this.chatUnsubscribe = onSnapshot(q, async (snapshot) => {
                this.chatHistory = snapshot.docs.map(doc => doc.data());
                this._isHistoryLoaded = true; // Mark history as loaded
                
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
                this._isHistoryLoaded = true; // Prevent indefinite loading state
            });

        } catch (error) {
            console.error(`Error loading ${this.type} chat history:`, error);
            showToast(translationService.t('student_dashboard.chat_error_load'), true);
            this._isHistoryLoaded = true;
        }
    }

    _handleKeypress(e) {
        if (e.key === 'Enter') {
            this._sendMessage();
        }
    }

    async _checkAndTriggerKickstart() {
        // Guard Clause: History must be loaded to ensure idempotency
        if (!this._isHistoryLoaded) return;

        // Idempotency: Do not trigger if chat history already exists
        if (this.chatHistory.length > 0) return;

        // Guard Clause: Prevent multiple parallel kickstarts
        if (this._kickstartInProgress) return;

        // Guard Clause: Data Integrity
        // We use a safe accessor or fallback, but strict checks are better here.
        if (!this.kickstartRole || !this.kickstartTopic || !this.currentUserData?.id || !this.lessonId) {
            // Do not log error repeatedly, just wait for data
            return;
        }

        console.log("Triggering AI Kickstart (Reactive) for role:", this.kickstartRole, "topic:", this.kickstartTopic);
        this._kickstartInProgress = true;

        const language = translationService.currentLanguage === 'cs' ? 'Czech' : 'Portuguese';

        // Use generic fallback if topic is somehow missing but passed guard
        const safeTopic = this.kickstartTopic || "Unknown Mission";

        const systemPrompt = `SYSTEM_EVENT: User has just accepted the role of ${this.kickstartRole}. The mission context is ${safeTopic}. ACT IMMEDIATELY as the [Mission Persona]. Introduce yourself briefly and give the user their first situational update or order based on their role. Ask them for a status report. Output in ${language}.`;

        // Add hidden typing indicator
        this.chatHistory = [...this.chatHistory, { sender: 'ai-typing', text: translationService.t('chat.typing') }];

        try {
            const getAiAssistantResponse = httpsCallable(firebaseInit.functions, 'getAiAssistantResponse');
            const result = await getAiAssistantResponse({
                lessonId: this.lessonId,
                userQuestion: systemPrompt // Sending system prompt as user question, but NOT saving it to DB
            });
            const response = result.data;

            let aiResponseText = response.error
                ? `${translationService.t('chat.error_ai')} ${response.error}`
                : (response.answer || translationService.t('guide_bot.error_response'));

            // Save AI response to DB so it appears in chat
            const messageRef = collection(firebaseInit.db, `conversations/${this.currentUserData.id}/messages`);
            await addDoc(messageRef, {
                 lessonId: this.lessonId,
                 text: aiResponseText,
                 sender: 'ai',
                 type: 'ai',
                 timestamp: serverTimestamp()
            });
            console.log("AI Kickstart response saved.");

        } catch (e) {
            console.error("AI Kickstart failed:", e);
            this._kickstartInProgress = false; // Allow retry on failure? Or better to stay failed to avoid loops?
            // If we reset, it might loop. If we don't, it might never start.
            // Better to reset and let the user retry by refreshing or manual message.
        } finally {
            // Remove typing indicator
             this.chatHistory = this.chatHistory.filter(m => m.sender !== 'ai-typing');
             // Note: We do NOT reset _kickstartInProgress to false on success,
             // because we want to ensure it runs only once per session/mount if history was empty.
             // Actually, if we successfully saved to DB, the snapshot will update, chatHistory.length > 0,
             // so the idempotency check will block future runs anyway.
             // But let's keep it true to be safe in-memory.
        }
    }

    async _sendMessage() {
        // Guard Clause: Prevent identity loss crash
        if (!this.currentUserData || !this.currentUserData.id) {
            console.warn("ChatPanel: Cannot send message - Missing currentUserData identity.");
            showToast(translationService.t('chat.error_identity_missing') || "Chyba identity: Zkuste obnovit stránku.", true);
            return;
        }

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
             const messageRef = collection(firebaseInit.db, `conversations/${this.currentUserData.id}/messages`);
             await addDoc(messageRef, messageData);
             console.log(`Student message saved to DB for type: ${this.type}`);
             // Zobrazenie v UI rieši onSnapshot

             if (this.type === 'ai') {
                // Deklaratívne pridáme "typing" indikátor
                this.chatHistory = [...this.chatHistory, { sender: 'ai-typing', text: translationService.t('chat.typing') }];

                try {
                    const getAiAssistantResponse = httpsCallable(firebaseInit.functions, 'getAiAssistantResponse');
                    const result = await getAiAssistantResponse({
                        lessonId: this.lessonId,
                        userQuestion: text
                    });
                    const response = result.data;
                    
                    let aiResponseText = response.error ? `${translationService.t('chat.error_ai')} ${response.error}` : (response.answer || translationService.t('guide_bot.error_response'));

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
                    const errorText = `${translationService.t('guide_bot.error_generic')} ${aiError.message || aiError}`;
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
                     showToast(translationService.t('chat.error_notify_prof'), true);
                }
            }
        } catch (error) {
            console.error("Error sending message or saving to DB:", error);
            showToast(translationService.t('student_dashboard.chat_error_send'), true);
            // Zobrazíme chybu v chate
            this.chatHistory = [...this.chatHistory, { text: `${translationService.t('chat.error_send')} "${text}"`, sender: 'system-error' }];
        }
    }
}

// Zaregistrujeme komponent
customElements.define('chat-panel', ChatPanel);

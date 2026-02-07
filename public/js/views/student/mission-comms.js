import { LitElement, html } from 'https://cdn.skypack.dev/lit';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { showToast } from '../../utils/utils.js';
import { translationService } from '../../utils/translation-service.js';
import * as firebaseInit from '../../firebase-init.js';

export class MissionComms extends LitElement {

    static get properties() {
        return {
            lessonId: { type: String },
            currentUserData: { type: Object },
            role: { type: String }, // MANDATORY: Student's Role in the mission
            topic: { type: String }, // Mission Topic (for context)
            missionStarted: { type: Boolean },

            chatHistory: { type: Array, state: true },
            chatUnsubscribe: { type: Object },
            _isHistoryLoaded: { type: Boolean, state: true },
            _kickstartInProgress: { type: Boolean, state: true }
        };
    }

    constructor() {
        super();
        this.lessonId = null;
        this.currentUserData = null;
        this.role = null;
        this.topic = null;
        this.missionStarted = false;

        this.chatHistory = [];
        this.chatUnsubscribe = null;
        this._isHistoryLoaded = false;
        this._kickstartInProgress = false;
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        if (this.currentUserData?.id && this.lessonId) {
            this._loadChatHistory();
        }
        this._langUnsubscribe = translationService.subscribe(() => this.requestUpdate());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.chatUnsubscribe) {
            this.chatUnsubscribe();
        }
        if (this._langUnsubscribe) {
            this._langUnsubscribe();
        }
    }

    updated(changedProperties) {
        if (changedProperties.has('currentUserData') || changedProperties.has('lessonId')) {
            this._loadChatHistory();
        }

        // Ready-First Protocol: Trigger Mission Kickstart
        if (this.missionStarted && this.role) {
            this._checkAndTriggerKickstart();
        }
    }

    render() {
        // Enforce Identity
        if (!this.currentUserData || !this.currentUserData.id) {
            return html`
                <div class="flex items-center justify-center h-full bg-slate-900 text-red-500 font-mono">
                    ⚠️ LINK LOST: IDENTITY MISSING
                </div>
            `;
        }

        return html`
            <div class="bg-slate-900 rounded-xl flex flex-col h-full border border-slate-700 overflow-hidden shadow-inner">
                <!-- Terminal Header -->
                <div class="bg-slate-800 p-3 border-b border-slate-700 flex items-center justify-between shadow-md z-10">
                    <div class="flex items-center gap-3">
                        <div class="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                        <h3 class="font-mono text-emerald-400 font-bold tracking-widest text-sm">
                            MISSION://COMMS_LINK
                        </h3>
                    </div>
                    <div class="text-xs font-mono text-slate-500">
                        OP: ${this.role ? this.role.toUpperCase() : 'UNKNOWN'}
                    </div>
                </div>

                <!-- Chat History Area -->
                <div id="mission-chat-history" class="flex-grow overflow-y-auto p-4 space-y-4 bg-slate-900 scroll-smooth custom-scrollbar">
                    ${this._renderChatHistory()}
                </div>

                <!-- Input Area -->
                <div class="bg-slate-800 p-3 border-t border-slate-700">
                    <div class="flex items-center gap-2 bg-slate-900 rounded-lg border border-slate-700 px-3 py-2 focus-within:border-emerald-500 transition-colors">
                        <span class="text-emerald-500 font-mono text-lg">></span>
                        <input
                            type="text"
                            id="mission-chat-input"
                            placeholder="${translationService.t('mission.chat_placeholder') || 'Zadejte příkaz...'}"
                            class="flex-grow bg-transparent text-slate-200 placeholder-slate-600 focus:outline-none font-mono text-sm"
                            autocomplete="off"
                            @keypress=${this._handleKeypress}
                        >
                        <button
                            @click=${this._sendMessage}
                            class="text-emerald-500 hover:text-emerald-400 p-1 transition-colors"
                        >
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    _renderChatHistory() {
        if (this.chatHistory.length === 0) {
            return html`
                <div class="flex flex-col items-center justify-center h-full text-slate-600 font-mono text-xs opacity-50">
                    <p>${this.chatUnsubscribe ? 'ESTABLISHING SECURE CONNECTION...' : 'OFFLINE'}</p>
                </div>
            `;
        }
        return this.chatHistory.map(msg => this._renderChatMessage(msg));
    }

    _renderChatMessage(data) {
        const isUser = data.sender === 'student';
        const isSystem = data.sender === 'system' || data.sender === 'system-error';

        if (isSystem) {
            return html`
                <div class="flex justify-center my-2">
                    <div class="bg-red-900/20 text-red-400 text-xs font-mono px-3 py-1 rounded border border-red-900/50">
                        ⚠ SYSTEM ALERT: ${data.text}
                    </div>
                </div>
            `;
        }

        if (data.sender === 'ai-typing') {
             return html`
                <div class="flex items-start gap-3">
                    <div class="w-8 h-8 rounded bg-slate-800 border border-slate-600 flex items-center justify-center text-emerald-500 text-xs font-mono">HQ</div>
                    <div class="bg-slate-800 text-emerald-500/50 p-3 rounded-lg rounded-tl-none text-sm font-mono border border-slate-700 animate-pulse">
                        PROCESSING...
                    </div>
                </div>
            `;
        }

        const alignClass = isUser ? 'justify-end' : 'justify-start';
        const bubbleClass = isUser
            ? 'bg-emerald-900/30 text-emerald-100 border-emerald-800/50 rounded-tr-none'
            : 'bg-slate-800 text-slate-300 border-slate-600 rounded-tl-none';

        const senderLabel = isUser ? 'YOU' : 'HQ';
        const labelClass = isUser ? 'text-right' : 'text-left';

        // Format timestamp
        let timeStr = '';
        if (data.timestamp) {
             try {
                const date = (data.timestamp.toDate) ? data.timestamp.toDate() : new Date(data.timestamp);
                timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } catch (e) {}
        }

        // Handle HTML content (newlines to <br>)
        const content = (data.text || '').replace(/\n/g, '<br>');
        const unsafeContent = document.createElement('div');
        unsafeContent.innerHTML = content;

        return html`
            <div class="flex w-full ${alignClass} mb-2 group">
                ${!isUser ? html`
                    <div class="w-8 h-8 rounded bg-slate-800 border border-slate-600 flex-shrink-0 flex items-center justify-center text-emerald-500 text-xs font-mono mr-2">HQ</div>
                ` : ''}

                <div class="max-w-[85%] flex flex-col ${isUser ? 'items-end' : 'items-start'}">
                    <div class="text-[10px] font-mono text-slate-500 mb-1 ${labelClass} uppercase tracking-wider flex gap-2">
                        <span>${senderLabel}</span>
                        <span>${timeStr}</span>
                    </div>
                    <div class="p-3 rounded-lg text-sm font-mono border ${bubbleClass} shadow-sm leading-relaxed whitespace-pre-wrap">
                        ${unsafeContent.childNodes}
                    </div>
                </div>

                ${isUser ? html`
                    <div class="w-8 h-8 rounded bg-emerald-900/20 border border-emerald-800/50 flex-shrink-0 flex items-center justify-center text-emerald-500 text-xs font-mono ml-2">OP</div>
                ` : ''}
            </div>
        `;
    }

    async _loadChatHistory() {
        if (!this.currentUserData?.id || !this.lessonId) return;

        if (this.chatUnsubscribe) {
            this.chatUnsubscribe();
            this._isHistoryLoaded = false;
        }

        try {
            // Filter by type 'mission' to separate from generic 'ai' chat
            const q = query(
                collection(firebaseInit.db, `conversations/${this.currentUserData.id}/messages`),
                where("lessonId", "==", this.lessonId),
                where("type", "==", "mission"),
                orderBy("timestamp", "asc")
            );

            this.chatUnsubscribe = onSnapshot(q, async (snapshot) => {
                this.chatHistory = snapshot.docs.map(doc => doc.data());
                this._isHistoryLoaded = true;

                await this.updateComplete;
                const historyEl = this.querySelector('#mission-chat-history');
                if (historyEl) {
                    historyEl.scrollTop = historyEl.scrollHeight;
                }
            }, (error) => {
                console.error("Mission Comms Error:", error);
                // Silent fail or small indicator?
                this._isHistoryLoaded = true;
            });

        } catch (error) {
            console.error("Mission Comms Load Error:", error);
            this._isHistoryLoaded = true;
        }
    }

    _handleKeypress(e) {
        if (e.key === 'Enter') {
            this._sendMessage();
        }
    }

    async _checkAndTriggerKickstart() {
        if (!this._isHistoryLoaded) return;
        if (this.chatHistory.length > 0) return;
        if (this._kickstartInProgress) return;

        if (!this.role || !this.currentUserData?.id || !this.lessonId) return;

        console.log("[MissionComms] Triggering Initial Briefing...");
        this._kickstartInProgress = true;

        // Visual feedback
        this.chatHistory = [...this.chatHistory, { sender: 'ai-typing', text: 'Connecting...' }];

        const systemPrompt = `SYSTEM_EVENT: Agent has connected. Role: ${this.role}. Mission: ${this.topic || 'Unknown'}. INITIATE BRIEFING immediately.`;

        try {
            const getAiAssistantResponse = httpsCallable(firebaseInit.functions, 'getAiAssistantResponse');
            const result = await getAiAssistantResponse({
                lessonId: this.lessonId,
                userQuestion: systemPrompt,
                mode: 'simulation', // META TAG
                role: this.role     // META TAG
            });
            const response = result.data;

            let aiResponseText = response.error
                ? `CONNECTION ERROR: ${response.error}`
                : (response.answer || "NO DATA RECEIVED");

            await addDoc(collection(firebaseInit.db, `conversations/${this.currentUserData.id}/messages`), {
                 lessonId: this.lessonId,
                 text: aiResponseText,
                 sender: 'ai',
                 type: 'mission', // Flag as mission message
                 timestamp: serverTimestamp()
            });

        } catch (e) {
            console.error("Mission Kickstart Failed:", e);
        } finally {
             this.chatHistory = this.chatHistory.filter(m => m.sender !== 'ai-typing');
        }
    }

    async _sendMessage() {
        if (!this.currentUserData?.id) {
            showToast("IDENTITY ERROR", true);
            return;
        }

        const inputEl = this.querySelector('#mission-chat-input');
        if (!inputEl) return;
        const text = inputEl.value.trim();
        if (!text) return;

        inputEl.value = '';

        const messageData = {
            lessonId: this.lessonId,
            text: text,
            sender: 'student',
            type: 'mission', // Flag as mission message
            timestamp: serverTimestamp()
        };

        try {
             // 1. Optimistic UI update (optional, but good for latency)
             // But onSnapshot handles it fast enough usually.
             // Let's stick to DB write first.
             const messageRef = collection(firebaseInit.db, `conversations/${this.currentUserData.id}/messages`);
             await addDoc(messageRef, messageData);

             // 2. Add Typing Indicator
             this.chatHistory = [...this.chatHistory, { sender: 'ai-typing', text: '...' }];

             // 3. Call AI with METADATA
             try {
                const getAiAssistantResponse = httpsCallable(firebaseInit.functions, 'getAiAssistantResponse');
                const result = await getAiAssistantResponse({
                    lessonId: this.lessonId,
                    userQuestion: text,
                    mode: 'simulation', // META TAG
                    role: this.role     // META TAG
                });
                const response = result.data;

                let aiResponseText = response.error ? `ERROR: ${response.error}` : (response.answer || "NO RESPONSE");

                 await addDoc(messageRef, {
                     lessonId: this.lessonId,
                     text: aiResponseText,
                     sender: 'ai',
                     type: 'mission',
                     timestamp: serverTimestamp()
                 });

            } catch (aiError) {
                console.error("Mission Comms AI Error:", aiError);
                await addDoc(messageRef, {
                     lessonId: this.lessonId,
                     text: `TRANSMISSION ERROR: ${aiError.message}`,
                     sender: 'system-error',
                     type: 'mission',
                     timestamp: serverTimestamp()
                });
            } finally {
                this.chatHistory = this.chatHistory.filter(m => m.sender !== 'ai-typing');
            }

        } catch (error) {
            console.error("Error sending message:", error);
            showToast("TRANSMISSION FAILED", true);
        }
    }
}

customElements.define('mission-comms', MissionComms);

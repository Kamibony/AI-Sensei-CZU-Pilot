import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { getAiAssistantResponse } from '../gemini-api.js';
import { APP_KNOWLEDGE_BASE } from '../utils/app-knowledge-base.js';

export class GuideBot extends LitElement {
    static properties = {
        isOpen: { state: true },
        messages: { state: true },
        isLoading: { state: true },
        userRole: { type: String },
        currentView: { type: String },
        contextData: { type: Object }
    };

    constructor() {
        super();
        this.isOpen = false;
        this.messages = [{
            sender: 'ai',
            text: 'Ahoj! Jsem tvůj AI průvodce. S čím ti mohu pomoci?'
        }];
        this.isLoading = false;
        this.userRole = 'unknown';
        this.currentView = 'unknown';
        this.contextData = {};
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        // Fix positioning on the host element to avoid clipping and stacking issues
        this.style.position = 'fixed';
        this.style.bottom = '20px';
        this.style.right = '20px';
        this.style.zIndex = '9999';
        this.style.pointerEvents = 'none'; // Allow clicks to pass through the empty container
        this.style.display = 'flex';
        this.style.flexDirection = 'column';
        this.style.alignItems = 'flex-end';
    }

    toggleChat() {
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            setTimeout(() => {
                const input = this.querySelector('input');
                if (input) input.focus();
                this._scrollToBottom();
            }, 100);
        }
    }

    _scrollToBottom() {
        const chatContainer = this.querySelector('#chat-messages');
        if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }

    async sendMessage() {
        const input = this.querySelector('input');
        const text = input.value.trim();
        if (!text) return;

        // 1. Add User Message
        this.messages = [...this.messages, { sender: 'user', text }];
        input.value = '';
        this.isLoading = true;
        this._scrollToBottom();

        try {
            // 2. Construct Prompt with Context
            const stateJSON = JSON.stringify({
                role: this.userRole,
                view: this.currentView,
                data: this.contextData
            });

            // AI LOGIC FIX: Injected System Instruction
            const systemPrompt = `
System: You are the AI Guide for the 'AI Sensei' educational platform. Help users (Students and Professors) navigate the interface. Answer briefly and helpfully in Czech.
Here is how the app works:
${APP_KNOWLEDGE_BASE}

The user is currently at View: [${this.currentView}].
User Role: [${this.userRole}].
User State Context: ${stateJSON}.

Answer the user's question briefly and helpfully based on this context.
If the user asks about something specific to their current view (e.g. "How do I add a student here?"), give specific instructions.
User Question: "${text}"
`;

            // 3. Call AI API
            const response = await getAiAssistantResponse({
                lessonId: 'guide-bot',
                userQuestion: systemPrompt
            });

            // 4. Add AI Response
            let aiText = "Omlouvám se, ale momentálně nemohu odpovědět.";
            if (response && response.answer) {
                aiText = response.answer;
            } else if (response && response.error) {
                aiText = `Chyba: ${response.error}`;
            }

            this.messages = [...this.messages, { sender: 'ai', text: aiText }];

        } catch (error) {
            console.error("GuideBot Error:", error);
            this.messages = [...this.messages, { sender: 'ai', text: "Došlo k chybě při komunikaci s AI." }];
        } finally {
            this.isLoading = false;
            this.requestUpdate();
            setTimeout(() => this._scrollToBottom(), 100);
        }
    }

    _handleInputKey(e) {
        if (e.key === 'Enter') {
            this.sendMessage();
        }
    }

    render() {
        return html`
                <!-- Chat Window -->
                ${this.isOpen ? html`
                    <div class="pointer-events-auto bg-white w-80 h-96 rounded-2xl shadow-2xl flex flex-col mb-4 border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-10 duration-200">
                        <!-- Header -->
                        <div class="bg-indigo-600 p-4 text-white flex justify-between items-center">
                            <div class="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                                </svg>
                                <span class="font-semibold">AI Průvodce</span>
                            </div>
                            <button @click=${this.toggleChat} class="text-white/80 hover:text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                                </svg>
                            </button>
                        </div>

                        <!-- Messages -->
                        <div id="chat-messages" class="flex-grow p-4 overflow-y-auto space-y-3 bg-slate-50">
                            ${this.messages.map(msg => html`
                                <div class="flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}">
                                    <div class="max-w-[85%] rounded-2xl px-4 py-2 text-sm ${msg.sender === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm'}">
                                        ${msg.text}
                                    </div>
                                </div>
                            `)}
                            ${this.isLoading ? html`
                                <div class="flex justify-start">
                                    <div class="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-2 shadow-sm flex items-center gap-1">
                                        <div class="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style="animation-delay: 0s"></div>
                                        <div class="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                                        <div class="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                                    </div>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Input -->
                        <div class="p-3 bg-white border-t border-slate-200">
                            <div class="relative">
                                <input type="text"
                                    class="w-full pl-4 pr-10 py-2 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                                    placeholder="Zeptej se na cokoliv..."
                                    @keydown=${this._handleInputKey}
                                    ?disabled=${this.isLoading}
                                >
                                <button @click=${this.sendMessage} ?disabled=${this.isLoading} class="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-600 hover:text-indigo-800 disabled:opacity-50">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                ` : ''}

                <!-- Toggle Button -->
                <button @click=${this.toggleChat} class="pointer-events-auto bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-4 shadow-lg transition-transform hover:scale-110 flex items-center justify-center group">
                    <span class="absolute right-full mr-3 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        AI Průvodce
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </button>
        `;
    }
}
customElements.define('guide-bot', GuideBot);

// public/js/views/professor/professor-interactions-view.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, doc, updateDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';

let sendMessageToStudentCallable = null;

export class ProfessorInteractionsView extends LitElement {
    static properties = {
        _conversations: { state: true, type: Array },
        _selectedStudentId: { state: true, type: String },
        _selectedStudentName: { state: true, type: String },
        _messages: { state: true, type: Array },
        _isLoadingConversations: { state: true, type: Boolean },
        _isLoadingMessages: { state: true, type: Boolean },
        _isSending: { state: true, type: Boolean },
    };

    constructor() {
        super();
        this._conversations = [];
        this._selectedStudentId = null;
        this._selectedStudentName = null;
        this._messages = [];
        this._isLoadingConversations = true;
        this._isLoadingMessages = false;
        this._isSending = false;

        this.conversationsUnsubscribe = null;
        this.messagesUnsubscribe = null;
        
        if (!sendMessageToStudentCallable) {
            if (!firebaseInit.functions) throw new Error("Firebase Functions not initialized.");
            sendMessageToStudentCallable = httpsCallable(firebaseInit.functions, 'sendMessageToStudent');
        }
    }

    createRenderRoot() { return this; } // Light DOM

    connectedCallback() {
        super.connectedCallback();
        this._listenForConversations();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.conversationsUnsubscribe) this.conversationsUnsubscribe();
        if (this.messagesUnsubscribe) this.messagesUnsubscribe();
    }

    _listenForConversations() {
        this._isLoadingConversations = true;
        const convQuery = query(collection(firebaseInit.db, "conversations"), orderBy("lastMessageTimestamp", "desc"));
        
        if (this.conversationsUnsubscribe) this.conversationsUnsubscribe();

        this.conversationsUnsubscribe = onSnapshot(convQuery, (querySnapshot) => {
            this._conversations = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this._isLoadingConversations = false;
        }, (error) => {
            console.error("Error fetching conversations:", error);
            showToast("Nepodařilo se načíst konverzace.", true);
            this._isLoadingConversations = false;
        });
    }

    _selectConversation(studentId, studentName) {
        if (this._selectedStudentId === studentId) return; // Už je vybraný

        this._selectedStudentId = studentId;
        this._selectedStudentName = studentName;
        this._messages = [];
        this._isLoadingMessages = true;

        // Označíme ako prečítané
        updateDoc(doc(firebaseInit.db, "conversations", studentId), { professorHasUnread: false });

        // Nastavíme listener pre správy
        if (this.messagesUnsubscribe) this.messagesUnsubscribe();
        
        const messagesQuery = query(collection(firebaseInit.db, "conversations", studentId, "messages"), orderBy("timestamp"));
        this.messagesUnsubscribe = onSnapshot(messagesQuery, (querySnapshot) => {
            this._messages = querySnapshot.docs.map(doc => doc.data());
            this._isLoadingMessages = false;
            // Scroll down after messages load
             this.updateComplete.then(() => {
                 const container = this.querySelector('#messages-container');
                 if (container) container.scrollTop = container.scrollHeight;
             });
        }, (error) => {
             console.error("Error fetching messages:", error);
             showToast("Nepodařilo se načíst zprávy.", true);
             this._isLoadingMessages = false;
        });
    }

    async _handleSend() {
        const chatInput = this.querySelector('#chat-input');
        const text = chatInput.value.trim();
        if (!text || !this._selectedStudentId || this._isSending) return;

        this._isSending = true;
        try {
            await sendMessageToStudentCallable({ studentId: this._selectedStudentId, text: text });
            chatInput.value = '';
        } catch (error) {
            console.error("Error sending message:", error);
            showToast(`Odeslání selhalo: ${error.message}`, true);
        } finally {
            this._isSending = false;
            chatInput.focus();
        }
    }

    _handleKeyPress(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this._handleSend();
        }
    }
    
    _handleAiReply() {
        const chatInput = this.querySelector('#chat-input');
        chatInput.value = "AI návrh: Děkuji za Váš dotaz, podívám se na to a dám Vám vědět.";
        chatInput.focus();
    }
    
    // --- Renderovacie Metódy ---
    
    renderConversationItem(conv) {
        const isSelected = this._selectedStudentId === conv.studentId;
        const bgClass = isSelected ? 'bg-slate-200' : (conv.professorHasUnread ? 'bg-green-50' : 'hover:bg-slate-50');
        
        return html`
            <div class="p-4 flex items-center space-x-3 border-b border-slate-100 cursor-pointer ${bgClass}"
                 @click=${() => this._selectConversation(conv.studentId, conv.studentName)}>
                <div>
                    <p class="font-semibold text-sm text-slate-800">${conv.studentName}</p>
                    <p class="text-xs ${conv.professorHasUnread && !isSelected ? 'text-green-600 font-bold' : 'text-slate-500'}">
                        ${(conv.lastMessage || "").substring(0, 30)}${conv.lastMessage?.length > 30 ? '...' : ''}
                    </p>
                </div>
            </div>
        `;
    }
    
    renderMessage(msg) {
        const sender = msg.senderId === 'professor' ? 'prof' : 'student';
        const justifyClass = sender === 'prof' ? 'justify-end' : 'justify-start';
        const bubbleClass = sender === 'prof' ? 'bg-green-700 text-white' : 'bg-white shadow-sm';
        
        return html`
            <div class="flex ${justifyClass}">
                <div class="max-w-md p-3 rounded-xl ${bubbleClass}">${msg.text}</div>
            </div>
        `;
    }

    renderChatWindow() {
        if (!this._selectedStudentId) {
            return html`
                <div class="flex-grow flex items-center justify-center text-slate-400">
                    Vyberte konverzaci ze seznamu vlevo
                </div>`;
        }
        
        return html`
            <header class="p-4 border-b border-slate-200 flex items-center space-x-3 bg-white flex-shrink-0">
                <h3 class="font-bold text-slate-800">${this._selectedStudentName}</h3>
            </header>
            <div id="messages-container" class="flex-grow p-4 overflow-y-auto space-y-4">
                ${this._isLoadingMessages 
                    ? html`<p class="text-slate-400">Načítám zprávy...</p>` 
                    : this._messages.map(msg => this.renderMessage(msg))}
            </div>
            <footer class="p-4 bg-white border-t border-slate-200 flex-shrink-0">
                <div class="relative">
                    <textarea id="chat-input" placeholder="Napište odpověď..." 
                              class="w-full bg-slate-100 border-transparent rounded-lg p-3 pr-28 focus:ring-2 focus:ring-green-500 resize-none" 
                              rows="1" 
                              @keypress=${this._handleKeyPress}
                              ?disabled=${this._isSending}></textarea>
                    <button @click=${this._handleAiReply} ?disabled=${this._isSending} class="absolute right-14 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-amber-700" title="Navrhnout odpověď (AI)">✨</button>
                    <button @click=${this._handleSend} ?disabled=${this._isSending} class="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-green-700" title="Odeslat">
                         ${this._isSending ? 
                            html`<div class="spinner-small"></div>` : 
                            html`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`}
                    </button>
                </div>
            </footer>
        `;
    }

    render() {
        let conversationContent;
        if (this._isLoadingConversations) {
            conversationContent = html`<p class="p-4 text-slate-400">Načítám konverzace...</p>`;
        } else if (this._conversations.length === 0) {
            conversationContent = html`<p class="p-4 text-slate-400">Zatím zde nejsou žádné konverzace.</p>`;
        } else {
            conversationContent = this._conversations.map(conv => this.renderConversationItem(conv));
        }

        return html`
            <aside class="w-full md:w-1/3 border-r border-slate-200 flex flex-col h-full">
                <header class="p-4 border-b border-slate-200 flex-shrink-0"><h2 class="font-bold text-slate-800">Konverzace se studenty</h2></header>
                <div id="conversations-list" class="overflow-y-auto">
                    ${conversationContent}
                </div>
            </aside>
            <main id="chat-window" class="w-full md:w-2/3 flex flex-col bg-slate-50 h-full">
                ${this.renderChatWindow()}
            </main>
        `;
    }
}

customElements.define('professor-interactions-view', ProfessorInteractionsView);

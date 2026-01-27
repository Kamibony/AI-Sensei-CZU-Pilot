// public/js/views/professor/professor-interactions-view.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, doc, updateDoc, query, orderBy, onSnapshot, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils/utils.js';

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
        _searchTerm: { state: true, type: String },
    };

    constructor() {
        super();
        this._conversations = []; this._selectedStudentId = null; this._selectedStudentName = null;
        this._messages = []; this._isLoadingConversations = true; this._isLoadingMessages = false;
        this._isSending = false; this._searchTerm = '';
        this.conversationsUnsubscribe = null; this.messagesUnsubscribe = null;
        if (!sendMessageToStudentCallable) {
            if (!firebaseInit.functions) throw new Error("Firebase Functions not initialized.");
            sendMessageToStudentCallable = httpsCallable(firebaseInit.functions, 'sendMessageToStudent');
        }
    }

    createRenderRoot() { return this; }

    connectedCallback() { super.connectedCallback(); this._listenForConversations(); }
    disconnectedCallback() { super.disconnectedCallback(); if (this.conversationsUnsubscribe) this.conversationsUnsubscribe(); if (this.messagesUnsubscribe) this.messagesUnsubscribe(); }

    _listenForConversations() {
        this._isLoadingConversations = true;
        const convQuery = query(collection(firebaseInit.db, "conversations"), orderBy("lastMessageTimestamp", "desc"));
        if (this.conversationsUnsubscribe) this.conversationsUnsubscribe();
        this.conversationsUnsubscribe = onSnapshot(convQuery, (querySnapshot) => {
            this._conversations = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); this._isLoadingConversations = false;
        }, (error) => { console.error("Error fetching conversations:", error); showToast("Nepodařilo se načíst konverzace.", true); this._isLoadingConversations = false; });
    }

    _selectConversation(studentId, studentName) {
        if (this._selectedStudentId === studentId) return;
        this._selectedStudentId = studentId; this._selectedStudentName = studentName;
        this._messages = []; this._isLoadingMessages = true;
        updateDoc(doc(firebaseInit.db, "conversations", studentId), { professorHasUnread: false });
        if (this.messagesUnsubscribe) this.messagesUnsubscribe();
        const messagesQuery = query(collection(firebaseInit.db, "conversations", studentId, "messages"), orderBy("timestamp"));
        this.messagesUnsubscribe = onSnapshot(messagesQuery, (querySnapshot) => {
            this._messages = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()})); this._isLoadingMessages = false;
            this.updateComplete.then(() => { const container = this.querySelector('#messages-container'); if (container) container.scrollTop = container.scrollHeight; });
        }, (error) => { console.error("Error fetching messages:", error); showToast("Nepodařilo se načíst zprávy.", true); this._isLoadingMessages = false; });
    }

    async _handleSend() {
        const chatInput = this.querySelector('#chat-input'); const text = chatInput.value.trim();
        if (!text || !this._selectedStudentId || this._isSending) return;
        this._isSending = true;
        try { await sendMessageToStudentCallable({ studentId: this._selectedStudentId, text: text }); chatInput.value = ''; }
        catch (error) { console.error("Error sending message:", error); showToast(`Odeslání selhalo: ${error.message}`, true); }
        finally { this._isSending = false; setTimeout(() => chatInput?.focus(), 50); }
    }

    _handleKeyPress(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._handleSend(); } }
    _handleAiReply() { const chatInput = this.querySelector('#chat-input'); chatInput.value = "AI návrh: Děkuji za Váš dotaz..."; chatInput.focus(); }
    _formatTimestamp(timestamp) { if (!timestamp) return ''; const date = (timestamp instanceof Timestamp) ? timestamp.toDate() : new Date(timestamp); return date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }); }
    _getAvatarColor(id = '') { const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500']; let hash = 0; for (let i = 0; i < id.length; i++) { hash = id.charCodeAt(i) + ((hash << 5) - hash); } const index = Math.abs(hash % colors.length); return colors[index]; }
    _handleSearchInput(e) { this._searchTerm = e.target.value.toLowerCase(); }
    get _filteredConversations() { if (!this._searchTerm) { return this._conversations; } return this._conversations.filter(conv => (conv.studentName?.toLowerCase() || '').includes(this._searchTerm)); }


    // === AKTUALIZOVANÁ METÓDA - Renderovanie Karty Konverzácie ===
    renderConversationCard(conv) {
        const isSelected = this._selectedStudentId === conv.studentId;
        // Výraznejší tieň a border pre selected, jemný hover
        const cardClasses = isSelected
            ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-600 shadow-md' // Aktívna
            : 'bg-white hover:bg-slate-50 border-l-4 border-transparent hover:shadow'; // Neaktívna
        const initials = (conv.studentName || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const avatarBgColor = this._getAvatarColor(conv.studentId);
        const lastMessagePreview = (conv.lastMessage || "").substring(0, 40) + (conv.lastMessage?.length > 40 ? '...' : '');
        const lastMessageTime = this._formatTimestamp(conv.lastMessageTimestamp);

        return html`
            <div class="conversation-card border-b border-slate-100 cursor-pointer transition-all duration-150 ease-in-out ${cardClasses}"
                 @click=${() => this._selectConversation(conv.studentId, conv.studentName)}>
                 <div class="p-4 flex items-center space-x-4"> <div class="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-base ${avatarBgColor}">
                        ${initials}
                    </div>
                     <div class="flex-grow min-w-0">
                         <div class="flex justify-between items-baseline">
                             <p class="font-semibold text-base text-slate-800 truncate pr-2">${conv.studentName}</p> <p class="text-xs text-slate-400 flex-shrink-0">${lastMessageTime}</p>
                         </div>
                         <div class="flex justify-between items-center mt-1"> <p class="text-sm ${conv.professorHasUnread && !isSelected ? 'text-green-600 font-medium' : 'text-slate-500'} truncate pr-2" title="${conv.lastMessage || ''}">
                                 ${lastMessagePreview || html`<i>Žádné zprávy</i>`}
                              </p>
                              ${conv.professorHasUnread && !isSelected ? html`
                                 <div class="flex-shrink-0 w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" title="Nová zpráva"></div> ` : ''}
                         </div>
                     </div>
                 </div>
            </div>
        `;
    }
    // === KONIEC AKTUALIZOVANEJ METÓDY ===


    renderMessage(msg) {
        const sender = msg.senderId === 'professor' ? 'prof' : 'student';
        const justifyClass = sender === 'prof' ? 'justify-end' : 'justify-start';
        const bubbleClass = sender === 'prof' ? 'bg-gradient-to-br from-green-600 to-green-800 text-white shadow-md' : 'bg-white shadow-md border border-slate-100';
        const time = this._formatTimestamp(msg.timestamp);

        return html`
            <div class="flex ${justifyClass} group" .key=${msg.id}>
                 <div class="max-w-xl">
                    <div class="px-4 py-2 rounded-xl ${bubbleClass}">
                        ${msg.text}
                    </div>
                     <p class="text-xs text-slate-400 mt-1 px-1 ${sender === 'prof' ? 'text-right' : 'text-left'} opacity-0 group-hover:opacity-100 transition-opacity">
                         ${time}
                     </p>
                 </div>
            </div>`;
    }

    renderChatWindow() {
        if (!this._selectedStudentId) { return html`<div class="flex-grow flex items-center justify-center text-slate-400 p-4 text-center">Vyberte konverzaci ze seznamu vlevo</div>`; }
        return html`
            <header class="p-4 border-b border-slate-200 flex items-center space-x-3 bg-white flex-shrink-0"> <h3 class="font-bold text-slate-800">${this._selectedStudentName}</h3> </header>
            <div id="messages-container" class="flex-grow p-4 overflow-y-auto space-y-2"> ${this._isLoadingMessages ? html`<p class="text-slate-400">Načítám zprávy...</p>` : this._messages.map(msg => this.renderMessage(msg))} </div>
            <footer class="p-4 bg-white border-t border-slate-200 flex-shrink-0">
                <div class="relative">
                    <textarea id="chat-input" placeholder="Napište odpověď..." class="w-full bg-slate-100 border-transparent rounded-lg p-3 pr-28 focus:ring-2 focus:ring-green-500 resize-none" rows="1" @keypress=${this._handleKeyPress} ?disabled=${this._isSending}></textarea>
                    <button @click=${this._handleAiReply} ?disabled=${this._isSending} class="absolute right-14 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-amber-700 disabled:opacity-50" title="Navrhnout odpověď (AI)">✨</button>
                    <button @click=${this._handleSend} ?disabled=${this._isSending} class="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-green-700 disabled:opacity-50" title="Odeslat">
                         ${this._isSending ? html`<div class="spinner-small border-slate-500"></div>` : html`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`}
                    </button>
                </div>
            </footer>`;
    }

    render() {
        const filteredConversations = this._filteredConversations;
        let conversationContent;
        if (this._isLoadingConversations) { conversationContent = html`<p class="p-4 text-slate-400">Načítám konverzace...</p>`; }
        else if (this._conversations.length === 0) { conversationContent = html`<p class="p-4 text-slate-400">Zatím zde nejsou žádné konverzace.</p>`; }
        else if (filteredConversations.length === 0) { conversationContent = html`<p class="p-4 text-slate-400">Nebyly nalezeny žádné odpovídající konverzace.</p>`; }
        else { conversationContent = filteredConversations.map(conv => this.renderConversationCard(conv)); }

        return html`
            <aside data-tour="interactions-start" class="w-full md:w-1/3 border-r border-slate-200 flex flex-col h-full bg-white">
                <header class="p-4 border-b border-slate-200 flex-shrink-0">
                     <h2 class="font-bold text-slate-800 mb-3">Konverzace</h2>
                     <input type="search" placeholder="Hledat studenta..." .value=${this._searchTerm} @input=${this._handleSearchInput} class="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-transparent">
                </header>
                <div id="conversations-list" class="overflow-y-auto flex-grow p-2 space-y-1">
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

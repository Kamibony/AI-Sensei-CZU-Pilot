import { collection, doc, updateDoc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { showToast } from '../../utils.js';

function renderChatWindow(studentId, studentName, db, functions) {
    const sendMessageToStudent = httpsCallable(functions, 'sendMessageToStudent');
    const chatWindow = document.getElementById('chat-window');
    chatWindow.innerHTML = `
        <header class="p-4 border-b border-slate-200 flex items-center space-x-3 bg-white flex-shrink-0">
            <h3 class="font-bold text-slate-800">${studentName}</h3>
        </header>
        <div id="messages-container" class="flex-grow p-4 overflow-y-auto space-y-4">Načítám zprávy...</div>
        <footer class="p-4 bg-white border-t border-slate-200 flex-shrink-0">
            <div class="relative">
                <textarea id="chat-input" placeholder="Napište odpověď..." class="w-full bg-slate-100 border-transparent rounded-lg p-3 pr-28 focus:ring-2 focus:ring-green-500 resize-none" rows="1"></textarea>
                <button id="ai-reply-btn" class="absolute right-14 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-amber-700" title="Navrhnout odpověď (AI)">✨</button>
                <button id="send-reply-btn" class="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-green-700" title="Odeslat">
                     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </div>
        </footer>
    `;

    updateDoc(doc(db, "conversations", studentId), { professorHasUnread: false });

    const messagesContainer = document.getElementById('messages-container');
    const messagesQuery = query(collection(db, "conversations", studentId, "messages"), orderBy("timestamp"));

    onSnapshot(messagesQuery, (querySnapshot) => {
        messagesContainer.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const msg = doc.data();
            const msgEl = document.createElement('div');
            const sender = msg.senderId === 'professor' ? 'prof' : 'student';
            msgEl.className = `flex ${sender === 'prof' ? 'justify-end' : 'justify-start'}`;
            msgEl.innerHTML = `<div class="max-w-md p-3 rounded-xl ${sender === 'prof' ? 'bg-green-700 text-white' : 'bg-white shadow-sm'}">${msg.text}</div>`;
            messagesContainer.appendChild(msgEl);
        });
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });

    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-reply-btn');

    const handleSend = async () => {
        const text = chatInput.value.trim();
        if (!text) return;

        chatInput.disabled = true;
        sendBtn.disabled = true;

        try {
            await sendMessageToStudent({ studentId: studentId, text: text });
            chatInput.value = '';
        } catch (error) {
            console.error("Error sending message:", error);
            showToast(`Odeslání selhalo: ${error.message}`, true);
        } finally {
            chatInput.disabled = false;
            sendBtn.disabled = false;
            chatInput.focus();
        }
    };

    sendBtn.addEventListener('click', handleSend);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    document.getElementById('ai-reply-btn').addEventListener('click', () => {
        chatInput.value = "AI návrh: Děkuji za Váš dotaz, podívám se na to a dám Vám vědět.";
    });
}


export function renderStudentInteractions(container, db, functions, conversationsUnsubscribe) {
    container.className = 'flex-grow flex h-screen bg-white view-transition';
    container.innerHTML = `
        <aside class="w-full md:w-1/3 border-r border-slate-200 flex flex-col">
            <header class="p-4 border-b border-slate-200 flex-shrink-0"><h2 class="font-bold text-slate-800">Konverzace se studenty</h2></header>
            <div id="conversations-list" class="overflow-y-auto"><p class="p-4 text-slate-400">Načítám konverzace...</p></div>
        </aside>
        <main id="chat-window" class="w-full md:w-2/3 flex flex-col bg-slate-50">
            <div class="flex-grow flex items-center justify-center text-slate-400">Vyberte konverzaci ze seznamu vlevo</div>
        </main>
    `;

    const conversationsListEl = document.getElementById('conversations-list');

    if (conversationsUnsubscribe) conversationsUnsubscribe();

    const convQuery = query(collection(db, "conversations"), orderBy("lastMessageTimestamp", "desc"));
    conversationsUnsubscribe = onSnapshot(convQuery, (querySnapshot) => {
        if (querySnapshot.empty) {
            conversationsListEl.innerHTML = `<p class="p-4 text-slate-400">Zatím zde nejsou žádné konverzace.</p>`;
            return;
        }

        conversationsListEl.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const conv = doc.data();
            const convEl = document.createElement('div');
            convEl.className = `p-4 flex items-center space-x-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${conv.professorHasUnread ? 'bg-green-50' : ''}`;
            convEl.dataset.studentId = conv.studentId;

            convEl.innerHTML = `
                <div>
                    <p class="font-semibold text-sm text-slate-800">${conv.studentName}</p>
                    <p class="text-xs ${conv.professorHasUnread ? 'text-green-600 font-bold' : 'text-slate-500'}">${(conv.lastMessage || "").substring(0, 30)}...</p>
                </div>
            `;
            convEl.addEventListener('click', () => renderChatWindow(conv.studentId, conv.studentName, db, functions));
            conversationsListEl.appendChild(convEl);
        });
    });
    return conversationsUnsubscribe;
}

import { collection, onSnapshot, query, orderBy, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { showToast } from "../../utils.js";
import { db, functions } from "../../firebase-init.js";

const sendMessageFromProfessor = httpsCallable(functions, 'sendMessageFromProfessor');

// --- FINÁLNA OPRAVA: Pridané kľúčové slovo "export" ---
export function renderStudentInteractions(container) {
    let conversationsUnsubscribe = null;
    let selectedStudentId = null;

    container.innerHTML = `
        <div class="w-full flex h-screen">
            <aside id="conversations-list" class="w-1/3 bg-white border-r border-slate-200 flex flex-col h-full"></aside>
            <main id="chat-view" class="flex-grow bg-slate-50 flex items-center justify-center h-full">
                <p class="text-slate-500">Vyberte konverzaci ze seznamu</p>
            </main>
        </div>
    `;

    const conversationsListEl = document.getElementById('conversations-list');
    const chatViewEl = document.getElementById('chat-view');

    const conversationsQuery = query(collection(db, 'conversations'), orderBy('lastMessage.timestamp', 'desc'));
    
    conversationsUnsubscribe = onSnapshot(conversationsQuery, (querySnapshot) => {
        const conversations = [];
        querySnapshot.forEach(doc => {
            conversations.push({ id: doc.id, ...doc.data() });
        });

        const conversationsHtml = conversations.map(convo => `
            <div class="conversation-item p-4 border-b cursor-pointer hover:bg-slate-50 ${selectedStudentId === convo.id ? 'bg-green-50' : ''}" data-student-id="${convo.id}">
                <h4 class="font-semibold text-slate-800">${convo.studentName || 'Neznámý student'}</h4>
                <p class="text-sm text-slate-500 truncate">${convo.lastMessage?.text || 'Žádné zprávy'}</p>
                <span class="text-xs text-slate-400">${convo.lastMessage?.timestamp ? new Date(convo.lastMessage.timestamp.seconds * 1000).toLocaleTimeString() : ''}</span>
            </div>
        `).join('');
        
        conversationsListEl.innerHTML = `
            <header class="p-4 border-b"><h3 class="text-xl font-bold">Konverzace</h3></header>
            <div class="flex-grow overflow-y-auto">${conversationsHtml}</div>
        `;

        conversationsListEl.querySelectorAll('.conversation-item').forEach(item => {
            item.addEventListener('click', () => {
                selectedStudentId = item.dataset.studentId;
                renderChatForStudent(chatViewEl, selectedStudentId);
                // Zvýraznenie aktívnej konverzácie
                conversationsListEl.querySelectorAll('.conversation-item').forEach(i => i.classList.remove('bg-green-50'));
                item.classList.add('bg-green-50');
            });
        });

    }, (error) => {
        console.error("Error fetching conversations:", error);
        showToast("Nepodařilo se načíst konverzace.", true);
    });

    return conversationsUnsubscribe;
}

function renderChatForStudent(container, studentId) {
    container.innerHTML = `
        <div class="w-full h-full flex flex-col p-4">
            <header class="text-center mb-4 flex-shrink-0">
                <p id="chat-header-name" class="font-bold text-slate-800">Načítám...</p>
            </header>
            <div id="professor-chat-history" class="flex-grow space-y-4 overflow-y-auto p-2 bg-white rounded-lg shadow-inner">Načítám zprávy...</div>
            <footer class="mt-4 flex-shrink-0">
                <div class="flex items-center bg-white rounded-full p-2 shadow-inner">
                    <textarea id="professor-chat-input" class="flex-grow bg-transparent p-2 text-sm focus:outline-none resize-none" rows="1" placeholder="Napište zprávu..."></textarea>
                    <button id="professor-send-btn" class="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 hover:bg-blue-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </div>
            </footer>
        </div>
    `;

    const sendBtn = container.querySelector('#professor-send-btn');
    const input = container.querySelector('#professor-chat-input');
    const historyContainer = container.querySelector('#professor-chat-history');
    const headerNameEl = container.querySelector('#chat-header-name');

    getDoc(doc(db, 'students', studentId)).then(docSnap => {
        if(docSnap.exists()) {
            headerNameEl.textContent = docSnap.data().name || 'Student';
        }
    });

    const messagesQuery = query(collection(db, "conversations", studentId, "messages"), orderBy("timestamp"));
    const messagesUnsubscribe = onSnapshot(messagesQuery, (querySnapshot) => {
        historyContainer.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const msg = doc.data();
            const messageEl = document.createElement('div');
            const sender = msg.senderId === studentId ? 'student' : 'professor';
            messageEl.className = `flex ${sender === 'professor' ? 'justify-end' : 'justify-start'}`;
            messageEl.innerHTML = `<div class="${sender === 'professor' ? 'bg-green-200' : 'bg-white'} p-3 rounded-xl max-w-xs text-sm">${msg.text}</div>`;
            historyContainer.appendChild(messageEl);
        });
        historyContainer.scrollTop = historyContainer.scrollHeight;
    });

    const handleSend = async () => {
        const text = input.value.trim();
        if (!text) return;
        
        const tempInputVal = input.value;
        input.value = '';
        sendBtn.disabled = true;

        try {
            await sendMessageFromProfessor({ studentId: studentId, text: tempInputVal });
        } catch (error) {
            console.error("Error sending message:", error);
            showToast(`Odeslání zprávy selhalo: ${error.message}`, true);
            input.value = tempInputVal;
        } finally {
            sendBtn.disabled = false;
        }
    };
    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    return messagesUnsubscribe;
}

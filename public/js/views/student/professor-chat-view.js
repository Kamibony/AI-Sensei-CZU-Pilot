import { collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, auth } from "../../firebase-init.js"; 
import { showToast } from "../../utils.js";

// Váš existujúci kód (upravená jedna premenná)
const sendMessageFromStudent = () => { /* Implementácia podľa potreby */ };

export function renderProfessorChat(lessonData, container) {
    container.innerHTML = `
        <h2 class="text-2xl md:text-3xl font-extrabold text-slate-800 mb-6 text-center">Konzultace k lekci</h2>
        <div class="w-full max-w-md mx-auto bg-slate-900 rounded-[40px] border-[14px] border-slate-900 shadow-2xl relative">
            <div class="w-full h-full bg-blue-100 bg-[url('https://i.pinimg.com/736x/8c/98/99/8c98994518b575bfd8c/949e91d20548b.jpg')] bg-center bg-cover rounded-[26px]">
                <div class="h-[600px] flex flex-col p-4">
                     <header class="text-center mb-4 flex-shrink-0"><p class="font-bold text-slate-800">Profesor</p><p class="text-xs text-slate-500">Odpoví, jakmile to bude možné</p></header>
                    <div id="student-chat-history" class="flex-grow space-y-4 overflow-y-auto p-2">Načítám zprávy...</div>
                    <footer class="mt-4 flex-shrink-0"><div class="flex items-center bg-white rounded-full p-2 shadow-inner"><textarea id="student-chat-input" class="flex-grow bg-transparent p-2 text-sm focus:outline-none resize-none" rows="1" placeholder="Napište zprávu profesorovi..."></textarea><button id="student-send-btn" class="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 hover:bg-blue-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button></div></footer>
                </div>
            </div>
        </div>
    `;
    const sendBtn = container.querySelector('#student-send-btn');
    const input = container.querySelector('#student-chat-input');
    const historyContainer = container.querySelector('#student-chat-history');
    
    // Teraz už 'auth' nebude 'undefined'
    const studentId = auth.currentUser.uid;

    const messagesQuery = query(collection(db, "conversations", studentId, "messages"), orderBy("timestamp"));
    const unsubscribe = onSnapshot(messagesQuery, (querySnapshot) => {
        historyContainer.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const msg = doc.data();
            const messageEl = document.createElement('div');
            const sender = msg.senderId === studentId ? 'user' : 'professor';
            messageEl.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
            messageEl.innerHTML = `<div class="${sender === 'user' ? 'bg-green-200' : 'bg-white'} p-3 rounded-xl max-w-xs text-sm">${msg.text}</div>`;
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
            await sendMessageFromStudent({ text: tempInputVal });
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
}

import { getAiAssistantResponse } from '../../gemini-api.js';
import { getCurrentUserData } from '../../student.js';

// OPRAVA: Pridané kľúčové slovo "export"
export function renderAIChat(container) {
    const studentData = getCurrentUserData();
    if (!studentData) {
        container.innerHTML = `<p class="p-4 text-red-500">Chyba: Informace o studentovi nebyly nalezeny.</p>`;
        return;
    }

    let conversationHistory = [{
        role: "user",
        parts: [{ text: "Ahoj, představ se." }]
    }];

    container.innerHTML = `
        <div class="flex flex-col h-full bg-white">
            <header class="p-4 border-b border-slate-200">
                <h2 class="text-xl font-bold text-slate-800">Chat s AI Sensei</h2>
                <p class="text-sm text-slate-500">Váš osobní AI asistent pro studium</p>
            </header>
            <div id="chat-messages" class="flex-grow p-4 overflow-y-auto"></div>
            <footer class="p-4 border-t border-slate-200">
                <div class="flex items-center space-x-2">
                    <input type="text" id="chat-input" class="w-full p-2 border rounded-lg" placeholder="Napište zprávu...">
                    <button id="send-chat-btn" class="p-2 bg-green-700 text-white rounded-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </div>
            </footer>
        </div>
    `;

    const messagesContainer = document.getElementById('chat-messages');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-chat-btn');

    const handleSendMessage = async () => {
        const messageText = input.value.trim();
        if (!messageText) return;

        addMessage(messageText, 'user');
        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;
        
        conversationHistory.push({ role: 'user', parts: [{ text: messageText }] });

        const response = await getAiAssistantResponse(studentData.uid, conversationHistory);
        
        if (response && response.reply) {
            addMessage(response.reply, 'model');
            conversationHistory.push({ role: 'model', parts: [{ text: response.reply }] });
        } else {
            addMessage('Omlouvám se, došlo k chybě.', 'model', true);
        }
        
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
    };

    sendBtn.addEventListener('click', handleSendMessage);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSendMessage();
        }
    });

    function addMessage(text, role, isError = false) {
        const messageEl = document.createElement('div');
        messageEl.classList.add('chat-message', role === 'user' ? 'user-message' : 'model-message');
        if (isError) {
            messageEl.classList.add('error-message');
        }
        messageEl.textContent = text;
        messagesContainer.appendChild(messageEl);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

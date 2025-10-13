import { getAiAssistantResponse } from '../../gemini-api.js';

export function renderAIAssistantChat(lessonData, container) {
    container.innerHTML = `
        <h2 class="text-2xl md:text-3xl font-extrabold text-slate-800 mb-6 text-center">AI Asistent Lekce</h2>
        <div class="w-full max-w-md mx-auto bg-slate-900 rounded-[40px] border-[14px] border-slate-900 shadow-2xl relative">
            <div class="w-full h-full bg-blue-100 bg-[url('https://i.pinimg.com/736x/8c/98/99/8c98994518b575bfd8c/949e91d20548b.jpg')] bg-center bg-cover rounded-[26px]">
                <div class="h-[600px] flex flex-col p-4">
                    <div id="student-chat-history" class="flex-grow space-y-4 overflow-y-auto p-2"><div class="flex justify-start"><div class="bg-white p-3 rounded-r-xl rounded-t-xl max-w-xs text-sm">Ahoj! Zeptej se mě na cokoliv ohledně této lekce.</div></div></div>
                    <footer class="mt-4 flex-shrink-0"><div class="flex items-center bg-white rounded-full p-2 shadow-inner"><textarea id="student-chat-input" class="flex-grow bg-transparent p-2 text-sm focus:outline-none resize-none" rows="1" placeholder="Napište zprávu..."></textarea><button id="student-send-btn" class="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 hover:bg-blue-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button></div></footer>
                </div>
            </div>
        </div>
    `;
    const sendBtn = container.querySelector('#student-send-btn');
    const input = container.querySelector('#student-chat-input');
    const historyContainer = container.querySelector('#student-chat-history');
    const addMessage = (text, sender) => {
        const messageEl = document.createElement('div');
        messageEl.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
        messageEl.innerHTML = `<div class="${sender === 'user' ? 'bg-green-200' : 'bg-white'} p-3 rounded-xl max-w-xs text-sm">${text.replace(/\n/g, '<br>')}</div>`;
        historyContainer.appendChild(messageEl);
        historyContainer.scrollTop = historyContainer.scrollHeight;
        return messageEl;
    };
    const handleSend = async () => {
        const userQuestion = input.value.trim();
        if (!userQuestion) return;
        input.value = '';
        input.style.height = 'auto';
        sendBtn.disabled = true;
        addMessage(userQuestion, 'user');
        const thinkingBubble = addMessage("...", 'ai');
        try {
            const dataToSend = {
                lessonId: lessonData.id,
                userQuestion: userQuestion
            };
            const result = await getAiAssistantResponse(dataToSend);
            if (result.error) throw new Error(result.error);
            thinkingBubble.querySelector('div').innerHTML = result.answer.replace(/\n/g, '<br>');
        } catch (error) {
            console.error("Error getting AI assistant response:", error);
            thinkingBubble.querySelector('div').innerHTML = `<p class="text-red-500">Omlouvám se, došlo k chybě.</p>`;
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
export function renderTelegramPage(container, userData) {
    const botUsername = 'ai_sensei_czu_bot';
    let contentHtml = '';

    if (userData && userData.telegramChatId) {
        const connectionLink = `https://t.me/${botUsername}`;
        contentHtml = `
            <div class="text-center p-4">
                <div class="text-6xl mb-4">✅</div>
                <h2 class="text-2xl font-bold text-slate-800">Váš účet je propojen!</h2>
                <p class="text-slate-500 mt-2 mb-6">Můžete komunikovat s AI Sensei přímo přes Telegram.</p>
                <a href="${connectionLink}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center gap-3 w-full max-w-sm p-4 font-semibold text-white bg-sky-500 rounded-xl hover:bg-sky-600 transition-colors shadow-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    Otevřít AI Sensei v Telegrame
                </a>
            </div>
        `;
    } else if (userData && userData.telegramConnectionToken) {
        const connectionLink = `https://t.me/${botUsername}?start=${userData.telegramConnectionToken}`;
        contentHtml = `
             <div class="text-center p-4">
                <div class="text-6xl mb-4">🤖</div>
                <h2 class="text-2xl font-bold text-slate-800">Propojte se s AI Sensei Botem</h2>
                <p class="text-slate-500 mt-2 mb-6 max-w-md mx-auto">Získejte přístup k AI asistentovi a dostávejte odpovědi od profesora přímo ve vašem mobilu.</p>
                <a href="${connectionLink}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center gap-3 w-full max-w-sm p-4 font-semibold text-white bg-sky-500 rounded-xl hover:bg-sky-600 transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    Aktivovat propojení s Telegramem
                </a>
                <p class="text-xs text-slate-400 mt-4">Po kliknutí budete přesměrováni do aplikace Telegram.</p>
            </div>
        `;
    } else {
        contentHtml = `<p class="text-center text-slate-500">Informace o propojení s Telegramem se nepodařilo načíst.</p>`;
    }

    container.innerHTML = `<div class="flex items-center justify-center h-full">${contentHtml}</div>`;
}
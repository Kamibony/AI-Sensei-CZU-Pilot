export function renderTelegram(container) {
    container.innerHTML = `
        <div class="p-6">
            <h1 class="text-3xl font-bold text-slate-800 mb-4">Připojte se k nám na Telegramu!</h1>
            <div class="bg-white rounded-lg shadow-md p-6">
                <p class="text-slate-600 mb-4">
                    Pro rychlou komunikaci, oznámení a podporu jsme pro vás vytvořili speciální Telegram kanál.
                    Naskenujte QR kód níže nebo klikněte na odkaz pro připojení.
                </p>
                <div class="flex flex-col items-center">
                    <div class="w-48 h-48 bg-gray-200 flex items-center justify-center mb-4">
                        <span class="text-gray-500">Zde bude QR kód</span>
                    </div>
                    <a href="#" class="bg-blue-500 text-white font-bold py-2 px-4 rounded hover:bg-blue-700 transition-colors">
                        Připojit se k Telegram kanálu
                    </a>
                </div>
            </div>
        </div>
    `;
}

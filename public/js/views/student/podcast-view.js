import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function renderPodcast(container, db, lessonId) {
    if (!lessonId) {
        container.innerHTML = `<p class="p-4">Nebyla vybrána žádná lekce pro zobrazení podcastu.</p>`;
        return;
    }

    try {
        container.innerHTML = `<div class="p-4">Načítání podcastu...</div>`;
        const podcastDocRef = doc(db, "lessons", lessonId, "activities", "podcast");
        const podcastDoc = await getDoc(podcastDocRef);

        if (!podcastDoc.exists()) {
            container.innerHTML = `<p class="p-4">Pro tuto lekci nebyl nalezen žádný podcast.</p>`;
            return;
        }

        const podcastData = podcastDoc.data();
        container.innerHTML = `
            <div class="p-6">
                <h1 class="text-3xl font-bold text-slate-800 mb-4">Podcast k lekci</h1>
                <div class="bg-white rounded-lg shadow-md p-6">
                    <div class="mb-4">
                        <audio controls class="w-full">
                            <source src="${podcastData.audioUrl || '#'}" type="audio/mpeg">
                            Váš prohlížeč nepodporuje audio element.
                        </audio>
                    </div>
                    <h2 class="text-2xl font-semibold text-slate-700 mb-2">Přepis podcastu</h2>
                    <div class="prose max-w-none text-slate-600">
                        ${podcastData.script.replace(/\n/g, '<br>')}
                    </div>
                </div>
            </div>
        `;

    } catch (error) {
        console.error("Chyba při načítání podcastu:", error);
        container.innerHTML = `<p class="p-4 text-red-500">Nepodařilo se načíst podcast.</p>`;
    }
}

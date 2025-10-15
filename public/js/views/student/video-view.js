import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function renderVideo(container, db, lessonId) {
    if (!lessonId) {
        container.innerHTML = `<p class="p-4">Nebyla vybrána žádná lekce pro zobrazení videa.</p>`;
        return;
    }

    try {
        container.innerHTML = `<div class="p-4">Načítání videa...</div>`;
        const videoDocRef = doc(db, "lessons", lessonId, "activities", "video");
        const videoDoc = await getDoc(videoDocRef);

        if (!videoDoc.exists()) {
            container.innerHTML = `<p class="p-4">Pro tuto lekci nebylo nalezeno žádné video.</p>`;
            return;
        }

        const videoData = videoDoc.data();
        container.innerHTML = `
            <div class="p-6">
                <h1 class="text-3xl font-bold text-slate-800 mb-4">${videoData.title || 'Video k lekci'}</h1>
                <div class="aspect-w-16 aspect-h-9 bg-black rounded-lg shadow-md overflow-hidden">
                    <iframe src="${videoData.videoUrl || ''}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="w-full h-full"></iframe>
                </div>
            </div>
        `;

    } catch (error) {
        console.error("Chyba při načítání videa:", error);
        container.innerHTML = `<p class="p-4 text-red-500">Nepodařilo se načíst video.</p>`;
    }
}

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function renderPresentation(container, db, lessonId) {
    if (!lessonId) {
        container.innerHTML = `<p class="p-4">Nebyla vybrána žádná lekce pro zobrazení prezentace.</p>`;
        return;
    }

    try {
        container.innerHTML = `<div class="p-4">Načítání prezentace...</div>`;
        const presentationDocRef = doc(db, "lessons", lessonId, "activities", "presentation");
        const presentationDoc = await getDoc(presentationDocRef);

        if (!presentationDoc.exists()) {
            container.innerHTML = `<p class="p-4">Pro tuto lekci nebyla nalezena žádná prezentace.</p>`;
            return;
        }

        const presentationData = presentationDoc.data().data; // Předpokládáme, že JSON je v poli 'data'
        let currentSlide = 0;

        function showSlide(slideIndex) {
            const slides = document.querySelectorAll('.slide');
            slides.forEach((slide, index) => {
                slide.style.display = index === slideIndex ? 'block' : 'none';
            });
            document.getElementById('slide-counter').textContent = `Snímek ${slideIndex + 1} z ${slides.length}`;
        }

        let presentationHtml = `
            <div class="p-6 h-full flex flex-col">
                <h1 class="text-3xl font-bold text-slate-800 mb-4">Prezentace k lekci</h1>
                <div id="presentation-container" class="bg-white rounded-lg shadow-md p-6 flex-grow relative">
        `;

        presentationData.slides.forEach((slide, index) => {
            presentationHtml += `
                <div class="slide" style="${index === 0 ? '' : 'display: none;'}">
                    <h2 class="text-2xl font-bold text-slate-800 mb-4">${slide.title}</h2>
                    <ul class="list-disc pl-5 space-y-2 text-slate-600">
                        ${slide.points.map(point => `<li>${point}</li>`).join('')}
                    </ul>
                </div>
            `;
        });
        
        presentationHtml += `
                </div>
                <div class="flex justify-between items-center mt-4">
                    <button id="prev-slide" class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded">Předchozí</button>
                    <span id="slide-counter"></span>
                    <button id="next-slide" class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded">Další</button>
                </div>
            </div>
        `;
        
        container.innerHTML = presentationHtml;
        
        showSlide(currentSlide);

        document.getElementById('prev-slide').addEventListener('click', () => {
            currentSlide = (currentSlide > 0) ? currentSlide - 1 : presentationData.slides.length - 1;
            showSlide(currentSlide);
        });

        document.getElementById('next-slide').addEventListener('click', () => {
            currentSlide = (currentSlide < presentationData.slides.length - 1) ? currentSlide + 1 : 0;
            showSlide(currentSlide);
        });

    } catch (error) {
        console.error("Chyba při načítání prezentace:", error);
        container.innerHTML = `<p class="p-4 text-red-500">Nepodařilo se načíst prezentaci.</p>`;
    }
}

// public/js/student/presentation-handler.js

// Funkcia na získanie Tailwind tried pre daný štýl
function getPresentationStyles(styleId = 'default') {
    switch (styleId) {
        case 'modern':
            return {
                container: 'bg-white border border-blue-200 rounded-lg mb-4 shadow-sm p-5',
                title: 'font-semibold text-xl text-blue-800 mb-3',
                list: 'list-disc list-inside mt-2 text-base text-gray-700 space-y-1',
                listItem: '' // Môže byť prázdne, ak netreba špeciálny štýl
            };
        case 'vibrant':
            return {
                container: 'bg-orange-50 border-l-4 border-orange-500 rounded-r-lg mb-4 shadow p-5',
                title: 'font-bold text-2xl text-orange-700 mb-3 tracking-tight',
                list: 'list-none mt-3 text-base text-gray-800 space-y-1.5',
                listItem: 'pl-4 relative before:content-["‣"] before:absolute before:left-0 before:text-orange-500 before:font-bold' // Vlastná odrážka
            };
        case 'default':
        default:
            return {
                container: 'bg-white p-4 border border-slate-200 rounded-lg mb-4 shadow-sm',
                title: 'font-bold text-green-700', // Pôvodný štýl
                list: 'list-disc list-inside mt-2 text-sm text-slate-600', // Pôvodný štýl
                listItem: ''
            };
    }
}

// Hlavná funkcia na vykreslenie prezentácie, ktorú budeme exportovať
export function renderPresentation(containerElement, presentationData) {
    if (!containerElement) {
        console.error("Presentation container element not provided!");
        return;
    }

    if (presentationData && presentationData.slides && Array.isArray(presentationData.slides)) {
        const styleId = presentationData.styleId || 'default'; // Načítame ID štýlu
        const styles = getPresentationStyles(styleId); // Získame triedy pre daný štýl

        containerElement.innerHTML = presentationData.slides.map((slide, i) => `
            <div class="${styles.container}"> {/* Aplikujeme štýl kontajnera */}
                <h4 class="${styles.title}"> {/* Aplikujeme štýl nadpisu */}
                    Slide ${i + 1}: ${slide.title || 'Bez názvu'}
                </h4>
                <ul class="${styles.list}"> {/* Aplikujeme štýl zoznamu */}
                    {/* Zabezpečíme, že body sú pole a joinujeme ich */}
                    ${(Array.isArray(slide.points) ? slide.points : []).map(p => `<li class="${styles.listItem}">${p}</li>`).join('')} 
                </ul>
            </div>`).join('');
    } else {
        containerElement.innerHTML = `<p>Obsah prezentace není k dispozici nebo není ve správném formátu.</p>`;
    }
}

// public/js/student/presentation-handler.js

// Funkcia na získanie Tailwind tried pre daný štýl
function getPresentationStyles(styleId = 'default') {
    switch (styleId) {
        case 'modern':
            return {
                container: 'bg-white border border-blue-200 rounded-xl mb-4 shadow-sm p-6 relative overflow-hidden',
                slideCounter: 'absolute top-4 right-4 text-xs font-mono text-blue-400',
                title: 'text-3xl font-bold text-blue-900 mb-8 max-w-2xl leading-tight',
                list: 'text-left max-w-lg space-y-4 w-full',
                listItem: 'flex items-start gap-3 text-lg text-blue-800',
                bullet: 'text-blue-500 mt-1.5'
            };
        case 'vibrant':
            return {
                container: 'bg-orange-50 border-l-4 border-orange-500 rounded-r-xl mb-4 shadow-sm p-6 relative overflow-hidden',
                slideCounter: 'absolute top-4 right-4 text-xs font-mono text-orange-400',
                title: 'text-3xl font-bold text-orange-800 mb-8 max-w-2xl leading-tight tracking-tight',
                list: 'text-left max-w-lg space-y-4 w-full',
                listItem: 'flex items-start gap-3 text-lg text-orange-900',
                bullet: 'text-orange-500 mt-1.5 font-bold'
            };
        case 'default':
        default:
            return {
                container: 'bg-slate-50 border border-slate-200 rounded-2xl mb-6 relative overflow-hidden p-8 flex-grow flex flex-col justify-center items-center text-center',
                slideCounter: 'absolute top-4 right-4 text-xs font-mono text-slate-400',
                title: 'text-3xl font-bold text-slate-900 mb-8 max-w-2xl leading-tight',
                list: 'text-left max-w-lg space-y-4 w-full',
                listItem: 'flex items-start gap-3 text-lg text-slate-600',
                bullet: 'text-indigo-500 mt-1.5'
            };
    }
}

// Hlavná funkcia na vykreslenie prezentácie
export function renderPresentation(containerElement, presentationData) {
    if (!containerElement) {
        console.error("Presentation container element not provided!");
        return;
    }

    if (presentationData && presentationData.slides && Array.isArray(presentationData.slides)) {
        const styleId = presentationData.styleId || 'default';
        const styles = getPresentationStyles(styleId);

        // Simple carousel UI
        const slides = presentationData.slides;
        let currentSlide = 0;

        const renderSlide = (index) => {
            const slide = slides[index];
            const isFirst = index === 0;
            const isLast = index === slides.length - 1;

            const content = `
                <div class="relative min-h-[400px] flex flex-col">
                    <div class="${styles.container}">

                        <div class="${styles.slideCounter}">
                            ${index + 1} / ${slides.length}
                        </div>

                        <h3 class="${styles.title}">
                            ${slide.title || 'Bez názvu'}
                        </h3>

                        <ul class="${styles.list}">
                             ${(Array.isArray(slide.points) ? slide.points : []).map(p => `
                                <li class="${styles.listItem}">
                                    <span class="${styles.bullet}">•</span>
                                    <span>${p}</span>
                                </li>
                             `).join('')}
                        </ul>
                    </div>

                    <div class="flex items-center justify-between px-4">
                        <button id="prev-slide-btn" class="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all" ${isFirst ? 'disabled' : ''}>
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                            Předchozí
                        </button>

                        <div class="flex gap-1.5">
                            ${slides.map((_, i) => `
                                <div class="w-2 h-2 rounded-full transition-all ${i === index ? 'bg-indigo-600 w-6' : 'bg-slate-300'}"></div>
                            `).join('')}
                        </div>

                        <button id="next-slide-btn" class="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all" ${isLast ? 'disabled' : ''}>
                            Další
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                        </button>
                    </div>
                </div>
            `;

            containerElement.innerHTML = content;

            const prevBtn = containerElement.querySelector('#prev-slide-btn');
            const nextBtn = containerElement.querySelector('#next-slide-btn');

            if (prevBtn) prevBtn.onclick = () => {
                if (currentSlide > 0) {
                    currentSlide--;
                    renderSlide(currentSlide);
                }
            };

            if (nextBtn) nextBtn.onclick = () => {
                if (currentSlide < slides.length - 1) {
                    currentSlide++;
                    renderSlide(currentSlide);
                }
            };
        };

        renderSlide(currentSlide);

    } else {
        containerElement.innerHTML = `<div class="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-500">Prezentace je prázdná</div>`;
    }
}

export function renderPresentation(presentationData, container) {
    if (!presentationData || !Array.isArray(presentationData.slides) || presentationData.slides.length === 0) {
        container.innerHTML = `<p class="text-center text-slate-500 p-8">Pro tuto lekci není k dispozici žádná prezentace.</p>`; return;
    }
    let currentSlide = 0;
    const render = () => {
        const slide = presentationData.slides[currentSlide];
        container.innerHTML = `<h2 class="text-2xl md:text-3xl font-extrabold text-slate-800 mb-6 text-center">Prezentace</h2><div class="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden max-w-4xl mx-auto"><div class="bg-slate-700 text-white p-4 text-center"><h3 class="text-xl md:text-2xl font-bold">${slide.title}</h3></div><div class="p-4 md:p-8"><ul class="list-disc list-inside space-y-4 text-base md:text-xl">${(slide.points || []).map(p => `<li>${p}</li>`).join('')}</ul></div><div class="p-4 bg-slate-100 border-t flex justify-between items-center"><button id="prev-slide-btn" class="px-4 py-2 bg-slate-300 rounded-lg font-semibold hover:bg-slate-400 disabled:opacity-50 disabled:cursor-not-allowed">Předchozí</button><span>${currentSlide + 1} / ${presentationData.slides.length}</span><button id="next-slide-btn" class="px-4 py-2 bg-slate-300 rounded-lg font-semibold hover:bg-slate-400 disabled:opacity-50 disabled:cursor-not-allowed">Další</button></div></div>`;
        const prevBtn = document.getElementById('prev-slide-btn');
        const nextBtn = document.getElementById('next-slide-btn');
        prevBtn.disabled = currentSlide === 0;
        nextBtn.disabled = currentSlide === presentationData.slides.length - 1;
        prevBtn.addEventListener('click', () => { if (currentSlide > 0) { currentSlide--; render(); } });
        nextBtn.addEventListener('click', () => { if (currentSlide < presentationData.slides.length - 1) { currentSlide++; render(); } });
    };
    render();
}
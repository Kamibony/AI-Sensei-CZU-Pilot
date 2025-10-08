import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
import { db } from './firebase-init.js';

let lessonsData = [];

async function fetchLessons() {
    try {
        const lessonsCollection = collection(db, 'lessons');
        const querySnapshot = await getDocs(lessonsCollection);
        lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return true;
    } catch (error) {
        console.error("Error fetching lessons:", error);
        showToast("Nepodařilo se načíst data lekcí.", true);
        return false;
    }
}

function renderStudentDashboard(container) {
    let lessonsContent;
    if (lessonsData.length === 0) {
        lessonsContent = `<div class="p-8 text-center text-slate-500">Pro vás zatím nebyly připraveny žádné lekce.</div>`;
    } else {
        const sortedLessons = [...lessonsData].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        const lessonsHtml = sortedLessons.map(lesson => `
            <div class="bg-white rounded-2xl shadow-lg overflow-hidden mb-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer student-lesson-card" data-lesson-id="${lesson.id}">
                <div class="p-6">
                    <div class="flex items-start justify-between">
                        <div>
                            <p class="text-sm font-semibold text-green-600">${lesson.number || ' '}</p>
                            <h2 class="text-2xl font-bold text-slate-800 mt-1">${lesson.title}</h2>
                            <p class="text-slate-500">${lesson.subtitle}</p>
                        </div>
                        <span class="text-4xl">${lesson.icon}</span>
                    </div>
                </div>
            </div>`).join('');
        lessonsContent = `
            <h2 class="text-2xl font-bold text-slate-800 mb-4">Dostupné lekce</h2>
            ${lessonsHtml}
        `;
    }

    container.innerHTML = `
        <h1 class="text-3xl font-extrabold text-slate-800 mb-6">Váš přehled</h1>
        ${lessonsContent}
    `;
}


export async function initStudentDashboard() {
    const lessonsLoaded = await fetchLessons();
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    if (!lessonsLoaded) {
        roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Chyba při načítání dat.</div>`;
        return;
    }

    roleContentWrapper.innerHTML = `<div id="student-content-area" class="flex-grow p-4 sm:p-6 md:p-8 overflow-y-auto bg-slate-50"></div>`;
    const studentContentArea = document.getElementById('student-content-area');

    renderStudentDashboard(studentContentArea);

    studentContentArea.addEventListener('click', (e) => {
        const lessonCard = e.target.closest('.student-lesson-card');
        if (lessonCard) {
            const lessonId = lessonCard.dataset.lessonId;
            const lesson = lessonsData.find(l => l.id === lessonId);
            if (lesson) {
                showStudentLesson(lesson);
            }
        }
    });
}

function showStudentLesson(lessonData) {
    const studentContentArea = document.getElementById('student-content-area');
    studentContentArea.innerHTML = `
        <div class="p-4 sm:p-6 md:p-8">
            <button id="back-to-overview-btn" class="mb-6 text-green-700 font-semibold hover:underline">&larr; Zpět na přehled</button>
            <header class="mb-8">
                <span class="text-5xl">${lessonData.icon}</span>
                <h1 class="text-4xl font-extrabold text-slate-800 mt-2">${lessonData.title}</h1>
                <p class="text-xl text-slate-500">${lessonData.subtitle}</p>
            </header>
            
            <div id="lesson-video-content" class="mb-8"></div>
            <div id="lesson-text-content" class="prose max-w-none lg:prose-lg mb-8"></div>
            <div id="lesson-presentation-content" class="mb-8"></div>
            <div id="lesson-quiz-content" class="mb-8"></div>
            <div id="lesson-test-content" class="mb-8"></div>
            <div id="lesson-post-content" class="mb-8"></div>
        </div>
    `;

    // Render all available content types
    if (lessonData.videoUrl) {
        renderVideo(lessonData.videoUrl, document.getElementById('lesson-video-content'));
    }
    if (lessonData.content) {
        document.getElementById('lesson-text-content').innerHTML = lessonData.content;
    }
    if (lessonData.presentationData) {
        renderPresentation(lessonData.presentationData, document.getElementById('lesson-presentation-content'));
    }
    if (lessonData.quizData) {
        renderQuiz(lessonData.quizData, document.getElementById('lesson-quiz-content'));
    }
    if (lessonData.testData) {
        renderTest(lessonData.testData, document.getElementById('lesson-test-content'));
    }
    if (lessonData.postData) {
        renderPodcast(lessonData.postData, document.getElementById('lesson-post-content'));
    }

    document.getElementById('back-to-overview-btn').addEventListener('click', () => {
        const studentContentArea = document.getElementById('student-content-area');
        renderStudentDashboard(studentContentArea);
    });
}

function renderVideo(videoUrl, container) {
    const videoId = videoUrl.split('v=')[1]?.split('&')[0];
    if (videoId) {
        container.innerHTML = `
            <h2 class="text-3xl font-extrabold text-slate-800 mb-6 text-center">Video k lekci</h2>
            <div class="rounded-xl overflow-hidden aspect-video mx-auto max-w-4xl shadow-lg">
                <iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen class="w-full h-full"></iframe>
            </div>`;
    }
}

function renderPresentation(presentationData, container) {
    if (!presentationData || !presentationData.slides || presentationData.slides.length === 0) return;
    let currentSlide = 0;
    const render = () => {
        const slide = presentationData.slides[currentSlide];
        container.innerHTML = `
            <h2 class="text-3xl font-extrabold text-slate-800 mb-6 text-center">Prezentace</h2>
            <div class="bg-white rounded-2xl shadow-lg overflow-hidden max-w-4xl mx-auto">
                <div class="bg-slate-700 text-white p-4 text-center"><h3 class="text-2xl font-bold">${slide.title}</h3></div>
                <div class="p-8"><ul class="list-disc list-inside space-y-4 text-xl">${slide.points.map(p => `<li>${p}</li>`).join('')}</ul></div>
                <div class="p-4 bg-slate-100 border-t flex justify-between items-center">
                    <button id="prev-slide-btn" class="px-4 py-2 bg-slate-300 rounded-lg font-semibold hover:bg-slate-400 disabled:opacity-50 disabled:cursor-not-allowed">Předchozí</button>
                    <span>${currentSlide + 1} / ${presentationData.slides.length}</span>
                    <button id="next-slide-btn" class="px-4 py-2 bg-slate-300 rounded-lg font-semibold hover:bg-slate-400 disabled:opacity-50 disabled:cursor-not-allowed">Další</button>
                </div>
            </div>`;

        const prevBtn = document.getElementById('prev-slide-btn');
        const nextBtn = document.getElementById('next-slide-btn');
        prevBtn.disabled = currentSlide === 0;
        nextBtn.disabled = currentSlide === presentationData.slides.length - 1;

        prevBtn.addEventListener('click', () => { if (currentSlide > 0) { currentSlide--; render(); } });
        nextBtn.addEventListener('click', () => { if (currentSlide < presentationData.slides.length - 1) { currentSlide++; render(); } });
    };
    render();
}

function renderQuiz(quizData, container) {
    if (!quizData || !quizData.questions || quizData.questions.length === 0) return;
    const questionsHtml = quizData.questions.map((q, index) => {
        const optionsHtml = q.options.map((option, i) => `
            <label class="block p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input type="radio" name="question-${index}" value="${i}" class="mr-3"><span>${option}</span>
            </label>`).join('');
        return `<div class="bg-white p-6 rounded-lg shadow-md mb-6" data-q-index="${index}">
                    <p class="font-semibold text-lg mb-4">${index + 1}. ${q.question_text}</p>
                    <div class="space-y-3">${optionsHtml}</div>
                    <div class="mt-4 p-3 rounded-lg text-sm hidden result-feedback"></div>
                </div>`;
    }).join('');
    container.innerHTML = `
        <h2 class="text-3xl font-extrabold text-slate-800 mb-6 text-center">Interaktivní Kvíz</h2>
        <form id="quiz-form">${questionsHtml}</form>
        <div class="text-center mt-6"><button id="check-quiz-btn" class="bg-green-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-green-700">Vyhodnotit</button></div>
        <div id="quiz-summary" class="hidden mt-8 text-center font-bold text-xl p-4 rounded-lg"></div>`;

    document.getElementById('check-quiz-btn').addEventListener('click', () => {
        let score = 0;
        quizData.questions.forEach((q, index) => {
            const qEl = container.querySelector(`[data-q-index="${index}"]`);
            const feedbackEl = qEl.querySelector('.result-feedback');
            const selected = qEl.querySelector(`input:checked`);
            feedbackEl.classList.remove('hidden', 'bg-green-100', 'text-green-700', 'bg-red-100', 'text-red-700');
            if (selected) {
                if (parseInt(selected.value) === q.correct_option_index) {
                    score++;
                    feedbackEl.textContent = 'Správně!';
                    feedbackEl.classList.add('bg-green-100', 'text-green-700');
                } else {
                    feedbackEl.textContent = `Špatně. Správná odpověď: ${q.options[q.correct_option_index]}`;
                    feedbackEl.classList.add('bg-red-100', 'text-red-700');
                }
            } else {
                feedbackEl.textContent = 'Nevybrali jste odpověď.';
                feedbackEl.classList.add('bg-yellow-100', 'text-yellow-800');
            }
        });
        const summaryEl = document.getElementById('quiz-summary');
        summaryEl.textContent = `Vaše skóre: ${score} z ${quizData.questions.length}`;
        summaryEl.classList.remove('hidden');
    });
}

function renderTest(testData, container) {
    if (!testData || !testData.questions || testData.questions.length === 0) return;
    const questionsHtml = testData.questions.map((q, index) => {
        const optionsHtml = q.options.map((option, i) => `
            <label class="block p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input type="radio" name="test-question-${index}" value="${i}" class="mr-3"><span>${option}</span>
            </label>`).join('');
        return `<div class="bg-white p-6 rounded-lg shadow-md mb-6" data-q-index="${index}">
                    <p class="font-semibold text-lg mb-4">${index + 1}. ${q.question_text}</p>
                    <div class="space-y-3">${optionsHtml}</div>
                    <div class="mt-4 p-3 rounded-lg text-sm hidden result-feedback"></div>
                </div>`;
    }).join('');
    container.innerHTML = `
        <h2 class="text-3xl font-extrabold text-slate-800 mb-6 text-center">Test</h2>
        <form id="test-form">${questionsHtml}</form>
        <div class="text-center mt-6"><button id="check-test-btn" class="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700">Vyhodnotit Test</button></div>
        <div id="test-summary" class="hidden mt-8 text-center font-bold text-xl p-4 rounded-lg"></div>`;

    document.getElementById('check-test-btn').addEventListener('click', () => {
        let score = 0;
        testData.questions.forEach((q, index) => {
            const qEl = container.querySelector(`[data-q-index="${index}"]`);
            const feedbackEl = qEl.querySelector('.result-feedback');
            const selected = qEl.querySelector(`input:checked`);
            feedbackEl.classList.remove('hidden', 'bg-green-100', 'text-green-700', 'bg-red-100', 'text-red-700');
            if (selected) {
                if (parseInt(selected.value) === q.correct_option_index) {
                    score++;
                    feedbackEl.textContent = 'Správně!';
                    feedbackEl.classList.add('bg-green-100', 'text-green-700');
                } else {
                    feedbackEl.textContent = `Špatně. Správná odpověď: ${q.options[q.correct_option_index]}`;
                    feedbackEl.classList.add('bg-red-100', 'text-red-700');
                }
            } else {
                feedbackEl.textContent = 'Nevybrali jste odpověď.';
                 feedbackEl.classList.add('bg-yellow-100', 'text-yellow-800');
            }
        });
        const summaryEl = document.getElementById('test-summary');
        summaryEl.textContent = `Vaše skóre: ${score} z ${testData.questions.length}`;
        summaryEl.classList.remove('hidden');
    });
}

function renderPodcast(postData, container) {
    if (!postData || !postData.episodes || postData.episodes.length === 0) return;
    const episodesHtml = postData.episodes.map((episode, i) => `
        <div class="bg-white p-6 rounded-lg shadow-md mb-6">
            <h4 class="font-bold text-xl text-slate-800">${i + 1}. ${episode.title}</h4>
            <div class="mt-4 text-slate-600 prose">
                ${episode.script.replace(/\n/g, '<br>')}
            </div>
        </div>
    `).join('');
    container.innerHTML = `
        <h2 class="text-3xl font-extrabold text-slate-800 mb-6 text-center">Podcast & Materiály</h2>
        ${episodesHtml}
    `;
}

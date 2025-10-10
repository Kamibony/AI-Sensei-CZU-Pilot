import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
import { db, auth } from './firebase-init.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from './firebase-init.js';

let lessonsData = [];
// Používame jednotný názov funkcie pre AI asistenta
const getLessonAssistantResponse = httpsCallable(functions, 'getLessonAssistantResponse');

async function fetchLessons() {
    try {
        const lessonsCollection = collection(db, 'lessons');
        // V budúcnosti tu môžeme pridať filtrovanie len pre 'active' lekcie
        const querySnapshot = await getDocs(lessonsCollection);
        lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return true;
    } catch (error) {
        console.error("Error fetching lessons:", error);
        showToast("Nepodařilo se načíst data lekcí.", true);
        return false;
    }
}

async function setupStudentNav() {
    const nav = document.getElementById('main-nav');
    const user = auth.currentUser;
    if (!nav || !user) return;

    try {
        // Správne sa odkazujeme na kolekciu 'students', kde je token
        const studentDoc = await getDoc(doc(db, "students", user.uid));
        if (studentDoc.exists()) {
            const studentData = studentDoc.data();
            const token = studentData.telegramConnectionToken;
            const botUsername = 'ai_sensei_czu_bot';

            let telegramHtml = '';
            // Ikonka sa zobrazí, len ak existuje token a účet ešte nie je prepojený
            if (token && !studentData.telegramChatId) {
                const connectionLink = `https://t.me/${botUsername}?start=${token}`;
                telegramHtml = `
                    <li>
                        <a href="${connectionLink}" target="_blank" rel="noopener noreferrer" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white" title="Propojit s Telegramem">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-send"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        </a>
                    </li>
                `;
            }

            nav.innerHTML = `
                <li>
                    <button class="nav-item p-3 rounded-lg flex items-center justify-center text-white bg-green-700" title="Moje studium">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                    </button>
                </li>
                ${telegramHtml}
            `;
        }
    } catch (error) {
        console.error("Error setting up student nav:", error);
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
    await setupStudentNav(); 
    const lessonsLoaded = await fetchLessons();
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    if (!lessonsLoaded) {
        roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Chyba při načítání dat.</div>`;
        return;
    }

    roleContentWrapper.innerHTML = `<div id="student-content-area" class="flex-grow p-4 sm:p-6 md:p-8 overflow-y-auto bg-slate-50 h-screen"></div>`;
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
    
    const menuItems = [];
    if (lessonData.content) menuItems.push({ id: 'text', label: 'Text lekce', icon: '✍️' });
    if (lessonData.presentationData) menuItems.push({ id: 'presentation', label: 'Prezentace', icon: '🖼️' });
    if (lessonData.videoUrl) menuItems.push({ id: 'video', label: 'Video', icon: '▶️' });
    if (lessonData.quizData) menuItems.push({ id: 'quiz', label: 'Kvíz', icon: '❓' });
    if (lessonData.testData) menuItems.push({ id: 'test', label: 'Test', icon: '✅' });
    if (lessonData.postData) menuItems.push({ id: 'post', label: 'Podcast & Materiály', icon: '🎙️' });
    menuItems.push({ id: 'assistant', label: 'AI Asistent', icon: '🤖' });

    const menuHtml = menuItems.map(item => `
        <a href="#" data-view="${item.id}" class="lesson-menu-item flex items-center p-3 text-sm font-medium rounded-md hover:bg-slate-100 transition-colors">
            ${item.icon}<span class="ml-3">${item.label}</span>
        </a>
    `).join('');

    studentContentArea.innerHTML = `
        <div>
            <button id="back-to-overview-btn" class="mb-6 text-green-700 font-semibold hover:underline">&larr; Zpět na přehled</button>
            <header class="mb-8 text-center">
                <span class="text-5xl">${lessonData.icon}</span>
                <h1 class="text-4xl font-extrabold text-slate-800 mt-2">${lessonData.title}</h1>
                <p class="text-xl text-slate-500">${lessonData.subtitle}</p>
            </header>
            
            <div class="flex flex-col md:flex-row gap-8">
                <aside class="w-full md:w-64 flex-shrink-0">
                    <div class="p-4 bg-white rounded-2xl shadow-lg">
                         <h3 class="font-bold text-slate-800 mb-2 px-2">Obsah lekce</h3>
                         <nav class="flex flex-col space-y-1">${menuHtml}</nav>
                    </div>
                </aside>
                <main id="lesson-content-display" class="flex-grow bg-white rounded-2xl shadow-lg p-6 md:p-8 min-h-[400px]"></main>
            </div>
        </div>
    `;

    document.getElementById('back-to-overview-btn').addEventListener('click', () => {
        initStudentDashboard();
    });

    const contentDisplay = document.getElementById('lesson-content-display');

    studentContentArea.querySelectorAll('.lesson-menu-item').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            studentContentArea.querySelectorAll('.lesson-menu-item').forEach(i => i.classList.remove('bg-green-100', 'text-green-800', 'font-semibold'));
            item.classList.add('bg-green-100', 'text-green-800', 'font-semibold');
            
            const viewId = item.dataset.view;
            renderLessonContent(viewId, lessonData, contentDisplay);
        });
    });

    if (menuItems.length > 0) {
        studentContentArea.querySelector('.lesson-menu-item').click();
    } else {
        contentDisplay.innerHTML = `<p class="text-center text-slate-500 p-8">Pro tuto lekci zatím není k dispozici žádný obsah.</p>`;
    }
}

function renderLessonContent(viewId, lessonData, container) {
    switch(viewId) {
        case 'text':
            container.innerHTML = `<div class="prose max-w-none lg:prose-lg">${lessonData.content || ''}</div>`;
            break;
        case 'presentation':
            renderPresentation(lessonData.presentationData, container);
            break;
        case 'video':
            renderVideo(lessonData.videoUrl, container);
            break;
        case 'quiz':
            renderQuiz(lessonData.quizData, container);
            break;
        case 'test':
            renderTest(lessonData.testData, container);
            break;
        case 'post':
            renderPodcast(lessonData.postData, container);
            break;
        case 'assistant':
            renderAIAssistantChat(lessonData, container);
            break;
        default:
            container.innerHTML = `<p>Obsah se připravuje.</p>`;
    }
}

function renderAIAssistantChat(lessonData, container) {
    container.innerHTML = `
        <h2 class="text-3xl font-extrabold text-slate-800 mb-6 text-center">AI Asistent Lekce</h2>
        <div class="w-full max-w-md mx-auto bg-slate-900 rounded-[40px] border-[14px] border-slate-900 shadow-2xl relative">
            <div class="w-full h-full bg-blue-100 bg-[url('https://i.pinimg.com/736x/8c/98/99/8c98994518b575bfd8c949e91d20548b.jpg')] bg-center bg-cover rounded-[26px]">
                <div class="h-[600px] flex flex-col p-4">
                    <div id="student-chat-history" class="flex-grow space-y-4 overflow-y-auto p-2">
                        <div class="flex justify-start"><div class="bg-white p-3 rounded-r-xl rounded-t-xl max-w-xs text-sm">Ahoj! Zeptej se mě na cokoliv ohledně této lekce.</div></div>
                    </div>
                    <footer class="mt-4 flex-shrink-0">
                        <div class="flex items-center bg-white rounded-full p-2 shadow-inner">
                            <textarea id="student-chat-input" class="flex-grow bg-transparent p-2 text-sm focus:outline-none resize-none" rows="1" placeholder="Napište zprávu..."></textarea>
                            <button id="student-send-btn" class="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 hover:bg-blue-600 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                            </button>
                        </div>
                    </footer>
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
            // Používame správny názov funkcie
            const result = await getLessonAssistantResponse({ lessonId: lessonData.id, userQuestion });
            thinkingBubble.querySelector('div').innerHTML = result.data.answer.replace(/\n/g, '<br>');
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
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = (input.scrollHeight) + 'px';
    });
}

function renderVideo(videoUrl, container) {
    const videoIdMatch = videoUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;

    if (videoId) {
        container.innerHTML = `
            <h2 class="text-3xl font-extrabold text-slate-800 mb-6 text-center">Video k lekci</h2>
            <div class="rounded-xl overflow-hidden aspect-video mx-auto max-w-4xl shadow-lg">
                <iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen class="w-full h-full"></iframe>
            </div>`;
    } else {
        container.innerHTML = `<p class="text-red-500 text-center font-semibold p-8">Vložená URL adresa videa (${videoUrl}) není platná.</p>`;
    }
}

function renderPresentation(presentationData, container) {
    if (!presentationData || !Array.isArray(presentationData.slides) || presentationData.slides.length === 0) return;
    let currentSlide = 0;
    const render = () => {
        const slide = presentationData.slides[currentSlide];
        container.innerHTML = `
            <h2 class="text-3xl font-extrabold text-slate-800 mb-6 text-center">Prezentace</h2>
            <div class="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden max-w-4xl mx-auto">
                <div class="bg-slate-700 text-white p-4 text-center"><h3 class="text-2xl font-bold">${slide.title}</h3></div>
                <div class="p-8"><ul class="list-disc list-inside space-y-4 text-xl">${(slide.points || []).map(p => `<li>${p}</li>`).join('')}</ul></div>
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
    if (!quizData || !Array.isArray(quizData.questions) || quizData.questions.length === 0) return;
    const questionsHtml = quizData.questions.map((q, index) => {
        const optionsHtml = (q.options || []).map((option, i) => `
            <label class="block p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input type="radio" name="question-${index}" value="${i}" class="mr-3"><span>${option}</span>
            </label>`).join('');
        return `<div class="bg-slate-50 p-6 rounded-lg border border-slate-200 mb-6" data-q-index="${index}">
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
            const qEl = container.querySelector(\`[data-q-index="${index}"]\`);
            const feedbackEl = qEl.querySelector('.result-feedback');
            const selected = qEl.querySelector('input:checked');
            feedbackEl.classList.remove('hidden');
            if (selected) {
                if (parseInt(selected.value) === q.correct_option_index) {
                    score++;
                    feedbackEl.textContent = 'Správně!';
                    feedbackEl.className = 'mt-4 p-3 rounded-lg text-sm bg-green-100 text-green-700';
                } else {
                    feedbackEl.textContent = \`Špatně. Správná odpověď: \${q.options[q.correct_option_index]}\`;
                    feedbackEl.className = 'mt-4 p-3 rounded-lg text-sm bg-red-100 text-red-700';
                }
            } else {
                feedbackEl.textContent = 'Nevybrali jste odpověď.';
                feedbackEl.className = 'mt-4 p-3 rounded-lg text-sm bg-yellow-100 text-yellow-800';
            }
        });
        const summaryEl = document.getElementById('quiz-summary');
        summaryEl.textContent = \`Vaše skóre: \${score} z \${quizData.questions.length}\`;
        summaryEl.classList.remove('hidden');
    });
}

function renderTest(testData, container) {
    if (!testData || !Array.isArray(testData.questions) || testData.questions.length === 0) return;
    const questionsHtml = testData.questions.map((q, index) => {
        const optionsHtml = (q.options || []).map((option, i) => `
            <label class="block p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input type="radio" name="test-question-${index}" value="${i}" class="mr-3"><span>${option}</span>
            </label>`).join('');
        return `<div class="bg-slate-50 p-6 rounded-lg border border-slate-200 mb-6" data-q-index="${index}">
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
            const qEl = container.querySelector(\`[data-q-index="${index}"]\`);
            const feedbackEl = qEl.querySelector('.result-feedback');
            const selected = qEl.querySelector('input:checked');
            feedbackEl.classList.remove('hidden');
            if (selected) {
                if (parseInt(selected.value) === q.correct_option_index) {
                    score++;
                    feedbackEl.textContent = 'Správně!';
                    feedbackEl.className = 'mt-4 p-3 rounded-lg text-sm bg-green-100 text-green-700';
                } else {
                    feedbackEl.textContent = \`Špatně. Správná odpověď: \${q.options[q.correct_option_index]}\`;
                    feedbackEl.className = 'mt-4 p-3 rounded-lg text-sm bg-red-100 text-red-700';
                }
            } else {
                feedbackEl.textContent = 'Nevybrali jste odpověď.';
                feedbackEl.className = 'mt-4 p-3 rounded-lg text-sm bg-yellow-100 text-yellow-800';
            }
        });
        const summaryEl = document.getElementById('test-summary');
        summaryEl.textContent = \`Vaše skóre: \${score} z \${testData.questions.length}\`;
        summaryEl.classList.remove('hidden');
    });
}

function renderPodcast(postData, container) {
    if (!postData || !Array.isArray(postData.episodes) || postData.episodes.length === 0) return;
    const episodesHtml = postData.episodes.map((episode, i) => `
        <div class="bg-slate-50 p-6 rounded-lg border border-slate-200 mb-6">
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

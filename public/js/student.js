import { collection, getDocs, doc, getDoc, query, where, updateDoc, orderBy, onSnapshot, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
import { db, auth } from './firebase-init.js';
import { getAiAssistantResponse } from './gemini-api.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from './firebase-init.js';
import { handleLogout } from './auth.js';

let lessonsData = [];
let currentUserData = null; 
const sendMessageFromStudent = httpsCallable(functions, 'sendMessageFromStudent');

function promptForStudentName(userId) {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;
    roleContentWrapper.innerHTML = `
        <div class="flex items-center justify-center h-screen bg-slate-50">
            <div class="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md text-center">
                <h1 class="text-2xl font-bold text-slate-800 mb-4">Vítejte v AI Sensei!</h1>
                <p class="text-slate-600 mb-6">Prosím, zadejte své jméno, abychom věděli, jak vás oslovovat.</p>
                <input type="text" id="student-name-input" placeholder="Vaše jméno a příjmení" class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                <button id="save-name-btn" class="w-full mt-4 bg-green-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-800 transition-colors">Uložit a pokračovat</button>
            </div>
        </div>
    `;
    document.getElementById('save-name-btn').addEventListener('click', async () => {
        const nameInput = document.getElementById('student-name-input');
        const name = nameInput.value.trim();
        if (!name) {
            showToast('Jméno nemůže být prázdné.', true);
            return;
        }
        try {
            const studentRef = doc(db, 'students', userId);
            await updateDoc(studentRef, { name: name });
            showToast('Jméno úspěšně uloženo!');
            await initStudentDashboard();
        } catch (error) {
            console.error("Error saving student name:", error);
            showToast('Nepodařilo se uložit jméno.', true);
        }
    });
}

async function fetchLessons() {
    try {
        const timelineCollection = collection(db, 'timeline_events');
        const timelineQuery = query(timelineCollection, orderBy("orderIndex"));
        const timelineSnapshot = await getDocs(timelineQuery);
        const scheduledLessonIds = timelineSnapshot.docs.map(doc => doc.data().lessonId);
        const uniqueLessonIds = [...new Set(scheduledLessonIds)];

        if (uniqueLessonIds.length === 0) {
            lessonsData = [];
            return true;
        }

        const lessonsCollection = collection(db, 'lessons');
        const lessonsQuery = query(lessonsCollection, where("__name__", "in", uniqueLessonIds));
        const lessonsSnapshot = await getDocs(lessonsQuery);
        const lessonsMap = new Map(lessonsSnapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }]));
        lessonsData = uniqueLessonIds.map(id => lessonsMap.get(id)).filter(Boolean);

        return true;
    } catch (error) {
        console.error("Error fetching scheduled lessons for student:", error);
        showToast("Nepodařilo se načíst data lekcí.", true);
        return false;
    }
}

async function setupStudentNav() {
    const nav = document.getElementById('main-nav');
    if(nav) {
        nav.classList.add('hidden', 'md:flex');
        nav.innerHTML = `
            <div class="flex flex-col h-full">
                <div class="flex-grow space-y-4">
                    <li><button class="nav-item p-3 rounded-lg flex items-center justify-center text-white bg-green-700" title="Moje studium"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></button></li>
                </div>
                <div>
                    <li><button id="logout-btn-nav" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-red-700 hover:text-white" title="Odhlásit se"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg></button></li>
                </div>
            </div>`;
        document.getElementById('logout-btn-nav').addEventListener('click', handleLogout);
    }
    
    const mobileNav = document.getElementById('mobile-bottom-nav');
    if (mobileNav) {
        mobileNav.innerHTML = `
            <button class="flex flex-col items-center text-slate-500 p-2 mobile-nav-active">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                <span class="text-xs mt-1">Lekce</span>
            </button>
            <button id="mobile-logout-btn" class="flex flex-col items-center text-slate-500 p-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                <span class="text-xs mt-1">Odhlásit se</span>
            </button>
        `;
        document.getElementById('mobile-logout-btn').addEventListener('click', handleLogout);
    }
}

function renderStudentDashboard(container) {
    let lessonsContent;
    if (lessonsData.length === 0) {
        lessonsContent = `<div class="p-8 text-center text-slate-500">Profesor zatiaľ nenaplánoval žiadne lekcie.</div>`;
    } else {
        const lessonsHtml = lessonsData.map(lesson => `
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
        lessonsContent = `<h2 class="text-2xl font-bold text-slate-800 mb-4">Dostupné lekce</h2>${lessonsHtml}`;
    }
    
    container.innerHTML = `
        <div class="p-4 sm:p-6 md:p-8">
            <h1 class="text-3xl md:text-4xl font-extrabold text-slate-800 mb-6">Váš přehled</h1>
            ${lessonsContent}
        </div>
    `;
    
    container.querySelectorAll('.student-lesson-card').forEach(card => {
        card.addEventListener('click', () => {
            const lessonId = card.dataset.lessonId;
            const lesson = lessonsData.find(l => l.id === lessonId);
            if (lesson) {
                updateDoc(doc(db, 'students', auth.currentUser.uid), { lastActiveLessonId: lessonId });
                showStudentLesson(lesson);
            }
        });
    });
}

function renderTelegramPage(container, userData) {
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

export async function initStudentDashboard() {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;
    const user = auth.currentUser;
    if (!user) {
        roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Chyba: Uživatel není přihlášen.</div>`;
        return;
    }
    try {
        const userDoc = await getDoc(doc(db, "students", user.uid));
        if (userDoc.exists()) {
            currentUserData = userDoc.data();
            if (!currentUserData.name) {
                promptForStudentName(user.uid);
                return;
            }
            await setupStudentNav();
            await fetchLessons();
            
            roleContentWrapper.innerHTML = `<div id="student-content-area" class="flex-grow overflow-y-auto bg-slate-50 h-full"></div>`;
            const studentContentArea = document.getElementById('student-content-area');
            renderStudentDashboard(studentContentArea);

        } else {
            roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Nepodařilo se najít váš studentský profil.</div>`;
        }
    } catch (error) {
        console.error("Error initializing student dashboard:", error);
        roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Vyskytla se kritická chyba při načítání vašeho profilu.</div>`;
    }
}

function showStudentLesson(lessonData) {
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }

    const studentContentArea = document.getElementById('student-content-area');
    const menuItems = [
        { id: 'text', label: 'Text', icon: '✍️', available: !!lessonData.content },
        { id: 'presentation', label: 'Prezentace', icon: '🖼️', available: !!lessonData.presentationData },
        { id: 'video', label: 'Video', icon: '▶️', available: !!lessonData.videoUrl },
        { id: 'quiz', label: 'Kvíz', icon: '❓', available: !!lessonData.quizData },
        { id: 'test', label: 'Test', icon: '✅', available: !!lessonData.testData },
        { id: 'post', label: 'Podcast', icon: '🎙️', available: !!lessonData.postData },
        { id: 'assistant', label: 'AI Asistent', icon: '🤖', available: true },
        { id: 'consultation', label: 'Konzultace', icon: '💬', available: true },
        { id: 'telegram', label: 'Telegram', icon: '✈️', available: true }
    ];
    const availableMenuItems = menuItems.filter(item => item.available);
    
    const menuHtml = availableMenuItems.map(item => `
        <a href="#" data-view="${item.id}" class="lesson-menu-item p-3 text-sm font-medium border-b-2 border-transparent text-slate-500 md:flex-1 md:text-center">
            ${item.label}
        </a>`).join('');

    studentContentArea.innerHTML = `
        <div class="p-4 sm:p-6 md:p-8">
            <button id="back-to-overview-btn" class="mb-6 text-green-700 font-semibold hover:underline">&larr; Zpět na přehled</button>
            <header class="mb-6 text-center">
                <span class="text-5xl">${lessonData.icon}</span>
                <h1 class="text-3xl md:text-4xl font-extrabold text-slate-800 mt-2">${lessonData.title}</h1>
                <p class="text-lg md:text-xl text-slate-500">${lessonData.subtitle}</p>
            </header>
            
            <div class="border-b border-slate-200 mb-6">
                <nav class="md:flex md:-mb-px scrollable-tabs" id="lesson-tabs-menu">
                    ${menuHtml}
                </nav>
            </div>

            <main id="lesson-content-display" class="bg-white rounded-2xl shadow-lg p-4 sm:p-6 md:p-8 min-h-[400px]"></main>
        </div>
    `;
    document.getElementById('back-to-overview-btn').addEventListener('click', () => {
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        initStudentDashboard();
    });
    const contentDisplay = document.getElementById('lesson-content-display');
    const tabsMenu = document.getElementById('lesson-tabs-menu');

    tabsMenu.querySelectorAll('.lesson-menu-item').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
            }
            tabsMenu.querySelectorAll('.lesson-menu-item').forEach(i => {
                i.classList.remove('border-green-700', 'text-green-700', 'font-semibold');
                i.classList.add('border-transparent', 'text-slate-500');
            });
            item.classList.add('border-green-700', 'text-green-700', 'font-semibold');
            item.classList.remove('border-transparent', 'text-slate-500');
            renderLessonContent(item.dataset.view, lessonData, contentDisplay);
        });
    });

    if (availableMenuItems.length > 0) {
        tabsMenu.querySelector('.lesson-menu-item').click();
    } else {
        contentDisplay.innerHTML = `<p class="text-center text-slate-500 p-8">Pro tuto lekci zatím není k dispozici žádný obsah.</p>`;
    }
}

function renderLessonContent(viewId, lessonData, container) {
    switch(viewId) {
        case 'text': container.innerHTML = `<div class="prose max-w-none lg:prose-lg">${lessonData.content || ''}</div>`; break;
        case 'presentation': renderPresentation(lessonData.presentationData, container); break;
        case 'video': renderVideo(lessonData.videoUrl, container); break;
        case 'quiz': renderQuiz(lessonData.quizData, container); break;
        case 'test': renderTest(lessonData.testData, container); break;
        case 'post': renderPodcast(lessonData.postData, container); break;
        case 'assistant': renderAIAssistantChat(lessonData, container); break;
        case 'consultation': renderProfessorChat(lessonData, container); break;
        case 'telegram': renderTelegramPage(container, currentUserData); break;
        default: container.innerHTML = `<p>Obsah se připravuje.</p>`;
    }
}

function renderAIAssistantChat(lessonData, container) {
    container.innerHTML = `
        <h2 class="text-2xl md:text-3xl font-extrabold text-slate-800 mb-6 text-center">AI Asistent Lekce</h2>
        <div class="w-full max-w-md mx-auto bg-slate-900 rounded-[40px] border-[14px] border-slate-900 shadow-2xl relative">
            <div class="w-full h-full bg-blue-100 bg-[url('https://i.pinimg.com/736x/8c/98/99/8c98994518b575bfd8c/949e91d20548b.jpg')] bg-center bg-cover rounded-[26px]">
                <div class="h-[600px] flex flex-col p-4">
                    <div id="student-chat-history" class="flex-grow space-y-4 overflow-y-auto p-2"><div class="flex justify-start"><div class="bg-white p-3 rounded-r-xl rounded-t-xl max-w-xs text-sm">Ahoj! Zeptej se mě na cokoliv ohledně této lekce.</div></div></div>
                    <footer class="mt-4 flex-shrink-0"><div class="flex items-center bg-white rounded-full p-2 shadow-inner"><textarea id="student-chat-input" class="flex-grow bg-transparent p-2 text-sm focus:outline-none resize-none" rows="1" placeholder="Napište zprávu..."></textarea><button id="student-send-btn" class="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 hover:bg-blue-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button></div></footer>
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
            const dataToSend = { 
                lessonId: lessonData.id, 
                userQuestion: userQuestion 
            };
            const result = await getAiAssistantResponse(dataToSend);
            if (result.error) throw new Error(result.error);
            thinkingBubble.querySelector('div').innerHTML = result.answer.replace(/\n/g, '<br>');
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
}
function renderProfessorChat(lessonData, container) {
    container.innerHTML = `
        <h2 class="text-2xl md:text-3xl font-extrabold text-slate-800 mb-6 text-center">Konzultace k lekci</h2>
        <div class="w-full max-w-md mx-auto bg-slate-900 rounded-[40px] border-[14px] border-slate-900 shadow-2xl relative">
            <div class="w-full h-full bg-blue-100 bg-[url('https://i.pinimg.com/736x/8c/98/99/8c98994518b575bfd8c/949e91d20548b.jpg')] bg-center bg-cover rounded-[26px]">
                <div class="h-[600px] flex flex-col p-4">
                     <header class="text-center mb-4 flex-shrink-0"><p class="font-bold text-slate-800">Profesor</p><p class="text-xs text-slate-500">Odpoví, jakmile to bude možné</p></header>
                    <div id="student-chat-history" class="flex-grow space-y-4 overflow-y-auto p-2">Načítám zprávy...</div>
                    <footer class="mt-4 flex-shrink-0"><div class="flex items-center bg-white rounded-full p-2 shadow-inner"><textarea id="student-chat-input" class="flex-grow bg-transparent p-2 text-sm focus:outline-none resize-none" rows="1" placeholder="Napište zprávu profesorovi..."></textarea><button id="student-send-btn" class="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 hover:bg-blue-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button></div></footer>
                </div>
            </div>
        </div>
    `;
    const sendBtn = container.querySelector('#student-send-btn');
    const input = container.querySelector('#student-chat-input');
    const historyContainer = container.querySelector('#student-chat-history');
    const studentId = auth.currentUser.uid;

    const messagesQuery = query(collection(db, "conversations", studentId, "messages"), orderBy("timestamp"));
    const unsubscribe = onSnapshot(messagesQuery, (querySnapshot) => {
        historyContainer.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const msg = doc.data();
            const messageEl = document.createElement('div');
            const sender = msg.senderId === studentId ? 'user' : 'professor';
            messageEl.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
            messageEl.innerHTML = `<div class="${sender === 'user' ? 'bg-green-200' : 'bg-white'} p-3 rounded-xl max-w-xs text-sm">${msg.text}</div>`;
            historyContainer.appendChild(messageEl);
        });
        historyContainer.scrollTop = historyContainer.scrollHeight;
    });

    const handleSend = async () => {
        const text = input.value.trim();
        if (!text) return;
        
        const tempInputVal = input.value;
        input.value = '';
        sendBtn.disabled = true;

        try {
            await sendMessageFromStudent({ text: tempInputVal });
        } catch (error) {
            console.error("Error sending message:", error);
            showToast(`Odeslání zprávy selhalo: ${error.message}`, true);
            input.value = tempInputVal;
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
}
function renderVideo(videoUrl, container) {
    let videoId = null;
    try {
        const url = new URL(videoUrl);
        videoId = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
    } catch (e) {
        const match = videoUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        videoId = match ? match[1] : null;
    }
    if (videoId) {
        container.innerHTML = `<h2 class="text-2xl md:text-3xl font-extrabold text-slate-800 mb-6 text-center">Video k lekci</h2><div class="rounded-xl overflow-hidden aspect-video mx-auto max-w-4xl shadow-lg"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="w-full h-full"></iframe></div>`;
    } else {
        container.innerHTML = `<p class="text-red-500 text-center font-semibold p-8">Vložená URL adresa videa není platná.</p>`;
    }
}
function renderPresentation(presentationData, container) {
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
function renderQuiz(quizData, container) {
    if (!quizData || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
        container.innerHTML = `<p class="text-center text-slate-500 p-8">Pro tuto lekci není k dispozici žádný kvíz.</p>`; return;
    }
    const questionsHtml = quizData.questions.map((q, index) => {
        const optionsHtml = (q.options || []).map((option, i) => `<label class="block p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"><input type="radio" name="question-${index}" value="${i}" class="mr-3"><span>${option}</span></label>`).join('');
        return `<div class="bg-slate-50 p-4 md:p-6 rounded-lg border border-slate-200 mb-6" data-q-index="${index}"><p class="font-semibold text-base md:text-lg mb-4">${index + 1}. ${q.question_text}</p><div class="space-y-3">${optionsHtml}</div><div class="mt-4 p-3 rounded-lg text-sm hidden result-feedback"></div></div>`;
    }).join('');
    container.innerHTML = `<h2 class="text-2xl md:text-3xl font-extrabold text-slate-800 mb-6 text-center">Interaktivní Kvíz</h2><form id="quiz-form">${questionsHtml}</form><div class="text-center mt-6"><button id="check-quiz-btn" class="bg-green-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-green-700">Vyhodnotit</button></div><div id="quiz-summary" class="hidden mt-8 text-center font-bold text-xl p-4 rounded-lg"></div>`;
    document.getElementById('check-quiz-btn').addEventListener('click', (e) => {
        e.preventDefault();
        let score = 0;
        quizData.questions.forEach((q, index) => {
            const qEl = container.querySelector(`[data-q-index="${index}"]`);
            const feedbackEl = qEl.querySelector('.result-feedback');
            const selected = qEl.querySelector('input:checked');
            feedbackEl.classList.remove('hidden');
            if (selected) {
                if (parseInt(selected.value) === q.correct_option_index) {
                    score++;
                    feedbackEl.textContent = 'Správně!';
                    feedbackEl.className = 'mt-4 p-3 rounded-lg text-sm bg-green-100 text-green-700 result-feedback';
                } else {
                    feedbackEl.textContent = `Špatně. Správná odpověď: ${q.options[q.correct_option_index]}`;
                    feedbackEl.className = 'mt-4 p-3 rounded-lg text-sm bg-red-100 text-red-700 result-feedback';
                }
            } else {
                feedbackEl.textContent = 'Nevybrali jste odpověď.';
                feedbackEl.className = 'mt-4 p-3 rounded-lg text-sm bg-yellow-100 text-yellow-800 result-feedback';
            }
        });
        const summaryEl = document.getElementById('quiz-summary');
        summaryEl.textContent = `Vaše skóre: ${score} z ${quizData.questions.length}`;
        summaryEl.classList.remove('hidden');
    });
}
function renderTest(testData, container) { renderQuiz(testData, container); }

function renderPodcast(postData, container) {
    if (!postData || !Array.isArray(postData.episodes) || postData.episodes.length === 0) {
        container.innerHTML = `<p class="text-center text-slate-500 p-8">Pro tuto lekci není k dispozici žádný podcast.</p>`; 
        return;
    };

    const episodesHtml = postData.episodes.map((episode, i) => `
        <div class="podcast-episode bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4 transition-all duration-300">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <button class="play-pause-btn text-3xl text-green-700 hover:text-green-600" data-episode-index="${i}">▶️</button>
                    <div>
                        <h4 class="font-bold text-md text-slate-800">${i + 1}. ${episode.title}</h4>
                        <p class="text-sm text-slate-500">Klikněte pro přehrání</p>
                    </div>
                </div>
            </div>
            <div class="script-content hidden mt-4 text-slate-600 prose prose-sm">${episode.script.replace(/\n/g, '<br>')}</div>
        </div>
    `).join('');

    container.innerHTML = `<h2 class="text-2xl md:text-3xl font-extrabold text-slate-800 mb-6 text-center">Podcast & Materiály</h2><div id="podcast-list">${episodesHtml}</div>`;

    const podcastList = document.getElementById('podcast-list');
    
    const speakText = (text, onEndCallback) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'cs-CZ';

        const voices = window.speechSynthesis.getVoices();
        const czechVoice = voices.find(voice => voice.lang === 'cs-CZ');
        if (czechVoice) {
            utterance.voice = czechVoice;
        } else {
            console.warn("Český hlas pro převod textu na řeč nebyl nalezen. Bude použit výchozí hlas prohlížeče.");
        }
        
        utterance.onend = onEndCallback;
        window.speechSynthesis.speak(utterance);
    };

    podcastList.addEventListener('click', (e) => {
        const playBtn = e.target.closest('.play-pause-btn');
        if (!playBtn) return;

        const episodeIndex = parseInt(playBtn.dataset.episodeIndex, 10);
        const episodeData = postData.episodes[episodeIndex];
        const episodeElement = playBtn.closest('.podcast-episode');

        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel(); 
            
            let wasPlayingThis = playBtn.textContent === '⏹️';

            document.querySelectorAll('.podcast-episode').forEach(el => {
                el.classList.remove('bg-green-100', 'border-green-300');
                el.querySelector('.play-pause-btn').textContent = '▶️';
            });
            
            if (wasPlayingThis) return;
        }

        speakText(episodeData.title + ". " + episodeData.script, () => {
            playBtn.textContent = '▶️';
            episodeElement.classList.remove('bg-green-100', 'border-green-300');
        });

        playBtn.textContent = '⏹️';
        episodeElement.classList.add('bg-green-100', 'border-green-300');
    });
}

import { db } from './firebase-init.js';
import { collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
import { getAiAssistantResponse } from './gemini-api.js';

let currentLessonId = null;
let testTimerInterval = null;

export async function initStudentDashboard() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div id="student-dashboard" class="p-4 md:p-6 lg:p-8">
            <h2 class="text-2xl md:text-3xl font-bold mb-4">Můj studijní panel</h2>
            <div id="lesson-selector-container" class="mb-6"></div>
            <div id="lesson-content" class="mt-4 p-4 border rounded-lg bg-white shadow-sm hidden"></div>
            <div id="chat-container" class="mt-6 hidden">
                 <h3 class="text-xl font-semibold mb-2">AI Asistent</h3>
                 <div id="chat-history" class="h-80 overflow-y-auto border p-3 my-2 rounded-lg bg-gray-50"></div>
                 <div class="flex">
                    <input type="text" id="chat-input" class="flex-grow border rounded-l-md p-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Zeptejte se na cokoliv k lekci...">
                    <button id="send-chat-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold p-2 rounded-r-md">Odeslat</button>
                </div>
            </div>
        </div>
    `;

    await loadLessonSelector();
    
    document.getElementById('send-chat-btn').addEventListener('click', sendChatMessage);
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
}


async function loadLessonSelector() {
    const container = document.getElementById('lesson-selector-container');
    if (!container) return;

    try {
        const q = query(collection(db, "lessons"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = '<p class="text-gray-500">Zatím zde nejsou žádné lekce.</p>';
            return;
        }

        const selectEl = document.createElement('select');
        selectEl.className = 'border p-2 rounded w-full max-w-md';
        selectEl.innerHTML = '<option value="">Vyberte lekci</option>';
        
        querySnapshot.forEach(doc => {
            selectEl.innerHTML += `<option value="${doc.id}">${doc.data().title}</option>`;
        });

        selectEl.addEventListener('change', (e) => loadLessonContent(e.target.value));
        container.appendChild(selectEl);

    } catch (error) {
        console.error("Error loading lessons: ", error);
        showToast("Nepodařilo se načíst lekce.", true);
    }
}

async function loadLessonContent(lessonId) {
    currentLessonId = lessonId;
    const contentContainer = document.getElementById('lesson-content');
    const chatContainer = document.getElementById('chat-container');
    
    clearInterval(testTimerInterval);

    if (!lessonId) {
        contentContainer.classList.add('hidden');
        chatContainer.classList.add('hidden');
        return;
    }

    try {
        const lessonRef = doc(db, "lessons", lessonId);
        const lessonSnap = await getDoc(lessonRef);

        if (lessonSnap.exists()) {
            const lessonData = lessonSnap.data();
            renderLessonContent(lessonData);
            contentContainer.classList.remove('hidden');
            chatContainer.classList.remove('hidden');
            loadChatHistory();
        } else {
            showToast("Lekce nebyla nalezena.", true);
            contentContainer.classList.add('hidden');
            chatContainer.classList.add('hidden');
        }
    } catch (error) {
        console.error("Error loading lesson content:", error);
        showToast("Chyba při načítání obsahu lekce.", true);
    }
}

function renderLessonContent(lessonData) {
    const container = document.getElementById('lesson-content');
    container.innerHTML = `<h3 class="text-2xl font-bold mb-4">${lessonData.title}</h3>`;

    if (lessonData.content && lessonData.content.blocks) {
        lessonData.content.blocks.forEach(block => {
            let element;
            switch (block.type) {
                case 'header':
                    element = document.createElement(`h${block.data.level}`);
                    element.innerHTML = block.data.text;
                    element.className = 'font-bold mt-4 mb-2';
                    if (block.data.level === 2) element.classList.add('text-xl');
                    if (block.data.level === 3) element.classList.add('text-lg');
                    break;
                case 'paragraph':
                    element = document.createElement('p');
                    element.innerHTML = block.data.text;
                    element.className = 'mb-4';
                    break;
                case 'list':
                    element = document.createElement(block.data.style === 'ordered' ? 'ol' : 'ul');
                    element.className = 'list-disc list-inside mb-4';
                    block.data.items.forEach(item => {
                        const li = document.createElement('li');
                        li.innerHTML = item;
                        element.appendChild(li);
                    });
                    break;
                case 'image':
                    element = document.createElement('img');
                    element.src = block.data.file.url;
                    element.alt = block.data.caption || 'Lesson image';
                    element.className = 'my-4 rounded-lg shadow-md';
                    break;
                 default:
                    console.warn(`Unsupported block type: ${block.type}`);
                    break;
            }
            if (element) container.appendChild(element);
        });
    }

    if(lessonData.quiz) renderQuiz(lessonData.quiz);
    if(lessonData.test) renderTest(lessonData.test);
    if(lessonData.podcast) renderPodcast(lessonData.podcast);
}

function renderQuiz(quiz) {
    const container = document.getElementById('lesson-content');
    const quizContainer = document.createElement('div');
    quizContainer.id = 'quiz-container';
    quizContainer.className = 'mt-6 p-4 border-t';
    quizContainer.innerHTML = `<h4 class="text-xl font-semibold mb-3">Kvíz: ${quiz.title}</h4>`;

    quiz.questions.forEach((q, index) => {
        const questionEl = document.createElement('div');
        questionEl.className = 'mb-4';
        questionEl.innerHTML = `<p class="font-medium">${index + 1}. ${q.question}</p>`;
        
        const optionsEl = document.createElement('div');
        q.options.forEach(option => {
            optionsEl.innerHTML += `
                <label class="block">
                    <input type="radio" name="question-${index}" value="${option}" class="mr-2">
                    ${option}
                </label>
            `;
        });
        questionEl.appendChild(optionsEl);
        quizContainer.appendChild(questionEl);
    });

    const submitBtn = document.createElement('button');
    submitBtn.id = 'submit-quiz-btn';
    submitBtn.textContent = 'Odevzdat kvíz';
    submitBtn.className = 'bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded';
    submitBtn.addEventListener('click', () => submitQuiz(quiz));

    quizContainer.appendChild(submitBtn);
    container.appendChild(quizContainer);
}

function submitQuiz(quiz) {
    let score = 0;
    quiz.questions.forEach((q, index) => {
        const selected = document.querySelector(`input[name="question-${index}"]:checked`);
        if (selected && selected.value === q.correctAnswer) {
            score++;
        }
    });

    const total = quiz.questions.length;
    const resultEl = document.createElement('p');
    resultEl.className = 'mt-4 font-bold';
    resultEl.textContent = `Váš výsledek: ${score} z ${total} správných odpovědí.`;
    
    document.getElementById('quiz-container').appendChild(resultEl);
    document.getElementById('submit-quiz-btn').disabled = true;
    showToast(`Kvíz odevzdán! Získáno ${score}/${total} bodů.`);
}

function renderTest(test) {
    const container = document.getElementById('lesson-content');
    const testContainer = document.createElement('div');
    testContainer.id = 'test-container';
    testContainer.className = 'mt-6 p-4 border-t border-red-300';
    
    const timerEl = document.createElement('div');
    timerEl.id = 'test-timer';
    timerEl.className = 'text-lg font-bold text-red-600 mb-4';

    testContainer.innerHTML = `<h4 class="text-xl font-semibold mb-3">Test: ${test.title}</h4>`;
    testContainer.appendChild(timerEl);

    test.questions.forEach((q, index) => {
        const questionEl = document.createElement('div');
        questionEl.className = 'mb-4';
        questionEl.innerHTML = `<p class="font-medium">${index + 1}. ${q.question}</p>`;
        
        if (q.type === 'multiple-choice') {
             const optionsEl = document.createElement('div');
            q.options.forEach(option => {
                optionsEl.innerHTML += `
                    <label class="block">
                        <input type="radio" name="question-${index}" value="${option}" class="mr-2">
                        ${option}
                    </label>
                `;
            });
            questionEl.appendChild(optionsEl);
        } else if (q.type === 'open-ended') {
            const textarea = document.createElement('textarea');
            textarea.name = `question-${index}`;
            textarea.className = 'w-full border p-2 rounded mt-2';
            textarea.placeholder = 'Napište svou odpověď...';
            questionEl.appendChild(textarea);
        }
        testContainer.appendChild(questionEl);
    });

    const submitBtn = document.createElement('button');
    submitBtn.id = 'submit-test-btn';
    submitBtn.textContent = 'Odevzdat test';
    submitBtn.className = 'bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded';
    submitBtn.addEventListener('click', () => submitTest(test));

    testContainer.appendChild(submitBtn);
    container.appendChild(testContainer);

    startTestTimer(test.durationMinutes);
}

function startTestTimer(durationMinutes) {
    const timerEl = document.getElementById('test-timer');
    let timeLeft = durationMinutes * 60;

    testTimerInterval = setInterval(() => {
        const minutes = Math.floor(timeLeft / 60);
        let seconds = timeLeft % 60;
        seconds = seconds < 10 ? '0' + seconds : seconds;

        timerEl.textContent = `Zbývající čas: ${minutes}:${seconds}`;
        timeLeft--;

        if (timeLeft < 0) {
            clearInterval(testTimerInterval);
            timerEl.textContent = "Čas vypršel!";
            document.getElementById('submit-test-btn').click();
        }
    }, 1000);
}

function submitTest(test) {
    clearInterval(testTimerInterval);
    const answers = [];
    test.questions.forEach((q, index) => {
        let answer;
        if (q.type === 'multiple-choice') {
            const selected = document.querySelector(`input[name="question-${index}"]:checked`);
            answer = selected ? selected.value : null;
        } else if (q.type === 'open-ended') {
            const textarea = document.querySelector(`textarea[name="question-${index}"]`);
            answer = textarea ? textarea.value : null;
        }
        answers.push({ question: q.question, answer: answer });
    });

    console.log("Odevzdané odpovědi:", answers);
    document.getElementById('test-container').innerHTML = '<p class="font-bold text-green-700">Test byl úspěšně odevzdán. Výsledky budou brzy k dispozici.</p>';
    showToast("Test odevzdán!");
}

function renderPodcast(podcast) {
    const container = document.getElementById('lesson-content');
    const podcastContainer = document.createElement('div');
    podcastContainer.className = 'mt-6 p-4 border-t';
    podcastContainer.innerHTML = `
        <h4 class="text-xl font-semibold mb-3">Podcast: ${podcast.title}</h4>
        <audio controls class="w-full">
            <source src="${podcast.audioUrl}" type="audio/mpeg">
            Váš prohlížeč nepodporuje přehrávání audia.
        </audio>
    `;
    container.appendChild(podcastContainer);
}


async function loadChatHistory() {
    if (!currentLessonId) return;

    const chatHistoryEl = document.getElementById('chat-history');
    chatHistoryEl.innerHTML = '';

    try {
        const q = query(
            collection(db, "lessons", currentLessonId, "interactions"), 
            orderBy("timestamp", "asc")
        );
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach(doc => {
            const data = doc.data();
            appendChatMessage(data.role, data.text);
        });

    } catch (error) {
        console.error("Error loading chat history:", error);
    }
}


async function sendChatMessage() {
    const inputEl = document.getElementById('chat-input');
    const userQuestion = inputEl.value.trim();

    if (!userQuestion || !currentLessonId) return;

    appendChatMessage('user', userQuestion);
    inputEl.value = '';
    inputEl.disabled = true;

    try {
        const userMessage = {
            role: 'user',
            text: userQuestion,
            timestamp: serverTimestamp()
        };
        await addDoc(collection(db, "lessons", currentLessonId, "interactions"), userMessage);

        const response = await getAiAssistantResponse({ lessonId: currentLessonId, userQuestion });
        
        if (response.error) {
             throw new Error(response.error);
        }

        const aiMessage = {
            role: 'model',
            text: response.text,
            timestamp: serverTimestamp()
        };
        await addDoc(collection(db, "lessons", currentLessonId, "interactions"), aiMessage);
        
        appendChatMessage('model', response.text);

    } catch (error) {
        console.error("Error with AI assistant:", error);
        appendChatMessage('model', 'Omlouvám se, ale nastala chyba. Zkuste to prosím znovu.');
    } finally {
        inputEl.disabled = false;
        inputEl.focus();
    }
}

function appendChatMessage(role, text) {
    const chatHistoryEl = document.getElementById('chat-history');
    const msgDiv = document.createElement('div');
    
    const formattedText = text.replace(/\n/g, '<br>');
    msgDiv.innerHTML = formattedText;

    msgDiv.className = `p-3 my-2 rounded-lg max-w-xl`;
    
    if (role === 'user') {
        msgDiv.classList.add('bg-blue-500', 'text-white', 'ml-auto', 'rounded-br-none');
    } else {
        msgDiv.classList.add('bg-gray-200', 'text-gray-800', 'mr-auto', 'rounded-bl-none');
    }
    
    chatHistoryEl.appendChild(msgDiv);
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

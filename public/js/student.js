import { db, auth } from './firebase-init.js';
import { getDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getLessonAssistantResponse } from './gemini-api.js';

// Globálne premenné pre stav
let currentStudentId = null;
let currentLessonId = null;

// Funkcia na parsovanie URL parametrov
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// Inicializácia dashboardu pre študenta
export async function initStudentDashboard() {
    const studentId = getQueryParam('studentId');
    if (!studentId) {
        console.error("Student ID is missing from URL");
        document.getElementById('student-dashboard').innerHTML = '<p class="error">Chýba ID študenta. Prihláste sa prosím znova.</p>';
        return;
    }
    currentStudentId = studentId;
    displayStudentInfo(studentId);
    loadLessons(studentId);
}

// Zobrazenie informácií o študentovi
async function displayStudentInfo(studentId) {
    const studentRef = doc(db, "students", studentId);
    const studentSnap = await getDoc(studentRef);
    if (studentSnap.exists()) {
        const studentData = studentSnap.data();
        document.getElementById('student-name').textContent = studentData.name;
        // Prípadné ďalšie info o študentovi
    } else {
        console.error("No such student!");
    }
}

// Načítanie a zobrazenie lekcií
async function loadLessons(studentId) {
    const studentRef = doc(db, "students", studentId);
    const studentSnap = await getDoc(studentRef);

    if (studentSnap.exists()) {
        const studentData = studentSnap.data();
        const lessonsList = document.getElementById('lessons-list');
        lessonsList.innerHTML = ''; // Vyčistiť zoznam

        if (studentData.lessons && studentData.lessons.length > 0) {
            for (const lessonId of studentData.lessons) {
                const lessonRef = doc(db, "lessons", lessonId);
                const lessonSnap = await getDoc(lessonRef);
                if (lessonSnap.exists()) {
                    const lessonData = lessonSnap.data();
                    const listItem = document.createElement('li');
                    listItem.textContent = lessonData.title;
                    listItem.dataset.lessonId = lessonId;
                    listItem.addEventListener('click', () => {
                        document.querySelectorAll('#lessons-list li').forEach(li => li.classList.remove('active'));
                        listItem.classList.add('active');
                        loadLessonContent(lessonId);
                    });
                    lessonsList.appendChild(listItem);
                }
            }
        } else {
            lessonsList.innerHTML = '<p>Zatiaľ nemáte priradené žiadne lekcie.</p>';
        }
    }
}

// Načítanie obsahu konkrétnej lekcie
async function loadLessonContent(lessonId) {
    currentLessonId = lessonId;
    const lessonRef = doc(db, "lessons", lessonId);
    const lessonSnap = await getDoc(lessonRef);

    if (lessonSnap.exists()) {
        const lessonData = lessonSnap.data();
        const lessonContentDiv = document.getElementById('lesson-content');
        lessonContentDiv.innerHTML = `<h2>${lessonData.title}</h2>`;

        // Zobrazenie obsahu podľa typu
        switch (lessonData.type) {
            case 'text':
                renderText(lessonContentDiv, lessonData.content);
                break;
            case 'presentation':
                renderPresentation(lessonContentDiv, lessonData.content);
                break;
            case 'video':
                renderVideo(lessonContentDiv, lessonData.content);
                break;
            case 'quiz':
                renderQuiz(lessonContentDiv, lessonData.content);
                break;
            case 'test':
                renderTest(lessonContentDiv, lessonData.content);
                break;
            case 'podcast':
                renderPodcast(lessonContentDiv, lessonData.content);
                break;
            case 'ai_assistant':
                renderAIAssistantChat(lessonContentDiv, lessonData.content);
                break;
            default:
                lessonContentDiv.innerHTML += '<p>Neznámy typ obsahu.</p>';
        }
    }
}

// --- Renderovacie funkcie ---

function renderText(container, content) {
    const textElement = document.createElement('div');
    textElement.className = 'text-content';
    // Dôležité: Ochrana pred XSS - ak by obsah mohol obsahovať škodlivý HTML
    // Ak očakávate bezpečné HTML, môžete použiť innerHTML. Inak je lepšie textContent.
    textElement.innerHTML = content; // Používame innerHTML, aby sa formátovanie (napr. z editora) prejavilo
    container.appendChild(textElement);
}

function renderPresentation(container, content) {
    // Extrahujeme URL z iframe kódu, ak je vložený celý
    const urlMatch = content.match(/src="([^"]+)"/);
    const url = urlMatch ? urlMatch[1] : content;

    if (url) {
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.width = '100%';
        iframe.height = '500px';
        iframe.frameBorder = '0';
        iframe.allowFullscreen = true;
        iframe.setAttribute('allow', 'fullscreen');
        container.appendChild(iframe);
    } else {
        container.innerHTML += '<p class="error">Nepodarilo sa načítať prezentáciu.</p>';
    }
}

function renderVideo(container, content) {
    function getYouTubeID(url) {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    const videoId = getYouTubeID(content);

    if (videoId) {
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${videoId}`;
        iframe.width = '100%';
        iframe.height = '450px';
        iframe.frameBorder = '0';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        container.appendChild(iframe);
    } else {
        container.innerHTML += '<p class="error">Nepodarilo sa načítať video. Skontrolujte URL.</p>';
    }
}

function renderQuiz(container, content) {
    const quizContainer = document.createElement('div');
    quizContainer.className = 'quiz-container';

    content.questions.forEach((q, index) => {
        const questionElement = document.createElement('div');
        questionElement.className = 'quiz-question';
        questionElement.innerHTML = `<p><strong>${index + 1}. ${q.question}</strong></p>`;

        const optionsElement = document.createElement('ul');
        optionsElement.className = 'quiz-options';

        q.options.forEach(option => {
            const li = document.createElement('li');
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = `question-${index}`;
            input.value = option;
            input.id = `q${index}-${option.replace(/\s+/g, '-')}`;

            const label = document.createElement('label');
            label.htmlFor = input.id;
            label.textContent = option;

            li.appendChild(input);
            li.appendChild(label);
            optionsElement.appendChild(li);
        });

        questionElement.appendChild(optionsElement);
        quizContainer.appendChild(questionElement);
    });

    const submitButton = document.createElement('button');
    submitButton.textContent = 'Odoslať kvíz';
    submitButton.className = 'quiz-submit-btn';
    submitButton.addEventListener('click', () => {
        evaluateQuiz(content.questions, quizContainer);
    });

    quizContainer.appendChild(submitButton);
    container.appendChild(quizContainer);
}

function evaluateQuiz(questions, container) {
    let score = 0;
    questions.forEach((q, index) => {
        const selectedOption = container.querySelector(`input[name="question-${index}"]:checked`);
        if (selectedOption && selectedOption.value === q.answer) {
            score++;
            selectedOption.parentElement.classList.add('correct');
        } else if (selectedOption) {
            selectedOption.parentElement.classList.add('incorrect');
        }
    });

    // Zobrazenie výsledku
    const resultElement = document.createElement('div');
    resultElement.className = 'quiz-result';
    resultElement.innerHTML = `<h3>Váš výsledok: ${score} / ${questions.length}</h3>`;
    container.appendChild(resultElement);

    // Tu by sa v budúcnosti mohol výsledok ukladať do Firestore
}


function renderTest(container, content) {
    // Zatiaľ môžeme použiť rovnakú logiku ako pre kvíz
    renderQuiz(container, content);
    // V budúcnosti sa môže líšiť napr. v časovom limite, type otázok atď.
    const title = container.querySelector('h2');
    if(title) title.textContent += " (Test)";
}

function renderPodcast(container, content) {
    // Očakávame URL alebo embed kód zo Spotify
    const urlMatch = content.match(/src="([^"]+)"/);
    let url = urlMatch ? urlMatch[1] : content;

    // Ak je to len link, upravíme ho na embed verziu
    if (url.includes('open.spotify.com/episode/')) {
        url = url.replace('open.spotify.com/episode/', 'open.spotify.com/embed/episode/');
    }

    if (url) {
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.width = '100%';
        iframe.height = '152';
        iframe.frameBorder = '0';
        iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
        container.appendChild(iframe);
    } else {
        container.innerHTML += '<p class="error">Nepodarilo sa načítať podcast.</p>';
    }
}

function renderAIAssistantChat(container, content) {
    const chatContainer = document.createElement('div');
    chatContainer.className = 'ai-chat-container';

    chatContainer.innerHTML = `
        <div class="virtual-mobile">
            <div class="mobile-screen">
                <div class="chat-header">AI Sensei Asistent</div>
                <div class="chat-messages" id="chat-messages">
                    <div class="message received">
                        <p>Ahoj! Som tvoj AI asistent pre túto lekciu. Ako ti môžem pomôcť?</p>
                    </div>
                </div>
                <div class="chat-input-area">
                    <input type="text" id="chat-input" placeholder="Napíš svoju otázku...">
                    <button id="chat-send-btn">Odoslať</button>
                </div>
            </div>
        </div>
    `;

    container.appendChild(chatContainer);

    const sendBtn = document.getElementById('chat-send-btn');
    const chatInput = document.getElementById('chat-input');
    const messagesContainer = document.getElementById('chat-messages');

    sendBtn.addEventListener('click', () => sendMessage());
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    async function sendMessage() {
        const messageText = chatInput.value.trim();
        if (messageText === '' || !currentLessonId) return;

        // Zobraziť správu od používateľa
        const sentMessage = document.createElement('div');
        sentMessage.className = 'message sent';
        sentMessage.innerHTML = `<p>${messageText}</p>`;
        messagesContainer.appendChild(sentMessage);
        chatInput.value = '';
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Zobraziť "písací" indikátor
        const thinkingIndicator = document.createElement('div');
        thinkingIndicator.className = 'message received typing-indicator';
        thinkingIndicator.innerHTML = `<p><span>.</span><span>.</span><span>.</span></p>`;
        messagesContainer.appendChild(thinkingIndicator);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        try {
            // Zavolať Gemini API
            const response = await getLessonAssistantResponse(currentLessonId, messageText);

            // Odstrániť indikátor a zobraziť odpoveď
            messagesContainer.removeChild(thinkingIndicator);
            const receivedMessage = document.createElement('div');
            receivedMessage.className = 'message received';
            // Pre istotu ošetríme potenciálne nebezpečný HTML obsah v odpovedi
            const p = document.createElement('p');
            p.textContent = response;
            receivedMessage.appendChild(p);
            messagesContainer.appendChild(receivedMessage);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

        } catch (error) {
            messagesContainer.removeChild(thinkingIndicator);
            const errorMessage = document.createElement('div');
            errorMessage.className = 'message received';
            errorMessage.innerHTML = `<p class="error">Prepáč, nastala chyba. Skús to znova.</p>`;
            messagesContainer.appendChild(errorMessage);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            console.error("Error getting AI response:", error);
        }
    }
}

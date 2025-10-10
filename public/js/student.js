import { db } from './firebase-init.js';
import { getDoc, setDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getLessonAssistantResponse } from './gemini-api.js';

// Globálne premenné
let currentStudentId = null;
let currentLessonId = null;

// --- Helper funkcie ---
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

function showLoader(elementId) {
    document.getElementById(elementId).innerHTML = '<div class="loader"></div>';
}

// --- Inicializácia ---
export async function initStudentDashboard() {
    const studentId = getQueryParam('studentId');
    if (!studentId) {
        document.getElementById('student-dashboard').innerHTML = '<p class="error">Chýba ID študenta.</p>';
        return;
    }
    currentStudentId = studentId;
    displayStudentInfo(studentId);
    loadLessons(studentId);
}

// --- Načítanie dát ---
async function displayStudentInfo(studentId) {
    const studentRef = doc(db, "students", studentId);
    const studentSnap = await getDoc(studentRef);
    if (studentSnap.exists()) {
        document.getElementById('student-name').textContent = studentSnap.data().name;
    }
}

async function loadLessons(studentId) {
    showLoader('lessons-list');
    const studentRef = doc(db, "students", studentId);
    const studentSnap = await getDoc(studentRef);
    const lessonsList = document.getElementById('lessons-list');
    lessonsList.innerHTML = '';

    if (studentSnap.exists() && studentSnap.data().lessons?.length > 0) {
        for (const lessonId of studentSnap.data().lessons) {
            const lessonRef = doc(db, "lessons", lessonId);
            const lessonSnap = await getDoc(lessonRef);
            
            const progressRef = doc(db, `students/${studentId}/progress/${lessonId}`);
            const progressSnap = await getDoc(progressRef);
            const isCompleted = progressSnap.exists() && progressSnap.data().completed;

            if (lessonSnap.exists()) {
                const listItem = document.createElement('li');
                listItem.textContent = lessonSnap.data().title;
                listItem.dataset.lessonId = lessonId;
                if (isCompleted) {
                    listItem.classList.add('completed');
                }
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

async function loadLessonContent(lessonId) {
    currentLessonId = lessonId;
    showLoader('lesson-content');
    const lessonRef = doc(db, "lessons", lessonId);
    const lessonSnap = await getDoc(lessonRef);
    const lessonContentDiv = document.getElementById('lesson-content');
    
    if (lessonSnap.exists()) {
        const lessonData = lessonSnap.data();
        lessonContentDiv.innerHTML = `<h2>${lessonData.title}</h2>`;

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
            case 'test':
                const progressRef = doc(db, `students/${currentStudentId}/progress/${lessonId}`);
                const progressSnap = await getDoc(progressRef);
                if (progressSnap.exists()) {
                    renderQuizResult(lessonContentDiv, progressSnap.data(), lessonData.content.questions.length);
                } else {
                    renderQuiz(lessonContentDiv, lessonData.content);
                }
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
    } else {
        lessonContentDiv.innerHTML = '<p class="error">Nepodarilo sa načítať obsah lekcie.</p>';
    }
}

// --- Ukladanie pokroku ---
async function saveQuizResult(lessonId, score, totalQuestions) {
    if (!currentStudentId) return;
    
    const progressRef = doc(db, `students/${currentStudentId}/progress/${lessonId}`);
    const result = {
        score,
        totalQuestions,
        completed: (score / totalQuestions) >= 0.8, // Lekcia je dokončená pri 80%
        timestamp: new Date()
    };
    
    try {
        await setDoc(progressRef, result);
        console.log("Quiz result saved!");
        if (result.completed) {
            const lessonItem = document.querySelector(`li[data-lesson-id="${lessonId}"]`);
            if (lessonItem) {
                lessonItem.classList.add('completed');
            }
        }
    } catch (error) {
        console.error("Error saving quiz result: ", error);
    }
}

// --- Renderovacie funkcie ---
function renderText(container, content) {
    const textElement = document.createElement('div');
    textElement.className = 'text-content';
    textElement.innerHTML = content;
    container.appendChild(textElement);
}

function renderPresentation(container, content) {
    const urlMatch = content.match(/src="([^"]+)"/);
    const url = urlMatch ? urlMatch[1] : content;
    if (url) {
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.width = '100%';
        iframe.height = '500px';
        iframe.frameBorder = '0';
        iframe.allowFullscreen = true;
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
        container.innerHTML += '<p class="error">Nepodarilo sa načítať video.</p>';
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

    container.querySelectorAll('input[type="radio"]').forEach(input => input.disabled = true);
    container.querySelector('.quiz-submit-btn').style.display = 'none';

    saveQuizResult(currentLessonId, score, questions.length);
    renderQuizResult(container, { score }, questions.length, true);
}

function renderQuizResult(container, resultData, totalQuestions, isNew = false) {
    const resultElement = document.createElement('div');
    resultElement.className = 'quiz-result';
    const message = isNew ? 'Váš výsledok:' : 'Váš posledný výsledok:';
    resultElement.innerHTML = `<h3>${message} ${resultData.score} / ${totalQuestions}</h3>`;
    
    if ((resultData.score / totalQuestions) >= 0.8) {
        resultElement.innerHTML += '<p class="success">Gratulujeme, úspešne ste dokončili túto lekciu!</p>';
    } else {
        resultElement.innerHTML += '<p class="warning">Pre dokončenie lekcie je potrebné dosiahnuť aspoň 80% úspešnosť.</p>';
    }
    
    if (isNew) {
        container.appendChild(resultElement);
    } else {
        container.prepend(resultElement);
    }
}

function renderPodcast(container, content) {
    const urlMatch = content.match(/src="([^"]+)"/);
    let url = urlMatch ? urlMatch[1] : content;
    if (url.includes('open.spotify.com')) {
        url = url.replace('open.spotify.com', 'open.spotify.com/embed');
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
                    <div class="message received"><p>Ahoj! Som tvoj AI asistent. Ako ti môžem pomôcť?</p></div>
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

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    async function sendMessage() {
        const messageText = chatInput.value.trim();
        if (messageText === '' || !currentLessonId) return;

        const sentMessage = document.createElement('div');
        sentMessage.className = 'message sent';
        sentMessage.innerHTML = `<p>${messageText}</p>`;
        messagesContainer.appendChild(sentMessage);
        chatInput.value = '';
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        const thinkingIndicator = document.createElement('div');
        thinkingIndicator.className = 'message received typing-indicator';
        thinkingIndicator.innerHTML = `<p><span>.</span><span>.</span><span>.</span></p>`;
        messagesContainer.appendChild(thinkingIndicator);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        try {
            const response = await getLessonAssistantResponse(currentLessonId, messageText);
            messagesContainer.removeChild(thinkingIndicator);
            const receivedMessage = document.createElement('div');
            receivedMessage.className = 'message received';
            const p = document.createElement('p');
            p.textContent = response;
            receivedMessage.appendChild(p);
            messagesContainer.appendChild(receivedMessage);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } catch (error) {
            messagesContainer.removeChild(thinkingIndicator);
            const errorMessage = document.createElement('div');
            errorMessage.className = 'message received';
            errorMessage.innerHTML = `<p class="error">Prepáč, nastala chyba.</p>`;
            messagesContainer.appendChild(errorMessage);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            console.error("Error getting AI response:", error);
        }
    }
}

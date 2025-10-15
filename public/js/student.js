import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import {
  getAiAssistantResponse
} from "./gemini-api.js";

const auth = getAuth();
const db = getFirestore();

// --- Element References ---
const studentDashboard = document.getElementById("student-dashboard");
const lessonDetailView = document.getElementById("lesson-detail");
const lessonContent = document.getElementById("lesson-content");
const lessonListContainer = document.getElementById("lesson-list-container");
const backToOverviewBtn = document.getElementById("back-to-overview");
const startQuizBtn = document.getElementById("start-quiz-btn");
const quizView = document.getElementById("quiz-view");
const quizContainer = document.getElementById("quiz-container");
const quizResultsView = document.getElementById("quiz-results-view");
const quizScore = document.getElementById("quiz-score");
const retakeQuizBtn = document.getElementById("retake-quiz-btn");
const backToLessonBtn = document.getElementById("back-to-lesson-btn");
const aiAssistantContainer = document.getElementById("ai-assistant-container");

let currentLessonData = null;
let currentQuestions = [];
let currentUser = null;
let lessonStates = {}; // Pre uchovanie stavu lekcií

// --- State Management ---
function showView(viewToShow) {
  [studentDashboard, lessonDetailView, quizView, quizResultsView].forEach(
    (view) => {
      if (view) view.style.display = "none";
    }
  );
  if (viewToShow) viewToShow.style.display = "block";
}

// --- Local Storage ---
function saveStateToLocalStorage() {
  localStorage.setItem("lessonStates", JSON.stringify(lessonStates));
  localStorage.setItem("currentLesson", JSON.stringify(currentLessonData));
}

function loadStateFromLocalStorage() {
  const savedStates = localStorage.getItem("lessonStates");
  if (savedStates) {
    lessonStates = JSON.parse(savedStates);
  }
  const savedLesson = localStorage.getItem("currentLesson");
  if (savedLesson) {
    currentLessonData = JSON.parse(savedLesson);
  }
}

// --- Data Fetching ---
async function fetchLessons() {
  try {
    const lessonsCollection = collection(db, "lessons");
    const lessonSnapshot = await getDocs(lessonsCollection);
    return lessonSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error("Error fetching lessons:", error);
    return [];
  }
}

async function fetchQuestionsForLesson(lessonId) {
  const q = query(collection(db, `lessons/${lessonId}/questions`), limit(10));
  const questionsSnapshot = await getDocs(q);
  return questionsSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  }));
}

async function fetchStudentProgress(lessonId) {
  if (!currentUser) return null;
  const progressRef = doc(db, `users/${currentUser.uid}/progress`, lessonId);
  const progressSnap = await getDoc(progressRef);
  return progressSnap.exists() ? progressSnap.data() : null;
}

// --- Rendering ---
async function renderLessonList() {
  const lessons = await fetchLessons();
  lessonListContainer.innerHTML = "";
  if (!lessons.length) {
    lessonListContainer.innerHTML = "<p>Žiadne lekcie neboli nájdené.</p>";
    return;
  }

  const progressPromises = lessons.map((lesson) =>
    fetchStudentProgress(lesson.id)
  );
  const progresses = await Promise.all(progressPromises);

  lessons.forEach((lesson, index) => {
    const progress = progresses[index];
    const lessonElement = document.createElement("div");
    lessonElement.className =
      "lesson-item p-4 bg-white rounded-lg shadow cursor-pointer hover:bg-gray-50 transition-colors duration-200";

    let statusHTML =
      '<span class="text-sm text-gray-500 font-medium">Nezapočaté</span>';
    if (progress) {
      if (progress.completed) {
        const scoreColor =
          progress.score >= 80 ?
          "text-green-600" :
          progress.score >= 50 ?
          "text-yellow-600" :
          "text-red-600";
        statusHTML = `<span class="text-sm ${scoreColor} font-bold">Dokončené (Skóre: ${progress.score}%)</span>`;
      } else if (progress.quizStarted) {
        statusHTML =
          '<span class="text-sm text-blue-600 font-semibold">Kvíz rozpísaný</span>';
      }
    }

    lessonElement.innerHTML = `
            <div class="flex justify-between items-center">
                <h3 class="text-xl font-bold text-gray-800">${lesson.title}</h3>
                ${statusHTML}
            </div>
            <p class="text-gray-600 mt-1">${
              lesson.description || "Popis nie je k dispozícii."
            }</p>
        `;
    lessonElement.addEventListener("click", () => showLessonDetail(lesson.id));
    lessonListContainer.appendChild(lessonElement);
  });
}

async function showLessonDetail(lessonId) {
  try {
    const lessonRef = doc(db, "lessons", lessonId);
    const lessonSnap = await getDoc(lessonRef);

    if (lessonSnap.exists()) {
      currentLessonData = {
        id: lessonSnap.id,
        ...lessonSnap.data()
      };
      lessonContent.innerHTML = `
                <h2 class="text-3xl font-bold mb-4 text-gray-900">${
                  currentLessonData.title
                }</h2>
                <div class="prose max-w-none prose-lg">${
                  currentLessonData.content
                }</div>
            `;
      setupAiAssistant(currentLessonData);
      showView(lessonDetailView);
      saveStateToLocalStorage();
    } else {
      console.error("Lesson not found!");
      alert("Lekcia nebola nájdená.");
    }
  } catch (error) {
    console.error("Error showing lesson detail:", error);
  }
}

function renderOverviewScreen() {
  currentLessonData = null; // Clear current lesson
  localStorage.removeItem("currentLesson");
  showView(studentDashboard);
  renderLessonList(); // Vždy obnoví zoznam lekcií pri návrate
}

// --- Quiz Logic ---
async function startQuiz() {
  if (!currentLessonData) return;
  currentQuestions = await fetchQuestionsForLesson(currentLessonData.id);
  if (currentQuestions.length === 0) {
    alert("Pre túto lekciu neboli nájdené žiadne otázky.");
    return;
  }

  renderQuiz(currentQuestions);
  showView(quizView);

  if (currentUser) {
    const progressRef = doc(
      db,
      `users/${currentUser.uid}/progress`,
      currentLessonData.id
    );
    await setDoc(
      progressRef, {
        lessonId: currentLessonData.id,
        quizStarted: true,
        startedAt: serverTimestamp(),
        completed: false, // Ensure not marked as completed yet
      }, {
        merge: true
      }
    );
  }
}

function renderQuiz(questions) {
  quizContainer.innerHTML = "";
  questions.forEach((q, index) => {
    const questionElement = document.createElement("div");
    questionElement.className = "mb-8 p-4 border border-gray-200 rounded-lg";
    const optionsHTML = q.options
      .map(
        (option, i) => `
            <label class="block mt-2 p-3 rounded-md hover:bg-gray-100 cursor-pointer">
                <input type="radio" name="question-${index}" value="${i}" class="mr-3">
                <span>${option}</span>
            </label>
        `
      )
      .join("");
    questionElement.innerHTML = `
            <p class="font-semibold text-lg text-gray-800">${index + 1}. ${
      q.question
    }</p>
            <div class="mt-3">${optionsHTML}</div>
        `;
    quizContainer.appendChild(questionElement);
  });

  const submitButton = document.createElement("button");
  submitButton.textContent = "Odoslať kvíz";
  submitButton.className =
    "w-full mt-6 py-3 px-4 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-105";
  submitButton.onclick = submitQuiz;
  quizContainer.appendChild(submitButton);
}

async function submitQuiz() {
  let score = 0;
  let allAnswered = true;
  currentQuestions.forEach((q, index) => {
    const selectedOption = document.querySelector(
      `input[name="question-${index}"]:checked`
    );
    if (!selectedOption) {
      allAnswered = false;
    } else if (parseInt(selectedOption.value) === q.correctAnswer) {
      score++;
    }
  });

  if (!allAnswered) {
    alert("Prosím, zodpovedajte všetky otázky pred odoslaním.");
    return;
  }

  const percentage = Math.round((score / currentQuestions.length) * 100);
  quizScore.textContent = `Vaše skóre: ${score} z ${currentQuestions.length} (${percentage}%)`;

  showView(quizResultsView);

  if (currentUser && currentLessonData) {
    const progressRef = doc(
      db,
      `users/${currentUser.uid}/progress`,
      currentLessonData.id
    );
    await updateDoc(progressRef, {
      completed: true,
      score: percentage,
      completedAt: serverTimestamp(),
    });
  }
}

// --- AI Assistant ---
function setupAiAssistant(lessonData) {
  const askAiBtn = aiAssistantContainer.querySelector("#ask-ai-btn");
  const aiQuestionInput = aiAssistantContainer.querySelector("#ai-question");
  const aiResponseContainer =
    aiAssistantContainer.querySelector("#ai-response");

  const newAskAiBtn = askAiBtn.cloneNode(true);
  askAiBtn.parentNode.replaceChild(newAskAiBtn, askAiBtn);

  newAskAiBtn.addEventListener("click", async () => {
    const userQuestion = aiQuestionInput.value.trim();
    if (userQuestion) {
      aiResponseContainer.textContent = "Odpoveď sa generuje...";
      try {
        // OPRAVA: Volanie funkcie s jedným objektom
        const result = await getAiAssistantResponse({
          lessonId: lessonData.id,
          userQuestion: userQuestion,
        });

        if (result && result.success) {
          aiResponseContainer.textContent = result.response;
        } else {
          aiResponseContainer.textContent =
            "Chyba: " + (result.error || "Neznáma chyba.");
        }
      } catch (error) {
        console.error("Chyba pri komunikácii s AI asistentom:", error);
        aiResponseContainer.textContent =
          "Nepodarilo sa získať odpoveď. Skúste to znova.";
      }
    }
  });
}

// --- Event Listeners ---
function setupEventListeners() {
  if (backToOverviewBtn) {
    // OPRAVA: Listener pre tlačidlo "Späť na prehľad"
    backToOverviewBtn.addEventListener("click", renderOverviewScreen);
  }
  if (startQuizBtn) {
    startQuizBtn.addEventListener("click", startQuiz);
  }
  if (retakeQuizBtn) {
    retakeQuizBtn.addEventListener("click", startQuiz);
  }
  if (backToLessonBtn) {
    backToLessonBtn.addEventListener("click", () => showView(lessonDetailView));
  }
}

// --- Initialization ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loadStateFromLocalStorage();
    if (currentLessonData) {
      showLessonDetail(currentLessonData.id);
    } else {
      renderOverviewScreen();
    }
    setupEventListeners();
  } else {
    currentUser = null;
    const mainContent = document.querySelector("main");
    if (mainContent) mainContent.style.display = "none";
    console.log("Používateľ nie je prihlásený.");
    // Prípadné presmerovanie na prihlásenie
    // window.location.href = '/';
  }
});

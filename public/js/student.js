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
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { getAiAssistantResponse } from "./gemini-api.js";

const auth = getAuth();
const db = getFirestore();

// --- Zobrazenia ---
const studentDashboard = document.getElementById("student-dashboard");
const lessonDetailView = document.getElementById("lesson-detail");
const lessonContent = document.getElementById("lesson-content");
const backToOverviewBtn = document.getElementById("back-to-overview");
const lessonListContainer = document.getElementById("lesson-list-container");
const aiAssistantContainer = document.getElementById("ai-assistant-container");

// --- Načítanie a zobrazenie lekcií ---
async function fetchLessons() {
  const lessonsCollection = collection(db, "lessons");
  const lessonSnapshot = await getDocs(lessonsCollection);
  const lessons = lessonSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  return lessons;
}

function renderLessonList(lessons) {
  lessonListContainer.innerHTML = ""; // Vyčistenie zoznamu
  lessons.forEach((lesson) => {
    const lessonElement = document.createElement("div");
    lessonElement.className = "lesson-item"; // Pridanie triedy pre štýlovanie
    lessonElement.innerHTML = `<h3>${lesson.title}</h3>`;
    lessonElement.addEventListener("click", () => showLessonDetail(lesson.id));
    lessonListContainer.appendChild(lessonElement);
  });
}

// --- Zobrazenie detailu lekcie a AI asistenta ---
async function showLessonDetail(lessonId) {
  const lessonRef = doc(db, "lessons", lessonId);
  const lessonSnap = await getDoc(lessonRef);

  if (lessonSnap.exists()) {
    const lessonData = { id: lessonSnap.id, ...lessonSnap.data() };
    lessonContent.innerHTML = `
      <h2>${lessonData.title}</h2>
      <div>${lessonData.content}</div>
    `;

    // Zobrazenie detailu lekcie a skrytie prehľadu
    studentDashboard.style.display = "none";
    lessonDetailView.style.display = "block";

    // Nastavenie AI asistenta
    setupAiAssistant(lessonData);
  } else {
    console.error("Lekcia nebola nájdená!");
  }
}

// --- Prehľad lekcií ---
function renderOverviewScreen() {
    studentDashboard.style.display = 'block';
    lessonDetailView.style.display = 'none';
    fetchAndRenderLessons(); // Opätovné načítanie a vykreslenie lekcií
}


async function fetchAndRenderLessons() {
  const lessons = await fetchLessons();
  renderLessonList(lessons);
}


// --- AI Asistent ---
function setupAiAssistant(lessonData) {
  const askAiBtn = aiAssistantContainer.querySelector("#ask-ai-btn");
  const aiQuestionInput = aiAssistantContainer.querySelector("#ai-question");
  const aiResponseContainer = aiAssistantContainer.querySelector("#ai-response");

  // Odstránenie starých event listenerov, aby sa predišlo ich duplicite
  const newAskAiBtn = askAiBtn.cloneNode(true);
  askAiBtn.parentNode.replaceChild(newAskAiBtn, askAiBtn);

  newAskAiBtn.addEventListener("click", async () => {
    const userQuestion = aiQuestionInput.value.trim();
    if (userQuestion) {
      try {
        // Opravené volanie funkcie
        const result = await getAiAssistantResponse({
          lessonId: lessonData.id,
          userQuestion: userQuestion,
        });

        if (result.success) {
          aiResponseContainer.textContent = result.response;
        } else {
          aiResponseContainer.textContent = "Chyba: " + result.error;
        }
      } catch (error) {
        console.error("Chyba pri komunikácii s AI asistentom:", error);
        aiResponseContainer.textContent =
          "Nepodarilo sa získať odpoveď. Skúste to znova.";
      }
    }
  });
}

// --- Inicializácia ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Ak je používateľ prihlásený, zobraz prehľad lekcií
    renderOverviewScreen();
  } else {
    // Ak používateľ nie je prihlásený, presmeruj na prihlásenie
    window.location.href = "/";
  }
});

// Event listener pre tlačidlo "Späť na prehľad"
if (backToOverviewBtn) {
  backToOverviewBtn.addEventListener("click", renderOverviewScreen);
}

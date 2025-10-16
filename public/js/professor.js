import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  getDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

const db = getFirestore();

async function getProfessorIdByUid(uid) {
  const professorsCol = collection(db, "professors");
  const q = query(professorsCol, where("uid", "==", uid));
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    return querySnapshot.docs[0].id;
  }
  return null;
}

export async function createLesson(lessonData) {
  try {
    const docRef = await addDoc(collection(db, "lessons"), lessonData);
    console.log("Lesson written with ID: ", docRef.id);
  } catch (e) {
    console.error("Error adding document: ", e);
  }
}

export async function getLessons(professorId) {
  const lessonsCol = collection(db, "lessons");
  const q = query(lessonsCol, where("professorId", "==", professorId));
  const lessonSnapshot = await getDocs(q);
  const lessonList = lessonSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  return lessonList;
}

export async function deleteLesson(lessonId) {
    const lessonRef = doc(db, "lessons", lessonId);
    const lessonSnap = await getDoc(lessonRef);
    const lessonToDelete = lessonSnap.data();

    // Získání a smazání všech interakcí spojených s lekcí
    const interactionsQuery = query(collection(db, "interactions"), where("lessonId", "==", lessonId));
    const interactionsSnapshot = await getDocs(interactionsQuery);
    const deletePromises = interactionsSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    console.log(`Všechny interakce pro lekci ${lessonId} byly smazány.`);

    if (confirm(`Opravdu chcete trvale smazat lekci "${lessonToDelete.title}"? Tato akce je nevratná.`)) {
        await deleteDoc(lessonRef);
        console.log("Lekce úspěšně smazána");
        return true;
    }
    return false;
}


export async function getProfessorName(professorId) {
  const professorRef = doc(db, "professors", professorId);
  const professorSnap = await getDoc(professorRef);

  if (professorSnap.exists()) {
    return professorSnap.data().name;
  } else {
    console.log("No such document!");
    return null;
  }
}

export async function initProfessorHomePage(user) {
  const professorId = await getProfessorIdByUid(user.uid);
  if (!professorId) {
    console.error("Professor not found for UID:", user.uid);
    return;
  }
  const professorName = await getProfessorName(professorId);
  document.getElementById(
    "professor-name"
  ).textContent = `Vítejte, ${professorName}`;
  const lessons = await getLessons(professorId);
  displayLessons(lessons, professorId);
}

function displayLessons(lessons, professorId) {
  const mainArea = document.getElementById("main-area");
  let lessonsHtml = `<div class="p-8"><h2 class="text-2xl font-bold mb-4">Moje lekce</h2><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">`;
  lessons.forEach((lesson) => {
    lessonsHtml += `
      <div class="bg-white p-4 rounded-lg shadow relative">
        <h3 class="text-xl font-bold">${lesson.title}</h3>
        <p>${lesson.description}</p>
        <button class="delete-lesson-btn absolute top-2 right-2 text-red-500 hover:text-red-700" data-lesson-id="${lesson.id}">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
    `;
  });
  lessonsHtml += `</div></div>`;
  mainArea.innerHTML = lessonsHtml;

  // Add event listeners to delete buttons
  document.querySelectorAll(".delete-lesson-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const lessonId = event.currentTarget.getAttribute("data-lesson-id");
      const deleted = await deleteLesson(lessonId);
      if (deleted) {
        initProfessorHomePage({ uid: localStorage.getItem("userUID") }); // Refresh the list
      }
    });
  });
}

export function setupProfessorNavigation(user) {
  const navLinks = document.querySelectorAll("#sidebar-nav a");
  const mainArea = document.getElementById("main-area");
  const professorId = getProfessorIdByUid(user.uid);

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const target = link.getAttribute("data-target");

      if (target === "dashboard") {
        initProfessorHomePage(user);
      } else if (target === "analysis") {
        mainArea.innerHTML = `<p class="p-8">Sekce Analýza se připravuje.</p>`;
      } else if (target === "students") {
        mainArea.innerHTML = `<p class="p-8">Sekce Studenti se připravuje.</p>`;
      }
      // Pροσθέστε další else if pro ostatní sekce
    });
  });
}

// Funkce pro aktualizaci obsahu na základě hashe v URL
export function updateContentForHash(user) {
  const hash = window.location.hash;
  const mainArea = document.getElementById("main-area");

  switch (hash) {
      case '#dashboard':
          initProfessorHomePage(user);
          break;
      case '#analysis':
          mainArea.innerHTML = `<p class="p-8">Sekce Analýza se připravuje.</p>`;
          break;
      case '#students':
          mainArea.innerHTML = `<p class="p-8">Sekce Studenti se připravuje.</p>`;
          break;
      default:
          initProfessorHomePage(user); // Výchozí zobrazení
          break;
  }
}

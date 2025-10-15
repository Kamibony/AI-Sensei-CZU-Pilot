import { db } from './firebase-init.js';
import { collection, addDoc, getDocs, serverTimestamp, doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
import { setupNavigation } from './views/professor/navigation.js';
import { renderTimeline } from './views/professor/timeline-view.js';
import { renderStudents } from './views/professor/students-view.js';
import { renderInteractions } from './views/professor/interactions-view.js';
import { renderStudentProfile } from './views/professor/student-profile-view.js';

export async function initProfessorDashboard() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    // Load initial view
    mainContent.innerHTML = `<h2>Načítání...</h2>`;
    
    const lessons = await fetchLessons();
    setupNavigation(lessons);
    
    // Default view
    renderTimeline(lessons);
}


async function fetchLessons() {
    try {
        const querySnapshot = await getDocs(collection(db, "lessons"));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching lessons: ", error);
        showToast("Nepodařilo se načíst lekce.", true);
        return [];
    }
}

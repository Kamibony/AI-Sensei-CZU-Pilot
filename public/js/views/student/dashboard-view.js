import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { setCurrentLessonId, showStudentContent } from "../../student.js";

export async function renderDashboard(container, db, studentData) {
    if (!studentData || !studentData.courseId) {
        container.innerHTML = `<p class="p-4">Chyba: Chybí informace o kurzu studenta.</p>`;
        return;
    }

    try {
        container.innerHTML = `<div class="p-4">Načítání lekcí...</div>`;

        const lessonsQuery = query(
            collection(db, "lessons"),
            where("courseId", "==", studentData.courseId),
            orderBy("order")
        );

        const querySnapshot = await getDocs(lessonsQuery);
        const lessons = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        let lessonsHtml = `
            <div class="p-6">
                <h1 class="text-3xl font-bold text-slate-800 mb-2">Vítejte zpět, ${studentData.name}!</h1>
                <p class="text-slate-500 mb-6">Zde je přehled vašich lekcí v kurzu.</p>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        `;

        if (lessons.length === 0) {
            lessonsHtml += `<p>Pro tento kurz nebyly nalezeny žádné lekce.</p>`;
        } else {
            lessons.forEach(lesson => {
                lessonsHtml += `
                    <div class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer lesson-card" data-lesson-id="${lesson.id}">
                        <h2 class="text-xl font-bold text-slate-800 mb-2">${lesson.title}</h2>
                        <p class="text-slate-600">${lesson.description || 'Popis není k dispozici.'}</p>
                    </div>
                `;
            });
        }

        lessonsHtml += `</div></div>`;
        container.innerHTML = lessonsHtml;

        document.querySelectorAll('.lesson-card').forEach(card => {
            card.addEventListener('click', () => {
                const lessonId = card.dataset.lessonId;
                setCurrentLessonId(lessonId);
                showStudentContent('lesson');
            });
        });

    } catch (error) {
        console.error("Chyba při načítání lekcí:", error);
        container.innerHTML = `<p class="p-4 text-red-500">Nepodařilo se načíst lekce. Zkuste to prosím znovu.</p>`;
    }
}

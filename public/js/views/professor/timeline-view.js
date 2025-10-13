import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from '../../utils.js';

function getLocalizedDate(offsetDays = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return date.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' });
}

async function updateAllOrderIndexes(db) {
    const timelineContainer = document.getElementById('timeline-container');
    if (!timelineContainer) return;

    const allEvents = Array.from(timelineContainer.querySelectorAll('.lesson-bubble'));
    const batch = writeBatch(db);

    allEvents.forEach((item, index) => {
        const eventId = item.dataset.eventId;
        if (eventId) {
            const docRef = doc(db, 'timeline_events', eventId);
            batch.update(docRef, { orderIndex: index });
        }
    });

    try {
        await batch.commit();
    } catch (error) {
        console.error("Error updating order indexes:", error);
    }
}

function renderScheduledEvent(event, lessonsData, db) {
    const lesson = lessonsData.find(l => l.id === event.lessonId);
    if (!lesson) return document.createElement('div');

    const el = document.createElement('div');
    el.className = 'lesson-bubble p-3 rounded-lg shadow-sm flex items-center justify-between border bg-green-50 text-green-800 border-green-200 cursor-grab';
    el.dataset.eventId = event.id;
    el.dataset.lessonId = event.lessonId;
    el.innerHTML = `
        <div class="flex items-center space-x-3 flex-grow">
            <span class="text-xl">${lesson.icon}</span>
            <span class="font-semibold text-sm">${lesson.title}</span>
        </div>
        <button class="delete-event-btn p-1 rounded-full hover:bg-red-200 text-slate-400 hover:text-red-600 transition-colors" title="Odebrat z plánu">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>`;

    el.querySelector('.delete-event-btn').addEventListener('click', async () => {
        if (confirm('Opravdu chcete odebrat tuto lekci z plánu?')) {
            try {
                await deleteDoc(doc(db, 'timeline_events', event.id));
                el.remove();
                showToast("Lekce byla odebrána z plánu.");
                await updateAllOrderIndexes(db);
            } catch (error) {
                console.error("Error deleting timeline event:", error);
                showToast("Chyba při odstraňování události.", true);
            }
        }
    });
    return el;
}

async function handleLessonDrop(evt, db, lessonsData) {
    const lessonId = evt.item.dataset.lessonId;
    const dayIndex = evt.to.closest('.day-slot').dataset.dayIndex;
    const tempEl = evt.item;

    tempEl.innerHTML = `Načítám...`;

    try {
        const newEventData = {
            lessonId: lessonId,
            dayIndex: parseInt(dayIndex),
            createdAt: serverTimestamp(),
            orderIndex: 0
        };
        const docRef = await addDoc(collection(db, 'timeline_events'), newEventData);

        const newElement = renderScheduledEvent({ id: docRef.id, ...newEventData }, lessonsData, db);
        evt.item.parentNode.replaceChild(newElement, evt.item);

        showToast("Lekce naplánována.");
        await updateAllOrderIndexes(db);

    } catch (error) {
        console.error("Error scheduling lesson:", error);
        showToast("Chyba při plánování lekce.", true);
        tempEl.remove();
    }
}

async function handleLessonMove(evt, db) {
    const eventId = evt.item.dataset.eventId;
    const newDayIndex = evt.to.closest('.day-slot').dataset.dayIndex;

    try {
        const docRef = doc(db, 'timeline_events', eventId);
        await updateDoc(docRef, { dayIndex: parseInt(newDayIndex) });
        await updateAllOrderIndexes(db);
    } catch (error) {
        console.error("Error moving lesson:", error);
        showToast("Chyba při přesouvání lekce.", true);
    }
}

export async function renderTimeline(container, db, lessonsData) {
    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white">
            <h1 class="text-3xl font-extrabold text-slate-800">Plán výuky</h1>
            <p class="text-slate-500 mt-1">Naplánujte lekce přetažením z knihovny vlevo.</p>
        </header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6">
            <div id="timeline-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"></div>
        </div>
    `;

    const timelineContainer = container.querySelector('#timeline-container');
    const q = query(collection(db, 'timeline_events'), orderBy("orderIndex"));
    const querySnapshot = await getDocs(q);
    const timelineEvents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    for (let i = 0; i < 10; i++) {
        const dayWrapper = document.createElement('div');
        dayWrapper.className = 'day-slot bg-white rounded-xl p-3 border-2 border-transparent transition-colors min-h-[200px] shadow-sm flex flex-col';
        dayWrapper.dataset.dayIndex = i;

        const dateStr = getLocalizedDate(i);
        dayWrapper.innerHTML = `
            <div class="text-center pb-2 mb-2 border-b border-slate-200">
                <p class="font-bold text-slate-700">${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}</p>
            </div>
            <div class="lessons-container flex-grow space-y-2"></div>
        `;
        timelineContainer.appendChild(dayWrapper);
    }

    timelineEvents.forEach(event => {
        const dayIndex = event.dayIndex || 0;
        const daySlot = timelineContainer.querySelector(`.day-slot[data-day-index='${dayIndex}'] .lessons-container`);
        if (daySlot) {
            daySlot.appendChild(renderScheduledEvent(event, lessonsData, db));
        }
    });

    timelineContainer.querySelectorAll('.day-slot .lessons-container').forEach(lessonsContainer => {
        if (typeof Sortable !== 'undefined') {
            new Sortable(lessonsContainer, {
                group: 'lessons',
                animation: 150,
                ghostClass: 'opacity-50',
                onAdd: (evt) => handleLessonDrop(evt, db, lessonsData),
                onUpdate: (evt) => handleLessonMove(evt, db)
            });
        }
    });
}

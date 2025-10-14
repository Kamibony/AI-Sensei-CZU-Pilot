import { doc, setDoc, deleteDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from '../../utils.js';
import { db } from '../../firebase-init.js';

let timelineEvents = [];

export async function setupTimelineView(mainArea, lessons) {
    await renderTimeline(mainArea, db, lessons);
}

export async function renderTimeline(container, db, lessonsData) {
    try {
        const timelineSnapshot = await getDocs(collection(db, 'timeline_events'));
        timelineEvents = timelineSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        timelineEvents.sort((a, b) => a.orderIndex - b.orderIndex);
    } catch (error) {
        console.error("Error fetching timeline events: ", error);
        showToast("Nepodařilo se načíst události časové osy.", true);
    }
    
    const timelineHtml = timelineEvents.map(event => {
        const lesson = lessonsData.find(l => l.id === event.lessonId);
        if (!lesson) return '';
        return `
            <div class="timeline-event-bubble bg-white p-4 border rounded-lg" data-lesson-id="${lesson.id}">
                <h4 class="font-semibold text-slate-800">${lesson.title}</h4>
                <p class="text-sm text-slate-500">${lesson.subtitle || ''}</p>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white">
            <h1 class="text-3xl font-extrabold text-slate-800">Časová osa kurzu</h1>
            <p class="text-slate-500 mt-1">Uspořádejte lekce tak, jak je studenti uvidí.</p>
        </header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6">
            <div id="timeline-drop-area" class="min-h-[400px] bg-slate-100 rounded-2xl p-4 space-y-2">
                ${timelineHtml}
            </div>
        </div>
    `;

    const dropArea = container.querySelector('#timeline-drop-area');
    if (dropArea && typeof Sortable !== 'undefined') {
        new Sortable(dropArea, {
            group: 'lessons',
            animation: 150,
            onAdd: async function (evt) {
                const lessonId = evt.item.dataset.lessonId;
                const newIndex = evt.newDraggableIndex;

                const newEvent = {
                    lessonId: lessonId,
                    orderIndex: newIndex,
                    type: 'lesson',
                };
                
                try {
                    const newEventRef = doc(collection(db, 'timeline_events'));
                    await setDoc(newEventRef, newEvent);
                    
                    timelineEvents.splice(newIndex, 0, { id: newEventRef.id, ...newEvent });
                    
                    await updateOrderIndexesAfterAdd(newIndex);
                    
                    showToast('Lekce přidána na časovou osu.');
                } catch (error) {
                    console.error("Error adding event to timeline: ", error);
                    showToast("Chyba při přidávání lekce.", true);
                    evt.item.remove();
                }
            },
            onUpdate: async function (evt) {
                const lessonId = evt.item.dataset.lessonId;
                const oldIndex = evt.oldDraggableIndex;
                const newIndex = evt.newDraggableIndex;

                const eventToMove = timelineEvents.find(e => e.lessonId === lessonId);
                if (!eventToMove) return;

                timelineEvents.splice(oldIndex, 1);
                timelineEvents.splice(newIndex, 0, eventToMove);

                try {
                    await updateAllOrderIndexes();
                    showToast('Pořadí lekcí bylo aktualizováno.');
                } catch (error) {
                     console.error("Error updating timeline order: ", error);
                     showToast("Chyba při aktualizaci pořadí.", true);
                }
            },
        });
    }
}

async function updateOrderIndexesAfterAdd(startIndex) {
    for (let i = startIndex + 1; i < timelineEvents.length; i++) {
        const event = timelineEvents[i];
        event.orderIndex = i;
        const eventRef = doc(db, 'timeline_events', event.id);
        await setDoc(eventRef, { orderIndex: i }, { merge: true });
    }
}

async function updateAllOrderIndexes() {
    for (let i = 0; i < timelineEvents.length; i++) {
        const event = timelineEvents[i];
        event.orderIndex = i;
        const eventRef = doc(db, 'timeline_events', event.id);
        await setDoc(eventRef, { orderIndex: i }, { merge: true });
    }
}

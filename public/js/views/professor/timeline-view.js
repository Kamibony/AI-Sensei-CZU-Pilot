// public/js/views/professor/timeline-view.js
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from '../../utils.js';
import * as firebaseInit from '../../firebase-init.js'; // Potrebujeme prístup k db

export class ProfessorTimelineView extends LitElement {
    static properties = {
        lessonsData: { type: Array },
        _timelineEvents: { state: true, type: Array },
    };

    constructor() {
        super();
        this.lessonsData = [];
        this._timelineEvents = [];
    }

    connectedCallback() {
        super.connectedCallback();
        this._fetchTimelineEvents();
    }

    async _fetchTimelineEvents() {
        try {
            const q = query(collection(firebaseInit.db, 'timeline_events'), orderBy("orderIndex"));
            const querySnapshot = await getDocs(q);
            this._timelineEvents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching timeline events:", error);
            showToast("Chyba při načítání plánu.", true);
        }
    }

    _getLocalizedDate(offsetDays = 0) {
        const date = new Date();
        date.setDate(date.getDate() + offsetDays);
        return date.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' });
    }

    async _updateAllOrderIndexes() {
        const timelineContainer = this.shadowRoot.getElementById('timeline-container');
        if (!timelineContainer) return;

        const allEvents = Array.from(timelineContainer.querySelectorAll('.lesson-bubble'));
        const batch = writeBatch(firebaseInit.db);

        allEvents.forEach((item, index) => {
            const eventId = item.dataset.eventId;
            if (eventId) {
                const docRef = doc(firebaseInit.db, 'timeline_events', eventId);
                batch.update(docRef, { orderIndex: index });
            }
        });

        try {
            await batch.commit();
        } catch (error) {
            console.error("Error updating order indexes:", error);
        }
    }

    _renderScheduledEvent(event) {
        const lesson = this.lessonsData.find(l => l.id === event.lessonId);
        if (!lesson) return '';

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
                const lessonId = el.dataset.lessonId; 
                try {
                    await deleteDoc(doc(firebaseInit.db, 'timeline_events', event.id));
                    
                    const q = query(collection(firebaseInit.db, 'timeline_events'), where("lessonId", "==", lessonId));
                    const snapshot = await getDocs(q);

                    if (snapshot.empty) {
                        try {
                            const lessonRef = doc(firebaseInit.db, 'lessons', lessonId);
                            await updateDoc(lessonRef, { isScheduled: false });
                            showToast("Lekce byla odebrána z plánu a odznačena.");
                        } catch (lessonError) {
                            console.error("Error un-scheduling lesson:", lessonError);
                            showToast("Lekce odebrána, ale nepodařilo se odznačit.", true);
                        }
                    } else {
                        showToast("Lekce byla odebrána z plánu.");
                    }
                    
                    await this._updateAllOrderIndexes();
                    this._fetchTimelineEvents(); // Refresh view
                    
                } catch (error) {
                    console.error("Error deleting timeline event:", error);
                    showToast("Chyba při odstraňování události.", true);
                }
            }
        });
        return el;
    }

    async _handleLessonDrop(evt) {
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
            const docRef = await addDoc(collection(firebaseInit.db, 'timeline_events'), newEventData);

            try {
                const lessonRef = doc(firebaseInit.db, 'lessons', lessonId);
                await updateDoc(lessonRef, { isScheduled: true });
            } catch (lessonError) {
                console.error("Error flagging lesson as scheduled:", lessonError);
                showToast("Chyba při označování lekce. Zkuste znovu.", true);
            }

            const newElement = this._renderScheduledEvent({ id: docRef.id, ...newEventData });
            evt.item.parentNode.replaceChild(newElement, evt.item);

            showToast("Lekce naplánována.");
            await this._updateAllOrderIndexes();

        } catch (error) {
            console.error("Error scheduling lesson:", error);
            showToast("Chyba při plánování lekce.", true);
            tempEl.remove();
        }
    }

    async _handleLessonMove(evt) {
        const eventId = evt.item.dataset.eventId;
        const newDayIndex = evt.to.closest('.day-slot').dataset.dayIndex;

        try {
            const docRef = doc(firebaseInit.db, 'timeline_events', eventId);
            await updateDoc(docRef, { dayIndex: parseInt(newDayIndex) });
            await this._updateAllOrderIndexes();
        } catch (error) {
            console.error("Error moving lesson:", error);
            showToast("Chyba při přesouvání lekce.", true);
        }
    }

    firstUpdated() {
        const timelineContainer = this.shadowRoot.getElementById('timeline-container');
        if (!timelineContainer) return;

        // Vykreslíme sloty pre dni
        for (let i = 0; i < 10; i++) {
            const dayWrapper = document.createElement('div');
            dayWrapper.className = 'day-slot bg-white rounded-xl p-3 border-2 border-transparent transition-colors min-h-[200px] shadow-sm flex flex-col';
            dayWrapper.dataset.dayIndex = i;

            const dateStr = this._getLocalizedDate(i);
            dayWrapper.innerHTML = `
                <div class="text-center pb-2 mb-2 border-b border-slate-200">
                    <p class="font-bold text-slate-700">${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}</p>
                </div>
                <div class="lessons-container flex-grow space-y-2"></div>
            `;
            timelineContainer.appendChild(dayWrapper);
        }

        // Vložíme načítané udalosti
        this._timelineEvents.forEach(event => {
            const dayIndex = event.dayIndex || 0;
            const daySlot = timelineContainer.querySelector(`.day-slot[data-day-index='${dayIndex}'] .lessons-container`);
            if (daySlot) {
                daySlot.appendChild(this._renderScheduledEvent(event));
            }
        });

        // Inicializujeme Sortable
        timelineContainer.querySelectorAll('.day-slot .lessons-container').forEach(lessonsContainer => {
            if (typeof Sortable !== 'undefined') {
                new Sortable(lessonsContainer, {
                    group: 'lessons',
                    animation: 150,
                    ghostClass: 'opacity-50',
                    onAdd: (evt) => this._handleLessonDrop(evt),
                    onUpdate: (evt) => this._handleLessonMove(evt)
                });
            }
        });
    }

    render() {
        return html`
            <header class="text-center p-6 border-b border-slate-200 bg-white">
                <h1 class="text-3xl font-extrabold text-slate-800">Plán výuky</h1>
                <p class="text-slate-500 mt-1">Naplánujte lekce přetažením z knihovny vlevo.</p>
            </header>
            <div class="flex-grow overflow-y-auto p-4 md:p-6">
                <div id="timeline-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    </div>
            </div>
        `;
    }

    static styles = css`
        :host {
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 100%;
        }
        .flex-grow {
            flex: 1 1 auto;
        }
    `;
}

customElements.define('professor-timeline-view', ProfessorTimelineView);

// Ponechávame pôvodný export prázdny, aby sme nerozbili importy, kým nie sú všetky prerobené
// Alebo môžeme exportovať priamo komponent, ak vieme, že 'professor.js' bude upravený.
// Pre túto fázu je lepšie nechať pôvodné importy/exporty, ako boli.
// Tým, že sme súbor prerobili na komponent, pôvodný `export async function renderTimeline` už neexistuje.
// To je v poriadku, pretože `professor-app.js` ho už nebude volať.

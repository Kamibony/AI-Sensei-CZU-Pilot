// public/js/views/professor/timeline-view.js
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from '../../utils.js';
import * as firebaseInit from '../../firebase-init.js';

export class ProfessorTimelineView extends LitElement {
    static properties = {
        lessonsData: { type: Array },
        _timelineEvents: { state: true, type: Array },
    };

    createRenderRoot() { return this; }

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
            this._renderDaysAndEvents();
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
        const timelineContainer = this.querySelector('#timeline-container');
        if (!timelineContainer) return;

        const allEventElements = Array.from(timelineContainer.querySelectorAll('.lesson-bubble'));
        const batch = writeBatch(firebaseInit.db);
        let updatesMade = 0;

        allEventElements.forEach((item, index) => {
            const eventId = item.dataset.eventId;
            if (eventId) {
                const existsLocally = this._timelineEvents.some(event => event.id === eventId);
                if (existsLocally) {
                    const docRef = doc(firebaseInit.db, 'timeline_events', eventId);
                    batch.update(docRef, { orderIndex: index });
                    updatesMade++;
                }
            }
        });

        if (updatesMade > 0) {
            try {
                await batch.commit();
            } catch (error) {
                console.error("Error committing order index updates:", error);
            }
        }
    }

    _renderScheduledEvent(event) {
        const lesson = this.lessonsData.find(l => l.id === event.lessonId);
        if (!lesson) return null;

        const el = document.createElement('div');
        el.className = 'lesson-bubble p-3 rounded-lg shadow-sm flex items-center justify-between border bg-green-50 text-green-800 border-green-200 cursor-grab';
        el.dataset.eventId = event.id;
        el.dataset.lessonId = event.lessonId;
        el.innerHTML = `
            <div class="flex items-center space-x-3 flex-grow min-w-0"> <span class="text-xl flex-shrink-0">${lesson.icon}</span>
                <span class="font-semibold text-sm truncate" title="${lesson.title}">${lesson.title}</span> </div>
            <button class="delete-event-btn p-1 rounded-full hover:bg-red-200 text-slate-400 hover:text-red-600 transition-colors flex-shrink-0 ml-2" title="Odebrat z plánu">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>`;

        el.querySelector('.delete-event-btn').addEventListener('click', async () => {
            if (confirm('Opravdu chcete odebrat tuto lekci z plánu?')) {
                const lessonId = el.dataset.lessonId;
                const eventIdToDelete = event.id;

                try {
                    await deleteDoc(doc(firebaseInit.db, 'timeline_events', eventIdToDelete));
                    el.remove();
                    this._timelineEvents = this._timelineEvents.filter(ev => ev.id !== eventIdToDelete);

                    const otherInstancesExist = this._timelineEvents.some(ev => ev.lessonId === lessonId);
                    if (!otherInstancesExist) {
                        try {
                            await updateDoc(doc(firebaseInit.db, 'lessons', lessonId), { isScheduled: false });
                        } catch (e) { console.error(e); }
                    }
                    showToast("Lekce byla odebrána z plánu.");
                    await this._updateAllOrderIndexes();
                } catch (error) {
                    console.error("Error deleting timeline event:", error);
                    showToast("Chyba při odstraňování události.", true);
                    this._fetchTimelineEvents();
                }
            }
        });
        return el;
    }

    async _handleLessonDrop(evt) {
        const lessonId = evt.item.dataset.lessonId;
        const targetContainer = evt.to;
        const dayIndex = parseInt(targetContainer.closest('.day-slot').dataset.dayIndex);
        const tempEl = evt.item;
        const itemsInDay = Array.from(targetContainer.children);
        const newIndexInDay = itemsInDay.indexOf(tempEl);

        tempEl.innerHTML = `<div class="p-3 text-slate-400">Plánuji...</div>`;
        tempEl.classList.add('opacity-50');

        try {
             // Výpočet globálneho indexu
            const timelineContainer = this.querySelector('#timeline-container');
            const allEventElementsBefore = [];
            const daySlots = timelineContainer.querySelectorAll('.day-slot');
            for (let i = 0; i < daySlots.length; i++) {
                 const currentDayIndex = parseInt(daySlots[i].dataset.dayIndex);
                 const lessonsInSlot = daySlots[i].querySelectorAll('.lessons-container .lesson-bubble');
                 if (currentDayIndex < dayIndex) {
                     allEventElementsBefore.push(...lessonsInSlot);
                 } else if (currentDayIndex === dayIndex) {
                     lessonsInSlot.forEach((el, idx) => { if (idx < newIndexInDay) allEventElementsBefore.push(el); });
                     break;
                 }
            }
            const globalOrderIndex = allEventElementsBefore.length;

            const newEventData = { lessonId, dayIndex, createdAt: serverTimestamp(), orderIndex: globalOrderIndex };
            const docRef = await addDoc(collection(firebaseInit.db, 'timeline_events'), newEventData);

            try { await updateDoc(doc(firebaseInit.db, 'lessons', lessonId), { isScheduled: true }); } catch (e) { console.error(e); }

            const newDbEvent = { id: docRef.id, ...newEventData, orderIndex: globalOrderIndex };
            const newElement = this._renderScheduledEvent(newDbEvent);

            if(newElement) {
                 tempEl.parentNode.replaceChild(newElement, tempEl);
                 this._timelineEvents.splice(globalOrderIndex, 0, newDbEvent);
                 showToast("Lekce naplánována.");
            } else {
                 tempEl.remove(); throw new Error("Failed to render.");
            }
            await this._updateAllOrderIndexes();
        } catch (error) {
            console.error("Error scheduling:", error); showToast("Chyba při plánování.", true);
            tempEl.remove(); this._fetchTimelineEvents();
        }
    }

    async _handleLessonMove(evt) {
        const eventId = evt.item.dataset.eventId;
        const newDayIndex = parseInt(evt.to.closest('.day-slot').dataset.dayIndex);

        try {
            await updateDoc(doc(firebaseInit.db, 'timeline_events', eventId), { dayIndex: newDayIndex });
            const eventIndex = this._timelineEvents.findIndex(ev => ev.id === eventId);
            if (eventIndex > -1) this._timelineEvents[eventIndex].dayIndex = newDayIndex;
        } catch (error) {
            console.error("Error moving lesson:", error); showToast("Chyba při přesouvání.", true);
            this._fetchTimelineEvents(); return;
        }
        await this._updateAllOrderIndexes();
    }

    // NOVÁ METÓDA: Pridanie na prvý voľný slot (pre tlačidlo "+")
    async addLessonToFirstAvailableSlot(lesson) {
        if (!lesson || !lesson.id) return;

        // Nájdi posledný deň, kde je niečo naplánované, alebo prvý deň
        let targetDayIndex = 0;
        let maxOrderIndex = -1;
        
        if (this._timelineEvents.length > 0) {
             // Nájdeme najväčší dayIndex a orderIndex
             this._timelineEvents.forEach(ev => {
                 if (ev.dayIndex > targetDayIndex) targetDayIndex = ev.dayIndex;
                 if (ev.orderIndex > maxOrderIndex) maxOrderIndex = ev.orderIndex;
             });
             
             // Ak je posledný deň plný (napr. > 5 lekcií), skúsime ďalší deň, ak existuje (max 9)
             const eventsInLastDay = this._timelineEvents.filter(ev => ev.dayIndex === targetDayIndex).length;
             if (eventsInLastDay >= 5 && targetDayIndex < 9) {
                 targetDayIndex++;
             }
        }

        const newOrderIndex = maxOrderIndex + 1;
        const newEventData = {
            lessonId: lesson.id,
            dayIndex: targetDayIndex,
            createdAt: serverTimestamp(),
            orderIndex: newOrderIndex
        };

        try {
            // Optimistický UI update (ihneď zobrazíme placeholder)
            const daySlot = this.querySelector(`.day-slot[data-day-index='${targetDayIndex}'] .lessons-container`);
            let placeholderEl = null;
            if (daySlot) {
                placeholderEl = document.createElement('div');
                placeholderEl.className = 'p-3 text-slate-400 opacity-50 border border-dashed rounded-lg';
                placeholderEl.textContent = `Plánuji ${lesson.title}...`;
                daySlot.appendChild(placeholderEl);
                // Scroll na spodok, aby bolo vidno pridanie
                placeholderEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            const docRef = await addDoc(collection(firebaseInit.db, 'timeline_events'), newEventData);
            await updateDoc(doc(firebaseInit.db, 'lessons', lesson.id), { isScheduled: true });

            const newDbEvent = { id: docRef.id, ...newEventData };
            this._timelineEvents.push(newDbEvent); // Pridáme do lokálneho stavu
            
            // Nahradíme placeholder skutočným elementom
            if (placeholderEl && daySlot) {
                 const newElement = this._renderScheduledEvent(newDbEvent);
                 if (newElement) {
                     daySlot.replaceChild(newElement, placeholderEl);
                 } else {
                     placeholderEl.remove();
                 }
            } else {
                // Fallback ak placeholder nevyšiel (napr. rýchle prepnutie view)
                this._renderDaysAndEvents();
            }

            showToast(`Lekce "${lesson.title}" přidána na konec plánu.`);

        } catch (error) {
            console.error("Error auto-scheduling lesson:", error);
            showToast("Chyba při automatickém přidání lekce.", true);
            this._fetchTimelineEvents(); // Refresh pre istotu
        }
    }

    _renderDaysAndEvents() {
         const timelineContainer = this.querySelector('#timeline-container');
         if (!timelineContainer) return;
         timelineContainer.innerHTML = '';

        for (let i = 0; i < 10; i++) {
            const dayWrapper = document.createElement('div');
            dayWrapper.className = 'day-slot bg-white rounded-xl p-3 border-2 border-transparent transition-colors min-h-[150px] shadow-sm flex flex-col';
            dayWrapper.dataset.dayIndex = i;
            const dateStr = this._getLocalizedDate(i);
            dayWrapper.innerHTML = `
                <div class="text-center pb-2 mb-2 border-b border-slate-200 sticky top-0 bg-white z-10">
                    <p class="font-bold text-slate-700">${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}</p>
                </div>
                <div class="lessons-container flex-grow space-y-2 min-h-[50px]"></div>
            `;
            timelineContainer.appendChild(dayWrapper);
        }

        this._timelineEvents.sort((a,b) => a.orderIndex - b.orderIndex).forEach(event => {
            const daySlot = timelineContainer.querySelector(`.day-slot[data-day-index='${event.dayIndex ?? 0}'] .lessons-container`);
            if (daySlot) {
                const el = this._renderScheduledEvent(event);
                if (el) daySlot.appendChild(el);
            }
        });

        timelineContainer.querySelectorAll('.day-slot .lessons-container').forEach(c => {
            if (typeof Sortable !== 'undefined') {
                Sortable.get(c)?.destroy();
                new Sortable(c, { group: 'lessons', animation: 150, ghostClass: 'opacity-50', onAdd: (e) => this._handleLessonDrop(e), onUpdate: (e) => this._handleLessonMove(e) });
            }
        });
    }

    firstUpdated() { this._renderDaysAndEvents(); }

    render() {
        return html`
            <header class="text-center p-4 border-b border-slate-200 bg-white sticky top-0 z-20 shadow-sm">
                <h1 class="text-2xl font-extrabold text-slate-800">Plán výuky</h1>
                <p class="text-sm text-slate-500 mt-1">Táhni lekci nebo klikni na "+" pro rychlé přidání.</p>
            </header>
            <div class="flex-grow overflow-y-auto p-4 bg-slate-100 custom-scrollbar">
                <div id="timeline-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 pb-10">
                </div>
            </div>
        `;
    }
}

customElements.define('professor-timeline-view', ProfessorTimelineView);

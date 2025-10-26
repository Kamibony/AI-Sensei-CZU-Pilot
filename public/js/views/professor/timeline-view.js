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
            // Po načítaní nových udalostí resetujeme a znovu renderujeme dni a udalosti
            this._timelineEvents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this._renderDaysAndEvents(); // Zavoláme novú metódu na vykreslenie
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

        // Získame VŠETKY lesson-bubble elementy AKTUÁLNE v DOMe
        const allEventElements = Array.from(timelineContainer.querySelectorAll('.lesson-bubble'));
        const batch = writeBatch(firebaseInit.db);
        let updatesMade = 0;

        allEventElements.forEach((item, index) => {
            const eventId = item.dataset.eventId;
            // Dôležitá kontrola: Uistíme sa, že eventId existuje a nie je prázdny
            if (eventId) {
                // Skontrolujeme, či tento event stále existuje v našom lokálnom stave _timelineEvents
                // Toto pridáva ďalšiu vrstvu ochrany proti "duchom"
                const existsLocally = this._timelineEvents.some(event => event.id === eventId);
                if (existsLocally) {
                    const docRef = doc(firebaseInit.db, 'timeline_events', eventId);
                    batch.update(docRef, { orderIndex: index });
                    updatesMade++;
                } else {
                    console.warn(`Skipping update for potentially deleted event element: ${eventId}`);
                }
            } else {
                console.warn("Found lesson-bubble element without eventId during order update.");
            }
        });

        // Commitneme batch iba ak sme mali nejaké validné updaty
        if (updatesMade > 0) {
            try {
                await batch.commit();
                console.log(`Successfully updated orderIndex for ${updatesMade} events.`);
            } catch (error) {
                // Vypíšeme chybu, ale nespadneme - mohlo ísť o race condition
                console.error("Error committing order index updates:", error);
                // Môžeme skúsiť znova načítať dáta pre konzistenciu
                // this._fetchTimelineEvents();
            }
        } else {
            console.log("No valid order index updates to commit.");
        }
    }


    _renderScheduledEvent(event) {
        const lesson = this.lessonsData.find(l => l.id === event.lessonId);
        if (!lesson) return null; // Vrátime null, ak lekcia neexistuje

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
                const eventIdToDelete = event.id; // Uložíme si ID pred zmazaním elementu

                try {
                    // 1. Zmažeme dokument z DB
                    await deleteDoc(doc(firebaseInit.db, 'timeline_events', eventIdToDelete));

                    // === HLAVNÁ OPRAVA: Odstránime element z DOM *pred* volaním _updateAllOrderIndexes ===
                    el.remove();
                    // =================================================================================

                    // 2. Odstránime udalosť z lokálneho stavu, aby sme nemuseli volať _fetchTimelineEvents
                    this._timelineEvents = this._timelineEvents.filter(ev => ev.id !== eventIdToDelete);

                    // 3. Skontrolujeme, či existujú iné inštancie tejto lekcie v lokálnom stave
                    const otherInstancesExist = this._timelineEvents.some(ev => ev.lessonId === lessonId);

                    if (!otherInstancesExist) {
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

                    // 4. AŽ TERAZ aktualizujeme poradia ostatných elementov
                    await this._updateAllOrderIndexes();
                    // Po úspešnom zmazaní a update poradí už nemusíme volať _fetchTimelineEvents()

                } catch (error) {
                    console.error("Error deleting timeline event:", error);
                    showToast("Chyba při odstraňování události.", true);
                    // Ak nastala chyba, radšej znovu načítajme stav z DB
                    this._fetchTimelineEvents();
                }
            }
        });
        return el;
    }


    async _handleLessonDrop(evt) {
        const lessonId = evt.item.dataset.lessonId;
        const targetContainer = evt.to; // lessons-container, kam sa to hodilo
        const dayIndex = targetContainer.closest('.day-slot').dataset.dayIndex;
        const tempEl = evt.item; // Klonovaný element z knižnice

        // Zistíme nové poradie v rámci dňa
        const itemsInDay = Array.from(targetContainer.children);
        const newIndexInDay = itemsInDay.indexOf(tempEl);

        // Vytvoríme placeholder, kým sa ukladá
        tempEl.innerHTML = `<div class="p-3 text-slate-400">Plánuji...</div>`;
        tempEl.classList.add('opacity-50');

        try {
            // Vypočítame globálny orderIndex
            // Najprv získame všetky eventy pred týmto dňom a v tomto dni pred týmto prvkom
            const timelineContainer = this.querySelector('#timeline-container');
            const allEventElementsBefore = [];
            const daySlots = timelineContainer.querySelectorAll('.day-slot');
            for (let i = 0; i < daySlots.length; i++) {
                 const currentDayIndex = parseInt(daySlots[i].dataset.dayIndex);
                 const lessonsInSlot = daySlots[i].querySelectorAll('.lessons-container .lesson-bubble');
                 if (currentDayIndex < parseInt(dayIndex)) {
                     allEventElementsBefore.push(...lessonsInSlot);
                 } else if (currentDayIndex === parseInt(dayIndex)) {
                     // Pridáme len tie elementy, ktoré sú PRED naším novým (tempEl)
                     lessonsInSlot.forEach((el, idx) => {
                         if (idx < newIndexInDay) {
                             allEventElementsBefore.push(el);
                         }
                     });
                     break; // Skončili sme s týmto dňom
                 }
            }
            const globalOrderIndex = allEventElementsBefore.length; // Toto bude náš nový index

            const newEventData = {
                lessonId: lessonId,
                dayIndex: parseInt(dayIndex),
                createdAt: serverTimestamp(),
                orderIndex: globalOrderIndex // Použijeme vypočítaný index
            };
            const docRef = await addDoc(collection(firebaseInit.db, 'timeline_events'), newEventData);

            // Označíme lekciu ako naplánovanú
            try {
                const lessonRef = doc(firebaseInit.db, 'lessons', lessonId);
                await updateDoc(lessonRef, { isScheduled: true });
            } catch (lessonError) {
                console.error("Error flagging lesson as scheduled:", lessonError);
                showToast("Chyba při označování lekce.", true);
            }

            // Vytvoríme nový element a nahradíme placeholder
            const newDbEvent = { id: docRef.id, ...newEventData, orderIndex: globalOrderIndex }; // Pridáme ID
            const newElement = this._renderScheduledEvent(newDbEvent); // Použijeme dáta z DB

            if(newElement) {
                 tempEl.parentNode.replaceChild(newElement, tempEl);
                 // Pridáme nový event do lokálneho stavu na správne miesto
                 this._timelineEvents.splice(globalOrderIndex, 0, newDbEvent);
                 showToast("Lekce naplánována.");
            } else {
                 tempEl.remove(); // Ak sa nepodarilo renderovať, odstránime placeholder
                 throw new Error("Failed to render new event element.");
            }

            // Aktualizujeme orderIndex VŠETKÝCH eventov PO tomto novom evente
            await this._updateAllOrderIndexes(); // Táto funkcia by mala byť teraz robustnejšia

        } catch (error) {
            console.error("Error scheduling lesson:", error);
            showToast("Chyba při plánování lekce.", true);
            tempEl.remove(); // Odstránime placeholder aj v prípade chyby
             // Znovu načítame dáta, aby sme mali istotu
            this._fetchTimelineEvents();
        }
    }


    async _handleLessonMove(evt) {
        const eventId = evt.item.dataset.eventId;
        const originalDayIndex = evt.from.closest('.day-slot').dataset.dayIndex;
        const newDayIndex = evt.to.closest('.day-slot').dataset.dayIndex;
        const movedElement = evt.item;

        // Okamžite aktualizujeme dayIndex v DB
        try {
            const docRef = doc(firebaseInit.db, 'timeline_events', eventId);
            await updateDoc(docRef, { dayIndex: parseInt(newDayIndex) });
             // Aktualizujeme aj lokálny stav
            const eventIndex = this._timelineEvents.findIndex(ev => ev.id === eventId);
            if (eventIndex > -1) {
                this._timelineEvents[eventIndex].dayIndex = parseInt(newDayIndex);
            }
        } catch (error) {
            console.error("Error moving lesson dayIndex:", error);
            showToast("Chyba při přesouvání lekce (změna dne).", true);
            // Vrátime element späť vizuálne, ak DB update zlyhal? Alebo radšej refresh?
            this._fetchTimelineEvents(); // Refresh pre istotu
            return; // Nepokračujeme s update order
        }

        // Teraz aktualizujeme orderIndex všetkých elementov
        await this._updateAllOrderIndexes();

        // Optional: Môžeme aktualizovať lokálny stav _timelineEvents podľa nového poradia v DOM
        // aby sme nemuseli volať _fetchTimelineEvents() pre zmeny poradia
        const timelineContainer = this.querySelector('#timeline-container');
        if (timelineContainer) {
            const allEventElements = Array.from(timelineContainer.querySelectorAll('.lesson-bubble'));
            const newOrderMap = new Map(allEventElements.map((el, index) => [el.dataset.eventId, index]));
            this._timelineEvents.sort((a, b) => (newOrderMap.get(a.id) ?? Infinity) - (newOrderMap.get(b.id) ?? Infinity));
        }

    }

    // Nová metóda na vykreslenie dní a udalostí (volá sa po fetch a firstUpdated)
    _renderDaysAndEvents() {
         const timelineContainer = this.querySelector('#timeline-container');
         if (!timelineContainer) return;

         // Vyčistíme starý obsah kontajnera
         timelineContainer.innerHTML = '';

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

        // Vložíme načítané udalosti do správnych dní
        this._timelineEvents.forEach(event => {
            const dayIndex = event.dayIndex ?? 0; // Fallback na 0
            const daySlot = timelineContainer.querySelector(`.day-slot[data-day-index='${dayIndex}'] .lessons-container`);
            if (daySlot) {
                const eventElement = this._renderScheduledEvent(event);
                if (eventElement) { // Iba ak sa podarilo renderovať
                    daySlot.appendChild(eventElement);
                }
            } else {
                 console.warn(`Day slot not found for event ${event.id} with dayIndex ${dayIndex}`);
            }
        });

        // Inicializujeme Sortable pre všetky kontajnery lekcií
        timelineContainer.querySelectorAll('.day-slot .lessons-container').forEach(lessonsContainer => {
            if (typeof Sortable !== 'undefined') {
                // Ak už Sortable existuje, zničíme ho pred vytvorením nového
                const existingSortable = Sortable.get(lessonsContainer);
                if (existingSortable) {
                    existingSortable.destroy();
                }
                // Vytvoríme novú inštanciu
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

    // `firstUpdated` už len volá metódu na vykreslenie
    firstUpdated() {
        this._renderDaysAndEvents();
    }


    render() {
        // Renderujeme iba základnú štruktúru, obsah sa naplní vo _renderDaysAndEvents
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
}

customElements.define('professor-timeline-view', ProfessorTimelineView);

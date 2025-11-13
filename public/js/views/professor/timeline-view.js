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
            const currentUser = firebaseInit.auth.currentUser;
            if (!currentUser) {
                this._timelineEvents = [];
                this._renderDaysAndEvents();
                return;
            }

            const timelineCollection = collection(firebaseInit.db, 'timeline_events');
            let q;
            if (currentUser.email === 'profesor@profesor.cz') {
                q = query(timelineCollection, orderBy("orderIndex"));
            } else {
                q = query(
                    timelineCollection,
                    where("ownerId", "==", currentUser.uid),
                    orderBy("orderIndex")
                );
            }

            const querySnapshot = await getDocs(q);
            this._timelineEvents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this._renderDaysAndEvents();
        } catch (error) {
            console.error("Error fetching timeline events:", error);
            showToast("Chyba při načítání plánu.", true);
        }
    }

    _getLocalizedDateDetails(offsetDays = 0) {
        const date = new Date();
        date.setDate(date.getDate() + offsetDays);
        return {
            weekday: date.toLocaleDateString('cs-CZ', { weekday: 'long' }),
            dayMonth: date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }),
            fullDate: date,
            isToday: offsetDays === 0
        };
    }

    async _updateAllOrderIndexes() {
        const timelineContainer = this.querySelector('#timeline-container');
        if (!timelineContainer) return;
        const allEventElements = Array.from(timelineContainer.querySelectorAll('.lesson-bubble'));
        const batch = writeBatch(firebaseInit.db);
        let updatesMade = 0;
        allEventElements.forEach((item, index) => {
            const eventId = item.dataset.eventId;
            if (eventId && this._timelineEvents.some(event => event.id === eventId)) {
                batch.update(doc(firebaseInit.db, 'timeline_events', eventId), { orderIndex: index });
                updatesMade++;
            }
        });
        if (updatesMade > 0) await batch.commit().catch(e => console.error(e));
    }

    _renderScheduledEvent(event) {
        const lesson = this.lessonsData.find(l => l.id === event.lessonId);
        if (!lesson) return null;

        const el = document.createElement('div');
        el.className = 'lesson-bubble p-3 rounded-lg shadow-sm flex items-center justify-between border bg-white hover:bg-slate-50 border-slate-200 cursor-grab mb-2 transition-all group';
        el.dataset.eventId = event.id;
        el.dataset.lessonId = event.lessonId;
        el.innerHTML = `
            <div class="flex items-center space-x-3 flex-grow min-w-0">
                <span class="text-xl flex-shrink-0">${lesson.icon || '📝'}</span>
                <div class="min-w-0">
                    <p class="font-semibold text-sm text-slate-800 truncate" title="${lesson.title}">${lesson.title}</p>
                     ${lesson.subtitle ? `<p class="text-xs text-slate-500 truncate">${lesson.subtitle}</p>` : ''}
                </div>
            </div>
            <button class="delete-event-btn p-1.5 rounded-md hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors flex-shrink-0 ml-2 opacity-0 group-hover:opacity-100" title="Odebrat z plánu">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>`;
        
        el.querySelector('.delete-event-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('Odebrat tuto lekci z plánu?')) {
                try {
                    await deleteDoc(doc(firebaseInit.db, 'timeline_events', event.id));
                    el.remove();
                    this._timelineEvents = this._timelineEvents.filter(ev => ev.id !== event.id);
                    if (!this._timelineEvents.some(ev => ev.lessonId === event.lessonId)) {
                        await updateDoc(doc(firebaseInit.db, 'lessons', event.lessonId), { isScheduled: false }).catch(console.error);
                    }
                    showToast("Lekce odebrána.");
                    await this._updateAllOrderIndexes();
                } catch (error) {
                    console.error(error); showToast("Chyba při odebírání.", true); this._fetchTimelineEvents();
                }
            }
        });
        return el;
    }

    async _handleLessonDrop(evt) {
        const lessonId = evt.item.dataset.lessonId;
        const targetDayIndex = parseInt(evt.to.closest('.day-slot').dataset.dayIndex);
        const tempEl = evt.item;
        const newIndexInDay = Array.from(evt.to.children).indexOf(tempEl);

        tempEl.innerHTML = `<div class="p-3 text-slate-400 text-sm flex items-center"><div class="spinner mr-2 w-4 h-4 border-2"></div> Plánuji...</div>`;
        tempEl.className = "bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg p-2 mb-2 opacity-70";

        try {
            let globalOrderIndex = 0;
            const daySlots = this.querySelectorAll('.day-slot');
            for (let i = 0; i < daySlots.length; i++) {
                 const currentDayIndex = parseInt(daySlots[i].dataset.dayIndex);
                 if (currentDayIndex < targetDayIndex) {
                     globalOrderIndex += daySlots[i].querySelectorAll('.lessons-container .lesson-bubble').length;
                 } else if (currentDayIndex === targetDayIndex) {
                     globalOrderIndex += newIndexInDay;
                     break;
                 }
            }

            const ownerId = firebaseInit.auth.currentUser.uid;
            const newEventData = { lessonId, ownerId, dayIndex: targetDayIndex, createdAt: serverTimestamp(), orderIndex: globalOrderIndex };
            const docRef = await addDoc(collection(firebaseInit.db, 'timeline_events'), newEventData);
            await updateDoc(doc(firebaseInit.db, 'lessons', lessonId), { isScheduled: true }).catch(console.error);

            const newDbEvent = { id: docRef.id, ...newEventData };
            const newElement = this._renderScheduledEvent(newDbEvent);
            if(newElement) {
                 tempEl.parentNode.replaceChild(newElement, tempEl);
                 this._timelineEvents.push(newDbEvent);
                 showToast("Lekce naplánována.");
            } else { tempEl.remove(); }
            await this._updateAllOrderIndexes();
        } catch (error) {
            console.error(error); showToast("Chyba při plánování.", true);
            tempEl.remove(); this._fetchTimelineEvents();
        }
    }

    async _handleLessonMove(evt) {
        const eventId = evt.item.dataset.eventId;
        const newDayIndex = parseInt(evt.to.closest('.day-slot').dataset.dayIndex);
        try {
            await updateDoc(doc(firebaseInit.db, 'timeline_events', eventId), { dayIndex: newDayIndex });
            const ev = this._timelineEvents.find(e => e.id === eventId);
            if (ev) ev.dayIndex = newDayIndex;
            await this._updateAllOrderIndexes();
        } catch (e) { console.error(e); this._fetchTimelineEvents(); }
    }

    async addLessonToFirstAvailableSlot(lesson) {
        if (!lesson?.id) return;
        // Hľadáme prvý deň s < 5 lekciami v rámci 31 dní
        let targetDayIndex = 0;
        for (let i = 0; i < 31; i++) {
            if (this._timelineEvents.filter(ev => ev.dayIndex === i).length < 5) {
                targetDayIndex = i;
                break;
            }
        }

        const maxOrderIndex = this._timelineEvents.reduce((max, ev) => Math.max(max, ev.orderIndex || 0), -1);
        const ownerId = firebaseInit.auth.currentUser.uid;
        const newEventData = { lessonId: lesson.id, ownerId, dayIndex: targetDayIndex, createdAt: serverTimestamp(), orderIndex: maxOrderIndex + 1 };

        try {
            const daySlot = this.querySelector(`.day-slot[data-day-index='${targetDayIndex}'] .lessons-container`);
            if (daySlot) {
                const ph = document.createElement('div');
                ph.className = 'p-3 mb-2 text-slate-400 opacity-50 border-2 border-dashed rounded-lg text-sm';
                ph.textContent = `Plánuji ${lesson.title}...`;
                daySlot.appendChild(ph);
                ph.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                const docRef = await addDoc(collection(firebaseInit.db, 'timeline_events'), newEventData);
                await updateDoc(doc(firebaseInit.db, 'lessons', lesson.id), { isScheduled: true });
                
                const newDbEvent = { id: docRef.id, ...newEventData };
                this._timelineEvents.push(newDbEvent);
                const newEl = this._renderScheduledEvent(newDbEvent);
                if (newEl) daySlot.replaceChild(newEl, ph); else ph.remove();
                showToast(`Lekce přidána na ${this._getLocalizedDateDetails(targetDayIndex).weekday}.`);
            }
        } catch (e) { console.error(e); showToast("Chyba přidání.", true); this._fetchTimelineEvents(); }
    }

    _renderDaysAndEvents() {
         const container = this.querySelector('#timeline-container');
         if (!container) return;
         container.innerHTML = '';

        // Vytvoríme mriežku pre 31 dní
        // Na veľkých obrazovkách 5 stĺpcov (typický kalendár má 7, ale 5 je lepšie pre čitateľnosť obsahu)
        const grid = document.createElement('div');
        grid.className = "grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";

        for (let i = 0; i < 31; i++) {
            const { weekday, dayMonth, fullDate, isToday } = this._getLocalizedDateDetails(i);
            const isWeekend = fullDate.getDay() === 0 || fullDate.getDay() === 6;

            const dayWrapper = document.createElement('div');
            dayWrapper.className = `day-slot rounded-xl border-2 ${isToday ? 'border-blue-300 bg-blue-50/30' : (isWeekend ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200')} flex flex-col overflow-hidden transition-all hover:border-blue-200 min-h-[180px]`;
            dayWrapper.dataset.dayIndex = i;

            dayWrapper.innerHTML = `
                <div class="px-4 py-2 border-b ${isToday ? 'bg-blue-100/50' : (isWeekend ? 'bg-slate-100' : 'bg-slate-50')} flex justify-between items-center sticky top-0 z-10">
                    <span class="font-bold ${isToday ? 'text-blue-800' : 'text-slate-700'} capitalize truncate">${weekday}</span>
                    <span class="text-xs ${isToday ? 'text-blue-600 font-semibold' : 'text-slate-400'} ml-2">${dayMonth}</span>
                </div>
                <div class="lessons-container flex-grow p-2 space-y-2 min-h-[120px] overflow-y-auto custom-scrollbar"></div>
            `;
            grid.appendChild(dayWrapper);
        }
        container.appendChild(grid);

        this._timelineEvents.sort((a,b) => a.orderIndex - b.orderIndex).forEach(event => {
            const daySlot = container.querySelector(`.day-slot[data-day-index='${event.dayIndex ?? 0}'] .lessons-container`);
            if (daySlot) {
                const el = this._renderScheduledEvent(event);
                if (el) daySlot.appendChild(el);
            }
        });

        container.querySelectorAll('.lessons-container').forEach(c => {
            if (typeof Sortable !== 'undefined') {
                Sortable.get(c)?.destroy();
                new Sortable(c, { group: 'lessons', animation: 150, ghostClass: 'opacity-50', onAdd: (e) => this._handleLessonDrop(e), onUpdate: (e) => this._handleLessonMove(e) });
            }
        });
    }

    firstUpdated() { this._renderDaysAndEvents(); }

    render() {
        return html`
            <header class="px-6 py-4 border-b border-slate-200 bg-white sticky top-0 z-20 shadow-sm flex justify-between items-center">
                <div>
                    <h1 class="text-2xl font-extrabold text-slate-800">Plán výuky (31 dní)</h1>
                    <p class="text-sm text-slate-500">Přetáhněte lekce do požadovaného dne.</p>
                </div>
            </header>
            <div class="flex-grow overflow-y-auto bg-slate-100 custom-scrollbar">
                <div id="timeline-container" class="p-6 pb-20"></div>
            </div>
        `;
    }
}

customElements.define('professor-timeline-view', ProfessorTimelineView);

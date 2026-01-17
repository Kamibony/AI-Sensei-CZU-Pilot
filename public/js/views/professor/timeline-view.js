import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { ProfessorDataService } from '../../services/professor-data-service.js';
import { translationService } from '../../utils/translation-service.js';
import { showToast } from '../../utils/utils.js';

const TYPE_COLORS = {
    quiz: 'border-l-4 border-green-500 bg-green-50 text-green-900',
    test: 'border-l-4 border-red-500 bg-red-50 text-red-900',
    video: 'border-l-4 border-blue-500 bg-blue-50 text-blue-900',
    audio: 'border-l-4 border-cyan-500 bg-cyan-50 text-cyan-900',
    presentation: 'border-l-4 border-orange-500 bg-orange-50 text-orange-900',
    text: 'border-l-4 border-slate-500 bg-slate-50 text-slate-900',
    mindmap: 'border-l-4 border-pink-500 bg-pink-50 text-pink-900',
    comic: 'border-l-4 border-yellow-500 bg-yellow-50 text-yellow-900',
    default: 'border-l-4 border-gray-500 bg-gray-50 text-gray-900'
};

export class TimelineView extends LitElement {
    static properties = {
        lessons: { state: true },
        isLoading: { state: true },
        selectedDate: { state: true },
        isBacklogOpen: { state: true },
        _draggedLessonId: { state: true }
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.lessons = [];
        this.isLoading = true;
        this.dataService = new ProfessorDataService();
        this.selectedDate = new Date();
        this.selectedDate.setHours(0, 0, 0, 0);
        this.isBacklogOpen = false;
        this._draggedLessonId = null;
        this._timelineRef = null; // Will hold reference to scroll container

        // Generate timeline range (e.g., +/- 60 days)
        this._days = this._generateDays(60);
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadData();
    }

    async _loadData() {
        this.isLoading = true;
        this.lessons = await this.dataService.fetchLessons();
        this.isLoading = false;

        // Wait for render then scroll to today
        await this.updateComplete;
        this._scrollToToday();
    }

    _generateDays(range) {
        const days = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = -range; i <= range; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            days.push(date);
        }
        return days;
    }

    _scrollToToday() {
        const scrollContainer = this.querySelector('#timeline-scroll-container');
        const todayElement = this.querySelector('#day-card-today');

        if (scrollContainer && todayElement) {
            const containerWidth = scrollContainer.clientWidth;
            const cardLeft = todayElement.offsetLeft;
            const cardWidth = todayElement.clientWidth;

            // Center the element
            scrollContainer.scrollTo({
                left: cardLeft - (containerWidth / 2) + (cardWidth / 2),
                behavior: 'smooth'
            });
        }
    }

    // --- Date Helpers ---

    _isSameDay(d1, d2) {
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    }

    _isToday(date) {
        return this._isSameDay(date, new Date());
    }

    _formatDayName(date) {
        return new Intl.DateTimeFormat(translationService.currentLanguage || 'cs-CZ', { weekday: 'short' }).format(date);
    }

    _formatDateShort(date) {
        return new Intl.DateTimeFormat(translationService.currentLanguage || 'cs-CZ', { day: 'numeric', month: 'numeric' }).format(date);
    }

    _formatDateFull(date) {
        return new Intl.DateTimeFormat(translationService.currentLanguage || 'cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    }

    // --- Data Helpers ---

    _getLessonsForDay(date) {
        return this.lessons.filter(l => {
            if (!l.availableFrom) return false;
            const lDate = new Date(l.availableFrom);
            return this._isSameDay(lDate, date);
        }).sort((a, b) => new Date(a.availableFrom) - new Date(b.availableFrom));
    }

    _getUnscheduledLessons() {
        return this.lessons.filter(l => !l.availableFrom);
    }

    // --- Drag & Drop ---

    _handleDragStart(e, lesson) {
        this._draggedLessonId = lesson.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', lesson.id);
        e.target.style.opacity = '0.5';
    }

    _handleDragEnd(e) {
        e.target.style.opacity = '1';
        this._draggedLessonId = null;
    }

    _handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    async _handleDropOnDay(e, date) {
        e.preventDefault();
        const lessonId = e.dataTransfer.getData('text/plain');
        if (!lessonId) return;

        const lessonIndex = this.lessons.findIndex(l => l.id === lessonId);
        if (lessonIndex > -1) {
            const oldFrom = this.lessons[lessonIndex].availableFrom;

            // Set time to current time or default 9:00 if it was unscheduled
            const targetDate = new Date(date);
            targetDate.setHours(9, 0, 0, 0); // Default schedule time

            // Optimistic Update
            this.lessons[lessonIndex] = {
                ...this.lessons[lessonIndex],
                availableFrom: targetDate.toISOString(),
                availableUntil: null
            };
            this.requestUpdate();

            const success = await this.dataService.updateLessonSchedule(lessonId, targetDate, null);
            if (!success) {
                // Revert
                this.lessons[lessonIndex].availableFrom = oldFrom;
                this.requestUpdate();
            } else {
                 showToast(translationService.t('timeline.scheduled_success') || 'Lekce naplánována', 'success');
                 this.selectedDate = new Date(date); // Select the day we dropped onto
            }
        }
    }

    async _handleDropOnBacklog(e) {
        e.preventDefault();
        const lessonId = e.dataTransfer.getData('text/plain');
        if (!lessonId) return;

        const lessonIndex = this.lessons.findIndex(l => l.id === lessonId);
        if (lessonIndex > -1) {
             const oldFrom = this.lessons[lessonIndex].availableFrom;
             if (!oldFrom) return; // Already in backlog

             // Optimistic
             this.lessons[lessonIndex] = { ...this.lessons[lessonIndex], availableFrom: null, availableUntil: null };
             this.requestUpdate();

             const success = await this.dataService.updateLessonSchedule(lessonId, null, null);
             if (!success) {
                 this.lessons[lessonIndex].availableFrom = oldFrom;
                 this.requestUpdate();
             } else {
                 showToast(translationService.t('timeline.unscheduled_success') || 'Lekce přesunuta do zásobníku', 'success');
             }
        }
    }

    // --- Styling ---

    _getCardClass(type) {
        return TYPE_COLORS[type] || TYPE_COLORS.default;
    }

    // --- Render Methods ---

    _renderBacklog() {
        const unscheduled = this._getUnscheduledLessons();
        const t = (key) => translationService.t(key);

        return html`
            <div class="border-b border-slate-200 bg-slate-50 flex flex-col transition-all duration-300 ${this.isBacklogOpen ? 'h-48' : 'h-12'}">
                <div
                    class="px-4 h-12 flex items-center justify-between cursor-pointer hover:bg-slate-100"
                    @click="${() => this.isBacklogOpen = !this.isBacklogOpen}"
                >
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-slate-700 text-sm tracking-wide uppercase">${t('timeline.backlog') || 'Zásobník'}</span>
                        <span class="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">${unscheduled.length}</span>
                    </div>
                    <div class="text-slate-400 transform transition-transform ${this.isBacklogOpen ? 'rotate-180' : ''}">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>

                ${this.isBacklogOpen ? html`
                    <div
                        class="flex-1 overflow-x-auto overflow-y-hidden flex items-center gap-3 px-4 pb-2"
                        @dragover="${this._handleDragOver}"
                        @drop="${this._handleDropOnBacklog}"
                    >
                        ${unscheduled.length === 0 ? html`
                            <div class="text-slate-400 text-xs italic w-full text-center">Žádné nezařazené lekce</div>
                        ` : unscheduled.map(lesson => html`
                            <div
                                draggable="true"
                                @dragstart="${(e) => this._handleDragStart(e, lesson)}"
                                @dragend="${this._handleDragEnd}"
                                class="flex-shrink-0 w-48 p-2 rounded bg-white shadow-sm hover:shadow-md cursor-move border border-slate-200 text-xs"
                            >
                                <div class="font-medium text-slate-800 truncate" title="${lesson.title}">${lesson.title}</div>
                                <div class="text-slate-500 text-[10px] mt-1 uppercase">${lesson.contentType || 'Lekce'}</div>
                            </div>
                        `)}
                    </div>
                ` : nothing}
            </div>
        `;
    }

    _renderDayCard(date) {
        const isToday = this._isToday(date);
        const isSelected = this._isSameDay(date, this.selectedDate);
        const lessons = this._getLessonsForDay(date);
        const hasLessons = lessons.length > 0;

        return html`
            <div
                id="${isToday ? 'day-card-today' : ''}"
                class="flex-shrink-0 w-[180px] h-full snap-center border-r border-slate-200 p-2 flex flex-col cursor-pointer transition-colors relative
                       ${isSelected ? 'bg-blue-50/50' : 'bg-white hover:bg-slate-50'}"
                @click="${() => this.selectedDate = date}"
                @dragover="${this._handleDragOver}"
                @drop="${(e) => this._handleDropOnDay(e, date)}"
            >
                <!-- Date Header -->
                <div class="text-center py-2 ${isToday ? 'text-blue-600' : 'text-slate-600'}">
                    <div class="text-xs font-bold uppercase tracking-wider mb-1">${this._formatDayName(date)}</div>
                    <div class="text-xl font-light ${isToday ? 'font-bold' : ''}">${this._formatDateShort(date)}</div>
                </div>

                <!-- Content/Dots -->
                <div class="flex-1 flex flex-col items-center justify-center gap-1 mt-2">
                    ${hasLessons ? html`
                        <div class="flex flex-wrap justify-center gap-1 max-w-[80%]">
                            ${lessons.map(l => html`
                                <div class="w-2 h-2 rounded-full ${this._getDotColor(l.contentType)}" title="${l.title}"></div>
                            `)}
                        </div>
                        <div class="text-xs text-slate-400 mt-1">${lessons.length} lekcí</div>
                    ` : html`
                        <div class="text-slate-200 text-4xl leading-none select-none">&middot;</div>
                    `}
                </div>

                ${isSelected ? html`
                    <div class="absolute bottom-0 left-0 right-0 h-1 bg-blue-500"></div>
                ` : nothing}
            </div>
        `;
    }

    _getDotColor(type) {
        // Simplified mapping for dots
        switch (type) {
            case 'quiz': return 'bg-green-500';
            case 'test': return 'bg-red-500';
            case 'video': return 'bg-blue-500';
            case 'audio': return 'bg-cyan-500';
            default: return 'bg-gray-400';
        }
    }

    _renderActiveDayDetail() {
        const date = this.selectedDate;
        const lessons = this._getLessonsForDay(date);
        const t = (key) => translationService.t(key);

        return html`
            <div
                class="h-72 border-t border-slate-200 bg-slate-50/50 flex flex-col overflow-hidden"
                @dragover="${this._handleDragOver}"
                @drop="${(e) => this._handleDropOnDay(e, date)}"
            >
                <div class="px-6 py-3 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm">
                    <h3 class="font-bold text-slate-800 text-lg flex items-center gap-2">
                        <span>${this._formatDateFull(date)}</span>
                        ${this._isToday(date) ? html`<span class="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">Dnes</span>` : nothing}
                    </h3>
                    <div class="text-xs text-slate-400">
                        ${lessons.length} naplánovaných lekcí
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    ${lessons.length === 0 ? html`
                        <div class="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                            <svg class="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                            <span class="text-sm">Žádné lekce pro tento den</span>
                            <span class="text-xs opacity-70 mt-1">Přetáhněte sem lekce ze zásobníku</span>
                        </div>
                    ` : html`
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            ${lessons.map(lesson => html`
                                <div
                                    draggable="true"
                                    @dragstart="${(e) => this._handleDragStart(e, lesson)}"
                                    @dragend="${this._handleDragEnd}"
                                    class="p-4 rounded-lg shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-all ${this._getCardClass(lesson.contentType)}"
                                >
                                    <div class="flex justify-between items-start mb-2">
                                        <span class="text-[10px] font-bold uppercase tracking-wider opacity-60">${lesson.contentType || 'Lekce'}</span>
                                        <div class="flex gap-1">
                                            <!-- Optional: Add actions like remove from schedule here -->
                                            <button
                                                class="text-xs opacity-50 hover:opacity-100 hover:bg-black/10 rounded p-1"
                                                title="Zrušit plánování"
                                                @click="${(e) => {
                                                    e.stopPropagation();
                                                    this._handleDropOnBacklog({ preventDefault: () => {}, dataTransfer: { getData: () => lesson.id } });
                                                }}"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                    <h4 class="font-bold text-sm leading-tight mb-1">${lesson.title}</h4>
                                    ${lesson.topic ? html`<p class="text-xs opacity-80 truncate">${lesson.topic}</p>` : nothing}
                                </div>
                            `)}
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    render() {
        return html`
            <div class="flex flex-col h-full bg-white overflow-hidden">
                <!-- Top Bar: Backlog -->
                ${this._renderBacklog()}

                <!-- Middle: Infinite Timeline -->
                <div class="flex-1 relative overflow-hidden flex flex-col">
                    <div
                        id="timeline-scroll-container"
                        class="flex-1 flex overflow-x-auto snap-x scroll-smooth custom-scrollbar-hide"
                    >
                        ${this._days.map(date => this._renderDayCard(date))}
                    </div>

                    <!-- Gradient Overlays for scroll hint (optional) -->
                    <div class="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent pointer-events-none"></div>
                    <div class="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none"></div>

                    <div class="absolute bottom-4 right-4 z-10">
                        <button
                            @click="${this._scrollToToday}"
                            class="bg-white/90 backdrop-blur shadow-lg border border-slate-200 text-blue-600 px-4 py-2 rounded-full text-sm font-bold hover:bg-blue-50 transition-colors"
                        >
                            Dnes
                        </button>
                    </div>
                </div>

                <!-- Bottom: Active Day Detail -->
                ${this._renderActiveDayDetail()}
            </div>
        `;
    }
}

customElements.define('timeline-view', TimelineView);

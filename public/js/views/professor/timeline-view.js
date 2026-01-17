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
        currentWeekStart: { state: true },
        _draggedLessonId: { state: true }
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.lessons = [];
        this.isLoading = true;
        this.dataService = new ProfessorDataService();
        this._draggedLessonId = null;

        // Initialize to current week's Monday
        this.currentWeekStart = this._getStartOfWeek(new Date());
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadData();
    }

    async _loadData() {
        this.isLoading = true;
        this.lessons = await this.dataService.fetchLessons();
        this.isLoading = false;
    }

    // --- Date Logic ---

    _getStartOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    _generateWeekDays(startOfWeek) {
        const days = [];
        for (let i = 0; i < 5; i++) { // Mon-Fri
            const d = new Date(startOfWeek);
            d.setDate(startOfWeek.getDate() + i);
            days.push(d);
        }
        return days;
    }

    _nextWeek() {
        const next = new Date(this.currentWeekStart);
        next.setDate(next.getDate() + 7);
        this.currentWeekStart = next;
    }

    _prevWeek() {
        const prev = new Date(this.currentWeekStart);
        prev.setDate(prev.getDate() - 7);
        this.currentWeekStart = prev;
    }

    _goToToday() {
        this.currentWeekStart = this._getStartOfWeek(new Date());
    }

    _isSameDay(d1, d2) {
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    }

    _isToday(date) {
        return this._isSameDay(date, new Date());
    }

    _formatDateRange(start) {
        const end = new Date(start);
        end.setDate(start.getDate() + 4); // Friday

        const options = { day: 'numeric', month: 'numeric' };
        const fmt = new Intl.DateTimeFormat(translationService.currentLanguage || 'cs-CZ', options);
        return `${fmt.format(start)} – ${fmt.format(end)} ${start.getFullYear()}`;
    }

    _formatDayName(date) {
        return new Intl.DateTimeFormat(translationService.currentLanguage || 'cs-CZ', { weekday: 'long' }).format(date);
    }

    _formatDateShort(date) {
        return new Intl.DateTimeFormat(translationService.currentLanguage || 'cs-CZ', { day: 'numeric', month: 'numeric' }).format(date);
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

    _getCardClass(type) {
        return TYPE_COLORS[type] || TYPE_COLORS.default;
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
            const targetDate = new Date(date);
            targetDate.setHours(9, 0, 0, 0);

            // Optimistic
            const updatedLesson = {
                ...this.lessons[lessonIndex],
                availableFrom: targetDate.toISOString()
            };
            this.lessons = [
                ...this.lessons.slice(0, lessonIndex),
                updatedLesson,
                ...this.lessons.slice(lessonIndex + 1)
            ];

            const success = await this.dataService.updateLessonSchedule(lessonId, targetDate, null);
            if (!success) {
                // Revert
                this.lessons[lessonIndex] = { ...this.lessons[lessonIndex], availableFrom: oldFrom };
                this.requestUpdate();
                showToast('Chyba při plánování', 'error');
            } else {
                 showToast(translationService.t('timeline.scheduled_success') || 'Lekce naplánována', 'success');
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
             if (!oldFrom) return;

             // Optimistic
             const updatedLesson = { ...this.lessons[lessonIndex], availableFrom: null };
             this.lessons = [
                ...this.lessons.slice(0, lessonIndex),
                updatedLesson,
                ...this.lessons.slice(lessonIndex + 1)
            ];

             const success = await this.dataService.updateLessonSchedule(lessonId, null, null);
             if (!success) {
                 this.lessons[lessonIndex] = { ...this.lessons[lessonIndex], availableFrom: oldFrom };
                 this.requestUpdate();
             } else {
                 showToast(translationService.t('timeline.unscheduled_success') || 'Lekce přesunuta do zásobníku', 'success');
             }
        }
    }

    // --- Rendering ---

    _renderSidebar() {
        const unscheduled = this._getUnscheduledLessons();
        const t = (key) => translationService.t(key);

        return html`
            <div
                class="w-80 flex-shrink-0 bg-slate-50 border-r border-slate-200 flex flex-col h-full overflow-hidden"
                @dragover="${this._handleDragOver}"
                @drop="${this._handleDropOnBacklog}"
            >
                <div class="p-4 border-b border-slate-200 bg-white">
                    <h2 class="font-bold text-slate-700 uppercase text-xs tracking-wider flex items-center justify-between">
                        <span>${t('timeline.backlog') || 'Zásobník'}</span>
                        <span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">${unscheduled.length}</span>
                    </h2>
                </div>

                <div class="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    ${unscheduled.length === 0 ? html`
                        <div class="text-center text-slate-400 text-sm mt-10">
                            <p>Žádné nezařazené lekce</p>
                        </div>
                    ` : unscheduled.map(lesson => html`
                        <div
                            draggable="true"
                            @dragstart="${(e) => this._handleDragStart(e, lesson)}"
                            @dragend="${this._handleDragEnd}"
                            class="bg-white p-3 rounded-lg shadow-sm border border-slate-200 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${this._getCardClass(lesson.contentType)}"
                        >
                            <div class="text-xs font-bold uppercase mb-1 opacity-70">${lesson.contentType || 'Lekce'}</div>
                            <div class="font-medium text-slate-800 text-sm line-clamp-2">${lesson.title}</div>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }

    _renderHeader() {
        return html`
            <div class="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-10">
                <div class="flex items-center gap-4">
                    <button
                        @click="${this._prevWeek}"
                        class="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                    </button>

                    <h2 class="text-xl font-bold text-slate-800 tabular-nums">
                        ${this._formatDateRange(this.currentWeekStart)}
                    </h2>

                    <button
                        @click="${this._nextWeek}"
                        class="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </button>

                    <button
                        @click="${this._goToToday}"
                        class="ml-2 px-3 py-1 text-sm font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                    >
                        Dnes
                    </button>
                </div>

                <div class="flex gap-2 text-sm text-slate-500">
                     <!-- Legend or filters could go here -->
                </div>
            </div>
        `;
    }

    _renderDaySlot(date) {
        const isToday = this._isToday(date);
        const lessons = this._getLessonsForDay(date);

        return html`
            <div
                class="bg-white rounded-xl shadow-sm border ${isToday ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'} flex flex-col min-h-[200px] h-full transition-colors"
                @dragover="${this._handleDragOver}"
                @drop="${(e) => this._handleDropOnDay(e, date)}"
            >
                <!-- Header -->
                <div class="p-3 border-b border-slate-100 text-center bg-slate-50/50 rounded-t-xl">
                    <div class="text-xs font-bold uppercase tracking-wider ${isToday ? 'text-blue-600' : 'text-slate-500'}">
                        ${this._formatDayName(date)}
                    </div>
                    <div class="text-lg font-light ${isToday ? 'text-blue-800 font-bold' : 'text-slate-800'}">
                        ${this._formatDateShort(date)}
                    </div>
                </div>

                <!-- Body (Drop Zone) -->
                <div class="flex-1 p-3 space-y-2 ${isToday ? 'bg-blue-50/10' : ''}">
                    ${lessons.map(lesson => html`
                        <div
                            draggable="true"
                            @dragstart="${(e) => this._handleDragStart(e, lesson)}"
                            @dragend="${this._handleDragEnd}"
                            class="p-2 mb-2 rounded shadow-sm border cursor-grab active:cursor-grabbing hover:shadow-md transition-all bg-white text-sm ${this._getCardClass(lesson.contentType)}"
                        >
                            <div class="flex justify-between items-start">
                                <span class="text-[10px] font-bold uppercase opacity-60 mb-1 block">${lesson.contentType}</span>
                                <button
                                    class="text-slate-400 hover:text-red-500"
                                    @click="${(e) => {
                                        e.stopPropagation();
                                        // Trigger drop on backlog logic manually
                                        this._handleDropOnBacklog({ preventDefault:()=>{}, dataTransfer: { getData: () => lesson.id } });
                                    }}"
                                >
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            </div>
                            <div class="font-medium leading-tight">${lesson.title}</div>
                        </div>
                    `)}

                    ${lessons.length === 0 ? html`
                        <div class="h-full flex items-center justify-center min-h-[100px] text-slate-300 text-xs italic pointer-events-none">
                            Prázdné
                        </div>
                    ` : nothing}
                </div>
            </div>
        `;
    }

    render() {
        const days = this._generateWeekDays(this.currentWeekStart);

        return html`
            <div class="flex h-full bg-slate-100 overflow-hidden font-sans">
                <!-- Sidebar -->
                ${this._renderSidebar()}

                <!-- Main Content -->
                <div class="flex-1 flex flex-col h-full overflow-hidden relative">
                    ${this._renderHeader()}

                    <div class="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                            ${days.map(date => this._renderDaySlot(date))}
                        </div>

                        <div class="mt-8 text-center text-slate-400 text-xs">
                             <!-- Optional Footer -->
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('timeline-view', TimelineView);

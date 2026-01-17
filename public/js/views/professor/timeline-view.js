import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { ProfessorDataService } from '../../services/professor-data-service.js';
import { translationService } from '../../utils/translation-service.js';
import { showToast } from '../../utils/utils.js';

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
        this.currentWeekStart = this._getStartOfWeek(new Date());
        this._draggedLessonId = null;
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

    // --- Date Helpers ---

    _getStartOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    _addDays(date, days) {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    _isSameDay(d1, d2) {
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    }

    _isToday(date) {
        return this._isSameDay(date, new Date());
    }

    _formatDate(date) {
        return new Intl.DateTimeFormat(translationService.currentLanguage || 'cs-CZ', {
            weekday: 'long',
            day: 'numeric',
            month: 'short'
        }).format(date);
    }

    _formatWeekRange(startDate) {
        const end = this._addDays(startDate, 6);
        const fmt = new Intl.DateTimeFormat(translationService.currentLanguage || 'cs-CZ', { month: 'short', day: 'numeric' });
        return `${fmt.format(startDate)} - ${fmt.format(end)}`;
    }

    // --- Navigation ---

    _prevWeek() {
        this.currentWeekStart = this._addDays(this.currentWeekStart, -7);
    }

    _nextWeek() {
        this.currentWeekStart = this._addDays(this.currentWeekStart, 7);
    }

    _jumpToToday() {
        this.currentWeekStart = this._getStartOfWeek(new Date());
    }

    // --- Drag & Drop ---

    _handleDragStart(e, lesson) {
        this._draggedLessonId = lesson.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', lesson.id);
        // Visual feedback
        e.target.style.opacity = '0.5';
    }

    _handleDragEnd(e) {
        e.target.style.opacity = '1';
        this._draggedLessonId = null;
    }

    _handleDragOver(e) {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = 'move';
    }

    async _handleDropOnDay(e, date) {
        e.preventDefault();
        const lessonId = e.dataTransfer.getData('text/plain');
        if (!lessonId) return;

        // Optimistic Update
        const lessonIndex = this.lessons.findIndex(l => l.id === lessonId);
        if (lessonIndex > -1) {
            const oldFrom = this.lessons[lessonIndex].availableFrom;

            // Update local state immediately
            const targetDate = new Date(date);
            // Preserve time if needed, but for kanban usually we just set date.
            // Let's set to 9:00 AM by default if moving from unscheduled, or keep time if moving between days?
            // User prompt says: "Call ProfessorDataService.updateLessonSchedule(lessonId, targetDate, null)."
            // Let's just set the date part and maybe a default time if none existed.
            targetDate.setHours(9, 0, 0, 0);

            this.lessons[lessonIndex] = {
                ...this.lessons[lessonIndex],
                availableFrom: targetDate.toISOString(), // Firestore expects Date object usually, but local state might be string/date mixed.
                // Let's keep it consistent. The service takes Date object.
                // But for local rendering we need to match.
                // Let's rely on _loadData or service to handle types, but here we update for UI.
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

    _getLessonTypeColor(type) {
        switch (type) {
            case 'quiz': return 'border-l-purple-500 text-purple-700 bg-purple-50';
            case 'test': return 'border-l-red-500 text-red-700 bg-red-50';
            case 'video': return 'border-l-blue-500 text-blue-700 bg-blue-50';
            case 'audio': return 'border-l-cyan-500 text-cyan-700 bg-cyan-50';
            case 'presentation': return 'border-l-orange-500 text-orange-700 bg-orange-50';
            case 'text': return 'border-l-slate-500 text-slate-700 bg-slate-50';
            case 'mindmap': return 'border-l-pink-500 text-pink-700 bg-pink-50';
            case 'comic': return 'border-l-yellow-500 text-yellow-700 bg-yellow-50';
            default: return 'border-l-indigo-500 text-indigo-700 bg-indigo-50';
        }
    }

    _getLessonIcon(type) {
        switch (type) {
            case 'quiz': return '❓';
            case 'test': return '📝';
            case 'video': return '🎥';
            case 'audio': return '🎙️';
            case 'presentation': return '📊';
            case 'text': return '📄';
            case 'mindmap': return '🧠';
            case 'comic': return '💬';
            default: return '📚';
        }
    }

    // --- Renders ---

    _renderLessonCard(lesson) {
        const typeColorClass = this._getLessonTypeColor(lesson.contentType);
        const icon = this._getLessonIcon(lesson.contentType);

        return html`
            <div
                draggable="true"
                @dragstart="${(e) => this._handleDragStart(e, lesson)}"
                @dragend="${this._handleDragEnd}"
                class="relative p-3 mb-2 bg-white rounded-lg shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing border-l-4 ${typeColorClass} transition-all group"
            >
                <div class="flex items-start justify-between gap-2">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5 mb-1">
                            <span class="text-xs opacity-70">${icon}</span>
                            <span class="text-[10px] font-bold uppercase tracking-wider opacity-60">${lesson.contentType || 'Lekce'}</span>
                        </div>
                        <h4 class="font-semibold text-sm text-slate-800 leading-tight line-clamp-2" title="${lesson.title}">
                            ${lesson.title}
                        </h4>
                        ${lesson.topic ? html`<p class="text-xs text-slate-500 mt-1 truncate">${lesson.topic}</p>` : nothing}
                    </div>
                </div>
            </div>
        `;
    }

    _renderDayColumn(date) {
        const isToday = this._isToday(date);

        // Filter lessons for this day
        // Need to handle Date objects or ISO strings from Firestore/Local state
        const dayLessons = this.lessons.filter(l => {
            if (!l.availableFrom) return false;
            const lDate = new Date(l.availableFrom);
            return this._isSameDay(lDate, date);
        }).sort((a, b) => new Date(a.availableFrom) - new Date(b.availableFrom));

        return html`
            <div
                class="flex flex-col min-w-[200px] h-full border-r border-slate-200 last:border-r-0 bg-slate-50/30"
                @dragover="${this._handleDragOver}"
                @drop="${(e) => this._handleDropOnDay(e, date)}"
            >
                <!-- Column Header -->
                <div class="p-3 border-b border-slate-200 sticky top-0 bg-slate-50/95 backdrop-blur z-10 ${isToday ? 'bg-blue-50/95' : ''}">
                    <h3 class="font-medium text-sm ${isToday ? 'text-blue-700' : 'text-slate-600'}">
                        ${this._formatDate(date)}
                    </h3>
                    ${isToday ? html`<span class="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Dnes</span>` : nothing}
                </div>

                <!-- Drop Zone / List -->
                <div class="flex-1 p-2 overflow-y-auto custom-scrollbar">
                    ${dayLessons.map(l => this._renderLessonCard(l))}

                    <!-- Empty State Placeholder to make drop zone obvious -->
                    ${dayLessons.length === 0 ? html`
                        <div class="h-24 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center text-slate-300 text-xs">
                            Naplánovat
                        </div>
                    ` : nothing}
                </div>
            </div>
        `;
    }

    render() {
        const t = (key) => translationService.t(key);

        const unscheduledLessons = this.lessons.filter(l => !l.availableFrom);

        // Generate 7 days for current week
        const weekDays = [];
        for (let i = 0; i < 7; i++) {
            weekDays.push(this._addDays(this.currentWeekStart, i));
        }

        return html`
            <div class="h-full flex flex-col bg-white">
                <!-- Header -->
                <div class="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-20">
                    <div class="flex items-center gap-4">
                        <h1 class="text-2xl font-bold text-slate-800">${t('nav.timeline') || 'Plánovač'}</h1>

                        <div class="flex items-center bg-slate-100 rounded-lg p-1">
                            <button @click="${this._prevWeek}" class="p-1.5 hover:bg-white rounded-md transition-colors text-slate-600">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                            </button>
                            <span class="px-3 text-sm font-semibold text-slate-700 select-none">
                                ${this._formatWeekRange(this.currentWeekStart)}
                            </span>
                            <button @click="${this._nextWeek}" class="p-1.5 hover:bg-white rounded-md transition-colors text-slate-600">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                            </button>
                        </div>

                        <button @click="${this._jumpToToday}" class="text-sm font-medium text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors">
                            ${t('common.today') || 'Dnes'}
                        </button>
                    </div>

                    <div class="flex items-center gap-2 text-xs text-slate-400">
                         <span class="hidden md:inline">Tip: Přetáhněte lekce do kalendáře</span>
                    </div>
                </div>

                <div class="flex-1 overflow-hidden flex">
                    <!-- Sidebar: Unscheduled -->
                    <div class="w-64 md:w-72 lg:w-80 border-r border-slate-200 flex flex-col bg-slate-50 flex-shrink-0">
                        <div class="p-4 border-b border-slate-200 bg-slate-50">
                            <h3 class="font-bold text-slate-700 flex items-center justify-between">
                                <span>${t('timeline.backlog') || 'Zásobník'}</span>
                                <span class="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full">${unscheduledLessons.length}</span>
                            </h3>
                        </div>

                        <div
                            class="flex-1 overflow-y-auto p-3 custom-scrollbar"
                            @dragover="${this._handleDragOver}"
                            @drop="${this._handleDropOnBacklog}"
                        >
                            ${this.isLoading ? html`
                                <div class="flex justify-center p-4"><div class="spinner w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>
                            ` : nothing}

                            ${!this.isLoading && unscheduledLessons.length === 0 ? html`
                                <div class="text-center p-8 text-slate-400 text-sm">
                                    Vše naplánováno! 🎉
                                </div>
                            ` : unscheduledLessons.map(lesson => this._renderLessonCard(lesson))}

                             <!-- Drop target area filler -->
                             <div class="h-24 flex items-center justify-center text-slate-300 text-xs border-2 border-dashed border-transparent hover:border-slate-300 rounded-lg transition-colors">
                                Přesunout do zásobníku
                            </div>
                        </div>
                    </div>

                    <!-- Main Grid -->
                    <div class="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar bg-white">
                        <div class="h-full flex min-w-max">
                             ${weekDays.map(date => this._renderDayColumn(date))}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('timeline-view', TimelineView);

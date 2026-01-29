import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { ProfessorDataService } from '../../services/professor-data-service.js';
import { translationService } from '../../utils/translation-service.js';
import { showToast } from '../../utils/utils.js';

const STATUS_STYLES = {
    draft: { bg: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-800' },
    scheduled: { bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-800' },
    live: { bg: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-800' }
};

export class TimelineView extends LitElement {
    static properties = {
        lessons: { state: true },
        isLoading: { state: true },
        currentMonthStart: { state: true },
        _draggedLessonId: { state: true },
        selectedGroupFilter: { state: true },
        _expandedDates: { state: true }
    };

    createRenderRoot() { return this; } // Light DOM enabled

    constructor() {
        super();
        this.lessons = [];
        this.isLoading = true;
        this.dataService = new ProfessorDataService();
        this._draggedLessonId = null;
        this.selectedGroupFilter = 'all';
        this._expandedDates = new Set();

        // Initialize to current month's first day
        this.currentMonthStart = this._getStartOfMonth(new Date());
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

    _getStartOfMonth(date) {
        const d = new Date(date);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    _generateMonthDays(startOfMonth) {
        const days = [];
        const year = startOfMonth.getFullYear();
        const month = startOfMonth.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        // Monday based index (Mon=0 ... Sun=6)
        let startDayIndex = firstDay.getDay() - 1;
        if (startDayIndex === -1) startDayIndex = 6;

        // Padding for previous month
        for (let i = 0; i < startDayIndex; i++) {
             days.push(null);
        }

        // Current month days
        for (let d = 1; d <= lastDay.getDate(); d++) {
            days.push(new Date(year, month, d));
        }

        // Padding for next month to complete the grid
        while (days.length % 7 !== 0) {
            days.push(null);
        }

        return days;
    }

    _nextMonth() {
        const next = new Date(this.currentMonthStart);
        next.setMonth(next.getMonth() + 1);
        this.currentMonthStart = next;
    }

    _prevMonth() {
        const prev = new Date(this.currentMonthStart);
        prev.setMonth(prev.getMonth() - 1);
        this.currentMonthStart = prev;
    }

    _goToToday() {
        this.currentMonthStart = this._getStartOfMonth(new Date());
    }

    _isSameDay(d1, d2) {
        if (!d1 || !d2) return false;
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    }

    _isToday(date) {
        return this._isSameDay(date, new Date());
    }

    _formatDateRange(start) {
        const options = { month: 'long', year: 'numeric' };
        const fmt = new Intl.DateTimeFormat(translationService.currentLanguage || 'cs-CZ', options);
        const s = fmt.format(start);
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    // --- Data Helpers ---

    _getFilteredLessons() {
        if (this.selectedGroupFilter === 'all') return this.lessons;
        return this.lessons.filter(l => l.assignedToGroups?.includes(this.selectedGroupFilter));
    }

    _getLessonsForDay(date) {
        if (!date) return [];
        const lessons = this._getFilteredLessons();
        return lessons.filter(l => {
            if (!l.availableFrom) return false;
            const lDate = new Date(l.availableFrom);
            return this._isSameDay(lDate, date);
        }).sort((a, b) => new Date(a.availableFrom) - new Date(b.availableFrom));
    }

    _getUnscheduledLessons() {
        const lessons = this._getFilteredLessons();
        return lessons.filter(l => !l.availableFrom);
    }

    _getLessonStatus(lesson) {
        if (!lesson.isPublished || !lesson.availableFrom) return 'draft';

        const now = new Date();
        const availableDate = new Date(lesson.availableFrom);

        if (availableDate > now) return 'scheduled';
        return 'live';
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
        if (!date) return; // Cannot drop on padding cells

        const lessonId = e.dataTransfer.getData('text/plain');
        if (!lessonId) return;

        const lessonIndex = this.lessons.findIndex(l => l.id === lessonId);
        if (lessonIndex > -1) {
            const originalLesson = this.lessons[lessonIndex];
            const oldFrom = originalLesson.availableFrom;
            const targetDate = new Date(date);

            // Smart Drag & Drop: Preserve original time if exists, else default to 09:00
            if (oldFrom) {
                const originalDate = new Date(oldFrom);
                targetDate.setHours(originalDate.getHours(), originalDate.getMinutes(), 0, 0);
            } else {
                targetDate.setHours(9, 0, 0, 0);
            }

            const updatedLesson = {
                ...originalLesson,
                availableFrom: targetDate.toISOString(),
                isPublished: true
            };

            this.lessons = [
                ...this.lessons.slice(0, lessonIndex),
                updatedLesson,
                ...this.lessons.slice(lessonIndex + 1)
            ];

            const success = await this.dataService.updateLessonSchedule(lessonId, targetDate, null);
            if (!success) {
                this.lessons[lessonIndex] = { ...originalLesson, availableFrom: oldFrom };
                this.lessons = [...this.lessons];
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

             const updatedLesson = { ...this.lessons[lessonIndex], availableFrom: null };
             this.lessons = [
                ...this.lessons.slice(0, lessonIndex),
                updatedLesson,
                ...this.lessons.slice(lessonIndex + 1)
            ];

             const success = await this.dataService.updateLessonSchedule(lessonId, null, null);
             if (!success) {
                 this.lessons[lessonIndex] = { ...this.lessons[lessonIndex], availableFrom: oldFrom };
                 this.lessons = [...this.lessons];
             } else {
                 showToast(translationService.t('timeline.unscheduled_success') || 'Lekce přesunuta do zásobníku', 'success');
             }
        }
    }

    async _handleDayDoubleClick(date) {
        if (!date) return;
        const targetDate = new Date(date);
        targetDate.setHours(9, 0, 0, 0);

        const newLesson = {
            title: 'Nová lekce',
            status: 'draft',
            availableFrom: targetDate.toISOString(),
            isPublished: false,
            topic: '',
            contentType: 'text',
            content: { blocks: [] },
            assignedToGroups: []
        };

        const created = await this.dataService.createLesson(newLesson);
        if (created) {
            this.lessons = [created, ...this.lessons];
            showToast('Lekce vytvořena', 'success');
        }
    }

    _toggleExpandDate(dateKey) {
        const newSet = new Set(this._expandedDates);
        if (newSet.has(dateKey)) {
            newSet.delete(dateKey);
        } else {
            newSet.add(dateKey);
        }
        this._expandedDates = newSet;
    }

    // --- Rendering ---

    _renderStatusDashboard() {
        const lessons = this._getFilteredLessons();
        const drafts = lessons.filter(l => this._getLessonStatus(l) === 'draft').length;
        const scheduled = lessons.filter(l => this._getLessonStatus(l) === 'scheduled').length;
        const live = lessons.filter(l => this._getLessonStatus(l) === 'live').length;

        return html`
            <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mb-6 flex flex-wrap gap-4 items-center justify-between">
                <div class="flex items-center gap-6">
                     <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </div>
                        <div>
                            <div class="text-2xl font-bold text-slate-800 leading-none">${drafts}</div>
                            <div class="text-xs font-bold text-slate-500 uppercase tracking-wider">Drafts</div>
                        </div>
                    </div>

                    <div class="w-px h-8 bg-slate-200"></div>

                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        </div>
                        <div>
                            <div class="text-2xl font-bold text-slate-800 leading-none">${scheduled}</div>
                            <div class="text-xs font-bold text-slate-500 uppercase tracking-wider">Scheduled</div>
                        </div>
                    </div>

                    <div class="w-px h-8 bg-slate-200"></div>

                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                        <div>
                            <div class="text-2xl font-bold text-slate-800 leading-none">${live}</div>
                            <div class="text-xs font-bold text-slate-500 uppercase tracking-wider">Active</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    _renderLessonCard(lesson) {
        const status = this._getLessonStatus(lesson);
        const style = STATUS_STYLES[status] || STATUS_STYLES.draft;
        const icon = this._getIconForTopic(lesson.topic);
        const contentTypeIcon = lesson.type === 'quiz' ? '📝' : (lesson.type === 'project' ? '🚀' : '🎥');
        // fallback icons based on type, or just label.
        // Prompt says "Show content type (Video, Quiz) as a small icon or text label inside the card."

        return html`
            <div
                draggable="true"
                @dragstart="${(e) => this._handleDragStart(e, lesson)}"
                @dragend="${this._handleDragEnd}"
                class="group relative mb-1.5 p-2 rounded-lg border-l-4 ${style.bg} ${style.border} cursor-pointer hover:shadow-md transition-all duration-200"
            >
                <!-- Popover -->
                <div class="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 w-64 bg-white text-slate-800 p-4 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none group-hover:pointer-events-auto border border-slate-100">
                     <div class="flex items-start gap-3 mb-3">
                         <span class="text-2xl">${icon}</span>
                         <div>
                             <h4 class="font-bold text-sm leading-tight text-slate-900">${lesson.title}</h4>
                             <p class="text-xs text-slate-500 mt-0.5">${lesson.subtitle || 'Žádný podtitul'}</p>
                         </div>
                     </div>

                     <div class="space-y-2 mb-4 text-xs">
                        <div class="flex justify-between border-b border-slate-100 pb-1">
                             <span class="text-slate-500">Dostupnost:</span>
                             <span class="font-medium text-slate-900">
                                 ⏰ ${lesson.availableFrom ? new Date(lesson.availableFrom).toLocaleString() : 'Nenaplánováno'}
                             </span>
                        </div>
                        <div class="flex justify-between border-b border-slate-100 pb-1">
                             <span class="text-slate-500">Skupiny:</span>
                             <span class="font-medium text-slate-900">👥 ${lesson.assignedToGroups?.length || 0}</span>
                        </div>
                     </div>

                     <button
                        @click="${(e) => {
                            e.stopPropagation();
                            this.dispatchEvent(new CustomEvent('navigate', {
                                detail: { view: 'editor', id: lesson.id, ...lesson },
                                bubbles: true,
                                composed: true
                            }));
                        }}"
                        class="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                     >
                        ✏️ Upravit lekci
                     </button>

                     <!-- Arrow -->
                     <div class="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white"></div>
                </div>

                <!-- Card Content -->
                <div class="flex items-center justify-between gap-2">
                    <div class="flex-1 min-w-0">
                        <h3 class="font-bold text-[11px] leading-tight truncate ${style.text}">${lesson.title}</h3>
                        <div class="flex items-center gap-1.5 mt-1">
                            <span class="text-[10px] opacity-75">${contentTypeIcon}</span>
                            <span class="text-[9px] opacity-75 font-mono">${lesson.availableFrom ? new Date(lesson.availableFrom).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    _renderDayCell(date) {
        if (!date) {
            // Padding cell
            return html`<div class="bg-slate-50/50 min-h-[120px] rounded-xl"></div>`;
        }

        const isToday = this._isToday(date);
        const lessons = this._getLessonsForDay(date);
        const dayNum = date.getDate();

        const dateKey = date.toDateString();
        const isExpanded = this._expandedDates.has(dateKey);
        const hasOverflow = lessons.length > 3;

        const visibleLessons = (hasOverflow && !isExpanded) ? lessons.slice(0, 3) : lessons;

        return html`
            <div
                class="min-h-[120px] bg-white rounded-xl border ${isToday ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-100'} p-2 flex flex-col group/day hover:border-blue-200 transition-colors relative"
                @dragover="${this._handleDragOver}"
                @drop="${(e) => this._handleDropOnDay(e, date)}"
                @dblclick="${() => this._handleDayDoubleClick(date)}"
            >
                <div class="flex justify-between items-start mb-2">
                    <span class="text-sm font-bold ${isToday ? 'text-blue-600' : 'text-slate-700'}">${dayNum}</span>
                    ${isToday ? html`<span class="text-[10px] font-bold text-blue-500 uppercase">Dnes</span>` : nothing}
                </div>

                <div class="flex-1 space-y-1">
                    ${visibleLessons.map(lesson => this._renderLessonCard(lesson))}

                    ${hasOverflow ? html`
                        <button
                            @click="${(e) => { e.stopPropagation(); this._toggleExpandDate(dateKey); }}"
                            class="w-full py-1.5 text-[10px] font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-lg text-center transition-colors border border-slate-100 uppercase tracking-wide"
                        >
                            ${isExpanded ? 'Méně' : `+ ${lessons.length - 3} Další`}
                        </button>
                    ` : nothing}

                    <!-- Empty state/Drop target hint -->
                    <div class="h-full min-h-[2rem] rounded-lg border-2 border-dashed border-transparent group-hover/day:border-slate-100 transition-colors flex items-center justify-center opacity-0 group-hover/day:opacity-100 pointer-events-none">
                         <span class="text-slate-300 text-lg">+</span>
                    </div>
                </div>
            </div>
        `;
    }

    async _handleClonePreviousWeek() {
        if (!confirm('Opravdu chcete zkopírovat lekce z minulého týdne?')) return;

        this.isLoading = true;

        const currentStart = new Date(this.currentMonthStart);
        const sourceStart = new Date(currentStart);
        sourceStart.setDate(sourceStart.getDate() - 7);
        const sourceEnd = new Date(currentStart);

        const sourceLessons = this.lessons.filter(l => {
            if (!l.availableFrom) return false;
            const d = new Date(l.availableFrom);
            return d >= sourceStart && d < sourceEnd;
        });

        if (sourceLessons.length === 0) {
            showToast('V minulém týdnu nebyly nalezeny žádné lekce.', 'info');
            this.isLoading = false;
            return;
        }

        const newLessons = sourceLessons.map(l => {
            const oldDate = new Date(l.availableFrom);
            const newDate = new Date(oldDate);
            newDate.setDate(newDate.getDate() + 7);

            // eslint-disable-next-line no-unused-vars
            const { id, createdAt, updatedAt, ownerId, ...rest } = l;

            return {
                ...rest,
                status: 'draft',
                isPublished: false,
                availableFrom: newDate.toISOString()
            };
        });

        const success = await this.dataService.createLessonsBatch(newLessons);
        if (success) {
            showToast(`Úspěšně zkopírováno ${newLessons.length} lekcí.`, 'success');
            await this._loadData();
        } else {
             this.isLoading = false;
        }
    }

    _renderHeader() {
        const uniqueGroups = Array.from(new Set(
            this.lessons.flatMap(l => l.assignedToGroups || [])
        )).sort();

        return html`
            <div class="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                <div class="flex items-center gap-4">
                    <button
                        @click="${this._prevMonth}"
                        class="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors"
                        title="Předchozí měsíc"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                    </button>

                    <h2 class="text-xl font-bold text-slate-800 tabular-nums min-w-[200px] text-center">
                        ${this._formatDateRange(this.currentMonthStart)}
                    </h2>

                    <button
                        @click="${this._nextMonth}"
                        class="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors"
                        title="Další měsíc"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </button>

                    <button
                        @click="${this._goToToday}"
                        class="ml-2 px-3 py-1 text-sm font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                    >
                        Dnes
                    </button>

                    <button
                        @click="${this._handleClonePreviousWeek}"
                        class="ml-2 p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Kopírovat minulý týden"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    </button>
                </div>

                <!-- Group Filter -->
                <div class="flex items-center gap-2">
                    <label for="group-filter" class="text-sm font-medium text-slate-600">Třída:</label>
                    <select
                        id="group-filter"
                        class="pl-3 pr-8 py-1.5 text-sm border-slate-200 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-slate-50 text-slate-700 font-medium"
                        .value="${this.selectedGroupFilter}"
                        @change="${(e) => this.selectedGroupFilter = e.target.value}"
                    >
                        <option value="all">Všechny třídy</option>
                        ${uniqueGroups.map(group => html`
                            <option value="${group}">${group}</option>
                        `)}
                    </select>
                </div>
            </div>
        `;
    }

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
                            class="mb-3 p-3 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow bg-white border border-slate-200"
                        >
                            <div class="flex items-start gap-2">
                                <span class="text-xl">${this._getIconForTopic(lesson.topic)}</span>
                                <div>
                                    <div class="text-xs font-bold uppercase mb-0.5 opacity-70">${lesson.contentType || 'Lekce'}</div>
                                    <div class="font-medium text-slate-800 text-sm line-clamp-2">${lesson.title}</div>
                                </div>
                            </div>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }

    _getIconForTopic(topic) {
        if (!topic) return '📚';
        const t = topic.toLowerCase();
        if (t.includes('mat')) return '📐';
        if (t.includes('fyz')) return '⚡';
        if (t.includes('chem')) return '🧪';
        if (t.includes('biol')) return '🧬';
        if (t.includes('děj') || t.includes('hist')) return '🏛️';
        if (t.includes('zem') || t.includes('geo')) return '🌍';
        if (t.includes('jazyk') || t.includes('lit')) return '📖';
        if (t.includes('it') || t.includes('inf')) return '💻';
        return '📚';
    }

    render() {
        const days = this._generateMonthDays(this.currentMonthStart);
        const weekDays = Array.from({length: 7}, (_, i) => {
            const d = new Date(2023, 0, i + 2); // Jan 2, 2023 is Monday
            return new Intl.DateTimeFormat(translationService.currentLanguage || 'cs', {weekday: 'short'}).format(d);
        });

        return html`
            <div data-tour="timeline-start" class="flex h-full bg-slate-50 overflow-hidden font-sans">
                <!-- Sidebar -->
                ${this._renderSidebar()}

                <!-- Main Content -->
                <div class="flex-1 flex flex-col h-full overflow-hidden relative">
                    ${this._renderHeader()}

                    <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
                        <div class="max-w-7xl mx-auto">

                            <!-- Dashboard -->
                            ${this._renderStatusDashboard()}

                            <!-- Calendar Grid -->
                            <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                                <!-- Weekday Headers -->
                                <div class="grid grid-cols-7 gap-4 mb-4 text-center">
                                    ${weekDays.map(d => html`<div class="text-xs font-bold text-slate-400 uppercase tracking-wider">${d}</div>`)}
                                </div>

                                <!-- Days Grid -->
                                <div class="grid grid-cols-7 gap-4 auto-rows-fr">
                                     ${days.map(date => this._renderDayCell(date))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('timeline-view', TimelineView);

import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { ProfessorDataService } from '../../services/professor-data-service.js';
import { translationService } from '../../utils/translation-service.js';
import { showToast } from '../../utils/utils.js';

const ADMIN_STYLES = {
    draft: {
        wrapper: "border-l-4 border-l-amber-400 bg-amber-50/50 hover:bg-amber-100/50",
        badge: "bg-amber-100 text-amber-700",
        icon: "text-amber-500",
        dot: "bg-amber-400"
    },
    scheduled: {
        wrapper: "border-l-4 border-l-blue-500 bg-white hover:bg-blue-50",
        badge: "bg-blue-100 text-blue-700",
        icon: "text-blue-500",
        dot: "bg-blue-500"
    },
    live: {
        wrapper: "border-l-4 border-l-emerald-500 bg-white shadow-md hover:shadow-lg",
        badge: "bg-emerald-100 text-emerald-700",
        icon: "text-emerald-600",
        dot: "bg-emerald-500"
    },
    archived: {
        wrapper: "border-l-4 border-l-slate-400 bg-slate-50 opacity-75 hover:opacity-100",
        badge: "bg-slate-200 text-slate-600",
        icon: "text-slate-500",
        dot: "bg-slate-400"
    }
};

export class TimelineView extends LitElement {
    static properties = {
        lessons: { state: true },
        isLoading: { state: true },
        currentMonthStart: { state: true },
        _draggedLessonId: { state: true }
    };

    createRenderRoot() { return this; } // Light DOM enabled

    constructor() {
        super();
        this.lessons = [];
        this.isLoading = true;
        this.dataService = new ProfessorDataService();
        this._draggedLessonId = null;

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
        const lastDayOfMonth = new Date(year, month + 1, 0);

        // Vertical Timeline: Generate all days of the month strictly
        for (let d = 1; d <= lastDayOfMonth.getDate(); d++) {
            days.push(new Date(year, month, d));
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
        // Scroll to today?
        setTimeout(() => {
             const todayEl = this.querySelector('[data-is-today="true"]');
             if (todayEl) todayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
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
        const options = { month: 'long', year: 'numeric' };
        const fmt = new Intl.DateTimeFormat(translationService.currentLanguage || 'cs-CZ', options);
        const s = fmt.format(start);
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    _formatDayName(date) {
        return new Intl.DateTimeFormat(translationService.currentLanguage || 'cs-CZ', { weekday: 'long' }).format(date);
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

    _getAdminLessonStatus(lesson) {
        if (!lesson.isPublished && lesson.status !== 'published') return 'draft'; // Check both possible flags
        if (!lesson.availableFrom) return 'draft';

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
        const lessonId = e.dataTransfer.getData('text/plain');
        if (!lessonId) return;

        const lessonIndex = this.lessons.findIndex(l => l.id === lessonId);
        if (lessonIndex > -1) {
            const oldFrom = this.lessons[lessonIndex].availableFrom;
            const targetDate = new Date(date);
            targetDate.setHours(9, 0, 0, 0);

            // Optimistic Update
            const updatedLesson = {
                ...this.lessons[lessonIndex],
                availableFrom: targetDate.toISOString(),
                isPublished: true // Assume dragging to calendar implies intent to publish/schedule? Or keep status?
                // Keeping status as is, but logic says scheduled if published.
            };

            // Re-create array to trigger update
            this.lessons = [
                ...this.lessons.slice(0, lessonIndex),
                updatedLesson,
                ...this.lessons.slice(lessonIndex + 1)
            ];

            const success = await this.dataService.updateLessonSchedule(lessonId, targetDate, null);
            if (!success) {
                // Revert
                this.lessons[lessonIndex] = { ...this.lessons[lessonIndex], availableFrom: oldFrom };
                this.lessons = [...this.lessons]; // trigger update
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

    // --- Rendering ---

    _renderStatusDashboard() {
        // Calculate counts based on current month's view? Or global?
        // Prompt says "Insert a summary card at the top of the view".
        // Usually dashboards reflect global state or current view. Let's do current view (filtered by month) to match the timeline context,
        // OR global if it's "My Planner".
        // Let's do Global for Drafts, but maybe current view for Scheduled?
        // Actually, simple counts of what's in 'this.lessons' (which is all lessons) is best.

        const drafts = this.lessons.filter(l => this._getAdminLessonStatus(l) === 'draft').length;
        const scheduled = this.lessons.filter(l => this._getAdminLessonStatus(l) === 'scheduled').length;
        const live = this.lessons.filter(l => this._getAdminLessonStatus(l) === 'live').length;

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
        const status = this._getAdminLessonStatus(lesson);
        const style = ADMIN_STYLES[status] || ADMIN_STYLES.draft;
        const icon = this._getIconForTopic(lesson.topic);

        return html`
            <div
                draggable="true"
                @dragstart="${(e) => this._handleDragStart(e, lesson)}"
                @dragend="${this._handleDragEnd}"
                class="group relative mb-3 rounded-r-xl transition-all duration-200 ${style.wrapper} p-4 cursor-pointer"
            >
                <!-- Popover (X-Ray) -->
                <div class="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 bg-slate-900 text-white p-4 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none group-hover:pointer-events-auto">
                     <div class="flex items-start gap-3 mb-3">
                         <span class="text-2xl">${icon}</span>
                         <div>
                             <h4 class="font-bold text-sm leading-tight">${lesson.title}</h4>
                             <p class="text-xs text-slate-400 mt-0.5">${lesson.subtitle || 'Žádný podtitul'}</p>
                         </div>
                     </div>

                     <div class="space-y-2 mb-4 text-xs">
                        <div class="flex justify-between border-b border-slate-700 pb-1">
                             <span class="text-slate-400">Dostupnost:</span>
                             <span class="font-medium">${lesson.availableFrom ? new Date(lesson.availableFrom).toLocaleDateString() : 'Nenaplánováno'}</span>
                        </div>
                        <div class="flex justify-between border-b border-slate-700 pb-1">
                             <span class="text-slate-400">Skupiny:</span>
                             <span class="font-medium">${lesson.assignedToGroups?.length || 0} tříd</span>
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
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        Upravit lekci
                     </button>

                     <!-- Arrow -->
                     <div class="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-900"></div>
                </div>

                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                             <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${style.badge}">
                                ${status.toUpperCase()}
                             </span>
                             <span class="text-xs text-slate-500 font-medium flex items-center gap-1">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                ${lesson.availableFrom ? new Date(lesson.availableFrom).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}
                             </span>
                        </div>
                        <h3 class="font-bold text-slate-800 leading-snug">${lesson.title}</h3>
                    </div>

                    <button
                         class="text-slate-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                         @click="${(e) => {
                             e.stopPropagation();
                             this._handleDropOnBacklog({ preventDefault:()=>{}, dataTransfer: { getData: () => lesson.id } });
                         }}"
                         title="Vrátit do zásobníku"
                    >
                         <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
            </div>
        `;
    }

    _renderTimelineItem(date) {
        const isToday = this._isToday(date);
        const lessons = this._getLessonsForDay(date);
        const hasLessons = lessons.length > 0;

        // Date Badge Logic
        const dayName = this._formatDayName(date).slice(0, 3).toUpperCase();
        const dayNum = date.getDate();

        return html`
            <div
                class="relative pl-24 min-h-[5rem] group/day"
                data-is-today="${isToday}"
                @dragover="${this._handleDragOver}"
                @drop="${(e) => this._handleDropOnDay(e, date)}"
            >
                <!-- Vertical Line (Connector) -->
                <div class="absolute left-[5.5rem] top-0 bottom-0 w-px bg-slate-200 group-hover/day:bg-slate-300 transition-colors"></div>

                <!-- Date Badge (Left Column) -->
                <div class="absolute left-0 top-0 w-16 text-right pr-4 pt-2">
                    <div class="text-[10px] font-bold tracking-wider ${isToday ? 'text-blue-600' : 'text-slate-400'} uppercase">
                        ${dayName}
                    </div>
                    <div class="text-2xl font-black ${isToday ? 'text-blue-600' : 'text-slate-800'} leading-none">
                        ${dayNum}
                    </div>
                    ${isToday ? html`<div class="text-[9px] font-bold text-blue-500 mt-1">DNES</div>` : nothing}
                </div>

                <!-- Timeline Dot -->
                <div class="absolute left-[5.5rem] top-4 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white ring-1 ${isToday ? 'ring-blue-500 bg-blue-500' : 'ring-slate-200 bg-slate-100'} z-10"></div>

                <!-- Main Content (Cards) -->
                <div class="pb-8 pt-1 pr-4">
                    ${lessons.length > 0 ? html`
                        <div class="space-y-1">
                            ${lessons.map(lesson => this._renderLessonCard(lesson))}
                        </div>
                    ` : html`
                         <!-- Empty Slot Placeholder (Drop Target Visual) -->
                         <div class="h-12 rounded-xl border-2 border-dashed border-slate-100 hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center justify-center text-slate-300 text-xs font-medium cursor-default opacity-0 group-hover/day:opacity-100">
                             + Naplánovat lekci
                         </div>
                    `}
                </div>
            </div>
        `;
    }

    _renderHeader() {
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

        return html`
            <div data-tour="timeline-start" class="flex h-full bg-slate-50 overflow-hidden font-sans">
                <!-- Sidebar -->
                ${this._renderSidebar()}

                <!-- Main Content -->
                <div class="flex-1 flex flex-col h-full overflow-hidden relative">
                    ${this._renderHeader()}

                    <div class="flex-1 overflow-y-auto custom-scrollbar">
                        <div class="max-w-4xl mx-auto px-6 py-8">

                            <!-- Dashboard -->
                            ${this._renderStatusDashboard()}

                            <!-- Vertical Timeline -->
                            <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 min-h-[500px]">
                                <div class="relative">
                                     ${days.map(date => this._renderTimelineItem(date))}
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

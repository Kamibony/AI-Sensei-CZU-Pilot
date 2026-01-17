import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Timeline } from 'https://esm.sh/vis-timeline?bundle';
import { DataSet } from 'https://esm.sh/vis-data?bundle';
import { ProfessorDataService } from '../../services/professor-data-service.js';
import { translationService } from '../../utils/translation-service.js';
import { showToast } from '../../utils/utils.js';

export class TimelineView extends LitElement {
    static properties = {
        lessons: { state: true },
        isLoading: { state: true }
    };

    constructor() {
        super();
        this.lessons = [];
        this.isLoading = true;
        this.dataService = new ProfessorDataService();
        this.timeline = null;
        this.items = null;
        this._unscheduledLessons = [];
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._injectStyles();
        this._loadData();
    }

    _injectStyles() {
        if (!document.getElementById('vis-timeline-css')) {
            const link = document.createElement('link');
            link.id = 'vis-timeline-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/vis-timeline/styles/vis-timeline-graph2d.min.css';
            document.head.appendChild(link);
        }
    }

    async _loadData() {
        this.isLoading = true;
        this.lessons = await this.dataService.fetchLessons();
        this._updateLists();
        this.isLoading = false;

        // Wait for render then init timeline
        setTimeout(() => this._initTimeline(), 0);
    }

    _updateLists() {
        this._unscheduledLessons = this.lessons.filter(l => !l.availableFrom);
        if (this.items) {
            const scheduled = this.lessons
                .filter(l => l.availableFrom)
                .map(this._mapLessonToItem.bind(this))
                .filter(item => item !== null);
            this.items.clear();
            this.items.add(scheduled);
        }
        this.requestUpdate();
    }

    _mapLessonToItem(lesson) {
        const start = new Date(lesson.availableFrom);
        if (isNaN(start.getTime())) return null;

        let end = lesson.availableUntil ? new Date(lesson.availableUntil) : null;
        
        // If no end date, default to 1 week duration for visualization or point?
        // Prompt says "assume a default duration (e.g., 1 week) or just a point in time".
        // Let's ensure it has an end for visualization if it's a range.
        // If availableUntil is null, we can treat it as a point or a range.
        // Let's try point if availableUntil is null, unless we want to enforce duration.
        // But for "Interactive Lesson Planner", ranges are usually better.
        
        if (!end || isNaN(end.getTime())) {
             end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
        }

        const now = new Date();
        let className = 'bg-blue-500 border-blue-600 text-white'; // Future
        if (end < now) {
            className = 'bg-gray-400 border-gray-500 text-white'; // Past
        } else if (start <= now && end >= now) {
            className = 'bg-green-500 border-green-600 text-white'; // Active
        }

        return {
            id: lesson.id,
            content: `<span class="font-semibold text-sm">${lesson.title}</span>`,
            start: start,
            end: end,
            className: `${className} rounded shadow-sm opacity-90 hover:opacity-100`,
            title: lesson.topic || lesson.title // Tooltip
        };
    }

    _initTimeline() {
        const container = this.querySelector('#timeline-visualization');
        if (!container) return;

        // Destroy existing if any
        if (this.timeline) {
            this.timeline.destroy();
        }

        const scheduledLessons = this.lessons
            .filter(l => l.availableFrom)
            .map(this._mapLessonToItem.bind(this))
            .filter(item => item !== null);

        this.items = new DataSet(scheduledLessons);

        const options = {
            height: '100%',
            minHeight: '400px',
            editable: {
                add: false,         // handled by drag-drop
                updateTime: true,
                updateGroup: false,
                remove: true        // allow removing (unscheduling)
            },
            onMove: this._onMoveItem.bind(this),
            onRemove: this._onRemoveItem.bind(this),
            tooltip: {
                followMouse: true
            },
            margin: {
                item: 10
            },
            orientation: 'top'
        };

        this.timeline = new Timeline(container, this.items, options);
        
        // Handle drop from sidebar
        // We need to bind these events to the container div in render
    }

    async _onMoveItem(item, callback) {
        const success = await this.dataService.updateLessonSchedule(
            item.id,
            item.start,
            item.end
        );

        if (success) {
            // Update local state to reflect change
            const lesson = this.lessons.find(l => l.id === item.id);
            if (lesson) {
                lesson.availableFrom = item.start;
                lesson.availableUntil = item.end;
                this._updateLists(); // Re-calc colors
            }
            callback(item);
        } else {
            callback(null); // Cancel move
        }
    }

    async _onRemoveItem(item, callback) {
        if (confirm(translationService.t('timeline.confirm_remove'))) {
            const success = await this.dataService.updateLessonSchedule(item.id, null, null);
            if (success) {
                 const lesson = this.lessons.find(l => l.id === item.id);
                 if (lesson) {
                     lesson.availableFrom = null;
                     lesson.availableUntil = null;
                     this._updateLists();
                 }
                 callback(item);
            } else {
                callback(null);
            }
        } else {
            callback(null);
        }
    }

    _handleDragStart(e, lesson) {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', lesson.id);
        e.dataTransfer.setData('application/json', JSON.stringify(lesson));
    }

    async _handleDrop(e) {
        e.preventDefault();
        const container = this.querySelector('#timeline-visualization');
        if (!container || !this.timeline) return;

        const lessonId = e.dataTransfer.getData('text/plain');
        if (!lessonId) return;

        // Calculate time from drop position
        const props = this.timeline.getEventProperties(e);
        const dropTime = props.time;

        const start = dropTime;
        const end = new Date(dropTime.getTime() + 7 * 24 * 60 * 60 * 1000); // Default 1 week

        const success = await this.dataService.updateLessonSchedule(lessonId, start, end);
        if (success) {
            const lesson = this.lessons.find(l => l.id === lessonId);
            if (lesson) {
                lesson.availableFrom = start;
                lesson.availableUntil = end;
                this._updateLists();
                
                // Manually add to items because _updateLists might not trigger full redraw if items are same obj
                // But _updateLists calls this.items.add(scheduled) after clearing?
                // Wait, _updateLists clears and re-adds. That works.
                showToast(translationService.t('timeline.scheduled_success'), 'success');
            }
        }
    }

    _handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }

    render() {
        const t = (key) => translationService.t(key);

        return html`
            <div class="h-full flex flex-col bg-slate-50/50">
                <!-- Header -->
                <div class="px-8 py-6 border-b border-slate-200 bg-white shadow-sm flex justify-between items-center z-10">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">${t('nav.timeline')}</h1>
                        <p class="text-slate-500 text-sm mt-1">${t('timeline.subtitle')}</p>
                    </div>
                    <div class="flex items-center gap-2 text-sm text-slate-500">
                         <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-green-500"></span> ${t('dashboard.active_lessons')}</span>
                         <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-blue-500"></span> ${t('common.new')}</span>
                         <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-gray-400"></span> ${t('status.archived')}</span>
                    </div>
                </div>

                <div class="flex-1 overflow-hidden p-6">
                    <div class="h-full grid grid-cols-12 gap-6">
                        <!-- Sidebar: Unscheduled -->
                        <div class="col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                            <div class="p-4 border-b border-slate-100 bg-slate-50">
                                <h3 class="font-bold text-slate-700">Nestanoveno</h3>
                                <p class="text-xs text-slate-400 mt-1">Přetáhněte do kalendáře</p>
                            </div>
                            <div class="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                                ${this.isLoading ? html`<div class="text-center p-4">Loading...</div>` : ''}
                                ${!this.isLoading && this._unscheduledLessons.length === 0 ? html`
                                    <div class="text-center p-8 text-slate-400 text-sm">
                                        Vše naplánováno! 🎉
                                    </div>
                                ` : this._unscheduledLessons.map(lesson => html`
                                    <div
                                        draggable="true"
                                        @dragstart="${(e) => this._handleDragStart(e, lesson)}"
                                        class="p-3 bg-white border border-slate-200 rounded-lg shadow-sm cursor-grab hover:border-indigo-300 hover:shadow-md transition-all active:cursor-grabbing group">
                                        <div class="flex items-center justify-between mb-1">
                                            <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">${lesson.subject || 'Obecné'}</span>
                                            <span class="text-lg opacity-50 group-hover:opacity-100 transition-opacity">⋮⋮</span>
                                        </div>
                                        <h4 class="font-semibold text-slate-800 text-sm line-clamp-2">${lesson.title}</h4>
                                    </div>
                                `)}
                            </div>
                        </div>

                        <!-- Main: Timeline -->
                        <div class="col-span-9 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden relative">
                             <div
                                id="timeline-visualization"
                                class="w-full h-full"
                                @dragover="${this._handleDragOver}"
                                @drop="${this._handleDrop}"
                             ></div>

                             <!-- Help Tooltip -->
                             <div class="absolute bottom-4 right-4 bg-white/90 backdrop-blur border border-slate-200 p-3 rounded-lg shadow-lg text-xs text-slate-600 max-w-xs z-10">
                                <p class="font-semibold mb-1">💡 Tip:</p>
                                <p>Přetáhněte lekce z levého panelu. Upravte délku trvání tažením okrajů.</p>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('timeline-view', TimelineView);

import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../utils/localization-mixin.js';
import { db, functions } from '../firebase-init.js';
import { showToast } from '../utils/utils.js';
import { doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

export class MagicBoardView extends Localized(LitElement) {
    static properties = {
        lessonId: { type: String },
        readOnly: { type: Boolean },
        _isGenerating: { state: true },
        _isSaving: { state: true },
        _activeTool: { state: true }
    };

    constructor() {
        super();
        this._activeTool = 'select';
        this._unsubscribe = null;
        this.canvas = null;
        this._saveTimeout = null;
    }

    createRenderRoot() {
        return this; // Light DOM for Fabric.js compatibility
    }

    firstUpdated() {
        this._initCanvas();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubscribe) this._unsubscribe();
        if (this._resizeObserver) this._resizeObserver.disconnect();
        if (this.canvas) {
            this.canvas.dispose();
        }
    }

    updated(changedProperties) {
        if (changedProperties.has('readOnly') && this.canvas) {
            this._updateCanvasState();
        }
        if (changedProperties.has('lessonId') && this.lessonId) {
            this._setupRealtimeSync();
        }
    }

    _initCanvas() {
        const canvasEl = this.querySelector('canvas');
        if (!canvasEl) return;

        // Initialize Fabric
        this.canvas = new fabric.Canvas(canvasEl, {
            isDrawingMode: false,
            selection: !this.readOnly
        });

        // Resize Observer
        this._resizeObserver = new ResizeObserver(() => this._handleResize());
        this._resizeObserver.observe(this);

        // Event Listeners for Saving
        this.canvas.on('object:modified', () => this._debouncedSave());
        this.canvas.on('object:added', () => this._debouncedSave());
        this.canvas.on('object:removed', () => this._debouncedSave());
        this.canvas.on('path:created', () => this._debouncedSave()); // For drawing mode

        this._updateCanvasState();
        if (this.lessonId) this._setupRealtimeSync();
    }

    _handleResize() {
        if (!this.canvas) return;
        const rect = this.getBoundingClientRect();
        this.canvas.setDimensions({ width: rect.width, height: rect.height });
        this.canvas.renderAll();
    }

    _updateCanvasState() {
        if (!this.canvas) return;

        this.canvas.selection = !this.readOnly;
        this.canvas.forEachObject(obj => {
            obj.selectable = !this.readOnly;
            obj.evented = !this.readOnly;
        });

        if (this.readOnly) {
            this.canvas.isDrawingMode = false;
        } else if (this._activeTool === 'pencil') {
            this.canvas.isDrawingMode = true;
        }

        this.canvas.requestRenderAll();
    }

    _setupRealtimeSync() {
        if (this._unsubscribe) this._unsubscribe();
        if (!this.lessonId) return;

        const docRef = doc(db, `lessons/${this.lessonId}/features/whiteboard`);
        this._unsubscribe = onSnapshot(docRef, (snap) => {
            if (snap.exists() && !this._isSaving) { // Avoid overwriting while saving
                const data = snap.data();
                if (data.canvasData) {
                    this.canvas.loadFromJSON(data.canvasData, () => {
                        this.canvas.renderAll();
                        this._updateCanvasState(); // Re-apply read-only logic
                    });
                }
            }
        });
    }

    async _debouncedSave() {
        if (this.readOnly || !this.lessonId) return;

        if (this._saveTimeout) clearTimeout(this._saveTimeout);
        this._isSaving = true;

        this._saveTimeout = setTimeout(async () => {
            try {
                const json = this.canvas.toJSON();
                await setDoc(doc(db, `lessons/${this.lessonId}/features/whiteboard`), {
                    canvasData: json,
                    updatedAt: new Date().toISOString()
                });
                this._isSaving = false;
                this.requestUpdate();
            } catch (e) {
                console.error("Error saving whiteboard:", e);
                this._isSaving = false;
            }
        }, 1000);
    }

    _setTool(tool) {
        if (this.readOnly) return;
        this._activeTool = tool;

        this.canvas.isDrawingMode = false;

        if (tool === 'pencil') {
            this.canvas.isDrawingMode = true;
            this.canvas.freeDrawingBrush.width = 5;
            this.canvas.freeDrawingBrush.color = "black";
        } else if (tool === 'rectangle') {
            const rect = new fabric.Rect({
                left: 100, top: 100, fill: 'transparent', stroke: 'black', width: 100, height: 100, strokeWidth: 2
            });
            this.canvas.add(rect);
            this.canvas.setActiveObject(rect);
            this._activeTool = 'select'; // Switch back after adding
        } else if (tool === 'circle') {
            const circle = new fabric.Circle({
                left: 100, top: 100, fill: 'transparent', stroke: 'black', radius: 50, strokeWidth: 2
            });
            this.canvas.add(circle);
            this.canvas.setActiveObject(circle);
            this._activeTool = 'select';
        } else if (tool === 'text') {
            const text = new fabric.IText(this.t('whiteboard.toolbar.text'), {
                left: 100, top: 100, fontSize: 20
            });
            this.canvas.add(text);
            this.canvas.setActiveObject(text);
            this._activeTool = 'select';
        }
    }

    _clearCanvas() {
        if (confirm(this.t('common.delete_confirm'))) {
            this.canvas.clear();
            this.canvas.setBackgroundColor('#f8fafc', this.canvas.renderAll.bind(this.canvas));
            this._debouncedSave();
        }
    }

    async _handleMagicGen() {
        const input = this.querySelector('#magic-input');
        const prompt = input.value;
        if (!prompt) return;

        this._isGenerating = true;
        try {
            const generateDiagram = httpsCallable(functions, 'generateDiagramElement');
            const result = await generateDiagram({ prompt });

            if (result.data && result.data.objects) {
                // Load objects and add them to canvas
                fabric.util.enlivenObjects(result.data.objects, (objects) => {
                    objects.forEach((o) => {
                        this.canvas.add(o);
                    });
                    this.canvas.renderAll();
                    this._debouncedSave();
                });
            }
            input.value = '';
        } catch (e) {
            console.error("Magic generation failed:", e);
            showToast(this.t('common.magic_error'), true);
        } finally {
            this._isGenerating = false;
        }
    }

    render() {
        return html`
            <style>
                magic-board-view {
                    display: block;
                    width: 100%;
                    height: 100%;
                    position: relative;
                    background-color: #f8fafc;
                    border-radius: 1rem;
                    overflow: hidden;
                }
                .toolbar {
                    position: absolute;
                    top: 1rem;
                    left: 50%;
                    transform: translateX(-50%);
                    background: white;
                    padding: 0.5rem;
                    border-radius: 0.75rem;
                    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
                    display: flex;
                    gap: 0.5rem;
                    z-index: 10;
                }
                .ai-panel {
                    position: absolute;
                    bottom: 1rem;
                    left: 50%;
                    transform: translateX(-50%);
                    background: white;
                    padding: 0.5rem;
                    border-radius: 0.75rem;
                    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
                    display: flex;
                    gap: 0.5rem;
                    z-index: 10;
                    width: 90%;
                    max-width: 500px;
                }
                .canvas-container {
                    width: 100%;
                    height: 100%;
                }
                .toolbar button {
                    padding: 0.5rem;
                    border-radius: 0.5rem;
                    border: 1px solid #e2e8f0;
                    background: white;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .toolbar button:hover {
                    background: #f1f5f9;
                }
                .toolbar button.active {
                    background: #eff6ff;
                    border-color: #6366f1;
                    color: #4f46e5;
                }
                .ai-panel input {
                    flex: 1;
                    border: 1px solid #e2e8f0;
                    border-radius: 0.5rem;
                    padding: 0.5rem;
                }
                .ai-panel button {
                    padding: 0.5rem;
                    border-radius: 0.5rem;
                    border: 1px solid #e2e8f0;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .spinner {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            </style>
            <div class="relative w-full h-full bg-slate-50 rounded-xl overflow-hidden shadow-inner border border-slate-200">
                ${!this.readOnly ? html`
                    <div class="toolbar">
                        <button class="${this._activeTool === 'select' ? 'active' : ''}" @click=${() => this._setTool('select')} title="Select">👆</button>
                        <button class="${this._activeTool === 'pencil' ? 'active' : ''}" @click=${() => this._setTool('pencil')} title="${this.t('whiteboard.toolbar.pencil')}">✏️</button>
                        <button @click=${() => this._setTool('rectangle')} title="${this.t('whiteboard.toolbar.rectangle')}">⬜</button>
                        <button @click=${() => this._setTool('circle')} title="${this.t('whiteboard.toolbar.circle')}">⭕</button>
                        <button @click=${() => this._setTool('text')} title="${this.t('whiteboard.toolbar.text')}">T</button>
                        <div class="w-px bg-slate-200 mx-1"></div>
                        <button @click=${this._clearCanvas} title="${this.t('whiteboard.toolbar.clear')}" class="text-red-500 hover:bg-red-50">🗑️</button>
                        ${this._isSaving ? html`<span class="text-xs text-slate-400 self-center px-2">${this.t('common.saving')}</span>` : ''}
                    </div>

                    <div class="ai-panel">
                        <input id="magic-input" type="text" placeholder="${this.t('whiteboard.ai_prompt_placeholder')}" @keydown=${(e) => e.key === 'Enter' && this._handleMagicGen()}>
                        <button @click=${this._handleMagicGen} class="bg-gradient-to-r from-indigo-500 to-purple-500 text-white border-none font-bold flex items-center gap-2">
                            ${this._isGenerating ? html`<div class="spinner w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>` : '✨'}
                            ${this.t('whiteboard.magic_btn')}
                        </button>
                    </div>
                ` : ''}

                <canvas id="c"></canvas>
            </div>
        `;
    }
}
customElements.define('magic-board-view', MagicBoardView);

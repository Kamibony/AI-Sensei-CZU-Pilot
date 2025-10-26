// public/js/views/professor/editor/editor-view-video.js
import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, updateDoc, deleteField, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../../firebase-init.js';
import { showToast } from '../../../utils.js';

// === Definícia Štýlov Tlačidiel ===
const btnBase = "px-5 py-2 font-semibold rounded-lg transition transform hover:scale-105 disabled:opacity-50 disabled:scale-100 flex items-center justify-center";
const btnPrimary = `${btnBase} bg-green-700 text-white hover:bg-green-800`; // Uložiť
const btnDestructive = `${btnBase} bg-red-100 text-red-700 hover:bg-red-200`; // Smazat
// ===================================

export class EditorViewVideo extends LitElement {
    static properties = {
        lesson: { type: Object },
        _currentLesson: { state: true, type: Object },
        _videoId: { state: true, type: String },
        _isLoading: { state: true, type: Boolean },
    };

    constructor() {
        super();
        this.lesson = null;
        this._currentLesson = null;
        this._videoId = null;
        this._isLoading = false;
    }

    createRenderRoot() { return this; }

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson')) {
            this._currentLesson = this.lesson ? { ...this.lesson } : null;
            this._updateVideoId(this.lesson?.videoUrl || '');
        }
    }

    _updateVideoId(url) {
        if (!url) { this._videoId = null; return false; }
        const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?#]+)/);
        this._videoId = videoIdMatch ? videoIdMatch[1] : null;
        return !!this._videoId;
    }

    async _handleSaveVideo() {
        if (!this._currentLesson?.id) { showToast("Nejprve uložte detaily lekce.", true); return; }
        const urlInput = this.querySelector('#youtube-url');
        const url = urlInput ? urlInput.value.trim() : '';
        if (url === '') { await this._handleDeleteVideo(); return; }
        if (!this._updateVideoId(url)) { showToast("Zadajte platnú YouTube URL adresu.", true); return; }

        this._isLoading = true;
        try {
            const lessonRef = doc(firebaseInit.db, 'lessons', this._currentLesson.id);
            await updateDoc(lessonRef, { videoUrl: url, updatedAt: serverTimestamp() });
            const updatedLesson = { ...this._currentLesson, videoUrl: url };
            this._currentLesson = updatedLesson;
            showToast("Odkaz na video byl uložen.");
            this.dispatchEvent(new CustomEvent('lesson-updated', { detail: updatedLesson, bubbles: true, composed: true }));
        } catch (e) { showToast("Chyba při ukládání videa.", true); }
        finally { this._isLoading = false; }
    }

    async _handleDeleteVideo() {
        if (!this._currentLesson?.id || !this._currentLesson.videoUrl) return;
        this._isLoading = true;
        try {
            const lessonRef = doc(firebaseInit.db, 'lessons', this._currentLesson.id);
            await updateDoc(lessonRef, { videoUrl: deleteField(), updatedAt: serverTimestamp() });
            const updatedLesson = { ...this._currentLesson }; delete updatedLesson.videoUrl;
            this._currentLesson = updatedLesson;
            const urlInput = this.querySelector('#youtube-url'); if (urlInput) urlInput.value = '';
            this._updateVideoId('');
            showToast("Odkaz na video byl smazán.");
            this.dispatchEvent(new CustomEvent('lesson-updated', { detail: updatedLesson, bubbles: true, composed: true }));
        } catch (e) { showToast("Chyba při mazání videa.", true); }
        finally { this._isLoading = false; }
    }

    render() {
        return html`
            <div class="flex justify-between items-start mb-6">
                <h2 class="text-3xl font-extrabold text-slate-800">Vložení videa</h2>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-lg">
                <p class="text-slate-500 mb-4">Vložte odkaz na video z YouTube.</p>
                <div>
                    <label class="block font-medium text-slate-600">YouTube URL</label>
                    <input id="youtube-url" type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1" .value="${this._currentLesson?.videoUrl || ''}" placeholder="https://www.youtube.com/watch?v=...">
                </div>
                <div class="text-right pt-4 flex justify-end space-x-2"> ${this._currentLesson?.videoUrl ? html`
                        <button @click=${this._handleDeleteVideo} ?disabled=${this._isLoading} class="${btnDestructive} px-4 py-2 text-sm"> ${this._isLoading ? 'Mažu...' : '🗑️ Smazat video'}
                        </button>` : nothing}
                    <button @click=${this._handleSaveVideo} ?disabled=${this._isLoading} class="${btnPrimary} px-6"> ${this._isLoading ? html`<div class="spinner"></div><span class="ml-2">Ukládám...</span>` : 'Uložit odkaz'}
                    </button>
                </div>
                <div id="video-preview" class="mt-6 border-t pt-6">
                    ${this._videoId ? html`
                        <div class="rounded-xl overflow-hidden aspect-video mx-auto max-w-2xl shadow-lg">
                            <iframe src="https://www.youtube.com/embed/${this._videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="w-full h-full"></iframe>
                        </div>` : html`<div class="text-center p-8 text-slate-400">Náhled videa se zobrazí zde...</div>`}
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-video', EditorViewVideo);

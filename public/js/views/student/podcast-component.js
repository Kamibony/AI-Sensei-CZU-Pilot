import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { translationService } from '../../utils/translation-service.js';

export class PodcastComponent extends LitElement {
    static properties = {
        podcastData: { type: Object }, // Obsahuje text skriptu
        audioPath: { type: String },   // Cesta k MP3 v Storage (z lessonData.podcast_audio_path)
        
        _audioUrl: { state: true },
        _isPlaying: { state: true },
        _currentTime: { state: true },
        _duration: { state: true },
        _playbackRate: { state: true },
        _isLoading: { state: true },
        _error: { state: true }
    };

    static styles = css`
        :host { display: block; font-family: 'Plus Jakarta Sans', sans-serif; }
        
        .podcast-player {
            background: linear-gradient(145deg, #0f172a, #1e293b);
            border-radius: 24px;
            color: white;
            padding: 2rem;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            max-width: 800px;
            margin: 0 auto;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .player-header { text-align: center; margin-bottom: 2rem; }
        .episode-title { 
            font-size: 1.5rem; font-weight: 800; margin-bottom: 0.5rem; 
            background: linear-gradient(to right, #e0e7ff, #a5b4fc); 
            -webkit-background-clip: text; -webkit-text-fill-color: transparent; 
        }
        .status-badge { 
            display: inline-block; padding: 4px 12px; border-radius: 99px; 
            font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;
            background: rgba(99, 102, 241, 0.2); color: #a5b4fc; margin-bottom: 10px;
        }

        /* Controls */
        .controls { display: flex; align-items: center; justify-content: center; gap: 2rem; margin-bottom: 2rem; }
        button { background: none; border: none; cursor: pointer; color: white; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
        
        .btn-main { 
            width: 72px; height: 72px; border-radius: 50%; background: #6366f1; 
            box-shadow: 0 10px 30px rgba(99, 102, 241, 0.4); 
        }
        .btn-main:hover:not(:disabled) { transform: scale(1.05); background: #4f46e5; }
        .btn-main:disabled { background: #334155; cursor: not-allowed; box-shadow: none; }

        .btn-seek { color: #94a3b8; }
        .btn-seek:hover { color: white; }

        .speed-control { 
            font-size: 0.85rem; font-weight: 700; width: 42px; height: 42px; 
            border: 2px solid #334155; border-radius: 12px; color: #cbd5e1; 
        }
        .speed-control:hover { border-color: #6366f1; color: white; }

        /* Progress Bar */
        .progress-wrapper { margin-bottom: 2rem; }
        .time-info { display: flex; justify-content: space-between; font-size: 0.8rem; color: #94a3b8; margin-top: 8px; font-variant-numeric: tabular-nums; }
        
        input[type=range] {
            width: 100%; -webkit-appearance: none; background: transparent; cursor: pointer;
        }
        input[type=range]::-webkit-slider-runnable-track {
            width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px;
        }
        input[type=range]::-webkit-slider-thumb {
            height: 16px; width: 16px; border-radius: 50%; background: #fff; cursor: pointer;
            -webkit-appearance: none; margin-top: -5px; box-shadow: 0 0 10px rgba(255,255,255,0.5);
        }

        .script-container {
            padding: 1.5rem; background: rgba(255,255,255,0.03); border-radius: 16px;
            max-height: 200px; overflow-y: auto; font-size: 0.95rem; line-height: 1.7; color: #cbd5e1;
            border: 1px solid rgba(255,255,255,0.05);
        }
        
        /* Loading/Error States */
        .loading-pulse { animation: pulse 2s infinite; opacity: 0.7; }
        @keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
        .error-msg { color: #ef4444; text-align: center; padding: 1rem; background: rgba(239,68,68,0.1); border-radius: 12px; }
    `;

    constructor() {
        super();
        this._isPlaying = false;
        this._currentTime = 0;
        this._duration = 0;
        this._playbackRate = 1.0;
        this._isLoading = false;
        this._audio = new Audio();
        
        // Bind audio events
        this._audio.addEventListener('loadedmetadata', () => {
            this._duration = this._audio.duration;
            this._isLoading = false;
        });
        this._audio.addEventListener('timeupdate', () => {
            this._currentTime = this._audio.currentTime;
        });
        this._audio.addEventListener('ended', () => {
            this._isPlaying = false;
            this.dispatchEvent(new CustomEvent('podcast-completed', { bubbles: true, composed: true }));
        });
        this._audio.addEventListener('play', () => this._isPlaying = true);
        this._audio.addEventListener('pause', () => this._isPlaying = false);
    }

    connectedCallback() {
        super.connectedCallback();
        if (this.audioPath) {
            this._loadAudioUrl();
        }
    }

    updated(changedProperties) {
        if (changedProperties.has('audioPath') && this.audioPath) {
            this._loadAudioUrl();
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._audio.pause();
        this._audio.src = "";
    }

    async _loadAudioUrl() {
        this._isLoading = true;
        this._error = null;
        try {
            const storage = getStorage();
            const storageRef = ref(storage, this.audioPath);
            const url = await getDownloadURL(storageRef);
            this._audioUrl = url;
            this._audio.src = url;
            // Note: We don't auto-play to respect browser policies, user must click play
        } catch (error) {
            console.error("Error loading podcast audio:", error);
            this._error = "Nepodarilo sa načítať audio súbor. Možno ešte nebol vygenerovaný.";
            this._isLoading = false;
        }
    }

    _togglePlay() {
        if (this._isPlaying) this._audio.pause();
        else this._audio.play();
    }

    _seek(e) {
        const time = Number(e.target.value);
        this._audio.currentTime = time;
        this._currentTime = time;
    }

    _skip(seconds) {
        this._audio.currentTime = Math.min(Math.max(this._audio.currentTime + seconds, 0), this._duration);
    }

    _changeSpeed() {
        const rates = [1.0, 1.25, 1.5, 2.0];
        const idx = rates.indexOf(this._playbackRate);
        this._playbackRate = rates[(idx + 1) % rates.length];
        this._audio.playbackRate = this._playbackRate;
    }

    _formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    render() {
        const t = (key) => translationService.t(key);
        // Fallback ak audio ešte nie je vygenerované
        if (!this.audioPath) {
            return html`
                <div class="podcast-player" style="text-align: center; padding: 3rem;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🎧</div>
                    <h3 style="margin-bottom: 0.5rem; font-weight: bold;">Podcast nie je pripravený</h3>
                    <p style="color: #94a3b8; font-size: 0.9rem;">Profesor musí najprv vygenerovať audio verziu lekcie.</p>
                    <div class="script-container" style="margin-top: 1.5rem; text-align: left;">
                        ${this.podcastData?.script || typeof this.podcastData === 'string' ? this.podcastData : ''}
                    </div>
                </div>
            `;
        }

        return html`
            <div class="podcast-player">
                <div class="player-header">
                    <span class="status-badge">Professional Audio</span>
                    <h2 class="episode-title">${this.podcastData?.title || translationService.t('content_types.audio')}</h2>
                </div>

                ${this._error ? html`<div class="error-msg">${this._error}</div>` : ''}

                <div class="progress-wrapper">
                    <input type="range" min="0" max="${this._duration || 100}" .value="${this._currentTime}" 
                           @input=${this._seek} ?disabled=${this._isLoading}>
                    <div class="time-info">
                        <span>${this._formatTime(this._currentTime)}</span>
                        <span>${this._formatTime(this._duration)}</span>
                    </div>
                </div>

                <div class="controls">
                    <button class="speed-control" @click=${this._changeSpeed}>${this._playbackRate}x</button>

                    <button class="btn-seek" @click=${() => this._skip(-10)} title="-10s">
                        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" /></svg>
                    </button>

                    <button class="btn-main ${this._isLoading ? 'loading-pulse' : ''}" 
                            @click=${this._togglePlay} ?disabled=${this._isLoading || !!this._error}>
                        ${this._isLoading 
                            ? html`<span style="font-size: 1.5rem;">⌛</span>`
                            : this._isPlaying 
                                ? html`<svg width="32" height="32" fill="white" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>`
                                : html`<svg width="32" height="32" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`
                        }
                    </button>

                    <button class="btn-seek" @click=${() => this._skip(10)} title="+10s">
                        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" /></svg>
                    </button>
                </div>

                <div class="script-container custom-scrollbar">
                    ${this.podcastData?.script || typeof this.podcastData === 'string' ? this.podcastData : ''}
                </div>
            </div>
        `;
    }
}

customElements.define('student-podcast', PodcastComponent);

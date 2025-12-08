import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { translationService } from '../utils/translation-service.js';

export class PodcastComponent extends LitElement {
    static properties = {
        podcastData: { type: Object },
        _isPlaying: { state: true },
        _currentEpisodeIndex: { state: true },
        _playbackRate: { state: true },
        _voices: { state: true },
        _selectedVoiceIndex: { state: true },
        _progress: { state: true }
    };

    static styles = css`
        :host {
            display: block;
            font-family: 'Plus Jakarta Sans', sans-serif;
        }

        .podcast-player {
            background: linear-gradient(145deg, #1e293b, #0f172a);
            border-radius: 24px;
            color: white;
            padding: 2rem;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            max-width: 800px;
            margin: 0 auto;
            position: relative;
            overflow: hidden;
        }

        /* Dekoratívne pozadie */
        .podcast-player::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(0,0,0,0) 70%);
            pointer-events: none;
        }

        .player-header {
            text-align: center;
            margin-bottom: 2rem;
            position: relative;
            z-index: 10;
        }

        .episode-title {
            font-size: 1.5rem;
            font-weight: 800;
            margin-bottom: 0.5rem;
            background: linear-gradient(to right, #fff, #94a3b8);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .podcast-meta {
            color: #94a3b8;
            font-size: 0.875rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        /* Vizualizér */
        .visualizer-container {
            height: 80px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            margin: 2rem 0;
        }

        .bar {
            width: 6px;
            background: #6366f1;
            border-radius: 9999px;
            height: 10px;
            transition: height 0.1s ease;
        }

        .bar.animating {
            animation: bounce 1.2s infinite ease-in-out;
        }

        /* Rôzne oneskorenia pre organický efekt */
        .bar:nth-child(odd) { animation-duration: 0.8s; }
        .bar:nth-child(2n) { animation-duration: 1.1s; }
        .bar:nth-child(3n) { animation-duration: 1.3s; }
        .bar:nth-child(4n) { animation-duration: 0.9s; }

        @keyframes bounce {
            0%, 100% { height: 10px; opacity: 0.5; }
            50% { height: 60px; opacity: 1; background: #818cf8; }
        }

        /* Ovládacie prvky */
        .controls {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 2rem;
            margin-bottom: 2rem;
            position: relative;
            z-index: 10;
        }

        button {
            background: none;
            border: none;
            cursor: pointer;
            color: white;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .btn-main {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: #6366f1;
            box-shadow: 0 0 20px rgba(99, 102, 241, 0.4);
        }

        .btn-main:hover {
            transform: scale(1.05);
            background: #4f46e5;
        }

        .btn-secondary {
            color: #94a3b8;
        }

        .btn-secondary:hover {
            color: white;
        }

        .speed-control {
            font-size: 0.875rem;
            font-weight: 700;
            width: 40px;
            height: 40px;
            border: 1px solid #334155;
            border-radius: 12px;
            color: #94a3b8;
        }

        .speed-control:hover {
            border-color: #6366f1;
            color: #6366f1;
        }

        /* Playlist */
        .playlist {
            background: rgba(255, 255, 255, 0.03);
            border-radius: 16px;
            padding: 1rem;
            margin-top: 2rem;
        }

        .playlist-item {
            display: flex;
            align-items: center;
            padding: 1rem;
            border-radius: 12px;
            cursor: pointer;
            transition: background 0.2s;
            border: 1px solid transparent;
        }

        .playlist-item:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .playlist-item.active {
            background: rgba(99, 102, 241, 0.1);
            border-color: rgba(99, 102, 241, 0.2);
        }

        .item-number {
            font-weight: 700;
            color: #475569;
            width: 2rem;
        }

        .active .item-number {
            color: #6366f1;
        }

        .item-info {
            flex-grow: 1;
        }

        .item-title {
            font-weight: 600;
            font-size: 0.95rem;
        }

        .script-container {
            margin-top: 1.5rem;
            padding: 1.5rem;
            background: rgba(0,0,0,0.2);
            border-radius: 16px;
            max-height: 200px;
            overflow-y: auto;
            font-size: 0.9rem;
            line-height: 1.6;
            color: #cbd5e1;
            border: 1px solid rgba(255,255,255,0.05);
        }
        
        .script-container::-webkit-scrollbar {
            width: 6px;
        }
        .script-container::-webkit-scrollbar-thumb {
            background-color: #475569;
            border-radius: 3px;
        }
    `;

    constructor() {
        super();
        this._isPlaying = false;
        this._currentEpisodeIndex = 0;
        this._playbackRate = 1.0;
        this._voices = [];
        this._selectedVoiceIndex = 0;
        this._utterance = null;
        this._progress = 0; // Fake progress
        this._progressInterval = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadVoices();
        // Hlasy sa načítavajú asynchrónne, musíme počúvať na udalosť
        if (window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = () => this._loadVoices();
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stop();
    }

    _loadVoices() {
        const allVoices = window.speechSynthesis.getVoices();
        // Filtrujeme prioritne české/slovenské hlasy, alebo anglické ako fallback
        // Preferujeme "Google" alebo "Premium" hlasy ak sú dostupné
        this._voices = allVoices.sort((a, b) => {
            const langA = a.lang.toLowerCase();
            const langB = b.lang.toLowerCase();
            // Priorita pre CS/SK
            if (langA.includes('cs') || langA.includes('sk')) return -1;
            if (langB.includes('cs') || langB.includes('sk')) return 1;
            return 0;
        });
        
        // Skúsime nájsť default hlas pre aktuálny jazyk aplikácie
        const currentLang = translationService.currentLanguage || 'cs';
        const defaultIndex = this._voices.findIndex(v => v.lang.toLowerCase().includes(currentLang));
        if (defaultIndex !== -1) {
            this._selectedVoiceIndex = defaultIndex;
        }
    }

    get episodes() {
        if (!this.podcastData) return [];
        // Podpora pre starý formát (len text) aj nový (pole epizód)
        if (this.podcastData.episodes) return this.podcastData.episodes;
        // Fallback ak je to len jeden objekt alebo string
        if (this.podcastData.title && this.podcastData.script) return [this.podcastData];
        return [{ title: "Epizoda 1", script: typeof this.podcastData === 'string' ? this.podcastData : JSON.stringify(this.podcastData) }];
    }

    _togglePlay() {
        if (this._isPlaying) {
            this._pause();
        } else {
            this._play();
        }
    }

    _play() {
        if (!this.episodes.length) return;

        // Ak už hovorí, len obnovíme (resume je v Chrome niekedy zabugované, preto radšej cancel + speak od začiatku ak treba, alebo resume ak je supported)
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
            this._isPlaying = true;
            this._startProgressSimulation();
            return;
        }

        if (window.speechSynthesis.speaking) {
            // Už hovorí niečo iné?
            window.speechSynthesis.cancel();
        }

        const script = this.episodes[this._currentEpisodeIndex].script;
        
        // Clean script (remove markdown if any)
        const cleanText = script.replace(/[*#]/g, '');

        this._utterance = new SpeechSynthesisUtterance(cleanText);
        
        if (this._voices.length > 0) {
            this._utterance.voice = this._voices[this._selectedVoiceIndex];
        }
        
        this._utterance.rate = this._playbackRate;
        this._utterance.pitch = 1.0;

        this._utterance.onend = () => {
            this._isPlaying = false;
            this._stopProgressSimulation();
            this._progress = 100;
            // Auto-play next?
            if (this._currentEpisodeIndex < this.episodes.length - 1) {
                setTimeout(() => this._selectEpisode(this._currentEpisodeIndex + 1), 1000);
            } else {
                this.dispatchEvent(new CustomEvent('podcast-completed', { bubbles: true, composed: true }));
            }
            this.requestUpdate();
        };

        this._utterance.onerror = (e) => {
            console.error("Speech error:", e);
            this._isPlaying = false;
            this._stopProgressSimulation();
            this.requestUpdate();
        };

        window.speechSynthesis.speak(this._utterance);
        this._isPlaying = true;
        this._startProgressSimulation();
    }

    _pause() {
        window.speechSynthesis.pause();
        this._isPlaying = false;
        this._stopProgressSimulation();
    }

    _stop() {
        window.speechSynthesis.cancel();
        this._isPlaying = false;
        this._stopProgressSimulation();
        this._progress = 0;
    }

    _changeSpeed() {
        const rates = [1.0, 1.25, 1.5, 2.0];
        const currentIndex = rates.indexOf(this._playbackRate);
        this._playbackRate = rates[(currentIndex + 1) % rates.length];
        
        // Ak práve hrá, musíme reštartovať s novou rýchlosťou (limitácia API)
        if (this._isPlaying) {
            this._stop(); // Bohužiaľ API nevie zmeniť rýchlosť za behu plynule
            this._play(); // Začne od začiatku (alebo by sme museli trackovať pozíciu textu, čo je zložité)
        }
    }

    _selectEpisode(index) {
        this._stop();
        this._currentEpisodeIndex = index;
        setTimeout(() => this._play(), 100);
    }

    _startProgressSimulation() {
        // Falošný progress bar, keďže API nevracia presný čas
        // Odhadneme dĺžku podľa počtu znakov (cca 15 znakov za sekundu pri rate 1.0)
        const text = this.episodes[this._currentEpisodeIndex].script;
        const estimatedDuration = (text.length / 15) / this._playbackRate;
        
        this._stopProgressSimulation(); // Clear old
        const updateInterval = 100;
        const step = 100 / (estimatedDuration * (1000 / updateInterval));

        this._progressInterval = setInterval(() => {
            if (this._progress < 95) { // Necháme dobehnúť až na onend
                this._progress += step;
                this.requestUpdate();
            }
        }, updateInterval);
    }

    _stopProgressSimulation() {
        if (this._progressInterval) clearInterval(this._progressInterval);
    }

    render() {
        const currentEpisode = this.episodes[this._currentEpisodeIndex] || { title: "Loading...", script: "" };
        const t = (key) => translationService.t(key);

        return html`
            <div class="podcast-player">
                <div class="player-header">
                    <div class="podcast-meta">AI PODCAST • ${this._voices[this._selectedVoiceIndex]?.name || 'Auto Voice'}</div>
                    <h2 class="episode-title">${currentEpisode.title}</h2>
                </div>

                <div class="visualizer-container">
                    ${Array.from({ length: 20 }).map(() => html`
                        <div class="bar ${this._isPlaying ? 'animating' : ''}" 
                             style="height: ${this._isPlaying ? Math.random() * 40 + 10 : 10}px">
                        </div>
                    `)}
                </div>

                <div style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; margin-bottom: 2rem; position: relative;">
                    <div style="width: ${this._progress}%; height: 100%; background: #6366f1; border-radius: 2px; transition: width 0.1s linear; position: relative;">
                        <div style="position: absolute; right: 0; top: 50%; transform: translate(50%, -50%); width: 12px; height: 12px; background: white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>
                    </div>
                </div>

                <div class="controls">
                    <button class="speed-control" @click=${this._changeSpeed} title="Rychlost přehrávání">
                        ${this._playbackRate}x
                    </button>

                    <button class="btn-secondary" @click=${() => this._currentEpisodeIndex > 0 ? this._selectEpisode(this._currentEpisodeIndex - 1) : null} ?disabled=${this._currentEpisodeIndex === 0}>
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                    </button>

                    <button class="btn-main" @click=${this._togglePlay}>
                        ${this._isPlaying 
                            ? html`<svg width="32" height="32" fill="white" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>`
                            : html`<svg width="32" height="32" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`
                        }
                    </button>

                    <button class="btn-secondary" @click=${() => this._currentEpisodeIndex < this.episodes.length - 1 ? this._selectEpisode(this._currentEpisodeIndex + 1) : null} ?disabled=${this._currentEpisodeIndex >= this.episodes.length - 1}>
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                    </button>
                </div>

                <div class="playlist">
                    ${this.episodes.map((ep, index) => html`
                        <div class="playlist-item ${index === this._currentEpisodeIndex ? 'active' : ''}" 
                             @click=${() => this._selectEpisode(index)}>
                            <div class="item-number">${index + 1}</div>
                            <div class="item-info">
                                <div class="item-title">${ep.title}</div>
                            </div>
                            ${index === this._currentEpisodeIndex && this._isPlaying ? html`
                                <div style="color: #6366f1;">
                                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                                </div>
                            ` : ''}
                        </div>
                    `)}
                </div>

                <div class="script-container">
                    ${currentEpisode.script}
                </div>
            </div>
        `;
    }
}

customElements.define('student-podcast', PodcastComponent);

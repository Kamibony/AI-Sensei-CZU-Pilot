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
        _progress: { state: true },
        _currentSentenceIndex: { state: true }, // Sledujeme vetu
        _sentences: { state: true } // Rozkúskovaný text
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
            position: relative;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .player-header { text-align: center; margin-bottom: 2rem; position: relative; z-index: 10; }
        .episode-title { 
            font-size: 1.5rem; font-weight: 800; margin-bottom: 0.5rem; 
            background: linear-gradient(to right, #e0e7ff, #a5b4fc); 
            -webkit-background-clip: text; -webkit-text-fill-color: transparent; 
        }
        .podcast-meta { color: #94a3b8; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; }

        /* Vizualizér */
        .visualizer-container {
            height: 60px; display: flex; align-items: center; justify-content: center; gap: 4px; margin: 2rem 0;
        }
        .bar {
            width: 6px; background: #6366f1; border-radius: 99px; height: 10%; transition: height 0.15s ease;
            box-shadow: 0 0 10px rgba(99, 102, 241, 0.3);
        }
        .bar.animating { animation: bounce 1s infinite ease-in-out; }
        .bar:nth-child(odd) { animation-duration: 0.7s; }
        .bar:nth-child(2n) { animation-duration: 1.1s; }
        .bar:nth-child(3n) { animation-duration: 0.9s; }
        @keyframes bounce { 0%, 100% { height: 15%; opacity: 0.5; } 50% { height: 100%; opacity: 1; background: #a5b4fc; } }

        /* Controls */
        .controls { display: flex; align-items: center; justify-content: center; gap: 2rem; margin-bottom: 2rem; position: relative; z-index: 10; }
        button { background: none; border: none; cursor: pointer; color: white; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
        .btn-main { width: 72px; height: 72px; border-radius: 50%; background: #6366f1; box-shadow: 0 10px 30px rgba(99, 102, 241, 0.4); }
        .btn-main:hover { transform: scale(1.05); background: #4f46e5; box-shadow: 0 15px 35px rgba(99, 102, 241, 0.6); }
        .btn-secondary { color: #94a3b8; padding: 10px; border-radius: 50%; }
        .btn-secondary:hover { color: white; background: rgba(255,255,255,0.1); }
        .speed-control { font-size: 0.85rem; font-weight: 700; width: 42px; height: 42px; border: 2px solid #334155; border-radius: 12px; color: #cbd5e1; }
        .speed-control:hover { border-color: #6366f1; color: white; background: rgba(99, 102, 241, 0.1); }

        /* Progress */
        .progress-container { height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; margin-bottom: 2.5rem; position: relative; cursor: pointer; }
        .progress-bar { height: 100%; background: linear-gradient(90deg, #6366f1, #a5b4fc); border-radius: 3px; position: relative; transition: width 0.3s ease; }
        .progress-thumb { position: absolute; right: -6px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; background: white; border-radius: 50%; box-shadow: 0 0 15px rgba(255,255,255,0.5); }

        /* Script & Playlist */
        .content-area { display: grid; gap: 1.5rem; }
        .playlist { background: rgba(0,0,0,0.2); border-radius: 16px; padding: 1rem; border: 1px solid rgba(255,255,255,0.05); }
        .playlist-item { display: flex; align-items: center; padding: 0.75rem 1rem; border-radius: 10px; cursor: pointer; transition: all 0.2s; color: #94a3b8; }
        .playlist-item:hover { background: rgba(255,255,255,0.05); color: white; }
        .playlist-item.active { background: rgba(99, 102, 241, 0.15); color: #a5b4fc; font-weight: 600; }
        
        .script-container {
            padding: 1.5rem; background: rgba(255,255,255,0.03); border-radius: 16px;
            max-height: 250px; overflow-y: auto; font-size: 1rem; line-height: 1.7; color: #cbd5e1;
            border: 1px solid rgba(255,255,255,0.05);
            scroll-behavior: smooth;
        }
        .script-sentence { padding: 2px 4px; border-radius: 4px; transition: all 0.3s; }
        .script-sentence.active { background: rgba(99, 102, 241, 0.2); color: white; box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.4); }
        
        /* Scrollbar */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
    `;

    constructor() {
        super();
        this._isPlaying = false;
        this._currentEpisodeIndex = 0;
        this._currentSentenceIndex = 0;
        this._playbackRate = 1.0;
        this._voices = [];
        this._selectedVoiceIndex = 0;
        this._utterance = null;
        this._sentences = [];
    }

    connectedCallback() {
        super.connectedCallback();
        // Load voices robustly
        this._loadVoices();
        if (window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = () => this._loadVoices();
            // Safety cleanup on init
            window.speechSynthesis.cancel();
        }
        // Prepare first episode
        this._prepareEpisode(0);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.speechSynthesis.cancel();
    }

    _loadVoices() {
        const allVoices = window.speechSynthesis.getVoices();
        if (allVoices.length === 0) return;

        // Prioritize CS/SK, high quality
        this._voices = allVoices.sort((a, b) => {
            const scoreA = (a.lang.includes('cs') || a.lang.includes('sk') ? 10 : 0) + (a.name.includes('Google') ? 1 : 0);
            const scoreB = (b.lang.includes('cs') || b.lang.includes('sk') ? 10 : 0) + (b.name.includes('Google') ? 1 : 0);
            return scoreB - scoreA;
        });

        // Set default if found
        const currentLang = translationService.currentLanguage || 'cs';
        const defaultIndex = this._voices.findIndex(v => v.lang.toLowerCase().includes(currentLang));
        if (defaultIndex !== -1) this._selectedVoiceIndex = defaultIndex;
    }

    get episodes() {
        // Robust data parsing
        let data = this.podcastData;
        if (!data) return [];
        
        // Handle stringified JSON from Firestore
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch(e) { /* Raw string */ }
        }

        // Support array, object with episodes, or single object
        if (Array.isArray(data)) return data;
        if (data.episodes && Array.isArray(data.episodes)) return data.episodes;
        if (data.title && data.script) return [data];
        
        // Fallback for raw text
        return [{ title: translationService.t('podcast.episode_default'), script: typeof data === 'string' ? data : "No content" }];
    }

    _prepareEpisode(index) {
        if (!this.episodes[index]) return;
        
        // Clean markdown and split into sentences
        const rawScript = this.episodes[index].script || "";
        const cleanText = rawScript.replace(/[*#_`]/g, ''); // Remove markdown
        
        // Split by punctuation but keep delimiters to be smart
        // Regex: Split by . ! ? but exclude common abbreviations if possible (simplified here)
        this._sentences = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
        
        // Filter empty
        this._sentences = this._sentences.map(s => s.trim()).filter(s => s.length > 0);
        
        this._currentEpisodeIndex = index;
        this._currentSentenceIndex = 0;
        this._progress = 0;
    }

    _togglePlay() {
        if (this._isPlaying) {
            this._pause();
        } else {
            this._play();
        }
    }

    _play() {
        if (this._sentences.length === 0) return;

        // If paused, resume
        if (window.speechSynthesis.paused && this._isPlaying) {
            window.speechSynthesis.resume();
            return;
        }

        // Safety: ensure speaking is true
        this._isPlaying = true;
        this._speakNextSentence();
    }

    _speakNextSentence() {
        // Check if finished
        if (this._currentSentenceIndex >= this._sentences.length) {
            this._isPlaying = false;
            // Auto-next episode?
            if (this._currentEpisodeIndex < this.episodes.length - 1) {
                setTimeout(() => this._selectEpisode(this._currentEpisodeIndex + 1), 1000);
            } else {
                this.dispatchEvent(new CustomEvent('podcast-completed', { bubbles: true, composed: true }));
            }
            return;
        }

        // CANCEL any pending speech to prevent stacking/freezing
        window.speechSynthesis.cancel();

        const text = this._sentences[this._currentSentenceIndex];
        const utterance = new SpeechSynthesisUtterance(text);

        if (this._voices[this._selectedVoiceIndex]) {
            utterance.voice = this._voices[this._selectedVoiceIndex];
        }
        utterance.rate = this._playbackRate;

        // Events
        utterance.onend = () => {
            // Only proceed if we are still "playing" (user didn't pause)
            if (this._isPlaying) {
                this._currentSentenceIndex++;
                this._speakNextSentence();
                this._scrollToActiveSentence();
            }
        };

        utterance.onerror = (e) => {
            console.error("TTS Error:", e);
            // Ignore interruption errors, log others
            if (e.error !== 'interrupted' && e.error !== 'canceled') {
                this._isPlaying = false; 
            }
        };

        window.speechSynthesis.speak(utterance);
    }

    _pause() {
        this._isPlaying = false;
        window.speechSynthesis.cancel(); // Better than pause() for browser stability
    }

    _changeSpeed() {
        const rates = [1.0, 1.25, 1.5, 2.0];
        const idx = rates.indexOf(this._playbackRate);
        this._playbackRate = rates[(idx + 1) % rates.length];
        
        // If playing, restart current sentence with new speed
        if (this._isPlaying) {
            this._speakNextSentence();
        }
    }

    _selectEpisode(index) {
        this._pause();
        this._prepareEpisode(index);
        this.requestUpdate(); // Force re-render
        
        // Auto-play after switch
        setTimeout(() => this._play(), 500);
    }

    _scrollToActiveSentence() {
        const container = this.shadowRoot.querySelector('.script-container');
        const activeEl = this.shadowRoot.querySelector('.script-sentence.active');
        if (container && activeEl) {
            // Scroll to keep active sentence in view
            const top = activeEl.offsetTop - container.offsetTop - (container.clientHeight / 2) + (activeEl.clientHeight / 2);
            container.scrollTo({ top: top, behavior: 'smooth' });
        }
    }

    render() {
        const t = (key) => translationService.t(key);
        const currentEp = this.episodes[this._currentEpisodeIndex] || {};
        const progress = this._sentences.length > 0 ? (this._currentSentenceIndex / this._sentences.length) * 100 : 0;

        return html`
            <div class="podcast-player">
                <div class="player-header">
                    <div class="podcast-meta">AI PODCAST • ${this._playbackRate}x Speed</div>
                    <h2 class="episode-title">${currentEp.title || "Epizoda"}</h2>
                </div>

                <div class="visualizer-container">
                    ${Array.from({ length: 16 }).map((_, i) => html`
                        <div class="bar ${this._isPlaying ? 'animating' : ''}" 
                             style="height: ${this._isPlaying ? Math.max(15, Math.random() * 100) + '%' : '15%'}; animation-delay: ${i * 0.05}s">
                        </div>
                    `)}
                </div>

                <div class="progress-container" @click=${(e) => {
                    const rect = e.target.getBoundingClientRect();
                    const percent = (e.clientX - rect.left) / rect.width;
                    this._currentSentenceIndex = Math.floor(percent * this._sentences.length);
                    if(this._isPlaying) this._speakNextSentence();
                    else this.requestUpdate();
                }}>
                    <div class="progress-bar" style="width: ${progress}%">
                        <div class="progress-thumb"></div>
                    </div>
                </div>

                <div class="controls">
                    <button class="speed-control" @click=${this._changeSpeed}>${this._playbackRate}x</button>

                    <button class="btn-secondary" 
                            @click=${() => this._currentEpisodeIndex > 0 ? this._selectEpisode(this._currentEpisodeIndex - 1) : null} 
                            ?disabled=${this._currentEpisodeIndex === 0}>
                        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
                    </button>

                    <button class="btn-main" @click=${this._togglePlay}>
                        ${this._isPlaying 
                            ? html`<svg width="36" height="36" fill="white" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>`
                            : html`<svg width="36" height="36" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`
                        }
                    </button>

                    <button class="btn-secondary" 
                            @click=${() => this._currentEpisodeIndex < this.episodes.length - 1 ? this._selectEpisode(this._currentEpisodeIndex + 1) : null} 
                            ?disabled=${this._currentEpisodeIndex >= this.episodes.length - 1}>
                        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>

                <div class="content-area">
                    <div class="script-container">
                        ${this._sentences.map((sent, i) => html`
                            <span class="script-sentence ${i === this._currentSentenceIndex ? 'active' : ''}"
                                  @click=${() => {
                                      this._currentSentenceIndex = i;
                                      if(this._isPlaying) this._speakNextSentence();
                                      else this.requestUpdate();
                                  }}>
                                ${sent}
                            </span>
                        `)}
                    </div>

                    ${this.episodes.length > 1 ? html`
                        <div class="playlist">
                            ${this.episodes.map((ep, i) => html`
                                <div class="playlist-item ${i === this._currentEpisodeIndex ? 'active' : ''}" 
                                     @click=${() => this._selectEpisode(i)}>
                                    <span style="width: 24px; font-weight: bold; opacity: 0.5;">${i+1}</span>
                                    <span>${ep.title}</span>
                                    ${i === this._currentEpisodeIndex && this._isPlaying ? html`<span style="margin-left: auto;">🔊</span>` : ''}
                                </div>
                            `)}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
}

customElements.define('student-podcast', PodcastComponent);

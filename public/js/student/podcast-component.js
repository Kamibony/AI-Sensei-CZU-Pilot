// Súbor: public/js/student/podcast-component.js

import { LitElement, html } from 'https://cdn.skypack.dev/lit';
import { showToast } from '../utils.js';
import { translationService } from '../utils/translation-service.js';

// Globálna premenná pre 'utterance', aby sme ju mohli manažovať
let currentSpeechUtterance = null;

export class StudentPodcast extends LitElement {

    // Definujeme vlastnosti (props & state)
    static get properties() {
        return {
            podcastData: { type: Object },
            currentPlayingEpisodeIndex: { type: Number, state: true },
            isPaused: { type: Boolean, state: true },
        };
    }

    constructor() {
        super();
        this.podcastData = null;
        this.currentPlayingEpisodeIndex = -1;
        this.isPaused = false;
    }

    // Vypnutie Shadow DOM
    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this._langUnsubscribe = translationService.subscribe(() => this.requestUpdate());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._langUnsubscribe) {
            this._langUnsubscribe();
        }
    }

    render() {
        const t = (key) => translationService.t(key);

        if (!('speechSynthesis' in window)) {
            return html`<p class="text-red-500">${t('student_dashboard.browser_unsupported')}</p>`;
        }
        
        if (!this.podcastData || !this.podcastData.episodes || !Array.isArray(this.podcastData.episodes)) {
            return html`<p>Obsah podcastu není k dispozici nebo není ve správném formátu.</p>`;
        }

        return html`
            ${this.podcastData.episodes.map((episode, index) => {
                
                const isThisPlaying = this.currentPlayingEpisodeIndex === index && !this.isPaused;
                const isThisPaused = this.currentPlayingEpisodeIndex === index && this.isPaused;

                return html`
                    <div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm bg-white" id="podcast-episode-${index}">
                        <h4 class="font-bold text-green-700">${index + 1}. ${episode.title || 'Epizoda bez názvu'}</h4>
                        <div class="flex space-x-2 mt-3 mb-2 podcast-controls" data-episode-index="${index}">
                            
                            <button 
                                class="play-podcast-btn text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-3 rounded-md flex items-center ${isThisPlaying ? 'hidden' : ''}"
                                @click=${() => this._handlePlayPodcast(index)}>
                                <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>
                                ${isThisPaused ? t('student_dashboard.resume') : t('student_dashboard.play')}
                            </button>

                            <button 
                                class="pause-podcast-btn text-sm bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-1.5 px-3 rounded-md flex items-center ${isThisPlaying ? '' : 'hidden'}"
                                @click=${this._handlePausePodcast}>
                                <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clip-rule="evenodd"></path></svg>
                                ${t('student_dashboard.pause')}
                            </button>

                            <button 
                                class="stop-podcast-btn text-sm bg-red-600 hover:bg-red-700 text-white font-semibold py-1.5 px-3 rounded-md flex items-center"
                                @click=${this._handleStopPodcast}>
                                <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 9a1 1 0 00-1 1v1a1 1 0 102 0v-1a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v1a1 1 0 102 0v-1a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
                                Zastavit
                            </button>
                        </div>
                        <details class="mt-3">
                            <summary class="cursor-pointer text-sm text-slate-500 hover:text-slate-700">Zobrazit skript</summary>
                            <p class="mt-2 text-sm text-slate-600">${(episode.script || '').replace(/\n/g, '<br>')}</p>
                        </details>
                    </div>
                `;
            })}
        `;
    }

    _handlePlayPodcast(index) {
        const episodeData = this.podcastData.episodes[index];
        const script = episodeData.script;
        if (!script) {
            showToast("Skript pro tuto epizodu chybí.", true);
            return;
        }

        const synth = window.speechSynthesis;
        if (synth.speaking && this.currentPlayingEpisodeIndex === index && synth.paused) {
            // Pokračujeme v pozastavenej epizóde
            synth.resume();
            this.isPaused = false;
        } else {
            // Začíname novú
            if (synth.speaking) {
                synth.cancel(); // Zastaviť predchádzajúce
            }
            
            currentSpeechUtterance = new SpeechSynthesisUtterance(script);
            currentSpeechUtterance.lang = 'cs-CZ';
            this.currentPlayingEpisodeIndex = index;
            this.isPaused = false;

            // Event listener pre prirodzený koniec alebo 'cancel()'
            currentSpeechUtterance.onend = () => {
                 console.log('Speech finished or cancelled.');
                 this.currentPlayingEpisodeIndex = -1;
                 this.isPaused = false;
                 currentSpeechUtterance = null;
            };

            // Event listener pre chybu
            currentSpeechUtterance.onerror = (event) => {
                if (event.error !== 'canceled' && event.error !== 'interrupted' && event.error !== 'cancel') {
                    console.error('SpeechSynthesisUtterance.onerror', event);
                    showToast(`${translationService.t('student_dashboard.playback_error')}: ${event.error}`, true);
                    this.currentPlayingEpisodeIndex = -1;
                    this.isPaused = false;
                    currentSpeechUtterance = null;
                }
            };
            
            // Hľadanie českého hlasu
            try {
                 const voices = synth.getVoices();
                 const czechVoice = voices.find(voice => voice.lang === 'cs-CZ');
                 if (czechVoice) {
                     currentSpeechUtterance.voice = czechVoice;
                 }
             } catch (e) {
                 console.warn("Nepodařilo se získat seznam hlasů:", e);
             }

            // Spustenie syntézy
            setTimeout(() => {
                if (currentSpeechUtterance && window.speechSynthesis) {
                     try {
                         synth.speak(currentSpeechUtterance);
                         // Stav je už nastavený, Lit sa postará o prekreslenie
                     } catch (e) {
                          console.error("Error calling synth.speak:", e);
                          showToast(translationService.t('student_dashboard.playback_error'), true);
                          this.currentPlayingEpisodeIndex = -1;
                          this.isPaused = false;
                          currentSpeechUtterance = null;
                     }
                }
            }, 100); 
        }
    }

    _handlePausePodcast() {
        const synth = window.speechSynthesis;
        if (synth && synth.speaking && !synth.paused) {
            synth.pause();
            this.isPaused = true;
        }
    }

    _handleStopPodcast() {
        const synth = window.speechSynthesis;
        if (synth && synth.speaking) {
            synth.cancel(); // Toto spustí 'onend' listener
        }
        // Reset stavu sa udeje v 'onend'
    }
}

// Zaregistrujeme komponent
customElements.define('student-podcast', StudentPodcast);

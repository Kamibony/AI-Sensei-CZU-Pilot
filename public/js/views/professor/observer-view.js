import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from "../../firebase-init.js";

export class ObserverView extends LitElement {
    static properties = {
        isRecording: { type: Boolean },
        isProcessing: { type: Boolean },
        result: { type: Object },
        elapsedTime: { type: Number },
        error: { type: String }
    };

    constructor() {
        super();
        this.isRecording = false;
        this.isProcessing = false;
        this.result = null;
        this.elapsedTime = 0;
        this.error = null;
        this._timerInterval = null;
        this._mediaRecorder = null;
        this._chunks = [];
        this.MAX_RECORDING_TIME = 180; // 3 minutes
    }

    createRenderRoot() { return this; }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopTimer();
        if (this.isRecording && this._mediaRecorder) {
            this._mediaRecorder.stop();
        }
    }

    async _startRecording() {
        this.error = null;
        this.result = null;
        this._chunks = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this._mediaRecorder = new MediaRecorder(stream);

            this._mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) this._chunks.push(e.data);
            };

            this._mediaRecorder.onstop = () => {
                this._processRecording();
                stream.getTracks().forEach(track => track.stop());
            };

            this._mediaRecorder.start();
            this.isRecording = true;
            this._startTimer();

        } catch (err) {
            console.error("Mic error:", err);
            this.error = "Nepodařilo se přistoupit k mikrofonu. Povolte prosím přístup.";
        }
    }

    _stopRecording() {
        if (this._mediaRecorder && this.isRecording) {
            this._mediaRecorder.stop();
            this.isRecording = false;
            this._stopTimer();
        }
    }

    _startTimer() {
        this.elapsedTime = 0;
        this._timerInterval = setInterval(() => {
            this.elapsedTime++;
            if (this.elapsedTime >= this.MAX_RECORDING_TIME) {
                this._stopRecording();
            }
        }, 1000);
    }

    _stopTimer() {
        if (this._timerInterval) {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }
    }

    _formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    async _processRecording() {
        this.isProcessing = true;
        const blob = new Blob(this._chunks, { type: 'audio/webm' }); // Chrome uses webm default
        // Convert to Base64
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
            const base64data = reader.result.split(',')[1];
            const mimeType = blob.type || 'audio/webm';

            try {
                const analyzeFn = httpsCallable(functions, 'analyzeClassroomAudio');
                const response = await analyzeFn({ audioData: base64data, mimeType: mimeType });
                this.result = response.data;
            } catch (err) {
                console.error("Analysis error:", err);
                this.error = "Chyba při analýze audia: " + err.message;
            } finally {
                this.isProcessing = false;
            }
        };
    }

    render() {
        return html`
            <div data-tour="observer-start" class="h-full flex flex-col p-6 max-w-4xl mx-auto space-y-8">
                <!-- Header -->
                <div class="text-center space-y-2">
                    <h1 class="text-3xl font-extrabold text-slate-900">AI Observer</h1>
                    <p class="text-slate-500">Pedagogický supervizor v reálném čase</p>
                </div>

                <!-- Main Action Area -->
                <div class="flex flex-col items-center justify-center p-12 bg-white rounded-3xl shadow-sm border border-slate-100 space-y-8">

                    ${this.isProcessing ? html`
                        <div class="flex flex-col items-center animate-pulse space-y-4">
                            <div class="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center">
                                <svg class="w-10 h-10 text-indigo-600 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            </div>
                            <span class="text-lg font-medium text-slate-700">Analyzuji nahrávku...</span>
                        </div>
                    ` : html`
                        <!-- Timer -->
                        <div class="text-6xl font-mono font-bold tracking-tighter ${this.isRecording ? 'text-red-500' : 'text-slate-800'}">
                            ${this._formatTime(this.elapsedTime)}
                        </div>

                        <!-- Button -->
                        <button
                            @click="${this.isRecording ? this._stopRecording : this._startRecording}"
                            class="group relative flex items-center justify-center w-24 h-24 rounded-full transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-indigo-500 ${this.isRecording ? 'bg-red-500 hover:bg-red-600 shadow-red-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'} shadow-xl"
                        >
                            ${this.isRecording ? html`
                                <div class="w-8 h-8 bg-white rounded-md"></div>
                            ` : html`
                                <svg class="w-10 h-10 text-white translate-x-1" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4l12 6-12 6z"/></svg>
                            `}

                            ${this.isRecording ? html`
                                <span class="absolute w-full h-full rounded-full border-4 border-red-500 animate-ping opacity-20"></span>
                            ` : ''}
                        </button>

                        <div class="text-sm text-slate-500 font-medium uppercase tracking-wide">
                            ${this.isRecording ? 'Nahrávání...' : 'Připraveno'}
                        </div>
                    `}

                    ${this.error ? html`
                        <div class="text-red-500 bg-red-50 px-4 py-2 rounded-lg text-sm font-medium">
                            ${this.error}
                        </div>
                    ` : ''}
                </div>

                <!-- Results Area -->
                ${this.result ? this._renderResult() : ''}
            </div>
        `;
    }

    _renderResult() {
        const { talkRatio, emotionalTone, methodology, suggestions } = this.result;

        // Ensure data exists with fallbacks
        const teacherPct = talkRatio?.teacher || 0;
        const studentPct = talkRatio?.student || 0;

        return html`
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <!-- Talk Ratio Card -->
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h3 class="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <span class="text-xl">🗣️</span> Poměr řeči
                    </h3>
                    <div class="relative h-8 bg-slate-100 rounded-full overflow-hidden flex font-bold text-xs text-white">
                        <div style="width: ${teacherPct}%" class="bg-indigo-500 flex items-center justify-center transition-all duration-1000">
                            ${teacherPct > 10 ? `Učitel ${teacherPct}%` : ''}
                        </div>
                        <div style="width: ${studentPct}%" class="bg-emerald-500 flex items-center justify-center transition-all duration-1000">
                            ${studentPct > 10 ? `Student ${studentPct}%` : ''}
                        </div>
                    </div>
                    <div class="flex justify-between mt-2 text-sm text-slate-500">
                        <span>Učitel: ${teacherPct}%</span>
                        <span>Studenti: ${studentPct}%</span>
                    </div>
                </div>

                <!-- Emotional Tone Card -->
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h3 class="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <span class="text-xl">🎭</span> Emoční tón
                    </h3>
                    <div class="text-2xl font-medium text-indigo-900">
                        ${emotionalTone || "N/A"}
                    </div>
                </div>

                <!-- Methodology Card -->
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 md:col-span-2">
                    <h3 class="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <span class="text-xl">🎓</span> Metodika
                    </h3>
                    <div class="flex flex-wrap gap-2">
                        ${(methodology || []).map(m => html`
                            <span class="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium border border-blue-100">
                                ${m}
                            </span>
                        `)}
                    </div>
                </div>

                <!-- Suggestions Card -->
                <div class="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-2xl shadow-sm border border-indigo-100 md:col-span-2">
                    <h3 class="text-lg font-bold text-indigo-900 mb-4 flex items-center gap-2">
                        <span class="text-xl">💡</span> Doporučení AI
                    </h3>
                    <ul class="space-y-3">
                        ${(suggestions || []).map(s => html`
                            <li class="flex items-start gap-3 text-indigo-800">
                                <svg class="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                <span>${s}</span>
                            </li>
                        `)}
                    </ul>
                </div>
            </div>
        `;
    }
}
customElements.define('observer-view', ObserverView);

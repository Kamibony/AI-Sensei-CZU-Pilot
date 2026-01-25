import { html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { BaseView } from './base-view.js';
import { Localized } from '../../utils/localization-mixin.js';
import * as firebaseInit from '../../firebase-init.js';

export class ArchitectView extends Localized(BaseView) {
    static properties = {
        _isUploading: { state: true },
        _statusMessage: { state: true }
    };

    constructor() {
        super();
        this._isUploading = false;
        this._statusMessage = '';
    }

    async _handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            alert(this.t('common.error') + ': ' + (this.t('editor.pdf_only') || 'PDF only'));
            return;
        }

        this._isUploading = true;
        this._statusMessage = this.t('architect.processing_status');

        try {
            const text = await this._extractTextFromPdf(file);
            console.log('Extracted text length:', text.length);

            // Call Backend
            const generateEmbeddings = firebaseInit.functions.httpsCallable('generateEmbeddings');
            await generateEmbeddings({
                text: text,
                title: file.name
            });

            this._showToast(this.t('common.success'), 'success');
        } catch (error) {
            console.error('Architect Upload Error:', error);
            this._showToast(this.t('common.error') + ': ' + error.message, 'error');
        } finally {
            this._isUploading = false;
            this._statusMessage = '';
            e.target.value = ''; // Reset input
        }
    }

    async _extractTextFromPdf(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }

        return fullText;
    }

    _showToast(message, type = 'info') {
        const event = new CustomEvent('toast-message', {
            detail: { message, type },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    render() {
        return html`
            <div class="p-6 max-w-7xl mx-auto space-y-8">
                <!-- Header -->
                <div class="flex flex-col gap-2">
                    <h1 class="text-3xl font-bold text-slate-800">${this.t('architect.title')}</h1>
                    <p class="text-slate-500 text-lg">${this.t('architect.description')}</p>
                </div>

                <!-- Main Grid -->
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    <!-- Left: Upload Zone -->
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col gap-6">
                        <h2 class="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <span>📚</span> ${this.t('architect.upload_zone_title')}
                        </h2>

                        <div class="border-2 border-dashed border-indigo-100 rounded-xl bg-indigo-50/50 p-8 flex flex-col items-center justify-center text-center transition-colors hover:bg-indigo-50 hover:border-indigo-300 relative group cursor-pointer">
                            <input
                                type="file"
                                accept="application/pdf"
                                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                @change=${this._handleFileUpload}
                                ?disabled=${this._isUploading}
                            >
                            <div class="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm text-3xl mb-4 group-hover:scale-110 transition-transform text-indigo-500">
                                📤
                            </div>
                            <p class="font-medium text-slate-700 mb-1">${this.t('architect.upload_drop_text')}</p>
                            <p class="text-sm text-slate-400">PDF (max 10MB)</p>
                        </div>

                        ${this._isUploading ? html`
                            <div class="flex items-center gap-3 p-4 bg-blue-50 text-blue-700 rounded-lg animate-pulse">
                                <div class="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                <span class="font-medium text-sm">${this._statusMessage}</span>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Right: Map Placeholder -->
                    <div class="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 min-h-[400px] flex items-center justify-center bg-slate-50/50">
                        <div class="text-center text-slate-400">
                            <div class="text-6xl mb-4 opacity-20">🗺️</div>
                            <p>${this.t('architect.map_placeholder')}</p>
                        </div>
                    </div>

                </div>
            </div>
        `;
    }
}
customElements.define('architect-view', ArchitectView);

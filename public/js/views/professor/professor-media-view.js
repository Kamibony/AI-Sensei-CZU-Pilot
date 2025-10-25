// public/js/views/professor/professor-media-view.js
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { initializeCourseMediaUpload } from '../../upload-handler.js';

export class ProfessorMediaView extends LitElement {

    // Vypneme Shadow DOM, aby sa aplikovali globálne Tailwind štýly
    createRenderRoot() {
        return this;
    }

    firstUpdated() {
        // Zavoláme upload handler až keď je DOM pripravený
        // Hľadá IDčka, ktoré sme renderovali nižšie
        initializeCourseMediaUpload("main-course");
    }

    render() {
        return html`
            <header class="text-center p-6 border-b border-slate-200 bg-white">
                <h1 class="text-3xl font-extrabold text-slate-800">Knihovna médií</h1>
                <p class="text-slate-500 mt-1">Spravujte všechny soubory pro váš kurz na jednom místě.</p>
            </header>
            <div class="flex-grow overflow-y-auto p-4 md:p-6">
                <div id="course-media-library-container" class="bg-white p-6 rounded-2xl shadow-lg">
                    <p class="text-slate-500 mb-4">Nahrajte soubory (PDF), které chcete použít pro generování obsahu.</p>
                    <div id="course-media-upload-area" class="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center text-slate-500 cursor-pointer hover:bg-green-50 hover:border-green-400">
                        <p class="font-semibold">Přetáhněte soubory sem nebo klikněte pro výběr</p>
                    </div>
                    <input type="file" id="course-media-file-input" multiple class="hidden" accept=".pdf">
                    <h3 class="font-bold text-slate-700 mt-6 mb-2">Nahrané soubory:</h3>
                    <ul id="course-media-list" class="space-y-2"></ul>
                </div>
            </div>
        `;
    }
}

customElements.define('professor-media-view', ProfessorMediaView);

import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';
import './professor-header-editor.js';
import './ai-generator-panel.js';

export class EditorViewPost extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean },
        files: { type: Array }
    };

    createRenderRoot() { return this; }

    _updatePost(newPost) {
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: { social_post: newPost },
            bubbles: true,
            composed: true
        }));
    }

    // --- Phase 2: Editor Standardization ---
    _handleAiCompletion(e) {
        const data = e.detail.data;
        if (!data) return;

        let postData = data;
        // 1. Normalize
        if (typeof data === 'string') {
            try {
                postData = JSON.parse(data);
            } catch(e) {
                // Fallback: If text, assume content
                postData = { content: data, platform: 'Twitter', hashtags: [] };
            }
        }

        // Handle array wrapper if any
        if (Array.isArray(postData)) postData = postData[0];

        // Sanitize hashtags to array if they come as string from AI
        if (postData.hashtags && typeof postData.hashtags === 'string') {
            postData.hashtags = postData.hashtags.split(/[\s,]+/).filter(tag => tag.length > 0);
        }

        // 3. Assign
        const newPost = {
            platform: postData.platform || 'Twitter',
            content: postData.content || '',
            hashtags: postData.hashtags || []
        };

        this.lesson.social_post = newPost;

        // 4. Save
        this._updatePost(newPost);
        this.requestUpdate();
    }

    _handleFieldChange(field, value) {
        const post = { ...this.lesson.social_post };

        if (field === 'hashtags') {
            const tags = value.split(/[\s,]+/).filter(tag => tag.length > 0);
            post.hashtags = tags;
        } else {
            post[field] = value;
        }

        this._updatePost(post);
    }

    _handleDiscard() {
        if (confirm(this.t('common.confirm_discard') || "Opravdu chcete zahodit veškerý obsah a začít znovu?")) {
            this.lesson.social_post = {};
            this._updatePost({});
            this.requestUpdate();
        }
    }

    render() {
        const post = this.lesson?.social_post;
        // Check if object is empty or missing required fields.
        // If post is null/undefined, or if it's an empty object, treat as "no content"
        const hasContent = post && (post.content || post.platform);

        const platformColors = {
            'Twitter': 'bg-sky-500',
            'LinkedIn': 'bg-blue-700',
            'Instagram': 'bg-pink-600'
        };
        const currentPlatformColor = platformColors[post?.platform] || 'bg-slate-700';

        // Prepare hashtag value for input (convert array to string if needed)
        let hashtagValue = '';
        if (Array.isArray(post?.hashtags)) {
            hashtagValue = post.hashtags.join(' ');
        } else if (post?.hashtags) {
            hashtagValue = post.hashtags;
        }

        return html`
            <div class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <div class="max-w-6xl mx-auto w-full">

                        ${hasContent ? html`
                            <div class="mb-6">
                                <h2 class="text-2xl font-bold text-slate-800">${this.t('editor.post.title')}</h2>
                                <p class="text-slate-500 text-sm">${this.t('editor.post.subtitle')}</p>
                            </div>

                            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">

                                <!-- Left Column: Editor -->
                                <div class="space-y-6">
                                    <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
                                        <div>
                                            <label class="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">
                                                ${this.t('editor.post.platform_label')}
                                            </label>
                                            <select
                                                .value="${post.platform || 'Twitter'}"
                                                @change="${e => this._handleFieldChange('platform', e.target.value)}"
                                                class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                            >
                                                <option value="Twitter">Twitter / X</option>
                                                <option value="LinkedIn">LinkedIn</option>
                                                <option value="Instagram">Instagram</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label class="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">
                                                ${this.t('editor.post.content_label')}
                                            </label>
                                            <textarea
                                                .value="${post.content || ''}"
                                                @input="${e => this._handleFieldChange('content', e.target.value)}"
                                                rows="8"
                                                class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                                                placeholder="${this.t('editor.post.content_placeholder')}"
                                            ></textarea>
                                        </div>

                                        <div>
                                            <label class="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">
                                                ${this.t('editor.post.hashtags_label')}
                                            </label>
                                            <input
                                                type="text"
                                                .value="${hashtagValue}"
                                                @input="${e => this._handleFieldChange('hashtags', e.target.value)}"
                                                class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                                placeholder="#education #ai"
                                            />
                                            <p class="text-xs text-slate-400 mt-1">${this.t('editor.post.hashtags_hint')}</p>
                                        </div>
                                    </div>
                                </div>

                                <!-- Right Column: Mobile Preview -->
                                <div class="flex justify-center items-start pt-4">
                                    <div class="relative w-[320px] h-[600px] bg-slate-900 rounded-[3rem] shadow-2xl border-4 border-slate-800 overflow-hidden ring-4 ring-slate-200/50">
                                        <!-- Phone Status Bar -->
                                        <div class="absolute top-0 w-full h-8 bg-slate-900 z-20 flex justify-between items-center px-6 text-[10px] text-white font-medium">
                                            <span>9:41</span>
                                            <div class="flex gap-1.5">
                                                <div class="w-3 h-3 bg-white rounded-full opacity-20"></div>
                                                <div class="w-3 h-3 bg-white rounded-full opacity-20"></div>
                                                <div class="w-4 h-2.5 border border-white rounded-sm"></div>
                                            </div>
                                        </div>
                                        <!-- Notch -->
                                        <div class="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-900 rounded-b-xl z-20"></div>

                                        <!-- Phone Screen Content -->
                                        <div class="w-full h-full bg-slate-50 pt-10 overflow-y-auto custom-scrollbar">

                                            <!-- Mock App Header -->
                                            <div class="bg-white p-4 border-b border-slate-100 sticky top-0 z-10 flex items-center justify-between">
                                                <div class="font-bold text-slate-800">${post.platform || 'Social'}</div>
                                                <div class="w-8 h-8 bg-slate-100 rounded-full"></div>
                                            </div>

                                            <!-- Post Card -->
                                            <div class="p-4">
                                                <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                                    <!-- Post Header -->
                                                    <div class="p-4 flex items-center gap-3">
                                                        <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm ${currentPlatformColor}">
                                                            ${(post.platform || 'S').charAt(0)}
                                                        </div>
                                                        <div>
                                                            <div class="font-bold text-slate-900 text-sm">
                                                                AI Sensei
                                                            </div>
                                                            <div class="text-xs text-slate-400">Just now</div>
                                                        </div>
                                                    </div>

                                                    <!-- Post Content -->
                                                    <div class="px-4 pb-4 text-slate-800 text-sm leading-relaxed whitespace-pre-wrap">
                                                        ${post.content || html`<span class="text-slate-300 italic">No content...</span>`}
                                                        <div class="mt-2 text-blue-500 font-medium">
                                                            ${hashtagValue}
                                                        </div>
                                                    </div>

                                                    <!-- Post Footer / Stats -->
                                                    <div class="px-4 py-3 border-t border-slate-50 flex justify-between text-slate-400 text-xs">
                                                        <div class="flex gap-4">
                                                            <span class="flex items-center gap-1">❤️ 42</span>
                                                            <span class="flex items-center gap-1">💬 5</span>
                                                        </div>
                                                        <span class="flex items-center gap-1">↗️ Share</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Phone Home Bar -->
                                        <div class="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-slate-800 rounded-full z-20"></div>
                                    </div>
                                </div>
                            </div>

                            <div class="mt-8 pt-6 border-t border-slate-200 flex justify-center">
                                <button
                                    @click="${this._handleDiscard}"
                                    class="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium flex items-center gap-2"
                                >
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    ${this.t('common.discard_restart') !== 'common.discard_restart' ? this.t('common.discard_restart') : 'Zahodit a začít znovu'}
                                </button>
                            </div>
                        ` : html`
                            <ai-generator-panel
                                @ai-completion="${this._handleAiCompletion}"
                                .lesson="${this.lesson}"
                                .files="${this.files}"
                                viewTitle="${this.t('editor.post.title')}"
                                contentType="post"
                                fieldToUpdate="social_post"
                                description="${this.t('editor.post.description')}"
                                .inputsConfig=${[{
                                    id: 'platform',
                                    type: 'select',
                                    label: 'Platforma',
                                    options: ['Twitter', 'LinkedIn', 'Instagram'],
                                    default: 'Twitter'
                                }]}
                            ></ai-generator-panel>
                        `}
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-post', EditorViewPost);

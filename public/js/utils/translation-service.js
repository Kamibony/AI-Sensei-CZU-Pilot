export class TranslationService {
    constructor() {
        this.currentLanguage = localStorage.getItem('app_language') || 'cs';
        this.translations = {};
        this.listeners = [];
    }

    async init() {
        await this.loadTranslations(this.currentLanguage);
    }

    async loadTranslations(lang) {
        try {
            const response = await fetch(new URL(`../../locales/${lang}.json`, import.meta.url).href);
            if (!response.ok) throw new Error(`Failed to load ${lang}`);
            this.translations = await response.json();
            this.currentLanguage = lang;
            localStorage.setItem('app_language', lang);
            this.notifyListeners();
        } catch (error) {
            console.error('Translation error:', error);
            // Fallback to CS if loading fails and we are not already on CS
            if (lang !== 'cs') {
                await this.loadTranslations('cs');
            }
        }
    }

    t(key) {
        const keys = key.split('.');
        let value = this.translations;
        for (const k of keys) {
            value = value?.[k];
        }
        return value || key;
    }

    async setLanguage(lang) {
        if (lang === this.currentLanguage) return;
        await this.loadTranslations(lang);
    }

    subscribe(callback) {
        this.listeners.push(callback);
        // Return unsubscribe function
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    notifyListeners() {
        this.listeners.forEach(cb => cb(this.currentLanguage));
    }
}

export const translationService = new TranslationService();

export class TranslationService {
    constructor() {
        this.currentLanguage = localStorage.getItem('app_language') || 'cs';
        this.translations = {};
        this.listeners = [];
    }

    async init() {
        console.log('TranslationService: Initializing...');
        await this.loadTranslations(this.currentLanguage);
    }

    async loadTranslations(lang) {
        try {
            // 1. Použijeme absolútnu cestu od koreňa webu
            // 2. Pridáme časovú pečiatku (?v=...), aby sme obišli cache prehliadača
            const url = `/locales/${lang}.json?v=${new Date().getTime()}`;
            
            console.log(`TranslationService: Fetching translations from: ${url}`);
            
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Failed to load ${lang} (Status: ${response.status})`);
            }

            this.translations = await response.json();
            console.log(`TranslationService: Loaded ${Object.keys(this.translations).length} root keys for language '${lang}'`);

            this.currentLanguage = lang;
            localStorage.setItem('app_language', lang);
            this.notifyListeners();
        } catch (error) {
            console.error('Translation error:', error);
            
            // Fallback na češtinu, ak zlyhá iný jazyk
            if (lang !== 'cs') {
                console.log("TranslationService: Attempting fallback to 'cs'...");
                await this.loadTranslations('cs');
            }
        }
    }

    t(key) {
        if (!key) return '';
        
        const keys = key.split('.');
        let value = this.translations;
        
        for (const k of keys) {
            value = value?.[k];
            if (value === undefined) break;
        }
        
        // Ak sa preklad nenašiel, vrátime pôvodný kľúč
        return value || key;
    }

    async setLanguage(lang) {
        if (lang === this.currentLanguage) return;
        await this.loadTranslations(lang);
    }

    subscribe(callback) {
        this.listeners.push(callback);
        // Vrátime funkciu na odhlásenie (unsubscribe)
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    notifyListeners() {
        this.listeners.forEach(cb => cb(this.currentLanguage));
    }
}

export const translationService = new TranslationService();

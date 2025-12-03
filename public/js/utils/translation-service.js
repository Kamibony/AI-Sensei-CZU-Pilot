export class TranslationService {
    constructor() {
        // Načítame uložený jazyk, alebo použijeme default 'cs'
        this.currentLanguage = localStorage.getItem('app_language') || 'cs';
        this.translations = {};
        this.isLoaded = false;
        this.listeners = [];
    }

    async init() {
        if (this.isLoaded) return;
        await this.loadTranslations(this.currentLanguage);
        this.isLoaded = true;
        console.log(`TranslationService: Initialized with language '${this.currentLanguage}'`);
        this.notifyListeners();
    }

    async loadTranslations(lang) {
        try {
            // Pridanie časovej pečiatky zabraňuje cachovaniu JSON súboru
            const response = await fetch(`/locales/${lang}.json?v=${new Date().getTime()}`);
            if (!response.ok) throw new Error(`Failed to load translations for ${lang}`);
            
            this.translations = await response.json();
            
            // Uložíme do localStorage pre budúce návštevy
            localStorage.setItem('app_language', lang);
            this.currentLanguage = lang;
            
            this.notifyListeners();
        } catch (error) {
            console.error('TranslationService error:', error);
            // Fallback na CS ak zlyhá načítanie
            if (lang !== 'cs') {
                console.warn('Falling back to default language (cs)');
                await this.loadTranslations('cs');
            }
        }
    }

    t(key) {
        const keys = key.split('.');
        let value = this.translations;
        
        for (const k of keys) {
            if (value && value[k]) {
                value = value[k];
            } else {
                return key; // Vráti kľúč, ak preklad neexistuje
            }
        }
        return value;
    }

    // === ZJEDNOTENIE METÓD ===

    // 1. Štandardná zmena jazyka (používa Dashboard)
    async setLanguage(lang) {
        if (lang === this.currentLanguage) return;
        await this.loadTranslations(lang);
    }

    // 2. Zmena jazyka s vynúteným reloadom (používa Header)
    async changeLanguage(newLang) {
        if (newLang === this.currentLanguage) return;
        
        console.log(`TranslationService: Switching language to '${newLang}'...`);
        // Uložíme a reloadneme
        localStorage.setItem('app_language', newLang);
        window.location.reload();
    }

    // === POSLUCHÁČI (PRE ŠTUDENTOV) ===
    
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    notifyListeners() {
        this.listeners.forEach(cb => cb(this.currentLanguage));
    }
}

export const translationService = new TranslationService();

export class TranslationService {
    constructor() {
        // Načítame uložený jazyk, alebo použijeme default 'cs'
        this.currentLanguage = localStorage.getItem('app_language') || 'cs';
        this.translations = {};
        this.isLoaded = false;
        // === OPRAVA: Vrátenie poľa pre poslucháčov ===
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
            // Pridanie časovej pečiatky (?v=...) zabraňuje cachovaniu JSON súboru prehliadačom
            const response = await fetch(`/locales/${lang}.json?v=${new Date().getTime()}`);
            if (!response.ok) throw new Error(`Failed to load translations for ${lang}`);
            
            this.translations = await response.json();
            
            // Uložíme do localStorage pre budúce návštevy
            localStorage.setItem('app_language', lang);
            this.currentLanguage = lang;
            
            console.log(`TranslationService: Loaded ${Object.keys(this.translations).length} root keys for language '${lang}'`);
            this.notifyListeners();
        } catch (error) {
            console.error('TranslationService error:', error);
            // Fallback na CS ak zlyhá načítanie (napr. neexistujúci súbor)
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

    // === OPRAVA: Vrátená metóda subscribe, ktorú StudentDashboard vyžaduje ===
    subscribe(callback) {
        this.listeners.push(callback);
        // Return unsubscribe function
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    // === OPRAVA: Vrátená metóda notifyListeners ===
    notifyListeners() {
        this.listeners.forEach(cb => cb(this.currentLanguage));
    }

    // === NOVÁ METÓDA PRE PREPNUTIE JAZYKA (s reloadom) ===
    async changeLanguage(newLang) {
        if (newLang === this.currentLanguage) return;

        console.log(`TranslationService: Switching language to '${newLang}'...`);
        
        // 1. Uložíme novú preferenciu
        localStorage.setItem('app_language', newLang);
        
        // 2. Reload stránky zabezpečí, že sa všetko načíta nanovo a čisto v novom jazyku
        window.location.reload();
    }
}

export const translationService = new TranslationService();

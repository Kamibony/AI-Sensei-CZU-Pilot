// Konfigurácia podporovaných jazykov - JEDINÉ MIESTO PRE ÚPRAVU
export const SUPPORTED_LANGUAGES = [
    { code: 'cs', name: 'Čeština', flag: '🇨🇿' },
    { code: 'pt-br', name: 'Português', flag: '🇧🇷' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
    // Sem v budúcnosti pridáte ďalšie: { code: 'de', name: 'Deutsch', flag: '🇩🇪' }
];

export class TranslationService {
    constructor() {
        this.currentLanguage = localStorage.getItem('app_language') || 'cs';
        this.translations = {};
        this.listeners = [];
        this.isLoaded = false;
    }

    async init() {
        if (this.isLoaded) return;
        await this.loadTranslations(this.currentLanguage);
        this.isLoaded = true;
    }

    /**
     * Načíta preklady pre daný jazyk.
     * Vracia Promise, aby UI vedelo čakať (napr. zobraziť spinner).
     */
    async loadTranslations(lang) {
        // Validácia, či jazyk podporujeme
        const isSupported = SUPPORTED_LANGUAGES.some(l => l.code === lang);
        if (!isSupported) {
            console.warn(`Language '${lang}' not supported, falling back to 'cs'`);
            lang = 'cs';
        }

        try {
            // Timestamp ?v=... zabraňuje cachovaniu starých JSONov
            const response = await fetch(`/locales/${lang}.json?v=${Date.now()}`);
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            
            this.translations = await response.json();
            this.currentLanguage = lang;
            localStorage.setItem('app_language', lang);
            
            // Oznámime všetkým komponentom zmenu
            this.notifyListeners();
            console.log(`TranslationService: Switched to '${lang}'`);
        } catch (error) {
            console.error(`TranslationService: Failed to load '${lang}'`, error);
            if (lang !== 'cs') await this.loadTranslations('cs');
        }
    }

    /**
     * Hlavná funkcia pre zmenu jazyka z UI.
     * Už nevyžaduje reload stránky, ale podporuje ho, ak je treba.
     */
    async changeLanguage(lang) {
        if (lang === this.currentLanguage) return;
        await this.loadTranslations(lang);
        // Voliteľné: Ak chcete zachovať "Hard Reload" pre istotu, odkomentujte toto:
        // window.location.reload(); 
    }

    t(key) {
        const keys = key.split('.');
        let value = this.translations;
        for (const k of keys) {
            if (value && value[k]) value = value[k];
            else return key;
        }
        return value;
    }

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

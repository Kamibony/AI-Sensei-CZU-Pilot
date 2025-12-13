// public/js/utils/translation-service.js

// Konfigurácia podporovaných jazykov
export const SUPPORTED_LANGUAGES = [
    { code: 'cs', name: 'Čeština', flag: '🇨🇿' },
    { code: 'pt-br', name: 'Português', flag: '🇧🇷' },
    { code: 'en', name: 'English', flag: '🇬🇧' }
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
     */
    async loadTranslations(lang) {
        // Validácia, či jazyk podporujeme
        const isSupported = SUPPORTED_LANGUAGES.some(l => l.code === lang);
        if (!isSupported) {
            console.warn(`TranslationService: Language '${lang}' not supported, falling back to 'cs'`);
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
            // Fallback na češtinu v prípade chyby siete alebo chýbajúceho súboru
            if (lang !== 'cs') {
                console.log("TranslationService: Attempting fallback to 'cs'");
                await this.loadTranslations('cs');
            }
        }
    }

    /**
     * Zmena jazyka z UI
     */
    async changeLanguage(lang) {
        if (lang === this.currentLanguage) return;
        await this.loadTranslations(lang);
    }

    /**
     * Hlavná prekladová funkcia
     * @param {string} key - Kľúč prekladu (napr. "common.save")
     * @param {object} params - Parametre na nahradenie (napr. { count: 5 })
     */
    t(key, params = {}) {
        if (!this.translations) return key;

        const keys = key.split('.');
        let value = this.translations;
        
        // 1. Nájdenie hodnoty v objekte
        for (const k of keys) {
            if (value && value[k] !== undefined) {
                value = value[k];
            } else {
                return key; // Kľúč sa nenašiel
            }
        }

        // 2. Nahradenie parametrov (Interpolácia)
        // Toto chýbalo v pôvodnom utils, ale je nutné pre dynamické texty
        if (typeof value === 'string' && params && Object.keys(params).length > 0) {
            for (const [pKey, pVal] of Object.entries(params)) {
                value = value.replace(`{${pKey}}`, String(pVal));
            }
        }

        return value;
    }

    subscribe(callback) {
        this.listeners.push(callback);
        // Hneď zavoláme callback s aktuálnym jazykom
        callback(this.currentLanguage);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    notifyListeners() {
        this.listeners.forEach(cb => cb(this.currentLanguage));
    }
}

// Exportujeme inštanciu (Singleton)
export const translationService = new TranslationService();

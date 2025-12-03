import { translationService } from './translation-service.js';

export const Localized = (superClass) => class extends superClass {
    
    // Definujeme internú reaktívnu property.
    // Keď sa táto hodnota zmení, LitElement AUTOMATICKY prekreslí komponent.
    static get properties() {
        return {
            _currentLang: { state: true }
        };
    }

    constructor() {
        super();
        this._langUnsubscribe = null;
        // Nastavíme počiatočnú hodnotu
        this._currentLang = translationService.currentLanguage;
    }

    connectedCallback() {
        super.connectedCallback();
        // Prihlásime sa na odber zmien
        this._langUnsubscribe = translationService.subscribe((newLang) => {
            console.log(`Mixin: Language update received -> ${newLang}`);
            this._currentLang = newLang; // Zmena tejto property spustí render()
            this.requestUpdate(); // Pre istotu poistka
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._langUnsubscribe) {
            this._langUnsubscribe();
        }
    }

    t(key) {
        return translationService.t(key);
    }
};

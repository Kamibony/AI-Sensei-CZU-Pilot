import { translationService } from './translation-service.js';

/**
 * Mixin, ktorý automaticky pripojí komponent k prekladom.
 * Použitie: class MyComponent extends Localized(LitElement) { ... }
 */
export const Localized = (superClass) => class extends superClass {
    
    constructor() {
        super();
        this._langUnsubscribe = null;
    }

    connectedCallback() {
        super.connectedCallback();
        // Automatický odber zmien
        this._langUnsubscribe = translationService.subscribe(() => {
            this.requestUpdate(); // LitElement prekreslí komponent
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        // Automatické odhlásenie (prevencia memory leaks)
        if (this._langUnsubscribe) {
            this._langUnsubscribe();
        }
    }

    /**
     * Skratka pre preklad priamo v šablóne.
     * Použitie: ${this.t('common.hello')}
     */
    t(key) {
        return translationService.t(key);
    }
};

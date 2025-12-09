export const SUPPORTED_LANGUAGES = [
    { code: 'cs', flag: '🇨🇿', name: 'Čeština' },
    { code: 'pt_br', flag: '🇧🇷', name: 'Português' }
];

export const translationService = {
  listeners: new Set(),
  translations: null,
  currentLanguage: 'cs',

  t(key, params = {}) {
    if (!this.translations) {
      return key; // Fallback to key if not loaded
    }

    const keys = key.split('.');
    let value = this.translations;
    for (const k of keys) {
        value = value?.[k];
    }

    if (!value) return key;

    // Replace params
    for (const [pKey, pVal] of Object.entries(params)) {
        value = value.replace(`{${pKey}}`, pVal);
    }
    return value;
  },

  async changeLanguage(langCode) {
      this.currentLanguage = langCode;
      await this.loadTranslations();
  },

  async loadTranslations() {
      try {
          const response = await fetch(`/locales/${this.currentLanguage}.json`);
          if (!response.ok) throw new Error("Translation file not found");
          this.translations = await response.json();
          this.notifyListeners();
      } catch (e) {
          console.error("Failed to load translations", e);
          if (this.currentLanguage !== 'cs') {
              this.currentLanguage = 'cs';
              this.loadTranslations();
          }
      }
  },

  subscribe(callback) {
      this.listeners.add(callback);
      if (this.translations) callback(this.currentLanguage);
      return () => this.listeners.delete(callback);
  },

  notifyListeners() {
      for (const listener of this.listeners) {
          listener(this.currentLanguage);
      }
  }
};

// Initialize immediately
translationService.loadTranslations();

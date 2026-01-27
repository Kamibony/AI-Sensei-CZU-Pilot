import { LitElement } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
export const Localized = (superClass) => class extends superClass {
    t(key) { return key; }
};

export class LitElement extends HTMLElement {
    constructor() {
        super();
    }
    connectedCallback() {
        this.performUpdate();
    }
    requestUpdate() {
        this.performUpdate();
    }
    performUpdate() {
        if (this.render) {
            const template = this.render();
            const root = this.createRenderRoot();
            if (root) {
                 if (root === this) {
                     this.innerHTML = String(template || '');
                 } else {
                     root.innerHTML = String(template || '');
                 }
            }
        }
    }
    createRenderRoot() {
        return this.attachShadow({mode:'open'});
    }
    updated() {}
    disconnectedCallback() {}
    firstUpdated() {}
}
export const html = (strings, ...values) => {
    let result = "";
    strings.forEach((str, i) => {
        let val = values[i];
        if (typeof val === 'function') {
            val = '';
        } else if (val === undefined || val === null) {
            val = '';
        } else if (Array.isArray(val)) {
            val = val.join('');
        }
        result += str + String(val);
    });
    return result;
};
export const css = (strings, ...values) => strings[0];
export const nothing = "";

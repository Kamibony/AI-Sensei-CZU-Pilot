import { css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

export const baseStyles = css`
  /*
   * Base styles for LitElement components.
   * Note: Components using createRenderRoot() { return this; } will render to Light DOM
   * and primarily use Tailwind utility classes from the global stylesheet.
   */
  :host {
    display: block;
  }
`;

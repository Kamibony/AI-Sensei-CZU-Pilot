export class TourGuide {
    constructor() {
        this.overlay = null;
        this.tooltip = null;
        this.currentStepIndex = 0;
        this.steps = [];
        this.onComplete = null;
        this.activeElement = null;
        this.resizeListener = this._handleResize.bind(this);
    }

    start(steps, onComplete) {
        this.steps = steps;
        this.onComplete = onComplete;
        this.currentStepIndex = 0;

        this._createOverlay();
        window.addEventListener('resize', this.resizeListener);
        this._processStep();
    }

    stop() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }
        window.removeEventListener('resize', this.resizeListener);
        if (this.onComplete) {
            this.onComplete();
        }
    }

    _createOverlay() {
        if (this.overlay) return;

        // The spotlight element uses a huge box-shadow to darken everything else
        this.overlay = document.createElement('div');
        this.overlay.className = 'fixed transition-all duration-500 ease-in-out z-[9990] rounded-lg pointer-events-none';
        this.overlay.style.boxShadow = '0 0 0 9999px rgba(0, 0, 0, 0.7)';
        document.body.appendChild(this.overlay);
    }

    _handleResize() {
        if (this.activeElement) {
            this._highlightElement(this.activeElement);
        }
    }

    async _processStep() {
        if (this.currentStepIndex >= this.steps.length) {
            this.stop();
            return;
        }

        const step = this.steps[this.currentStepIndex];

        // Wait for element if needed
        let element = document.querySelector(step.selector);

        // Note: waitFor logic could be extended to MutationObserver if simple query fails
        // For now, we use a simple polling mechanism if waitFor is implicit or explicit
        if (!element) {
            element = await this._waitForElement(step.selector);
        }

        if (element) {
            this.activeElement = element;
            // Scroll into view
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Highlight
            this._highlightElement(element);

            // Show Tooltip
            this._showTooltip(step, element);
        } else {
            console.warn(`TourGuide: Element not found for selector ${step.selector}. Skipping step.`);
            this._nextStep();
        }
    }

    _waitForElement(selector, timeout = 5000) {
        return new Promise((resolve) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);

            const observer = new MutationObserver((mutations, obs) => {
                const el = document.querySelector(selector);
                if (el) {
                    obs.disconnect();
                    resolve(el);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    }

    _highlightElement(element) {
        if (!this.overlay) return;

        const rect = element.getBoundingClientRect();

        // Add some padding
        const padding = 5;
        this.overlay.style.width = `${rect.width + padding * 2}px`;
        this.overlay.style.height = `${rect.height + padding * 2}px`;
        this.overlay.style.top = `${rect.top - padding}px`;
        this.overlay.style.left = `${rect.left - padding}px`;
    }

    _showTooltip(step, targetElement) {
        if (this.tooltip) {
            this.tooltip.remove();
        }

        this.tooltip = document.createElement('div');
        this.tooltip.className = 'fixed z-[9999] bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full animate-fade-in-up border border-slate-100';

        this.tooltip.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h3 class="text-lg font-bold text-slate-900">${step.title}</h3>
                <button id="tour-close-btn" class="text-slate-400 hover:text-slate-600">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div class="text-slate-600 mb-6 text-sm leading-relaxed">
                ${step.content}
            </div>
            <div class="flex justify-between items-center">
                <div class="flex gap-1">
                    ${this.steps.map((_, idx) => `
                        <div class="w-2 h-2 rounded-full ${idx === this.currentStepIndex ? 'bg-indigo-600' : 'bg-slate-200'}"></div>
                    `).join('')}
                </div>
                <button id="tour-next-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-xl shadow-lg shadow-indigo-200 transition-all transform active:scale-95 text-sm">
                    ${this.currentStepIndex === this.steps.length - 1 ? 'Dokončit' : 'Další →'}
                </button>
            </div>
        `;

        document.body.appendChild(this.tooltip);

        // Bind events
        this.tooltip.querySelector('#tour-next-btn').addEventListener('click', () => this._nextStep());
        this.tooltip.querySelector('#tour-close-btn').addEventListener('click', () => this.stop());

        // Position tooltip
        this._positionTooltip(targetElement, step.position || 'bottom');
    }

    _positionTooltip(targetElement, position) {
        const targetRect = targetElement.getBoundingClientRect();
        const tooltipRect = this.tooltip.getBoundingClientRect();
        const margin = 15;

        let top, left;

        switch (position) {
            case 'top':
                top = targetRect.top - tooltipRect.height - margin;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'bottom':
                top = targetRect.bottom + margin;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'left':
                top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                left = targetRect.left - tooltipRect.width - margin;
                break;
            case 'right':
                top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                left = targetRect.right + margin;
                break;
            case 'center':
                top = (window.innerHeight / 2) - (tooltipRect.height / 2);
                left = (window.innerWidth / 2) - (tooltipRect.width / 2);
                break;
            default: // Default to bottom
                top = targetRect.bottom + margin;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
        }

        // Boundary checks
        if (left < margin) left = margin;
        if (left + tooltipRect.width > window.innerWidth - margin) left = window.innerWidth - tooltipRect.width - margin;
        if (top < margin) top = margin;
        if (top + tooltipRect.height > window.innerHeight - margin) top = window.innerHeight - tooltipRect.height - margin;

        this.tooltip.style.top = `${top}px`;
        this.tooltip.style.left = `${left}px`;
    }

    _nextStep() {
        this.currentStepIndex++;
        this._processStep();
    }
}

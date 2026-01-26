export class TourGuide {
    constructor() {
        this.driver = null;
    }

    start(steps) {
        if (!steps || !Array.isArray(steps) || steps.length === 0) {
            console.warn("TourGuide: No steps provided.");
            return;
        }

        // Resolve driver function from window global (driver.js v1.x IIFE)
        // Usually window.driver.js.driver or just window.driver depending on build
        const driverFn = window.driver?.js?.driver || window.driver;

        if (!driverFn) {
            console.error("TourGuide: driver.js library not found. Ensure it is loaded in index.html.");
            return;
        }

        // Filter out steps where element doesn't exist to prevent crashes or stuck tour
        const validSteps = steps.filter(step => {
            if (!step.element) return false;

            // Check existence
            const el = document.querySelector(step.element);
            if (!el) {
                 console.warn(`TourGuide: Element not found for selector "${step.element}". Skipping step.`);
                 return false;
            }
            // Check visibility - driver.js might handle this, but safer to check
            if (el.offsetParent === null) {
                console.warn(`TourGuide: Element "${step.element}" is hidden. Skipping step.`);
                return false;
            }
            return true;
        });

        if (validSteps.length === 0) {
             console.warn("TourGuide: No valid steps found for current view.");
             alert("Tour not available for this view (elements not found).");
             return;
        }

        try {
            this.driver = driverFn({
                showProgress: true,
                animate: true,
                steps: validSteps,
                onDestroyed: () => {
                    this.driver = null;
                },
                // Custom text for buttons if needed, relying on defaults for now
            });

            this.driver.drive();
        } catch (e) {
            console.error("TourGuide: Failed to start tour.", e);
        }
    }
}

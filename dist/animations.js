/* ═══════════════════════════════════════════════════
   SPRAWL — Animation Sequencer
   Configurable async transition pipeline
   ═══════════════════════════════════════════════════ */
// ── Transition Lock ────────────────────────────────
let _transitioning = false;
/** Returns true if a transition sequence is currently running. */
export function isTransitioning() {
    return _transitioning;
}
// ── Sequence Runner ────────────────────────────────
/**
 * Execute an ordered list of animation steps sequentially.
 * Sets the transition lock while running.
 */
export async function runSequence(steps) {
    if (_transitioning)
        return;
    _transitioning = true;
    try {
        for (const step of steps) {
            await step();
        }
    }
    finally {
        _transitioning = false;
    }
}
// ── Helper ─────────────────────────────────────────
function getDuration(defaultMs) {
    const isAnimEnabled = localStorage.getItem("sprawl_animations") !== "false";
    return isAnimEnabled ? defaultMs : 0;
}
// ── Primitives ─────────────────────────────────────
/** Wait for a given number of milliseconds. */
export function wait(ms) {
    return () => new Promise((resolve) => setTimeout(resolve, getDuration(ms)));
}
/**
 * Type text character-by-character into an element,
 * inserting each character before the cursor element (if present).
 */
export function typeText(target, text, charDelayMs = 40) {
    return () => new Promise((resolve) => {
        const cursor = target.querySelector(".cmd-prompt__cursor");
        const delay = getDuration(charDelayMs);
        if (delay === 0) {
            const textNode = document.createTextNode(text);
            if (cursor) {
                target.insertBefore(textNode, cursor);
            }
            else {
                target.appendChild(textNode);
            }
            resolve();
            return;
        }
        let i = 0;
        function tick() {
            if (i < text.length) {
                const charNode = document.createTextNode(text[i]);
                if (cursor) {
                    target.insertBefore(charNode, cursor);
                }
                else {
                    target.appendChild(charNode);
                }
                i++;
                setTimeout(tick, delay);
            }
            else {
                resolve();
            }
        }
        tick();
    });
}
/**
 * Append a new line of text to a container element.
 * Optionally accepts a CSS class for the line.
 */
export function printLine(container, text, className = "transition-output") {
    return () => {
        const line = document.createElement("div");
        line.className = className;
        line.textContent = text;
        container.appendChild(line);
        return Promise.resolve();
    };
}
export function updateLastLineText(container, text, className = "transition-output") {
    return () => {
        const line = container.querySelector(`.${className}`);
        if (line) {
            line.textContent = text;
        }
        else {
            const newLine = document.createElement("div");
            newLine.className = className;
            newLine.textContent = text;
            container.appendChild(newLine);
        }
        return Promise.resolve();
    };
}
/**
 * Expand an overlay from the bottom of the top-section down to fill the screen.
 * This creates the "border wipe" effect — a green-bordered bar sliding down.
 */
export function expandOverlay(screen, durationMs = 400) {
    return () => new Promise((resolve) => {
        // Find the top section to know where to start the wipe
        const topSection = screen.querySelector(".home-section--top");
        const startY = topSection
            ? topSection.getBoundingClientRect().bottom -
                screen.getBoundingClientRect().top
            : 0;
        const overlay = document.createElement("div");
        overlay.className = "transition-wipe";
        overlay.style.top = `${startY}px`;
        overlay.style.height = "0";
        const duration = getDuration(durationMs);
        overlay.style.transitionDuration = `${duration}ms`;
        screen.appendChild(overlay);
        // Force layout recalc before triggering transition
        void overlay.offsetHeight;
        const targetHeight = screen.getBoundingClientRect().height - startY;
        overlay.style.height = `${targetHeight}px`;
        // Resolve after the CSS transition completes
        setTimeout(resolve, duration + 20);
    });
}
/**
 * Hold a full-screen black overlay for a duration, then remove it.
 */
export function screenBlack(screen, durationMs = 800) {
    return () => new Promise((resolve) => {
        const blackout = document.createElement("div");
        blackout.className = "transition-blackout";
        screen.appendChild(blackout);
        const duration = getDuration(durationMs);
        setTimeout(resolve, duration);
    });
}
/**
 * Rapid opacity flickers on the screen element.
 */
export function screenFlicker(screen, count = 3) {
    return () => new Promise((resolve) => {
        const duration = getDuration(80);
        if (duration === 0) {
            screen.style.opacity = "1";
            resolve();
            return;
        }
        let i = 0;
        function tick() {
            if (i < count * 2) {
                screen.style.opacity = i % 2 === 0 ? "0" : "1";
                i++;
                setTimeout(tick, duration);
            }
            else {
                screen.style.opacity = "1";
                resolve();
            }
        }
        tick();
    });
}
/**
 * Remove all transition overlay elements from the screen.
 */
export function clearOverlays(screen) {
    return () => {
        screen
            .querySelectorAll(".transition-wipe, .transition-blackout")
            .forEach((el) => el.remove());
        return Promise.resolve();
    };
}
// ── Pre-built Sequences ────────────────────────────
/**
 * Build the app-open transition sequence.
 * @param screen   The .screen element
 * @param promptEl The .cmd-prompt element
 * @param command  The command string to type (e.g. "PIXSCAN.BIN")
 * @param onRender Callback that performs the actual render swap
 */
export function buildOpenSequence(screen, promptEl, command, onRender) {
    // We'll print output lines into the top section
    const topSection = screen.querySelector(".home-section--top") || screen;
    return [
        // 1. Type the command
        typeText(promptEl, ` EXEC ${command}`, 35),
        wait(200),
        // 2. Print execution feedback
        printLine(topSection, "EXECUTING COMMAND"),
        wait(350),
        printLine(topSection, "."),
        wait(350),
        printLine(topSection, "."),
        wait(350),
        printLine(topSection, "."),
        wait(200),
        // 3. Border wipe down
        expandOverlay(screen, 400),
        // 4. Black screen hold — render happens under the blackout
        screenBlack(screen, 800),
        // 5. Swap content under the blackout, then clear
        () => {
            onRender();
            return Promise.resolve();
        },
        wait(100),
        clearOverlays(screen),
    ];
}
/**
 * Build the app-exit transition sequence.
 * @param screen   The .screen element
 * @param onRender Callback that performs the actual render swap
 */
export function buildExitSequence(screen, onRender) {
    return [
        // 1. Border wipe down
        expandOverlay(screen, 400),
        // 2. Black out
        screenBlack(screen, 500),
        // 3. Swap content
        () => {
            onRender();
            return Promise.resolve();
        },
        wait(100),
        clearOverlays(screen),
    ];
}

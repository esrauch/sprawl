import type { App, AppApi } from "../../apps_api/types.js";
import { AppFolder } from "../../apps_api/types.js";

// ── Local State ────────────────────────────────────

let cells: HTMLDivElement[] = [];
let animationTimer: number | undefined;

// ── Module ─────────────────────────────────────────

const pixscan: App = {
    manifest: {
        id: "pixscan",
        title: "PIXSCAN",
        command: "PIXSCAN.BIN",
        icon: "▦",
        description: "Execute pattern recognition module. Monitor pixel grid output.",
        folder: AppFolder.GAMES,
    },

    onMount(api: AppApi) {
        const container = api.container;
        cells = [];

        // Description card
        const card = document.createElement("div");
        card.className = "panel-card";
        const subtitle = document.createElement("h2");
        subtitle.textContent = "PATTERN SCAN";
        const description = document.createElement("p");
        description.textContent =
            "EXEC pattern recognition subroutine. Grid output will render to display buffer.";
        card.appendChild(subtitle);
        card.appendChild(description);
        container.appendChild(card);

        // Pixel grid
        const pixelDisplay = document.createElement("div");
        pixelDisplay.className = "pixel-display";
        for (let i = 0; i < 64; i += 1) {
            const cell = document.createElement("div");
            cell.className = "pixel-cell";
            cells.push(cell);
            pixelDisplay.appendChild(cell);
        }
        container.appendChild(pixelDisplay);

        // Execute button
        const startButton = document.createElement("button");
        startButton.className = "button";
        startButton.type = "button";
        startButton.textContent = "EXECUTE";
        startButton.addEventListener("click", runPattern);
        container.appendChild(startButton);
    },

    onUnmount() {
        if (animationTimer !== undefined) {
            clearInterval(animationTimer);
            animationTimer = undefined;
        }
        cells = [];
    },
};

// ── Internal Logic ─────────────────────────────────

function runPattern(): void {
    const pattern = generatePattern();
    cells.forEach((cell, index) => {
        cell.classList.toggle("on", pattern[index]);
    });
}

function generatePattern(): boolean[] {
    const pattern: boolean[] = [];
    for (let i = 0; i < 64; i += 1) {
        const x = i % 8;
        const y = Math.floor(i / 8);
        const wave =
            Math.sin((x + performance.now() / 80) * 1.2) +
            Math.cos((y + performance.now() / 120) * 1.8);
        pattern.push(wave > 0.4);
    }
    return pattern;
}

export default pixscan;

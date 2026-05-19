import { isTransitioning, runSequence, buildOpenSequence, buildExitSequence, } from "./animations.js";
// ── App Registry ───────────────────────────────────
const apps = [
    {
        id: "retro",
        title: "PIXSCAN",
        description: "Execute pattern recognition module. Monitor pixel grid output.",
        icon: "▦",
        command: "PIXSCAN.BIN",
        render: renderRetroGame,
    },
    {
        id: "notes",
        title: "DATALOG",
        description: "Access crew manifest and mission documentation interface.",
        icon: "▤",
        command: "DATALOG.BIN",
        render: renderNotesApp,
    },
    {
        id: "settings",
        title: "SYSCONF",
        description: "Terminal configuration. Kernel parameters. Access level management.",
        icon: "⌬",
        command: "SYSCONF.BIN",
        render: renderSettingsApp,
    },
];
// ── State ──────────────────────────────────────────
const root = document.getElementById("app");
if (!root) {
    throw new Error("App root element not found.");
}
const state = {
    activeAppId: "",
};
// ── Helpers ────────────────────────────────────────
function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className)
        element.className = className;
    if (text)
        element.textContent = text;
    return element;
}
function formatSystemTime() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
}
// ── Shell & Status Bar ─────────────────────────────
function createPhoneShell(content) {
    const shell = createElement("div", "phone-shell");
    const screen = createElement("div", "screen");
    screen.appendChild(createStatusBar());
    screen.appendChild(content);
    shell.appendChild(screen);
    return shell;
}
function createStatusBar() {
    const status = createElement("div", "status-bar");
    status.textContent = formatSystemTime();
    setInterval(() => {
        status.textContent = formatSystemTime();
    }, 1000);
    return status;
}
// ── Home Screen ────────────────────────────────────
function renderHomeScreen() {
    const panel = createElement("div", "home-panel");
    /* ── TOP SECTION: terminal header ── */
    const topSection = createElement("div", "home-section home-section--top");
    const title = createElement("h1", "home-title", "MAIN TERMINAL");
    topSection.appendChild(title);
    const prompt = createElement("div", "cmd-prompt");
    const promptText = createElement("span", "cmd-prompt__text", "CMD$ >");
    const cursor = createElement("span", "cmd-prompt__cursor", "\u2588");
    prompt.appendChild(promptText);
    prompt.appendChild(cursor);
    topSection.appendChild(prompt);
    panel.appendChild(topSection);
    /* ── BOTTOM SECTION: app grid ── */
    const bottomSection = createElement("div", "home-section home-section--bottom");
    const grid = createElement("div", "app-grid");
    apps.forEach((app) => {
        const button = createElement("button", "app-icon");
        button.type = "button";
        button.addEventListener("click", () => openApp(app.id));
        const icon = createElement("div", "icon-sprite", app.icon);
        const label = createElement("span", "icon-label", app.title);
        button.appendChild(icon);
        button.appendChild(label);
        grid.appendChild(button);
    });
    bottomSection.appendChild(grid);
    panel.appendChild(bottomSection);
    return panel;
}
// ── App View ───────────────────────────────────────
function renderAppView(app) {
    const panel = createElement("div", "app-panel");
    const header = createElement("div", "panel-header");
    const title = createElement("h1", undefined, app.title);
    const backButton = createElement("button", "back-button", "EXIT");
    backButton.type = "button";
    backButton.addEventListener("click", () => exitApp());
    header.appendChild(title);
    header.appendChild(backButton);
    panel.appendChild(header);
    panel.appendChild(app.render());
    return panel;
}
// ── App Content Renderers ──────────────────────────
function renderRetroGame() {
    const container = createElement("div", "panel-content");
    const messageCard = createElement("div", "panel-card");
    const subtitle = createElement("h2", undefined, "PATTERN SCAN");
    const description = createElement("p", undefined, "EXEC pattern recognition subroutine. Grid output will render to display buffer.");
    messageCard.appendChild(subtitle);
    messageCard.appendChild(description);
    const pixelDisplay = createElement("div", "pixel-display");
    const cells = [];
    for (let i = 0; i < 64; i += 1) {
        const cell = createElement("div", "pixel-cell");
        cells.push(cell);
        pixelDisplay.appendChild(cell);
    }
    const startButton = createElement("button", "button", "EXECUTE");
    startButton.type = "button";
    startButton.addEventListener("click", () => animatePixels(cells));
    container.appendChild(messageCard);
    container.appendChild(pixelDisplay);
    container.appendChild(startButton);
    return container;
}
function renderNotesApp() {
    const container = createElement("div", "panel-content");
    const card = createElement("div", "panel-card");
    const subtitle = createElement("h2", undefined, "CREW LOG");
    const description = createElement("p", undefined, "No entries found. Awaiting crew input. Data will be stored to local partition.");
    card.appendChild(subtitle);
    card.appendChild(description);
    container.appendChild(card);
    return container;
}
function renderSettingsApp() {
    const container = createElement("div", "panel-content");
    const card = createElement("div", "panel-card");
    const subtitle = createElement("h2", undefined, "SYSTEM CONFIG");
    const description = createElement("p", undefined, "Terminal mode: PORTRAIT. Render pipeline: ACTIVE. Access level: CREW. Kernel v2.4.1-stable.");
    card.appendChild(subtitle);
    card.appendChild(description);
    container.appendChild(card);
    return container;
}
// ── Pixel Game Logic ───────────────────────────────
function animatePixels(cells) {
    const pattern = generatePattern();
    cells.forEach((cell, index) => {
        const on = pattern[index];
        cell.classList.toggle("on", on);
    });
}
function generatePattern() {
    const pattern = [];
    for (let i = 0; i < 64; i += 1) {
        const x = i % 8;
        const y = Math.floor(i / 8);
        const wave = Math.sin((x + performance.now() / 80) * 1.2) + Math.cos((y + performance.now() / 120) * 1.8);
        pattern.push(wave > 0.4);
    }
    return pattern;
}
// ── Navigation with Transitions ────────────────────
function getScreen() {
    return root.querySelector(".screen");
}
function openApp(appId) {
    if (isTransitioning())
        return;
    const app = apps.find((a) => a.id === appId);
    if (!app)
        return;
    const screen = getScreen();
    const promptEl = root.querySelector(".cmd-prompt");
    if (!screen || !promptEl) {
        // Fallback: render immediately if DOM isn't ready
        state.activeAppId = appId;
        render();
        return;
    }
    const steps = buildOpenSequence(screen, promptEl, app.command, () => {
        state.activeAppId = appId;
        renderContent(screen);
    });
    void runSequence(steps);
}
function exitApp() {
    if (isTransitioning())
        return;
    const screen = getScreen();
    if (!screen) {
        state.activeAppId = "";
        render();
        return;
    }
    const steps = buildExitSequence(screen, () => {
        state.activeAppId = "";
        renderContent(screen);
    });
    void runSequence(steps);
}
/**
 * Replace the content inside an existing screen element,
 * preserving the status bar and shell.
 */
function renderContent(screen) {
    // Remove everything except the status bar and transition overlays
    const children = Array.from(screen.children);
    for (const child of children) {
        if (!child.classList.contains("status-bar") &&
            !child.classList.contains("transition-wipe") &&
            !child.classList.contains("transition-blackout")) {
            child.remove();
        }
    }
    const currentApp = apps.find((a) => a.id === state.activeAppId);
    const content = currentApp ? renderAppView(currentApp) : renderHomeScreen();
    screen.appendChild(content);
}
/** Full render — rebuilds the entire shell. Used for initial load. */
function render() {
    root.innerHTML = "";
    const currentApp = apps.find((app) => app.id === state.activeAppId);
    const content = currentApp ? renderAppView(currentApp) : renderHomeScreen();
    root.appendChild(createPhoneShell(content));
}
// ── Init ───────────────────────────────────────────
render();

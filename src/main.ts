import {
    isTransitioning,
    runSequence,
    buildOpenSequence,
    buildExitSequence,
} from "./animations.js";
import type { App } from "./apps_api/types.js";
import { AppFolder } from "./apps_api/types.js";
import { apps } from "./apps/registry.js";

// ── State ──────────────────────────────────────────

const root = document.getElementById("app") as HTMLElement;
if (!root) {
    throw new Error("App root element not found.");
}

const state = {
    activeAppId: "",
    activeApp: null as App | null,
    activeFolder: AppFolder.MISSION,
};

// ── Helpers ────────────────────────────────────────

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

function formatSystemTime(): string {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
}

// ── Shell & Status Bar ─────────────────────────────

function createPhoneShell(content: HTMLElement): HTMLElement {
    const shell = createElement("div", "phone-shell");
    const screen = createElement("div", "screen");
    screen.appendChild(createStatusBar());
    screen.appendChild(content);
    shell.appendChild(screen);
    return shell;
}

function createStatusBar(): HTMLElement {
    const status = createElement("div", "status-bar");
    status.textContent = formatSystemTime();
    setInterval(() => {
        status.textContent = formatSystemTime();
    }, 1000);
    return status;
}

// ── Home Screen ────────────────────────────────────

function renderHomeScreen(): HTMLElement {
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

    /* ── MIDDLE SECTION: Folders ── */
    const middleSection = createElement("div", "folder-bar");

    /* ── BOTTOM SECTION: app grid ── */
    const bottomSection = createElement("div", "home-section home-section--bottom");
    const grid = createElement("div", "app-grid");
    bottomSection.appendChild(grid);

    function renderGrid() {
        grid.innerHTML = "";
        const folderApps = apps.filter((app) => app.manifest.folder === state.activeFolder);
        folderApps.forEach((appModule) => {
            const m = appModule.manifest;
            const button = createElement("button", "app-icon");
            button.type = "button";
            button.addEventListener("click", () => openApp(m.id));

            const icon = createElement("div", "icon-sprite", m.icon);
            const label = createElement("span", "icon-label", m.title);
            button.appendChild(icon);
            button.appendChild(label);
            grid.appendChild(button);
        });
    }

    const folderButtons: HTMLButtonElement[] = [];
    Object.values(AppFolder).forEach((folder) => {
        const folderBtn = createElement("button", "folder-button");
        if (state.activeFolder === folder) folderBtn.classList.add("active");
        folderBtn.textContent = `[ ${folder} ]`;
        folderBtn.type = "button";
        folderBtn.addEventListener("click", () => {
            state.activeFolder = folder as AppFolder;
            folderButtons.forEach(btn => btn.classList.remove("active"));
            folderBtn.classList.add("active");
            renderGrid();
        });
        folderButtons.push(folderBtn as HTMLButtonElement);
        middleSection.appendChild(folderBtn);
    });

    panel.appendChild(middleSection);
    panel.appendChild(bottomSection);

    // Initial render
    renderGrid();

    return panel;
}

// ── App View ───────────────────────────────────────

function renderAppView(appModule: App): HTMLElement {
    const panel = createElement("div", "app-panel");

    // Framework-controlled header (title + exit button)
    const header = createElement("div", "panel-header");
    const title = createElement("h1", undefined, appModule.manifest.title);
    const backButton = createElement("button", "back-button", "EXIT");
    backButton.type = "button";
    backButton.addEventListener("click", () => exitApp());
    header.appendChild(title);
    header.appendChild(backButton);
    panel.appendChild(header);

    // App-owned container
    const container = createElement("div", "panel-content");
    panel.appendChild(container);

    // Mount the app
    appModule.onMount({ container });

    return panel;
}

// ── Navigation with Transitions ────────────────────

function getScreen(): HTMLElement | null {
    return root.querySelector(".screen");
}

function findApp(appId: string): App | undefined {
    return apps.find((a) => a.manifest.id === appId);
}

function openApp(appId: string): void {
    if (isTransitioning()) return;

    const appModule = findApp(appId);
    if (!appModule) return;

    const screen = getScreen();
    const promptEl = root.querySelector(".cmd-prompt") as HTMLElement | null;
    if (!screen || !promptEl) {
        // Fallback: render immediately if DOM isn't ready
        mountApp(appModule);
        render();
        return;
    }

    const steps = buildOpenSequence(screen, promptEl, appModule.manifest.command, () => {
        mountApp(appModule);
        renderContent(screen);
    });

    void runSequence(steps);
}

function exitApp(): void {
    if (isTransitioning()) return;

    const screen = getScreen();
    if (!screen) {
        unmountApp();
        render();
        return;
    }

    const steps = buildExitSequence(screen, () => {
        unmountApp();
        renderContent(screen);
    });

    void runSequence(steps);
}

/** Set the active app and track it for unmount. */
function mountApp(appModule: App): void {
    state.activeAppId = appModule.manifest.id;
    state.activeApp = appModule;
}

/** Unmount the current app and clear active state. */
function unmountApp(): void {
    if (state.activeApp) {
        state.activeApp.onUnmount?.();
    }
    state.activeAppId = "";
    state.activeApp = null;
}

/**
 * Replace the content inside an existing screen element,
 * preserving the status bar and shell.
 */
function renderContent(screen: HTMLElement): void {
    // Remove everything except the status bar and transition overlays
    const children = Array.from(screen.children);
    for (const child of children) {
        if (
            !child.classList.contains("status-bar") &&
            !child.classList.contains("transition-wipe") &&
            !child.classList.contains("transition-blackout")
        ) {
            child.remove();
        }
    }

    const appModule = state.activeApp;
    const content = appModule ? renderAppView(appModule) : renderHomeScreen();
    screen.appendChild(content);
}

/** Full render — rebuilds the entire shell. Used for initial load. */
function render(): void {
    root.innerHTML = "";
    const appModule = state.activeApp;
    const content = appModule ? renderAppView(appModule) : renderHomeScreen();
    root.appendChild(createPhoneShell(content));
}

// ── Init ───────────────────────────────────────────

render();

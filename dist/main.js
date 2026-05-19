"use strict";
const apps = [
    {
        id: "retro",
        title: "Retro Game",
        description: "A tiny pixel challenge with a single button.",
        icon: "⧉",
        render: renderRetroGame,
    },
    {
        id: "notes",
        title: "Notes",
        description: "A blank notepad for later world-building.",
        icon: "✎",
        render: renderNotesApp,
    },
    {
        id: "settings",
        title: "Settings",
        description: "Phone config and theme hints.",
        icon: "⚙",
        render: renderSettingsApp,
    },
];
const root = document.getElementById("app");
if (!root) {
    throw new Error("App root element not found.");
}
const state = {
    activeAppId: "",
};
function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className)
        element.className = className;
    if (text)
        element.textContent = text;
    return element;
}
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
    status.textContent = "09:20";
    return status;
}
function renderHomeScreen() {
    const panel = createElement("div", "home-panel");
    const header = createElement("div", "panel-header");
    const title = createElement("h1", "home-title", "Home");
    header.appendChild(title);
    panel.appendChild(header);
    const grid = createElement("div", "app-grid");
    apps.forEach((app) => {
        const button = createElement("button", "app-icon");
        button.type = "button";
        button.addEventListener("click", () => openApp(app.id));
        const icon = createElement("div", "icon-sprite", app.icon);
        const label = createElement("strong", undefined, app.title);
        const note = createElement("span", undefined, app.description);
        button.appendChild(icon);
        button.appendChild(label);
        button.appendChild(note);
        grid.appendChild(button);
    });
    panel.appendChild(grid);
    return panel;
}
function renderAppView(app) {
    const panel = createElement("div", "app-panel");
    const header = createElement("div", "panel-header");
    const title = createElement("h1", undefined, app.title);
    const backButton = createElement("button", "back-button", "Back");
    backButton.type = "button";
    backButton.addEventListener("click", () => {
        state.activeAppId = "";
        render();
    });
    header.appendChild(title);
    header.appendChild(backButton);
    panel.appendChild(header);
    panel.appendChild(app.render());
    return panel;
}
function renderRetroGame() {
    const container = createElement("div", "panel-content");
    const messageCard = createElement("div", "panel-card");
    const subtitle = createElement("h2", undefined, "Pixel Quest");
    const description = createElement("p", undefined, "Press START to light up the board and watch the pixels animate. It0s the first demo game for the home screen.");
    messageCard.appendChild(subtitle);
    messageCard.appendChild(description);
    const pixelDisplay = createElement("div", "pixel-display");
    const cells = [];
    for (let i = 0; i < 64; i += 1) {
        const cell = createElement("div", "pixel-cell");
        cells.push(cell);
        pixelDisplay.appendChild(cell);
    }
    const startButton = createElement("button", "button", "START");
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
    const subtitle = createElement("h2", undefined, "Draft Space");
    const description = createElement("p", undefined, "This notepad is waiting for future game design notes, item ideas, and mission plans.");
    card.appendChild(subtitle);
    card.appendChild(description);
    container.appendChild(card);
    return container;
}
function renderSettingsApp() {
    const container = createElement("div", "panel-content");
    const card = createElement("div", "panel-card");
    const subtitle = createElement("h2", undefined, "Phone Mode");
    const description = createElement("p", undefined, "Portrait-only UI with retro styling. App icons launch placeholders now, real apps later.");
    card.appendChild(subtitle);
    card.appendChild(description);
    container.appendChild(card);
    return container;
}
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
function openApp(appId) {
    state.activeAppId = appId;
    render();
}
function render() {
    root.innerHTML = "";
    const currentApp = apps.find((app) => app.id === state.activeAppId);
    const content = currentApp ? renderAppView(currentApp) : renderHomeScreen();
    root.appendChild(createPhoneShell(content));
}
render();

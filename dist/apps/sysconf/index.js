import { AppFolder } from "../../apps_api/types.js";
class SysconfApp {
    onMount(api) {
        const container = api.container;
        // Settings Section
        const settingsSection = document.createElement("div");
        settingsSection.className = "panel-card";
        settingsSection.style.marginTop = "0";
        settingsSection.style.display = "flex";
        settingsSection.style.flexDirection = "column";
        settingsSection.style.gap = "1rem";
        const sectionTitle = document.createElement("h3");
        sectionTitle.textContent = "EXPERIENCE OPTS";
        sectionTitle.style.borderBottom = "1px solid var(--crt-border)";
        sectionTitle.style.paddingBottom = "0.3rem";
        sectionTitle.style.marginBottom = "0.5rem";
        sectionTitle.style.fontSize = "0.9rem";
        sectionTitle.style.letterSpacing = "0.1em";
        settingsSection.appendChild(sectionTitle);
        // Checkbox Label
        const label = document.createElement("label");
        label.className = "retro-checkbox";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.id = "animations-toggle";
        const isAnimEnabled = localStorage.getItem("sprawl_animations") !== "false";
        input.checked = isAnimEnabled;
        const box = document.createElement("span");
        box.className = "retro-checkbox-box";
        const text = document.createElement("span");
        text.textContent = "GLOBAL ANIMATIONS";
        text.style.fontSize = "0.85rem";
        text.style.letterSpacing = "0.08em";
        label.appendChild(input);
        label.appendChild(box);
        label.appendChild(text);
        settingsSection.appendChild(label);
        container.appendChild(settingsSection);
        // Event listener
        input.addEventListener("change", (e) => {
            const target = e.target;
            localStorage.setItem("sprawl_animations", target.checked ? "true" : "false");
        });
    }
}
const sysconf = {
    manifest: {
        id: "sysconf",
        title: "SYSCONF",
        command: "SYSCONF.BIN",
        icon: "⌬",
        description: "Terminal configuration. Kernel parameters. Access level management.",
        folder: AppFolder.SYSTEM,
    },
    create: () => new SysconfApp(),
};
export default sysconf;

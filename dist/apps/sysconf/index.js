import { AppFolder } from "../../apps_api/types.js";
const sysconf = {
    manifest: {
        id: "sysconf",
        title: "SYSCONF",
        command: "SYSCONF.BIN",
        icon: "⌬",
        description: "Terminal configuration. Kernel parameters. Access level management.",
        folder: AppFolder.SYSTEM,
    },
    onMount(api) {
        const container = api.container;
        const card = document.createElement("div");
        card.className = "panel-card";
        const subtitle = document.createElement("h2");
        subtitle.textContent = "SYSTEM CONFIG";
        const description = document.createElement("p");
        description.textContent =
            "Terminal mode: PORTRAIT. Render pipeline: ACTIVE. Access level: CREW. Kernel v2.4.1-stable.";
        card.appendChild(subtitle);
        card.appendChild(description);
        container.appendChild(card);
    },
};
export default sysconf;

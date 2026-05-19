import type { AppDefinition, AppInstance, AppApi } from "../../apps_api/types.js";
import { AppFolder } from "../../apps_api/types.js";

class DatalogApp implements AppInstance {
    onMount(api: AppApi) {
        const container = api.container;

        const card = document.createElement("div");
        card.className = "panel-card";
        const subtitle = document.createElement("h2");
        subtitle.textContent = "CREW LOG";
        const description = document.createElement("p");
        description.textContent =
            "No entries found. Awaiting crew input. Data will be stored to local partition.";
        card.appendChild(subtitle);
        card.appendChild(description);
        container.appendChild(card);
    }
}

const datalog: AppDefinition = {
    manifest: {
        id: "datalog",
        title: "DATALOG",
        command: "DATALOG.BIN",
        icon: "▤",
        description: "Access crew manifest and mission documentation interface.",
        folder: AppFolder.MISSION,
    },
    create: () => new DatalogApp()
};

export default datalog;

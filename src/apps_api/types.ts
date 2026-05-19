/* ═══════════════════════════════════════════════════
   SPRAWL — App API Types
   Shared interfaces between framework and apps
   ═══════════════════════════════════════════════════ */

export enum AppFolder {
    MISSION = "MISSION",
    GAMES = "GAMES",
    SYSTEM = "SYSTEM"
}

/** Metadata an app provides about itself for the launcher. */
export interface AppManifest {
    /** Unique identifier, e.g. "pixscan" */
    id: string;
    /** Display name shown in launcher and title bar, e.g. "PIXSCAN" */
    title: string;
    /** Terminal command used in the open transition, e.g. "PIXSCAN.BIN" */
    command: string;
    /** Emoji or character for the launcher grid icon */
    icon: string;
    /** Short description for future use */
    description: string;
    /** The folder category the app belongs to on the launcher screen */
    folder: AppFolder;
}

/** What the framework provides to an app at mount time. */
export interface AppApi {
    /** The container div the app owns. Render freely inside this. */
    container: HTMLElement;
}

/** The contract every app module must fulfill. */
export interface App {
    /** App metadata for the launcher and framework chrome. */
    manifest: AppManifest;

    /** Called when the app is opened. Populate api.container here. */
    onMount(api: AppApi): void;

    /**
     * Called when the app is closed. Clean up timers, listeners, etc.
     * Optional — not every app needs cleanup.
     */
    onUnmount?(): void;
}

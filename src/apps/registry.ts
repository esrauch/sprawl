import type { App } from "../apps_api/types.js";
import pixscan from "./pixscan/index.js";
import datalog from "./datalog/index.js";
import sysconf from "./sysconf/index.js";
import solitaire from "./solitaire/index.js";
import pong from "./pong/index.js";

/** All registered apps, in launcher display order. */
export const apps: App[] = [pixscan, solitaire, datalog, sysconf, pong];

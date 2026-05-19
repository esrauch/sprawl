import type { AppDefinition } from "../apps_api/types.js";
import pixscan from "./pixscan/index.js";
import datalog from "./datalog/index.js";
import sysconf from "./sysconf/index.js";
import solitaire from "./solitaire/index.js";
import pong from "./pong/index.js";
import ares from "./ares/index.js";
import base from "./base/index.js";
import contagion from "./contagion/index.js";
import descend from "./descend/index.js";

/** All registered apps, in launcher display order. */
export const apps: AppDefinition[] = [pixscan, solitaire, datalog, sysconf, pong, ares, base, contagion, descend];


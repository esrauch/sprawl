import { AppFolder } from "../../apps_api/types.js";
// ── Shape types (stations & passenger destinations) ──────────
const SHAPES = ["circle", "triangle", "square", "diamond"];
// ── Tuning ───────────────────────────────────────────────────
const MAX_PASSENGERS = 8; // station overflows → game over
const OVERFLOW_TIMER = 8; // seconds before overflow kills you
const TRAIN_SPEED = 60; // px/s in world space
const TRAIN_CAPACITY = 4;
const SPAWN_INTERVAL_BASE = 3.5; // seconds between passenger spawns (decreases)
const STATION_SPAWN_BASE = 12; // seconds between new station spawns
const MAX_LINES = 5;
const LINE_COLOURS = ["#33ff66", "#ffaa00", "#ff5555", "#55aaff", "#ff55ff"];
// ── Geometry helpers ─────────────────────────────────────────
function dist(ax, ay, bx, by) {
    return Math.hypot(bx - ax, by - ay);
}
// ── Main app ─────────────────────────────────────────────────
class BaseApp {
    constructor() {
        this.container = null;
        this.wrapper = null;
        this.canvas = null;
        this.ctx = null;
        this.toolbarEl = null;
        this.resizeObserver = null;
        this.lastTime = 0;
        // Game state
        this.stations = [];
        this.lines = [];
        this.trains = [];
        this.nextStationId = 0;
        this.gameOver = false;
        this.score = 0;
        this.elapsed = 0;
        this.passengerTimer = 0;
        this.stationTimer = 0;
        // Interaction state
        this.selectedStationId = null;
        // activeLineIdx: which line the user is extending. -1 = "new line" mode, null = auto.
        this.activeLineIdx = null;
        // Canvas dimensions (CSS px)
        this.W = 0;
        this.H = 0;
        // Bound handlers
        this.handlePointer = (e) => this.onTap(e);
    }
    // ── Lifecycle ────────────────────────────────────────────
    onMount(api) {
        this.container = api.container;
        this.buildUI();
        this.initGame();
        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                this.sizeCanvas(entry.contentRect.width, entry.contentRect.height);
            }
        });
        if (this.wrapper)
            this.resizeObserver.observe(this.wrapper);
        this.lastTime = performance.now();
        this.animationFrame = requestAnimationFrame((t) => this.tick(t));
    }
    onUnmount() {
        if (this.animationFrame !== undefined)
            cancelAnimationFrame(this.animationFrame);
        this.animationFrame = undefined;
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.canvas?.removeEventListener("pointerdown", this.handlePointer);
        if (this.container)
            this.container.innerHTML = "";
        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.toolbarEl = null;
    }
    // ── UI ───────────────────────────────────────────────────
    buildUI() {
        if (!this.container)
            return;
        this.container.style.display = "flex";
        this.container.style.flexDirection = "column";
        this.container.style.minHeight = "0";
        const card = document.createElement("div");
        card.className = "panel-card";
        const h2 = document.createElement("h2");
        h2.textContent = "BASE TRANSIT NETWORK";
        const p = document.createElement("p");
        p.textContent = "Select a line below, then tap stations to connect. Tap [+] for a new line.";
        card.appendChild(h2);
        card.appendChild(p);
        this.container.appendChild(card);
        // Line selector toolbar
        const toolbar = document.createElement("div");
        toolbar.style.cssText =
            "display:flex;gap:0.4rem;align-items:center;margin-top:0.5rem;flex-wrap:wrap";
        this.container.appendChild(toolbar);
        this.toolbarEl = toolbar;
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex;flex:1;min-height:0;width:100%;margin-top:0.5rem";
        const cvs = document.createElement("canvas");
        cvs.style.cssText =
            "width:100%;height:100%;display:block;background:#010401;" +
                "border:1px solid rgba(51,255,102,0.15);border-radius:0.25rem;" +
                "touch-action:none";
        cvs.addEventListener("pointerdown", this.handlePointer);
        wrap.appendChild(cvs);
        this.container.appendChild(wrap);
        this.wrapper = wrap;
        this.canvas = cvs;
        this.ctx = cvs.getContext("2d");
        const reset = document.createElement("button");
        reset.className = "btn-action";
        reset.style.marginTop = "0.5rem";
        reset.textContent = "RESET NETWORK";
        reset.type = "button";
        reset.addEventListener("click", () => this.resetGame());
        this.container.appendChild(reset);
    }
    rebuildToolbar() {
        if (!this.toolbarEl)
            return;
        this.toolbarEl.innerHTML = "";
        // One button per existing line
        for (let li = 0; li < this.lines.length; li++) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn-action";
            const colour = LINE_COLOURS[li % LINE_COLOURS.length];
            btn.style.cssText =
                `min-width:2.2rem;padding:0.25rem 0.5rem;font-size:0.7rem;` +
                    `border-color:${colour};color:${colour}`;
            btn.textContent = `L${li + 1}`;
            if (this.activeLineIdx === li) {
                btn.style.background = colour;
                btn.style.color = "#020805";
            }
            const idx = li;
            btn.addEventListener("click", () => {
                this.activeLineIdx = this.activeLineIdx === idx ? null : idx;
                this.selectedStationId = null;
                this.rebuildToolbar();
            });
            this.toolbarEl.appendChild(btn);
        }
        // "+ NEW" button
        if (this.lines.length < MAX_LINES) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn-action";
            btn.style.cssText = "min-width:2.2rem;padding:0.25rem 0.5rem;font-size:0.7rem";
            btn.textContent = "+";
            if (this.activeLineIdx === -1) {
                btn.style.background = "#33ff66";
                btn.style.color = "#020805";
            }
            btn.addEventListener("click", () => {
                this.activeLineIdx = this.activeLineIdx === -1 ? null : -1;
                this.selectedStationId = null;
                this.rebuildToolbar();
            });
            this.toolbarEl.appendChild(btn);
        }
    }
    // ── Init / Reset ─────────────────────────────────────────
    initGame() {
        this.stations = [];
        this.lines = [];
        this.trains = [];
        this.nextStationId = 0;
        this.gameOver = false;
        this.score = 0;
        this.elapsed = 0;
        this.passengerTimer = 0;
        this.stationTimer = 0;
        this.selectedStationId = null;
        this.activeLineIdx = null;
        this.addStation(0.25, 0.3, "circle");
        this.addStation(0.7, 0.25, "triangle");
        this.addStation(0.5, 0.7, "square");
        this.rebuildToolbar();
    }
    resetGame() {
        this.initGame();
        if (this.animationFrame === undefined) {
            this.lastTime = performance.now();
            this.animationFrame = requestAnimationFrame((t) => this.tick(t));
        }
    }
    // ── Station management ───────────────────────────────────
    addStation(nx, ny, shape) {
        this.stations.push({
            id: this.nextStationId++,
            x: nx,
            y: ny,
            shape,
            passengers: [],
            overflowTimer: OVERFLOW_TIMER,
        });
    }
    stationById(id) {
        return this.stations.find((s) => s.id === id);
    }
    // ── Canvas sizing ────────────────────────────────────────
    sizeCanvas(w, h) {
        if (!this.canvas || !this.ctx)
            return;
        const dpr = window.devicePixelRatio || 1;
        this.W = w;
        this.H = h;
        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // ── Tap handling ─────────────────────────────────────────
    onTap(e) {
        if (this.gameOver)
            return;
        if (!this.canvas)
            return;
        const rect = this.canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const nx = cx / this.W;
        const ny = cy / this.H;
        const tapRadius = 0.08;
        let nearest = null;
        let bestDist = tapRadius;
        for (const s of this.stations) {
            const d = dist(nx, ny, s.x, s.y);
            if (d < bestDist) {
                bestDist = d;
                nearest = s;
            }
        }
        if (!nearest) {
            this.selectedStationId = null;
            return;
        }
        if (this.selectedStationId === null) {
            this.selectedStationId = nearest.id;
        }
        else if (this.selectedStationId === nearest.id) {
            this.selectedStationId = null;
        }
        else {
            this.connectStations(this.selectedStationId, nearest.id);
            this.selectedStationId = null;
        }
    }
    // ── Line management ──────────────────────────────────────
    connectStations(aId, bId) {
        // Prevent duplicate direct connections
        for (const line of this.lines) {
            for (let i = 0; i < line.stationIds.length - 1; i++) {
                if ((line.stationIds[i] === aId && line.stationIds[i + 1] === bId) ||
                    (line.stationIds[i] === bId && line.stationIds[i + 1] === aId)) {
                    return;
                }
            }
        }
        // Mode: force new line
        if (this.activeLineIdx === -1) {
            if (this.lines.length >= MAX_LINES)
                return;
            this.createNewLine(aId, bId);
            this.activeLineIdx = this.lines.length - 1;
            this.rebuildToolbar();
            return;
        }
        // Mode: extend a specific line
        if (this.activeLineIdx !== null && this.activeLineIdx >= 0) {
            const line = this.lines[this.activeLineIdx];
            if (line) {
                if (this.tryExtendLine(this.activeLineIdx, line, aId, bId)) {
                    this.rebuildToolbar();
                    return;
                }
            }
        }
        // Mode: auto — try extending any line, fall back to new
        for (let li = 0; li < this.lines.length; li++) {
            if (this.tryExtendLine(li, this.lines[li], aId, bId)) {
                this.rebuildToolbar();
                return;
            }
        }
        // Fall back to new line
        if (this.lines.length < MAX_LINES) {
            this.createNewLine(aId, bId);
            this.rebuildToolbar();
        }
    }
    tryExtendLine(li, line, aId, bId) {
        const ids = line.stationIds;
        if (ids[ids.length - 1] === aId && !ids.includes(bId)) {
            ids.push(bId);
            return true;
        }
        if (ids[ids.length - 1] === bId && !ids.includes(aId)) {
            ids.push(aId);
            return true;
        }
        if (ids[0] === aId && !ids.includes(bId)) {
            ids.unshift(bId);
            this.shiftTrainIndices(li, 1);
            return true;
        }
        if (ids[0] === bId && !ids.includes(aId)) {
            ids.unshift(aId);
            this.shiftTrainIndices(li, 1);
            return true;
        }
        return false;
    }
    createNewLine(aId, bId) {
        const newIdx = this.lines.length;
        this.lines.push({ stationIds: [aId, bId] });
        this.trains.push({
            lineIdx: newIdx,
            segIdx: 0,
            t: 0,
            forward: true,
            passengers: [],
        });
    }
    shiftTrainIndices(lineIdx, delta) {
        for (const tr of this.trains) {
            if (tr.lineIdx === lineIdx) {
                tr.segIdx = Math.max(0, tr.segIdx + delta);
            }
        }
    }
    // ── Game tick ─────────────────────────────────────────────
    tick(now) {
        if (!this.ctx)
            return;
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;
        if (!this.gameOver) {
            this.elapsed += dt;
            this.updateSpawns(dt);
            this.updateTrains(dt);
            this.checkOverflow(dt);
        }
        this.draw();
        this.animationFrame = requestAnimationFrame((t) => this.tick(t));
    }
    // ── Spawning ─────────────────────────────────────────────
    updateSpawns(dt) {
        const spawnInterval = Math.max(1.0, SPAWN_INTERVAL_BASE - this.elapsed * 0.012);
        this.passengerTimer += dt;
        if (this.passengerTimer >= spawnInterval && this.stations.length > 0) {
            this.passengerTimer = 0;
            const station = this.stations[Math.floor(Math.random() * this.stations.length)];
            const otherShapes = SHAPES.filter((s) => s !== station.shape);
            const destShape = otherShapes[Math.floor(Math.random() * otherShapes.length)];
            station.passengers.push(destShape);
        }
        const stationInterval = Math.max(6, STATION_SPAWN_BASE - this.elapsed * 0.05);
        this.stationTimer += dt;
        if (this.stationTimer >= stationInterval && this.stations.length < 16) {
            this.stationTimer = 0;
            const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
            for (let attempt = 0; attempt < 20; attempt++) {
                const nx = 0.1 + Math.random() * 0.8;
                const ny = 0.1 + Math.random() * 0.8;
                let tooClose = false;
                for (const s of this.stations) {
                    if (dist(nx, ny, s.x, s.y) < 0.12) {
                        tooClose = true;
                        break;
                    }
                }
                if (!tooClose) {
                    this.addStation(nx, ny, shape);
                    break;
                }
            }
        }
    }
    // ── Train movement ───────────────────────────────────────
    updateTrains(dt) {
        for (const tr of this.trains) {
            const line = this.lines[tr.lineIdx];
            if (!line || line.stationIds.length < 2)
                continue;
            // Determine from/to based on direction
            const fromIdx = tr.forward ? tr.segIdx : tr.segIdx + 1;
            const toIdx = tr.forward ? tr.segIdx + 1 : tr.segIdx;
            // Bounds safety
            if (fromIdx < 0 || fromIdx >= line.stationIds.length)
                continue;
            if (toIdx < 0 || toIdx >= line.stationIds.length)
                continue;
            const fromSt = this.stationById(line.stationIds[fromIdx]);
            const toSt = this.stationById(line.stationIds[toIdx]);
            if (!fromSt || !toSt)
                continue;
            const segLen = dist(fromSt.x * this.W, fromSt.y * this.H, toSt.x * this.W, toSt.y * this.H);
            if (segLen < 1)
                continue;
            tr.t += (TRAIN_SPEED * dt) / segLen;
            if (tr.t >= 1) {
                tr.t = 0;
                // Arrived at destination station
                this.trainAtStation(tr, line.stationIds[toIdx]);
                // Advance to next segment or reverse
                if (tr.forward) {
                    if (tr.segIdx + 1 >= line.stationIds.length - 1) {
                        // Reached the last station — reverse
                        tr.forward = false;
                        // segIdx stays the same; backward traverses segIdx+1 → segIdx
                    }
                    else {
                        tr.segIdx++;
                    }
                }
                else {
                    if (tr.segIdx <= 0) {
                        // Reached the first station — reverse
                        tr.forward = true;
                        // segIdx stays at 0; forward traverses 0 → 1
                    }
                    else {
                        tr.segIdx--;
                    }
                }
            }
        }
    }
    trainAtStation(tr, stationId) {
        const station = this.stationById(stationId);
        if (!station)
            return;
        // Drop off passengers whose destination matches this station shape
        const remaining = [];
        for (const p of tr.passengers) {
            if (p === station.shape) {
                this.score++;
            }
            else {
                remaining.push(p);
            }
        }
        tr.passengers = remaining;
        // Pick up waiting passengers (up to capacity)
        while (station.passengers.length > 0 && tr.passengers.length < TRAIN_CAPACITY) {
            tr.passengers.push(station.passengers.shift());
        }
    }
    // ── Overflow check ───────────────────────────────────────
    checkOverflow(dt) {
        for (const s of this.stations) {
            if (s.passengers.length >= MAX_PASSENGERS) {
                s.overflowTimer -= dt;
                if (s.overflowTimer <= 0) {
                    this.gameOver = true;
                }
            }
            else {
                s.overflowTimer = OVERFLOW_TIMER;
            }
        }
    }
    // ── Drawing ──────────────────────────────────────────────
    draw() {
        if (!this.ctx || !this.canvas)
            return;
        const ctx = this.ctx;
        const W = this.W;
        const H = this.H;
        if (W === 0 || H === 0)
            return;
        ctx.fillStyle = "#020805";
        ctx.fillRect(0, 0, W, H);
        // Draw lines
        for (let li = 0; li < this.lines.length; li++) {
            const line = this.lines[li];
            const colour = LINE_COLOURS[li % LINE_COLOURS.length];
            ctx.strokeStyle = colour;
            ctx.lineWidth = 3;
            ctx.globalAlpha = this.activeLineIdx === li ? 0.8 : 0.35;
            ctx.beginPath();
            for (let i = 0; i < line.stationIds.length; i++) {
                const st = this.stationById(line.stationIds[i]);
                if (!st)
                    continue;
                const sx = st.x * W;
                const sy = st.y * H;
                if (i === 0)
                    ctx.moveTo(sx, sy);
                else
                    ctx.lineTo(sx, sy);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        // Draw stations
        for (const s of this.stations) {
            const sx = s.x * W;
            const sy = s.y * H;
            // Dark background circle behind station for readability
            ctx.fillStyle = "#020805";
            ctx.beginPath();
            ctx.arc(sx, sy, 14, 0, Math.PI * 2);
            ctx.fill();
            // Overflow warning ring
            if (s.passengers.length >= MAX_PASSENGERS) {
                const progress = 1 - s.overflowTimer / OVERFLOW_TIMER;
                ctx.strokeStyle = "#ff3333";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(sx, sy, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
                ctx.stroke();
            }
            // Selection highlight
            if (s.id === this.selectedStationId) {
                ctx.strokeStyle = "#33ff66";
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 3]);
                ctx.beginPath();
                ctx.arc(sx, sy, 20, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            // Station shape
            this.drawShape(ctx, sx, sy, s.shape, 11, "#33ff66", false);
            // Passenger indicators (small shapes in a row below station)
            for (let pi = 0; pi < s.passengers.length; pi++) {
                const px = sx - ((s.passengers.length - 1) * 5) / 2 + pi * 5;
                const py = sy + 18;
                this.drawShape(ctx, px, py, s.passengers[pi], 3, "#ffaa00", true);
            }
        }
        // Draw trains
        for (const tr of this.trains) {
            const pos = this.getTrainPos(tr);
            if (!pos)
                continue;
            const colour = LINE_COLOURS[tr.lineIdx % LINE_COLOURS.length];
            ctx.fillStyle = colour;
            ctx.fillRect(pos.x - 4, pos.y - 3, 8, 6);
            for (let i = 0; i < tr.passengers.length; i++) {
                ctx.fillStyle = "#020805";
                ctx.fillRect(pos.x - 3 + i * 3, pos.y - 1, 2, 2);
            }
        }
        // HUD
        ctx.fillStyle = "#33ff66";
        ctx.font = "0.75rem var(--font-mono)";
        ctx.textAlign = "left";
        ctx.fillText(`DELIVERED: ${this.score}`, 8, H - 10);
        ctx.textAlign = "right";
        ctx.fillText(`LINES: ${this.lines.length}/${MAX_LINES}`, W - 8, H - 10);
        // Game over overlay
        if (this.gameOver) {
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.fillRect(0, H * 0.35, W, H * 0.3);
            ctx.textAlign = "center";
            ctx.font = "bold 1.1rem var(--font-mono)";
            ctx.fillStyle = "#ff3333";
            ctx.fillText("NETWORK OVERLOADED", W / 2, H / 2 - 8);
            ctx.font = "0.8rem var(--font-mono)";
            ctx.fillStyle = "#33ff66";
            ctx.fillText(`${this.score} passengers delivered`, W / 2, H / 2 + 14);
            ctx.font = "0.65rem var(--font-mono)";
            ctx.fillStyle = "#888";
            ctx.fillText("[ RESET NETWORK ]", W / 2, H / 2 + 32);
        }
    }
    // ── Shape drawing helper ─────────────────────────────────
    drawShape(ctx, x, y, shape, r, colour, filled) {
        ctx.strokeStyle = colour;
        ctx.fillStyle = colour;
        ctx.lineWidth = 2;
        switch (shape) {
            case "circle":
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                filled ? ctx.fill() : ctx.stroke();
                break;
            case "triangle":
                ctx.beginPath();
                ctx.moveTo(x, y - r);
                ctx.lineTo(x - r * 0.87, y + r * 0.5);
                ctx.lineTo(x + r * 0.87, y + r * 0.5);
                ctx.closePath();
                filled ? ctx.fill() : ctx.stroke();
                break;
            case "square":
                if (filled) {
                    ctx.fillRect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
                }
                else {
                    ctx.strokeRect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
                }
                break;
            case "diamond":
                ctx.beginPath();
                ctx.moveTo(x, y - r);
                ctx.lineTo(x + r * 0.7, y);
                ctx.lineTo(x, y + r);
                ctx.lineTo(x - r * 0.7, y);
                ctx.closePath();
                filled ? ctx.fill() : ctx.stroke();
                break;
        }
    }
    // ── Train position helper ────────────────────────────────
    getTrainPos(tr) {
        const line = this.lines[tr.lineIdx];
        if (!line || line.stationIds.length < 2)
            return null;
        const fromIdx = tr.forward ? tr.segIdx : tr.segIdx + 1;
        const toIdx = tr.forward ? tr.segIdx + 1 : tr.segIdx;
        if (fromIdx < 0 || fromIdx >= line.stationIds.length)
            return null;
        if (toIdx < 0 || toIdx >= line.stationIds.length)
            return null;
        const from = this.stationById(line.stationIds[fromIdx]);
        const to = this.stationById(line.stationIds[toIdx]);
        if (!from || !to)
            return null;
        return {
            x: (from.x + (to.x - from.x) * tr.t) * this.W,
            y: (from.y + (to.y - from.y) * tr.t) * this.H,
        };
    }
}
const base = {
    manifest: {
        id: "base",
        title: "BASE",
        command: "BASE.NET",
        icon: "◇",
        description: "Transit network simulation. Connect stations, deliver passengers.",
        folder: AppFolder.GAMES,
    },
    create: () => new BaseApp(),
};
export default base;

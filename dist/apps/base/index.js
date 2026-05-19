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
        this.ghostTrains = [];
        this.nextStationId = 0;
        this.gameOver = false;
        this.score = 0;
        this.elapsed = 0;
        this.passengerTimer = 0;
        this.stationTimer = 0;
        // Interaction state
        this.selectedStationId = null;
        this.activeLineIdx = 0;
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
        p.textContent = "Select a line below, then tap stations to connect. Get the shapes to their destinations.";
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
        // Buttons for all 5 lines
        for (let li = 0; li < this.lines.length; li++) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn-action";
            const colour = LINE_COLOURS[this.lines[li].colorIdx % LINE_COLOURS.length];
            btn.style.cssText =
                `min-width:2.2rem;padding:0.25rem 0.5rem;font-size:0.7rem;` +
                    `border-color:${colour};color:${colour};`;
            if (this.lines[li].stationIds.length === 0) {
                btn.style.opacity = "0.5";
            }
            btn.textContent = `L${li + 1}`;
            if (this.activeLineIdx === li) {
                btn.style.background = colour;
                btn.style.color = "#020805";
                btn.style.opacity = "1";
            }
            const idx = li;
            btn.addEventListener("click", () => {
                this.activeLineIdx = idx;
                this.selectedStationId = null;
                this.rebuildToolbar();
            });
            this.toolbarEl.appendChild(btn);
        }
        // Delete button for active line, only if it has tracks
        if (this.activeLineIdx >= 0 && this.activeLineIdx < this.lines.length) {
            const line = this.lines[this.activeLineIdx];
            if (line.stationIds.length > 0) {
                const btnDel = document.createElement("button");
                btnDel.type = "button";
                btnDel.className = "btn-action";
                btnDel.style.cssText = "min-width:2.2rem;padding:0.25rem 0.5rem;font-size:0.7rem;border-color:#ff3333;color:#ff3333;margin-left:auto;";
                btnDel.textContent = "DEL";
                btnDel.addEventListener("click", () => {
                    const idx = this.activeLineIdx;
                    const line = this.lines[idx];
                    // Convert trains to ghost trains so they finish their journey
                    for (const tr of this.trains) {
                        if (tr.lineIdx === idx) {
                            const toIdx = tr.forward ? tr.segIdx + 1 : tr.segIdx;
                            if (toIdx >= 0 && toIdx < line.stationIds.length) {
                                const stId = line.stationIds[toIdx];
                                const st = this.stationById(stId);
                                const pos = this.getTrainPos(tr);
                                if (st && pos && tr.passengers.length > 0) {
                                    const fx = pos.x / this.W;
                                    const fy = pos.y / this.H;
                                    const d = dist(fx * this.W, fy * this.H, st.x * this.W, st.y * this.H);
                                    this.ghostTrains.push({
                                        x: fx,
                                        y: fy,
                                        destX: st.x,
                                        destY: st.y,
                                        passengers: tr.passengers,
                                        t: 0,
                                        speed: d > 0 ? (TRAIN_SPEED / d) : 1,
                                        color: LINE_COLOURS[line.colorIdx % LINE_COLOURS.length],
                                        destStationId: stId
                                    });
                                }
                            }
                        }
                    }
                    this.lines[idx].stationIds = [];
                    this.trains = this.trains.filter(tr => tr.lineIdx !== idx);
                    this.selectedStationId = null;
                    this.rebuildToolbar();
                });
                this.toolbarEl.appendChild(btnDel);
            }
        }
    }
    // ── Init / Reset ─────────────────────────────────────────
    initGame() {
        this.stations = [];
        this.lines = [];
        for (let i = 0; i < MAX_LINES; i++) {
            this.lines.push({ stationIds: [], colorIdx: i });
        }
        this.trains = [];
        this.ghostTrains = [];
        this.nextStationId = 0;
        this.gameOver = false;
        this.score = 0;
        this.elapsed = 0;
        this.passengerTimer = 0;
        this.stationTimer = 0;
        this.selectedStationId = null;
        this.activeLineIdx = 0;
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
        // Extend or create active line
        if (this.activeLineIdx >= 0 && this.activeLineIdx < this.lines.length) {
            const line = this.lines[this.activeLineIdx];
            // If the line has no stations, create the first segment
            if (line.stationIds.length === 0) {
                line.stationIds = [aId, bId];
                const newTr = {
                    lineIdx: this.activeLineIdx,
                    segIdx: 0,
                    t: 0,
                    forward: true,
                    passengers: [],
                };
                this.trains.push(newTr);
                this.trainAtStation(newTr, aId);
                this.rebuildToolbar();
                return;
            }
            // Otherwise try extending it
            if (this.tryExtendLine(this.activeLineIdx, line, aId, bId)) {
                this.rebuildToolbar();
                return;
            }
        }
    }
    tryExtendLine(li, line, aId, bId) {
        const ids = line.stationIds;
        const isCircular = ids.length > 2 && ids[0] === ids[ids.length - 1];
        if (isCircular)
            return false;
        if (ids[ids.length - 1] === aId && (!ids.includes(bId) || (ids.length >= 2 && bId === ids[0]))) {
            ids.push(bId);
            return true;
        }
        if (ids[ids.length - 1] === bId && (!ids.includes(aId) || (ids.length >= 2 && aId === ids[0]))) {
            ids.push(aId);
            return true;
        }
        if (ids[0] === aId && (!ids.includes(bId) || (ids.length >= 2 && bId === ids[ids.length - 1]))) {
            ids.unshift(bId);
            this.shiftTrainIndices(li, 1);
            return true;
        }
        if (ids[0] === bId && (!ids.includes(aId) || (ids.length >= 2 && aId === ids[ids.length - 1]))) {
            ids.unshift(aId);
            this.shiftTrainIndices(li, 1);
            return true;
        }
        return false;
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
            this.updateGhostTrains(dt);
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
                const stationId = line.stationIds[toIdx];
                // Advance to next segment or reverse BEFORE boarding
                if (tr.forward) {
                    if (tr.segIdx + 1 >= line.stationIds.length - 1) {
                        const isCircular = line.stationIds[0] === line.stationIds[line.stationIds.length - 1];
                        if (isCircular) {
                            tr.segIdx = 0;
                        }
                        else {
                            tr.forward = false;
                        }
                    }
                    else {
                        tr.segIdx++;
                    }
                }
                else {
                    if (tr.segIdx <= 0) {
                        const isCircular = line.stationIds[0] === line.stationIds[line.stationIds.length - 1];
                        if (isCircular) {
                            tr.segIdx = line.stationIds.length - 2;
                        }
                        else {
                            tr.forward = true;
                        }
                    }
                    else {
                        tr.segIdx--;
                    }
                }
                // Now that the train's future direction is set, process boarding
                this.trainAtStation(tr, stationId);
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
        const line = this.lines[tr.lineIdx];
        if (!line)
            return;
        const isCircular = line.stationIds.length > 2 && line.stationIds[0] === line.stationIds[line.stationIds.length - 1];
        // Determine which shapes the train will visit in its CURRENT direction
        const upcomingShapes = new Set();
        if (isCircular) {
            for (const id of line.stationIds) {
                const s = this.stationById(id);
                if (s)
                    upcomingShapes.add(s.shape);
            }
        }
        else {
            if (tr.forward) {
                // Train is travelling from segIdx to segIdx + 1, so it will visit segIdx + 1 through end
                for (let j = tr.segIdx + 1; j < line.stationIds.length; j++) {
                    const s = this.stationById(line.stationIds[j]);
                    if (s)
                        upcomingShapes.add(s.shape);
                }
            }
            else {
                // Train is travelling from segIdx + 1 to segIdx, so it will visit segIdx down to 0
                for (let j = tr.segIdx; j >= 0; j--) {
                    const s = this.stationById(line.stationIds[j]);
                    if (s)
                        upcomingShapes.add(s.shape);
                }
            }
        }
        let i = 0;
        while (i < station.passengers.length && tr.passengers.length < TRAIN_CAPACITY) {
            if (upcomingShapes.has(station.passengers[i])) {
                tr.passengers.push(station.passengers.splice(i, 1)[0]);
            }
            else {
                i++;
            }
        }
    }
    // ── Overflow check ───────────────────────────────────────
    updateGhostTrains(dt) {
        for (let i = this.ghostTrains.length - 1; i >= 0; i--) {
            const gt = this.ghostTrains[i];
            gt.t += gt.speed * dt;
            if (gt.t >= 1) {
                // Arrived
                const st = this.stationById(gt.destStationId);
                if (st) {
                    for (const p of gt.passengers) {
                        if (p === st.shape)
                            this.score++;
                        else
                            st.passengers.push(p);
                    }
                }
                this.ghostTrains.splice(i, 1);
            }
        }
    }
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
            const colour = LINE_COLOURS[line.colorIdx % LINE_COLOURS.length];
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
            const colour = LINE_COLOURS[this.lines[tr.lineIdx].colorIdx % LINE_COLOURS.length];
            ctx.save();
            ctx.translate(pos.x, pos.y);
            ctx.rotate(pos.angle);
            ctx.fillStyle = colour;
            ctx.fillRect(-14, -8, 28, 16);
            for (let i = 0; i < tr.passengers.length; i++) {
                const px = -9 + i * 6;
                const py = 0;
                this.drawShape(ctx, px, py, tr.passengers[i], 2.2, "#020805", true);
            }
            ctx.restore();
        }
        // Draw ghost trains
        for (const gt of this.ghostTrains) {
            const cx = (gt.x + (gt.destX - gt.x) * gt.t) * W;
            const cy = (gt.y + (gt.destY - gt.y) * gt.t) * H;
            const angle = Math.atan2(gt.destY - gt.y, gt.destX - gt.x);
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            ctx.fillStyle = gt.color;
            ctx.globalAlpha = 0.4;
            ctx.fillRect(-14, -8, 28, 16);
            ctx.globalAlpha = 1.0;
            for (let i = 0; i < gt.passengers.length; i++) {
                const px = -9 + i * 6;
                const py = 0;
                this.drawShape(ctx, px, py, gt.passengers[i], 2.2, "#020805", true);
            }
            ctx.restore();
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
        const fx = from.x * this.W;
        const fy = from.y * this.H;
        const tx = to.x * this.W;
        const ty = to.y * this.H;
        return {
            x: fx + (tx - fx) * tr.t,
            y: fy + (ty - fy) * tr.t,
            angle: Math.atan2(ty - fy, tx - fx),
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

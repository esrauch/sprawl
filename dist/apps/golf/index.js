import { AppFolder } from "../../apps_api/types.js";
// ── Types & Constants ───────────────────────────────────────
const LOGICAL_WIDTH = 1000;
const BALL_RADIUS = 6;
const GRAVITY = 600.0;
const BOUNCE = 0.35;
const FRICTION = 0.985; // 25% less friction loss per tick than 0.98
const MAX_POWER = 1200;
// ── Main app ─────────────────────────────────────────────────
class GolfApp {
    constructor() {
        this.container = null;
        this.wrapper = null;
        this.canvas = null;
        this.ctx = null;
        this.resizeObserver = null;
        this.lastTime = 0;
        // Dimensions
        this.W = 0;
        this.H = 0;
        this.scale = 1;
        // Game state
        this.ball = { x: 0, y: 0, vx: 0, vy: 0, resting: true, restTimer: 0 };
        this.terrain = [];
        this.hole = { x: 0, y: 0, w: 0, h: 0 };
        this.currentHole = 1;
        this.strokes = 0;
        this.state = "PLAYING";
        this.transitionTimer = 0;
        this.generatedNext = false;
        // Input state
        this.dragActive = false;
        this.dragStart = { x: 0, y: 0 };
        this.dragCurrent = { x: 0, y: 0 };
        // Bound handlers
        this.handlePointerDown = (e) => this.onPointerDown(e);
        this.handlePointerMove = (e) => this.onPointerMove(e);
        this.handlePointerUp = (e) => this.onPointerUp(e);
    }
    // ── Lifecycle ────────────────────────────────────────────
    onMount(api) {
        this.container = api.container;
        this.buildUI();
        this.generateLevel();
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
        this.canvas?.removeEventListener("pointerdown", this.handlePointerDown);
        window.removeEventListener("pointermove", this.handlePointerMove);
        window.removeEventListener("pointerup", this.handlePointerUp);
        if (this.container)
            this.container.innerHTML = "";
        this.container = null;
        this.canvas = null;
        this.ctx = null;
    }
    // ── UI ───────────────────────────────────────────────────
    buildUI() {
        if (!this.container)
            return;
        this.container.style.display = "flex";
        this.container.style.flexDirection = "column";
        this.container.style.minHeight = "0";
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex;flex:1;min-height:0;width:100%;position:relative;";
        const cvs = document.createElement("canvas");
        cvs.style.cssText =
            "width:100%;height:100%;display:block;background:#010401;" +
                "border:1px solid rgba(51,255,102,0.15);border-radius:0.25rem;" +
                "touch-action:none;";
        cvs.addEventListener("pointerdown", this.handlePointerDown);
        window.addEventListener("pointermove", this.handlePointerMove);
        window.addEventListener("pointerup", this.handlePointerUp);
        wrap.appendChild(cvs);
        this.container.appendChild(wrap);
        this.wrapper = wrap;
        this.canvas = cvs;
        this.ctx = cvs.getContext("2d");
    }
    sizeCanvas(w, h) {
        if (!this.canvas || !this.ctx)
            return;
        const dpr = window.devicePixelRatio || 1;
        this.W = w;
        this.H = h;
        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.scale = this.W / LOGICAL_WIDTH;
    }
    // ── Generation ───────────────────────────────────────────
    generateLevel() {
        this.terrain = [];
        const logicalHeight = this.H / this.scale || 1000;
        const phase1 = Math.random() * Math.PI * 2;
        const phase2 = Math.random() * Math.PI * 2;
        const freq1 = 0.003 + Math.random() * 0.005;
        const freq2 = 0.01 + Math.random() * 0.01;
        const baseY = logicalHeight * 0.6;
        const getRawY = (x) => {
            return baseY + Math.sin(x * freq1 + phase1) * 150 + Math.sin(x * freq2 + phase2) * 40;
        };
        const startX = 100;
        const startY = getRawY(startX);
        const holeX = 600 + Math.random() * 250;
        const holeW = 28;
        const holeD = 40;
        const holeY = getRawY(holeX);
        this.hole = { x: holeX, y: holeY, w: holeW, h: holeD };
        // Build terrain line
        for (let x = -50; x <= LOGICAL_WIDTH + 50; x += 5) {
            let y = getRawY(x);
            // Flatten tee area
            if (Math.abs(x - startX) < 40) {
                // Smooth blend tee
                const t = Math.abs(x - startX) / 40;
                const smooth = t * t * (3 - 2 * t);
                y = startY + (y - startY) * smooth;
            }
            // Flatten around hole
            if (Math.abs(x - holeX) < 40) {
                const t = Math.abs(x - holeX) / 40;
                const smooth = t * t * (3 - 2 * t);
                y = holeY + (y - holeY) * smooth;
            }
            // Insert hole geometry
            if (x > holeX - holeW / 2 && x < holeX + holeW / 2) {
                continue; // Skip points inside the cup width
            }
            if (this.terrain.length > 0 && x >= holeX - holeW / 2 && this.terrain[this.terrain.length - 1].x < holeX - holeW / 2) {
                // Drop left edge
                this.terrain.push({ x: holeX - holeW / 2, y: holeY });
                this.terrain.push({ x: holeX - holeW / 2, y: holeY + holeD });
                this.terrain.push({ x: holeX + holeW / 2, y: holeY + holeD });
                this.terrain.push({ x: holeX + holeW / 2, y: holeY });
            }
            this.terrain.push({ x, y });
        }
        // Place ball
        this.ball = {
            x: startX,
            y: startY - BALL_RADIUS - 1,
            vx: 0,
            vy: 0,
            resting: true,
            restTimer: 0
        };
        this.state = "PLAYING";
        this.dragActive = false;
    }
    // ── Input ────────────────────────────────────────────────
    getLogicalPos(e) {
        if (!this.canvas)
            return { x: 0, y: 0 };
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / this.scale,
            y: (e.clientY - rect.top) / this.scale
        };
    }
    onPointerDown(e) {
        if (this.state !== "PLAYING" || !this.ball.resting)
            return;
        this.dragActive = true;
        const pos = this.getLogicalPos(e);
        this.dragStart = pos;
        this.dragCurrent = pos;
    }
    onPointerMove(e) {
        if (!this.dragActive)
            return;
        this.dragCurrent = this.getLogicalPos(e);
    }
    onPointerUp(e) {
        if (!this.dragActive)
            return;
        this.dragActive = false;
        const dx = this.dragStart.x - this.dragCurrent.x;
        const dy = this.dragStart.y - this.dragCurrent.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 10) {
            // Apply impulse
            const powerMult = 4.0;
            let vx = dx * powerMult;
            let vy = dy * powerMult;
            // Cap power
            const speed = Math.sqrt(vx * vx + vy * vy);
            if (speed > MAX_POWER) {
                vx = (vx / speed) * MAX_POWER;
                vy = (vy / speed) * MAX_POWER;
            }
            this.ball.vx = vx;
            this.ball.vy = vy;
            this.ball.resting = false;
            this.strokes++;
        }
    }
    // ── Tick ─────────────────────────────────────────────────
    tick(now) {
        if (!this.ctx)
            return;
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;
        if (this.state === "PLAYING") {
            this.updatePhysics(dt);
            this.checkHole();
        }
        else if (this.state === "HOLED") {
            this.updatePhysics(dt); // Keep physics settling
            this.transitionTimer += dt;
            if (this.transitionTimer > 1.5) {
                this.state = "TRANSITION";
                this.transitionTimer = 0;
            }
        }
        else if (this.state === "TRANSITION") {
            this.transitionTimer += dt;
            if (this.transitionTimer > 0.5 && !this.generatedNext) {
                this.currentHole++;
                this.generateLevel();
                this.state = "TRANSITION"; // generateLevel resets to PLAYING, so force back
                this.generatedNext = true;
            }
            if (this.transitionTimer > 1.0) {
                this.state = "PLAYING";
            }
        }
        this.draw();
        this.animationFrame = requestAnimationFrame((t) => this.tick(t));
    }
    updatePhysics(dt) {
        const SUBSTEPS = 4;
        const subDt = dt / SUBSTEPS;
        const b = this.ball;
        if (b.resting)
            return;
        for (let i = 0; i < SUBSTEPS; i++) {
            // Gravity
            b.vy += GRAVITY * subDt;
            // Move
            b.x += b.vx * subDt;
            b.y += b.vy * subDt;
            // Wall bounces (sides)
            if (b.x < BALL_RADIUS) {
                b.x = BALL_RADIUS;
                b.vx *= -BOUNCE;
            }
            if (b.x > LOGICAL_WIDTH - BALL_RADIUS) {
                b.x = LOGICAL_WIDTH - BALL_RADIUS;
                b.vx *= -BOUNCE;
            }
            // Terrain Collision (Discrete Circle-Segment)
            let collided = false;
            for (let j = 0; j < this.terrain.length - 1; j++) {
                const P1 = this.terrain[j];
                const P2 = this.terrain[j + 1];
                const dx = P2.x - P1.x;
                const dy = P2.y - P1.y;
                const len2 = dx * dx + dy * dy;
                if (len2 === 0)
                    continue;
                // Projection
                let t = ((b.x - P1.x) * dx + (b.y - P1.y) * dy) / len2;
                t = Math.max(0, Math.min(1, t));
                const closestX = P1.x + t * dx;
                const closestY = P1.y + t * dy;
                const distSq = (b.x - closestX) ** 2 + (b.y - closestY) ** 2;
                if (distSq < BALL_RADIUS * BALL_RADIUS) {
                    const dist = Math.sqrt(distSq) || 0.001;
                    const overlap = BALL_RADIUS - dist;
                    // Normal from line to ball
                    const nx = (b.x - closestX) / dist;
                    const ny = (b.y - closestY) / dist;
                    // Push out
                    b.x += nx * overlap;
                    b.y += ny * overlap;
                    // Relative velocity dot normal
                    const dot = b.vx * nx + b.vy * ny;
                    if (dot < 0) {
                        // Bounce
                        b.vx -= (1 + BOUNCE) * dot * nx;
                        b.vy -= (1 + BOUNCE) * dot * ny;
                        // Friction (tangent)
                        const tx = -ny;
                        const ty = nx;
                        const tdot = b.vx * tx + b.vy * ty;
                        b.vx -= tdot * (1 - FRICTION) * tx;
                        b.vy -= tdot * (1 - FRICTION) * ty;
                    }
                    collided = true;
                }
            }
            // Resting logic
            const speedSq = b.vx * b.vx + b.vy * b.vy;
            if (collided && speedSq < 500) { // arbitrary low speed
                b.restTimer += subDt;
                if (b.restTimer > 0.1) {
                    b.vx = 0;
                    b.vy = 0;
                    b.resting = true;
                }
            }
            else {
                b.restTimer = 0;
            }
        }
    }
    checkHole() {
        const b = this.ball;
        const h = this.hole;
        // Is ball resting at the bottom of the cup?
        if (b.resting && b.y > h.y + h.h - BALL_RADIUS - 2 && Math.abs(b.x - h.x) < h.w / 2) {
            this.state = "HOLED";
            this.transitionTimer = 0;
            this.generatedNext = false;
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
        const s = this.scale;
        ctx.fillStyle = "#010401";
        ctx.fillRect(0, 0, W, H);
        // Draw HUD
        ctx.fillStyle = "#33ff66";
        ctx.font = "0.85rem var(--font-mono)";
        ctx.textAlign = "left";
        ctx.fillText(`HOLE: ${this.currentHole}`, 10, 20);
        ctx.textAlign = "right";
        ctx.fillText(`STROKES: ${this.strokes}`, W - 10, 20);
        if (this.state === "HOLED") {
            ctx.textAlign = "center";
            ctx.font = "1.5rem var(--font-mono)";
            ctx.fillText("HOLED!", W / 2, H / 4);
        }
        // Draw Flag
        const h = this.hole;
        ctx.strokeStyle = "#ffaa00";
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.moveTo((h.x + h.w / 2) * s, (h.y + h.h) * s);
        ctx.lineTo((h.x + h.w / 2) * s, (h.y - 40) * s);
        ctx.stroke();
        ctx.fillStyle = "#ffaa00";
        ctx.beginPath();
        ctx.moveTo((h.x + h.w / 2) * s, (h.y - 40) * s);
        ctx.lineTo((h.x + h.w / 2 - 15) * s, (h.y - 32) * s);
        ctx.lineTo((h.x + h.w / 2) * s, (h.y - 24) * s);
        ctx.fill();
        // Draw Terrain Line
        ctx.strokeStyle = "#1a9940";
        ctx.lineWidth = 4 * s;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        if (this.terrain.length > 0) {
            ctx.moveTo(this.terrain[0].x * s, this.terrain[0].y * s);
            for (let i = 1; i < this.terrain.length; i++) {
                ctx.lineTo(this.terrain[i].x * s, this.terrain[i].y * s);
            }
        }
        ctx.stroke();
        // Fill below terrain (optional, for starker contrast)
        ctx.fillStyle = "rgba(26, 153, 64, 0.1)";
        ctx.lineTo(LOGICAL_WIDTH * s, H);
        ctx.lineTo(0, H);
        ctx.fill();
        // Draw Drag Aim Line
        if (this.dragActive) {
            const dx = this.dragStart.x - this.dragCurrent.x;
            const dy = this.dragStart.y - this.dragCurrent.y;
            ctx.strokeStyle = "rgba(255, 170, 0, 0.6)";
            ctx.lineWidth = 2 * s;
            ctx.beginPath();
            ctx.moveTo(this.ball.x * s, this.ball.y * s);
            ctx.lineTo((this.ball.x + dx) * s, (this.ball.y + dy) * s);
            ctx.stroke();
            // Draw a subtle max power ring
            ctx.beginPath();
            ctx.arc(this.ball.x * s, this.ball.y * s, (MAX_POWER / 4.0) * s, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(51, 255, 102, 0.1)";
            ctx.stroke();
        }
        // Draw Ball
        ctx.fillStyle = "#33ff66";
        ctx.shadowColor = "#33ff66";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(this.ball.x * s, this.ball.y * s, BALL_RADIUS * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; // reset
        // Draw Transition Wipe
        if (this.state === "TRANSITION") {
            ctx.fillStyle = "#33ff66";
            if (this.transitionTimer < 0.5) {
                const y = (this.transitionTimer / 0.5) * H;
                ctx.fillRect(0, 0, W, y);
            }
            else {
                const y = ((this.transitionTimer - 0.5) / 0.5) * H;
                ctx.fillRect(0, y, W, H - y);
            }
        }
    }
}
const golf = {
    manifest: {
        id: "golf",
        title: "GOLF",
        command: "GOLF.EXE",
        icon: "⚑",
        description: "Infinite vector topography simulation.",
        folder: AppFolder.GAMES,
    },
    create: () => new GolfApp(),
};
export default golf;

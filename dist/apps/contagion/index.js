import { AppFolder } from "../../apps_api/types.js";
const WALL_THICK = 0.01;
const WALL_SPEED = 0.6;
const VIRUS_SPEED_BASE = 0.25;
const VIRUS_R = 0.015;
const TARGET_QUARANTINE = 0.75;
// ── Main app ─────────────────────────────────────────────────
class ContagionApp {
    constructor() {
        this.container = null;
        this.wrapper = null;
        this.canvas = null;
        this.ctx = null;
        this.resizeObserver = null;
        this.lastTime = 0;
        // Canvas dimensions
        this.W = 0;
        this.H = 0;
        // Game state
        this.level = 1;
        this.lives = 3;
        this.gameOver = false;
        this.levelComplete = false;
        this.completeTimer = 0;
        this.score = 0;
        this.activeRooms = [];
        this.quarantinedRooms = [];
        this.viruses = [];
        this.buildingWall = null;
        // Input state
        this.pointerDownOrigin = null;
        // Bound handlers
        this.handlePointerDown = (e) => this.onPointerDown(e);
        this.handlePointerMove = (e) => this.onPointerMove(e);
        this.handlePointerUp = (e) => this.onPointerUp(e);
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
        const card = document.createElement("div");
        card.className = "panel-card";
        const h2 = document.createElement("h2");
        h2.textContent = "CONTAGION.EXE";
        const p = document.createElement("p");
        p.textContent = "Drag to deploy quarantine firewalls. Target: 75% isolation.";
        card.appendChild(h2);
        card.appendChild(p);
        this.container.appendChild(card);
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex;flex:1;min-height:0;width:100%;margin-top:0.5rem;position:relative;";
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
    // ── Game Logic ───────────────────────────────────────────
    initGame() {
        this.level = 1;
        this.lives = 3;
        this.score = 0;
        this.gameOver = false;
        this.startLevel();
    }
    startLevel() {
        this.levelComplete = false;
        this.completeTimer = 0;
        this.buildingWall = null;
        this.pointerDownOrigin = null;
        this.activeRooms = [{ x: 0, y: 0, w: 1, h: 1 }];
        this.quarantinedRooms = [];
        this.viruses = [];
        const numViruses = this.level + 1;
        for (let i = 0; i < numViruses; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = VIRUS_SPEED_BASE + (this.level * 0.02);
            this.viruses.push({
                x: 0.5 + (Math.random() - 0.5) * 0.5,
                y: 0.5 + (Math.random() - 0.5) * 0.5,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                r: VIRUS_R,
                roomId: 0
            });
        }
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
    }
    // ── Input ────────────────────────────────────────────────
    onPointerDown(e) {
        if (this.gameOver || this.levelComplete) {
            if (this.gameOver)
                this.initGame();
            return;
        }
        if (!this.canvas)
            return;
        const rect = this.canvas.getBoundingClientRect();
        this.pointerDownOrigin = {
            x: (e.clientX - rect.left) / this.W,
            y: (e.clientY - rect.top) / this.H
        };
    }
    onPointerMove(e) {
        if (!this.pointerDownOrigin || this.buildingWall || this.gameOver || this.levelComplete)
            return;
        if (!this.canvas)
            return;
        const rect = this.canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) / this.W;
        const cy = (e.clientY - rect.top) / this.H;
        const dx = cx - this.pointerDownOrigin.x;
        const dy = cy - this.pointerDownOrigin.y;
        if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
            const axis = Math.abs(dx) > Math.abs(dy) ? "H" : "V";
            this.tryStartWall(this.pointerDownOrigin.x, this.pointerDownOrigin.y, axis);
            this.pointerDownOrigin = null;
        }
    }
    onPointerUp(e) {
        this.pointerDownOrigin = null;
    }
    tryStartWall(x, y, axis) {
        // Find which room the point is in
        let targetRoomId = -1;
        for (let i = 0; i < this.activeRooms.length; i++) {
            const r = this.activeRooms[i];
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                targetRoomId = i;
                break;
            }
        }
        if (targetRoomId === -1)
            return; // Clicked inside a quarantined wall or out of bounds
        this.buildingWall = {
            axis,
            x,
            y,
            len1: 0,
            len2: 0,
            stop1: false,
            stop2: false,
            roomId: targetRoomId
        };
    }
    // ── Tick ─────────────────────────────────────────────────
    tick(now) {
        if (!this.ctx)
            return;
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;
        if (this.gameOver) {
            this.draw();
            this.animationFrame = requestAnimationFrame((t) => this.tick(t));
            return;
        }
        if (this.levelComplete) {
            this.completeTimer += dt;
            if (this.completeTimer > 2.0) {
                this.level++;
                this.startLevel();
            }
            this.draw();
            this.animationFrame = requestAnimationFrame((t) => this.tick(t));
            return;
        }
        this.updateViruses(dt);
        this.updateWall(dt);
        this.draw();
        this.animationFrame = requestAnimationFrame((t) => this.tick(t));
    }
    updateViruses(dt) {
        for (const v of this.viruses) {
            v.x += v.vx * dt;
            v.y += v.vy * dt;
            const room = this.activeRooms[v.roomId];
            if (!room)
                continue;
            // Bounce off room boundaries (accounting for aspect ratio slightly if desired, but we keep it simple)
            // Normalized coordinates means width/height aspect ratio visually squishes circles if not careful.
            // For mechanics, simple normalized bouncing is fine.
            const aspect = this.W / this.H;
            const rx = v.r;
            const ry = v.r * aspect; // Make visual hitboxes roughly circular in normalized space
            if (v.x - rx < room.x) {
                v.x = room.x + rx;
                v.vx *= -1;
            }
            if (v.x + rx > room.x + room.w) {
                v.x = room.x + room.w - rx;
                v.vx *= -1;
            }
            if (v.y - ry < room.y) {
                v.y = room.y + ry;
                v.vy *= -1;
            }
            if (v.y + ry > room.y + room.h) {
                v.y = room.y + room.h - ry;
                v.vy *= -1;
            }
        }
    }
    updateWall(dt) {
        if (!this.buildingWall)
            return;
        const w = this.buildingWall;
        const room = this.activeRooms[w.roomId];
        // Expand
        if (!w.stop1) {
            w.len1 += WALL_SPEED * dt;
            if (w.axis === "H" && w.x - w.len1 <= room.x) {
                w.len1 = w.x - room.x;
                w.stop1 = true;
            }
            if (w.axis === "V" && w.y - w.len1 <= room.y) {
                w.len1 = w.y - room.y;
                w.stop1 = true;
            }
        }
        if (!w.stop2) {
            w.len2 += WALL_SPEED * dt;
            if (w.axis === "H" && w.x + w.len2 >= room.x + room.w) {
                w.len2 = room.x + room.w - w.x;
                w.stop2 = true;
            }
            if (w.axis === "V" && w.y + w.len2 >= room.y + room.h) {
                w.len2 = room.y + room.h - w.y;
                w.stop2 = true;
            }
        }
        // Check collision with viruses
        const aspect = this.W / this.H;
        let collision = false;
        for (const v of this.viruses) {
            if (v.roomId !== w.roomId)
                continue;
            const rx = v.r;
            const ry = v.r * aspect;
            if (w.axis === "H") {
                // Wall rect: x: w.x - w.len1, y: w.y - thick/2, w: len1+len2, h: thick
                if (v.x + rx > w.x - w.len1 && v.x - rx < w.x + w.len2 &&
                    v.y + ry > w.y - WALL_THICK / 2 && v.y - ry < w.y + WALL_THICK / 2) {
                    collision = true;
                    break;
                }
            }
            else {
                // Wall rect: x: w.x - thick/2, y: w.y - w.len1, w: thick, h: len1+len2
                if (v.x + rx > w.x - WALL_THICK / 2 && v.x - rx < w.x + WALL_THICK / 2 &&
                    v.y + ry > w.y - w.len1 && v.y - ry < w.y + w.len2) {
                    collision = true;
                    break;
                }
            }
        }
        if (collision) {
            this.buildingWall = null;
            this.lives--;
            if (this.lives <= 0) {
                this.gameOver = true;
            }
            return;
        }
        // Check completion
        if (w.stop1 && w.stop2) {
            this.completeWall(w);
        }
    }
    completeWall(w) {
        const room = this.activeRooms[w.roomId];
        let r1, r2;
        if (w.axis === "H") {
            r1 = { x: room.x, y: room.y, w: room.w, h: w.y - room.y };
            r2 = { x: room.x, y: w.y, w: room.w, h: room.y + room.h - w.y };
        }
        else {
            r1 = { x: room.x, y: room.y, w: w.x - room.x, h: room.h };
            r2 = { x: w.x, y: room.y, w: room.x + room.w - w.x, h: room.h };
        }
        // Replace old room with the two new rooms temporarily
        this.activeRooms.splice(w.roomId, 1, r1, r2);
        // Re-assign viruses
        for (const v of this.viruses) {
            if (v.roomId === w.roomId) {
                // Which subroom is it in?
                if (w.axis === "H") {
                    v.roomId = v.y < w.y ? w.roomId : w.roomId + 1;
                }
                else {
                    v.roomId = v.x < w.x ? w.roomId : w.roomId + 1;
                }
            }
            else if (v.roomId > w.roomId) {
                // Shift indices for viruses in rooms after the split
                v.roomId += 1;
            }
        }
        this.buildingWall = null;
        this.checkQuarantines();
    }
    checkQuarantines() {
        // Find rooms with NO viruses
        const roomHasVirus = new Array(this.activeRooms.length).fill(false);
        for (const v of this.viruses) {
            roomHasVirus[v.roomId] = true;
        }
        // Iterate backwards to safely remove from activeRooms
        for (let i = this.activeRooms.length - 1; i >= 0; i--) {
            if (!roomHasVirus[i]) {
                const r = this.activeRooms.splice(i, 1)[0];
                this.quarantinedRooms.push(r);
                this.score += Math.floor(r.w * r.h * 1000); // 1000 pts for the whole screen
                // Fix virus roomIds that shifted down
                for (const v of this.viruses) {
                    if (v.roomId > i)
                        v.roomId--;
                }
            }
        }
        // Calculate total quarantined area
        let filledArea = 0;
        for (const r of this.quarantinedRooms) {
            filledArea += r.w * r.h;
        }
        if (filledArea >= TARGET_QUARANTINE) {
            this.levelComplete = true;
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
        // Draw active room bounds (grid lines / walls)
        ctx.strokeStyle = "rgba(51, 255, 102, 0.4)";
        ctx.lineWidth = 1;
        for (const r of this.activeRooms) {
            ctx.strokeRect(r.x * W, r.y * H, r.w * W, r.h * H);
        }
        // Draw quarantined rooms
        ctx.fillStyle = "rgba(51, 255, 102, 0.2)";
        for (const r of this.quarantinedRooms) {
            ctx.fillRect(r.x * W, r.y * H, r.w * W, r.h * H);
            // Draw a crosshatch pattern or solid border to make it look secure
            ctx.strokeStyle = "#33ff66";
            ctx.lineWidth = 2;
            ctx.strokeRect(r.x * W, r.y * H, r.w * W, r.h * H);
        }
        // Draw building wall
        if (this.buildingWall) {
            const w = this.buildingWall;
            ctx.fillStyle = "#ffaa00"; // Amber while building
            if (w.axis === "H") {
                ctx.fillRect((w.x - w.len1) * W, (w.y - WALL_THICK / 2) * H, (w.len1 + w.len2) * W, WALL_THICK * H);
            }
            else {
                ctx.fillRect((w.x - WALL_THICK / 2) * W, (w.y - w.len1) * H, WALL_THICK * W, (w.len1 + w.len2) * H);
            }
        }
        // Draw viruses
        ctx.fillStyle = "#ff3333";
        const aspect = W / H;
        for (const v of this.viruses) {
            const rx = v.r * W;
            const ry = v.r * aspect * H;
            // Jitter for glitchy virus effect
            const jx = (Math.random() - 0.5) * 2;
            const jy = (Math.random() - 0.5) * 2;
            ctx.fillRect(v.x * W - rx + jx, v.y * H - ry + jy, rx * 2, ry * 2);
            // Inner core
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(v.x * W - rx / 2, v.y * H - ry / 2, rx, ry);
            ctx.fillStyle = "#ff3333";
        }
        // Draw HUD
        ctx.fillStyle = "#33ff66";
        ctx.font = "0.85rem var(--font-mono)";
        ctx.textAlign = "left";
        let filledArea = 0;
        for (const r of this.quarantinedRooms)
            filledArea += r.w * r.h;
        const pct = Math.floor(filledArea * 100);
        ctx.fillText(`LVL:${this.level}  LIVES:${this.lives}  ISOLATED:${pct}%`, 10, 20);
        if (this.levelComplete) {
            ctx.fillStyle = "rgba(2,8,5,0.8)";
            ctx.fillRect(0, H / 2 - 40, W, 80);
            ctx.fillStyle = "#33ff66";
            ctx.textAlign = "center";
            ctx.font = "1.5rem var(--font-mono)";
            ctx.fillText("SECTOR QUARANTINED", W / 2, H / 2);
            ctx.font = "0.85rem var(--font-mono)";
            ctx.fillText("PREPARING NEXT SECTOR...", W / 2, H / 2 + 20);
        }
        if (this.gameOver) {
            ctx.fillStyle = "rgba(2,8,5,0.8)";
            ctx.fillRect(0, H / 2 - 40, W, 80);
            ctx.fillStyle = "#ff3333";
            ctx.textAlign = "center";
            ctx.font = "1.5rem var(--font-mono)";
            ctx.fillText("SYSTEM FAILURE", W / 2, H / 2);
            ctx.font = "0.85rem var(--font-mono)";
            ctx.fillText("TAP TO REBOOT", W / 2, H / 2 + 20);
        }
    }
}
const contagion = {
    manifest: {
        id: "contagion",
        title: "CONTAGION",
        command: "CONTAGION.EXE",
        icon: "▧",
        description: "Isolate the virus. Deploy firewalls to quarantine the sector.",
        folder: AppFolder.GAMES,
    },
    create: () => new ContagionApp(),
};
export default contagion;

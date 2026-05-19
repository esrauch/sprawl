import { AppFolder } from "../../apps_api/types.js";
// ── Types & Constants ───────────────────────────────────────
const COLS = 10;
const GRAVITY = 25.0;
const JUMP_VEL = -12.0;
const MOVE_SPEED = 8.0;
const HOVER_IMPULSE = -5.0;
const MAX_FALL_SPEED = 20.0;
const MAX_AMMO = 8;
const BLOCK_TYPES = {
    EMPTY: 0,
    BREAKABLE: 1,
    SOLID: 2,
};
// ── Main app ─────────────────────────────────────────────────
class DescendApp {
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
        this.blockSize = 0;
        // Game state
        this.player = { x: 5, y: 3, vx: 0, vy: 0, r: 0.4, ammo: MAX_AMMO, grounded: false };
        this.projectiles = [];
        this.enemyProjectiles = [];
        this.enemies = [];
        this.nextEnemyId = 0;
        this.grid = {};
        this.maxYGenerated = -1;
        this.cameraY = 0;
        this.gameOver = false;
        this.score = 0; // max depth
        this.points = 0;
        this.combo = 0;
        // Input state
        this.keys = { left: false, right: false, jump: false, jumpPressed: false };
        this.touches = { left: false, right: false, jump: false };
        // UI Refs
        this.btnJumpFire = null;
        // Bound handlers
        this.handleKeyDown = (e) => this.onKeyDown(e);
        this.handleKeyUp = (e) => this.onKeyUp(e);
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
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);
        this.lastTime = performance.now();
        this.animationFrame = requestAnimationFrame((t) => this.tick(t));
    }
    onUnmount() {
        if (this.animationFrame !== undefined)
            cancelAnimationFrame(this.animationFrame);
        this.animationFrame = undefined;
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
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
        h2.textContent = "DESCEND.EXE";
        const p = document.createElement("p");
        p.textContent = "Dig deep. Manage your hover energy.";
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
        wrap.appendChild(cvs);
        this.container.appendChild(wrap);
        this.wrapper = wrap;
        this.canvas = cvs;
        this.ctx = cvs.getContext("2d");
        // Controls
        const controls = document.createElement("div");
        controls.style.cssText = "display:flex;gap:0.4rem;margin-top:0.5rem;";
        const btnLeft = document.createElement("button");
        btnLeft.className = "btn-action";
        btnLeft.style.flex = "1";
        btnLeft.textContent = "<";
        btnLeft.addEventListener("pointerdown", () => this.touches.left = true);
        btnLeft.addEventListener("pointerup", () => this.touches.left = false);
        btnLeft.addEventListener("pointerleave", () => this.touches.left = false);
        const btnJump = document.createElement("button");
        btnJump.className = "btn-action";
        btnJump.style.flex = "1";
        btnJump.textContent = "JUMP";
        btnJump.addEventListener("pointerdown", () => {
            if (!this.touches.jump)
                this.keys.jumpPressed = true;
            this.touches.jump = true;
            if (this.gameOver)
                this.initGame();
        });
        btnJump.addEventListener("pointerup", () => this.touches.jump = false);
        btnJump.addEventListener("pointerleave", () => this.touches.jump = false);
        this.btnJumpFire = btnJump;
        const btnRight = document.createElement("button");
        btnRight.className = "btn-action";
        btnRight.style.flex = "1";
        btnRight.textContent = ">";
        btnRight.addEventListener("pointerdown", () => this.touches.right = true);
        btnRight.addEventListener("pointerup", () => this.touches.right = false);
        btnRight.addEventListener("pointerleave", () => this.touches.right = false);
        controls.appendChild(btnLeft);
        controls.appendChild(btnJump);
        controls.appendChild(btnRight);
        this.container.appendChild(controls);
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
        this.blockSize = this.W / COLS;
    }
    // ── Game Logic ───────────────────────────────────────────
    initGame() {
        this.player = { x: 5, y: 3, vx: 0, vy: 0, r: 0.4, ammo: MAX_AMMO, grounded: false };
        this.projectiles = [];
        this.enemyProjectiles = [];
        this.enemies = [];
        this.grid = {};
        this.maxYGenerated = -1;
        this.cameraY = 0;
        this.gameOver = false;
        this.score = 0;
        this.points = 0;
        this.combo = 0;
        // Generate initial safe zone
        for (let i = 0; i < 10; i++) {
            this.generateRow(i, true);
        }
    }
    generateRow(y, safe = false) {
        const row = new Array(COLS).fill(BLOCK_TYPES.EMPTY);
        // Border walls
        row[0] = BLOCK_TYPES.SOLID;
        row[COLS - 1] = BLOCK_TYPES.SOLID;
        if (!safe) {
            // Random blocks
            for (let x = 1; x < COLS - 1; x++) {
                const r = Math.random();
                if (r < 0.01)
                    row[x] = BLOCK_TYPES.SOLID;
                else if (r < 0.03)
                    row[x] = BLOCK_TYPES.BREAKABLE;
                else if (r < 0.04)
                    this.enemies.push({ id: this.nextEnemyId++, type: "HAZARD", x: x + 0.5, y: y + 0.5, vx: 0, r: 0.45, shootTimer: Math.random() * 2, dead: false });
                else if (r < 0.06)
                    this.enemies.push({ id: this.nextEnemyId++, type: "STOMPABLE", x: x + 0.5, y: y + 0.5, vx: Math.random() > 0.5 ? 2 : -2, r: 0.45, shootTimer: 0, dead: false });
            }
        }
        this.grid[y] = row;
        this.maxYGenerated = y;
    }
    // ── Input ────────────────────────────────────────────────
    onKeyDown(e) {
        if (this.gameOver) {
            if (e.key === " ")
                this.initGame();
            return;
        }
        if (e.key === "ArrowLeft" || e.key === "a")
            this.keys.left = true;
        if (e.key === "ArrowRight" || e.key === "d")
            this.keys.right = true;
        if (e.key === "ArrowUp" || e.key === "w" || e.key === " ") {
            if (!this.keys.jump)
                this.keys.jumpPressed = true;
            this.keys.jump = true;
        }
    }
    onKeyUp(e) {
        if (e.key === "ArrowLeft" || e.key === "a")
            this.keys.left = false;
        if (e.key === "ArrowRight" || e.key === "d")
            this.keys.right = false;
        if (e.key === "ArrowUp" || e.key === "w" || e.key === " ")
            this.keys.jump = false;
    }
    getBlock(x, y) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        if (ix < 0 || ix >= COLS)
            return BLOCK_TYPES.SOLID;
        if (this.grid[iy])
            return this.grid[iy][ix];
        return BLOCK_TYPES.EMPTY;
    }
    setBlock(x, y, type) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        if (ix >= 0 && ix < COLS && this.grid[iy]) {
            this.grid[iy][ix] = type;
        }
    }
    // ── Tick ─────────────────────────────────────────────────
    tick(now) {
        if (!this.ctx)
            return;
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;
        if (!this.gameOver) {
            this.updatePlayer(dt);
            this.updateProjectiles(dt);
            this.updateEnemies(dt);
            this.updateEnemyProjectiles(dt);
            // Ensure level is generated ahead
            const bottomVisibleRow = Math.floor(this.cameraY + (this.H / this.blockSize)) + 10;
            while (this.maxYGenerated < bottomVisibleRow) {
                this.generateRow(this.maxYGenerated + 1);
            }
            // Cleanup old rows
            const topVisibleRow = Math.floor(this.cameraY) - 5;
            for (const y of Object.keys(this.grid)) {
                if (parseInt(y) < topVisibleRow)
                    delete this.grid[parseInt(y)];
            }
        }
        this.draw();
        this.keys.jumpPressed = false; // clear edge trigger
        this.animationFrame = requestAnimationFrame((t) => this.tick(t));
    }
    updatePlayer(dt) {
        const p = this.player;
        // Horizontal input
        const moveLeft = this.keys.left || this.touches.left;
        const moveRight = this.keys.right || this.touches.right;
        if (moveLeft && !moveRight)
            p.vx = -MOVE_SPEED;
        else if (moveRight && !moveLeft)
            p.vx = MOVE_SPEED;
        else
            p.vx = 0;
        // Jump / Shoot
        if (this.keys.jumpPressed) {
            if (p.grounded) {
                p.vy = JUMP_VEL;
                p.grounded = false;
            }
            else if (p.ammo > 0) {
                // Shoot gunboots
                p.ammo--;
                p.vy = HOVER_IMPULSE;
                this.projectiles.push({ x: p.x, y: p.y + p.r, vy: 30.0, dead: false });
            }
        }
        // Gravity
        p.vy += GRAVITY * dt;
        if (p.vy > MAX_FALL_SPEED)
            p.vy = MAX_FALL_SPEED;
        // X collision
        p.x += p.vx * dt;
        // Check corners for X
        if (p.vx < 0) {
            if (this.getBlock(p.x - p.r, p.y - p.r * 0.9) || this.getBlock(p.x - p.r, p.y + p.r * 0.9)) {
                p.x = Math.floor(p.x - p.r) + 1 + p.r;
                p.vx = 0;
            }
        }
        else if (p.vx > 0) {
            if (this.getBlock(p.x + p.r, p.y - p.r * 0.9) || this.getBlock(p.x + p.r, p.y + p.r * 0.9)) {
                p.x = Math.floor(p.x + p.r) - p.r;
                p.vx = 0;
            }
        }
        // Y collision
        p.y += p.vy * dt;
        p.grounded = false;
        if (p.vy < 0) {
            if (this.getBlock(p.x - p.r * 0.9, p.y - p.r) || this.getBlock(p.x + p.r * 0.9, p.y - p.r)) {
                p.y = Math.floor(p.y - p.r) + 1 + p.r;
                p.vy = 0;
            }
        }
        else if (p.vy > 0) {
            if (this.getBlock(p.x - p.r * 0.9, p.y + p.r) || this.getBlock(p.x + p.r * 0.9, p.y + p.r)) {
                p.y = Math.floor(p.y + p.r) - p.r;
                p.vy = 0;
                p.grounded = true;
                p.ammo = MAX_AMMO;
                this.combo = 0; // Reset combo when landing normally
            }
        }
        // Check enemy overlap
        for (const e of this.enemies) {
            if (Math.abs(p.x - e.x) < p.r + e.r && Math.abs(p.y - e.y) < p.r + e.r) {
                if (e.type === "STOMPABLE" && p.vy > 0 && p.y < e.y) {
                    p.y = e.y - e.r - p.r;
                    p.vy = JUMP_VEL;
                    p.ammo = MAX_AMMO;
                    this.combo++;
                    this.points += 100 * this.combo;
                    e.dead = true;
                }
                else {
                    this.gameOver = true;
                }
            }
        }
        this.enemies = this.enemies.filter(e => !e.dead);
        // Update Camera
        const targetCameraY = p.y - (this.H / this.blockSize) * 0.3;
        if (targetCameraY > this.cameraY) {
            this.cameraY += (targetCameraY - this.cameraY) * 10 * dt;
        }
        // Score tracking
        const currentDepth = Math.floor(p.y);
        if (currentDepth > this.score) {
            const diff = currentDepth - this.score;
            this.points += diff * this.combo;
            this.score = currentDepth;
        }
        if (this.btnJumpFire) {
            this.btnJumpFire.textContent = p.grounded ? "JUMP" : "FIRE";
        }
    }
    updateEnemies(dt) {
        const shootRate = 1.0 + Math.max(0, Math.floor((this.score - 200) / 100)) * 0.1;
        const shootInterval = 3.0 / shootRate;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (e.y < this.cameraY - 10) {
                this.enemies.splice(i, 1);
                continue;
            }
            if (e.type === "STOMPABLE") {
                e.x += e.vx * dt;
                if (e.vx < 0 && this.getBlock(e.x - e.r, e.y) !== BLOCK_TYPES.EMPTY) {
                    e.vx *= -1;
                    e.x += e.vx * dt * 2;
                }
                else if (e.vx > 0 && this.getBlock(e.x + e.r, e.y) !== BLOCK_TYPES.EMPTY) {
                    e.vx *= -1;
                    e.x += e.vx * dt * 2;
                }
            }
            else if (e.type === "HAZARD" && this.score >= 200) {
                e.shootTimer += dt;
                if (e.shootTimer >= shootInterval) {
                    e.shootTimer = 0;
                    const dx = this.player.x - e.x;
                    const dy = this.player.y - e.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 15 && dist > 0.1) {
                        const speed = 3.33; // 1/3rd of 10.0
                        this.enemyProjectiles.push({
                            x: e.x, y: e.y,
                            vx: (dx / dist) * speed,
                            vy: (dy / dist) * speed,
                            dead: false
                        });
                    }
                }
            }
        }
    }
    updateEnemyProjectiles(dt) {
        for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
            const pr = this.enemyProjectiles[i];
            pr.x += pr.vx * dt;
            pr.y += pr.vy * dt;
            if (this.getBlock(pr.x, pr.y) !== BLOCK_TYPES.EMPTY)
                pr.dead = true;
            const dx = this.player.x - pr.x;
            const dy = this.player.y - pr.y;
            if (Math.sqrt(dx * dx + dy * dy) < this.player.r) {
                this.gameOver = true;
                pr.dead = true;
            }
            if (pr.dead || pr.y < this.cameraY - 10 || pr.y > this.cameraY + 20) {
                this.enemyProjectiles.splice(i, 1);
            }
        }
    }
    updateProjectiles(dt) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const pr = this.projectiles[i];
            pr.y += pr.vy * dt;
            const block = this.getBlock(pr.x, pr.y);
            if (block !== BLOCK_TYPES.EMPTY) {
                pr.dead = true;
                if (block === BLOCK_TYPES.BREAKABLE) {
                    this.setBlock(pr.x, pr.y, BLOCK_TYPES.EMPTY);
                }
            }
            for (const e of this.enemies) {
                if (Math.abs(pr.x - e.x) < e.r && Math.abs(pr.y - e.y) < e.r) {
                    pr.dead = true;
                    e.dead = true;
                    this.combo++;
                    this.points += 100 * this.combo;
                }
            }
            if (pr.dead || pr.y > this.cameraY + (this.H / this.blockSize) + 5) {
                this.projectiles.splice(i, 1);
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
        const bs = this.blockSize;
        if (W === 0 || H === 0)
            return;
        ctx.fillStyle = "#010401";
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.translate(0, -this.cameraY * bs);
        // Draw Grid
        ctx.lineWidth = 1;
        for (const [yStr, row] of Object.entries(this.grid)) {
            const y = parseInt(yStr);
            for (let x = 0; x < COLS; x++) {
                const b = row[x];
                if (b === BLOCK_TYPES.EMPTY)
                    continue;
                if (b === BLOCK_TYPES.SOLID) {
                    ctx.fillStyle = "rgba(51, 255, 102, 0.1)";
                    ctx.fillRect(x * bs, y * bs, bs, bs);
                    ctx.strokeStyle = "#33ff66";
                    ctx.strokeRect(x * bs, y * bs, bs, bs);
                }
                else if (b === BLOCK_TYPES.BREAKABLE) {
                    ctx.strokeStyle = "#33ff66";
                    ctx.strokeRect(x * bs + 2, y * bs + 2, bs - 4, bs - 4);
                    // Little inner pattern
                    ctx.beginPath();
                    ctx.moveTo(x * bs + 4, y * bs + 4);
                    ctx.lineTo(x * bs + bs - 4, y * bs + bs - 4);
                    ctx.stroke();
                }
            }
        }
        // Draw Enemies
        for (const e of this.enemies) {
            const x = e.x - e.r;
            const y = e.y - e.r;
            const size = e.r * 2;
            if (e.type === "HAZARD") {
                ctx.fillStyle = "#ff3333";
                ctx.beginPath();
                ctx.moveTo((x + size / 2) * bs, y * bs);
                ctx.lineTo((x + size) * bs, (y + size) * bs);
                ctx.lineTo(x * bs, (y + size) * bs);
                ctx.fill();
            }
            else if (e.type === "STOMPABLE") {
                ctx.fillStyle = "#ff3333";
                ctx.fillRect(x * bs, (y + 0.2) * bs, size * bs, (size - 0.2) * bs);
                ctx.fillStyle = "#33ff66";
                ctx.fillRect(x * bs, y * bs, size * bs, 0.2 * bs);
            }
        }
        // Draw Enemy Projectiles
        ctx.fillStyle = "#ff3333";
        for (const pr of this.enemyProjectiles) {
            ctx.beginPath();
            ctx.arc(pr.x * bs, pr.y * bs, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        // Draw Projectiles
        ctx.fillStyle = "#ffaa00";
        for (const pr of this.projectiles) {
            ctx.fillRect(pr.x * bs - 2, pr.y * bs - 4, 4, 8);
        }
        // Draw Player
        const p = this.player;
        ctx.fillStyle = "#33ff66";
        ctx.fillRect((p.x - p.r) * bs, (p.y - p.r) * bs, p.r * 2 * bs, p.r * 2 * bs);
        // Gunboot indicator
        if (p.ammo > 0 && !p.grounded) {
            ctx.fillStyle = "#ffaa00";
            ctx.fillRect((p.x - p.r) * bs, (p.y + p.r) * bs, p.r * 2 * bs, 4);
        }
        ctx.restore();
        // Draw HUD
        ctx.fillStyle = "#33ff66";
        ctx.font = "0.85rem var(--font-mono)";
        ctx.textAlign = "left";
        ctx.fillText(`SCORE:${this.points}`, 10, 20);
        ctx.fillText(`DEPTH:${this.score}`, 10, 36);
        if (this.combo > 1) {
            ctx.fillStyle = "#ffaa00";
            ctx.fillText(`COMBO x${this.combo}!`, 10, 52);
        }
        // Ammo
        for (let i = 0; i < MAX_AMMO; i++) {
            if (i < p.ammo) {
                ctx.fillStyle = "#ffaa00";
                ctx.fillRect(10 + i * 12, 60, 8, 12);
            }
            else {
                ctx.strokeStyle = "rgba(255, 170, 0, 0.3)";
                ctx.strokeRect(10 + i * 12, 60, 8, 12);
            }
        }
        if (this.gameOver) {
            ctx.fillStyle = "rgba(2,8,5,0.8)";
            ctx.fillRect(0, H / 2 - 40, W, 80);
            ctx.fillStyle = "#ff3333";
            ctx.textAlign = "center";
            ctx.font = "1.5rem var(--font-mono)";
            ctx.fillText("SYSTEM CRASH", W / 2, H / 2);
            ctx.font = "0.85rem var(--font-mono)";
            ctx.fillText(`MAX DEPTH: ${this.score}`, W / 2, H / 2 + 25);
        }
    }
}
const descend = {
    manifest: {
        id: "descend",
        title: "DESCEND",
        command: "DESCEND.EXE",
        icon: "↧",
        description: "Vertical excavation logic. Hover and destroy.",
        folder: AppFolder.GAMES,
    },
    create: () => new DescendApp(),
};
export default descend;

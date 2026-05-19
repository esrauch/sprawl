import type { AppApi, AppDefinition, AppInstance } from "../../apps_api/types.js";
import { AppFolder } from "../../apps_api/types.js";

// ── Constants ───────────────────────────────────────────────
const LOGICAL_WIDTH = 1000;
const CART_WIDTH = 120;
const CART_HEIGHT = 20;
const EGG_RADIUS = 12;

interface Egg {
    x: number;
    y: number;
    speed: number;
}

interface Shatter {
    x: number;
    y: number;
    timer: number;
}

interface CatchAnim {
    x: number;
    y: number;
    timer: number;
}

// ── Main app ─────────────────────────────────────────────────
class EggApp implements AppInstance {
    private container: HTMLElement | null = null;
    private wrapper: HTMLDivElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private animationFrame: number | undefined;

    // Dimensions
    private W = 0;
    private H = 0;
    private scale = 1;
    private logicalH = 1000;

    // Game state
    private state: "PLAYING" | "SHATTER" | "GAMEOVER" = "PLAYING";
    private eggs: Egg[] = [];
    private shatters: Shatter[] = [];
    private catches: CatchAnim[] = [];
    private cartX = LOGICAL_WIDTH / 2;
    private score = 0;
    private lives = 3;
    
    // Timing
    private lastTime = 0;
    private spawnTimer = 0;
    private shatterPauseTimer = 0;
    
    // Input
    private keys: Record<string, boolean> = {};

    // Bound handlers
    private handleKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
    private handleKeyUp = (e: KeyboardEvent) => this.onKeyUp(e);

    // ── Lifecycle ────────────────────────────────────────────
    public onMount(api: AppApi) {
        this.container = api.container;
        this.buildUI();
        this.initGame();

        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                this.sizeCanvas(entry.contentRect.width, entry.contentRect.height);
            }
        });
        if (this.wrapper) this.resizeObserver.observe(this.wrapper);

        this.lastTime = performance.now();
        this.animationFrame = requestAnimationFrame((t) => this.tick(t));
    }

    public onUnmount() {
        if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
        this.animationFrame = undefined;
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
        
        if (this.container) this.container.innerHTML = "";
        this.container = null;
        this.canvas = null;
        this.ctx = null;
    }

    // ── UI ───────────────────────────────────────────────────
    private buildUI() {
        if (!this.container) return;
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
        
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);
        
        wrap.appendChild(cvs);
        this.container.appendChild(wrap);
        
        const controls = document.createElement("div");
        controls.className = "pong-controls";
        
        const leftBtn = document.createElement("button");
        leftBtn.className = "pong-btn";
        leftBtn.textContent = "<";
        
        const rightBtn = document.createElement("button");
        rightBtn.className = "pong-btn";
        rightBtn.textContent = ">";
        
        const setKey = (key: string, val: boolean) => {
            this.keys[key] = val;
            if (this.state === "GAMEOVER" && val) this.initGame();
        };

        leftBtn.addEventListener("pointerdown", () => setKey("ArrowLeft", true));
        leftBtn.addEventListener("pointerup", () => setKey("ArrowLeft", false));
        leftBtn.addEventListener("pointerleave", () => setKey("ArrowLeft", false));
        
        rightBtn.addEventListener("pointerdown", () => setKey("ArrowRight", true));
        rightBtn.addEventListener("pointerup", () => setKey("ArrowRight", false));
        rightBtn.addEventListener("pointerleave", () => setKey("ArrowRight", false));

        controls.appendChild(leftBtn);
        controls.appendChild(rightBtn);
        this.container.appendChild(controls);

        this.wrapper = wrap;
        this.canvas = cvs;
        this.ctx = cvs.getContext("2d");
    }

    private sizeCanvas(w: number, h: number) {
        if (!this.canvas || !this.ctx) return;
        const dpr = window.devicePixelRatio || 1;
        this.W = w;
        this.H = h;
        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.scale = this.W / LOGICAL_WIDTH;
        this.logicalH = this.H / this.scale;
    }

    // ── Game Logic ───────────────────────────────────────────
    private initGame() {
        this.state = "PLAYING";
        this.eggs = [];
        this.shatters = [];
        this.catches = [];
        this.cartX = LOGICAL_WIDTH / 2;
        this.score = 0;
        this.lives = 3;
        this.spawnTimer = 0;
    }

    // ── Input ────────────────────────────────────────────────
    private onKeyDown(e: KeyboardEvent) {
        if (this.state === "GAMEOVER" && (e.key === " " || e.key === "Enter")) {
            this.initGame();
            return;
        }
        this.keys[e.key] = true;
    }

    private onKeyUp(e: KeyboardEvent) {
        this.keys[e.key] = false;
    }

    // ── Tick ─────────────────────────────────────────────────
    private tick(now: number) {
        if (!this.ctx) return;
        
        let dt = (now - this.lastTime) / 1000;
        if (dt > 0.1) dt = 0.016; // limit dt on massive drops
        this.lastTime = now;

        // Keyboard movement
        if (this.state === "PLAYING") {
            const moveSpeed = 1000 * dt;
            if (this.keys["ArrowLeft"] || this.keys["a"]) {
                this.cartX = Math.max(CART_WIDTH / 2, this.cartX - moveSpeed);
            }
            if (this.keys["ArrowRight"] || this.keys["d"]) {
                this.cartX = Math.min(LOGICAL_WIDTH - CART_WIDTH / 2, this.cartX + moveSpeed);
            }
        }

        if (this.state === "PLAYING") {
            this.updatePlaying(dt);
        } else if (this.state === "SHATTER") {
            this.shatterPauseTimer -= dt;
            if (this.shatterPauseTimer <= 0) {
                this.shatters = [];
                this.state = "GAMEOVER";
            }
        }

        this.draw();
        this.animationFrame = requestAnimationFrame((t) => this.tick(t));
    }

    private updatePlaying(dt: number) {
        const cartY = this.logicalH - 40;
        
        // Spawn eggs
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            // Difficulty curve
            const spawnInterval = Math.max(0.2, 1.5 - (this.score * 0.02));
            this.spawnTimer = spawnInterval;
            
            const speed = Math.min(1000, 300 + (this.score * 10));
            this.eggs.push({
                x: EGG_RADIUS + Math.random() * (LOGICAL_WIDTH - EGG_RADIUS * 2),
                y: -EGG_RADIUS,
                speed
            });
        }

        // Move eggs
        let missed = false;
        for (let i = this.eggs.length - 1; i >= 0; i--) {
            const egg = this.eggs[i];
            egg.y += egg.speed * dt;

            // Check collision with cart
            if (egg.y + EGG_RADIUS > cartY && egg.y - EGG_RADIUS < cartY + CART_HEIGHT) {
                if (egg.x > this.cartX - CART_WIDTH / 2 - EGG_RADIUS && egg.x < this.cartX + CART_WIDTH / 2 + EGG_RADIUS) {
                    // Catch!
                    this.score++;
                    this.catches.push({ x: egg.x, y: cartY, timer: 0.4 });
                    this.eggs.splice(i, 1);
                    continue;
                }
            }

            // Missed!
            if (egg.y > this.logicalH + EGG_RADIUS) {
                missed = true;
                this.shatters.push({ x: egg.x, y: this.logicalH - 10, timer: 0.5 });
                this.eggs.splice(i, 1);
            }
        }

        // Update shatters
        for (let i = this.shatters.length - 1; i >= 0; i--) {
            this.shatters[i].timer -= dt;
            if (this.shatters[i].timer <= 0) {
                this.shatters.splice(i, 1);
            }
        }

        // Update catches
        for (let i = this.catches.length - 1; i >= 0; i--) {
            this.catches[i].timer -= dt;
            if (this.catches[i].timer <= 0) {
                this.catches.splice(i, 1);
            }
        }

        if (missed) {
            this.lives--;
            if (this.lives <= 0) {
                this.state = "SHATTER";
                this.shatterPauseTimer = 1.0;
            }
        }
    }

    // ── Drawing ──────────────────────────────────────────────
    private draw() {
        if (!this.ctx || !this.canvas) return;
        const ctx = this.ctx;
        const W = this.W;
        const H = this.H;
        const s = this.scale;

        ctx.fillStyle = "#010401";
        ctx.fillRect(0, 0, W, H);

        // Draw HUD
        ctx.fillStyle = "#33ff66";
        ctx.font = "0.85rem var(--font-mono)";
        ctx.textAlign = "left";
        ctx.fillText(`SCORE: ${this.score}`, 10, 20);

        ctx.textAlign = "right";
        ctx.fillText(`LIVES: ${this.lives}`, W - 10, 20);

        // Draw Cart
        ctx.strokeStyle = "#ffaa00";
        ctx.lineWidth = 3 * s;
        ctx.beginPath();
        const cx = this.cartX * s;
        const cy = (this.logicalH - 40) * s;
        const cw = CART_WIDTH * s;
        const ch = CART_HEIGHT * s;
        
        ctx.moveTo(cx - cw/2, cy);
        ctx.lineTo(cx - cw/2 + 8*s, cy + ch);
        ctx.lineTo(cx + cw/2 - 8*s, cy + ch);
        ctx.lineTo(cx + cw/2, cy);
        ctx.stroke();

        // Draw Eggs
        ctx.fillStyle = "#33ff66";
        ctx.shadowColor = "#33ff66";
        ctx.shadowBlur = 8;
        for (const egg of this.eggs) {
            ctx.beginPath();
            ctx.ellipse(egg.x * s, egg.y * s, EGG_RADIUS * 0.7 * s, EGG_RADIUS * s, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;

        // Draw Shatters
        for (const sh of this.shatters) {
            ctx.strokeStyle = "#ff3333";
            ctx.lineWidth = 2 * s;
            ctx.beginPath();
            const sx = sh.x * s;
            const sy = sh.y * s;
            ctx.moveTo(sx - 15*s, sy - 15*s); ctx.lineTo(sx + 15*s, sy + 15*s);
            ctx.moveTo(sx + 15*s, sy - 15*s); ctx.lineTo(sx - 15*s, sy + 15*s);
            ctx.stroke();
        }

        // Draw Catches
        ctx.textAlign = "center";
        ctx.font = "bold 1rem var(--font-mono)";
        for (const c of this.catches) {
            const alpha = Math.max(0, c.timer / 0.4);
            ctx.fillStyle = `rgba(51, 255, 102, ${alpha})`;
            
            // Float up slowly
            const yOffset = (1.0 - (c.timer / 0.4)) * 40 * s;
            ctx.fillText("+1", c.x * s, c.y * s - yOffset);
        }

        // Game Over Overlay
        if (this.state === "GAMEOVER") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
            ctx.fillRect(0, 0, W, H);
            
            ctx.fillStyle = "#ff3333";
            ctx.textAlign = "center";
            ctx.font = "2rem var(--font-mono)";
            ctx.fillText("SYSTEM HALT", W/2, H/2 - 20);
            
            ctx.fillStyle = "#33ff66";
            ctx.font = "1rem var(--font-mono)";
            ctx.fillText(`FINAL SCORE: ${this.score}`, W/2, H/2 + 20);
            
            ctx.fillStyle = "#1a9940";
            ctx.font = "0.8rem var(--font-mono)";
            ctx.fillText("TAP TO REBOOT", W/2, H/2 + 60);
        }
    }
}

const egg: AppDefinition = {
    manifest: {
        id: "egg",
        title: "EGG",
        command: "EGG.EXE",
        icon: "◒",
        description: "Continuous packet catcher.",
        folder: AppFolder.GAMES,
    },
    create: () => new EggApp(),
};

export default egg;

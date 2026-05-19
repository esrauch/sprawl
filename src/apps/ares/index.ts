import type { AppDefinition, AppInstance, AppApi } from "../../apps_api/types.js";
import { AppFolder } from "../../apps_api/types.js";

// ── World constants (meters / seconds) ───────────────────────
const WORLD_W = 800;          // world width in metres (wide moonscape)
const WORLD_H = 300;          // world height in metres
const GRAVITY = 1.62;         // lunar gravity  m/s²
const THRUST_ACCEL = 4.0;     // main‑engine   m/s²  (≈ 2.5× gravity)
const ROTATE_SPEED = 2.2;     // radians / second
const MAX_FUEL = 936;         // fuel units
const FUEL_RATE = 30;         // fuel consumed/sec → ~31 seconds of burn

// Landing thresholds
const SAFE_VY = 3.0;          // max vertical speed for safe landing (m/s)
const SAFE_VX = 2.5;          // max horizontal speed for safe landing (m/s)
const SAFE_ANGLE = 0.35;      // ~20 degrees max tilt

// Terrain generation
const TERRAIN_PTS = 80;       // many vertices for jagged detail
const PAD_WIDTH_PTS = 3;      // flat landing‑pad spans 3 segments

// Lander shape scale (pixels, drawn relative to lander centre)
const LANDER_H = 14;          // half‐height of the drawn ship
const LANDER_W = 9;           // half‐width
const LANDER_FOOT_M = 3;      // world‐space metres from centre to feet

// Explosion
const EXPLOSION_PARTICLES = 16;
const EXPLOSION_DURATION = 1.5; // seconds

// ── Lander state ─────────────────────────────────────────────
interface Particle { x: number; y: number; vx: number; vy: number; life: number; }

interface LanderState {
    x: number;   // metres from left
    y: number;   // metres from bottom (y‑up!)
    vx: number;  // m/s
    vy: number;  // m/s  (positive = up)
    angle: number; // radians, 0 = upright, CW positive
    fuel: number;
    landed: boolean;
    crashed: boolean;
}

class AresApp implements AppInstance {
    private container: HTMLElement | null = null;
    private wrapperEl: HTMLDivElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private animationFrame: number | undefined;
    private resizeObserver: ResizeObserver | null = null;
    private lastTime = 0;

    // Camera – tracks a rectangular viewport in world‑space
    private camX = WORLD_W / 2;
    private camY = WORLD_H * 0.65;
    private camSpan = WORLD_H;  // vertical extent visible

    // Terrain arrays (world coords, y‑up)
    private terrainX: number[] = [];
    private terrainY: number[] = [];
    private padLeftIdx = 0;
    private padRightIdx = 0;

    // Input
    private thrusting = false;
    private rotLeft = false;
    private rotRight = false;

    // Explosion state
    private explosionParticles: Particle[] = [];
    private explosionTimer = 0;

    private state: LanderState = this.freshState();

    // ── Lifecycle ────────────────────────────────────────────
    public onMount(api: AppApi) {
        this.container = api.container;
        this.buildUI();
        this.generateTerrain();
        this.state = this.freshState();
        this.centreCamera();

        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                this.sizeCanvas(entry.contentRect.width, entry.contentRect.height);
            }
        });
        if (this.wrapperEl) this.resizeObserver.observe(this.wrapperEl);

        this.lastTime = performance.now();
        this.animationFrame = requestAnimationFrame((t) => this.tick(t));
    }

    public onUnmount() {
        if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
        this.animationFrame = undefined;
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        if (this.container) this.container.innerHTML = "";
        this.container = null;
        this.canvas = null;
        this.ctx = null;
    }

    // ── Fresh state ──────────────────────────────────────────
    private freshState(): LanderState {
        return {
            x: WORLD_W * 0.12,
            y: WORLD_H * 0.72,
            vx: 6,       // rightward drift (must navigate to pad)
            vy: -0.5,    // gentle downward
            angle: 0,
            fuel: MAX_FUEL,
            landed: false,
            crashed: false,
        };
    }

    // ── UI construction ──────────────────────────────────────
    private buildUI() {
        if (!this.container) return;
        this.container.style.display = "flex";
        this.container.style.flexDirection = "column";
        this.container.style.minHeight = "0";
        this.container.style.userSelect = "none";

        const card = document.createElement("div");
        card.className = "panel-card";
        card.style.userSelect = "none";
        const h2 = document.createElement("h2");
        h2.textContent = "ARES LUNAR LANDER";
        const p = document.createElement("p");
        p.textContent = "Land gently on the bright orange pad. Watch your speed, angle and fuel.";
        card.appendChild(h2);
        card.appendChild(p);
        this.container.appendChild(card);

        // Canvas wrapper fills remaining vertical space
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex;flex:1;min-height:0;width:100%;margin-top:0.75rem;user-select:none";
        const cvs = document.createElement("canvas");
        cvs.style.cssText =
            "width:100%;height:100%;display:block;background:#010401;" +
            "border:1px solid rgba(51,255,102,0.15);border-radius:0.25rem;user-select:none";
        wrap.appendChild(cvs);
        this.container.appendChild(wrap);
        this.wrapperEl = wrap;
        this.canvas = cvs;
        this.ctx = cvs.getContext("2d");

        // Controls
        const grid = document.createElement("div");
        grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;margin-top:0.75rem;user-select:none";

        const mkBtn = (label: string, onDown: () => void, onUp: () => void) => {
            const b = document.createElement("button");
            b.className = "btn-action";
            b.type = "button";
            b.textContent = label;
            b.style.userSelect = "none";
            b.addEventListener("pointerdown", onDown);
            b.addEventListener("pointerup", onUp);
            b.addEventListener("pointerleave", onUp);
            return b;
        };

        grid.appendChild(mkBtn("◀ ROTATE", () => { this.rotLeft = true; }, () => { this.rotLeft = false; }));
        grid.appendChild(mkBtn("▲ THRUST", () => { this.thrusting = true; }, () => { this.thrusting = false; }));
        grid.appendChild(mkBtn("ROTATE ▶", () => { this.rotRight = true; }, () => { this.rotRight = false; }));
        this.container.appendChild(grid);

        const reset = document.createElement("button");
        reset.className = "btn-action";
        reset.style.marginTop = "0.5rem";
        reset.style.userSelect = "none";
        reset.textContent = "RESET MISSION";
        reset.type = "button";
        reset.addEventListener("click", () => this.resetMission());
        this.container.appendChild(reset);
    }

    // ── Terrain generation (midpoint displacement fractal) ──
    private generateTerrain() {
        this.terrainX = [];
        this.terrainY = [];

        // Step 1: Seed a coarse heightmap, then subdivide with random offsets
        // to produce jagged, cratered terrain like the classic Lunar Lander.
        const n = TERRAIN_PTS + 1;
        const heights = new Float64Array(n);

        // Seed endpoints and a few anchors
        heights[0] = 25 + Math.random() * 20;
        heights[n - 1] = 25 + Math.random() * 20;

        // Recursive midpoint displacement
        const displace = (lo: number, hi: number, scale: number) => {
            if (hi - lo < 2) return;
            const mid = (lo + hi) >> 1;
            heights[mid] = (heights[lo] + heights[hi]) / 2 + (Math.random() - 0.5) * scale;
            displace(lo, mid, scale * 0.6);
            displace(mid, hi, scale * 0.6);
        };
        displace(0, n - 1, 45);

        // Clamp to reasonable range
        for (let i = 0; i < n; i++) {
            heights[i] = Math.max(8, Math.min(70, heights[i]));
        }

        // Build terrain arrays
        for (let i = 0; i < n; i++) {
            this.terrainX.push((i / (n - 1)) * WORLD_W);
            this.terrainY.push(heights[i]);
        }

        // Step 2: Carve a flat landing pad in the middle third.
        // Pick the lowest point in the region as the pad site (valley landing).
        const regionStart = Math.floor(n * 0.3);
        const regionEnd = Math.floor(n * 0.7);
        let bestIdx = regionStart;
        for (let i = regionStart; i <= regionEnd - PAD_WIDTH_PTS; i++) {
            if (this.terrainY[i] < this.terrainY[bestIdx]) bestIdx = i;
        }
        const padAlt = this.terrainY[bestIdx];
        // Smooth the approach slopes into the pad
        if (bestIdx > 0) this.terrainY[bestIdx - 1] = padAlt + (this.terrainY[bestIdx - 1] - padAlt) * 0.4;
        for (let i = 0; i <= PAD_WIDTH_PTS; i++) {
            this.terrainY[bestIdx + i] = padAlt;
        }
        const afterPad = bestIdx + PAD_WIDTH_PTS + 1;
        if (afterPad < n) this.terrainY[afterPad] = padAlt + (this.terrainY[afterPad] - padAlt) * 0.4;

        this.padLeftIdx = bestIdx;
        this.padRightIdx = bestIdx + PAD_WIDTH_PTS;
    }

    // ── Reset ────────────────────────────────────────────────
    private resetMission() {
        const wasDone = this.state.landed || this.state.crashed;
        this.generateTerrain();
        this.state = this.freshState();
        this.centreCamera();
        if (wasDone) {
            this.lastTime = performance.now();
            if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
            this.animationFrame = requestAnimationFrame((t) => this.tick(t));
        }
    }

    // ── Canvas sizing ────────────────────────────────────────
    private sizeCanvas(w: number, h: number) {
        if (!this.canvas || !this.ctx) return;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.draw();
    }

    // ── Physics tick ─────────────────────────────────────────
    private tick(now: number) {
        if (!this.canvas || !this.ctx) return;
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;

        if (!this.state.landed && !this.state.crashed) {
            // Rotation
            if (this.rotLeft) this.state.angle -= ROTATE_SPEED * dt;
            if (this.rotRight) this.state.angle += ROTATE_SPEED * dt;

            // Thrust
            if (this.thrusting && this.state.fuel > 0) {
                this.state.fuel = Math.max(0, this.state.fuel - FUEL_RATE * dt);
                // Thrust along the lander's "up" axis
                this.state.vx += Math.sin(this.state.angle) * THRUST_ACCEL * dt;
                this.state.vy += Math.cos(this.state.angle) * THRUST_ACCEL * dt;
            }

            // Gravity (pulls vy downward)
            this.state.vy -= GRAVITY * dt;

            // Integrate position
            this.state.x += this.state.vx * dt;
            this.state.y += this.state.vy * dt;

            // Horizontal wrap / clamp
            if (this.state.x < 0) { this.state.x = 0; this.state.vx = Math.abs(this.state.vx) * 0.3; }
            if (this.state.x > WORLD_W) { this.state.x = WORLD_W; this.state.vx = -Math.abs(this.state.vx) * 0.3; }
            // Ceiling clamp
            if (this.state.y > WORLD_H) { this.state.y = WORLD_H; this.state.vy = 0; }

            // Ground collision – measured from feet, not centre
            const groundY = this.sampleGround(this.state.x);
            const feetY = this.state.y - LANDER_FOOT_M;
            if (feetY <= groundY) {
                this.state.y = groundY + LANDER_FOOT_M;
                const descentSpeed = -this.state.vy; // how fast we're falling (positive = falling)
                const hSpeed = Math.abs(this.state.vx);
                const angleOk = Math.abs(this.state.angle) < SAFE_ANGLE;

                // Check if on pad
                const padLx = this.terrainX[this.padLeftIdx];
                const padRx = this.terrainX[this.padRightIdx];
                const onPad = this.state.x >= padLx && this.state.x <= padRx;

                if (descentSpeed < SAFE_VY && hSpeed < SAFE_VX && angleOk && onPad) {
                    this.state.landed = true;
                } else {
                    this.state.crashed = true;
                    this.spawnExplosion();
                }
                this.state.vx = 0;
                this.state.vy = 0;
            }

            // Smooth camera tracking
            this.updateCamera(dt);
        }

        // Animate explosion particles even after crash
        if (this.state.crashed && this.explosionTimer > 0) {
            this.explosionTimer -= dt;
            for (const p of this.explosionParticles) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.vy -= GRAVITY * 0.5 * dt; // particles fall slowly
                p.life -= dt / EXPLOSION_DURATION;
            }
        }

        this.draw();

        // Keep looping during explosion animation
        if (!this.state.landed && !this.state.crashed) {
            this.animationFrame = requestAnimationFrame((t) => this.tick(t));
        } else if (this.state.crashed && this.explosionTimer > 0) {
            this.animationFrame = requestAnimationFrame((t) => this.tick(t));
        } else {
            this.animationFrame = undefined;
        }
    }

    // ── Explosion ─────────────────────────────────────────────
    private spawnExplosion() {
        this.explosionParticles = [];
        this.explosionTimer = EXPLOSION_DURATION;
        for (let i = 0; i < EXPLOSION_PARTICLES; i++) {
            const angle = (i / EXPLOSION_PARTICLES) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const speed = 8 + Math.random() * 18;
            this.explosionParticles.push({
                x: this.state.x,
                y: this.state.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
            });
        }
    }

    // ── Camera ───────────────────────────────────────────────
    private centreCamera() {
        this.camX = this.state.x;
        this.camY = this.state.y;
        this.camSpan = WORLD_H;
    }

    private updateCamera(dt: number) {
        // Lerp camera towards the lander
        const lerpRate = 2.5; // how snappy the follow is
        this.camX += (this.state.x - this.camX) * lerpRate * dt;
        this.camY += (this.state.y - this.camY) * lerpRate * dt;

        // Zoom in as we approach the ground
        const altAboveGround = this.state.y - this.sampleGround(this.state.x);
        const targetSpan = Math.max(80, Math.min(WORLD_H, altAboveGround * 3 + 60));
        this.camSpan += (targetSpan - this.camSpan) * lerpRate * dt;
    }

    // ── Terrain sampling (linear interp) ─────────────────────
    private sampleGround(wx: number): number {
        const n = this.terrainX.length - 1;
        // Find segment
        for (let i = 0; i < n; i++) {
            if (wx <= this.terrainX[i + 1]) {
                const t = (wx - this.terrainX[i]) / (this.terrainX[i + 1] - this.terrainX[i]);
                return this.terrainY[i] + t * (this.terrainY[i + 1] - this.terrainY[i]);
            }
        }
        return this.terrainY[n];
    }

    // ── Drawing ──────────────────────────────────────────────
    private draw() {
        if (!this.canvas || !this.ctx) return;
        const ctx = this.ctx;
        const W = this.canvas.clientWidth;
        const H = this.canvas.clientHeight;
        if (W === 0 || H === 0) return;

        const aspect = W / H;
        const spanY = this.camSpan;
        const spanX = spanY * aspect;

        // World → screen transforms
        const wx2sx = (wx: number) => ((wx - (this.camX - spanX / 2)) / spanX) * W;
        const wy2sy = (wy: number) => H - ((wy - (this.camY - spanY / 2)) / spanY) * H; // y-up → y-down

        // Clear
        ctx.fillStyle = "#020805";
        ctx.fillRect(0, 0, W, H);

        // Stars (fixed screen positions, subtle)
        ctx.fillStyle = "rgba(51, 255, 102, 0.06)";
        for (let i = 0; i < 60; i++) {
            const sx = ((i * 137 + 31) % W);
            const sy = ((i * 211 + 59) % H) * 0.5;
            ctx.fillRect(sx, sy, 1.5, 1.5);
        }

        // Terrain
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < this.terrainX.length; i++) {
            const sx = wx2sx(this.terrainX[i]);
            const sy = wy2sy(this.terrainY[i]);
            if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.strokeStyle = "#995500";
        ctx.stroke();

        // Fill below terrain to give it mass
        const lastIdx = this.terrainX.length - 1;
        ctx.lineTo(wx2sx(this.terrainX[lastIdx]), H + 10);
        ctx.lineTo(wx2sx(this.terrainX[0]), H + 10);
        ctx.closePath();
        ctx.fillStyle = "rgba(60, 40, 0, 0.15)";
        ctx.fill();

        // Landing pad highlight
        const pL = wx2sx(this.terrainX[this.padLeftIdx]);
        const pR = wx2sx(this.terrainX[this.padRightIdx]);
        const pY = wy2sy(this.terrainY[this.padLeftIdx]);
        ctx.strokeStyle = "#ff6600";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pL, pY);
        ctx.lineTo(pR, pY);
        ctx.stroke();
        // Small "landing lights" at edges
        ctx.fillStyle = "#ff6600";
        ctx.fillRect(pL - 2, pY - 6, 4, 12);
        ctx.fillRect(pR - 2, pY - 6, 4, 12);

        // Lander (skip drawing if crashed and explosion is playing)
        const lx = wx2sx(this.state.x);
        const ly = wy2sy(this.state.y);

        // Scale factor — lander scales naturally with zoom
        const pixPerMetre = H / spanY;
        const s = pixPerMetre / 4;

        if (!this.state.crashed) {
            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(this.state.angle); // CW positive

            // Body (triangle)
            ctx.strokeStyle = "#33ff66";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -LANDER_H * s);
            ctx.lineTo(-LANDER_W * s, LANDER_H * 0.7 * s);
            ctx.lineTo(LANDER_W * s, LANDER_H * 0.7 * s);
            ctx.closePath();
            ctx.stroke();

            // Cross strut
            ctx.beginPath();
            ctx.moveTo(-LANDER_W * 0.8 * s, 0);
            ctx.lineTo(LANDER_W * 0.8 * s, 0);
            ctx.stroke();

            // Landing legs
            ctx.beginPath();
            ctx.moveTo(-LANDER_W * 0.6 * s, LANDER_H * 0.7 * s);
            ctx.lineTo(-LANDER_W * 0.7 * s, LANDER_H * 1.15 * s);
            ctx.moveTo(LANDER_W * 0.6 * s, LANDER_H * 0.7 * s);
            ctx.lineTo(LANDER_W * 0.7 * s, LANDER_H * 1.15 * s);
            ctx.stroke();

            // Thrust flame
            if (this.thrusting && this.state.fuel > 0 && !this.state.landed) {
                ctx.strokeStyle = "rgba(255,170,0,0.7)";
                ctx.lineWidth = 2;
                const flameLen = (14 + Math.random() * 10) * s;
                ctx.beginPath();
                ctx.moveTo(-4 * s, LANDER_H * 0.75 * s);
                ctx.lineTo(0, LANDER_H * 0.75 * s + flameLen);
                ctx.lineTo(4 * s, LANDER_H * 0.75 * s);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Explosion particles
        if (this.state.crashed && this.explosionParticles.length > 0) {
            for (const p of this.explosionParticles) {
                if (p.life <= 0) continue;
                const px = wx2sx(p.x);
                const py = wy2sy(p.y);
                const alpha = Math.max(0, p.life);
                const size = (2 + Math.random() * 2) * s;
                // Mix of orange and green debris
                ctx.fillStyle = p.life > 0.5
                    ? `rgba(255, 140, 0, ${alpha})`
                    : `rgba(51, 255, 102, ${alpha * 0.7})`;
                ctx.fillRect(px - size / 2, py - size / 2, size, size);
            }
        }

        // ── Pad direction arrow (when pad is off-screen) ─────
        const padCenterWx = (this.terrainX[this.padLeftIdx] + this.terrainX[this.padRightIdx]) / 2;
        const padCenterWy = this.terrainY[this.padLeftIdx];
        const padSx = wx2sx(padCenterWx);
        const padSy = wy2sy(padCenterWy);
        const padOffScreen = padSx < 0 || padSx > W || padSy < 0 || padSy > H;

        if (padOffScreen && !this.state.landed && !this.state.crashed) {
            // Clamp arrow position to screen edge with margin
            const margin = 24;
            const arrowX = Math.max(margin, Math.min(W - margin, padSx));
            const arrowY = Math.max(margin, Math.min(H - margin, padSy));
            const arrowAngle = Math.atan2(padSy - H / 2, padSx - W / 2);

            ctx.save();
            ctx.translate(arrowX, arrowY);
            ctx.rotate(arrowAngle);
            ctx.fillStyle = "#ff6600";
            ctx.globalAlpha = 0.7 + Math.sin(Date.now() / 300) * 0.3; // gentle pulse
            ctx.beginPath();
            ctx.moveTo(10, 0);
            ctx.lineTo(-5, -6);
            ctx.lineTo(-5, 6);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.restore();
        }

        // ── HUD ──────────────────────────────────────────────
        ctx.fillStyle = "#33ff66";
        ctx.font = "0.75rem var(--font-mono)";
        ctx.textAlign = "left";

        const alt = Math.max(0, this.state.y - LANDER_FOOT_M - this.sampleGround(this.state.x)).toFixed(1);
        const vVel = this.state.vy.toFixed(1);
        const hVel = this.state.vx.toFixed(1);
        const ang = (this.state.angle * (180 / Math.PI)).toFixed(0);
        const fuel = Math.floor(this.state.fuel);

        ctx.fillText(`ALT  ${alt} m`, 8, 18);
        ctx.fillText(`VVEL ${vVel} m/s`, 8, 33);
        ctx.fillText(`HVEL ${hVel} m/s`, 8, 48);
        ctx.fillText(`ANG  ${ang}°`, 8, 63);
        ctx.fillText(`FUEL ${fuel}`, 8, 78);

        // Colour-coded descent speed warning
        const descent = -this.state.vy;
        if (!this.state.landed && !this.state.crashed && descent > SAFE_VY * 0.6) {
            ctx.fillStyle = descent > SAFE_VY ? "#ff3333" : "#ffaa00";
            ctx.textAlign = "right";
            ctx.fillText(descent > SAFE_VY ? "⚠ TOO FAST" : "▼ SLOW DOWN", W - 8, 18);
        }

        // End‑game overlay
        if (this.state.landed || this.state.crashed) {
            ctx.fillStyle = "rgba(0,0,0,0.45)";
            ctx.fillRect(0, H * 0.38, W, H * 0.24);

            ctx.textAlign = "center";
            ctx.font = "bold 1.1rem var(--font-mono)";
            ctx.fillStyle = this.state.landed ? "#33ff66" : "#ff3333";
            ctx.fillText(
                this.state.landed ? "TOUCHDOWN CONFIRMED" : "MISSION FAILED",
                W / 2, H / 2 - 4,
            );
            ctx.font = "0.7rem var(--font-mono)";
            ctx.fillStyle = "#888";
            ctx.fillText("[ RESET MISSION ]", W / 2, H / 2 + 16);
        }
    }
}

const ares: AppDefinition = {
    manifest: {
        id: "ares",
        title: "ARES",
        command: "ARES.LDR",
        icon: "△",
        description: "Lunar descent module simulation. Land gently on the orange pad.",
        folder: AppFolder.GAMES,
    },
    create: () => new AresApp(),
};

export default ares;

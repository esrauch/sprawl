import { AppFolder } from "../../apps_api/types.js";
// ── State & Constants ──────────────────────────────
const GAME_WIDTH = 300;
const GAME_HEIGHT = 400;
const PADDLE_WIDTH = 60;
const PADDLE_HEIGHT = 10;
const BALL_SIZE = 10;
const WIN_SCORE = 3;
const PADDLE_SPEED = 200; // px per second
const AI_SPEED = 165; // slightly slower than player so it's beatable
const BALL_SPEED_START = 150;
const MAX_BOUNCE_ANGLE = Math.PI / 3; // 60 degrees
class Pong {
    constructor() {
        this.animationFrameId = 0;
        this.lastTime = 0;
        this.state = {
            running: false,
            playerScore: 0,
            aiScore: 0,
            playerX: GAME_WIDTH / 2 - PADDLE_WIDTH / 2,
            aiX: GAME_WIDTH / 2 - PADDLE_WIDTH / 2,
            ballX: GAME_WIDTH / 2 - BALL_SIZE / 2,
            ballY: GAME_HEIGHT / 2 - BALL_SIZE / 2,
            ballVx: 0,
            ballVy: 0,
            playerMovingLeft: false,
            playerMovingRight: false,
            winner: null,
            playerWidth: PADDLE_WIDTH,
            aiWidth: PADDLE_WIDTH,
        };
        this.handleLeftStart = (e) => {
            e.preventDefault();
            this.state.playerMovingLeft = true;
        };
        this.handleRightStart = (e) => {
            e.preventDefault();
            this.state.playerMovingRight = true;
        };
        this.handleInputRelease = (e) => {
            e.preventDefault();
            this.state.playerMovingLeft = false;
            this.state.playerMovingRight = false;
        };
        this.renderFrame = () => {
            this.ballEl.style.transform = `translate(${this.state.ballX}px, ${this.state.ballY}px)`;
            this.playerPaddleEl.style.transform = `translateX(${this.state.playerX}px)`;
            this.aiPaddleEl.style.transform = `translateX(${this.state.aiX}px)`;
        };
    }
    onMount(api) {
        this.mainContainer = api.container;
        this.mainContainer.className = "pong-app";
        const view = document.createElement("div");
        view.className = "pong-view";
        this.scoreEl = document.createElement("div");
        this.scoreEl.className = "pong-score";
        this.arena = document.createElement("div");
        this.arena.className = "pong-arena";
        this.arena.style.width = "100%";
        this.arena.style.maxWidth = "400px";
        this.arena.style.aspectRatio = "3/4";
        this.ballEl = document.createElement("div");
        this.ballEl.className = "pong-ball";
        this.playerPaddleEl = document.createElement("div");
        this.playerPaddleEl.className = "pong-paddle pong-paddle--player";
        this.aiPaddleEl = document.createElement("div");
        this.aiPaddleEl.className = "pong-paddle pong-paddle--ai";
        this.overlayEl = document.createElement("div");
        this.overlayEl.className = "pong-overlay";
        this.arena.appendChild(this.aiPaddleEl);
        this.arena.appendChild(this.ballEl);
        this.arena.appendChild(this.playerPaddleEl);
        this.arena.appendChild(this.overlayEl);
        const controls = document.createElement("div");
        controls.className = "pong-controls";
        this.leftBtn = document.createElement("button");
        this.leftBtn.className = "pong-btn";
        this.leftBtn.textContent = "<";
        this.rightBtn = document.createElement("button");
        this.rightBtn.className = "pong-btn";
        this.rightBtn.textContent = ">";
        this.leftBtn.addEventListener("mousedown", this.handleLeftStart);
        this.leftBtn.addEventListener("touchstart", this.handleLeftStart, { passive: false });
        this.rightBtn.addEventListener("mousedown", this.handleRightStart);
        this.rightBtn.addEventListener("touchstart", this.handleRightStart, { passive: false });
        window.addEventListener("mouseup", this.handleInputRelease);
        window.addEventListener("touchend", this.handleInputRelease);
        window.addEventListener("touchcancel", this.handleInputRelease);
        controls.appendChild(this.leftBtn);
        controls.appendChild(this.rightBtn);
        view.appendChild(this.scoreEl);
        view.appendChild(this.arena);
        view.appendChild(controls);
        this.mainContainer.appendChild(view);
        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const rect = entry.contentRect;
                const scaleX = rect.width / GAME_WIDTH;
                const scaleY = rect.height / GAME_HEIGHT;
                this.ballEl.style.width = `${BALL_SIZE * scaleX}px`;
                this.ballEl.style.height = `${BALL_SIZE * scaleY}px`;
                this.playerPaddleEl.style.height = `${PADDLE_HEIGHT * scaleY}px`;
                this.playerPaddleEl.style.bottom = `${10 * scaleY}px`;
                this.aiPaddleEl.style.height = `${PADDLE_HEIGHT * scaleY}px`;
                this.aiPaddleEl.style.top = `${10 * scaleY}px`;
                this.renderFrame = () => {
                    this.ballEl.style.transform = `translate(${this.state.ballX * scaleX}px, ${this.state.ballY * scaleY}px)`;
                    this.playerPaddleEl.style.transform = `translateX(${this.state.playerX * scaleX}px)`;
                    this.playerPaddleEl.style.width = `${this.state.playerWidth * scaleX}px`;
                    this.aiPaddleEl.style.transform = `translateX(${this.state.aiX * scaleX}px)`;
                    this.aiPaddleEl.style.width = `${this.state.aiWidth * scaleX}px`;
                };
                this.renderFrame();
            }
        });
        this.resizeObserver.observe(this.arena);
        this.initGame();
    }
    onUnmount() {
        this.state.running = false;
        cancelAnimationFrame(this.animationFrameId);
        this.resizeObserver.disconnect();
        this.leftBtn.removeEventListener("mousedown", this.handleLeftStart);
        this.leftBtn.removeEventListener("touchstart", this.handleLeftStart);
        this.rightBtn.removeEventListener("mousedown", this.handleRightStart);
        this.rightBtn.removeEventListener("touchstart", this.handleRightStart);
        window.removeEventListener("mouseup", this.handleInputRelease);
        window.removeEventListener("touchend", this.handleInputRelease);
        window.removeEventListener("touchcancel", this.handleInputRelease);
        this.mainContainer.innerHTML = "";
    }
    resetBall(serveToPlayer) {
        this.state.ballX = GAME_WIDTH / 2 - BALL_SIZE / 2;
        this.state.ballY = GAME_HEIGHT / 2 - BALL_SIZE / 2;
        const angle = (Math.random() - 0.5) * (Math.PI / 4);
        const speed = BALL_SPEED_START;
        this.state.ballVx = Math.sin(angle) * speed;
        this.state.ballVy = Math.cos(angle) * speed * (serveToPlayer ? 1 : -1);
    }
    initGame() {
        this.state.playerScore = 0;
        this.state.aiScore = 0;
        this.state.playerWidth = PADDLE_WIDTH;
        this.state.aiWidth = PADDLE_WIDTH;
        this.state.playerX = GAME_WIDTH / 2 - PADDLE_WIDTH / 2;
        this.state.aiX = GAME_WIDTH / 2 - PADDLE_WIDTH / 2;
        this.state.winner = null;
        this.state.playerMovingLeft = false;
        this.state.playerMovingRight = false;
        this.resetBall(false);
        this.updateScoreDOM();
        this.overlayEl.style.display = "none";
        this.state.running = true;
        this.lastTime = performance.now();
        this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
    }
    stopGame(winner) {
        this.state.running = false;
        this.state.winner = winner;
        this.overlayEl.style.display = "flex";
        this.overlayEl.innerHTML = `
            <div class="pong-win-text">${winner === "PLAYER" ? "YOU WIN" : "AI WINS"}</div>
            <button class="btn-action" id="pong-restart-btn">[ RESTART ]</button>
        `;
        const btn = this.overlayEl.querySelector("#pong-restart-btn");
        if (btn) {
            btn.addEventListener("click", () => {
                this.initGame();
            });
        }
    }
    gameLoop(time) {
        if (!this.state.running)
            return;
        const dt = (time - this.lastTime) / 1000;
        this.lastTime = time;
        this.updatePhysics(Math.min(dt, 0.05));
        this.renderFrame();
        if (this.state.running) {
            this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
        }
    }
    updatePhysics(dt) {
        if (this.state.playerMovingLeft) {
            this.state.playerX -= PADDLE_SPEED * dt;
        }
        if (this.state.playerMovingRight) {
            this.state.playerX += PADDLE_SPEED * dt;
        }
        this.state.playerX = Math.max(0, Math.min(GAME_WIDTH - this.state.playerWidth, this.state.playerX));
        const ballCenterX = this.state.ballX + BALL_SIZE / 2;
        const aiCenterX = this.state.aiX + this.state.aiWidth / 2;
        if (ballCenterX < aiCenterX - 10) {
            this.state.aiX -= AI_SPEED * dt;
        }
        else if (ballCenterX > aiCenterX + 10) {
            this.state.aiX += AI_SPEED * dt;
        }
        this.state.aiX = Math.max(0, Math.min(GAME_WIDTH - this.state.aiWidth, this.state.aiX));
        this.state.ballX += this.state.ballVx * dt;
        this.state.ballY += this.state.ballVy * dt;
        if (this.state.ballX <= 0) {
            this.state.ballX = 0;
            this.state.ballVx *= -1;
        }
        else if (this.state.ballX + BALL_SIZE >= GAME_WIDTH) {
            this.state.ballX = GAME_WIDTH - BALL_SIZE;
            this.state.ballVx *= -1;
        }
        const ballBottom = this.state.ballY + BALL_SIZE;
        const ballTop = this.state.ballY;
        const ballLeft = this.state.ballX;
        const ballRight = this.state.ballX + BALL_SIZE;
        const playerTop = GAME_HEIGHT - PADDLE_HEIGHT - 10;
        if (this.state.ballVy > 0 && ballBottom >= playerTop && ballTop <= playerTop + PADDLE_HEIGHT) {
            if (ballRight >= this.state.playerX && ballLeft <= this.state.playerX + this.state.playerWidth) {
                this.state.ballY = playerTop - BALL_SIZE;
                const intersectX = (this.state.ballX + BALL_SIZE / 2) - (this.state.playerX + this.state.playerWidth / 2);
                const normalizedIntersect = intersectX / (this.state.playerWidth / 2);
                const bounceAngle = normalizedIntersect * MAX_BOUNCE_ANGLE;
                const currentSpeed = Math.sqrt(this.state.ballVx * this.state.ballVx + this.state.ballVy * this.state.ballVy);
                const newSpeed = Math.min(currentSpeed + 25, 400);
                this.state.ballVx = newSpeed * Math.sin(bounceAngle);
                this.state.ballVy = -newSpeed * Math.cos(bounceAngle);
                this.state.playerWidth = Math.max(PADDLE_WIDTH / 4, this.state.playerWidth - 10);
            }
        }
        const aiBottom = 10 + PADDLE_HEIGHT;
        if (this.state.ballVy < 0 && ballTop <= aiBottom && ballBottom >= 10) {
            if (ballRight >= this.state.aiX && ballLeft <= this.state.aiX + this.state.aiWidth) {
                this.state.ballY = aiBottom;
                const intersectX = (this.state.ballX + BALL_SIZE / 2) - (this.state.aiX + this.state.aiWidth / 2);
                const normalizedIntersect = intersectX / (this.state.aiWidth / 2);
                const bounceAngle = normalizedIntersect * MAX_BOUNCE_ANGLE;
                const currentSpeed = Math.sqrt(this.state.ballVx * this.state.ballVx + this.state.ballVy * this.state.ballVy);
                const newSpeed = Math.min(currentSpeed + 25, 400);
                this.state.ballVx = newSpeed * Math.sin(bounceAngle);
                this.state.ballVy = newSpeed * Math.cos(bounceAngle);
                this.state.aiWidth = Math.max(PADDLE_WIDTH / 4, this.state.aiWidth - 10);
            }
        }
        if (this.state.ballY > GAME_HEIGHT) {
            this.state.aiScore++;
            this.state.playerWidth = PADDLE_WIDTH;
            this.state.aiWidth = PADDLE_WIDTH;
            this.updateScoreDOM();
            if (this.state.aiScore >= WIN_SCORE)
                this.stopGame("AI");
            else
                this.resetBall(true);
        }
        else if (this.state.ballY + BALL_SIZE < 0) {
            this.state.playerScore++;
            this.state.playerWidth = PADDLE_WIDTH;
            this.state.aiWidth = PADDLE_WIDTH;
            this.updateScoreDOM();
            if (this.state.playerScore >= WIN_SCORE)
                this.stopGame("PLAYER");
            else
                this.resetBall(false);
        }
    }
    updateScoreDOM() {
        this.scoreEl.textContent = `${this.state.aiScore} - ${this.state.playerScore}`;
    }
}
const pong = {
    manifest: {
        id: "pong",
        title: "PONG",
        command: "PONG.EXE",
        icon: "◓",
        description: "Kinetic trajectory simulation. First to 3.",
        folder: AppFolder.GAMES,
    },
    create: () => new Pong(),
};
export default pong;

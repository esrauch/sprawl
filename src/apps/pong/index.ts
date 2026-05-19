import type { App, AppApi } from "../../apps_api/types.js";
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

let state = {
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
    winner: null as "PLAYER" | "AI" | null,
    playerWidth: PADDLE_WIDTH,
    aiWidth: PADDLE_WIDTH,
};

let lastTime = 0;
let animationFrameId = 0;

// ── DOM Elements ───────────────────────────────────

let mainContainer: HTMLElement;
let arena: HTMLElement;
let ballEl: HTMLElement;
let playerPaddleEl: HTMLElement;
let aiPaddleEl: HTMLElement;
let scoreEl: HTMLElement;
let overlayEl: HTMLElement;

// ── Logic ──────────────────────────────────────────

function resetBall(serveToPlayer: boolean) {
    state.ballX = GAME_WIDTH / 2 - BALL_SIZE / 2;
    state.ballY = GAME_HEIGHT / 2 - BALL_SIZE / 2;
    
    // Serve straight with slight random angle
    const angle = (Math.random() - 0.5) * (Math.PI / 4);
    const speed = BALL_SPEED_START;
    
    state.ballVx = Math.sin(angle) * speed;
    state.ballVy = Math.cos(angle) * speed * (serveToPlayer ? 1 : -1);
}

function initGame() {
    state.playerScore = 0;
    state.aiScore = 0;
    state.playerWidth = PADDLE_WIDTH;
    state.aiWidth = PADDLE_WIDTH;
    state.playerX = GAME_WIDTH / 2 - PADDLE_WIDTH / 2;
    state.aiX = GAME_WIDTH / 2 - PADDLE_WIDTH / 2;
    state.winner = null;
    state.playerMovingLeft = false;
    state.playerMovingRight = false;
    resetBall(false);
    updateScoreDOM();
    overlayEl.style.display = "none";
    state.running = true;
    lastTime = performance.now();
    animationFrameId = requestAnimationFrame(gameLoop);
}

function stopGame(winner: "PLAYER" | "AI") {
    state.running = false;
    state.winner = winner;
    overlayEl.style.display = "flex";
    overlayEl.innerHTML = `
        <div class="pong-win-text">${winner === "PLAYER" ? "YOU WIN" : "AI WINS"}</div>
        <button class="folder-button active" id="pong-restart-btn">[ RESTART ]</button>
    `;
    const btn = overlayEl.querySelector("#pong-restart-btn");
    if (btn) {
        btn.addEventListener("click", () => {
            initGame();
        });
    }
}

function gameLoop(time: number) {
    if (!state.running) return;
    
    const dt = (time - lastTime) / 1000; // delta time in seconds
    lastTime = time;

    updatePhysics(Math.min(dt, 0.05)); // cap dt to prevent huge jumps
    renderFrame();

    if (state.running) {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}

function updatePhysics(dt: number) {
    // Move Player
    if (state.playerMovingLeft) {
        state.playerX -= PADDLE_SPEED * dt;
    }
    if (state.playerMovingRight) {
        state.playerX += PADDLE_SPEED * dt;
    }
    // Clamp Player
    state.playerX = Math.max(0, Math.min(GAME_WIDTH - state.playerWidth, state.playerX));

    // Move AI
    const ballCenterX = state.ballX + BALL_SIZE / 2;
    const aiCenterX = state.aiX + state.aiWidth / 2;
    if (ballCenterX < aiCenterX - 10) {
        state.aiX -= AI_SPEED * dt;
    } else if (ballCenterX > aiCenterX + 10) {
        state.aiX += AI_SPEED * dt;
    }
    // Clamp AI
    state.aiX = Math.max(0, Math.min(GAME_WIDTH - state.aiWidth, state.aiX));

    // Move Ball
    state.ballX += state.ballVx * dt;
    state.ballY += state.ballVy * dt;

    // Wall Collisions (Left/Right)
    if (state.ballX <= 0) {
        state.ballX = 0;
        state.ballVx *= -1;
    } else if (state.ballX + BALL_SIZE >= GAME_WIDTH) {
        state.ballX = GAME_WIDTH - BALL_SIZE;
        state.ballVx *= -1;
    }

    // Paddle Collisions
    const ballBottom = state.ballY + BALL_SIZE;
    const ballTop = state.ballY;
    const ballLeft = state.ballX;
    const ballRight = state.ballX + BALL_SIZE;

    // Player Paddle (Bottom)
    const playerTop = GAME_HEIGHT - PADDLE_HEIGHT - 10;
    if (state.ballVy > 0 && ballBottom >= playerTop && ballTop <= playerTop + PADDLE_HEIGHT) {
        if (ballRight >= state.playerX && ballLeft <= state.playerX + state.playerWidth) {
            state.ballY = playerTop - BALL_SIZE;
            
            // Calculate trajectory
            const intersectX = (state.ballX + BALL_SIZE / 2) - (state.playerX + state.playerWidth / 2);
            const normalizedIntersect = intersectX / (state.playerWidth / 2);
            const bounceAngle = normalizedIntersect * MAX_BOUNCE_ANGLE;
            
            // Increase speed slightly
            const currentSpeed = Math.sqrt(state.ballVx * state.ballVx + state.ballVy * state.ballVy);
            const newSpeed = Math.min(currentSpeed + 25, 400);

            state.ballVx = newSpeed * Math.sin(bounceAngle);
            state.ballVy = -newSpeed * Math.cos(bounceAngle);

            // Shrink paddle
            state.playerWidth = Math.max(PADDLE_WIDTH / 4, state.playerWidth - 10);
        }
    }

    // AI Paddle (Top)
    const aiBottom = 10 + PADDLE_HEIGHT;
    if (state.ballVy < 0 && ballTop <= aiBottom && ballBottom >= 10) {
        if (ballRight >= state.aiX && ballLeft <= state.aiX + state.aiWidth) {
            state.ballY = aiBottom;
            
            const intersectX = (state.ballX + BALL_SIZE / 2) - (state.aiX + state.aiWidth / 2);
            const normalizedIntersect = intersectX / (state.aiWidth / 2);
            const bounceAngle = normalizedIntersect * MAX_BOUNCE_ANGLE;
            
            const currentSpeed = Math.sqrt(state.ballVx * state.ballVx + state.ballVy * state.ballVy);
            const newSpeed = Math.min(currentSpeed + 25, 400);

            state.ballVx = newSpeed * Math.sin(bounceAngle);
            state.ballVy = newSpeed * Math.cos(bounceAngle);

            // Shrink paddle
            state.aiWidth = Math.max(PADDLE_WIDTH / 4, state.aiWidth - 10);
        }
    }

    // Scoring
    if (state.ballY > GAME_HEIGHT) {
        state.aiScore++;
        state.playerWidth = PADDLE_WIDTH;
        state.aiWidth = PADDLE_WIDTH;
        updateScoreDOM();
        if (state.aiScore >= WIN_SCORE) stopGame("AI");
        else resetBall(true); // Player serves
    } else if (state.ballY + BALL_SIZE < 0) {
        state.playerScore++;
        state.playerWidth = PADDLE_WIDTH;
        state.aiWidth = PADDLE_WIDTH;
        updateScoreDOM();
        if (state.playerScore >= WIN_SCORE) stopGame("PLAYER");
        else resetBall(false); // AI serves
    }
}

let renderFrame = () => {
    ballEl.style.transform = `translate(${state.ballX}px, ${state.ballY}px)`;
    playerPaddleEl.style.transform = `translateX(${state.playerX}px)`;
    aiPaddleEl.style.transform = `translateX(${state.aiX}px)`;
};

function updateScoreDOM() {
    scoreEl.textContent = `${state.aiScore} - ${state.playerScore}`;
}

// ── App Setup ──────────────────────────────────────

const pong: App = {
    manifest: {
        id: "pong",
        title: "PONG",
        command: "PONG.EXE",
        icon: "◓",
        description: "Kinetic trajectory simulation. First to 3.",
        folder: AppFolder.GAMES,
    },

    onMount(api: AppApi) {
        mainContainer = api.container;
        mainContainer.className = "pong-app";

        // Layout
        const view = document.createElement("div");
        view.className = "pong-view";

        scoreEl = document.createElement("div");
        scoreEl.className = "pong-score";
        
        arena = document.createElement("div");
        arena.className = "pong-arena";
        // Force specific aspect ratio roughly corresponding to GAME_WIDTH / GAME_HEIGHT
        arena.style.width = "100%";
        arena.style.maxWidth = "400px";
        arena.style.aspectRatio = "3/4";

        ballEl = document.createElement("div");
        ballEl.className = "pong-ball";
        
        playerPaddleEl = document.createElement("div");
        playerPaddleEl.className = "pong-paddle pong-paddle--player";

        aiPaddleEl = document.createElement("div");
        aiPaddleEl.className = "pong-paddle pong-paddle--ai";

        overlayEl = document.createElement("div");
        overlayEl.className = "pong-overlay";

        arena.appendChild(aiPaddleEl);
        arena.appendChild(ballEl);
        arena.appendChild(playerPaddleEl);
        arena.appendChild(overlayEl);

        const controls = document.createElement("div");
        controls.className = "pong-controls";

        const leftBtn = document.createElement("button");
        leftBtn.className = "pong-btn";
        leftBtn.textContent = "<";
        
        const rightBtn = document.createElement("button");
        rightBtn.className = "pong-btn";
        rightBtn.textContent = ">";

        // Touch/Mouse events for controls
        const setLeft = (val: boolean) => (e: Event) => { e.preventDefault(); state.playerMovingLeft = val; };
        const setRight = (val: boolean) => (e: Event) => { e.preventDefault(); state.playerMovingRight = val; };

        leftBtn.addEventListener("mousedown", setLeft(true));
        leftBtn.addEventListener("touchstart", setLeft(true), { passive: false });
        window.addEventListener("mouseup", setLeft(false));
        leftBtn.addEventListener("touchend", setLeft(false));
        leftBtn.addEventListener("touchcancel", setLeft(false));

        rightBtn.addEventListener("mousedown", setRight(true));
        rightBtn.addEventListener("touchstart", setRight(true), { passive: false });
        window.addEventListener("mouseup", setRight(false));
        rightBtn.addEventListener("touchend", setRight(false));
        rightBtn.addEventListener("touchcancel", setRight(false));

        controls.appendChild(leftBtn);
        controls.appendChild(rightBtn);

        view.appendChild(scoreEl);
        view.appendChild(arena);
        view.appendChild(controls);

        mainContainer.appendChild(view);

        // We use a fixed logical coordinate system (300x400) and scale the DOM 
        // to fit the actual size of the arena to avoid responsive math.
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const rect = entry.contentRect;
                const scaleX = rect.width / GAME_WIDTH;
                const scaleY = rect.height / GAME_HEIGHT;
                
                // Scale elements
                ballEl.style.width = `${BALL_SIZE * scaleX}px`;
                ballEl.style.height = `${BALL_SIZE * scaleY}px`;

                playerPaddleEl.style.height = `${PADDLE_HEIGHT * scaleY}px`;
                playerPaddleEl.style.bottom = `${10 * scaleY}px`; // 10px from bottom logically

                aiPaddleEl.style.height = `${PADDLE_HEIGHT * scaleY}px`;
                aiPaddleEl.style.top = `${10 * scaleY}px`; // 10px from top logically

                // Adjust transforms dynamically based on scale
                renderFrame = () => {
                    ballEl.style.transform = `translate(${state.ballX * scaleX}px, ${state.ballY * scaleY}px)`;
                    playerPaddleEl.style.transform = `translateX(${state.playerX * scaleX}px)`;
                    playerPaddleEl.style.width = `${state.playerWidth * scaleX}px`;
                    aiPaddleEl.style.transform = `translateX(${state.aiX * scaleX}px)`;
                    aiPaddleEl.style.width = `${state.aiWidth * scaleX}px`;
                };
                renderFrame();
            }
        });
        resizeObserver.observe(arena);

        initGame();
    },

    onUnmount() {
        state.running = false;
        cancelAnimationFrame(animationFrameId);
        mainContainer.innerHTML = '';
    },
};

export default pong;

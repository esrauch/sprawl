import { AppFolder } from "../../apps_api/types.js";
let mainContainer;
let state = {
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    tableaus: [[], [], [], [], [], [], []],
};
let selection = null;
// ── Logic ────────────────────────────────────────
function initGame() {
    const deck = [];
    for (let suit = 0; suit < 4; suit++) {
        for (let rank = 1; rank <= 13; rank++) {
            deck.push({ suit, rank, faceUp: false });
        }
    }
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    state.foundations = [[], [], [], []];
    state.tableaus = [[], [], [], [], [], [], []];
    state.waste = [];
    // Deal tableaus
    for (let i = 0; i < 7; i++) {
        for (let j = 0; j <= i; j++) {
            const card = deck.pop();
            if (j === i)
                card.faceUp = true;
            state.tableaus[i].push(card);
        }
    }
    state.stock = deck;
    selection = null;
}
function canMove(card, targetTop, zone) {
    if (zone === 'foundation') {
        if (!targetTop)
            return card.rank === 1;
        return card.suit === targetTop.suit && card.rank === targetTop.rank + 1;
    }
    else {
        if (!targetTop)
            return card.rank === 13; // King
        const cardIsRed = card.suit === 1 || card.suit === 3;
        const targetIsRed = targetTop.suit === 1 || targetTop.suit === 3;
        return cardIsRed !== targetIsRed && card.rank === targetTop.rank - 1;
    }
}
function getSelectedCards() {
    if (!selection)
        return [];
    if (selection.zone === 'waste')
        return [state.waste[state.waste.length - 1]];
    if (selection.zone === 'foundation') {
        const pile = state.foundations[selection.index];
        return [pile[pile.length - 1]];
    }
    if (selection.zone === 'tableau') {
        const pile = state.tableaus[selection.index];
        return pile.slice(selection.cardIndex);
    }
    return [];
}
function removeSelectedCards() {
    if (!selection)
        return;
    if (selection.zone === 'waste')
        state.waste.pop();
    if (selection.zone === 'foundation')
        state.foundations[selection.index].pop();
    if (selection.zone === 'tableau') {
        const pile = state.tableaus[selection.index];
        pile.splice(selection.cardIndex);
        // Flip new top card if needed
        if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
            pile[pile.length - 1].faceUp = true;
        }
    }
    selection = null;
}
function tryAutoMoveToFoundation(card) {
    for (let i = 0; i < 4; i++) {
        const pile = state.foundations[i];
        const targetTop = pile.length > 0 ? pile[pile.length - 1] : null;
        if (canMove(card, targetTop, 'foundation')) {
            pile.push(card);
            return true;
        }
    }
    return false;
}
function handleTap(zone, pileIndex, cardIndex) {
    if (selection) {
        const cards = getSelectedCards();
        if (cards.length === 0) {
            selection = null;
            return handleTap(zone, pileIndex, cardIndex);
        }
        if (zone === 'foundation') {
            const pile = state.foundations[pileIndex];
            const targetTop = pile.length > 0 ? pile[pile.length - 1] : null;
            if (cards.length === 1 && canMove(cards[0], targetTop, 'foundation')) {
                pile.push(cards[0]);
                removeSelectedCards();
                renderBoard();
                return;
            }
        }
        else if (zone === 'tableau') {
            if (!(selection.zone === 'tableau' && selection.index === pileIndex)) {
                const pile = state.tableaus[pileIndex];
                const targetTop = pile.length > 0 ? pile[pile.length - 1] : null;
                if (canMove(cards[0], targetTop, 'tableau')) {
                    pile.push(...cards);
                    removeSelectedCards();
                    renderBoard();
                    return;
                }
            }
        }
        selection = null;
    }
    // Fresh tap
    if (zone === 'waste') {
        if (state.waste.length > 0) {
            const top = state.waste[state.waste.length - 1];
            if (tryAutoMoveToFoundation(top)) {
                state.waste.pop();
            }
            else {
                selection = { zone, index: 0 };
            }
        }
    }
    else if (zone === 'foundation') {
        if (state.foundations[pileIndex].length > 0) {
            selection = { zone, index: pileIndex };
        }
    }
    else if (zone === 'tableau') {
        const pile = state.tableaus[pileIndex];
        if (cardIndex >= 0) {
            const card = pile[cardIndex];
            if (card.faceUp) {
                if (cardIndex === pile.length - 1) {
                    if (tryAutoMoveToFoundation(card)) {
                        pile.pop();
                        if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
                            pile[pile.length - 1].faceUp = true;
                        }
                        renderBoard();
                        return;
                    }
                }
                selection = { zone, index: pileIndex, cardIndex };
            }
        }
    }
    renderBoard();
}
function isSelected(zone, index, cardIndex) {
    if (!selection)
        return false;
    if (selection.zone !== zone || selection.index !== index)
        return false;
    if (zone === 'tableau')
        return cardIndex >= selection.cardIndex;
    return true;
}
// ── Rendering ──────────────────────────────────────
function createPlaceholder() {
    const el = document.createElement("div");
    el.className = "solitaire-placeholder";
    return el;
}
function createCardElement(card, selected) {
    const el = document.createElement("div");
    let className = "solitaire-card";
    if (!card.faceUp) {
        className += " facedown";
    }
    else {
        const isRed = card.suit === 1 || card.suit === 3;
        className += isRed ? " red" : " black";
    }
    if (selected)
        className += " selected";
    el.className = className;
    if (card.faceUp) {
        const rankStr = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"][card.rank - 1];
        const suitStr = ["♠", "♥", "♣", "♦"][card.suit];
        const topText = document.createElement("div");
        topText.className = "solitaire-card__top";
        topText.textContent = rankStr;
        const suitText = document.createElement("div");
        suitText.textContent = suitStr;
        el.appendChild(topText);
        el.appendChild(suitText);
    }
    return el;
}
function renderBoard() {
    if (!mainContainer)
        return;
    mainContainer.innerHTML = '';
    // Check for win condition
    if (state.foundations.every(pile => pile.length === 13)) {
        const winEl = document.createElement("div");
        winEl.style.display = "flex";
        winEl.style.flexDirection = "column";
        winEl.style.alignItems = "center";
        winEl.style.justifyContent = "center";
        winEl.style.height = "100%";
        winEl.style.color = "var(--phosphor)";
        winEl.style.fontFamily = "var(--font-mono)";
        winEl.style.fontSize = "1.5rem";
        winEl.style.letterSpacing = "0.2em";
        winEl.style.textAlign = "center";
        winEl.style.gap = "1rem";
        const winText = document.createElement("div");
        winText.textContent = "SEQUENCE COMPLETE";
        const resetBtn = document.createElement("button");
        resetBtn.textContent = "[ RESTART ]";
        resetBtn.className = "folder-button active"; // Reuse existing cool button style
        resetBtn.onclick = () => {
            initGame();
            renderBoard();
        };
        winEl.appendChild(winText);
        winEl.appendChild(resetBtn);
        mainContainer.appendChild(winEl);
        return;
    }
    const layout = document.createElement("div");
    layout.className = "solitaire-layout";
    // --- TOP ROW ---
    const topRow = document.createElement("div");
    topRow.className = "solitaire-row";
    // 0: Stock
    const stockCell = document.createElement("div");
    stockCell.className = "solitaire-cell";
    stockCell.appendChild(createPlaceholder());
    if (state.stock.length > 0) {
        stockCell.appendChild(createCardElement(state.stock[state.stock.length - 1], false));
    }
    stockCell.addEventListener("click", () => {
        if (state.stock.length > 0) {
            const card = state.stock.pop();
            card.faceUp = true;
            state.waste.push(card);
        }
        else {
            state.stock = state.waste.reverse().map(c => ({ ...c, faceUp: false }));
            state.waste = [];
        }
        selection = null;
        renderBoard();
    });
    topRow.appendChild(stockCell);
    // 1: Waste
    const wasteCell = document.createElement("div");
    wasteCell.className = "solitaire-cell";
    wasteCell.appendChild(createPlaceholder());
    if (state.waste.length > 0) {
        const cardEl = createCardElement(state.waste[state.waste.length - 1], isSelected('waste', 0));
        cardEl.addEventListener("click", (e) => { e.stopPropagation(); handleTap('waste', 0, -1); });
        wasteCell.appendChild(cardEl);
    }
    wasteCell.addEventListener("click", () => handleTap('waste', 0, -1));
    topRow.appendChild(wasteCell);
    // 2: Empty
    const emptyCell = document.createElement("div");
    topRow.appendChild(emptyCell);
    // 3..6: Foundations
    for (let i = 0; i < 4; i++) {
        const fCell = document.createElement("div");
        fCell.className = "solitaire-cell";
        fCell.appendChild(createPlaceholder());
        const pile = state.foundations[i];
        if (pile.length > 0) {
            const cardEl = createCardElement(pile[pile.length - 1], isSelected('foundation', i));
            cardEl.addEventListener("click", (e) => { e.stopPropagation(); handleTap('foundation', i, -1); });
            fCell.appendChild(cardEl);
        }
        fCell.addEventListener("click", () => handleTap('foundation', i, -1));
        topRow.appendChild(fCell);
    }
    layout.appendChild(topRow);
    // --- TABLEAUS ---
    const tabRow = document.createElement("div");
    tabRow.className = "solitaire-row";
    for (let i = 0; i < 7; i++) {
        const pile = state.tableaus[i];
        const tCell = document.createElement("div");
        tCell.className = "solitaire-tableau";
        tCell.appendChild(createPlaceholder());
        pile.forEach((card, cIdx) => {
            const sel = isSelected('tableau', i, cIdx);
            const cardEl = createCardElement(card, sel);
            if (cIdx > 0) {
                cardEl.style.marginTop = card.faceUp ? "-105%" : "-125%";
            }
            cardEl.addEventListener("click", (e) => {
                e.stopPropagation();
                handleTap('tableau', i, cIdx);
            });
            tCell.appendChild(cardEl);
        });
        tCell.addEventListener("click", () => handleTap('tableau', i, -1));
        tabRow.appendChild(tCell);
    }
    layout.appendChild(tabRow);
    mainContainer.appendChild(layout);
}
// ── App Module ─────────────────────────────────────
const solitaire = {
    manifest: {
        id: "solitaire",
        title: "SOLITAIRE",
        command: "KLONDIKE.EXE",
        icon: "♠",
        description: "Standard 52-card sorting algorithm.",
        folder: AppFolder.GAMES,
    },
    onMount(api) {
        mainContainer = api.container;
        initGame();
        renderBoard();
    },
    onUnmount() {
        mainContainer.innerHTML = '';
        state.stock = [];
        state.waste = [];
        state.foundations = [[], [], [], []];
        state.tableaus = [[], [], [], [], [], [], []];
        selection = null;
    },
};
export default solitaire;

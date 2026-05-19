import { AppFolder } from "../../apps_api/types.js";
class SolitaireApp {
    constructor() {
        this.container = null;
        this.state = {
            stock: [],
            waste: [],
            foundations: [[], [], [], []],
            tableaus: [[], [], [], [], [], [], []],
        };
        this.selection = null;
    }
    onMount(api) {
        this.container = api.container;
        this.initGame();
        this.renderBoard();
    }
    onUnmount() {
        if (this.container) {
            this.container.innerHTML = "";
        }
        this.container = null;
        this.state = {
            stock: [],
            waste: [],
            foundations: [[], [], [], []],
            tableaus: [[], [], [], [], [], [], []],
        };
        this.selection = null;
    }
    initGame() {
        const deck = [];
        for (let suit = 0; suit < 4; suit++) {
            for (let rank = 1; rank <= 13; rank++) {
                deck.push({ suit, rank, faceUp: false });
            }
        }
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        this.state.foundations = [[], [], [], []];
        this.state.tableaus = [[], [], [], [], [], [], []];
        this.state.waste = [];
        for (let i = 0; i < 7; i++) {
            for (let j = 0; j <= i; j++) {
                const card = deck.pop();
                if (j === i)
                    card.faceUp = true;
                this.state.tableaus[i].push(card);
            }
        }
        this.state.stock = deck;
        this.selection = null;
    }
    canMove(card, targetTop, zone) {
        if (zone === 'foundation') {
            if (!targetTop)
                return card.rank === 1;
            return card.suit === targetTop.suit && card.rank === targetTop.rank + 1;
        }
        if (!targetTop)
            return card.rank === 13;
        const cardIsRed = card.suit === 1 || card.suit === 3;
        const targetIsRed = targetTop.suit === 1 || targetTop.suit === 3;
        return cardIsRed !== targetIsRed && card.rank === targetTop.rank - 1;
    }
    getSelectedCards() {
        if (!this.selection)
            return [];
        if (this.selection.zone === 'waste') {
            return [this.state.waste[this.state.waste.length - 1]];
        }
        if (this.selection.zone === 'foundation') {
            const pile = this.state.foundations[this.selection.index];
            return [pile[pile.length - 1]];
        }
        const pile = this.state.tableaus[this.selection.index];
        return pile.slice(this.selection.cardIndex);
    }
    removeSelectedCards() {
        if (!this.selection)
            return;
        if (this.selection.zone === 'waste') {
            this.state.waste.pop();
        }
        else if (this.selection.zone === 'foundation') {
            this.state.foundations[this.selection.index].pop();
        }
        else {
            const pile = this.state.tableaus[this.selection.index];
            pile.splice(this.selection.cardIndex);
            if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
                pile[pile.length - 1].faceUp = true;
            }
        }
        this.selection = null;
    }
    tryAutoMoveToFoundation(card) {
        for (let i = 0; i < 4; i++) {
            const pile = this.state.foundations[i];
            const targetTop = pile.length > 0 ? pile[pile.length - 1] : null;
            if (this.canMove(card, targetTop, 'foundation')) {
                pile.push(card);
                return true;
            }
        }
        return false;
    }
    handleTap(zone, pileIndex, cardIndex) {
        if (this.selection) {
            const cards = this.getSelectedCards();
            if (cards.length === 0) {
                this.selection = null;
                return this.handleTap(zone, pileIndex, cardIndex);
            }
            if (zone === 'foundation') {
                const pile = this.state.foundations[pileIndex];
                const targetTop = pile.length > 0 ? pile[pile.length - 1] : null;
                if (cards.length === 1 && this.canMove(cards[0], targetTop, 'foundation')) {
                    pile.push(cards[0]);
                    this.removeSelectedCards();
                    this.renderBoard();
                    return;
                }
            }
            else if (zone === 'tableau') {
                if (!(this.selection.zone === 'tableau' && this.selection.index === pileIndex)) {
                    const pile = this.state.tableaus[pileIndex];
                    const targetTop = pile.length > 0 ? pile[pile.length - 1] : null;
                    if (this.canMove(cards[0], targetTop, 'tableau')) {
                        pile.push(...cards);
                        this.removeSelectedCards();
                        this.renderBoard();
                        return;
                    }
                }
            }
            this.selection = null;
        }
        if (zone === 'waste') {
            if (this.state.waste.length > 0) {
                const top = this.state.waste[this.state.waste.length - 1];
                if (this.tryAutoMoveToFoundation(top)) {
                    this.state.waste.pop();
                }
                else {
                    this.selection = { zone, index: 0 };
                }
            }
        }
        else if (zone === 'foundation') {
            if (this.state.foundations[pileIndex].length > 0) {
                this.selection = { zone, index: pileIndex };
            }
        }
        else if (zone === 'tableau') {
            const pile = this.state.tableaus[pileIndex];
            if (cardIndex >= 0) {
                const card = pile[cardIndex];
                if (card.faceUp) {
                    if (cardIndex === pile.length - 1) {
                        if (this.tryAutoMoveToFoundation(card)) {
                            pile.pop();
                            if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
                                pile[pile.length - 1].faceUp = true;
                            }
                            this.renderBoard();
                            return;
                        }
                    }
                    this.selection = { zone, index: pileIndex, cardIndex };
                }
            }
        }
        this.renderBoard();
    }
    isSelected(zone, index, cardIndex) {
        if (!this.selection)
            return false;
        if (this.selection.zone !== zone || this.selection.index !== index)
            return false;
        if (zone === 'tableau')
            return cardIndex >= this.selection.cardIndex;
        return true;
    }
    createPlaceholder() {
        const el = document.createElement("div");
        el.className = "solitaire-placeholder";
        return el;
    }
    createCardElement(card, selected) {
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
    renderBoard() {
        if (!this.container)
            return;
        this.container.innerHTML = "";
        if (this.state.foundations.every(pile => pile.length === 13)) {
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
            resetBtn.className = "btn-action";
            resetBtn.onclick = () => {
                this.initGame();
                this.renderBoard();
            };
            winEl.appendChild(winText);
            winEl.appendChild(resetBtn);
            this.container.appendChild(winEl);
            return;
        }
        const layout = document.createElement("div");
        layout.className = "solitaire-layout";
        const topRow = document.createElement("div");
        topRow.className = "solitaire-row";
        const stockCell = document.createElement("div");
        stockCell.className = "solitaire-cell";
        stockCell.appendChild(this.createPlaceholder());
        if (this.state.stock.length > 0) {
            stockCell.appendChild(this.createCardElement(this.state.stock[this.state.stock.length - 1], false));
        }
        stockCell.addEventListener("click", () => {
            if (this.state.stock.length > 0) {
                const card = this.state.stock.pop();
                card.faceUp = true;
                this.state.waste.push(card);
            }
            else {
                this.state.stock = this.state.waste.reverse().map(c => ({ ...c, faceUp: false }));
                this.state.waste = [];
            }
            this.selection = null;
            this.renderBoard();
        });
        topRow.appendChild(stockCell);
        const wasteCell = document.createElement("div");
        wasteCell.className = "solitaire-cell";
        wasteCell.appendChild(this.createPlaceholder());
        if (this.state.waste.length > 0) {
            const cardEl = this.createCardElement(this.state.waste[this.state.waste.length - 1], this.isSelected('waste', 0));
            cardEl.addEventListener("click", (e) => { e.stopPropagation(); this.handleTap('waste', 0, -1); });
            wasteCell.appendChild(cardEl);
        }
        wasteCell.addEventListener("click", () => this.handleTap('waste', 0, -1));
        topRow.appendChild(wasteCell);
        const emptyCell = document.createElement("div");
        topRow.appendChild(emptyCell);
        for (let i = 0; i < 4; i++) {
            const fCell = document.createElement("div");
            fCell.className = "solitaire-cell";
            fCell.appendChild(this.createPlaceholder());
            const pile = this.state.foundations[i];
            if (pile.length > 0) {
                const cardEl = this.createCardElement(pile[pile.length - 1], this.isSelected('foundation', i));
                cardEl.addEventListener("click", (e) => { e.stopPropagation(); this.handleTap('foundation', i, -1); });
                fCell.appendChild(cardEl);
            }
            fCell.addEventListener("click", () => this.handleTap('foundation', i, -1));
            topRow.appendChild(fCell);
        }
        layout.appendChild(topRow);
        const tabRow = document.createElement("div");
        tabRow.className = "solitaire-row";
        for (let i = 0; i < 7; i++) {
            const pile = this.state.tableaus[i];
            const tCell = document.createElement("div");
            tCell.className = "solitaire-tableau";
            tCell.appendChild(this.createPlaceholder());
            pile.forEach((card, cIdx) => {
                const sel = this.isSelected('tableau', i, cIdx);
                const cardEl = this.createCardElement(card, sel);
                if (cIdx > 0) {
                    cardEl.style.marginTop = card.faceUp ? "-105%" : "-125%";
                }
                cardEl.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.handleTap('tableau', i, cIdx);
                });
                tCell.appendChild(cardEl);
            });
            tCell.addEventListener("click", () => this.handleTap('tableau', i, -1));
            tabRow.appendChild(tCell);
        }
        layout.appendChild(tabRow);
        this.container.appendChild(layout);
    }
}
const solitaire = {
    manifest: {
        id: "solitaire",
        title: "SOLITAIRE",
        command: "KLONDIKE.EXE",
        icon: "♠",
        description: "Standard 52-card sorting algorithm.",
        folder: AppFolder.GAMES,
    },
    create: () => new SolitaireApp(),
};
export default solitaire;

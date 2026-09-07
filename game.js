(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const opponents = [
    { name: 'BamBam22', rating: 1449, initials: 'BB', cls: 'alt2' },
    { name: 'QueenTile', rating: 1503, initials: 'QT', cls: 'alt3' },
    { name: 'MahjMama', rating: 1521, initials: 'MM', cls: 'alt4' }
  ];
  const passes = [
    { label: 'First Charleston · Pass Right', offset: 1 },
    { label: 'First Charleston · Pass Across', offset: 2 },
    { label: 'First Charleston · Pass Left', offset: 3 }
  ];

  const S = {
    deck: [],
    hands: [[], [], [], []],
    discards: [],
    selected: new Set(),
    phase: 'lobby',
    charlestonStep: 0,
    currentPlayer: 0,
    userHasDrawn: false,
    feed: [],
    sound: true,
    timers: []
  };

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function makeSet() {
    const tiles = [];
    let id = 0;
    for (const suit of ['bam', 'crak', 'dot']) {
      for (let rank = 1; rank <= 9; rank++) {
        for (let c = 0; c < 4; c++) {
          const pretty = suit === 'bam' ? 'Bam' : suit === 'crak' ? 'Crak' : 'Dot';
          tiles.push({ id: id++, suit, rank, label: `${rank} ${pretty}` });
        }
      }
    }
    for (const rank of ['E', 'S', 'W', 'N']) {
      for (let c = 0; c < 4; c++) tiles.push({ id: id++, suit: 'wind', rank, label: `${rank} Wind` });
    }
    for (const rank of ['R', 'G', '0']) {
      for (let c = 0; c < 4; c++) {
        const label = rank === 'R' ? 'Red Dragon' : rank === 'G' ? 'Green Dragon' : 'Soap';
        tiles.push({ id: id++, suit: 'dragon', rank, label });
      }
    }
    for (let rank = 1; rank <= 8; rank++) tiles.push({ id: id++, suit: 'flower', rank, label: `Flower ${rank}` });
    for (let rank = 1; rank <= 8; rank++) tiles.push({ id: id++, suit: 'joker', rank, label: 'Joker' });
    return tiles;
  }

  function suitOrder(tile) {
    return ({ bam: 1, crak: 2, dot: 3, wind: 4, dragon: 5, flower: 6, joker: 7 })[tile.suit] || 9;
  }

  function sortHand(hand) {
    hand.sort((a, b) => {
      const suitDiff = suitOrder(a) - suitOrder(b);
      if (suitDiff) return suitDiff;
      if (typeof a.rank === 'number' && typeof b.rank === 'number') return a.rank - b.rank;
      return String(a.rank).localeCompare(String(b.rank));
    });
  }

  function symbol(tile) {
    if (tile.suit === 'bam') return '竹';
    if (tile.suit === 'crak') return '萬';
    if (tile.suit === 'dot') return '●';
    if (tile.suit === 'wind') return tile.rank;
    if (tile.suit === 'dragon') return tile.rank === 'R' ? '中' : tile.rank === 'G' ? '發' : '□';
    if (tile.suit === 'flower') return '✿';
    return 'JOKER';
  }

  function tileHTML(tile) {
    const number = ['bam', 'crak', 'dot'].includes(tile.suit) ? `<span class="tile-number">${tile.rank}</span>` : '';
    return `<div class="tile-inner">${number}<span class="tile-suit">${symbol(tile)}</span></div>`;
  }

  function addFeed(who, msg) {
    S.feed.unshift({ who, msg });
    S.feed = S.feed.slice(0, 14);
  }

  function renderFeed() {
    $('#tableFeed').innerHTML = S.feed.map(x => `<div class="feed-item"><strong>${x.who}</strong> ${x.msg}</div>`).join('');
  }

  function renderHands() {
    const rack = $('#playerRack');
    rack.innerHTML = '';
    S.hands[0].forEach(tile => {
      const el = document.createElement('div');
      el.className = `tile ${tile.suit}${S.selected.has(tile.id) ? ' selected' : ''}`;
      el.dataset.id = String(tile.id);
      el.innerHTML = tileHTML(tile);
      el.addEventListener('click', () => selectTile(tile.id));
      rack.appendChild(el);
    });

    for (let p = 1; p < 4; p++) {
      $(`#rack${p}`).innerHTML = S.hands[p].map(() => '<div class="tile"></div>').join('');
    }
  }

  function renderDiscards() {
    $('#discardField').innerHTML = S.discards.map(x =>
      `<div class="tile ${x.tile.suit}" title="${x.tile.label}">${tileHTML(x.tile)}</div>`
    ).join('');
  }

  function analyze(hand) {
    const counts = new Map();
    const suits = { bam: 0, crak: 0, dot: 0 };
    hand.forEach(tile => {
      const key = `${tile.suit}:${tile.rank}`;
      counts.set(key, (counts.get(key) || 0) + 1);
      if (Object.prototype.hasOwnProperty.call(suits, tile.suit)) suits[tile.suit]++;
    });
    let pairs = 0;
    counts.forEach(v => { if (v >= 2) pairs++; });
    const best = Object.entries(suits).sort((a, b) => b[1] - a[1])[0];
    return {
      pairs,
      best: ({ bam: 'Bams', crak: 'Craks', dot: 'Dots' })[best[0]],
      flex: Math.min(99, 45 + pairs * 8 + best[1] * 3)
    };
  }

  function suggest(hand) {
    const count = new Map();
    hand.forEach(tile => {
      const key = `${tile.suit}:${tile.rank}`;
      count.set(key, (count.get(key) || 0) + 1);
    });
    const ranked = hand.filter(t => t.suit !== 'joker').map(tile => {
      let keep = ((count.get(`${tile.suit}:${tile.rank}`) || 0) - 1) * 25;
      if (['bam', 'crak', 'dot'].includes(tile.suit)) {
        keep += hand.filter(x => x.suit === tile.suit && typeof x.rank === 'number' && Math.abs(x.rank - tile.rank) <= 2).length * 4;
      }
      if (tile.suit === 'flower') keep += 4;
      return { tile, keep };
    }).sort((a, b) => a.keep - b.keep);
    return ranked.length ? ranked[0].tile : hand[0];
  }

  function renderCoach() {
    const a = analyze(S.hands[0]);
    $('#pairCount').textContent = String(a.pairs);
    $('#bestSuit').textContent = a.best;
    $('#flexScore').textContent = `${a.flex}%`;

    let msg = '';
    if (S.phase === 'charleston') {
      msg = S.selected.size
        ? `${S.selected.size}/3 selected. ${S.selected.size === 3 ? 'Your pass is ready.' : `Choose ${3 - S.selected.size} more.`}`
        : `Select three tiles to pass. Preserve pairs and Jokers; your strongest numbered suit is ${a.best}.`;
    } else if (S.phase === 'play') {
      if (S.currentPlayer !== 0) msg = 'Watch the table while the other players take their turns.';
      else if (!S.userHasDrawn) msg = 'Draw from the wall to begin your turn.';
      else {
        const tile = suggest(S.hands[0]);
        msg = `Consider discarding ${tile.label}. It currently contributes the least to pairs and nearby runs.`;
      }
    } else {
      msg = 'Start a table to receive live suggestions.';
    }
    $('#coachText').textContent = msg;
  }

  function renderPhase() {
    const button = $('#primaryActionBtn');
    if (S.phase === 'charleston') {
      const pass = passes[S.charlestonStep];
      $('#phaseLabel').textContent = pass.label;
      button.textContent = 'Pass 3 Tiles';
      button.disabled = S.selected.size !== 3;
      $('#turnOrb').textContent = 'C';
      return;
    }

    if (S.phase === 'play') {
      if (S.currentPlayer === 0) {
        $('#phaseLabel').textContent = S.userHasDrawn ? 'Your turn · Choose a discard' : 'Your turn · Draw';
        button.textContent = S.userHasDrawn ? 'Discard Tile' : 'Draw Tile';
        button.disabled = S.userHasDrawn ? S.selected.size !== 1 : false;
        $('#turnOrb').textContent = 'BG';
      } else {
        const opponent = opponents[S.currentPlayer - 1];
        $('#phaseLabel').textContent = `${opponent.name}'s turn`;
        button.textContent = 'Waiting…';
        button.disabled = true;
        $('#turnOrb').textContent = opponent.initials;
      }
      return;
    }

    $('#phaseLabel').textContent = 'Hand complete';
    button.textContent = 'Return to Lobby';
    button.disabled = false;
  }

  function updateWall() {
    $('#wallCount').textContent = String(S.deck.length);
    $('#wallMeter').style.width = `${Math.max(0, Math.min(100, S.deck.length))}%`;
  }

  function render() {
    renderHands();
    renderDiscards();
    renderFeed();
    renderPhase();
    renderCoach();
    updateWall();
  }

  function selectTile(id) {
    if (S.phase === 'charleston') {
      if (S.selected.has(id)) S.selected.delete(id);
      else if (S.selected.size < 3) S.selected.add(id);
    } else if (S.phase === 'play' && S.currentPlayer === 0 && S.userHasDrawn) {
      S.selected.clear();
      S.selected.add(id);
    }
    renderHands();
    renderPhase();
    renderCoach();
    tone(430, 0.018);
  }

  function botPass(hand) {
    return shuffle(hand.filter(t => t.suit !== 'joker').slice()).slice(0, 3);
  }

  function doPass() {
    if (S.selected.size !== 3) return;
    const offset = passes[S.charlestonStep].offset;
    const outgoing = S.hands.map((hand, player) => player === 0 ? hand.filter(t => S.selected.has(t.id)) : botPass(hand));
    const incoming = [[], [], [], []];

    for (let p = 0; p < 4; p++) incoming[(p + offset) % 4] = outgoing[p];
    for (let p = 0; p < 4; p++) {
      const ids = new Set(outgoing[p].map(t => t.id));
      S.hands[p] = S.hands[p].filter(t => !ids.has(t.id)).concat(incoming[p]);
      sortHand(S.hands[p]);
    }

    addFeed('Charleston', passes[S.charlestonStep].label.replace('First Charleston · ', '') + ' complete.');
    S.selected.clear();
    S.charlestonStep++;
    tone(560, 0.025);

    if (S.charlestonStep >= passes.length) {
      S.phase = 'play';
      S.currentPlayer = 0;
      S.userHasDrawn = false;
      addFeed('Table', 'Charleston complete. Your turn begins.');
    }
    render();
  }

  function drawTile(player) {
    if (!S.deck.length) {
      S.phase = 'ended';
      addFeed('Table', 'The wall is exhausted. Hand ends in a draw.');
      render();
      return null;
    }
    const tile = S.deck.pop();
    S.hands[player].push(tile);
    return tile;
  }

  function playerDraw() {
    const tile = drawTile(0);
    if (!tile) return;
    S.userHasDrawn = true;
    sortHand(S.hands[0]);
    addFeed('Brandon', 'drew a tile.');
    tone(620, 0.02);
    render();
  }

  function playerDiscard() {
    const id = [...S.selected][0];
    const index = S.hands[0].findIndex(t => t.id === id);
    if (index < 0) return;
    const [tile] = S.hands[0].splice(index, 1);
    S.discards.push({ player: 0, tile });
    S.selected.clear();
    S.userHasDrawn = false;
    addFeed('Brandon', `discarded ${tile.label}.`);
    tone(220, 0.025);
    S.currentPlayer = 1;
    render();
    botTurn();
  }

  function botChoice(hand) {
    const count = new Map();
    hand.forEach(t => count.set(`${t.suit}:${t.rank}`, (count.get(`${t.suit}:${t.rank}`) || 0) + 1));
    return hand.map(tile => {
      let score = tile.suit === 'joker' ? 100 : tile.suit === 'flower' ? 10 : 0;
      score += ((count.get(`${tile.suit}:${tile.rank}`) || 0) - 1) * 20;
      if (['bam', 'crak', 'dot'].includes(tile.suit)) {
        score += hand.filter(x => x.suit === tile.suit && typeof x.rank === 'number' && Math.abs(x.rank - tile.rank) <= 2).length * 4;
      }
      return { tile, score };
    }).sort((a, b) => a.score - b.score)[0].tile;
  }

  function botTurn() {
    if (S.phase !== 'play' || S.currentPlayer === 0) return;
    const timer = setTimeout(() => {
      const player = S.currentPlayer;
      const drawn = drawTile(player);
      if (!drawn || S.phase !== 'play') return;
      const discard = botChoice(S.hands[player]);
      const index = S.hands[player].findIndex(x => x.id === discard.id);
      S.hands[player].splice(index, 1);
      S.discards.push({ player, tile: discard });
      addFeed(opponents[player - 1].name, `discarded ${discard.label}.`);
      tone(190 + player * 55, 0.015);
      S.currentPlayer = (player + 1) % 4;
      if (S.currentPlayer === 0) S.userHasDrawn = false;
      render();
      if (S.currentPlayer !== 0) botTurn();
    }, 650 + Math.random() * 500);
    S.timers.push(timer);
  }

  function primaryAction() {
    if (S.phase === 'charleston') doPass();
    else if (S.phase === 'play' && S.currentPlayer === 0) {
      if (!S.userHasDrawn) playerDraw();
      else playerDiscard();
    } else if (S.phase === 'ended') returnLobby();
  }

  function showSuggestion() {
    if (S.phase === 'charleston') {
      S.selected.clear();
      const copy = S.hands[0].filter(t => t.suit !== 'joker');
      const picks = [];
      for (let n = 0; n < 3 && copy.length; n++) {
        const tile = suggest(copy);
        picks.push(tile);
        copy.splice(copy.findIndex(x => x.id === tile.id), 1);
      }
      picks.forEach(t => S.selected.add(t.id));
      toast('Suggested Charleston pass selected.');
    } else if (S.phase === 'play' && S.currentPlayer === 0 && S.userHasDrawn) {
      const tile = suggest(S.hands[0]);
      S.selected.clear();
      S.selected.add(tile.id);
      toast(`Suggestion: discard ${tile.label}.`);
    } else {
      toast('A suggestion appears when you have a decision.');
    }
    renderHands();
    renderPhase();
    renderCoach();
  }

  function startGame() {
    S.timers.forEach(clearTimeout);
    S.timers = [];
    S.deck = shuffle(makeSet());
    S.hands = [[], [], [], []];
    for (let round = 0; round < 13; round++) {
      for (let player = 0; player < 4; player++) S.hands[player].push(S.deck.pop());
    }
    S.hands.forEach(sortHand);
    S.discards = [];
    S.selected.clear();
    S.phase = 'charleston';
    S.charlestonStep = 0;
    S.currentPlayer = 0;
    S.userHasDrawn = false;
    S.feed = [];
    addFeed('Table', 'Tiles dealt. First Charleston begins.');
    $('#matchModal').classList.remove('open');
    $('#matchModal').setAttribute('aria-hidden', 'true');
    $('#lobbyView').classList.remove('active');
    $('#gameView').classList.add('active');
    render();
    tone(700, 0.03);
  }

  function startMatch(practice = false) {
    const modal = $('#matchModal');
    const list = $('#matchList');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    $('#matchTitle').textContent = practice ? 'Preparing practice table…' : 'Finding your table…';
    $('#matchSubtitle').textContent = practice ? 'Three club bots are taking their seats.' : 'Searching for players within ±100 rating.';
    list.innerHTML = '';
    S.timers.forEach(clearTimeout);
    S.timers = [];

    opponents.forEach((opponent, i) => {
      const timer = setTimeout(() => {
        list.insertAdjacentHTML('beforeend', `<div class="match-player"><div class="match-player-left"><div class="avatar ${opponent.cls}">${opponent.initials}</div><strong>${opponent.name}</strong></div><span>${practice ? 'Club bot' : opponent.rating}</span></div>`);
        tone(440 + i * 70, 0.015);
        if (i === 2) {
          $('#matchTitle').textContent = 'Table found';
          $('#matchSubtitle').textContent = practice ? 'Practice table ready.' : 'All four seats are filled.';
          S.timers.push(setTimeout(startGame, 650));
        }
      }, 350 + i * 520);
      S.timers.push(timer);
    });
  }

  function returnLobby() {
    S.timers.forEach(clearTimeout);
    S.timers = [];
    S.phase = 'lobby';
    $('#gameView').classList.remove('active');
    $('#lobbyView').classList.add('active');
    $('#matchModal').classList.remove('open');
    $('#matchModal').setAttribute('aria-hidden', 'true');
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 1700);
  }

  function tone(freq = 440, vol = 0.02) {
    if (!S.sound) return;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      const ctx = new AudioCtor();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = freq;
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.08);
    } catch (_) {}
  }

  function init() {
    $('#quickMatchBtn').addEventListener('click', () => startMatch(false));
    $('#quickModeCard').addEventListener('click', () => startMatch(false));
    $('#practiceBtn').addEventListener('click', () => startMatch(true));
    $('#friendModeCard').addEventListener('click', () => toast('Private tables are next when the multiplayer backend is connected.'));
    $('#cancelMatchBtn').addEventListener('click', returnLobby);
    $('#primaryActionBtn').addEventListener('click', primaryAction);
    $('#sortBtn').addEventListener('click', () => { sortHand(S.hands[0]); renderHands(); toast('Hand sorted.'); });
    $('#suggestBtn').addEventListener('click', showSuggestion);
    $('#leaveGameBtn').addEventListener('click', returnLobby);
    $('#brandHome').addEventListener('click', returnLobby);
    $('#soundToggle').addEventListener('click', () => {
      S.sound = !S.sound;
      $('#soundToggle').textContent = S.sound ? '♪' : '×';
      toast(S.sound ? 'Sound on' : 'Sound off');
    });
    console.info('Mahj Society prototype ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
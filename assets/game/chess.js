(function (root) {
  'use strict';

  function makeChessEngine() {
    const values = { p: 100, n: 320, b: 334, r: 505, q: 955, k: 20000 };
    const phases = { p: 0, n: 1, b: 1, r: 2, q: 4, k: 0 };
    const promotionIds = { q: 1, r: 2, b: 3, n: 4 };
    const squares = Array.from({ length: 128 }, (_, i) => i)
      .filter(i => (i & 0x88) === 0);
    const squareName = index => 'abcdefgh'[index & 7] + (8 - (index >> 4));
    const moveKey = move => (move.from << 11) | (move.to << 4) | (promotionIds[move.promotion] || 0);
    const moveText = move => squareName(move.from) + squareName(move.to) + (move.promotion || '');
    const mateScore = 30000;
    const timeout = {};

    function evaluate(game) {
      let middle = 0;
      let ending = 0;
      let phase = 0;
      let whiteBishops = 0;
      let blackBishops = 0;
      let whiteFiles = 0;
      let blackFiles = 0;
      const board = game._board;

      for (const square of squares) {
        const piece = board[square];
        if (!piece) continue;
        const { color, type } = piece;
        const sign = color === 'w' ? 1 : -1;
        const file = square & 7;
        const boardRank = square >> 4;
        const advance = color === 'w' ? 7 - boardRank : boardRank;
        const fileCenter = 7 - Math.abs(2 * file - 7);
        const rankCenter = 7 - Math.abs(2 * boardRank - 7);
        const center = fileCenter + rankCenter;
        const material = type === 'k' ? 0 : values[type];
        phase += phases[type];
        middle += sign * material;
        ending += sign * material;

        switch (type) {
          case 'p': {
            const shift = file * 3;
            const files = color === 'w' ? whiteFiles : blackFiles;
            if ((files >> shift) & 7) {
              middle -= sign * 14;
              ending -= sign * 21;
            }
            if (color === 'w') whiteFiles += 1 << shift;
            else blackFiles += 1 << shift;
            middle += sign * (advance * 5 + fileCenter * (advance <= 3 ? 4 : 1));
            ending += sign * (advance * advance * 3 + fileCenter);
            break;
          }
          case 'n':
            middle += sign * (center * 7 - (advance === 0 ? 19 : 0));
            ending += sign * center * 4;
            break;
          case 'b':
            if (color === 'w') whiteBishops += 1;
            else blackBishops += 1;
            middle += sign * (center * 4 + Math.min(advance, 4) * 4);
            ending += sign * center * 3;
            break;
          case 'r':
            middle += sign * (advance === 6 ? 17 : fileCenter * 2);
            ending += sign * (advance * 4 + fileCenter);
            break;
          case 'q':
            middle += sign * (center * 2 - Math.max(0, advance - 3) * 5);
            ending += sign * center * 4;
            break;
          case 'k':
            middle += sign * (advance === 0 && (file === 2 || file === 6) ? 42 : -center * 5 - advance * 8);
            ending += sign * center * 7;
            break;
        }
      }
      const pair = Number(whiteBishops >= 2) - Number(blackBishops >= 2);
      middle += pair * 24;
      ending += pair * 36;
      for (const square of squares) {
        const piece = board[square];
        if (!piece || (piece.type !== 'p' && piece.type !== 'r')) continue;
        const file = square & 7;
        const ownFiles = piece.color === 'w' ? whiteFiles : blackFiles;
        const enemyFiles = piece.color === 'w' ? blackFiles : whiteFiles;
        const shift = file * 3;
        const sign = piece.color === 'w' ? 1 : -1;
        if (piece.type === 'r') {
          if (((ownFiles >> shift) & 7) === 0) middle += sign * 15;
          if (((enemyFiles >> shift) & 7) === 0) ending += sign * 11;
          continue;
        }
        const neighbors = ((ownFiles >> Math.max(0, shift - 3)) & (file ? 7 : 0)) |
          ((ownFiles >> (shift + 3)) & (file < 7 ? 7 : 0));
        if (!neighbors) {
          middle -= sign * 11;
          ending -= sign * 13;
        }
        const ahead = piece.color === 'w' ? -16 : 16;
        const advance = piece.color === 'w' ? 7 - (square >> 4) : square >> 4;
        if (advance < 3) continue;
        let passed = true;
        for (let rank = square + ahead; (rank & 0x88) === 0; rank += ahead) {
          for (const offset of [-1, 0, 1]) {
            const enemy = (rank + offset) & 0x88 ? null : board[rank + offset];
            if (enemy?.type === 'p' && enemy.color !== piece.color) passed = false;
          }
          if (!passed) break;
        }
        if (passed) ending += sign * advance * advance * 3;
      }
      phase = Math.min(24, phase);
      const score = Math.round((middle * phase + ending * (24 - phase)) / 24);
      return (game.turn() === 'w' ? score : -score) + 11;
    }

    function playDanil(game, { ms = 950, maxDepth = 12 } = {}) {
      const start = performance.now();
      const deadline = start + ms;
      const table = new Map();
      const positions = new Map();
      const killers = [];
      const history = new Int32Array(128 * 128);
      let nodes = 0;
      const legal = game._moves();
      if (!legal.length) return { move: null, depth: 0, nodes, ms: 0 };
      if (legal.length === 1) return { move: moveText(legal[0]), depth: 1, nodes, ms: 0 };
      let bestMove = legal[0];
      let reached = 0;

      function checkTime() {
        nodes += 1;
        if ((nodes & 127) === 0 && performance.now() >= deadline) throw timeout;
      }
      function scoreMove(move, prefer, ply) {
        const id = moveKey(move);
        if (id === prefer) return 1000000;
        if (move.promotion) return 150000 + values[move.promotion] * 40 + (values[move.captured] || 0);
        if (move.captured) return 100000 + values[move.captured] * 20 - values[move.piece];
        if (id === killers[ply]) return 80000;
        return history[move.from * 128 + move.to];
      }
      function rankMoves(moves, prefer, ply) {
        return moves.map(move => ({ move, score: scoreMove(move, prefer, ply) }))
          .sort((a, b) => b.score - a.score);
      }
      function play(move, fn) {
        game._makeMove(move);
        const hash = game._hash;
        const recent = positions.get(hash) || 0;
        positions.set(hash, recent + 1);
        try {
          return fn();
        } finally {
          if (recent) positions.set(hash, recent);
          else positions.delete(hash);
          game._undoMove();
        }
      }
      function repetition(hash) {
        return game._getPositionCount(hash) + (positions.get(hash) || 0);
      }
      function draw(hash, checked) {
        return repetition(hash) >= 3 || (!checked && game._halfMoves >= 100);
      }
      function quiet(alpha, beta, ply, remaining) {
        checkTime();
        const checked = game.isCheck();
        if (draw(game._hash, checked)) return 0;
        if (remaining <= -1) return evaluate(game);
        if (!checked) {
          const stand = evaluate(game);
          if (stand >= beta) return stand;
          alpha = Math.max(alpha, stand);
          if (remaining === 0) return alpha;
        }
        const turn = game.turn();
        const moves = game._moves({ legal: false });
        const candidates = checked ? moves : moves.filter(move => move.captured || move.promotion);
        let examined = 0;
        for (const { move } of rankMoves(candidates, 0, ply)) {
          const score = play(move, () => game._isKingAttacked(turn) ? null : -quiet(-beta, -alpha, ply + 1, remaining - 1));
          if (score === null) continue;
          examined += 1;
          if (score >= beta) return score;
          alpha = Math.max(alpha, score);
        }
        return checked && examined === 0 ? -mateScore + ply : alpha;
      }
      function search(depth, alpha, beta, ply) {
        if (depth <= 0) return quiet(alpha, beta, ply, 5);
        checkTime();
        const checked = game.isCheck();
        const hash = game._hash;
        if (draw(hash, checked) || game.isInsufficientMaterial()) return 0;
        const fromScore = alpha;
        const cached = table.get(hash);
        if (cached && cached.depth >= depth && repetition(hash) < 2 && game._halfMoves < 90 &&
            Math.abs(cached.score) < mateScore - 100) {
          if (cached.bound === 'exact') return cached.score;
          if (cached.bound === 'high' && cached.score >= beta) return cached.score;
          if (cached.bound === 'low' && cached.score <= alpha) return cached.score;
        }
        const turn = game.turn();
        const moves = game._moves({ legal: false });
        let best = -Infinity;
        let good = 0;
        for (const { move } of rankMoves(moves, cached?.move || 0, ply)) {
          const score = play(move, () => game._isKingAttacked(turn) ? null : -search(depth - 1, -beta, -alpha, ply + 1));
          if (score === null) continue;
          if (score > best) {
            best = score;
            good = moveKey(move);
          }
          alpha = Math.max(alpha, score);
          if (alpha < beta) continue;
          if (!move.captured && !move.promotion) {
            killers[ply] = good;
            const key = move.from * 128 + move.to;
            history[key] = Math.min(60000, history[key] + depth * depth);
          }
          break;
        }
        if (best === -Infinity) return checked ? -mateScore + ply : 0;
        if (table.size < 150000) {
          table.set(hash, { depth, score: best, move: good, bound: best <= fromScore ? 'low' : best >= beta ? 'high' : 'exact' });
        }
        return best;
      }

      for (let depth = 1; depth <= maxDepth && performance.now() < deadline; depth += 1) {
        try {
          let candidate = bestMove;
          let top = -Infinity;
          for (const { move } of rankMoves(legal, moveKey(bestMove), 0)) {
            const score = play(move, () => -search(depth - 1, -Infinity, -top, 1));
            if (score > top) {
              top = score;
              candidate = move;
            }
          }
          bestMove = candidate;
          reached = depth;
          if (top >= mateScore - 80) break;
        } catch (error) {
          if (error !== timeout) throw error;
          break;
        }
      }
      return { move: moveText(bestMove), depth: reached, nodes, ms: Math.round(performance.now() - start) };
    }

    function playKolya(game, seed = '') {
      const moves = game._moves();
      if (!moves.length) return null;
      let hash = 2166136261;
      for (const ch of seed + game.fen()) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
      function sample() {
        hash = (Math.imul(hash, 1664525) + 1013904223) | 0;
        return (hash >>> 0) / 4294967296;
      }
      const takes = moves.filter(move => move.promotion === 'q' || move.captured);
      const pool = takes.length && sample() < .32 ? takes : moves;
      return moveText(pool[Math.floor(sample() * pool.length)]);
    }

    return { playDanil, playKolya };
  }

  function moveInput(code) {
    if (typeof code !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(code)) return null;
    const from = code.slice(0, 2);
    const to = code.slice(2, 4);
    return code.length === 5 ? { from, to, promotion: code[4] } : { from, to };
  }

  function chessResult(game) {
    if (game.isCheckmate()) return { outcome: game.turn() === 'b' ? 'win' : 'loss', reason: 'checkmate' };
    if (game.isStalemate()) return { outcome: 'draw', reason: 'stalemate' };
    if (game.isInsufficientMaterial()) return { outcome: 'draw', reason: 'insufficient-material' };
    if (game.isThreefoldRepetition()) return { outcome: 'draw', reason: 'repetition' };
    if (game.isDrawByFiftyMoves()) return { outcome: 'draw', reason: 'fifty-move' };
    return null;
  }

  function restoredMatch(Chess, opponent, saved) {
    const empty = () => ({
      game: new Chess(),
      record: {
        version: 1, opponent, matchId: root.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2),
        moves: [], result: null, reported: false,
      },
    });
    if (saved?.version !== 1 || saved.opponent !== opponent ||
        typeof saved.matchId !== 'string' || !saved.matchId || saved.matchId.length > 120 ||
        !Array.isArray(saved.moves) || saved.moves.length > 2048) return empty();

    const game = new Chess();
    try {
      for (const code of saved.moves) {
        const input = moveInput(code);
        if (!input || game.isGameOver()) return empty();
        game.move(input);
      }
    } catch {
      return empty();
    }
    const result = chessResult(game) ||
      (saved.result?.reason === 'resign' && saved.result.outcome === 'loss' ? { outcome: 'loss', reason: 'resign' } : null);
    return {
      game,
      record: {
        version: 1, opponent, matchId: saved.matchId, moves: [...saved.moves], result,
        reported: saved.reported === true && result?.outcome === saved.result?.outcome &&
          result?.reason === saved.result?.reason && Boolean(result),
      },
    };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { makeChessEngine, moveInput, restoredMatch, chessResult };
    return;
  }

  const piecePath = (color, type) => 'assets/game/pieces/' + color + type.toUpperCase() + '.svg';
  const names = { k: 'Король', q: 'Ферзь', r: 'Ладья', b: 'Слон', n: 'Конь', p: 'Пешка' };
  const opponentNames = { danil: 'Данил', kolya: 'Коля' };
  const drawText = {
    stalemate: 'Пат.',
    repetition: 'Позиция повторилась трижды.',
    'insufficient-material': 'Фигур недостаточно для мата.',
    'fifty-move': 'Пятьдесят ходов подряд без взятия и хода пешкой.',
  };
  let rules;

  function createWorker() {
    if (!root.Worker || !root.URL?.createObjectURL) return null;
    const source = [
      'const rules = {};',
      '(' + root.NovelChessRules.toString() + ')(rules);',
      'const engine = (' + makeChessEngine.toString() + ')();',
      'const readMove = ' + moveInput.toString() + ';',
      'self.onmessage = ({data}) => {',
      '  const game = new rules.Chess();',
      '  for (const move of data.moves) game.move(readMove(move));',
      '  const move = data.opponent === "danil" ? engine.playDanil(game).move : engine.playKolya(game, data.matchId);',
      '  self.postMessage({ticket: data.ticket, move});',
      '};',
    ].join('\n');
    const url = root.URL.createObjectURL(new root.Blob([source], { type: 'text/javascript' }));
    try {
      return new root.Worker(url);
    } catch {
      return null;
    } finally {
      root.URL.revokeObjectURL(url);
    }
  }

  function mount({ container, opponent, saved, onSave = () => {}, onMove = () => {}, onFinish = () => {}, onExit = () => {} }) {
    if (!container?.replaceChildren) throw new TypeError('NovelChess.mount expects a container.');
    if (!Object.hasOwn(opponentNames, opponent)) throw new RangeError('Unknown chess opponent.');
    if (!rules) {
      rules = {};
      root.NovelChessRules(rules);
    }
    const { game, record } = restoredMatch(rules.Chess, opponent, saved);
    const engine = makeChessEngine();
    const document = container.ownerDocument;
    const title = opponentNames[opponent];
    let worker = null;
    let workerFailed = false;
    let active = true;
    let ticket = 0;
    let thinkTimer = 0;
    let watchdog = 0;
    let selected = null;
    let candidates = [];
    let requestedPromotion = null;
    let resignArmed = false;
    let last = moveInput(record.moves.at(-1));
    let tacticalMoves = [];
    const cells = new Map();

    function node(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }
    function button(parent, text, action, className) {
      const control = node('button', className, text);
      control.type = 'button';
      control.addEventListener('click', action);
      parent.append(control);
      return control;
    }

    const shell = node('section', 'novel-chess');
    shell.setAttribute('aria-label', 'Шахматы с персонажем');
    const board = node('div', 'novel-chess__board');
    board.setAttribute('aria-label', 'Шахматная доска. Вы играете белыми.');
    const sidebar = node('aside', 'novel-chess__sidebar');
    const heading = node('h2', 'novel-chess__heading', 'Шахматы');
    const subheading = node('p', 'novel-chess__opponent', 'Соперник — ' + title + ' · Вы играете белыми');
    const status = node('p', 'novel-chess__status');
    status.setAttribute('role', 'status');
    const movesMade = node('p', 'novel-chess__moves');
    const prompt = node('div', 'novel-chess__prompt');
    const actions = node('div', 'novel-chess__actions');
    const resign = button(actions, 'Сдаться', () => {
      resignArmed = true;
      clearSelection();
      render();
      prompt.querySelector('button')?.focus();
    });
    const leaveButton = button(actions, 'Выйти из партии', leave, 'novel-chess__leave');
    sidebar.append(heading, subheading, status, movesMade, prompt, actions);
    shell.append(board, sidebar);

    function snapshot() {
      return { ...record, moves: [...record.moves], result: record.result ? { ...record.result } : null };
    }
    function persist() {
      if (active) onSave(snapshot());
    }
    function announce() {
      if (!active || !record.result || record.reported) return;
      onFinish({ ...record.result, opponent, matchId: record.matchId, ply: record.moves.length });
      record.reported = true;
      persist();
    }
    function dispose() {
      if (!active) return;
      active = false;
      root.clearTimeout(thinkTimer);
      root.clearTimeout(watchdog);
      worker?.terminate();
      worker = null;
      shell.remove();
    }
    function leave() {
      if (!active) return;
      persist();
      const value = snapshot();
      dispose();
      onExit(value);
    }
    function clearSelection() {
      selected = null;
      candidates = [];
      requestedPromotion = null;
    }
    function statusText() {
      if (record.result?.outcome === 'draw') return 'Ничья. ' + drawText[record.result.reason];
      if (record.result?.reason === 'resign') return 'Вы сдались. ' + title + ' выиграл.';
      if (record.result) return record.result.outcome === 'win' ? 'Мат. Вы выиграли.' : 'Мат. ' + title + ' выиграл.';
      if (game.turn() === 'b') return title + ' обдумывает ход…';
      if (requestedPromotion) return 'Выберите фигуру для превращения.';
      return game.isCheck() ? 'Ваш ход. Королю объявлен шах.' : 'Ваш ход.';
    }
    function refreshLegalMoves() {
      tacticalMoves = !record.result && game.turn() === 'w' ? game.moves({ verbose: true }) : [];
    }
    function renderPrompt() {
      prompt.replaceChildren();
      prompt.hidden = !resignArmed && !requestedPromotion;
      if (resignArmed) {
        prompt.append(node('p', '', 'Сдаться в этой партии?'));
        button(prompt, 'Подтвердить сдачу', () => conclude({ outcome: 'loss', reason: 'resign' }));
        button(prompt, 'Отмена', () => {
          resignArmed = false;
          render();
          resign.focus();
        });
        return;
      }
      if (!requestedPromotion) return;
      const { from, to, options } = requestedPromotion;
      prompt.append(node('p', '', 'Превратить пешку'));
      for (const piece of ['q', 'r', 'b', 'n']) {
        if (!options.includes(piece)) continue;
         const pick = button(prompt, names[piece], () => {
          if (takeMove({ from, to, promotion: piece })) cells.get(to)?.focus();
        }, 'novel-chess__promotion');
         const icon = node('img', 'novel-chess__promotion-piece');
         icon.alt = '';
         icon.src = piecePath('w', piece);
         pick.prepend(icon);
        pick.setAttribute('aria-label', names[piece]);
      }
      button(prompt, 'Отмена', () => {
        requestedPromotion = null;
        render();
        cells.get(from)?.focus();
      });
    }
    function render() {
      for (const [square, cell] of cells) {
        const piece = game.get(square);
        const pieceView = cell.querySelector('.novel-chess__piece');
        const imagePath = piece && piecePath(piece.color, piece.type);
        if (imagePath && pieceView.getAttribute('src') !== imagePath) pieceView.src = imagePath;
        if (!imagePath) pieceView.removeAttribute('src');
        pieceView.hidden = !piece;
        cell.classList.toggle('is-selected', square === selected);
        cell.classList.toggle('is-target', candidates.some(move => move.to === square));
        cell.classList.toggle('is-capture', Boolean(piece) && candidates.some(move => move.to === square));
        cell.classList.toggle('is-last', square === last?.from || square === last?.to);
        cell.classList.toggle('is-check', piece?.type === 'k' && piece.color === game.turn() && game.isCheck());
        cell.setAttribute('aria-pressed', String(square === selected));
        cell.setAttribute('aria-label', square + (piece ? ', ' + names[piece.type] + (piece.color === 'w' ? ', белые' : ', чёрные') : ''));
        cell.setAttribute('aria-disabled', String(Boolean(record.result) || game.turn() !== 'w'));
      }
      status.textContent = statusText();
      movesMade.textContent = record.moves.length ? 'Ходов в партии — ' + record.moves.length : '';
      resign.hidden = Boolean(record.result) || resignArmed;
      leaveButton.textContent = record.result ? 'Продолжить' : 'Выйти из партии';
      renderPrompt();
    }
    function conclude(result) {
      if (!active || record.result) return;
      record.result = result;
      resignArmed = false;
      clearSelection();
      root.clearTimeout(thinkTimer);
      root.clearTimeout(watchdog);
      refreshLegalMoves();
      render();
      persist();
      announce();
    }
    function takeMove(input) {
      if (!active || !input || record.result) return false;
      let played;
      try { played = game.move(input); } catch { return false; }
      record.moves.push(played.from + played.to + (played.promotion || ''));
      onMove(played);
      last = { from: played.from, to: played.to };
      clearSelection();
      const result = chessResult(game);
      if (result) {
        conclude(result);
      } else {
        refreshLegalMoves();
        render();
        persist();
        if (game.turn() === 'b') scheduleBot();
      }
      return true;
    }
    function fallbackBot() {
      if (!active || record.result || game.turn() !== 'b') return;
      const code = opponent === 'danil' ? engine.playDanil(game, { ms: 190, maxDepth: 5 }).move : engine.playKolya(game, record.matchId);
      if (!takeMove(moveInput(code))) {
        const legal = game.moves({ verbose: true })[0];
        if (legal) takeMove(legal);
        else if (chessResult(game)) conclude(chessResult(game));
      }
    }
    function deactivateWorker() {
      root.clearTimeout(watchdog);
      workerFailed = true;
      worker?.terminate();
      worker = null;
    }
    function scheduleBot() {
      root.clearTimeout(thinkTimer);
      thinkTimer = root.setTimeout(() => {
        if (!active || record.result || game.turn() !== 'b') return;
        if (!worker && !workerFailed) worker = createWorker();
        if (!worker) return fallbackBot();
        const turnTicket = ++ticket;
        worker.onmessage = ({ data }) => {
          if (!active || data.ticket !== turnTicket || record.result || game.turn() !== 'b') return;
          root.clearTimeout(watchdog);
          if (!takeMove(moveInput(data.move))) {
            deactivateWorker();
            fallbackBot();
          }
        };
        worker.onerror = event => {
          event.preventDefault();
          deactivateWorker();
          fallbackBot();
        };
        watchdog = root.setTimeout(() => {
          deactivateWorker();
          fallbackBot();
        }, 4200);
        worker.postMessage({ ticket: turnTicket, moves: record.moves, opponent, matchId: record.matchId });
      }, opponent === 'kolya' ? 320 : 180);
    }
    function activate(square) {
      if (!active || resignArmed || requestedPromotion || record.result || game.turn() !== 'w') return;
      const destinations = candidates.filter(move => move.to === square);
      if (destinations.length > 1 && destinations.every(move => move.promotion)) {
        requestedPromotion = { from: selected, to: square, options: destinations.map(move => move.promotion) };
        render();
        prompt.querySelector('button')?.focus();
        return;
      }
      if (destinations.length === 1) {
        takeMove(destinations[0]);
        return;
      }
      if (selected === square || game.get(square)?.color !== 'w') {
        clearSelection();
      } else {
        selected = square;
        candidates = tacticalMoves.filter(move => move.from === square);
      }
      render();
    }
    function focusSquare(square) {
      for (const [key, cell] of cells) cell.tabIndex = key === square ? 0 : -1;
    }
    for (let rank = 8; rank >= 1; rank -= 1) {
      for (let file = 0; file < 8; file += 1) {
        const square = 'abcdefgh'[file] + rank;
        const cell = button(board, '', () => activate(square), 'novel-chess__square');
        cell.dataset.square = square;
        cell.dataset.shade = (file + rank) % 2 ? 'dark' : 'light';
        const pieceView = node('img', 'novel-chess__piece');
        pieceView.alt = '';
        pieceView.draggable = false;
        cell.append(pieceView);
        if (file === 0) cell.append(node('span', 'novel-chess__rank', String(rank)));
        if (rank === 1) cell.append(node('span', 'novel-chess__file', square[0]));
        for (const part of cell.children) part.setAttribute('aria-hidden', 'true');
        cell.addEventListener('focus', () => focusSquare(square));
        cell.addEventListener('keydown', event => {
          const offset = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
          if (!offset) return;
          event.preventDefault();
          const column = Math.max(0, Math.min(7, file + offset[0]));
          const row = Math.max(1, Math.min(8, rank + offset[1]));
          cells.get('abcdefgh'[column] + row).focus();
        });
        cells.set(square, cell);
      }
    }
    focusSquare('e2');
    container.replaceChildren(shell);
    refreshLegalMoves();
    render();
    root.queueMicrotask(() => {
      if (!active) return;
      persist();
      announce();
      if (!record.result && game.turn() === 'b') scheduleBot();
    });
    return dispose;
  }

  root.NovelChess = { mount };
})(globalThis);

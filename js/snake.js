(function () {
  function game() {
    const canvas = document.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const scoreEl = document.querySelector("#score");
    const bestEl = document.querySelector("#best");
    const overlay = document.querySelector("#overlay");
    const heading = document.querySelector("#heading");
    const start = document.querySelector("#start");
    const pause = document.querySelector("#pause");
    const size = 20,
      cell = 20;
    let snake,
      direction,
      next,
      food,
      score = 0,
      best = 0,
      timer,
      state = "ready",
      turned = false;
    function spawnFood() {
      const free = [];
      for (let x = 0; x < size; x++)
        for (let y = 0; y < size; y++) {
          if (!snake.some((p) => p.x === x && p.y === y)) free.push({ x, y });
        }
      return free[Math.floor(Math.random() * free.length)];
    }
    function reset() {
      snake = [
        { x: 8, y: 10 },
        { x: 7, y: 10 },
        { x: 6, y: 10 },
      ];
      direction = { x: 1, y: 0 };
      next = direction;
      turned = false;
      score = 0;
      scoreEl.textContent = "00";
      food = spawnFood();
      draw();
    }
    const board = document.createElement("canvas");
    board.width = board.height = size * cell;
    const background = board.getContext("2d");
    background.fillStyle = "#f0f3e9";
    background.fillRect(0, 0, board.width, board.height);
    background.fillStyle = "#dce3d0";
    for (let x = 0; x < size; x++)
      for (let y = 0; y < size; y++) {
        background.beginPath();
        background.arc(x * cell + 10, y * cell + 10, 1, 0, Math.PI * 2);
        background.fill();
      }
    function draw() {
      ctx.drawImage(board, 0, 0);
      if (food) {
        ctx.fillStyle = "#e58a65";
        ctx.beginPath();
        ctx.arc(food.x * cell + 10, food.y * cell + 10, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#607755";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(food.x * cell + 10, food.y * cell + 4);
        ctx.lineTo(food.x * cell + 13, food.y * cell + 1);
        ctx.stroke();
      }
      snake.forEach((p, i) => {
        ctx.fillStyle = i === 0 ? "#345c40" : "#6e9460";
        ctx.beginPath();
        ctx.roundRect(p.x * cell + 1, p.y * cell + 1, 18, 18, i === 0 ? 6 : 4);
        ctx.fill();
        if (i === 0) {
          ctx.fillStyle = "#fcfcf5";
          const vertical = direction.y !== 0;
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.arc(
              p.x * cell + 10 + (vertical ? side * 4 : direction.x * 4),
              p.y * cell + 10 + (vertical ? direction.y * 4 : side * 4),
              1.7,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
        }
      });
    }
    function end(won = false) {
      clearInterval(timer);
      state = "over";
      overlay.hidden = false;
      heading.textContent = won ? "你赢了！" : "再来一局？";
      document.querySelector("#sub").textContent = "本次得分 " + score + " · 每一次尝试，都离纪录更近";
      start.textContent = "重新开始 ↗";
      pause.textContent = "暂停";
    }
    function tick() {
      direction = next;
      turned = false;
      const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
      const eating = food && head.x === food.x && head.y === food.y;
      const body = eating ? snake : snake.slice(0, -1);
      if (
        head.x < 0 ||
        head.y < 0 ||
        head.x >= size ||
        head.y >= size ||
        body.some((p) => p.x === head.x && p.y === head.y)
      )
        return end();
      snake.unshift(head);
      if (eating) {
        score += 10;
        best = Math.max(score, best);
        scoreEl.textContent = String(score).padStart(2, "0");
        bestEl.textContent = String(best).padStart(2, "0");
        food = spawnFood();
        if (!food) {
          draw();
          return end(true);
        }
      } else snake.pop();
      draw();
    }
    function begin() {
      if (state !== "paused") reset();
      state = "playing";
      overlay.hidden = true;
      pause.textContent = "暂停";
      clearInterval(timer);
      timer = setInterval(tick, 135);
      canvas.focus();
    }
    function toggle() {
      if (state === "playing") {
        clearInterval(timer);
        state = "paused";
        overlay.hidden = false;
        heading.textContent = "休息一下";
        document.querySelector("#sub").textContent = "按空格或点击按钮继续";
        start.textContent = "继续游戏 ↗";
        pause.textContent = "继续";
      } else if (state === "paused") begin();
    }
    function turn(key) {
      const directions = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 },
        s: { x: 0, y: 1 },
        a: { x: -1, y: 0 },
        d: { x: 1, y: 0 },
      };
      const d = directions[key];
      if (d && !turned && state === "playing" && !(d.x === -direction.x && d.y === -direction.y)) {
        next = d;
        turned = true;
      }
    }
    document.addEventListener("keydown", (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "w", "a", "s", "d"].includes(event.key))
        event.preventDefault();
      if (event.key === " ") {
        if (state === "ready" || state === "over") begin();
        else toggle();
      } else turn(event.key);
    });
    document
      .querySelectorAll("[data-key]")
      .forEach((button) => button.addEventListener("click", () => turn(button.dataset.key)));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && state === "playing") toggle();
    });
    window.addEventListener("blur", () => {
      if (state === "playing") toggle();
    });
    start.addEventListener("click", begin);
    pause.addEventListener("click", toggle);
    document.querySelector("#restart").addEventListener("click", () => {
      state = "ready";
      begin();
    });
    reset();
  }
  globalThis.ZpiSnake = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">
<title>Little Snake · Made with ZPI</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#fafbf7;color:#354631;font-family:system-ui,-apple-system,sans-serif;padding:25px 23px 18px}main{max-width:420px;margin:auto}.eyebrow{font-size:9px;letter-spacing:2px;color:#85927c;text-transform:uppercase;display:flex;align-items:center;gap:7px}.dot{width:5px;height:5px;background:#739361;border-radius:50%}header{display:flex;align-items:center;justify-content:space-between;margin:17px 0}h1{font-family:Georgia,serif;font-size:29px;font-weight:400;letter-spacing:-1px;margin:0}h1 span{color:#8b9e76}.scores{display:flex;gap:20px}.scores small{display:block;color:#8a9382;font-size:8px;letter-spacing:1.2px;margin-bottom:4px}.scores b{font-family:monospace;font-size:22px;font-weight:400}.board{position:relative;width:min(100%,max(150px,calc(100dvh - 225px)));margin-inline:auto;border:1px solid #dfe5d5;border-radius:12px;overflow:hidden;padding:7px;background:#f0f3e9}canvas{width:100%;display:block;aspect-ratio:1;outline:none;border-radius:6px}#overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f0f3e9c9;backdrop-filter:blur(3px);padding:12px;text-align:center}#overlay[hidden]{display:none}.snake-icon{font-size:38px}h2{font-size:21px;font-weight:500;margin:14px 0 4px}p{font-size:10px;color:#7a8770;line-height:1.7}button{cursor:pointer;font:inherit;border:0}#start{background:#3f6245;color:#fff;border-radius:7px;padding:11px 20px;font-size:11px;margin-top:12px}footer{display:flex;justify-content:space-between;align-items:center;margin-top:15px;font-size:9px;color:#8b9483}.actions{display:flex;gap:5px}.actions button{background:#edf0e6;color:#66765d;padding:5px 8px;border-radius:4px;font-size:9px}.keys{display:flex;justify-content:center;gap:6px;margin-top:16px}.keys button{border:1px solid #e0e5d8;border-radius:5px;background:white;color:#697e5b;width:30px;height:28px}.credit{text-align:center;font-size:8px;letter-spacing:1.3px;margin-top:20px;color:#a1aa97}button:focus-visible{outline:2px solid #587947;outline-offset:3px}@media(max-width:320px){body{padding:16px 12px}h1{font-size:24px}.scores{gap:10px}}@media(max-height:440px){body{padding:14px 18px}.eyebrow{font-size:8px}header{margin:10px 0}h1{font-size:25px}.board{width:min(100%,max(120px,calc(100dvh - 155px)))}.credit{display:none}.keys{margin-top:10px}footer{margin-top:10px;font-size:8px}}
@media(max-height:360px){body{padding:9px 12px}.eyebrow,.snake-icon,.credit{display:none}header{margin:0 0 8px}#overlay{padding:6px}#overlay h2{font-size:15px;line-height:1.25;margin:0}#sub{margin:3px 0;line-height:1.3}#start{margin-top:5px;padding:7px 12px}.board{width:min(100%,max(140px,calc(100dvh - 118px)))}}
@media(max-width:240px){.snake-icon{font-size:20px}#overlay h2{margin-top:0}#sub{margin:4px 0}#start{margin-top:5px}}
@media(min-width:400px) and (max-height:360px){main{display:grid;grid-template-columns:minmax(135px,.8fr) minmax(0,1.4fr);grid-template-areas:"head board" "foot board" "keys board";align-items:center;gap:5px 14px;max-width:520px}header{grid-area:head;display:block}.scores{margin-top:8px}footer{grid-area:foot;display:block}.actions{margin-top:5px}.keys{grid-area:keys;margin:0;justify-content:start}.board{grid-area:board;width:min(100%,calc(100dvh - 20px))}}
</style></head><body><main>
<div class="eyebrow"><span class="dot"></span> A little game, a little joy</div>
<header><h1>Little <span>Snake.</span></h1><div class="scores"><div><small>SCORE</small><b id="score">00</b></div><div><small>BEST</small><b id="best">00</b></div></div></header>
<div class="board"><canvas width="400" height="400" tabindex="0" aria-label="贪吃蛇游戏画布"></canvas><div id="overlay"><span class="snake-icon">〰</span><h2 id="heading">准备好出发了吗？</h2><p id="sub">吃掉果实，慢慢长大。别碰到自己和边界。</p><button id="start">开始游戏 ↗</button></div></div>
<footer><span>方向键 / WASD 移动 · 空格暂停</span><div class="actions"><button id="pause">暂停</button><button id="restart">重开</button></div></footer>
<div class="keys" aria-label="触屏方向控制"><button data-key="ArrowLeft" aria-label="向左">←</button><button data-key="ArrowUp" aria-label="向上">↑</button><button data-key="ArrowDown" aria-label="向下">↓</button><button data-key="ArrowRight" aria-label="向右">→</button></div>
<div class="credit">BUILT WITH ZPI · JUST ONE PROMPT</div>
</main><script>(${game.toString()})();<\/script></body></html>`;
})();

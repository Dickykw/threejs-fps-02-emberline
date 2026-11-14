// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score, alive dots,
// kill feed, bomb status and the one overlay panel (start, paused, buy, round, match,
// dead). It never touches the simulation; main.js pushes numbers in and reads the play
// and buy callbacks out. Every setter caches its last value and skips a redundant DOM
// write.
const COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'Foundry Yard. Plant the bomb at A or B, or eliminate Slate. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBERLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
};

export function createHud() {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const play = document.getElementById('play');
  const buyList = document.getElementById('buy-list');
  const crosshair = document.getElementById('crosshair');
  const hitmarker = document.getElementById('hitmarker');
  const damageFlash = document.getElementById('damage-flash');
  const healthFill = document.getElementById('health-fill');
  const healthValue = document.getElementById('health-value');
  const armorValue = document.getElementById('armor-value');
  const ammo = document.getElementById('ammo');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const weaponName = document.getElementById('weapon-name');
  const moneyValue = document.getElementById('money-value');
  const timerValue = document.getElementById('timer-value');
  const scoreEmber = document.getElementById('score-ember');
  const scoreSlate = document.getElementById('score-slate');
  const roundLabel = document.getElementById('round-label');
  const aliveEmber = document.getElementById('alive-ember');
  const aliveSlate = document.getElementById('alive-slate');
  const killfeed = document.getElementById('killfeed');
  const bombStatus = document.getElementById('bomb-status');
  const message = document.getElementById('message');
  const plantBar = document.getElementById('plant-bar');
  const plantFill = document.getElementById('plant-fill');

  let hitTimer = 0;
  let messageTimer = 0;
  let damageTimer = 0;
  const last = { mag: -1, reserve: -1, hp: -1, armor: -1, money: -1, timer: '', score: '', alive: '', weapon: '', bomb: '' };

  function dots(element, alive, total, cls) {
    const key = `${alive}/${total}`;
    if (last[cls] === key) return;
    last[cls] = key;
    let html = '';
    for (let i = 0; i < total; i += 1) html += `<i class="${i < alive ? 'on' : ''}"></i>`;
    element.innerHTML = html;
  }

  return {
    setAmmo(mag, reserve, name) {
      if (mag === last.mag && reserve === last.reserve && name === last.weapon) return;
      last.mag = mag;
      last.reserve = reserve;
      last.weapon = name;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = name;
      ammo.classList.toggle('empty', mag === 0);
    },
    setHealth(hp, armor) {
      if (hp === last.hp && armor === last.armor) return;
      last.hp = hp;
      last.armor = armor;
      healthFill.style.width = `${Math.max(0, hp)}%`;
      healthValue.textContent = String(Math.ceil(hp));
      armorValue.textContent = armor > 0 ? `+${Math.ceil(armor)}` : '';
    },
    setMoney(value) {
      if (value === last.money) return;
      last.money = value;
      moneyValue.textContent = `$${value}`;
    },
    setTimer(seconds, phase) {
      const text = phase === 'buy' ? `BUY ${Math.ceil(seconds)}` : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
      if (text === last.timer) return;
      last.timer = text;
      timerValue.textContent = text;
      timerValue.classList.toggle('urgent', phase === 'playing' && seconds <= 15);
    },
    setScore(ember, slate, round) {
      const text = `${ember}-${slate} R${round}`;
      if (text === last.score) return;
      last.score = text;
      scoreEmber.textContent = String(ember);
      scoreSlate.textContent = String(slate);
      roundLabel.textContent = `ROUND ${round}`;
    },
    setAlive(emberAlive, slateAlive) {
      dots(aliveEmber, emberAlive, 3, 'aliveE');
      dots(aliveSlate, slateAlive, 4, 'aliveS');
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    damageFlash() {
      damageFlash.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => damageFlash.classList.remove('on'), 220);
    },
    killFeed(text) {
      const entry = document.createElement('div');
      entry.textContent = text;
      killfeed.prepend(entry);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => entry.remove(), 4500);
    },
    showMessage(text, holdMs = 2600) {
      message.textContent = text;
      message.classList.add('on');
      clearTimeout(messageTimer);
      messageTimer = setTimeout(() => message.classList.remove('on'), holdMs);
    },
    setBomb(text) {
      if (text === last.bomb) return;
      last.bomb = text;
      bombStatus.textContent = text;
      bombStatus.classList.toggle('on', text.length > 0);
    },
    setPlant(progress) {
      if (progress <= 0) {
        plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      plantFill.style.width = `${Math.min(100, progress * 100)}%`;
    },
    showOverlay(mode, data) {
      if (mode === 'buy') {
        title.textContent = `Buy phase — Round ${data.round}`;
        copy.textContent = `Spend your $${data.money} before the round starts. Keys 1–4 buy, B closes.`;
        play.textContent = 'Deploy';
      } else if (mode === 'round') {
        title.textContent = data.winner === 'ember' ? 'Round won' : 'Round lost';
        copy.textContent = `${data.reason}. Ember ${data.ember} — ${data.slate} Slate.`;
        play.textContent = data.matchOver ? 'See results' : 'Next round';
      } else if (mode === 'match') {
        title.textContent = data.winner === 'ember' ? 'Match won' : data.winner === 'draw' ? 'Match drawn' : 'Match lost';
        copy.textContent = `Final: Ember ${data.ember} — ${data.slate} Slate.`;
        play.textContent = 'Play again';
      } else if (mode === 'dead') {
        title.textContent = 'You are down';
        copy.textContent = 'Your squad fights on. Next round starts soon.';
        play.textContent = 'Wait for next round';
      } else {
        const text = COPY[mode] || COPY.start;
        title.textContent = text.title;
        copy.textContent = text.copy;
        play.textContent = text.action;
      }
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    renderBuy(items, money, onBuy) {
      buyList.innerHTML = '';
      for (const item of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-item';
        button.disabled = item.owned || money < item.price;
        button.innerHTML = `<b>${item.key}</b> ${item.label} <span>$${item.price}</span>${item.owned ? ' — owned' : ''}`;
        button.addEventListener('click', () => onBuy(item.id));
        buyList.appendChild(button);
      }
    },
  };
}

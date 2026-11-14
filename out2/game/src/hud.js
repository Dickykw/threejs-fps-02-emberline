// HUD: every DOM readout — crosshair, health, ammo, money, timer, score, alive
// dots, kill feed, bomb status, plant bar, buy menu and overlays. All lookups are
// guarded, so a missing element is skipped instead of throwing.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    hud: $('hud'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    hpFill: $('hp-fill'),
    hpNum: $('hp-num'),
    armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'),
    ammoRes: $('ammo-res'),
    weaponName: $('weapon-name'),
    money: $('money'),
    timer: $('timer'),
    scoreEmber: $('score-ember'),
    scoreSlate: $('score-slate'),
    roundNum: $('round-num'),
    aliveEmber: $('alive-ember'),
    aliveSlate: $('alive-slate'),
    killfeed: $('killfeed'),
    bombStatus: $('bomb-status'),
    plantBar: $('plant-bar'),
    plantFill: $('plant-fill'),
    buyMenu: $('buy-menu'),
    buyItems: $('buy-items'),
    buyMoney: $('buy-money'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayText: $('overlay-text'),
    overlayBtn: $('overlay-btn'),
    banner: $('banner'),
    bannerText: $('banner-text'),
    bannerSub: $('banner-sub'),
  };
  let hitT = 0;
  let bannerT = 0;

  function dots(el, count, total, color) {
    if (!el) return;
    let html = '';
    for (let i = 0; i < total; i++) {
      html += `<span class="dot${i < count ? ' on' : ''}" style="${i < count ? `background:${color}` : ''}"></span>`;
    }
    el.innerHTML = html;
  }

  function fmtTime(s) {
    const v = Math.max(0, Math.ceil(s));
    return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  }

  return {
    update(s) {
      if (els.hpFill) els.hpFill.style.width = `${Math.max(0, s.hp)}%`;
      if (els.hpNum) els.hpNum.textContent = String(Math.max(0, Math.ceil(s.hp)));
      if (els.armorNum) els.armorNum.textContent = s.armor > 0 ? `+${Math.ceil(s.armor)}` : '';
      if (els.ammoMag) els.ammoMag.textContent = s.mag == null ? '—' : String(s.mag);
      if (els.ammoRes) els.ammoRes.textContent = s.reserve == null ? '' : `/ ${s.reserve}`;
      if (els.weaponName) els.weaponName.textContent = s.weaponName || '';
      if (els.money) els.money.textContent = `$${s.money}`;
      if (els.timer) {
        els.timer.textContent = fmtTime(s.timer);
        els.timer.classList.toggle('low', s.timer <= 10 && s.phase === 'playing');
      }
      if (els.scoreEmber) els.scoreEmber.textContent = String(s.scoreEmber);
      if (els.scoreSlate) els.scoreSlate.textContent = String(s.scoreSlate);
      if (els.roundNum) els.roundNum.textContent = `ROUND ${s.round}`;
      dots(els.aliveEmber, s.aliveEmber, 3, '#35c4b5');
      dots(els.aliveSlate, s.aliveSlate, 4, '#ff5a4a');
      if (els.bombStatus) {
        els.bombStatus.textContent = s.bombText || '';
        els.bombStatus.classList.toggle('hot', !!s.bombText);
      }
      if (els.crosshair) {
        const gap = 6 + (s.spread || 0) * 260 + (s.moving ? 4 : 0);
        els.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
        els.crosshair.classList.toggle('hidden', s.phase !== 'playing' && s.phase !== 'buy');
      }
      if (hitT > 0) {
        hitT -= 1 / 60;
        if (hitT <= 0 && els.hitmarker) els.hitmarker.classList.remove('show');
      }
      if (bannerT > 0) {
        bannerT -= 1 / 60;
        if (bannerT <= 0 && els.banner) els.banner.classList.remove('show');
      }
    },
    showHitmarker(kill) {
      if (!els.hitmarker) return;
      els.hitmarker.classList.add('show');
      els.hitmarker.classList.toggle('kill', !!kill);
      hitT = kill ? 0.4 : 0.18;
    },
    addKill(text) {
      if (!els.killfeed) return;
      const div = document.createElement('div');
      div.className = 'kf';
      div.textContent = text;
      els.killfeed.prepend(div);
      while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
      setTimeout(() => div.remove(), 6000);
    },
    showBanner(text, sub) {
      if (!els.banner) return;
      if (els.bannerText) els.bannerText.textContent = text;
      if (els.bannerSub) els.bannerSub.textContent = sub || '';
      els.banner.classList.add('show');
      bannerT = 3;
    },
    hideBanner() {
      if (els.banner) els.banner.classList.remove('show');
      bannerT = 0;
    },
    setPlant(p) {
      if (!els.plantBar || !els.plantFill) return;
      if (p == null) {
        els.plantBar.classList.add('hidden');
        return;
      }
      els.plantBar.classList.remove('hidden');
      els.plantFill.style.width = `${Math.round(p * 100)}%`;
    },
    // Buy menu: items are {id, name, price, owned, desc}; onBuy(id) runs on click.
    renderBuy(items, money, onBuy) {
      if (!els.buyMenu) return;
      if (els.buyMoney) els.buyMoney.textContent = `$${money}`;
      if (!els.buyItems) return;
      els.buyItems.innerHTML = '';
      items.forEach((item, i) => {
        const b = document.createElement('button');
        b.className = 'buy-item';
        const afford = money >= item.price || item.owned;
        b.disabled = !afford;
        b.innerHTML = `<span class="buy-key">${i + 1}</span><span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">${item.owned ? 'OWNED' : '$' + item.price}</span>`;
        b.addEventListener('click', () => onBuy(item.id));
        els.buyItems.appendChild(b);
      });
    },
    showBuy(show) {
      if (els.buyMenu) els.buyMenu.classList.toggle('hidden', !show);
    },
    showOverlay(title, text, btnText, onBtn) {
      if (!els.overlay) return;
      if (els.overlayTitle) els.overlayTitle.textContent = title;
      if (els.overlayText) els.overlayText.textContent = text;
      const btn = els.overlayBtn;
      if (btn) {
        btn.textContent = btnText || 'Click to play';
        btn.onclick = () => onBtn?.();
      }
      els.overlay.classList.remove('hidden');
    },
    hideOverlay() {
      if (els.overlay) els.overlay.classList.add('hidden');
    },
    setOverlayButton(btnText, onBtn) {
      const btn = els.overlayBtn;
      if (!btn) return;
      btn.textContent = btnText;
      btn.onclick = () => onBtn?.();
    },
  };
}

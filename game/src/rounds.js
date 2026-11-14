// Rounds and the economy: a match is first to 5 round wins, at most 9 rounds. Each
// round opens with an 8 s buy phase, then 100 s of play. Ember (attackers) win a round
// by eliminating Slate, or by planting the bomb and letting it explode; Slate win by
// eliminating Ember, by running the clock out, or by defusing the bomb. Money pays for
// kills, round wins and plants, and buys guns, grenades and armor between rounds.
export const ROUND_TIME = 100;
export const BUY_TIME = 8;
export const ROUND_END_TIME = 4;
export const BOMB_TIME = 35;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const START_MONEY = 800;
export const KILL_MONEY = 300;
export const WIN_MONEY = 325;
export const LOSS_MONEY = 150;
export const PLANT_MONEY = 300;

export function createRounds() {
  const state = {
    phase: 'buy',
    round: 1,
    scoreEmber: 0,
    scoreSlate: 0,
    money: START_MONEY,
    timer: BUY_TIME,
    bomb: { planted: false, site: null, x: 0, z: 0, timer: 0 },
    lastReason: '',
  };

  function startMatch() {
    state.phase = 'buy';
    state.round = 1;
    state.scoreEmber = 0;
    state.scoreSlate = 0;
    state.money = START_MONEY;
    state.timer = BUY_TIME;
    state.bomb.planted = false;
    state.bomb.site = null;
    state.lastReason = '';
  }

  function startRound() {
    state.phase = 'playing';
    state.timer = ROUND_TIME;
    state.bomb.planted = false;
    state.bomb.site = null;
  }

  function endRound(winner, reason, hooks) {
    if (state.phase !== 'playing') return;
    state.phase = 'roundEnd';
    state.timer = ROUND_END_TIME;
    state.lastReason = reason;
    if (winner === 'ember') {
      state.scoreEmber += 1;
      state.money += WIN_MONEY;
    } else {
      state.scoreSlate += 1;
      state.money += LOSS_MONEY;
    }
    hooks.onRoundEnd(winner, reason);
  }

  function nextRound(hooks) {
    if (state.scoreEmber >= WIN_ROUNDS || state.scoreSlate >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.phase = 'matchEnd';
      const winner = state.scoreEmber === state.scoreSlate ? 'draw' : state.scoreEmber > state.scoreSlate ? 'ember' : 'slate';
      hooks.onMatchEnd(winner);
      return;
    }
    state.round += 1;
    state.phase = 'buy';
    state.timer = BUY_TIME;
    state.bomb.planted = false;
    state.bomb.site = null;
    hooks.onBuyPhase(state.round);
  }

  return {
    state,
    startMatch,
    startRound,
    addMoney(amount) {
      state.money += amount;
    },
    buy(price) {
      if (state.money < price) return false;
      state.money -= price;
      return true;
    },
    plant(site, x, z) {
      state.bomb.planted = true;
      state.bomb.site = site;
      state.bomb.x = x;
      state.bomb.z = z;
      state.bomb.timer = BOMB_TIME;
      state.money += PLANT_MONEY;
    },
    defused(hooks) {
      if (!state.bomb.planted) return;
      state.bomb.planted = false;
      endRound('slate', 'Bomb defused', hooks);
    },
    step(dt, alive, hooks) {
      if (state.phase === 'buy') {
        state.timer -= dt;
        if (state.timer <= 0) {
          startRound();
          hooks.onRoundStart(state.round);
        }
        return;
      }
      if (state.phase === 'roundEnd') {
        state.timer -= dt;
        if (state.timer <= 0) nextRound(hooks);
        return;
      }
      if (state.phase !== 'playing') return;

      if (state.bomb.planted) {
        state.bomb.timer -= dt;
        if (state.bomb.timer <= 0) {
          state.bomb.planted = false;
          hooks.onBombExploded();
          endRound('ember', 'Bomb detonated', hooks);
          return;
        }
      } else {
        state.timer -= dt;
        if (state.timer <= 0) {
          endRound('slate', 'Time expired', hooks);
          return;
        }
      }
      if (alive.slate === 0) {
        endRound('ember', 'Slate eliminated', hooks);
        return;
      }
      if (alive.ember === 0 && !state.bomb.planted) {
        endRound('slate', 'Ember eliminated', hooks);
      }
    },
  };
}

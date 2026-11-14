// Rounds: the match state machine — buy phase, playing, round end, match end —
// plus money, score, the round timer and the bomb (plant, tick, explode, defuse).
// It owns no rendering; the caller reads its state and draws the HUD from it.
export const BUY_TIME = 8;
export const ROUND_TIME = 100;
export const BOMB_TIME = 35;
export const DEFUSE_TIME = 5;
export const PLANT_TIME = 3;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function createRounds() {
  return {
    phase: 'menu', // menu | buy | playing | roundEnd | matchEnd
    round: 1,
    scoreEmber: 0,
    scoreSlate: 0,
    money: 800,
    timer: BUY_TIME,
    phaseT: 0,
    bomb: { planted: false, site: null, x: 0, z: 0, timer: BOMB_TIME },
    plantT: 0,
    lastWinner: null,
    lastReason: '',

    reset() {
      this.phase = 'buy';
      this.round = 1;
      this.scoreEmber = 0;
      this.scoreSlate = 0;
      this.money = 800;
      this.timer = BUY_TIME;
      this.phaseT = 0;
      this.bomb = { planted: false, site: null, x: 0, z: 0, timer: BOMB_TIME };
      this.plantT = 0;
      this.lastWinner = null;
      this.lastReason = '';
    },

    startRound() {
      this.phase = 'buy';
      this.timer = BUY_TIME;
      this.phaseT = 0;
      this.bomb = { planted: false, site: null, x: 0, z: 0, timer: BOMB_TIME };
      this.plantT = 0;
    },

    beginPlay() {
      this.phase = 'playing';
      this.timer = ROUND_TIME;
      this.phaseT = 0;
    },

    plant(site, x, z) {
      this.bomb = { planted: true, site, x, z, timer: BOMB_TIME };
      this.money += 300;
    },

    addKillReward() {
      this.money += 300;
    },
    addWinBonus() {
      this.money += 325;
    },
    addLossBonus() {
      this.money += 150;
    },

    endRound(winner, reason) {
      if (this.phase === 'roundEnd' || this.phase === 'matchEnd') return;
      this.lastWinner = winner;
      this.lastReason = reason;
      if (winner === 'ember') {
        this.scoreEmber++;
        this.addWinBonus();
      } else {
        this.scoreSlate++;
        this.addLossBonus();
      }
      if (this.scoreEmber >= WIN_ROUNDS || this.scoreSlate >= WIN_ROUNDS || this.round >= MAX_ROUNDS) {
        this.phase = 'matchEnd';
      } else {
        this.phase = 'roundEnd';
      }
      this.phaseT = 0;
      this.timer = 0;
    },

    nextRound() {
      this.round++;
      this.startRound();
    },

    // Step the timer and the bomb. `ctx` reports the live counts and the
    // callbacks the round end needs; returns an event name or null.
    update(dt, ctx) {
      this.phaseT += dt;
      if (this.phase === 'buy') {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.beginPlay();
          return 'roundStart';
        }
        return null;
      }
      if (this.phase !== 'playing') return null;
      if (this.bomb.planted) {
        this.bomb.timer -= dt;
        if (this.bomb.timer <= 0) {
          this.endRound('ember', 'Bomb detonated');
          return 'bombExploded';
        }
        return null;
      }
      this.timer -= dt;
      if (ctx.emberAlive <= 0) {
        this.endRound('slate', 'Ember eliminated');
        return 'roundEnd';
      }
      if (ctx.slateAlive <= 0) {
        this.endRound('ember', 'Slate eliminated');
        return 'roundEnd';
      }
      if (this.timer <= 0) {
        this.endRound('slate', 'Time expired');
        return 'roundEnd';
      }
      return null;
    },

    get matchWinner() {
      if (this.phase !== 'matchEnd') return null;
      if (this.scoreEmber > this.scoreSlate) return 'ember';
      if (this.scoreSlate > this.scoreEmber) return 'slate';
      return 'draw';
    },
  };
}

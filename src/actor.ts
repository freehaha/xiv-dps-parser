import {
  EventTypes,
  TickEvent,
  Effect,
  ActionEventBase,
  Status,
  StatusEvent,
} from "xiv-packet";

import { TRACKING_BUFFS, statuses, actions } from "./game-data";
const THUNDERCLOUD = 164;

class Dot {
  status: number;
  source: number;
  edmg: number;
  startTime?: number;
  duration?: number;
  constructor(status: number, source: number, edmg: number) {
    this.status = status;
    this.source = source;
    this.edmg = edmg;
  }
}

function _getStatusName(id: number): string {
  if (statuses[id] && statuses[id].name) {
    return statuses[id].name;
  }
  return "";
}

class Actor {
  hp: number;
  maxHp: number;
  shield: number;
  id: number;
  name: string = "";
  isNPC: boolean;
  active: boolean = false;
  job: string = "Unknown";
  party: boolean;
  owner: Actor = null;
  isObj: boolean;
  deathCount: number = 0;
  p2d: number;
  damageDealt: number = 0;
  hits: number = 0;
  crit: number = 0;
  dh: number = 0;
  dotDamageDealt: number = 0;
  dotCount: number = 0;
  statuses: Status[];
  private _t3pEnd: number;
  dots: Dot[];
  private _recentDots: Dot[];
  constructor(id: number) {
    this.id = id;
    this.statuses = [];
    this.dots = [];
    this._recentDots = [];
  }

  damage(event: ActionEventBase, effect: Effect) {
    let skillId = event.skill;
    let skill = actions[skillId];
    let p2d = 0;
    if (skill && skill.potency && effect.value > 0) {
      let pot = skill.potency;
      // 1. event.time === this.t3p_end  t3p consumed
      // 2. event.time < this.t3p_end, gaining new t3p so we didn't get a status remove
      if (
        event.time === this._t3pEnd ||
        (event.time < this._t3pEnd && // t3p remains because we got a new one from casted thunder
          event.effects.filter((ef) => ef.effectType === 16).length > 0)
      ) {
        if (skill.name === "Thunder IV") {
          pot = 230;
        } else if (skill.name === "Thunder III") {
          pot = 390;
        }
      }
      p2d = (effect.value * (100 - effect.bonus)) / 100 / pot;
    }
    if (this.owner) {
      this.owner.petDamage(effect.value);
    }

    this.damageDealt += effect.value;
    this.hits++;
    switch (effect.severity) {
      case 0:
        break;
      case 1:
        this.crit++;
        p2d /= 1.54;
        break;
      case 2:
        this.dh++;
        p2d /= 1.25;
        break;
      case 3:
        this.crit++;
        p2d /= 1.54;
        p2d /= 1.25;
        this.dh++;
        break;
      default:
        break;
    }
    if (p2d > 0) {
      this.p2d = p2d;
    }
  }

  addStatus(event: ActionEventBase, effect: Effect, sourceActor: Actor) {
    let source = event.source;
    let id = effect.value;

    let status = statuses[id];

    if (effect && status && status.potency) {
      let buffs = sourceActor.statuses.filter((status) => {
        return TRACKING_BUFFS.has(_getStatusName(status.id));
      });
      let edmg = effect.severity;
      let guess = sourceActor.p2d * status.potency;
      let crit = effect.param;
      let critDamage = 0;
      let tmp = crit;
      buffs.forEach((buff) => {
        switch (_getStatusName(buff.id)) {
          case "Battle Litany": {
            tmp -= 100;
            break;
          }
          case "The Wanderer's Minuet": {
            tmp -= 20;
            break;
          }
          default:
            break;
        }
      });
      let debuffs = this.statuses.filter((s) =>
        TRACKING_BUFFS.has(_getStatusName(s.id))
      );
      debuffs.forEach((debuff) => {
        switch (_getStatusName(debuff.id)) {
          case "Chain Stratagem": {
            tmp -= 100;
            break;
          }
          default:
            break;
        }
      });

      while (tmp < 50) {
        tmp += 256;
        crit += 256;
      }
      critDamage = crit + 350;

      // let ubound = this.p2d * status.potency + 256;
      // TODO check buffs
      while (edmg < guess + 256) {
        if (Math.abs(edmg - guess) < 128) {
          break;
        }
        edmg += 256;
      }

      edmg *= (1000 - crit + (crit * (1000 + critDamage)) / 1000) / 1000;
      // TODO check dh?
      this._recentDots.push({
        status: id,
        source,
        edmg,
      });
    }
  }

  setStatus(newStatus: Status) {
    this.maxHp = newStatus.maxHp;
    this.hp = newStatus.hp;
    this.shield = newStatus.shield;
    this.statuses = newStatus.statuses;
  }

  applyStatus(event: StatusEvent | TickEvent) {
    let statusId = 0;
    let duration = 0;
    let source = 0;
    if (event.type === EventTypes.STATUS) {
      statusId = event.status.id;
      duration = event.status.duration;
      source = event.status.source;
      this.statuses = this.statuses.filter(
        (st) => st.id !== statusId || st.source !== source
      );
      this.statuses.push(event.status);
    } else {
      statusId = event.skill;
      source = event.source;
      console.log(this.statuses);
      // FIXME how to determine duration from TickEvent
    }

    if (statusId === THUNDERCLOUD) {
      this._t3pEnd = event.time + duration * 1000;
      return;
    }
    if (event.type === EventTypes.TICK) {
      return;
    }

    let dots = [];
    let rest = [];
    let status = event.status;
    this._recentDots.forEach((dot) => {
      if (dot.source === source && dot.status === statusId) {
        dots.push(dot);
      } else {
        rest.push(dot);
      }
    });
    this._recentDots = rest;

    if (dots.length < 1) {
      return;
    }
    let dot = dots[0];
    this.dots.push({
      ...dot,
      startTime: event.time,
      duration: status.duration,
    });
  }

  removeStatus(event: TickEvent) {
    if (event.skill === THUNDERCLOUD) {
      this._t3pEnd = event.time;
    }
  }

  dotDamage(damage: number) {
    if (this.owner) {
      this.owner.petDamage(damage);
    }
    this.dotDamageDealt += damage;
    this.dotCount++;
    this.damageDealt += damage;
  }

  petDamage(damage: number) {
    this.damageDealt += damage;
  }

  death() {
    this.deathCount++;
  }

  splitDotDamage(event: TickEvent): Map<number, number> {
    let out = new Map<number, number>();
    let total = 0;
    let deducted = 0;
    let dots = this.dots.filter(
      (dot) => dot.startTime + dot.duration * 1000 > event.time
    );
    dots.forEach((dot) => {
      total += dot.edmg;
    });
    dots.forEach((dot, i) => {
      let dmg = Math.floor((event.value * dot.edmg) / total);
      let orig = 0;
      if (out.has(dot.source)) {
        orig = out.get(dot.source);
      }
      deducted += dmg;
      if (i === dots.length - 1) {
        dmg += event.value - deducted;
      }
      out.set(dot.source, orig + dmg);
    });
    this.dots = dots;
    return out;
  }
}
export default Actor;

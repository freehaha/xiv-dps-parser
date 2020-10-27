import { EventTypes, XivEvent } from "xiv-packet";
import { getJobName, getJobFromAction } from "./game-data";
import Actor from "./actor";
const DamagingEffect = new Set(["damage", "block", "parried"]);
const LB_ACTOR = -1;

interface CharacterStore {
  getCharacter(id: number): Promise<string>;
  saveCharacter(id: number, name: string): void;
}

class MemoryCharStore implements CharacterStore {
  chars: Map<number, string>;
  constructor() {
    this.chars = new Map();
  }
  getCharacter(id: number): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.chars.has(id)) {
        resolve(this.chars.get(id));
      } else {
        reject("unknown");
      }
    });
  }
  saveCharacter(id: number, name: string): void {
    this.chars.set(id, name);
  }
}

class DpsParser {
  actors: Map<number, Actor>;
  startTime: number = 0;
  endTime: number = 0;
  ended: number = 0;
  lastDamageEventTime: number = 0;
  private charStore: CharacterStore;
  private charCache: Map<number, string>;

  constructor(store: CharacterStore) {
    this.charCache = new Map();
    this.charCache.set(LB_ACTOR, "Limit Break");
    this.charStore = store;
    this.actors = new Map();
    this.getActor(LB_ACTOR).job = "LB";
    this.getActor(LB_ACTOR).hits = 1;
    this.lastDamageEventTime = 0;
  }

  /* get actor by id */
  getActor(id: number): Actor {
    if (!this.actors.has(id)) {
      let actor = new Actor(id);
      actor.isNPC = id & 0x10000000 ? false : true;
      this.actors.set(id, actor);
      if (actor.isNPC) {
        actor.name = "NPC";
        return actor;
      }
      if (this.charCache.has(id)) {
        actor.name = this.charCache.get(id);
      } else {
        this.charStore
          .getCharacter(id)
          .then((ret) => {
            this.charCache.set(id, ret);
            actor.name = ret;
          })
          .catch(() => {
            actor.name = "Unknown";
          });
      }
    }
    return this.actors.get(id);
  }

  getStats() {
    return this;
  }

  processEvents(events: XivEvent[]) {
    events.forEach((event) => {
      switch (event.type) {
        case EventTypes.ACTION:
        case EventTypes.ACTION8:
        case EventTypes.ACTION16:
        case EventTypes.ACTION24: {
          let source = this.getActor(event.source);
          if (source.job === "Unknown") {
            source.job = getJobFromAction(event.skill);
          }
          source.active = true;
          event.effects.forEach((effect) => {
            let target = this.getActor(event.target);
            if (effect.flags & 0x80) {
              target = source;
            }
            if (DamagingEffect.has(effect.effectTypeName)) {
              // start fight from 1st damage
              if (this.startTime !== 0) {
                this.endTime = event.time;
              }
              // last damaging event
              this.lastDamageEventTime = event.time;

              if (effect.param === 0) {
                // console.log(source.name, target.name, event.skill, effect);
                return;
              }

              if (!source.isNPC && !target.isNPC) {
                // console.warn("pc -> pc", event, source.name, target.name);
                return;
              }

              if (effect.param & 8) {
                this.actors.get(LB_ACTOR).damage(event, effect);
              } else {
                this.actors.get(event.source).damage(event, effect);
              }
            } else if (effect.effectTypeName === "apply status") {
              this.actors.get(event.target).addStatus(event, effect, source);
            }
          });
          break;
        }
        case EventTypes.STATUS_LIST: {
          let actor = this.getActor(event.target);
          actor.setStatus(event.status);
          break;
        }
        case EventTypes.STATUS_STATS: {
          let actor = this.getActor(event.target);
          actor.hp = event.hp;
          actor.maxHp = event.maxHp;
          actor.shield = event.shield;
          break;
        }
        case EventTypes.STATUS: {
          let actor = this.getActor(event.target);
          actor.applyStatus(event);
          break;
        }
        case EventTypes.ALLIANCE_INFO: {
          for (let pc of event.pcs) {
            let actor = this.getActor(pc.id);
            actor.job = getJobName(pc.job);
            actor.name = pc.name;
            this.charStore.saveCharacter(pc.id, pc.name);
          }
          break;
        }
        case EventTypes.PARTY_INFO: {
          for (let pc of event.pcs) {
            let actor = this.getActor(pc.id);
            this.charStore.saveCharacter(pc.id, pc.name);
            actor.job = getJobName(pc.job);
            actor.name = pc.name;
            actor.party = true;
            actor.isNPC = false;
            actor.active = true;
          }
          break;
        }
        case EventTypes.NPC_SPAWN: {
          let actor = this.getActor(event.source);
          actor.isNPC = true;
          if (event.owner && event.owner !== 0xe0000000) {
            actor.owner = this.getActor(event.owner);
          }
          break;
        }
        case EventTypes.PC: {
          let actor = this.getActor(event.source);
          actor.name = event.actorInfo.name;
          this.charStore.saveCharacter(actor.id, actor.name);
          actor.job = getJobName(event.actorInfo.job);
          actor.isNPC = false;
          break;
        }
        case EventTypes.OBJ_SPAWN: {
          let actor = this.getActor(event.source);
          actor.isObj = true;
          actor.owner = this.getActor(event.actorInfo.owner);
          break;
        }
        case EventTypes.TICK: {
          switch (event.tickType) {
            case "STATUS_GAIN": {
              let actor = this.getActor(event.target);
              actor.applyStatus(event);
              break;
            }
            case "STATUS_REMOVE": {
              let actor = this.getActor(event.target);
              actor.removeStatus(event);
              break;
            }
            case "DEATH": {
              let actor = this.getActor(event.target);
              actor.death();
              break;
            }
            case "DOT": {
              if (event.skill) {
                this.getActor(event.source).dotDamage(event.value);
              } else {
                if (event.source === 0xe0000000) {
                  // dot ticks on pcs (from environment)
                  return;
                }
                let target = this.getActor(event.target);
                let split = target.splitDotDamage(event);
                split.forEach((damage, source) => {
                  let actor = this.getActor(source);
                  actor.dotDamage(damage);
                });
              }
              break;
            }
            case "INCOMBAT": {
              let actor = this.getActor(event.target);
              // combat start
              if (this.startTime <= 0 && !actor.isNPC && event.skill === 1) {
                this.startTime = event.time;
                return;
              }
              if (event.skill !== 0) {
                break;
              }
              // combat ended already
              if (this.ended) {
                break;
              }
              this.ended = event.time;
              break;
            }
            default:
              break;
          }
          break;
        }
        default:
          break;
      }
    });
  }
}

export default DpsParser;
export { MemoryCharStore, CharacterStore };

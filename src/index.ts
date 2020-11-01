import { EventTypes, XivEvent, Effect } from "xiv-packet";
import { getJobName, getJobFromAction } from "./game-data";
import Actor from "./actor";
import eachSeries from "async/eachSeries";
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
  private charStore: CharacterStore;
  private charCache: Map<number, string>;

  constructor(store: CharacterStore) {
    this.charCache = new Map();
    this.charCache.set(LB_ACTOR, "Limit Break");
    this.charStore = store;
    this.actors = new Map();
    this.getActor(LB_ACTOR).then((actor) => {
      actor.job = "LB";
      actor.hits = 1;
    });
  }

  /* get actor by id */
  async getActor(id: number): Promise<Actor> {
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
        try {
          actor.name = await this.charStore.getCharacter(id);
        } catch {
          actor.name = "Unknown";
        }
      }
    }
    return this.actors.get(id);
  }

  getStats() {
    return this;
  }

  async processEvents(events: XivEvent[]) {
    await eachSeries(events, async (event: XivEvent) => {
      switch (event.type) {
        case EventTypes.ACTION:
        case EventTypes.ACTION8:
        case EventTypes.ACTION16:
        case EventTypes.ACTION24: {
          let source = await this.getActor(event.source);
          if (source.job === "Unknown") {
            source.job = getJobFromAction(event.skill);
          }
          source.active = true;
          eachSeries(event.effects, async (effect: Effect) => {
            let target = await this.getActor(event.target);
            if (effect.flags & 0x80) {
              target = source;
            }
            if (DamagingEffect.has(effect.effectTypeName)) {
              // start fight from 1st damage
              if (this.startTime !== 0) {
                this.endTime = event.time;
              }

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
                source.damage(event, effect);
              }
            } else if (effect.effectTypeName === "apply status") {
              target.addStatus(event, effect, source);
            }
          });
          break;
        }
        case EventTypes.STATUS_LIST: {
          let actor = await this.getActor(event.target);
          actor.setStatus(event.status);
          break;
        }
        case EventTypes.STATUS_STATS: {
          let actor = await this.getActor(event.target);
          actor.hp = event.hp;
          actor.maxHp = event.maxHp;
          actor.shield = event.shield;
          break;
        }
        case EventTypes.STATUS: {
          let actor = await this.getActor(event.target);
          actor.applyStatus(event);
          break;
        }
        case EventTypes.ALLIANCE_INFO: {
          for (let pc of event.pcs) {
            let actor = await this.getActor(pc.id);
            actor.job = getJobName(pc.job);
            actor.name = pc.name;
            this.charStore.saveCharacter(pc.id, pc.name);
          }
          break;
        }
        case EventTypes.PARTY_INFO: {
          for (let pc of event.pcs) {
            let actor = await this.getActor(pc.id);
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
          let actor = await this.getActor(event.source);
          if (event.owner && event.owner !== 0xe0000000) {
            actor.owner = await this.getActor(event.owner);
          }
          break;
        }
        case EventTypes.PC: {
          let actor = await this.getActor(event.source);
          actor.name = event.actorInfo.name;
          this.charStore.saveCharacter(actor.id, actor.name);
          actor.job = getJobName(event.actorInfo.job);
          actor.isNPC = false;
          break;
        }
        case EventTypes.OBJ_SPAWN: {
          let actor = await this.getActor(event.source);
          actor.isObj = true;
          actor.owner = await this.getActor(event.actorInfo.owner);
          break;
        }
        case EventTypes.TICK: {
          switch (event.tickType) {
            case "STATUS_GAIN": {
              let actor = await this.getActor(event.target);
              actor.applyStatus(event);
              break;
            }
            case "STATUS_REMOVE": {
              let actor = await this.getActor(event.target);
              actor.removeStatus(event);
              break;
            }
            case "DEATH": {
              let actor = await this.getActor(event.target);
              actor.death();
              break;
            }
            case "DOT": {
              if (event.skill) {
                (await this.getActor(event.source)).dotDamage(event.value);
              } else {
                if (event.source === 0xe0000000) {
                  // dot ticks on pcs (from environment)
                  return;
                }
                let target = await this.getActor(event.target);
                let split = target.splitDotDamage(event);
                split.forEach(async (damage, source) => {
                  let actor = await this.getActor(source);
                  actor.dotDamage(damage);
                });
              }
              break;
            }
            case "INCOMBAT": {
              let actor = await this.getActor(event.target);
              // combat start
              if (this.startTime <= 0 && !actor.isNPC && event.skill === 1) {
                this.startTime = event.time;
                return;
              }
              if (this.startTime <= 0) return;
              if (event.skill !== 0) return;
              // combat ended already
              if (this.ended) return;
              // only measure PC's combat status
              if (actor.isNPC) return;
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

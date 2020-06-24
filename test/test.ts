import DpsParser from "../src/index";
import { expect } from "chai";
import { EventTypes } from "xiv-packet";

let PC_BASE = 0x10000000;
let NPC_BASE = 0x40000000;

function getParser(): DpsParser {
  let actors = new Map([
    [PC_BASE + 1, "PC1"],
    [NPC_BASE + 1, "NPC1"],
  ]);
  let charStore = {
    getCharacter: async (id: number): Promise<string> => {
      if (actors.has(id)) {
        return actors.get(id);
      } else {
        return "unknown";
      }
    },
    saveCharacter: (id: number, name: string) => {
      actors.set(id, name);
    },
  };
  let parser = new DpsParser(charStore);
  return parser;
}

async function timeout(msec: number): Promise<any> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, msec);
  });
}

describe("Parser tests", () => {
  it("should report 2 actors", async () => {
    let parser = getParser();
    parser.processEvents([
      {
        type: EventTypes.ACTION,
        time: 0,
        source: PC_BASE + 1,
        skill: 1,
        effects: [
          {
            flags: 0,
            effectType: 0,
            effectTypeName: "damage",
            severity: 0,
            mod: 0,
            bonus: 0,
            param: 0,
            value: 100,
          },
        ],
        target: NPC_BASE + 1,
      },
    ]);
    await timeout(10);
    let stats = parser.getStats();
    expect(stats.actors).to.have.lengthOf(3);
    expect(stats.actors.get(PC_BASE + 1)).to.haveOwnProperty("isNPC", false);
    expect(stats.actors.get(PC_BASE + 1)).to.haveOwnProperty("name", "PC1");
    expect(stats.actors.get(NPC_BASE + 1)).to.haveOwnProperty("isNPC", true);
    expect(stats.actors.get(NPC_BASE + 1)).to.haveOwnProperty("name", "NPC");
  });

  it("should report damage dealt", () => {
    let parser = getParser();
    parser.processEvents([
      {
        type: EventTypes.TICK,
        param: 0,
        tickType: "INCOMBAT",
        time: 1,
        target: PC_BASE + 1,
        value: 0,
        skill: 1,
        source: PC_BASE + 1,
      },
      {
        type: EventTypes.ACTION,
        time: 2,
        source: PC_BASE + 1,
        skill: 16555,
        effects: [
          {
            flags: 0,
            effectType: 0,
            effectTypeName: "damage",
            severity: 0,
            mod: 0,
            bonus: 0,
            param: 1,
            value: 100,
          },
        ],
        target: NPC_BASE + 1,
      },
      {
        type: EventTypes.ACTION,
        time: 3000,
        source: PC_BASE + 1,
        skill: 16555,
        effects: [
          {
            flags: 0,
            effectType: 0,
            effectTypeName: "damage",
            severity: 0,
            mod: 0,
            bonus: 0,
            param: 1,
            value: 100,
          },
        ],
        target: NPC_BASE + 1,
      },
    ]);
    let stats = parser.getStats();
    expect(stats.startTime).to.equal(1);
    expect(stats.actors.get(PC_BASE + 1)).to.haveOwnProperty("hits", 2);
    expect(stats.actors.get(PC_BASE + 1)).to.haveOwnProperty(
      "damageDealt",
      200
    );
  });

  it("should calculate dot damage", () => {
    let parser = getParser();
    let events = require("./test-data.ts").pldCoS;
    parser.processEvents(events);
    let stats = parser.getStats();
    expect(stats.actors.get(PC_BASE + 1)).to.haveOwnProperty(
      "dotDamageDealt",
      698
    );
    let split = stats.getActor(NPC_BASE + 1).splitDotDamage({
      type: EventTypes.TICK,
      skill: 0,
      param: 3,
      value: 194,
      source: 268435457,
      tickType: "DOT",
      time: 1592910244984,
      target: NPC_BASE + 1,
    });
    expect(split.get(PC_BASE + 1)).to.equal(194);
  });

  it("should split dot damage properly", () => {
    let parser = getParser();
    let events = require("./test-data.ts").pldCoS;
    parser.processEvents(events);
    let stats = parser.getStats();
    expect(stats.actors.get(PC_BASE + 1)).to.haveOwnProperty(
      "dotDamageDealt",
      698
    );
    let split = stats.getActor(NPC_BASE + 1).splitDotDamage({
      type: EventTypes.TICK,
      skill: 0,
      param: 3,
      value: 194,
      source: 268435457,
      tickType: "DOT",
      time: 1592910244984,
      target: NPC_BASE + 1,
    });
    expect(split.get(PC_BASE + 1)).to.equal(194);
  });
});

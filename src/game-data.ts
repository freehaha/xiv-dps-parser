import _statuses from "./statuses.json";
import _actions from "./actions.json";

let actions = {};
let statuses = {};
_actions.forEach((action) => {
  actions[action.id] = action;
  if (action.effects) {
    action.effects.forEach((status: any) => {
      statuses[status.id] = status;
    });
  }
});

_statuses.forEach((status) => {
  if (!statuses[status.id]) {
    statuses[status.id] = status;
  } else {
    statuses[status.id] = {
      ...statuses[status.id],
      ...status,
    };
  }
});

const JOBS = {
  0: "Unknown",
  1: "GLA",
  2: "PGL",
  3: "MRD",
  4: "LNC",
  5: "ARC",
  6: "CNJ",
  7: "THM",
  8: "CPT",
  9: "BSM",
  10: "ARM",
  11: "GSM",
  12: "LTW",
  13: "WVR",
  14: "ALC",
  15: "CUL",
  16: "MIN",
  17: "BTN",
  18: "FSH",
  19: "PLD",
  20: "MNK",
  21: "WAR",
  22: "DRG",
  23: "BRD",
  24: "WHM",
  25: "BLM",
  26: "ACN",
  27: "SMN",
  28: "SCH",
  29: "ROG",
  30: "NIN",
  31: "MCH",
  32: "DRK",
  33: "AST",
  34: "SAM",
  35: "RDM",
  36: "BLU",
  37: "GNB",
  38: "DNC",
};

export function getJobName(jobId: number): string {
  if (JOBS[jobId]) {
    return JOBS[jobId];
  }
  return "Unknown";
}

export const TRACKING_BUFFS = new Set([
  "Battle Litany",
  "Battle Voice",
  "Chain Stratagem",
  "The Wanderer's Minuet",
  "Army's Paeon",
]);

export { statuses, actions };

const ACTION_JOB = new Map([
  ["Riot Blade", "PLD"],
  ["Bootshine", "MNK"],
  ["Heavy Swing", "WAR"],
  ["True Thrust", "DRG"],
  ["Brust Shot", "BRD"],
  ["Glare", "WHM"],
  ["Blizzard III", "BLM"],
  ["Ruin III", "SMN"],
  ["Biolysis", "SCH"],
  ["Spinning Edge", "NIN"],
  ["Heated Split Shot", "MCH"],
  ["Hard Slash", "DRK"],
  ["Malefic III", "AST"],
  ["Malefic IV", "AST"],
  ["Hakaze", "SAM"],
  ["Jolt II", "RDM"],
  ["Keen Edge", "GNB"],
  ["Cascade", "DNC"],
  ["Standard Step", "DNC"],
]);

export function getJobFromAction(skill: number): string {
  if (actions[skill]) {
    let name = actions[skill].name;
    if (ACTION_JOB.has(name)) {
      return ACTION_JOB.get(name);
    }
  }
  return "Unknown";
}

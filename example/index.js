const zmq = require("zeromq/v5-compat");
const { MemoryCharStore } = require("../");
const DpsParser = require("../").default;
const bparser = require("binary-parser").Parser;
const { unpackPacket, parsePackets } = require("xiv-packet");

let packetHeader = new bparser()
  .endianess("little")
  .seek(3) // skip the sn number
  .uint64le("time", {
    formatter: function (time) {
      return Number(time);
    },
  })
  .buffer("rawPacket", {
    readUntil: "eof",
  });

let charStore = new MemoryCharStore();
let parser = new DpsParser(charStore);

let sock = zmq.socket("sub");
sock.connect("tcp://127.0.0.1:10801");
sock.subscribe("p");
sock.on("message", (msg) => {
  let header = packetHeader.parse(msg);
  let packet = unpackPacket(header.rawPacket, header.time);
  let events = parsePackets([packet]);
  parser.processEvents(events);

  let startTime = parser.startTime;
  let table = [];
  let duration = (parser.endTime - startTime) / 1000; // time was in miliseconds
  if (duration <= 0) {
    duration = 1;
  }
  parser.getStats().actors.forEach((actor) => {
    if (actor.isNPC) {
      return;
    }
    if (startTime <= 0) {
      return;
    }
    if (actor.name === "Limit Break") {
      return;
    }
    table.push({
      name: actor.name,
      dps: actor.damageDealt / duration,
    });
  });
  console.table(table);
  if (parser.ended) {
    console.log("fight ended");
    let duration = (parser.endTime - startTime) / 1000; // time was in miliseconds
    console.log(`duration ${duration}`);
    sock.close();
    process.exit(0);
  }
});

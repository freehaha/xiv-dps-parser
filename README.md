# Install

`npm install xiv-dps-parser`

# How it works

It uses data parsed from network using [xiv-packet](https://github.com/freehaha/xiv-packet).
Character names and job detail are also read from network and stored in a
character store, meaning you need to have the parser open when you enter the
instance/area in order to have it store people's names and ids.

In this package a memory store is provided to store the character names but you
can implement a persistent store if you wish.

It determines whether the fight ended by looking for the aggro control packet
hence you will probably see fight getting segmented in dungeon. In raids, however,
this should work as you normally expected.

# Usage

This is also included in the `example` directory.

```javascript
const zmq = require("zeromq/v5-compat");
const MemoryCharStore = require("xiv-dps-parser").MemoryCharStore;
const DpsParser = require("xiv-dps-parser").default;
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
sock.connect("ipc:///tmp/ffxiv_packets");
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
    console.table(table);
  });
  if (parser.ended) {
    console.log("fight ended");
    sock.close();
  }
});
```

#!/usr/bin/env node

const request = require("request");
const j2x = require("jsontoxml");
const moment = require("moment");
const fs = require("fs-extra");
const { v4: uuid4 } = require("uuid"); // Asegúrate de tener esta línea

const plutoIPTV = {
  grabJSON: function (callback) {
    console.log("[INFO] Fetching data...");
    const workerUrl = `https://floral-salad-5e9d.zinhoflix.workers.dev/`;
    request({ url: workerUrl, headers: { 'User-Agent': 'Mozilla/5.0' } }, function (err, res, raw) {
      if (err) process.exit(1);
      try { callback(JSON.parse(raw)); } catch (e) { process.exit(1); }
    });
  },
};

function processChannels(list) {
  const imgBase = "https://images.pluto.tv";
  let m3u8_normal = "#EXTM3U x-tvg-url=\"epg.xml\"\n\n";
  let tv = [];

  list.forEach((channel) => {
    if (channel.isStitched && !channel.slug.match(/^announcement|^privacy-policy/)) {
      const idSincro = channel.slug;
      let finalLogo = channel.colorLogoPNG.path.startsWith("http") ? channel.colorLogoPNG.path : `${imgBase}${channel.colorLogoPNG.path}`;

      // --- URL PARA FLUIDEZ UNIVERSAL ---
      // Usamos parámetros que Pluto reconoce para dispositivos de alto rendimiento
      const session = uuid4();
      const directUrl = `http://stitcher.pluto.tv/stitch/hls/channel/${channel._id}/master.m3u8?advertisingId=${session}&appName=web&appVersion=unknown&clientDeviceType=0&deviceId=${session}&deviceMake=web&deviceModel=web&deviceType=web&sid=${session}&maxVideoHeight=1080&includeExtendedEvents=false`;

      m3u8_normal += `#EXTINF:0 tvg-id="${idSincro}" tvg-logo="${finalLogo}" group-title="${channel.category}", ${channel.name}\n`;
      m3u8_normal += `${directUrl}\n\n`;

      tv.push({
        name: "channel", attrs: { id: idSincro },
        children: [{ name: "display-name", text: channel.name }, { name: "icon", attrs: { src: finalLogo } }]
      });

      if (channel.timelines) {
        channel.timelines.forEach((prog) => {
          tv.push({
            name: "programme",
            attrs: {
              start: moment(prog.start).format("YYYYMMDDHHmmss ZZ"),
              stop: moment(prog.stop).format("YYYYMMDDHHmmss ZZ"),
              channel: idSincro
            },
            children: [
              { name: "title", attrs: { lang: "es" }, text: prog.title || "Sin título" },
              { name: "desc", attrs: { lang: "es" }, text: (prog.episode && prog.episode.description) ? prog.episode.description : "Sin descripción" }
            ]
          });
        });
      }
    }
  });

  fs.writeFileSync("epg.xml", j2x({ tv }, { prettyPrint: true, escape: true }));
  fs.writeFileSync("playlist.m3u", m3u8_normal);
  console.log("[SUCCESS] Listas listas para Android, PC y TV.");
}

plutoIPTV.grabJSON(processChannels);

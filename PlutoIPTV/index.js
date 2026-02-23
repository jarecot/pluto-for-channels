#!/usr/bin/env node

const request = require("request");
const j2x = require("jsontoxml");
const moment = require("moment");
const fs = require("fs-extra");

const plutoIPTV = {
  grabJSON: function (callback) {
    console.log("[INFO] Grabbing data via Worker for Colombia...");
    // Usamos el worker que ya sabemos que nos da acceso a los links funcionales
    const workerUrl = `https://floral-salad-5e9d.zinhoflix.workers.dev/`;

    request({
      url: workerUrl,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, function (err, res, raw) {
      if (err) { console.error("Error en worker"); process.exit(1); }
      try {
        callback(JSON.parse(raw));
      } catch (e) {
        console.error("Respuesta del worker no es JSON");
        process.exit(1);
      }
    });
  },
};

function processChannels(list) {
  const imgBase = "https://images.pluto.tv";
  let m3u8_normal = "#EXTM3U\n\n";
  let m3u8_hq = "#EXTM3U\n\n";
  let tv = [];

  list.forEach((channel) => {
    if (channel.isStitched && !channel.slug.match(/^announcement|^privacy-policy/)) {
      
      const idSincro = channel.slug;
      let rawUrl = channel.stitched.urls[0].url;
      let logoPath = channel.colorLogoPNG ? channel.colorLogoPNG.path : "";
      let finalLogo = logoPath.startsWith("http") ? logoPath : `${imgBase}${logoPath}`;

      // --- URL LIMPIA (Sin parámetros extra que rompan el stream) ---
      m3u8_normal += `#EXTINF:0 tvg-id="${idSincro}" tvg-logo="${finalLogo}" group-title="${channel.category}", ${channel.name}\n`;
      m3u8_normal += `${rawUrl}\n\n`;

      m3u8_hq += `#EXTINF:0 tvg-id="${idSincro}" tvg-logo="${finalLogo}" group-title="${channel.category}", ${channel.name} (HQ)\n`;
      m3u8_hq += `${rawUrl}\n\n`;

      // --- EPG ---
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
  fs.writeFileSync("playlist_hq.m3u", m3u8_hq);
  console.log("¡Archivos generados con éxito!");
}

plutoIPTV.grabJSON(processChannels);

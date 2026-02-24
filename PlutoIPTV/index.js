#!/usr/bin/env node
process.env.TZ = 'America/Bogota';

const request = require("request");
const j2x = require("jsontoxml");
const moment = require("moment");
const fs = require("fs-extra");
const { v4: uuid4 } = require("uuid");

const plutoIPTV = {
  grabJSON: function (callback) {
    console.log("[INFO] Consultando API de Pluto TV...");
    const startTime = moment().subtract(6, 'hours').format("YYYY-MM-DDTHH:00:00.000Z");
    const stopTime = moment().add(24, 'hours').format("YYYY-MM-DDTHH:00:00.000Z");

    const params = new URLSearchParams({
        start: startTime, stop: stopTime, region: "CO",
        appName: "web", appVersion: "5.33.0", deviceType: "web",
        sid: uuid4(), deviceId: uuid4()
    });

    request({
      url: `https://api.pluto.tv/v2/channels?${params.toString()}`,
      headers: { 'X-Forwarded-For': '181.128.0.0' },
      timeout: 30000
    }, (err, res, raw) => {
      if (err) process.exit(1);
      try { callback(JSON.parse(raw)); } catch (e) { process.exit(1); }
    });
  },
};

function processChannels(list) {
  const imgBase = "https://images.pluto.tv";
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
  
  // Forzamos la cabecera para que IPTVnator sepa dónde buscar el EPG
  let m3u8 = "#EXTM3U x-tvg-url=\"https://raw.githubusercontent.com/jarecot/pluto-for-channels/main/epg.xml\"\n\n";
  let tv = [];
  let countProgs = 0;

  list.forEach((channel) => {
    if (channel.isStitched && channel.slug) {
      
      // CAMBIO CLAVE: Usamos el _id único de Pluto (ej: 5dcb62...) en lugar del slug
      // Esto elimina problemas con nombres de canales que cambian o tienen guiones
      const idSincro = channel._id; 
      
      let rawUrl = channel.stitched.urls[0].url;
      let logoPath = channel.colorLogoPNG ? channel.colorLogoPNG.path : "";
      let finalLogo = logoPath.startsWith("http") ? logoPath : `${imgBase}${logoPath}`;

      const finalLink = `${rawUrl}|User-Agent=${encodeURIComponent(ua)}`;

      // M3U: Vinculamos con tvg-id
      m3u8 += `#EXTINF:0 tvg-id="${idSincro}" tvg-name="${channel.slug}" tvg-logo="${finalLogo}" group-title="${channel.category}", ${channel.name}\n`;
      m3u8 += `${finalLink}\n\n`;

      // EPG: Canal
      tv.push({
        name: "channel",
        attrs: { id: idSincro },
        children: [{ name: "display-name", text: channel.name }]
      });

      // EPG: Programas
      if (channel.timelines) {
        channel.timelines.forEach((prog) => {
          countProgs++;
          tv.push({
            name: "programme",
            attrs: {
              start: moment(prog.start).format("YYYYMMDDHHmmss ZZ"),
              stop: moment(prog.stop).format("YYYYMMDDHHmmss ZZ"),
              channel: idSincro // Debe ser idéntico al id del channel attrs
            },
            children: [
              { name: "title", attrs: { lang: "es" }, text: prog.title || "Sin título" },
              { name: "desc", attrs: { lang: "es" }, text: prog.description || (prog.episode ? prog.episode.description : "Sin descripción") }
            ]
          });
        });
      }
    }
  });

  const xmlContents = j2x({ tv }, { prettyPrint: true, escape: true });
  const finalXml = `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="GeminiPluto">${xmlContents}</tv>`;

  fs.writeFileSync("epg.xml", finalXml);
  fs.writeFileSync("playlist.m3u", m3u8);
  
  console.log(`[SUCCESS] EPG sincronizado con IDs únicos (${countProgs} programas).`);
}

plutoIPTV.grabJSON(processChannels);

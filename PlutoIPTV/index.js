#!/usr/bin/env node

const request = require("request");
const j2x = require("jsontoxml");
const moment = require("moment");
const fs = require("fs-extra");
const { v4: uuid4 } = require("uuid");

const plutoIPTV = {
  grabJSON: function (callback) {
    console.log("[INFO] Fetching channels via Worker for Colombia...");
    const workerUrl = `https://floral-salad-5e9d.zinhoflix.workers.dev/`;

    request({
      url: workerUrl,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, function (err, res, raw) {
      if (err) { console.error("Error en Worker"); process.exit(1); }
      try {
        callback(JSON.parse(raw));
      } catch (e) {
        console.error("Respuesta no válida");
        process.exit(1);
      }
    });
  },
};

function processChannels(list) {
  const imgBase = "https://images.pluto.tv";
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
  
  // Una sola lista con la referencia al EPG
  let m3u8 = "#EXTM3U x-tvg-url=\"epg.xml\"\n\n";
  let tv = [];

  list.forEach((channel) => {
    if (channel.isStitched && !channel.slug.match(/^announcement|^privacy-policy/)) {
      
      const idSincro = channel.slug; 
      let rawUrl = channel.stitched.urls[0].url;
      let logoPath = channel.colorLogoPNG ? channel.colorLogoPNG.path : "";
      let finalLogo = logoPath.startsWith("http") ? logoPath : `${imgBase}${logoPath}`;

      // --- URL CON CABECERAS DE ALTA CALIDAD ---
      // Usamos los parámetros que mejor te funcionaron anteriormente
      let urlObj = new URL(rawUrl);
      urlObj.searchParams.set("appName", "web");
      urlObj.searchParams.set("deviceMake", "chrome");
      urlObj.searchParams.set("sid", uuid4());
      urlObj.searchParams.set("deviceId", idSincro);

      // Agregamos el User-Agent directamente al link para IPTVnator
      const finalLink = `${urlObj.toString()}|User-Agent=${encodeURIComponent(ua)}`;

      m3u8 += `#EXTINF:0 tvg-id="${idSincro}" tvg-logo="${finalLogo}" group-title="${channel.category || 'Pluto TV'}", ${channel.name}\n`;
      m3u8 += `${finalLink}\n\n`;

      // --- EPG CANAL ---
      tv.push({
        name: "channel", attrs: { id: idSincro },
        children: [
          { name: "display-name", text: channel.name },
          { name: "icon", attrs: { src: finalLogo } }
        ]
      });

      // --- EPG PROGRAMAS ---
      if (channel.timelines && Array.isArray(channel.timelines)) {
        channel.timelines.forEach((prog) => {
          tv.push({
            name: "programme",
            attrs: {
              // Formato de tiempo crucial para IPTVnator
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

  // Guardamos archivos
  fs.writeFileSync("epg.xml", j2x({ tv }, { prettyPrint: true, escape: true }));
  fs.writeFileSync("playlist.m3u", m3u8);
  
  // Limpiamos los archivos viejos si existen para evitar confusiones
  if (fs.existsSync("playlist_hq.m3u")) fs.unlinkSync("playlist_hq.m3u");
  
  console.log(`[SUCCESS] Canales: ${list.length} | Programas: ${tv.filter(x => x.name === 'programme').length}`);
}

plutoIPTV.grabJSON(processChannels);

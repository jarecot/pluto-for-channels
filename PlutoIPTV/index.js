#!/usr/bin/env node

const request = require("request");
const j2x = require("jsontoxml");
const moment = require("moment");
const fs = require("fs-extra");

const plutoIPTV = {
  grabJSON: function (callback) {
    console.log("[INFO] Fetching channels and EPG data...");
    const workerUrl = `https://floral-salad-5e9d.zinhoflix.workers.dev/`;

    request({
      url: workerUrl,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, function (err, res, raw) {
      if (err) { console.error("Error conectando al Worker"); process.exit(1); }
      try {
        callback(JSON.parse(raw));
      } catch (e) {
        console.error("El Worker no devolvió JSON válido");
        process.exit(1);
      }
    });
  },
};

function processChannels(list) {
  const imgBase = "https://images.pluto.tv";
  // IMPORTANTE: Definimos la URL del EPG en la cabecera del M3U
  let m3u8_normal = "#EXTM3U x-tvg-url=\"epg.xml\"\n\n";
  let tv = [];

  list.forEach((channel) => {
    if (channel.isStitched && !channel.slug.match(/^announcement|^privacy-policy/)) {
      
      // Sincronización de IDs: Usamos el slug para que sea legible y único
      const idSincro = channel.slug; 
      let logoPath = channel.colorLogoPNG ? channel.colorLogoPNG.path : "";
      let finalLogo = logoPath.startsWith("http") ? logoPath : `${imgBase}${logoPath}`;

      // URL Directa que ya te funcionó
      const directUrl = `http://stitcher.pluto.tv/stitch/hls/channel/${channel._id}/master.m3u8?advertisingId=&appName=web&appVersion=unknown&appStoreUrl=&architecture=&buildVersion=&clientDeviceType=0&deviceDNT=0&deviceId=${idSincro}&deviceMake=web&deviceModel=web&deviceType=web&deviceVersion=unknown&sid=${idSincro}&marketingName=web&sessionID=${idSincro}`;

      // M3U: Añadimos tvg-id para vincular con el XML
      m3u8_normal += `#EXTINF:0 tvg-id="${idSincro}" tvg-name="${channel.name}" tvg-logo="${finalLogo}" group-title="${channel.category}", ${channel.name}\n`;
      m3u8_normal += `${directUrl}\n\n`;

      // EPG: Canal
      tv.push({
        name: "channel", attrs: { id: idSincro },
        children: [
          { name: "display-name", text: channel.name },
          { name: "icon", attrs: { src: finalLogo } }
        ]
      });

      // EPG: Programas
      if (channel.timelines && Array.isArray(channel.timelines)) {
        channel.timelines.forEach((prog) => {
          tv.push({
            name: "programme",
            attrs: {
              // El formato YYYYMMDDHHmmss ZZ es el estándar para IPTVnator
              start: moment(prog.start).format("YYYYMMDDHHmmss ZZ"),
              stop: moment(prog.stop).format("YYYYMMDDHHmmss ZZ"),
              channel: idSincro // DEBE ser igual al id de 'channel' arriba
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

  // Guardado de archivos
  fs.writeFileSync("epg.xml", j2x({ tv }, { prettyPrint: true, escape: true }));
  fs.writeFileSync("playlist.m3u", m3u8_normal);
  fs.writeFileSync("playlist_hq.m3u", m3u8_normal);
  
  const totalProgs = tv.filter(item => item.name === "programme").length;
  console.log(`[SUCCESS] Canales: ${list.length} | Programas: ${totalProgs}`);
}

plutoIPTV.grabJSON(processChannels);

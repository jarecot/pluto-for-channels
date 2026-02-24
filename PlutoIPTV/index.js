#!/usr/bin/env node

const request = require("request");
const j2x = require("jsontoxml");
const moment = require("moment");
const fs = require("fs-extra");
const { v4: uuid4 } = require("uuid");

const plutoIPTV = {
  grabJSON: function (callback) {
    console.log("[INFO] Fetching channels...");
    const workerUrl = `https://floral-salad-5e9d.zinhoflix.workers.dev/`;

    request({
      url: workerUrl,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, function (err, res, raw) {
      if (err) process.exit(1);
      try {
        callback(JSON.parse(raw));
      } catch (e) {
        process.exit(1);
      }
    });
  },
};

function processChannels(list) {
  const imgBase = "https://images.pluto.tv";
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
  
  let m3u8 = "#EXTM3U x-tvg-url=\"epg.xml\"\n\n";
  let tv = [];

  list.forEach((channel) => {
    if (channel.isStitched && !channel.slug.match(/^announcement|^privacy-policy/)) {
      
      // Usamos el ID de Pluto como ID de sincronización, es más seguro que el slug
      const idSincro = channel._id; 
      let rawUrl = channel.stitched.urls[0].url;
      let finalLogo = channel.colorLogoPNG.path.startsWith("http") ? channel.colorLogoPNG.path : `${imgBase}${channel.colorLogoPNG.path}`;

      // URL con User-Agent para calidad
      let urlObj = new URL(rawUrl);
      urlObj.searchParams.set("sid", uuid4());
      urlObj.searchParams.set("deviceId", idSincro);
      const finalLink = `${urlObj.toString()}|User-Agent=${encodeURIComponent(ua)}`;

      // En el M3U, tvg-id DEBE coincidir con el id del canal en el XML
      m3u8 += `#EXTINF:0 tvg-id="${idSincro}" tvg-name="${channel.name}" tvg-logo="${finalLogo}" group-title="${channel.category || 'Pluto TV'}", ${channel.name}\n`;
      m3u8 += `${finalLink}\n\n`;

      // Estructura XMLTV Canal
      tv.push({
        name: "channel",
        attrs: { id: idSincro },
        children: [
          { name: "display-name", text: channel.name },
          { name: "icon", attrs: { src: finalLogo } }
        ]
      });

      // Estructura XMLTV Programas
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

  // Generar XML con el tag raíz <tv> requerido por el estándar
  const xmlOutput = j2x({ tv }, { prettyPrint: true, escape: true });
  // Añadimos manualmente el encabezado XML para que sea válido
  const finalXml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE tv SYSTEM "xmltv.dtd">\n${xmlOutput}`;

  fs.writeFileSync("epg.xml", finalXml);
  fs.writeFileSync("playlist.m3u", m3u8);
  
  console.log(`[SUCCESS] Procesado con ${tv.filter(x => x.name === 'programme').length} programas.`);
}

plutoIPTV.grabJSON(processChannels);

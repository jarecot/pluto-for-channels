#!/usr/bin/env node

const request = require("request");
const j2x = require("jsontoxml");
const moment = require("moment");
const fs = require("fs-extra");
const { v4: uuid4 } = require("uuid");

const plutoIPTV = {
  grabJSON: function (callback) {
    console.log("[INFO] Solicitando canales y programas al Worker...");
    // El Worker debe devolver el JSON completo incluyendo 'timelines'
    const workerUrl = `https://floral-salad-5e9d.zinhoflix.workers.dev/`;

    request({
      url: workerUrl,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 30000 // Aumentamos el tiempo de espera a 30 seg
    }, function (err, res, raw) {
      if (err) {
        console.error("[ERROR] No se pudo conectar con el Worker:", err.message);
        process.exit(1);
      }
      try {
        const data = JSON.parse(raw);
        callback(data);
      } catch (e) {
        console.error("[ERROR] La respuesta del Worker no es un JSON válido.");
        process.exit(1);
      }
    });
  },
};

function processChannels(list) {
  if (!Array.isArray(list)) {
    console.error("[ERROR] La lista de canales no es un array.");
    process.exit(1);
  }

  const imgBase = "https://images.pluto.tv";
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
  
  let m3u8 = "#EXTM3U x-tvg-url=\"epg.xml\"\n\n";
  let tv = [];
  let countProgs = 0;

  list.forEach((channel) => {
    // Verificamos que sea un canal válido y tenga slug
    if (channel.slug && !channel.slug.match(/^announcement|^privacy-policy/)) {
      
      const idSincro = channel.slug; // Usamos slug para máxima compatibilidad
      let rawUrl = (channel.stitched && channel.stitched.urls) ? channel.stitched.urls[0].url : "";
      
      if (!rawUrl) return; // Si no hay URL de streaming, saltar

      let logoPath = (channel.colorLogoPNG && channel.colorLogoPNG.path) ? channel.colorLogoPNG.path : "";
      let finalLogo = logoPath.startsWith("http") ? logoPath : `${imgBase}${logoPath}`;

      // Configuración de URL (Cabeceras que funcionan)
      let urlObj = new URL(rawUrl);
      urlObj.searchParams.set("sid", uuid4());
      urlObj.searchParams.set("deviceId", idSincro);
      const finalLink = `${urlObj.toString()}|User-Agent=${encodeURIComponent(ua)}`;

      m3u8 += `#EXTINF:0 tvg-id="${idSincro}" tvg-name="${channel.name}" tvg-logo="${finalLogo}" group-title="${channel.category || 'Pluto TV'}", ${channel.name}\n`;
      m3u8 += `${finalLink}\n\n`;

      // EPG: Datos del Canal
      tv.push({
        name: "channel",
        attrs: { id: idSincro },
        children: [
          { name: "display-name", text: channel.name },
          { name: "icon", attrs: { src: finalLogo } }
        ]
      });

      // EPG: Datos de Programación (CORRECCIÓN AQUÍ)
      // Revisamos 'timelines' o 'programs' según lo que devuelva el worker
      const programas = channel.timelines || channel.programs || [];

      if (programas.length > 0) {
        programas.forEach((prog) => {
          countProgs++;
          tv.push({
            name: "programme",
            attrs: {
              start: moment(prog.start).format("YYYYMMDDHHmmss ZZ"),
              stop: moment(prog.stop).format("YYYYMMDDHHmmss ZZ"),
              channel: idSincro
            },
            children: [
              { name: "title", attrs: { lang: "es" }, text: prog.title || "Sin título" },
              { name: "desc", attrs: { lang: "es" }, text: (prog.episode && prog.episode.description) ? prog.episode.description : (prog.description || "Sin descripción") }
            ]
          });
        });
      }
    }
  });

  // Si después de todo el loop no hay programas, avisar
  if (countProgs === 0) {
    console.warn("[WARN] No se encontraron programas en el JSON del Worker.");
  }

  // Generación del XML final
  const xmlContents = j2x({ tv }, { prettyPrint: true, escape: true });
  const finalXml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE tv SYSTEM "xmltv.dtd">\n${xmlContents}`;

  fs.writeFileSync("epg.xml", finalXml);
  fs.writeFileSync("playlist.m3u", m3u8);
  
  console.log(`[SUCCESS] Canales procesados: ${list.length}`);
  console.log(`[SUCCESS] Programas encontrados: ${countProgs}`);
}

plutoIPTV.grabJSON(processChannels);

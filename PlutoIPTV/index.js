#!/usr/bin/env node

// Forzamos la zona horaria de Colombia para que moment genere los offsets -0500
process.env.TZ = 'America/Bogota';

const request = require("request");
const j2x = require("jsontoxml");
const moment = require("moment");
const fs = require("fs-extra");
const { v4: uuid4 } = require("uuid");

const plutoIPTV = {
  grabJSON: function (callback) {
    console.log("[INFO] Consultando API de Pluto TV (Región: CO)...");

    // Ventana amplia: 4 horas atrás y 24 adelante para que la guía esté siempre llena
    const startTime = moment().subtract(4, 'hours').format("YYYY-MM-DDTHH:00:00.000Z");
    const stopTime = moment().add(24, 'hours').format("YYYY-MM-DDTHH:00:00.000Z");

    const params = new URLSearchParams({
        start: startTime,
        stop: stopTime,
        region: "CO",
        appName: "web",
        appVersion: "5.33.0",
        deviceType: "web",
        deviceMake: "chrome",
        deviceModel: "chrome",
        sid: uuid4(),
        deviceId: uuid4()
    });

    const apiUrl = `https://api.pluto.tv/v2/channels?${params.toString()}`;

    request({
      url: apiUrl,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'X-Forwarded-For': '181.128.0.0' 
      },
      timeout: 30000
    }, function (err, res, raw) {
      if (err) {
        console.error("[ERROR] Error de conexión:", err.message);
        process.exit(1);
      }
      try {
        const data = JSON.parse(raw);
        callback(data);
      } catch (e) {
        console.error("[ERROR] No se recibió JSON válido de Pluto.");
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
  let countProgs = 0;

  list.forEach((channel) => {
    if (channel.isStitched && channel.slug && !channel.slug.match(/^announcement|^privacy-policy/)) {
      
      const idSincro = channel.slug;
      let rawUrl = channel.stitched.urls[0].url;
      let logoPath = channel.colorLogoPNG ? channel.colorLogoPNG.path : "";
      let finalLogo = logoPath.startsWith("http") ? logoPath : `${imgBase}${logoPath}`;

      let urlObj = new URL(rawUrl);
      urlObj.searchParams.set("sid", uuid4());
      urlObj.searchParams.set("deviceId", idSincro);
      const finalLink = `${urlObj.toString()}|User-Agent=${encodeURIComponent(ua)}`;

      m3u8 += `#EXTINF:0 tvg-id="${idSincro}" tvg-name="${channel.name}" tvg-logo="${finalLogo}" group-title="${channel.category || 'Pluto TV'}", ${channel.name}\n`;
      m3u8 += `${finalLink}\n\n`;

      tv.push({
        name: "channel",
        attrs: { id: idSincro },
        children: [
          { name: "display-name", text: channel.name },
          { name: "icon", attrs: { src: finalLogo } }
        ]
      });

      if (channel.timelines && channel.timelines.length > 0) {
        channel.timelines.forEach((prog) => {
          countProgs++;
          // Generamos la fecha con el offset -0500 explícito
          const startTime = moment(prog.start).format("YYYYMMDDHHmmss ZZ");
          const stopTime = moment(prog.stop).format("YYYYMMDDHHmmss ZZ");

          tv.push({
            name: "programme",
            attrs: {
              start: startTime,
              stop: stopTime,
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

  const xmlContents = j2x({ tv }, { prettyPrint: true, escape: true });
  const finalXml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE tv SYSTEM "xmltv.dtd">\n${xmlContents}`;

  fs.writeFileSync("epg.xml", finalXml);
  fs.writeFileSync("playlist.m3u", m3u8);
  
  console.log(`[SUCCESS] Canales: ${list.length} | Programas: ${countProgs}`);
}

plutoIPTV.grabJSON(processChannels);

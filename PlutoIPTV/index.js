#!/usr/bin/env node

const request = require("request");
const j2x = require("jsontoxml");
const moment = require("moment");
const fs = require("fs-extra");
const uuid4 = require("uuid").v4;

const plutoIPTV = {
  grabJSON: function (callback) {
    console.log("[INFO] Grabbing EPG for Pluto TV Colombia...");

    // Ventana de tiempo: 2 horas atrás y 8 hacia adelante
    const startTime = moment().subtract(2, 'hours').format("YYYY-MM-DDTHH:00:00.000Z");
    const stopTime = moment().add(8, 'hours').format("YYYY-MM-DDTHH:00:00.000Z");

    const params = new URLSearchParams({
        start: startTime,
        stop: stopTime,
        region: "CO",
        serverSideAds: "true",
        advertisingId: uuid4(),
        appName: "web",
        deviceType: "web",
        sid: uuid4()
    });

    const apiUrl = `https://api.pluto.tv/v2/channels?${params.toString()}`;

    request({
      url: apiUrl,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Forwarded-For': '181.128.0.0' // IP simulada de Colombia
      }
    }, function (err, res, raw) {
      if (err) {
        console.error("[ERROR] API inalcanzable:", err);
        process.exit(1);
      }
      try {
        callback(JSON.parse(raw));
      } catch (e) {
        console.error("[ERROR] JSON inválido");
        process.exit(1);
      }
    });
  },
};

function processChannels(list) {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const imgBase = "https://images.pluto.tv";
  
  let m3u8_normal = "#EXTM3U x-tvg-url=\"epg.xml\"\n\n";
  let m3u8_hq = "#EXTM3U x-tvg-url=\"epg.xml\"\n\n";
  let tv = [];

  list.forEach((channel) => {
    // Filtramos canales basura
    if (channel.isStitched && !channel.slug.match(/^announcement|^privacy-policy/)) {
      
      const idSincro = channel.slug; // ID único para vincular M3U con XML
      let rawUrl = channel.stitched.urls[0].url;
      let logoPath = channel.colorLogoPNG ? channel.colorLogoPNG.path : "";
      let finalLogo = logoPath.startsWith("http") ? logoPath : `${imgBase}${logoPath}`;
      let category = channel.category || "Pluto TV";

      // --- M3U NORMAL ---
      let urlN = new URL(rawUrl);
      urlN.searchParams.set("region", "CO");
      urlN.searchParams.set("sid", uuid4());
      m3u8_normal += `#EXTINF:0 tvg-id="${idSincro}" tvg-logo="${finalLogo}" group-title="${category}", ${channel.name}\n`;
      m3u8_normal += `${urlN.toString()}|User-Agent=${encodeURIComponent(ua)}\n\n`;

      // --- M3U HQ ---
      let urlH = new URL(rawUrl);
      urlH.searchParams.set("region", "CO");
      urlH.searchParams.set("bandwidth", "10000000");
      urlH.searchParams.set("maxVideoHeight", "1080");
      m3u8_hq += `#EXTINF:0 tvg-id="${idSincro}" tvg-logo="${finalLogo}" group-title="${category}", ${channel.name} (HQ)\n`;
      m3u8_hq += `${urlH.toString()}|User-Agent=${encodeURIComponent(ua)}\n\n`;

      // --- XMLTV CANAL ---
      tv.push({
        name: "channel", attrs: { id: idSincro },
        children: [
          { name: "display-name", text: channel.name },
          { name: "icon", attrs: { src: finalLogo } }
        ]
      });

      // --- XMLTV PROGRAMAS ---
      if (channel.timelines && channel.timelines.length > 0) {
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

  // Guardado local
  fs.writeFileSync("epg.xml", j2x({ tv }, { prettyPrint: true, escape: true }));
  fs.writeFileSync("playlist.m3u", m3u8_normal);
  fs.writeFileSync("playlist_hq.m3u", m3u8_hq);
  
  console.log(`[SUCCESS] Canales: ${list.length} | Programas: ${tv.filter(x => x.name === 'programme').length}`);
}

plutoIPTV.grabJSON(processChannels);

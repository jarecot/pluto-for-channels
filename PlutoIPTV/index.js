#!/usr/bin/env node

const request = require("request");
const j2x = require("jsontoxml");
const moment = require("moment");
const fs = require("fs-extra");
const uuid4 = require("uuid").v4;

const plutoIPTV = {
  grabJSON: function (callback) {
    console.log("[INFO] Grabbing EPG for Pluto TV Colombia...");

    const startTime = moment().subtract(2, 'hours').format("YYYY-MM-DDTHH:00:00.000Z");
    const stopTime = moment().add(8, 'hours').format("YYYY-MM-DDTHH:00:00.000Z");

    // Parámetros específicos para Colombia
    const params = new URLSearchParams({
        start: startTime,
        stop: stopTime,
        region: "CO",              // Código de país: Colombia
        serverSideAds: "true",
        duration: "300",
        advertisingId: uuid4(),
        appName: "web",
        appVersion: "5.33.0",
        deviceType: "web",
        deviceMake: "chrome",
        deviceModel: "chrome",
        deviceVersion: "120.0.0",
        sid: uuid4()
    });

    const apiUrl = `https://api.pluto.tv/v2/channels?${params.toString()}`;

    request({
      url: apiUrl,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Forwarded-For': '181.128.0.0' // IP simulada de Colombia (Bogotá) para forzar la región
      }
    }, function (err, res, raw) {
      if (err) {
        console.error("[ERROR] API Pluto inalcanzable:", err);
        process.exit(1);
      }
      try {
        const data = JSON.parse(raw);
        callback(data);
      } catch (e) {
        console.error("[ERROR] No se recibió JSON válido. Posible bloqueo regional.");
        process.exit(1);
      }
    });
  },
};

function processChannels(list) {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const imgBase = "https://images.pluto.tv";
  
  let m3u8_normal = "#EXTM3U\n\n";
  let m3u8_hq = "#EXTM3U\n\n";
  let tv = [];

  list.forEach((channel) => {
    if (channel.isStitched && !channel.slug.match(/^announcement|^privacy-policy/)) {
      let rawUrl = channel.stitched.urls[0].url;
      let logoPath = channel.colorLogoPNG ? channel.colorLogoPNG.path : "";
      let finalLogo = logoPath.startsWith("http") ? logoPath : `${imgBase}${logoPath}`;
      
      // Playlist Normal
      let urlN = new URL(rawUrl);
      urlN.searchParams.set("region", "CO");
      m3u8_normal += `#EXTINF:0 channel-id="${channel.slug}" tvg-logo="${finalLogo}" group-title="${channel.category}", ${channel.name}\n`;
      m3u8_normal += `${urlN.toString()}|User-Agent=${encodeURIComponent(ua)}\n\n`;

      // Playlist HQ
      let urlH = new URL(rawUrl);
      urlH.searchParams.set("region", "CO");
      urlH.searchParams.set("bandwidth", "10000000");
      urlH.searchParams.set("maxVideoHeight", "1080");
      m3u8_hq += `#EXTINF:0 channel-id="${channel.slug}" tvg-logo="${finalLogo}" group-title="${channel.category}", ${channel.name} (HQ)\n`;
      m3u8_hq += `${urlH.toString()}|User-Agent=${encodeURIComponent(ua)}\n\n`;

      // EPG Channel
      tv.push({
        name: "channel", attrs: { id: channel.slug },
        children: [{ name: "display-name", text: channel.name }, { name: "icon", attrs: { src: finalLogo } }]
      });

      // EPG Programmes
      if (channel.timelines && channel.timelines.length > 0) {
        channel.timelines.forEach((prog) => {
          tv.push({
            name: "programme",
            attrs: {
              start: moment(prog.start).format("YYYYMMDDHHmmss ZZ"),
              stop: moment(prog.stop).format("YYYYMMDDHHmmss ZZ"),
              channel: channel.slug
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
  
  const progCount = tv.filter(x => x.name === "programme").length;
  console.log(`[SUCCESS] Procesados ${list.length} canales y ${progCount} programas (Región: Colombia).`);
}

plutoIPTV.grabJSON(processChannels);

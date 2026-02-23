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

    const params = new URLSearchParams({
        start: startTime,
        stop: stopTime,
        region: "CO",
        appName: "web",
        appVersion: "unknown",
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
      }
    }, function (err, res, raw) {
      if (err) { process.exit(1); }
      try {
        callback(JSON.parse(raw));
      } catch (e) {
        process.exit(1);
      }
    });
  },
};

function processChannels(list) {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
  const imgBase = "https://images.pluto.tv";
  
  let m3u8_normal = "#EXTM3U\n\n";
  let m3u8_hq = "#EXTM3U\n\n";
  let tv = [];

  list.forEach((channel) => {
    if (channel.isStitched && !channel.slug.match(/^announcement|^privacy-policy/)) {
      
      const idSincro = channel.slug;
      let rawUrl = channel.stitched.urls[0].url;
      let finalLogo = channel.colorLogoPNG.path.startsWith("http") ? channel.colorLogoPNG.path : `${imgBase}${channel.colorLogoPNG.path}`;

      // --- URL LIMPIA PARA MÁXIMA COMPATIBILIDAD ---
      // Eliminamos parámetros extra que pueden romper el stream
      let urlObj = new URL(rawUrl);
      urlObj.searchParams.set("appName", "web");
      urlObj.searchParams.set("deviceMake", "chrome");
      urlObj.searchParams.set("sid", uuid4());
      urlObj.searchParams.set("deviceId", uuid4());

      m3u8_normal += `#EXTINF:0 tvg-id="${idSincro}" tvg-logo="${finalLogo}" group-title="${channel.category}", ${channel.name}\n`;
      m3u8_normal += `${urlObj.toString()}\n\n`;

      m3u8_hq += `#EXTINF:0 tvg-id="${idSincro}" tvg-logo="${finalLogo}" group-title="${channel.category}", ${channel.name} (HQ)\n`;
      m3u8_hq += `${urlObj.toString()}&bandwidth=10000000\n\n`;

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
  console.log("Generado con éxito.");
}

plutoIPTV.grabJSON(processChannels);

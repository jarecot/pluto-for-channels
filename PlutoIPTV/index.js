#!/usr/bin/env node

const request = require("request");
const j2x = require("jsontoxml");
const moment = require("moment");
const fs = require("fs-extra");
const uuid4 = require("uuid").v4;
const uuid1 = require("uuid").v1;

const plutoIPTV = {
  grabJSON: function (callback) {
    callback = callback || function () {};
    console.log("[INFO] Grabbing EPG...");

    const MAX_RETRIES = 3;
    const RETRY_DELAY = 10000;

    function requestWithRetry(url, retries = MAX_RETRIES) {
      return new Promise((resolve, reject) => {
        function attempt() {
          request(url, function (err, code, raw) {
            if (err) {
              if (retries > 0) {
                setTimeout(attempt, RETRY_DELAY);
                retries--;
              } else {
                reject(err);
              }
            } else {
              try {
                resolve(JSON.parse(raw));
              } catch(e) {
                resolve([]);
              }
            }
          });
        }
        attempt();
      });
    }

    let promises = [];
    // Pedimos varios bloques para asegurar programación completa
    for (let i = 0; i < 4; i++) {
      let workerUrl = `https://floral-salad-5e9d.zinhoflix.workers.dev/`;
      promises.push(requestWithRetry(workerUrl));
    }

    let channelsList = {};
    Promise.all(promises).then((results) => {
      results.forEach((channels) => {
        if (!Array.isArray(channels)) return;
        channels.forEach((channel) => {
          if (!channel || !channel._id) return;
          if (!channelsList[channel._id]) {
            channelsList[channel._id] = channel;
            if (!channelsList[channel._id].timelines) channelsList[channel._id].timelines = [];
          } else if (channel.timelines && Array.isArray(channel.timelines)) {
            const existingIds = new Set(channelsList[channel._id].timelines.map(t => t._id));
            channel.timelines.forEach(t => {
                if(!existingIds.has(t._id)) channelsList[channel._id].timelines.push(t);
            });
          }
        });
      });

      let sortedChannels = Object.values(channelsList).sort(({ number: a }, { number: b }) => a - b);
      callback(sortedChannels);
    }).catch((err) => {
      console.error("[ERROR]", err);
      process.exit(1);
    });
  },
};

function processChannels(list) {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const imgBase = "https://images.pluto.tv";
  
  let channels = [];
  let seenChannels = {};
  list.forEach((channel) => {
    if (seenChannels[channel.number]) return;
    seenChannels[channel.number] = true;
    channels.push(channel);
  });

  let m3u8_normal = "#EXTM3U\n\n";
  let m3u8_hq = "#EXTM3U\n\n";
  let tv = []; // Aquí se define la variable tv

  channels.forEach((channel) => {
    if (channel.isStitched && !channel.slug.match(/^announcement|^privacy-policy/)) {
      
      let rawUrl = channel.stitched.urls[0].url;
      let logoPath = channel.colorLogoPNG ? channel.colorLogoPNG.path : "";
      let finalLogo = logoPath.startsWith("http") ? logoPath : `${imgBase}${logoPath}`;
      let group = channel.category || "Pluto TV";
      
      // --- LÓGICA M3U NORMAL ---
      let urlNormal = new URL(rawUrl);
      urlNormal.searchParams.set("appName", "web");
      urlNormal.searchParams.set("deviceId", uuid1());
      urlNormal.searchParams.set("sid", uuid4());
      urlNormal.searchParams.set("serverSideAds", "true");
      const linkNormal = `${urlNormal.toString()}|User-Agent=${encodeURIComponent(ua)}`;

      m3u8_normal += `#EXTINF:0 channel-id="${channel.slug}" tvg-logo="${finalLogo}" group-title="${group}", ${channel.name}\n`;
      m3u8_normal += `#EXTVLCOPT:http-user-agent=${ua}\n${linkNormal}\n\n`;

      // --- LÓGICA M3U HQ ---
      let urlHQ = new URL(rawUrl);
      urlHQ.searchParams.set("appName", "web");
      urlHQ.searchParams.set("deviceId", uuid1());
      urlHQ.searchParams.set("sid", uuid4());
      urlHQ.searchParams.set("serverSideAds", "true");
      urlHQ.searchParams.set("bandwidth", "10000000");
      urlHQ.searchParams.set("maxVideoHeight", "1080");
      const linkHQ = `${urlHQ.toString()}|User-Agent=${encodeURIComponent(ua)}`;

      m3u8_hq += `#EXTINF:0 channel-id="${channel.slug}" tvg-logo="${finalLogo}" group-title="${group}", ${channel.name} (HQ)\n`;
      m3u8_hq += `#EXTVLCOPT:http-user-agent=${ua}\n${linkHQ}\n\n`;

      // --- LÓGICA EPG PARA ESTE CANAL ---
      tv.push({
        name: "channel", attrs: { id: channel.slug },
        children: [
          { name: "display-name", text: channel.name },
          { name: "icon", attrs: { src: finalLogo } }
        ]
      });

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

  // GUARDADO DE ARCHIVOS (Dentro de la función, usando ../ para ir a la raíz)
  fs.writeFileSync("../epg.xml", j2x({ tv }, { prettyPrint: true, escape: true }));
  fs.writeFileSync("../playlist.m3u", m3u8_normal);
  fs.writeFileSync("../playlist_hq.m3u", m3u8_hq);
  
  console.log(`[SUCCESS] Files generated! Channels: ${channels.length}`);
}

plutoIPTV.grabJSON(function (channels) {
  processChannels(channels);
});

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
    console.log("[INFO] Grabbing EPG with Time Windows...");

    // Pluto TV necesita saber qué horas quieres (pedimos desde hace 1 hora hasta +6 horas)
    const startTime = moment().subtract(1, 'hours').format("YYYY-MM-DDTHH:00:00.000Z");
    const stopTime = moment().add(6, 'hours').format("YYYY-MM-DDTHH:00:00.000Z");

    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5000;

    function requestWithRetry(url, retries = MAX_RETRIES) {
      return new Promise((resolve, reject) => {
        function attempt() {
          // Construimos la URL con los parámetros de tiempo necesarios para el EPG
          const finalUrl = `${url}?start=${encodeURIComponent(startTime)}&stop=${encodeURIComponent(stopTime)}`;
          
          request(finalUrl, function (err, code, raw) {
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
                console.log("[WARN] Response is not JSON, returning empty.");
                resolve([]);
              }
            }
          });
        }
        attempt();
      });
    }

    let promises = [];
    let workerUrl = `https://floral-salad-5e9d.zinhoflix.workers.dev/`;
    // Hacemos dos peticiones para asegurar que cubrimos todos los datos
    promises.push(requestWithRetry(workerUrl));
    promises.push(requestWithRetry(workerUrl));

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
            // Unir timelines sin duplicar programas por su _id
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
      console.error("[ERROR] Failed to fetch data:", err);
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
  let tv = []; // Definición de la estructura XMLTV

  channels.forEach((channel) => {
    if (channel.isStitched && !channel.slug.match(/^announcement|^privacy-policy/)) {
      
      let rawUrl = channel.stitched.urls[0].url;
      let logoPath = channel.colorLogoPNG ? channel.colorLogoPNG.path : "";
      let finalLogo = logoPath.startsWith("http") ? logoPath : `${imgBase}${logoPath}`;
      let group = channel.category || "Pluto TV";
      
      // --- PLAYLIST NORMAL ---
      let urlNormal = new URL(rawUrl);
      urlNormal.searchParams.set("appName", "web");
      urlNormal.searchParams.set("sid", uuid4());
      urlNormal.searchParams.set("serverSideAds", "true");
      const linkNormal = `${urlNormal.toString()}|User-Agent=${encodeURIComponent(ua)}`;

      m3u8_normal += `#EXTINF:0 channel-id="${channel.slug}" tvg-logo="${finalLogo}" group-title="${group}", ${channel.name}\n`;
      m3u8_normal += `#EXTVLCOPT:http-user-agent=${ua}\n${linkNormal}\n\n`;

      // --- PLAYLIST HQ ---
      let urlHQ = new URL(rawUrl);
      urlHQ.searchParams.set("appName", "web");
      urlHQ.searchParams.set("sid", uuid4());
      urlHQ.searchParams.set("bandwidth", "10000000");
      urlHQ.searchParams.set("maxVideoHeight", "1080");
      const linkHQ = `${urlHQ.toString()}|User-Agent=${encodeURIComponent(ua)}`;

      m3u8_hq += `#EXTINF:0 channel-id="${channel.slug}" tvg-logo="${finalLogo}" group-title="${group}", ${channel.name} (HQ)\n`;
      m3u8_hq += `#EXTVLCOPT:http-user-agent=${ua}\n${linkHQ}\n\n`;

      // --- EPG: CANAL ---
      tv.push({
        name: "channel", attrs: { id: channel.slug },
        children: [
          { name: "display-name", text: channel.name },
          { name: "icon", attrs: { src: finalLogo } }
        ]
      });

      // --- EPG: PROGRAMAS ---
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
              { name: "desc", attrs: { lang: "es" }, text: (prog.episode && prog.episode.description) ? prog.episode.description : "Sin descripción disponible" }
            ]
          });
        });
      }
    }
  });

  // Guardar archivos en la raíz del repositorio (../)
  fs.writeFileSync("../epg.xml", j2x({ tv }, { prettyPrint: true, escape: true }));
  fs.writeFileSync("../playlist.m3u", m3u8_normal);
  fs.writeFileSync("../playlist_hq.m3u", m3u8_hq);
  
  const progCount = tv.filter(x => x.name === "programme").length;
  console.log(`[SUCCESS] Channels: ${channels.length} | Programmes: ${progCount}`);
}

plutoIPTV.grabJSON(function (channels) {
  processChannels(channels);
});

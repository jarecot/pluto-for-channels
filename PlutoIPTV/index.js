#!/usr/bin/env node

const request = require("request");
const j2x = require("jsontoxml");
const moment = require("moment");
const fs = require("fs-extra");
const uuid4 = require("uuid").v4;
const uuid1 = require("uuid").v1;
const url = require("url");

const conflictingChannels = ["cnn", "dabl", "heartland", "newsy", "buzzr"];

const plutoIPTV = {
  grabJSON: function (callback) {
    callback = callback || function () {};
    console.log("[INFO] Grabbing EPG...");

    let startMoment = moment();
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
    for (let i = 0; i < 4; i++) {
      // USAMOS TU URL DE CLOUDFLARE
      let workerUrl = `https://floral-salad-5e9d.zinhoflix.workers.dev/`;
      promises.push(requestWithRetry(workerUrl));
    }

    let channelsList = {};
    Promise.all(promises).then((results) => {
      results.forEach((channels) => {
        if (!Array.isArray(channels)) return;
        channels.forEach((channel) => {
          if (!channel || !channel._id) return;
          let foundChannel = channelsList[channel._id];
          if (!foundChannel) {
            channelsList[channel._id] = channel;
            if (!channelsList[channel._id].timelines) channelsList[channel._id].timelines = [];
          } else if (channel.timelines && Array.isArray(channel.timelines)) {
            foundChannel.timelines = foundChannel.timelines.concat(channel.timelines);
          }
        });
      });

      let fullChannels = Object.values(channelsList);
      let sortedChannels = fullChannels.sort(({ number: a }, { number: b }) => a - b);
      callback(sortedChannels);
    }).catch((err) => {
      console.error(err);
      process.exit(1);
    });
  },
};

function processChannels(version, list) {
  let seenChannels = {};
  let channels = [];
  list.forEach((channel) => {
    if (seenChannels[channel.number]) return;
    seenChannels[channel.number] = true;
    channels.push(channel);
  });

  let m3u8 = "#EXTM3U\n\n";
  channels.forEach((channel) => {
    if (channel.isStitched && !channel.slug.match(/^announcement|^privacy-policy/)) {
      let m3uUrl = channel.stitched.urls[0].url + "&country=CO&language=es&deviceId=" + uuid1() + "&sid=" + uuid4();
      let logo = channel.colorLogoPNG ? channel.colorLogoPNG.path : "";
      let group = channel.category || "Pluto TV";
      let name = channel.name;
      m3u8 += `#EXTINF:0 channel-id="${channel.slug}" tvg-logo="${logo}" group-title="${group}", ${name}\n${m3uUrl}\n\n`;
    }
  });

  let tv = [];
  channels.forEach((channel) => {
    tv.push({
      name: "channel",
      attrs: { id: channel.slug },
      children: [
        { name: "display-name", text: channel.name },
        { name: "icon", attrs: { src: channel.colorLogoPNG ? channel.colorLogoPNG.path : "" } }
      ]
    });
    if (channel.timelines) {
      channel.timelines.forEach((prog) => {
        tv.push({
          name: "programme",
          attrs: {
            start: moment(prog.start).format("YYYYMMDDHHmmss ZZ"),
            stop: moment(prog.stop).format("YYYYMMDDHHmmss ZZ"),
            channel: channel.slug
          },
          children: [
            { name: "title", attrs: { lang: "es" }, text: prog.title },
            { name: "desc", attrs: { lang: "es" }, text: prog.episode ? prog.episode.description : "" }
          ]
        });
      });
    }
  });

  let epg = j2x({ tv }, { prettyPrint: true, escape: true });
  fs.writeFileSync("epg.xml", epg);
  fs.writeFileSync("playlist.m3u", m3u8);
  console.log("[SUCCESS] Files generated!");
}

plutoIPTV.grabJSON(function (channels) {
  processChannels("main", channels);
});

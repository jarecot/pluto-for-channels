#!/usr/bin/env node
process.env.TZ = 'America/Bogota';

const request = require("request");
const j2x = require("jsontoxml");
const moment = require("moment");
const fs = require("fs-extra");
const { v4: uuid4 } = require("uuid");

const plutoIPTV = {
    grabJSON: function (callback) {
        console.log("[INFO] Consultando API de Pluto TV...");
        const startTime = moment().subtract(6, 'hours').format("YYYY-MM-DDTHH:00:00.000Z");
        const stopTime = moment().add(24, 'hours').format("YYYY-MM-DDTHH:00:00.000Z");

        const params = new URLSearchParams({
            start: startTime,
            stop: stopTime,
            region: "CO",
            appName: "web",
            appVersion: "5.33.0",
            deviceType: "web",
            sid: uuid4(),
            deviceId: uuid4()
        });

        request({
            url: `https://api.pluto.tv/v2/channels?${params.toString()}`,
            headers: { 'X-Forwarded-For': '181.128.0.0' },
            timeout: 30000
        }, (err, res, raw) => {
            if (err) process.exit(1);
            try { callback(JSON.parse(raw)); } catch (e) { process.exit(1); }
        });
    },
};

function processChannels(list) {
    const imgBase = "https://images.pluto.tv";
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
    
    let m3u8 = "#EXTM3U\n\n";
    let tv = [];
    let countProgs = 0;

    list.forEach((channel) => {
        if (channel.isStitched && channel.slug) {
            
            // ID DE VINCULACIÓN: Usamos el slug para que sea legible y estable
            const idSincro = channel.slug; 
            const channelName = channel.name.replace(/[&]/g, 'y');
            
            // --- URL DE VIDEO (LIMPIA Y FUNCIONAL) ---
            // Usamos el formato stitcher directo que ya te funcionó anteriormente
            const videoUrl = `http://stitcher.pluto.tv/stitch/hls/channel/${channel._id}/master.m3u8?advertisingId=&appName=web&appVersion=unknown&appStoreUrl=&architecture=&buildVersion=&clientDeviceType=0&deviceDNT=0&deviceId=${idSincro}&deviceMake=web&deviceModel=web&deviceType=web&deviceVersion=unknown&sid=${uuid4()}&marketingName=web&sessionID=${uuid4()}`;

            let logoPath = channel.colorLogoPNG ? channel.colorLogoPNG.path : "";
            let finalLogo = logoPath.startsWith("http") ? logoPath : `${imgBase}${logoPath}`;

            // M3U
            m3u8 += `#EXTINF:0 tvg-id="${idSincro}" tvg-logo="${finalLogo}" group-title="${channel.category || 'Pluto TV'}", ${channelName}\n`;
            m3u8 += `${videoUrl}\n\n`;

            // EPG Canal
            tv.push({
                name: "channel",
                attrs: { id: idSincro },
                children: [
                    { name: "display-name", text: channelName },
                    { name: "icon", attrs: { src: finalLogo } }
                ]
            });

            // EPG Programas
            if (channel.timelines && Array.isArray(channel.timelines)) {
                channel.timelines.forEach((prog) => {
                    countProgs++;
                    const title = (prog.title || "Sin título").replace(/[&]/g, 'y');
                    const desc = (prog.episode && prog.episode.description ? prog.episode.description : (prog.description || "Sin descripción")).replace(/[&]/g, 'y');

                    tv.push({
                        name: "programme",
                        attrs: {
                            start: moment(prog.start).format("YYYYMMDDHHmmss ZZ"),
                            stop: moment(prog.stop).format("YYYYMMDDHHmmss ZZ"),
                            channel: idSincro
                        },
                        children: [
                            { name: "title", attrs: { lang: "es" }, text: title },
                            { name: "desc", attrs: { lang: "es" }, text: desc }
                        ]
                    });
                });
            }
        }
    });

    const xmlBody = j2x(tv, { prettyPrint: true, escape: true });
    const finalXml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE tv SYSTEM "xmltv.dtd">\n<tv generator-info-name="Gemini-Pluto-CO">\n${xmlBody}\n</tv>`;

    fs.writeFileSync("epg.xml", finalXml);
    fs.writeFileSync("playlist.m3u", m3u8);
    
    console.log(`[SUCCESS] Canales: ${list.length} | Programas: ${countProgs}`);
}

plutoIPTV.grabJSON(processChannels);

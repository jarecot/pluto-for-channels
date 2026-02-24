#!/usr/bin/env node
process.env.TZ = 'America/Bogota';

const request = require("request");
const j2x = require("jsontoxml");
const moment = require("moment");
const fs = require("fs-extra");
const { v4: uuid4 } = require("uuid");

const plutoIPTV = {
    grabJSON: function (callback) {
        console.log("[INFO] Consultando API oficial de Pluto TV...");
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
            
            // Usamos el ID de Pluto como ID de canal, es el más estable
            const idSincro = channel._id; 
            const channelName = channel.name.replace(/[&]/g, 'y'); // Limpieza de caracteres
            
            let rawUrl = channel.stitched.urls[0].url;
            let logoPath = channel.colorLogoPNG ? channel.colorLogoPNG.path : "";
            let finalLogo = logoPath.startsWith("http") ? logoPath : `${imgBase}${logoPath}`;

            const finalLink = `${rawUrl}|User-Agent=${encodeURIComponent(ua)}`;

            // M3U: Forzamos tvg-id para que el software no tenga duda
            m3u8 += `#EXTINF:0 tvg-id="${idSincro}" tvg-name="${idSincro}" tvg-logo="${finalLogo}" group-title="${channel.category || 'Pluto TV'}", ${channelName}\n`;
            m3u8 += `${finalLink}\n\n`;

            // XMLTV: Definición de Canal
            tv.push({
                name: "channel",
                attrs: { id: idSincro },
                children: [
                    { name: "display-name", text: channelName },
                    { name: "icon", attrs: { src: finalLogo } }
                ]
            });

            // XMLTV: Programación
            if (channel.timelines && Array.isArray(channel.timelines)) {
                channel.timelines.forEach((prog) => {
                    countProgs++;
                    
                    // Limpieza de textos para evitar que el XML se rompa
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

    // Generar el cuerpo del XML
    const xmlBody = j2x(tv, { prettyPrint: true, escape: true });
    
    // CONSTRUCCIÓN MANUAL DEL CONTENEDOR RAIZ (Crucial para IPTVnator)
    const finalXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tv SYSTEM "xmltv.dtd">
<tv generator-info-name="Gemini-Pluto-CO">
${xmlBody}
</tv>`;

    fs.writeFileSync("epg.xml", finalXml);
    fs.writeFileSync("playlist.m3u", m3u8);
    
    console.log(`[SUCCESS] Sincronización completa: ${list.length} canales y ${countProgs} programas.`);
}

plutoIPTV.grabJSON(processChannels);

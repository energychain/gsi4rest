#!/usr/bin/env node
'use strict';

const Hapi = require('@hapi/hapi');
const persist = require('node-persist');
const axios = require('axios');
const moment = require('moment');
const storage = persist.create({ttl: 3500000});


const getGSI = async function(zip) {
  let gsi = await storage.getItem(zip);
  if(gsi == null) {
    let responds = await axios.get('https://api.corrently.io/core/gsi?zip='+zip);
    gsi = responds.data;
    storage.setItem(zip,gsi);
    return gsi;
  } else {
    return gsi;
  }
}


const init = async () => {
    await storage.init();

    const server = Hapi.server({
        port: 10080,
        host: 'localhost'
    });

    server.route({
        method: 'GET',
        path: '/',
        handler: (request, h) => {
            return 'Hello World!';
        }
    });

    server.route({
        method: 'GET',
        path: '/{zip}/{any*}',
        handler: async (request, h) => {
            if(request.params.any.length == 0) {
              return await getGSI(request.params.zip);
            } else {
              let gsi = await getGSI(request.params.zip);
              let now = new Date().getTime();
              let matrix = {}
              if(request.params.any == 'now') return gsi.forecast[0].gsi;
              if(request.params.any == 'now/isostring') return await moment(gsi.forecast[0].timeStamp).format();
              let min = 100;
              let max = 0;

              let min_ts =0;
              let max_ts =0;
              let switches = [];

              for(let i=0;i<gsi.forecast.length;i++) {
                if(gsi.forecast[i].timeStamp > now) {
                  if(request.params.any == 'relativeHours/'+Math.floor((gsi.forecast[i].timeStamp-now)/3600000)) return gsi.forecast[i].gsi;
                }
                if(i<24) {
                  switches.push(gsi.forecast[i]);
                  if(min > gsi.forecast[i].gsi) {
                    min = gsi.forecast[i].gsi;
                    min_ts  = gsi.forecast[i].timeStamp;
                  }
                  if(max < gsi.forecast[i].gsi) {
                    max = gsi.forecast[i].gsi;
                    max_ts  = gsi.forecast[i].timeStamp;
                  }
                }
                // calcultate matrix
                matrix['h_'+i] = {
                    timeStamp: gsi.forecast[i].timeStamp
                };
                let sum = 0;
                let t = 0;
                for(let j = i;j>0;j--) {
                  sum += gsi.forecast[j].gsi;
                  t++;
                  matrix['h_'+i]['avg_'+j] = Math.round(sum/(t));
                }
                for(let j = i+1; j<gsi.forecast.length; j++) {
                  matrix['h_'+i]['avg_'+j] = false;
                }
              }

              switches.sort(function(a,b) {
                if (a.gsi > b.gsi) return 1;
                if (b.gsi > a.gsi) return -1;
                return 0;
              });
              switches = switches.reverse();
              let latest_gsi = gsi.forecast[0].gsi;
              for(let i=0;i<switches.length;i++) {
                 if(switches[i].gsi >= latest_gsi) {
                      if(request.params.any == 'bestHours/'+i+'/string') return 'off';
                      if(request.params.any == 'bestHours/'+i+'') return 0;
                 } else {
                   if(request.params.any == 'bestHours/'+i+'/string') return 'on';
                   if(request.params.any == 'bestHours/'+i+'') return 1;
                 }
               }
              }
            }
        }
    });

    await server.start();
    console.log('Server running on %s', server.info.uri);
};

process.on('unhandledRejection', (err) => {
    console.log(err);
    process.exit(1);
});

init();

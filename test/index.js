const child = require('child_process');
const modulepath = './index.js';

const unitid = 'http'

const params = {
  debug: 'on',
  loglevel: 1,
  refresh: '15',
  modules: 'cpu, mem' || 'alert,amps,batpercent,cloud,connections,core,cpu,diskio,docker,folders,fs,gpu,hddtemp,help,ip,irq,load,mem,memswap,network,now,percpu,ports,processcount,psutilversion,quicklook,raid,sensors,smart,system,uptime,wifi,processlist',
}

const system = {

}

const config2 = [
  
];


const ps = child.fork(modulepath, [unitid]);

ps.on('message', data => {
  if (data.type === 'get' && data.tablename === `system/${unitid}`) {
    ps.send({ type: 'get', system });
  }

  if (data.type === 'get' && data.tablename === `params/${unitid}`) {
    ps.send({ type: 'get', params });
  }

  if (data.type === 'get' && data.tablename === `config/${unitid}`) {
    ps.send({ type: 'get', config: config2 });
  }

  if (data.type === 'data') {
    console.log('-------------data-------------', new Date().toLocaleString());
    console.log(data.data);
    console.log('');
  }

  if (data.type === 'channels') {
    console.log('-----------channels-----------', new Date().toLocaleString());
    console.log(data.data);
    console.log('');
  }

  if (data.type === 'debug') {
    console.log('-------------debug------------', new Date().toLocaleString());
    console.log(data.txt);
    console.log('');
  }
});

ps.on('close', code => {
  console.log('close');
});

ps.send({type: 'debug', mode: true });

setTimeout(() => {
// ps.send({ type: 'act', data: [ { dn: 'LAMP1', prop: 'set', val: 50 } ] });
}, 1000)

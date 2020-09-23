const Plugin = require('./lib/plugin');
const plugin = new Plugin();

const { spawn } = require('child_process');

let buffer = '';

let firstParent = null;
let channelsReady = false;
let channels = {};

function message(data) {
  const end = data.indexOf('0a', 0, 'hex');

  if (end === -1) {
    buffer = buffer + data.toString();
  } else {
    if (data.length === end + 1) {
      buffer = buffer + data.toString();
      chunk(buffer);
      buffer = '';
    } else {
      buffer = buffer + data.slice(0, end + 1).toString();
      chunk(buffer);
      buffer = '';
      message(data.slice(end + 1))
    }
  }
}

function parseChunk(string) {
 const index = string.indexOf(': ');
 if (index !== -1) {
   const parent = string.slice(0, index);
   const body = string
    .slice(index + 2)
    .replace(/'/g, '"')
    .replace(/\n/g, '')
    .replace(/True/g, 'true')
    .replace(/False/g, 'false')
    .replace(/None/g, 'null')

   try {
    const body2 = JSON.parse(body);
    return { parent, body: body2 }
   } catch (e) {
     try {
      if (body[0] === '(') {
        const body3 = body.slice(1, body.length - 1).split(', ')
        return { parent, body: body3 };
      }

      if (body.indexOf('=') !== -1) {
        const s = body
          .split(': ')
          .reduce((p, c) => {
            if (c[0] !== '[' && c.indexOf('=') !== -1) {
              const i1 = c.indexOf('(');
              const i2 = c.indexOf(')');
              if (i1 !== -1 && i2 !== -1) {
                const temp1 = c.slice(i1 + 1, i2);
                const temp2 = temp1.split(', ')
                const temp3 = temp2.map(i => {
                  const t = i.split('=');
                  return `"${t[0]}": ${t[1]}`
                })
                .join(', ')
                return `${p}: { "${c.slice(0, i1)}": { ${temp3} } }${c.slice(i2 +1)}`;
              }
            }
            if (p === '') {
              return c;
            }
            return p + ': ' + c;
          }, '')
          return { parent, body: JSON.parse(s) };
      }
      return { parent, body }
     } catch (e) {
      plugin.debug('Parse error: ' + parent)
      return { parent, body }
     }
   }
 }
 return { parent: null, body2: null };
}


function mergeObject(name, data) {
  const temp = {};

  Object
    .keys(data)
    .forEach(key => {
      temp[`${name}_${key}`] = data[key];
    });

  return temp;
}

function mergeArrayToKey(name, data, key) {
  return data
    .reduce((p, c) => {
      const link = c[key];

      delete c[key];
      delete c.key;

      return { ...p, ...mergeObject(`${name}_${link}`,c) }; 
    }, {});
}

function mergeArray(name, data) {
  return data
    .reduce((p, c, i) => {
      return { ...p, ...mergeObject(`${name}_${i}`,c) }; 
    }, {});
}

function messageArray(name, data) {
  return {
    [`${name}_count`]: data.length,
    [`${name}_messages`]: data.map(i => i.join(' ')).join('|') 
  }
}

function mergeArrayToString(name, data) {
  return { [name]: data.join(' ') };
}

function parseProcesslist(name, data) {
  const pids = {};

  const temp = data
  .reduce((p, c) => {
    const link = c.name.replace(/ /g, '_');
    const label = `${name}_${link}`;

    pids[c.pid] = c.name.replace(/ /g, '_');

    try {
      const memory_info_pmem = c.memory_info.pmem;
      const gids_puids = c.gids.puids;
      const cmdline = c.cmdline;
      const cpu_times_pcputimes = c.cpu_times.pcputimes;
      const io_counters = c.io_counters;

      delete c.memory_info;
      delete c.name;
      delete c.gids;
      delete c.cmdline;
      delete c.cpu_times;
      delete c.io_counters;

      return { 
        ...p, 
        ...mergeObject(label, c), 
        ...mergeObject(`${label}_memory_info_pmem`, memory_info_pmem),
        ...mergeObject(`${label}_gids_puids`, gids_puids),
        ...mergeObject(`${label}_cmdline`, cmdline),
        ...mergeObject(`${label}_cpu_times_pcputimes`, cpu_times_pcputimes),
        [`${label}_io_counters`]: io_counters.join(' '),
      }; 
    } catch (e) {
      return { 
        ...p, 
        ...mergeObject(label, c), 
      }; 
    }
  }, {});

  temp[`${name}_count`] = data.length;
  temp[`${name}_pids`] = Object.keys(pids).map(pid => pids[pid] + '=' + pid).join(', ');
  return temp;
}

function parseQuicklook(name, data) {
  const percpu = data.percpu || [];
  delete data.percpu;

  return {
    ...mergeObject(name, data), 
    ...mergeArrayToKey(name + '_percpu', percpu, 'cpu_number')
  }
}

function universalParse(name, data) {
  try {
    const type = typeof data;
    if (type === 'string' || data === null) {
      return { [name]: data };
    }
    if (type === 'object') {
      if (Array.isArray(data)) {
        return mergeArray(name, data);
      }
    }
    return mergeObject(name, data);
  } catch (e) {
    plugin.debug('Parse error: ' + parent);
    return {};
  }
}

function parseBody(name, data) {
  switch (name) {
    case 'core':
    case 'cpu':
    case 'connections':
    case 'ip':
    case 'load':
    case 'mem':
    case 'memswap':
    case 'processcount':
    case 'system':
    case 'uptime':
    case 'core':
      return mergeObject(name, data);
    case 'alert':
      return messageArray(name, data);
    case 'diskio':
      return mergeArrayToKey(name, data, 'disk_name');
    case 'fs':
      return mergeArrayToKey(name, data, 'device_name');
    case 'network':
      return mergeArrayToKey(name, data, 'interface_name');
    case 'percpu':
      return mergeArrayToKey(name, data, 'cpu_number');
    case 'sensors':
      return mergeArrayToKey(name, data, 'label');
    case 'ports':
      return mergeArray(name, data);
    case 'psutilversion':
      return mergeArrayToString(name, data);
    case 'processlist':
      return parseProcesslist(name, data);
    case 'quicklook':
      return parseQuicklook(name, data);
    default:
      return universalParse(name, data);
  }
}

function chunk(string) {
  const { parent, body } = parseChunk(string);

  if (parent !== null) {

    if (channelsReady === false) {
      if (firstParent === parent) {
        channelsReady = true;
        plugin.debug(`complete!`)
        plugin.setChannels(channels);
        channels = null;
      }
      if (firstParent === null) {
        firstParent = parent;
        plugin.debug(`preparation channels...`)
      }
    }

    const data = parseBody(parent, body);
    
    if (channelsReady) {
      plugin.setChannelsValue(data);
    } else {
      channels = { ...channels, ...data };
    }

  }
}

function error(data) {
  plugin.debug(`stderr: ${data}`)
}

function close(code) {
  process.exit(code);
}

function start_process() {
  const modules = plugin.params.modules || 'cpu,mem';
  const p1 = modules.replace(/ ,/g, ',').replace(/ /g, ',');

  const cp = spawn('glances', ['-t', plugin.params.refresh, '--stdout', p1]);

  cp.stdout.on('data', message);
  cp.stderr.on('data', error);
  cp.on('close', close);
}


plugin.on('start', () => {
  start_process();
});

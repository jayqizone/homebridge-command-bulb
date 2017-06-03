const Exec = require('child_process').exec,
  request = require('request');

var PlatformAccessory, Accessory, Service, Characteristic, UUIDGen;
var options;

const COMMAND_DIRECTORY = '~/.homebridge/commands';
const NAME = 'Command Bulb';
var UUID;

const PROBE_NAME = 'Probe Bulb';
var PROBE_UUID;

const INTERVAL = 100;

module.exports = function(homebridge) {
  PlatformAccessory = homebridge.platformAccessory;
  Accessory = homebridge.hap.Accessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  UUID = UUIDGen.generate(NAME);
  PROBE_UUID = UUIDGen.generate(PROBE_NAME);

  homebridge.registerPlatform('homebridge-command-bulb', 'CommandPlatform', CommandPlatform, true);
}

class CommandPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;

    this.bulb;
    this.power;
    this.bright;

    this.onOff = 0;

    this.cmdId = 0;

    this.cmdDir = this.config.directory || COMMAND_DIRECTORY;

    this.probe;
    this.probeTime = 0;

    this.tg_token = this.config.tg_token;
    this.tg_chat_id = this.config.tg_chat_id;
    this.proxy = this.config.proxy;

    if (this.tg_enable = (this.tg_token && this.tg_chat_id)) {
      options = {
        url: 'https://api.telegram.org/bot' + this.tg_token + '/sendMessage',
        form: {
          chat_id: this.tg_chat_id,
          text: ''
        }
      };

      this.proxy && (options.proxy = this.proxy)
    }

    this.api.on('didFinishLaunching', () => {
      this.initBulb(this.bulb, this.probe);
    });
  }

  initBulb(bulb, probe) {
    if (bulb) {
      this.bright = bulb.getService(Service.Lightbulb)
        .getCharacteristic(Characteristic.Brightness)
        .on('set', (value, callback) => {
          callback();

          setTimeout(() => {
            if (Date.now() - this.probeTime > 2 * INTERVAL) {
              this.exeCmd(value, ++this.cmdId);
            } else {
              this.power.updateValue(this.onOff = 0);
            }
          }, INTERVAL);
        });
    } else {
      bulb = new PlatformAccessory(NAME, UUID);
      bulb.reachable = true;

      this.bright = bulb.addService(Service.Lightbulb)
        .addCharacteristic(Characteristic.Brightness)
        .on('set', (value, callback) => {
          callback();

          setTimeout(() => {
            if (Date.now() - this.probeTime > 2 * INTERVAL) {
              this.exeCmd(value, ++this.cmdId);
            } else {
              this.power.updateValue(this.onOff = 0);
            }
          }, INTERVAL);
        });

      this.api.registerPlatformAccessories('homebridge-command-bulb', 'CommandPlatform', [bulb]);
    }

    this.power = bulb.getService(Service.Lightbulb)
      .getCharacteristic(Characteristic.On)
      .on('set', (value, callback) => {
        callback();

        if (value !== this.onOff) {
          setTimeout(() => this.power.updateValue(this.onOff), 0);
        }
      });

    this.power.updateValue(this.onOff = 0);

    if (probe) {
      probe.getService(Service.Lightbulb)
        .getCharacteristic(Characteristic.Brightness)
        .on('set', (value, callback) => {
          this.probeTime = Date.now();
          callback();
        });
    } else {
      probe = new PlatformAccessory(PROBE_NAME, PROBE_UUID);
      probe.reachable = true;

      probe.addService(Service.Lightbulb)
        .addCharacteristic(Characteristic.Brightness)
        .on('set', (value, callback) => {
          this.probeTime = Date.now();
          callback();
        });

      this.api.registerPlatformAccessories('homebridge-command-bulb', 'CommandPlatform', [probe]);
    }

    probe.getService(Service.Lightbulb)
      .getCharacteristic(Characteristic.On)
      .on('set', (value, callback) => {
        this.probeTime = Date.now();
        callback();
      });
  }

  exeCmd(cmd, cmdId) {
    if (100 === cmd) {
      return;
    } else if (0 === cmd) {
      this.bright.updateValue(100);
    }

    this.power.updateValue(this.onOff = 1);

    let prefix = cmd < 10 ? '0' + cmd : cmd;

    Exec('ls ' + this.cmdDir + ' | grep ^' + prefix, (error, stdout, stderr) => {
      if (error || stderr) {
        if (stderr) {
          this.log('Search command directory stderr:', stderr);
        } else {
          this.log('Search command directory error:', error);
        }

        cmdId === this.cmdId && this.bright.updateValue(100);
      } else if (stdout) {
        let cmds = stdout.trim().split('\n');
        let cmdsStr = cmds.map(cmd => cmd.replace(new RegExp('^' + prefix + '[\\W_]{0,}'), '').split('.')[0]).join();

        Promise.all(cmds.map(cmd =>
            new Promise((resolve, reject) =>
              Exec(this.cmdDir + '/' + cmd, (error, stdout, stderr) => {
                if (error) {
                  this.log('Command', cmd, 'error:', error);

                  reject();
                } else {
                  let parts = cmd.split('.');

                  if (stdout) {
                    parts.some(x => 'tg' === x) && this.sendTGMessage(stdout);
                    // this.log('Command', cmd, 'stdout:', stdout);
                  }

                  if (stderr) {
                    this.log('Command', cmd, 'stderr:', stderr);
                  }

                  resolve(parts.some(x => 'ok' === x));
                }
              }))))
          .then(res => {
            res.some(x => x) && this.sendTGMessage('Command: ' + cmdsStr + ' OK!')
            cmdId === this.cmdId && this.power.updateValue(this.onOff = 0);
          })
          .catch(() => {
            this.sendTGMessage('Command: ' + cmdsStr + ' Failed!')
            cmdId === this.cmdId && this.bright.updateValue(100);
          });
      }
    });
  }

  sendTGMessage(msg) {
    options.form.text = msg;
    this.tg_enable && request.post(options, (err, res, body) =>
      err && this.log('Telegram request error:', err)
    )
  }

  configureAccessory(accessory) {
    accessory.reachable = true;

    if (accessory.UUID === UUID) {
      this.bulb = accessory;
    } else {
      this.probe = accessory;
    }
  }
}

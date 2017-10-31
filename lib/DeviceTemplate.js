const ct = require('color-temperature');
const debug = require('debug')('Operater');
const auto_update_debug = require('debug')('AutoUpdate');
const hap_nodejs = require('hap-nodejs');
const Accessory = hap_nodejs.Accessory;
const Service = hap_nodejs.Service;
const Characteristic = hap_nodejs.Characteristic;
const uuid = hap_nodejs.uuid;
const child_process = require('child_process');
const parser = require('xml2json').toJson;
const events = require('events');
const GatewayInfo = require('./GatewayInfo.js')
const GatewayManager = require('./GatewayManager.js');
const jsonQuery = require('json-query');

const EXEC_OPTIONS = {timeout: 7 * 1000, killSignal: "SIGKILL"};

module.exports = DeviceTemplate;

function DeviceTemplate (gateway, node) {
    this.gateway = gateway;
    this.setting = this.gateway.setting;
    this.node = node;
    this.name = node.name || node.product;

    this.accessory = new Accessory(this.name, uuid.generate(this.node.product + this.node.id + this.gateway.mac));
    this.updaters = [];

    this.emitter = new events.EventEmitter();
    this.cache = '';

    let pollRequestListener = () => {
        this.gateway.getNodeValues(this.node.id, (err, result) => {
            this.cache = result; // if cache exists, emitter 'poll-request' has no response.
            this.emitter.emit('poll-response', result);
        });

        setTimeout(() => { // keep cache for 10 sec.
            this.cache = '';
            this.emitter.once('poll-request', pollRequestListener);
        }, 10 * 1000);
    }

    this.emitter.once('poll-request', pollRequestListener);
}

DeviceTemplate.prototype.getValues = function (callback) {
    if (this.cache) {
        callback(null, this.cache);
    } else {
        this.emitter.emit('poll-request');
        this.emitter.once('poll-response', (err, result)=>{ // wait for response;
            callback(err, result);
        });
    }

};

DeviceTemplate.prototype.setValue = function (value, state, callback) {
    this.curl = 'curl --digest ' + '-u ' + this.setting.acc + ':' + this.setting.pwd + ' ' + this.setting.ip + ':5000/';
    let cmd = this.curl + 'valuepost.html -d "' +
    this.node.id + '-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + state + '"';
    child_process.exec(cmd, (err, stdout) => {
        callback(err);
    });
};

DeviceTemplate.prototype.WallSwitch = function () {
    let instances = new Set(jsonQuery(`instance`, {data: this.node.value}).value);

    for (let instance of instances) {
        let name = this.name + " " + instance;
        let service = this.accessory.getService(name, instance);
        service = service || this.accessory.addService(Service.Switch, name, instance);

        service.getCharacteristic(Characteristic.On).on('get', (callback) => {
            this.getValues((err, values) => {
                let result = jsonQuery(`[*instance=${instance}][*index=0][*label=Switch]`, {data:values}).value;
                console.log(result);
                result = result == 'True';
                callback(err, result);
            });
        });
        service.getCharacteristic(Characteristic.On).on('set', (state, callback) => {
            let value = {
                class: 'SWITCH BINARY', genre: 'user', type: 'bool', instance: instance, index: 0
            };
            state = state ? 'True':'False';
            this.setValue(value, state, (err)=>{
                try {
                    if (err) throw err;
                } catch (e) {
                    this.gateway.emitter.emit('error', e);
                    debug(err);
                }
            });
        });
    }

    let updater = setInterval(() => {
        // this.getValues((err, values) => {
        //     let result = jsonQuery(`[*instance=${instance}][*index=0][*label=Switch]`, {data:values}).value;
        //     result = result[0] == 'True';
        //     callback(err, result);
        // });

    }, 10 * 1000);

    this.updaters.push(updater);

    return this.accessory;
};

DeviceTemplate.prototype.stopUpdate = function () {
    this.updaters.forEach((updater)=>{
        clearInterval(updater);
    });
};

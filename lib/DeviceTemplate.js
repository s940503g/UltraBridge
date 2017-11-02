const ct = require('color-temperature');
const debug = require('debug')('DeviceTemplate');
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

module.exports = DeviceTemplate;

function DeviceTemplate (gateway, node) {
    this.gateway = gateway;
    this.setting = this.gateway.setting;
    this.node = node;
    this.name = node.name || node.product;
    this.name = this.node.location + this.name;

    this.accessory = new Accessory(this.name, uuid.generate(this.node.product + this.node.id + this.gateway.mac));
    this.accessory.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, this.node.manufacturer)
		.setCharacteristic(Characteristic.Model, this.product)
		.setCharacteristic(Characteristic.SerialNumber, this.gateway.mac);

    this.accessory.on('identify', (paired, callback) => {
		debug(this.name +' identified.');
		callback();
	});

    this.updaters = [];
    this.emitter = new events.EventEmitter();
    this.cache = '';

    this.setPollRequestListener();
}

DeviceTemplate.prototype.setPollRequestListener = function () {
    let pollRequestListener = () => {
        this.gateway.getNodeValues(this.node.id, (err, result) => {
            auto_update_debug('poll data.');
            this.cache = result;
            this.emitter.emit('poll-response', err, result);

            setTimeout(() => { // keep cache
                this.cache = null;

                if (!this.emitter.listeners('poll-request').length) { // add listener when poll-request not exists.
                    this.emitter.once('poll-request', pollRequestListener);
                }
            }, 0.2 * 1000);
        });
    }

    this.emitter.once('poll-request', pollRequestListener);
};

DeviceTemplate.prototype.getValues = function (callback) {
    if (this.cache) {
        auto_update_debug('Use cache data.');
        callback(null, this.cache);
    } else {
        this.emitter.once('poll-response', (err, result) => { // wait for response;
            callback(err, result);
        });
        this.emitter.emit('poll-request');
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


DeviceTemplate.prototype.stopActive = function () {
    debug(this.name + ' stoping active.');
    for (var i in this.updaters) {
        clearInterval(this.updaters[i]);
    }
    this.updaters = [];
    this.emitter.removeAllListeners();
};









DeviceTemplate.prototype.WallSwitch = function () {
    let instances = new Set(jsonQuery(`instance`, {data: this.node.value}).value);

    for (let instance of instances) {
        let name = this.name + " " + instance;
        let service = this.accessory.getService(name, instance);
        service = service || this.accessory.addService(Service.Switch, name, instance);

        let getter = (callback) => {
            this.getValues((err, values) => {
                let result;
                try {
                    if (err) throw err;
                    result = jsonQuery(`[*instance=${instance}][*index=0][*label=Switch]`, {data:values}).value;
                    result = result[0].$t == 'True';
                } catch (e) {
                    this.gateway.emitter.emit('error', e);
                } finally {
                    callback(err, result);
                }
            });
        }
        let setter = (state, callback) => {
            let value = { class: 'SWITCH BINARY', genre: 'user', type: 'bool', instance: instance, index: 0 };
            state = state ? 'True':'False';
            this.setValue(value, state, (err) =>{
                try {
                    if (err) throw err;
                } catch (e) {
                    this.gateway.emitter.emit('error', e);
                } finally {
                    callback(err);
                }
            });
        }

        let updater = setInterval(() => {
            getter((err, result) => {
                service.updateCharacteristic(Characteristic.On, result);
                auto_update_debug(`${this.gateway.mac}:${this.name} update: ${result}`);
            })
        }, 10 * 1000);
        this.updaters.push(updater);

        service.getCharacteristic(Characteristic.On)
            .on('get', getter)
            .on('set', setter);
    }

    return this;
};

DeviceTemplate.prototype.DoorSensor = function () {
    let name = this.name
    let service = this.accessory.addService(Service.ContactSensor, name);

    let getter = (callback) => {
        this.getValues((err, values) => {
            let result;
            try {
                result = jsonQuery(`[*class=ALARM][*instance=1][*index=6]`, {data:values}).value;
                result = result[0].$t;
                result = result.match(/closed/) !== null ?
                    Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
            } catch (e) {
                this.gateway.emitter.emit('error', e);
            } finally {
                callback(err, result);
            }
        });
    }

    this.updaters.push(setInterval(() => {
        getter((err, result) => {
            service.updateCharacteristic(Characteristic.ContactSensorState, result);
            auto_update_debug(`${this.gateway.mac}:${this.name} update: ${result}`);
        })
    }, 10 * 1000));

    service.getCharacteristic(Characteristic.ContactSensorState)
        .on('get', getter);

    // setting battery
    let battery = this.accessory.addService(Service.BatteryService, name);
    let battery_getter = (callback) => {
        this.getValues((err, values) => {
            let result;
            try {
                result = jsonQuery(`[*class=BATTERY][*instance=1][*index=0]`, {data:values}).value;
                result = result[0].$t;
                debug('get battery state: ' + result);
            } catch (e) {
                this.gateway.emitter.emit('error', e);
            } finally {
                callback(err, result);
            }
        });
    }

    battery.getCharacteristic(Characteristic.BatteryLevel)
        .on('get', battery_getter);

    return this;
};

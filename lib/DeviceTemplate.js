const ct = require('color-temperature');
const debug = require('debug');
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
const jsonpath = require('jsonpath');

module.exports = DeviceTemplate;

function DeviceTemplate (gateway, node) {
    this.gateway = gateway;
    this.node = node;
    this.name = node.name || node.product;
    this.name = this.node.location + this.name;

    this.accessory = new Accessory(this.name, uuid.generate(this.node.product + this.node.id + this.gateway.mac));
    this.accessory.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, this.node.manufacturer)
		.setCharacteristic(Characteristic.Model, this.node.product)
		.setCharacteristic(Characteristic.SerialNumber, this.node.id);

    this.accessory.on('identify', (paired, callback) => {
		debug('AccessoryIdentify')(this.name +' identified.');
		callback();
	});

    this.updaters = [];
    this.emitter = new events.EventEmitter();
    this.cache = '';

    this.setPollRequestListener();
}

DeviceTemplate.prototype.setPollRequestListener = function () {
    let pollRequestListener = () => {
        this.gateway.getNodeValues(this.node.id, (err, result, ip) => {
            debug('Polling')('poll data.');
            this.cache = result;
            this.emitter.emit('poll-response', err, result, ip);

            setTimeout(() => { // keep cache
                this.cache = null;
                this.emitter.once('poll-request', pollRequestListener);
            }, 0.2 * 1000);
        });
    }

    this.emitter.once('poll-request', pollRequestListener);
};

DeviceTemplate.prototype.getValues = function (callback) {
    if (this.cache) {
        debug('Polling')('Use cache data.');
        callback(null, this.cache);
    } else {
        this.emitter.once('poll-response', (err, result, ip) => { // wait for response;
            callback(err, result, ip);
        });
        this.emitter.emit('poll-request');
    }
};

DeviceTemplate.prototype.setValue = function (value, state, callback) {
    this.gateway.setValue(this.node.id, value, state, (err, stdout) => {
        callback(err);
    });
};

DeviceTemplate.prototype.stopActive = function () {
    debug('DeviceStopActice')(this.name + ' stoping active.');

    this.updaters.forEach((updater)=>{
        clearInterval(updater);
    });

    this.updaters = [];
    this.emitter.removeAllListeners();
};


DeviceTemplate.prototype.WallSwitch = function () {
    let instances = new Set(jsonpath.query(this.node.value, `$..instance`));

    for (let instance of instances) {
        let name = this.name + " " + instance;
        let service = this.accessory.getService(name, instance);
        service = service || this.accessory.addService(Service.Switch, name, instance);

        let updater = setInterval(() => {
            this.getValues((err, values) => {
                try {
                    var result = jsonpath.query(values, `$..[?(@.instance==${instance} && @.index==0 && @.label=="Switch")]`)[0].$t;
                    result = result == 'True';
                } catch (e) {

                } finally {
                    service.updateCharacteristic(Characteristic.On, result);
                    auto_update_debug(`${this.gateway.mac}:${this.name} Characteristic.On update: ${result}`);
                }
            });
        }, 10 * 1000);
        this.updaters.push(updater);

        service.getCharacteristic(Characteristic.On)
            .on('get', (callback) => {
                this.getValues((err, values) => {
                    try {
                        var result = jsonpath.query(values, `$..[?(@.instance==${instance} && @.index==0 && @.label=="Switch")]`)[0].$t;
                        result = result == 'True';
                    } catch (e) {

                    } finally {
                        callback(null, result);
                    }
                });
            })
            .on('set', (state, callback) => {
                let value = { class: 'SWITCH BINARY', genre: 'user', type: 'bool', instance: instance, index: 0 };
                state = state ? 'True':'False';
                this.setValue(value, state, (err) =>{
                    try {
                        if (err) throw err;
                    } catch (e) {

                    } finally {
                        callback(null);
                    }
                });
            });
    }

    return this;
};

DeviceTemplate.prototype.DoorSensor = function () {
    let name = this.name
    let service = this.accessory.addService(Service.ContactSensor, name);

    this.updaters.push(setInterval(() => {
        this.getValues((err, values, ip) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==6 && @.class=="ALARM")]`)[0].$t;
                result = result.match(/closed/) !== null ?
                    Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
            } catch (e) {

            } finally {
                service.updateCharacteristic(Characteristic.ContactSensorState, result);
                auto_update_debug(`${this.gateway.mac}:${this.name} update: ${result}`);
            }
        });
    }, 5 * 1000));

    service.getCharacteristic(Characteristic.ContactSensorState)
        .on('get', (callback) => {
            this.getValues((err, values) => {
                try {
                    var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==6 && @.class=="ALARM")]`)[0].$t;
                    result = result.match(/closed/) !== null ?
                        Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
                } catch (e) {

                } finally {
                    callback(null, result);
                }
            });
        });

    // setting battery
    let battery = this.accessory.addService(Service.BatteryService, name);
    let battery_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==0 && @.class=="BATTERY")]`)[0].$t;
            } catch (e) {

            } finally {
                callback(null, result);
            }
        });
    }

    battery.getCharacteristic(Characteristic.BatteryLevel)
        .on('get', battery_getter);

    return this;
};


DeviceTemplate.prototype.PowerMonitor = function () {
    let name = this.name
    let service = this.accessory.addService(Service.Outlet, name);

    let switch_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==0 && @.class=="SWITCH BINARY")]`)[0].$t;
                result = result == 'True';
            } catch (e) {

            } finally {
                callback(null, result);
            }
        });
    }
    let switch_setter = (state, callback) => {
        let value = { class: 'SWITCH BINARY', genre: 'user', type: 'bool', instance: 1, index: 0 };
        state = state ? 'True':'False';
        this.setValue(value, state, (err) => {
            try {
                if (err) throw err;
            } catch (e) {

            } finally {
                callback(null);
            }
        });
    }
    service.getCharacteristic(Characteristic.On)
        .on('get', switch_getter)
        .on('set', switch_setter);

    this.updaters.push(setInterval(() => {
        switch_getter((err, result) => {
            service.updateCharacteristic(Characteristic.On, result);
            auto_update_debug(`${this.gateway.mac}:${this.name} Characteristic.On update: ${result}`);
        });
    }, 10 * 1000));

    service.getCharacteristic(Characteristic.OutletInUse)
        .on('get', (callback) => {
            this.getValues((err, values) => {
                try {
                    var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==18 && @.class=="METER")]`)[0].$t;
                    result = result > 0;
                } catch (e) {

                } finally {
                    callback(null, result);
                }
            });
        });
    return this;
};

DeviceTemplate.prototype.FourInOneSensor = function () {
    let name = this.name
    let contact_service = this.accessory.addService(Service.ContactSensor, name);
    let temperature_service = this.accessory.addService(Service.TemperatureSensor, name);
    let light_service = this.accessory.addService(Service.LightSensor, name);
    let humidity_service = this.accessory.addService(Service.HumiditySensor, name);
    let battery_service = this.accessory.addService(Service.BatteryService, name);

    /* Getter zone */
    let contact_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==6 && @.class=="ALARM")]`)[0].$t;
                result = result.match(/closed/) !== null ?
                    Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
            } catch (e) {

            } finally {
                callback(null, result);
            }
        });
    }
    let temperature_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==1 && @.class=="SENSOR MULTILEVEL")]`)[0].$t;
                console.log(result);
            } catch (e) {

            } finally {
                callback(null, result);
            }
        });
    }
    let light_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==3 && @.class=="SENSOR MULTILEVEL")]`)[0].$t;
                result = result * 100;
            } catch (e) {

            } finally {
                callback(null, result);
            }
        });
    }
    let humidity_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==5 && @.class=="SENSOR MULTILEVEL")]`)[0].$t;
            } catch (e) {

            } finally {
                callback(null, result);
            }
        });
    }
    let battery_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==0 && @.class=="BATTERY")]`)[0].$t;
            } catch (e) {

            } finally {
                callback(null, result);
            }
        });
    }

    contact_service.getCharacteristic(Characteristic.ContactSensorState).on('get', contact_getter);
    temperature_service.getCharacteristic(Characteristic.CurrentTemperature).on('get', temperature_getter);
    light_service.getCharacteristic(Characteristic.CurrentAmbientLightLevel).on('get', light_getter);
    humidity_service.getCharacteristic(Characteristic.CurrentRelativeHumidity).on('get', humidity_getter);
    battery_service.getCharacteristic(Characteristic.BatteryLevel).on('get', battery_getter);

    /* Updater zone */

    this.updaters.push(setInterval(() => {
            try {
                var contact = (() => { contact_getter((err, result)=>{return result;}) })();
                var temperature = (() => { temperature_getter((err, result)=>{return result;}) })();
                var light = (() => { light_getter((err, result)=>{return result;}) })();
                var humidity = (() => { humidity_service((err, result)=>{return result;}) })();
                var battery = (() => { battery_getter((err, result)=>{return result;}) })();
            } catch (e) {

            } finally {
                contact_service.updateCharacteristic(Characteristic.ContactSensorState, contact);
                temperature_service.updateCharacteristic(Characteristic.CurrentTemperature, temperature);
                light_service.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, light);
                humidity_service.updateCharacteristic(Characteristic.CurrentRelativeHumidity, humidity);
                battery_service.updateCharacteristic(Characteristic.BatteryLevel, battery);

                console.log(temperature);

                auto_update_debug(`${this.gateway.mac}:${this.name} update:
                    contact:${contact}
                    temperature:${temperature}
                    light:${light}
                    humidity:${humidity}
                    battery:${battery}`);
            }
    }, 5 * 1000));

    return this;
};

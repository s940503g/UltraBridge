'use strict';
const debug = require('debug')
const auto_update_debug = require('debug')('AutoUpdate');
const debug_update_failure = debug('UpdateFailure');
const debug_error = debug('Error');
const hap_nodejs = require('hap-nodejs');
const Accessory = hap_nodejs.Accessory;
const Service = hap_nodejs.Service;
const Characteristic = hap_nodejs.Characteristic;
const uuid = hap_nodejs.uuid;
const events = require('events');
const jsonpath = require('jsonpath');
const Device = require('./Device.js');
const debug_test = debug('test');

var exports = module.exports = {};

/*
* Device Templates
*/

exports.WallSwitch = function () {
    let instances = new Set(jsonpath.query(this.node.value, `$..instance`));
    instances.forEach((instance) => {
        let name = this.name + " " + instance;
        let service = this.accessory.getService(name, instance);
        service = service || this.accessory.addService(Service.Switch, name, instance);

        service.getCharacteristic(Characteristic.On)
            .on('get', (callback) => {
                this.getValues((err, values) => {
                    try {
                        var result = jsonpath.query(values, `$..[?(@.instance==${instance} && @.index==0 && @.label=="Switch")]`)[0].$t;
                        result = result == 'True';
                        callback(null, result);
                    } catch (e) {
			debug_error(`${this.gateway.mac} ${this.name}`);
			debug_error(e);
                        callback(e);
                    }
                });
            })
            .on('set', (state, callback) => {
                let value = { class: 'SWITCH BINARY', genre: 'user', type: 'bool', instance: instance, index: 0 };
                state = state ? 'True':'False';
                this.setValue(value, state, (err) =>{
                    try {
                        if (err) throw err;
                        callback(null);
                    } catch (e) {
			debug_error(`${this.gateway.mac} ${this.name}`);
			debug_error(e);
                        callback(e);
                    }
                });
            });

        this.setAutoUpdate(() => {
            this.getValues((err, values) => {
                if (!err) {
                    var result = jsonpath.query(values, `$..[?(@.instance==${instance} && @.index==0 && @.label=="Switch")]`)[0].$t;
                    result = result == 'True';
                    service.updateCharacteristic(Characteristic.On, result);
                    auto_update_debug(`${this.gateway.mac}:${name} Characteristic.On update: ${result}`);
                }else{
                    debug_update_failure(`${this.gateway.mac} ${this.name} update fail.`);
                }
            });
        }, 10 * 1000);
    });

};

exports.DoorSensor = function () {
    let name = this.name
    let service = this.accessory.addService(Service.ContactSensor, name);

    let updater = () => {
        this.getValues((err, values, ip) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==6 && @.class=="ALARM")]`)[0].$t;
                result = result.match(/closed/) !== null ?
                    Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
                service.updateCharacteristic(Characteristic.ContactSensorState, result);
                auto_update_debug(`${this.gateway.mac}:${this.name} update: ${result}`);
            } catch (e) {
                debug('UpdateFailure')(name + ' update failed.');
                console.log(name + ' update failed.');
            }
        });
    }

    this.setAutoUpdate(updater, 10 * 1000);

    service.getCharacteristic(Characteristic.ContactSensorState)
        .on('get', (callback) => {
            this.getValues((err, values) => {
                try {
                    var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==6 && @.class=="ALARM")]`)[0].$t;
                    result = result.match(/closed/) !== null ?
                        Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
                    callback(null, result);
                } catch (e) {
		    debug_error(`${this.gateway.mac} ${this.name}`);
	            debug_error(e);
                    callback(e);
                }
            });
        });
    // setting battery
    let battery = this.accessory.addService(Service.BatteryService, name);
    let battery_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                if (err) throw err;
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==0 && @.class=="BATTERY")]`)[0].$t;
                callback(null, result);
            } catch (e) {
                callback(e);
            }
        });
    }

    battery.getCharacteristic(Characteristic.BatteryLevel)
        .on('get', battery_getter);

    battery.getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', (callback) => {
            try {
                battery_getter((err, result)=>{
                    result = result < 5 ?
                        Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
                    callback(null, result);
                });
            } catch (e) {
                callback(e);
            }
        })
};


exports.PowerMonitor = function () {
    let name = this.name
    let service = this.accessory.addService(Service.Outlet, name);

    let switch_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==0 && @.class=="SWITCH BINARY")]`)[0].$t;
                result = result == 'True';
                callback(null, result);
            } catch (e) {
                console.log(name + ' update failed.');
                callback(e);
            }
        });
    }
    let switch_setter = (state, callback) => {
        let value = { class: 'SWITCH BINARY', genre: 'user', type: 'bool', instance: 1, index: 0 };
        state = state ? 'True':'False';
        this.setValue(value, state, (err) => {
            try {
                if (err) throw err;
                callback(null);
            } catch (e) {
                callback(e);
            }
        });
    }
    service.getCharacteristic(Characteristic.On)
        .on('get', switch_getter)
        .on('set', switch_setter);

    let updater = () => {
        switch_getter((err, result) => {
            service.updateCharacteristic(Characteristic.On, result);
            auto_update_debug(`${this.gateway.mac}:${this.name} Characteristic.On update: ${result}`);
        });
    }
    this.setAutoUpdate(updater, 10 * 1000);

    service.getCharacteristic(Characteristic.OutletInUse)
        .on('get', (callback) => {
            this.getValues((err, values) => {
                try {
                    var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==18 && @.class=="METER")]`)[0].$t;
                    result = result > 0;
                    callback(null, result);
                } catch (e) {
                    callback(e);
                }
            });
        });
};

exports.FourInOneSensor = function () {
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
                callback(null, result);
            } catch (e) {
                console.log(name + ' update failed.');
                callback(e);
            }
        });
    }
    let temperature_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==1 && @.class=="SENSOR MULTILEVEL")]`)[0].$t;
                callback(null, result);
            } catch (e) {
                callback(e);
            }
        });
    }
    let light_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==3 && @.class=="SENSOR MULTILEVEL")]`)[0].$t;
                result = result * 100;
                callback(null, result);
            } catch (e) {
                console.log(name + ' update failed.');
                callback(e);
            }
        });
    }
    let humidity_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==5 && @.class=="SENSOR MULTILEVEL")]`)[0].$t;
                callback(null, result);
            } catch (e) {
                console.log(name + ' update failed.');
                callback(e);
            }
        });
    }
    let battery_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==0 && @.class=="BATTERY")]`)[0].$t;
                callback(null, result);
            } catch (e) {
                console.log(name + ' update failed.');
                callback(e);
            }
        });
    }

    let low_battery_getter = (callback) => {
        battery_getter((err, result)=>{
            try {
                result = result < 5 ?
                    Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
                callback(null, result);
            } catch (e) {
                console.log(this.name + ' update failed.');
                callback(e);
            }
        });
    }

    contact_service.getCharacteristic(Characteristic.ContactSensorState).on('get', contact_getter);
    contact_service.addCharacteristic(Characteristic.BatteryLevel).on('get', battery_getter);
    contact_service.getCharacteristic(Characteristic.StatusLowBattery).on('get', low_battery_getter);

    temperature_service.getCharacteristic(Characteristic.CurrentTemperature).on('get', temperature_getter);
    temperature_service.addCharacteristic(Characteristic.BatteryLevel).on('get', battery_getter);
    temperature_service.getCharacteristic(Characteristic.StatusLowBattery).on('get', low_battery_getter);

    light_service.getCharacteristic(Characteristic.CurrentAmbientLightLevel).on('get', light_getter);
    light_service.addCharacteristic(Characteristic.BatteryLevel).on('get', battery_getter);
    light_service.getCharacteristic(Characteristic.StatusLowBattery).on('get', low_battery_getter);

    humidity_service.getCharacteristic(Characteristic.CurrentRelativeHumidity).on('get', humidity_getter);
    humidity_service.addCharacteristic(Characteristic.BatteryLevel).on('get', battery_getter);
    humidity_service.getCharacteristic(Characteristic.StatusLowBattery).on('get', low_battery_getter);

    battery_service.getCharacteristic(Characteristic.BatteryLevel).on('get', battery_getter);
    battery_service.getCharacteristic(Characteristic.StatusLowBattery).on('get', low_battery_getter);

    contact_service.removeCharacteristic(Characteristic.ChargingState);
    temperature_service.removeCharacteristic(Characteristic.ChargingState);
    light_service.removeCharacteristic(Characteristic.ChargingState);
    humidity_service.removeCharacteristic(Characteristic.ChargingState);

    /* Updater zone */
    this.setAutoUpdate(() => {
        try {
            contact_getter((err, result)=>{
                contact_service.updateCharacteristic(Characteristic.ContactSensorState, result);
                auto_update_debug(`${this.gateway.mac}:${this.name} ContactSensorState update: ${result}`);
            });
            temperature_getter((err, result)=>{
                temperature_service.updateCharacteristic(Characteristic.CurrentTemperature, result);
                auto_update_debug(`${this.gateway.mac}:${this.name} CurrentTemperature update: ${result}`);
            });
            light_getter((err, result)=>{
                light_service.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, result);
                auto_update_debug(`${this.gateway.mac}:${this.name} CurrentAmbientLightLevel update: ${result}`);
            });
            humidity_getter((err, result)=>{
                humidity_service.updateCharacteristic(Characteristic.CurrentRelativeHumidity, result);
                auto_update_debug(`${this.gateway.mac}:${this.name} CurrentRelativeHumidity update: ${result}`);
            });
            battery_getter((err, result)=>{
                contact_service.updateCharacteristic(Characteristic.BatteryLevel, result);
                temperature_service.updateCharacteristic(Characteristic.BatteryLevel, result);
                light_service.updateCharacteristic(Characteristic.BatteryLevel, result);
                humidity_service.updateCharacteristic(Characteristic.BatteryLevel, result);

                auto_update_debug(`${this.gateway.mac}:${this.name} BatteryLevel update: ${result}`);

                result = result < 5 ?
                    Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;

                contact_service.updateCharacteristic(Characteristic.StatusLowBattery, result);
                temperature_service.updateCharacteristic(Characteristic.StatusLowBattery, result);
                light_service.updateCharacteristic(Characteristic.StatusLowBattery, result);
                humidity_service.updateCharacteristic(Characteristic.StatusLowBattery, result);
            });
        } catch (e) {
            debug('UpdateFailure')(name + ' update failed.');
        }
    }, 5 * 1000);

};

exports.ElectronicLock = function () {
    let lock_service = this.accessory.addService(Service.LockMechanism, this.name);
    let battery_service = this.accessory.addService(Service.BatteryService, this.name);;
    /* Getter zone */
    let lock_current_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==0 && @.class=="DOOR LOCK")]`)[0].current;
                switch (result) {
                    case 'Secured':
                        result = Characteristic.LockCurrentState.SECURED;
                        break;
                    case 'Unknown state':
                        result = Characteristic.LockCurrentState.UNKNOWN;
                        break;
                    default:
                        result = Characteristic.LockCurrentState.UNSECURED;
                }
                callback(null, result);
            } catch (e) {
                console.log(this.name + ' update failed.');
                callback(e);
            }
        });
    }
    let battery_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==0 && @.class=="BATTERY")]`)[0].$t;
                callback(null, result);
            } catch (e) {
                debug('UpdateFailure')(e);
                callback(e);
            }
        });
    }

    lock_service.getCharacteristic(Characteristic.LockCurrentState).on('get', lock_current_getter);
    battery_service.getCharacteristic(Characteristic.BatteryLevel).on('get', battery_getter);

    /* Setter zone */
    let lock_target_setter = (state, callback) => {
        let value = { class: 'DOOR LOCK', genre: 'user', type: 'list', instance: 1, index: 0 };
        state = state == Characteristic.LockCurrentState.SECURED ? 'Secured':'Unsecured';
        this.stopAutoUpdate();
        this.setValue(value, state, (err) => {
            try {
                if (err) throw err;
                callback(null);
            } catch (e) {
                console.log(this.name + ' update failed.');
                callback(e);
            } finally {
                this.startAutoUpdate();
            }
        });
    }

    lock_service.getCharacteristic(Characteristic.LockTargetState).on('set', lock_target_setter);

    /* Updater zone */
    lock_current_getter((err, result) => {
        lock_service.setCharacteristic(Characteristic.LockCurrentState, result);
        lock_service.setCharacteristic(Characteristic.LockTargetState, result);
    });
    battery_getter((err, result) => {
        battery_service.setCharacteristic(Characteristic.BatteryLevel, result);
    });
    this.setAutoUpdate(() => {
        try {
            lock_current_getter((err, result) => {
                lock_service.updateCharacteristic(Characteristic.LockCurrentState, result);
                lock_service.updateCharacteristic(Characteristic.LockTargetState, result);
                auto_update_debug(`${this.gateway.mac}:${this.name} LockCurrentState: ${result}`);
            });
            battery_getter((err, result) => {
                battery_service.updateCharacteristic(Characteristic.BatteryLevel, result);
                auto_update_debug(`${this.gateway.mac}:${this.name} BatteryLevel: ${result}`);
            });
        } catch (e) {
            debug('UpdateFailure')(e);
        }
    }, 5 * 1000);
}
exports.ZW4102CurtainControlModule = function () {
    let curtain_service = this.accessory.addService(Service.Switch, this.name);

    let getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==0 && @.class=="SWITCH MULTILEVEL")]`)[0].$t;
                callback(null, result > 50);
            } catch (e) {
                console.log(this.name + ' update failed.');
                callback(e);
            }
        });
    };
    let setter = (state, callback) => {
        let value = { class: 'SWITCH MULTILEVEL', genre: 'user', type: 'byte', instance: 1, index: 0 };
        state = state ? 99:0;
        this.setValue(value, state, (err) => {
            try {
                if (err) throw err;
                callback(null);
            } catch (e) {
                debug('UpdateFailure')(e);
                callback(e);
            }
        });
    };

    curtain_service.getCharacteristic(Characteristic.On).on('get', getter);
    curtain_service.getCharacteristic(Characteristic.On).on('set', setter);

    this.setAutoUpdate(() => {
        try {
            getter((err, result) => {
                curtain_service.updateCharacteristic(Characteristic.On, result);
                auto_update_debug(`${this.gateway.mac}:${this.name} Characteristic.On: ${result}`);
            });
        } catch (e) {
            debug('UpdateFailure')(e);
        }
    }, 10 * 1000);
};


exports.ZW41115CurtainControlModule = function () {
    let curtain_service = this.accessory.addService(Service.WindowCovering, this.name);

    let getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==0 && @.class=="SWITCH MULTILEVEL")]`)[0].$t;
		result = result == 99 ? 100:result;
                callback(null, result);
            } catch (e) {
                console.log(this.name + ' update failed.');
                callback(e);
            }
        });
    };
    let setter = (state, callback) => {
        let value = { class: 'SWITCH MULTILEVEL', genre: 'user', type: 'byte', instance: 1, index: 0 };
        state = state;
	state = state == 100 ? 99:state; 
        this.stopAutoUpdate();
        this.setValue(value, state, (err) => {
            try {
                if (err) throw err;
                callback(null);
            } catch (e) {
                console.log(this.name + ' update failed.');
                callback(e);
            } finally {
                this.startAutoUpdate();
            }
        });
    };

    curtain_service.getCharacteristic(Characteristic.CurrentPosition).on('get', getter);
    curtain_service.getCharacteristic(Characteristic.TargetPosition).on('set', setter);

    this.setAutoUpdate(() => {
        try {
            getter((err, result) => {
                curtain_service.updateCharacteristic(Characteristic.CurrentPosition, result);
                curtain_service.updateCharacteristic(Characteristic.TargetPosition, result);
                auto_update_debug(`${this.gateway.mac}:${this.name} Characteristic.On: ${result}`);
            });
        } catch (e) {
            debug('UpdateFailure')(e);
        }
    }, 5 * 1000);
};
exports.ZW4102CurtainControlModule_v2 = function () {
    let curtain_service = this.accessory.addService(Service.WindowCovering, this.name);

    let getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==0 && @.class=="SWITCH MULTILEVEL")]`)[0].$t;
                callback(null, result > 50 ? 100:0);
            } catch (e) {
                console.log(this.name + ' update failed.');
                callback(e);
            }
        });
    };
    let setter = (state, callback) => {
        let value = { class: 'SWITCH MULTILEVEL', genre: 'user', type: 'byte', instance: 1, index: 0 };
        state = state > 50 ? 99:0;
        this.stopAutoUpdate();
        this.setValue(value, state, (err) => {
            try {
                if (err) throw err;
                callback(null);
            } catch (e) {
                console.log(this.name + ' update failed.');
                callback(e);
            } finally {
                this.startAutoUpdate();
            }
        });
    };

    curtain_service.getCharacteristic(Characteristic.CurrentPosition).on('get', getter);
    curtain_service.getCharacteristic(Characteristic.TargetPosition).on('set', setter);

    this.setAutoUpdate(() => {
        try {
            getter((err, result) => {
                curtain_service.updateCharacteristic(Characteristic.CurrentPosition, result);
                curtain_service.updateCharacteristic(Characteristic.TargetPosition, result);
                auto_update_debug(`${this.gateway.mac}:${this.name} Characteristic.On: ${result}`);
            });
        } catch (e) {
            debug('UpdateFailure')(e);
        }
    }, 5 * 1000);
};

exports.DimmerModule = function () {
    let bulb_service = this.accessory.addService(Service.Lightbulb, this.name);

    let bright_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==0 && @.class=="SWITCH MULTILEVEL")]`)[0].$t;
                result = result >= 99 ? 100 : result;
                callback(null, result);
            } catch (e) {
                console.log(this.name + ' update failed.');	
                callback(e);
            }
        });
    }

    let bright_setter = (state, callback) => {
        let value = { class: 'SWITCH MULTILEVEL', genre: 'user', type: 'byte', instance: 1, index: 0 };
        this.setValue(value, state, (err) =>{
            try {
                if (err) throw err;
                callback(null);
            } catch (e) {
                callback(e);
            }
        });
    }

    let switch_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==0 && @.class=="SWITCH MULTILEVEL")]`)[0].$t;
                result = result > 0;
                callback(null, result);
            } catch (e) {
                callback(e);
            }
        });
    }
    let switch_setter = (state, callback) => {
        //let value = { class: 'SWITCH MULTILEVEL', genre: 'user', type: 'bool', instance: 1, index: 0 };
        let bright = bulb_service.getCharacteristic(Characteristic.Brightness).value;
	bright = bright == 0 ? 100 : bright; // for default brightness & convience turn on a light briefly
        bright = bright == 100 ? 99 : bright;
        bright_setter(state ? bright:0, (err) => {
            if (err) console.log(err);
	    callback(err)
        });
	/*	
        state = state ? 'True':'False';
        this.setValue(value, state, (err) =>{
            try {
                if (err) throw err;
                callback(null);
            } catch (e) {
                callback(e);
            }
        });
	*/
    }
    bulb_service.getCharacteristic(Characteristic.On)
        .on('get', switch_getter)
        .on('set', switch_setter);

    bulb_service.getCharacteristic(Characteristic.Brightness)
        .on('get', bright_getter)
        .on('set', bright_setter);

    this.setAutoUpdate(() => {
        try {
            switch_getter((err, result) => {
                bulb_service.updateCharacteristic(Characteristic.On, result);
                auto_update_debug(`${this.gateway.mac}:${this.name} Characteristic.On: ${result}`);
            });
	   
            bright_getter((err, result) => {
                bulb_service.updateCharacteristic(Characteristic.Brightness, result);
                auto_update_debug(`${this.gateway.mac}:${this.name} Characteristic.Brightness: ${result}`);
            });
        } catch (e) {
            debug('UpdateFailure')(e);
        }
    }, 10 * 1000);
};

exports.FourInOneMotoionSensor = function () {
    let name = this.name;
    let motion_service = this.accessory.addService(Service.MotionSensor, name);
    let temperature_service = this.accessory.addService(Service.TemperatureSensor, name);
    let light_service = this.accessory.addService(Service.LightSensor, name);
    let humidity_service = this.accessory.addService(Service.HumiditySensor, name);
    let battery_service = this.accessory.addService(Service.BatteryService, name);

    /* Getter zone */
    let motion_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==7 && @.class=="ALARM")]`)[0].$t;
                result = result.match(/0x00/) == null;
                callback(null, result);
            } catch (e) {
		debug('FourInOneMotionSensor')(`${this.gateway.mac} ${this.gateway.setting.ip} ${this.name}`);
		debug_update_failure(e);
                callback(e);
            }
        });
    }
    let temperature_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==1 && @.class=="SENSOR MULTILEVEL")]`)[0].$t;
                callback(null, result);
            } catch (e) {
		debug('FourInOneMotionSensor')(`${this.gateway.mac} ${this.gateway.setting.ip} ${this.name}`);
                callback(e);
            }
        });
    }
    let light_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==3 && @.class=="SENSOR MULTILEVEL")]`)[0].$t;
                result = result * 100;
                callback(null, result);
            } catch (e) {
		debug('FourInOneMotionSensor')(`${this.gateway.mac} ${this.gateway.setting.ip} ${this.name}`);
                callback(e);
            }
        });
    }
    let humidity_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==5 && @.class=="SENSOR MULTILEVEL")]`)[0].$t;
                callback(null, result);
            } catch (e) {
		debug('FourInOneMotionSensor')(`${this.gateway.mac} ${this.gateway.setting.ip} ${this.name}`);
                callback(e);
            }
        });
    }
    let battery_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==0 && @.class=="BATTERY")]`)[0].$t;
                callback(null, result);
            } catch (e) {
		debug('FourInOneMotionSensor')(`${this.gateway.mac} ${this.gateway.setting.ip} ${this.name}`);
                callback(e);
            }
        });
    }

    let low_battery_getter = (callback) => {
        battery_getter((err, result)=>{
            try {
                result = result < 5 ?
                    Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
                callback(null, result);
            } catch (e) {
		debug('FourInOneMotionSensor')(`${this.gateway.mac} ${this.gateway.setting.ip} ${this.name}`);
                callback(e);
            }
        });
    }

    motion_service.getCharacteristic(Characteristic.MotionDetected).on('get', motion_getter);
    motion_service.addCharacteristic(Characteristic.BatteryLevel).on('get', battery_getter);
    motion_service.getCharacteristic(Characteristic.StatusLowBattery).on('get', low_battery_getter);

    temperature_service.getCharacteristic(Characteristic.CurrentTemperature).on('get', temperature_getter);
    temperature_service.addCharacteristic(Characteristic.BatteryLevel).on('get', battery_getter);
    temperature_service.getCharacteristic(Characteristic.StatusLowBattery).on('get', low_battery_getter);

    light_service.getCharacteristic(Characteristic.CurrentAmbientLightLevel).on('get', light_getter);
    light_service.addCharacteristic(Characteristic.BatteryLevel).on('get', battery_getter);
    light_service.getCharacteristic(Characteristic.StatusLowBattery).on('get', low_battery_getter);

    humidity_service.getCharacteristic(Characteristic.CurrentRelativeHumidity).on('get', humidity_getter);
    humidity_service.addCharacteristic(Characteristic.BatteryLevel).on('get', battery_getter);
    humidity_service.getCharacteristic(Characteristic.StatusLowBattery).on('get', low_battery_getter);

    battery_service.getCharacteristic(Characteristic.BatteryLevel).on('get', battery_getter);
    battery_service.getCharacteristic(Characteristic.StatusLowBattery).on('get', low_battery_getter);

    /* Updater zone */
    this.setAutoUpdate(() => {
            motion_getter((err, result)=>{
		if (!err){
			motion_service.updateCharacteristic(Characteristic.MotionDetected, result);
			auto_update_debug(`${this.gateway.mac}:${this.name} MotionDetected update: ${result}`);
		}else{
            		//debug('UpdateFailure')(`${this.name}`);
		}
            });
            temperature_getter((err, result)=>{
		if (!err) {
			temperature_service.updateCharacteristic(Characteristic.CurrentTemperature, result);
			auto_update_debug(`${this.gateway.mac}:${this.name} CurrentTemperature update: ${result}`);
		}else{
            		//debug('UpdateFailure')(err);
		}
            });
            light_getter((err, result)=>{
		if (!err) {
			light_service.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, result);
			auto_update_debug(`${this.gateway.mac}:${this.name} CurrentAmbientLightLevel update: ${result}`);
		}else{
            		//debug('UpdateFailure')(err);
		}
            });
            humidity_getter((err, result)=>{
		if (!err) {
			humidity_service.updateCharacteristic(Characteristic.CurrentRelativeHumidity, result);
			auto_update_debug(`${this.gateway.mac}:${this.name} CurrentRelativeHumidity update: ${result}`);
		}else{
            		//debug('UpdateFailure')(err);
		}
            });
            battery_getter((err, result)=>{
		if (!err) {
			motion_service.updateCharacteristic(Characteristic.BatteryLevel, result);
			temperature_service.updateCharacteristic(Characteristic.BatteryLevel, result);
			light_service.updateCharacteristic(Characteristic.BatteryLevel, result);
			humidity_service.updateCharacteristic(Characteristic.BatteryLevel, result);

			auto_update_debug(`${this.gateway.mac}:${this.name} BatteryLevel update: ${result}`);

			result = result < 5 ?
			    Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;

			motion_service.updateCharacteristic(Characteristic.StatusLowBattery, result);
			temperature_service.updateCharacteristic(Characteristic.StatusLowBattery, result);
			light_service.updateCharacteristic(Characteristic.StatusLowBattery, result);
			humidity_service.updateCharacteristic(Characteristic.StatusLowBattery, result);
		}else{
            		//debug('UpdateFailure')(err);
		}
            });
    }, 5 * 1000);
};



exports.GeneralThermostat_v2 = function () {
    let thermostat_service = this.accessory.addService(Service.Thermostat, this.name);
    
    // CurrentHeaterCoolerState
    let state_getter = (callback) => {
        this.getValues((err, values) => {
            try {
                var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==0 && @.class=="THERMOSTAT MODE")]`)[0].current;
		switch (result) {
		    case 'Off': 
			result = Characteristic.CurrentHeatingCoolingState.OFF;
			break;
		    case 'Cool':
			result = Characteristic.CurrentHeatingCoolingState.COOL;
			break;
		    case 'Heat':
			result = Characteristic.CurrentHeatingCoolingState.HEAT;
			break;
		    case 'Auto Changeover':
			result = Characteristic.CurrentHeatingCoolingState.COOL;
			break;
		    default:
			result = Characteristic.CurrentHeatingCoolingState.OFF;
			break;
	        }
		thermostat_service.updateCharacteristic(Characteristic.TargetHeatingCoolingState, result);
                callback(null, result);
            } catch (e) {
                callback(e);
            }
        });
    }
    // TargetHeaterCoolerState
    let state_setter = (state, callback) => {
	thermostat_service.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, state);
	let value = { class: 'THERMOSTAT MODE', genre: 'user', type: 'list', instance: 1, index: 0 };
	switch (state) {
		case Characteristic.TargetHeatingCoolingState.OFF:
		    state = 'Off';
		    break;
		case Characteristic.TargetHeatingCoolingState.HEAT:
		    state = 'Heat';
		    break;
		case Characteristic.TargetHeatingCoolingState.COOL:
		    state = 'Cool';
		    break;
		case Characteristic.TargetHeatingCoolingState.AUTO:
		    state = 'Auto Changeover';
		    break;
		default:
		    state = 'Off';
		    break;
	}

	this.setValue(value, state, (err) => {
	    try {
		if (err) throw err;
		temp_getter((err, result) => {
		    if (err) throw err;
		    thermostat_service.updateCharacteristic(Characteristic.CurrentTemperature, result);
		});
		callback(null);
	    } catch (e) {
		callback(e);
	    }
	});
    }

    // CurrentTemperature
    let temp_getter = (callback) => {
        this.getValues((err, values) => {
	    try {
		var current_index = 2; 
		switch (thermostat_service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value) {
			case Characteristic.CurrentHeatingCoolingState.OFF:
			    current_index = 8;
			    break;
			case Characteristic.CurrentHeatingCoolingState.HEAT:
			    current_index = 1
			    break;
			case Characteristic.CurrentHeatingCoolingState.COOL:
			    current_index = 2;
			    break;
			default:
			    current_index = 10;
			    break;
		}
	        var result = jsonpath.query(values, `$..[?(@.instance==1 && @.index==${current_index} && @.class=="THERMOSTAT SETPOINT")]`)[0].$t;
		callback(err, result);
	    } catch (e) {
		callback(e);
	    }
	});
    }

    // TargetTemperature
    let temp_setter = (state, callback) => {
	var current_index = 2; 
	switch (thermostat_service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value) {
		case Characteristic.CurrentHeatingCoolingState.OFF:
		    current_index = 10;
		    break;
		case Characteristic.CurrentHeatingCoolingState.HEAT:
		    current_index = 1
		    break;
		case Characteristic.CurrentHeatingCoolingState.COOL:
		    current_index = 2;
		    break;
		default:
		    current_index = 10;
		    break;
	}
	let value = { class: 'THERMOSTAT SETPOINT', genre: 'user', type: 'decimal', instance: 1, index: current_index };
	thermostat_service.updateCharacteristic(Characteristic.CurrentTemperature, state)
	this.setValue(value, state, (err) => {
	    try {
		if (err) throw err;
		callback(null);
	    } catch (e) {
		callback(e);
	    }
	});
    }
    

    thermostat_service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
        .on('get', state_getter);
    thermostat_service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .on('set', state_setter);

    thermostat_service.getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', temp_getter);
    thermostat_service.getCharacteristic(Characteristic.TargetTemperature)
        .on('set', temp_setter);

    this.setAutoUpdate(() => {
	    state_getter((err, result) => {
		if (!err) {
			thermostat_service.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, result);
			debug('Thermostate')(`${this.gateway.mac}:${this.name} Characteristic.CurrentHeatingCoolingState: ${result}`);
		}else{
			debug('UpdateFailure')(err);
		}
	    });
	    temp_getter((err, result) => {
		    if (!err) {
			thermostat_service.updateCharacteristic(Characteristic.CurrentTemperature, result);
			debug('ThermostateCurrentTemperature')(`${this.gateway.mac}:${this.name} Characteristic.CurrentTemperature: ${result}`);
		    }else{
			thermostat_service.updateCharacteristic(Characteristic.CurrentTemperature, 77);
			debug('UpdateFailure')(err);
		    }
	    });
    }, 6 * 1000);
};

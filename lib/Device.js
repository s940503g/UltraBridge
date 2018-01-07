'use strict';
const debug = require('debug')
const auto_update_debug = require('debug')('AutoUpdate');
const hap_nodejs = require('hap-nodejs');
const Accessory = hap_nodejs.Accessory;
const Service = hap_nodejs.Service;
const Characteristic = hap_nodejs.Characteristic;
const uuid = hap_nodejs.uuid;
const events = require('events');
const util = require('util');

module.exports = Device;

function Device (template, gateway, node) {
    this.gateway = gateway;
    this.node = node;
    this.name = node.name || node.product;
    this.name = node.location + " " + this.name;

    this.accessory = new Accessory(this.name, uuid.generate(global.piMacAddress + this.node.id + this.gateway.mac));
    this.accessory.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, this.node.manufacturer)
		.setCharacteristic(Characteristic.Model, this.node.product)
		.setCharacteristic(Characteristic.SerialNumber, this.node.id);

    this.accessory.on('identify', (paired, callback) => {
    		debug('AccessoryIdentify')(this.name +' identified.');
            console.log(this.name +' identified.');
    		callback();
    	});

    this.setPollRequestListener();

    template.apply(this);
}

util.inherits(Device, events.EventEmitter);

Device.prototype.setPollRequestListener = function () {
    let pollRequestListener = () => {
        this.gateway.getNodeValues(this.node.id, (err, result) => {
            debug('Polling')(this.gateway.mac + ":" + this.name + ' poll data.');
            this.cache = result;
            this.emit('poll-response', err, result);

            setTimeout(() => { // keep cache
                this.cache = null;
                if (!this.listeners('poll-request').length) {
                    this.once('poll-request', pollRequestListener);
                }
            }, 0.5 * 1000);
        });
    }

    this.once('poll-request', pollRequestListener);
};

Device.prototype.getValues = function (callback) {
    if (this.cache) {
        console.log('use cache.')
        callback(null, this.cache);
    } else {
        this.once('poll-response', (err, result) => { // wait for response;
            callback(err, result);
        });
        this.emit('poll-request');
    }
};

Device.prototype.setValue = function (value, state, callback) {
    this.resetAutoUpdate();
    this.gateway.setValue(this.node.id, value, state, (err) => {
        callback(err);
    });
};

Device.prototype.setAutoUpdate = function (updateFn, updateTimer) {
    if (this.updateFn) {
        let old_updateFn = this.updateFn;
        let new_updateFn = () => {
            old_updateFn();
            updateFn();
        }
        this.updateFn = new_updateFn;
        if (updateTimer) {
            this.updateTimer = updateTimer;
        }
    } else {
        this.updateFn = updateFn;
        this.updateTimer = updateTimer;
    }

    let clients = this.gateway.Bridge._accessoryInfo.pairedClients;
    for (var client in clients) {
        this.startAutoUpdate();
		break;
	}
};

Device.prototype.stopAutoUpdate = function () {
    auto_update_debug(this.name + ' stop auto updating.');
    clearInterval(this.updater);
    this.updater = undefined;
};

Device.prototype.startAutoUpdate = function () {
    auto_update_debug(this.name + ' start auto updating.');
    if (!this.updater) {
        this.updater = setInterval(() => {
            this.updateFn();
        }, this.updateTimer);
    }
};

Device.prototype.resetAutoUpdate = function (option) {
    this.stopAutoUpdate();
    auto_update_debug(this.name + 'reset auto update');
    if (option) {
        this.updateFn = option.function;
        this.updateTimer = option.timer;
    }
    if (this.updateFn) {
        this.startAutoUpdate();
    }
};

Device.prototype.remove = function () {
    clearInterval(this.updater);
    this.removeAllListeners();
    debug('DeviceTemplate')(`${this.name} removed.`);
};

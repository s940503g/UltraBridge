'use strict';
const debug = require('debug')('Gateway');
const destroy_debug = require('debug')('Destroy');
const events = require('events');
const hap_nodejs = require('hap-nodejs');
const Accessory = hap_nodejs.Accessory;
const Service = hap_nodejs.Service;
const Characteristic = hap_nodejs.Characteristic;
const uuid = hap_nodejs.uuid;
const child_process = require('child_process');
const parser = require('xml2json').toJson;
const Bridge = hap_nodejs.Bridge;
const GatewayManager = require("./GatewayManager.js");
const GatewayInfo  = require("./GatewayInfo.js");
const DeviceTemplate = require('./DeviceTemplate.js');

module.exports = Gateway;

function Gateway(mac, model, ip) {
	this.mac = mac;
	this._info = GatewayInfo.load(mac);
	this.setting = {};
	this.setting.ip = ip;
	this.model = this._info.model;

	this.name = this.model + " " + this.mac;
	this.devices = [];
	this.emitter = new events.EventEmitter();

	this.setBridgeAccessory();
	this.prepareForBridgingAccessories();

	let errorHandle = (err) => {
		clearTimeout(this.cleaner);
		this.cleaner = setTimeout(() => {
			GatewayManager.remove(this.mac);
			this.cleaner = null;
		}, 30 * 1000);
		this.reset();
	};
	this.emitter.once('error', errorHandle);
}

Gateway.prototype.setBridgeAccessory = function () {

	// init a BridgeAccessory;
	this.Bridge = this.Bridge || new Bridge(this.name, uuid.generate(this.mac));
	this.Bridge.username = this.mac.toUpperCase().match(/.{1,2}/g).join(':');
	this.Bridge.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Name, 'UltraHub')
		.setCharacteristic(Characteristic.Manufacturer, "Avadesign Technology")
		.setCharacteristic(Characteristic.Model, this.model)
		.setCharacteristic(Characteristic.SerialNumber, this.mac)

	this.Bridge.on('identify', (paired, callback) => {
		debug("Gateway "+ this.name +' identified.');
		callback();
	});
};

Gateway.prototype.getInfrastructure = function (callback) {
	debug('Getting Infrastructure on Gateway ' + this.mac);
	let cmd = 'curl --digest -u ' + this.setting.acc + ":"+ this.setting.pwd +' '+ this.setting.ip + ':5000/node_detail.cgi -d "fun=load"';
	child_process.exec(cmd, {timeout: 5 * 1000}, (err, stdout) => {
		let json = parser(stdout, {
			object:true
		});

		callback(err, json);
	});
}

Gateway.prototype.getScenes = function (callback) {
	let cmd = 'curl --digest -u ' + this.setting.acc + ":"+ this.setting.pwd +' '+ this.setting.ip + ':5000/scenepost.html -d "fun=load"';
	child_process.exec(cmd, function (err, stdout) {
		let json = parser(stdout, {
			object:true
		});
		callback(err, json);
	});
}

Gateway.prototype.prepareForBridgingAccessories = function () {
	this.emitter.on('bridge_node', (node) => { // determine which zwave product transforms to which HAP template.
		debug('Gateway ' + this.mac + ' bridging ' + node.product + ":" + node.name);

		let device = new DeviceTemplate(this, node);

		switch (node.product) {
			case 'ZL7435 In-Wall Switch, 2 Relays':
				this.addDevice(device.WallSwitch());
				break;
			case "Wall Switch x3":
				this.addDevice(device.WallSwitch());
				break;
			case "Door Sensor":
				this.addDevice(device.DoorSensor());
				break;
			default:
				debug('UltraBridge not verified product: [' + node.product + '] Ignored.');
		}
	});

	this.emitter.on('bridge_scene', (scene) => {
		this.bridgeScene(scene);
	});
};

Gateway.prototype.addDevice = function (device) {
	this.devices.push(device);
	this.Bridge.addBridgedAccessory(device.accessory);
};

Gateway.prototype.registerAdminUser = function (acc, pwd) {
	this._info.acc = acc;
	this._info.pwd = pwd;

	this.setting.acc = acc;
	this.setting.pwd = pwd;
};

Gateway.prototype.BridgeGateway = function (acc, pwd) {
	this.registerAdminUser(acc, pwd);
	this.getInfrastructure((err, data) => {
		try {
			if (err) throw err;
			if (!data || data === {}) throw "Can't get data from " + this.setting.ip + " " + this.mac;

			this.version = data.node_detail.version;


			if (!this.Bridge) throw new Error(this.mac + " Bridge Accessory not exists.");

			this.Bridge.getService(Service.AccessoryInformation)
				.setCharacteristic(Characteristic.FirmwareRevision, this.version);

			data.node_detail.node.forEach((node) => {
				this.emitter.emit('bridge_node', node);
			});

			// this.getScenes((err, data) => {
			// 	debug('Getting scene on ' + this.mac + '.');
			// 	if (!err && data.sceneid instanceof Array) {
			// 		data.scenes.sceneid.forEach((scene) => {
			// 			this.emitter.emit('bridge_scene', scene);
			// 		});
			// 	}
			// });

			this._info.save(); // acc, pwd and ip is correct, so save the info.
		} catch (e) {
			debug(e);
		}
	});
};

Gateway.prototype.destroy = function () { // Stop gateway active and remove all accessories;
	try {
		this.Bridge.destroy(); // stop publishing
		this.Bridge.removeAllBridgedAccessories(); // remove accessory

		for (var i in this.devices) {
			// destroy_debug('stop updaters.');
			this.devices[i].stopActive();
		}
		this.devices = [];

		destroy_debug('Gateway ' + this.mac + ' is destroyed.');
	} catch (e) {
		destroy_debug(e);
	}
};

Gateway.prototype.publish = function (port, pincode) {
	if (port && pincode) {
		this.port = port;
		this.pincode = pincode;
	}

	debug('Gateway ' + this.mac + ' published. ' + 'ip: ' + this.setting.ip);

	this.Bridge.publish({
		port: this.port,
		pincode: this.pincode,
		username: this.Bridge.username,
		category: Accessory.Categories.BRIDGE
	});
};

Gateway.prototype.reset = function () {
	debug(this.mac + ' receieve ip reset request.');

	// this.destroy();

	let old_setting = {
		acc: this.setting.acc,
		pwd: this.setting.pwd,
		ip: this.setting.ip
	};

	GatewayManager.scan(); // rescan gateway on network;
	GatewayManager.emitter.once('new-ip' + this.mac, (ip) => {
		debug('Gateway ' + this.mac + ' reseting ip ' + this.setting.ip + ' -> ' + new_setting.ip);
		if (old_setting.ip !== ip) {
			debug('Gateway ' + this.mac + ' reseting ip ' + this.setting.ip + ' -> ' + new_setting.ip);
		} else {
			if (this.cleaner) clearTimeout(this.cleaner);
		}
	});
}

Gateway.prototype.getNodeValues = function (nodeId, callback) {
     this.curl = 'curl --digest ' + '-u ' + this.setting.acc + ':' + this.setting.pwd + ' ' + this.setting.ip + ':5000/';
     let cmd = this.curl + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"';

	 try {
		 child_process.exec(cmd,/* {timeout: 5 * 1000},*/ (err, stdout) => {
             let values;
             try {
                 if (err) throw err;
                 values = parser(stdout, {object: true}).node_detail.node.value;
             } catch (e) {
                 debug(e);
                 this.emitter.emit('error', e);
             } finally {
                 callback(err, values);
             }
         });
	 } catch (e) {
	 	debug('####' + e);
		this.emitter.emit('error', e);
	 }
 };


Gateway.prototype.bridgeScene = function (sceneid) {
	let name = sceneid.label + sceneid.id || 'Scene ' + sceneid.id;
	let accessory = new Accessory(name + " ", uuid.generate(sceneid.id + name + this.mac));

	accessory.on('identify', function(paired, callback) {
		debug(name + " identified!!");
		callback();
	});

	let service = accessory.addService(Service.Switch, name);
	service
		.getCharacteristic(Characteristic.On)
		.on('get', (callback) => {
			callback(null, false);
		})
		.on('set', (on, callback) => {
			let cmd = 'curl --digest -u ' + this.setting.acc + ":"+ this.setting.pwd +' '+ this.setting.ip + ':5000/scenepost.html -d "fun=execute&id='+ sceneid.id +'"';
			child_process.exec(cmd, (err) => {
				service.updateCharacteristic(Characteristic.On, true);
				callback(err);
			});
		});

	this.emitter.emit('new_accessory', accessory);
}

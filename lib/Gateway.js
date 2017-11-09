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
const isReachable = require('is-reachable');

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

	this.reachable = true;
	this.setWatchDog();
}

Gateway.prototype.setBridgeAccessory = function () {
	// init a BridgeAccessory;
	this.Bridge = this.Bridge || new Bridge(this.name, uuid.generate(this.mac));
	this.Bridge.username = this.mac.toUpperCase().match(/.{1,2}/g).join(':');
	this.Bridge.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, "Avadesign Technology")
		.setCharacteristic(Characteristic.Model, this.model)
		.setCharacteristic(Characteristic.SerialNumber, this.mac);

	this.Bridge.on('identify', (paired, callback) => {
		debug("Gateway "+ this.name +' identified.');
		callback();
	});
};

Gateway.prototype.getInfrastructure = function (callback) {
	debug('Getting Infrastructure on Gateway ' + this.mac);
	child_process.exec(this.curl + 'node_detail.cgi -d "fun=load"', {timeout: 5 * 1000}, (err, stdout) => {
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

		switch (node.product) {
			case 'ZL7435 In-Wall Switch, 2 Relays':
				this.addDevice(new DeviceTemplate(this, node).WallSwitch());
				break;
			case "Wall Switch x3":
				this.addDevice(new DeviceTemplate(this, node).WallSwitch());
				break;
			case "Door Sensor":
				this.addDevice(new DeviceTemplate(this, node).DoorSensor());
				break;
			case "ZL7261DE-5 Power Monitor":
				this.addDevice(new DeviceTemplate(this, node).PowerMonitor());
				break;
			case "ZD2301-5 Door 4 in 1 Sensor":
				this.addDevice(new DeviceTemplate(this, node).FourInOneSensor());
				break;
			case "MiLocks":
				this.addDevice(new DeviceTemplate(this, node).MiLock());
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
	try {
		this.Bridge.addBridgedAccessory(device.accessory);
		this.devices.push(device);
	} catch (e) {
		debug(e);
	}
};

Gateway.prototype.registerAdminUser = function (acc, pwd) {
	this._info.acc = acc;
	this._info.pwd = pwd;

	this.setting.acc = acc;
	this.setting.pwd = pwd;
};

Gateway.prototype.BridgeGateway = function (acc, pwd, callback) {
	this.registerAdminUser(acc, pwd);

	this.curl = 'curl --digest ' + '-u ' + this.setting.acc + ':' + this.setting.pwd + ' ' + this.setting.ip + ':5000/';

	this.getInfrastructure((err, data) => {
		try {
			if (err) throw err;
			if (!data || data === {}) throw "Can't get data from " + this.mac + ":" + this.setting.ip;

			this.version = data.node_detail.version;

			this.Bridge.getService(Service.AccessoryInformation)
				.setCharacteristic(Characteristic.FirmwareRevision, this.version);

			data.node_detail.node.forEach((node) => {
				this.emitter.emit('bridge_node', node);
			});

			this._info.save(); // acc, pwd and ip is correct, so save the info.
			debug('Gateway ' + this.mac + ' setting success.');
			if (callback) callback();
		} catch (e) {
			debug(e);
			debug('Gateway ' + this.mac + ' failed to bridge.');
			this.unregisterAdminUser();

			if (callback) callback(e);
		}
	});
};

Gateway.prototype.unregisterAdminUser = function () {
	this._info.acc = '';
	this._info.pwd = '';
	this.setting.acc = '';
	this.setting.pwd = '';
	this._info.save();
};

Gateway.prototype.rebridgeGateway = function () {
	if (this.setting.acc && this.setting.pwd) {
		for (var i in this.devices) {
			this.devices[i].stopActive();
		}
		this.devices = [];
		this.Bridge.removeAllBridgedAccessories();
		this.BridgeGateway(this.setting.acc, this.setting.pwd);
		debug(this.mac + ' rebridged.');
	}else{
		throw Error('Gateway ' + this.mac + ' not registered.');
	}
};
Gateway.prototype.destroy = function () { // destroy Bridge and devices.
	try {
		this.Bridge.destroy(); // stop publishing
		this.Bridge.removeAllBridgedAccessories(); // remove accessory

		for (var i in this.devices) {
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

Gateway.prototype.getNodeValues = function (nodeId, callback) {
	let values;
	let error;
	let proc = child_process.exec(this.curl + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', {timeout: 3 * 1000},
	(err, stdout) => {
		try {
			if (err) throw err;
			values = parser(stdout, {object: true}).node_detail.node.value;
	 	} catch (e) {
	 		error = e;
	 	}
	});

	proc.on('close', (code, signal) => {
		try {
			if (code || signal || error) { // Can't poll data.
				throw Error("Can't poll data from " + this.name);
			} else {
				callback(null, values);
			}
		} catch (e) {
			// Can't poll ths node.
			// if (this.emitter.listeners('error').length) this.emitter.emit('error', signal || error);
			callback(e);
		}
	});
}

Gateway.prototype.setValue = function (nodeId, value, state, callback) {
    let proc = child_process.exec(this.curl + 'valuepost.html -d "' +
    	nodeId + '-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' +
		value.type + '-' + value.instance + '-' + value.index + '=' +
		state + '"', {timeout: 3 * 1000});

	proc.on('close', (code, signal) => {
		try {
			if (code || signal) {
				throw Error("Can't control  " + this.name);
			   //  if (this.emitter.listeners('error').length) this.emitter.emit('error', signal || error);
			} else {
			   callback(null);
			}
		} catch (e) {
			callback(e);
		}
	});
};

Gateway.prototype.resetIP = function () {
	debug(this.mac + ' receieve ip reset request.');

	GatewayManager.emitter.once(`renew-${this.mac}`, (ip, acc, pwd) => {
			debug('Gateway ' + this.mac + ' reseting ip ' + this.setting.ip + ' -> ' + ip);
			this.setting.ip = ip;
			this.setting.acc = acc;
			this.setting.pwd = pwd;
			this.reachable = true;
	});

	GatewayManager.scan(); // rescan gateway on network;
}

Gateway.prototype.setWatchDog = function () {
	this.watchDog = setInterval(() => {
		isReachable(this.setting.ip + ":5000", {timeout: 1 * 1000}).then((reachable) => {
			if (reachable) {
				debug(this.mac + ' is reachable.');
				this.reachable = true;
			} else {
				debug(this.mac + ' is unreachable.');
				this.reachable = false;
				this.resetIP();
			}
		});
	}, 15 * 1000);
};

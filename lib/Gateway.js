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
const macaddress = require('macaddress');

module.exports = Gateway;

global.piMacAddress = macaddress.networkInterfaces().eth0 || macaddress.networkInterfaces().wlan0;
global.piMacAddress = global.piMacAddress.mac;

function Gateway(mac, model, ip) {
	this.mac = mac;
	this._info = GatewayInfo.load(mac);
	this.setting = {};
	this.setting.ip = ip;
	this.model = this._info.model;

	this.name = this.model + " " + this.mac;
	this.devices = [];
	this.emitter = new events.EventEmitter();

	this.setBridge();

	this.reachable = true;
	this.setWatchDog();
}

Gateway.prototype.isPaired = function () {
	let clients = this.Bridge._accessoryInfo.pairedClients;
	for (var client in clients) {
		return true;
		break;
	}
	return false;
};

Gateway.prototype.setBridge = function () {
	// init a Bridge object;
	this.Bridge = this.Bridge || new Bridge(this.name, uuid.generate(this.mac + global.piMacAddress));
	this.Bridge.username = this.mac.toUpperCase().match(/.{1,2}/g).join(':');
	this.Bridge.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, "Avadesign Technology")
		.setCharacteristic(Characteristic.Model, this.model)
		.setCharacteristic(Characteristic.SerialNumber, this.mac);

	this.Bridge.on('identify', (paired, callback) => {
		debug("Gateway "+ this.name +' identified.');
		callback();
	});

	this.Bridge._server.on('pair', () => {
		this.devices.forEach((device) => {
			device.startAutoUpdate();
		});
	});
	
	this.Bridge._server.on('unpair', () => {
		// stop device active if no one use it.
		this.devices.forEach((device) => {
			if (!this.isPaired()) {
				device.stopAutoUpdate();
			}
		});
	});
};

Gateway.prototype.getInfrastructure = function (callback) {
	debug('Getting Infrastructure on Gateway ' + this.mac);
	child_process.exec('curl --digest ' + '-u ' + this.setting.acc + ':' +
		this.setting.pwd + ' ' + this.setting.ip + ':5000/' + 'node_detail.cgi -d "fun=load"', {timeout: 5 * 1000}, (err, stdout) => {
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

Gateway.prototype.bridgeDevice = function (node) {
	debug('Gateway ' + this.mac + ' bridging ' + node.product + ":" + node.name);

	switch (node.product) {
		case 'ZL7435 In-Wall Switch, 2 Relays':
			this.addDevice(new DeviceTemplate(this, node).WallSwitch());
			break;
		case "Wall Switch x3":
			this.addDevice(new DeviceTemplate(this, node).WallSwitch());
			break;
		case "Wall Switch x4":
			this.addDevice(new DeviceTemplate(this, node).WallSwitch());
			break;
		case "Wall Switch":
			this.addDevice(new DeviceTemplate(this, node).WallSwitch());
			break;
		case "Wall Switch x2":
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
		case "ZD2201-5 4-in-1 Multi Sensor":
			this.addDevice(new DeviceTemplate(this, node).FourInOneSensor());
			break;
		case "ZP3111-5 4-in-1 Motion Sensor":
			this.addDevice(new DeviceTemplate(this, node).FourInOneMotoionSensor());
			break;
		case "MiLocks":
			this.addDevice(new DeviceTemplate(this, node).MiLock());
			break;
		case "Wireless Electronic Deadbolt Door Lock(Real Time Version)":
			this.addDevice(new DeviceTemplate(this, node).WirelessElectronicDeadboltDoorLock());
			break;
		case "ZW4102 Curtain Control Module(Relay Output)":
			this.addDevice(new DeviceTemplate(this, node).ZW4102CurtainControlModule());
			break;
		case "Colour Led":
			this.addDevice(new DeviceTemplate(this, node).ColourLed());
			break;
		default:
			debug('UltraBridge not verified product: [' + node.product + '] Ignored.');
	}
};

Gateway.prototype.addDevice = function (device) {
	try {
		this.Bridge.addBridgedAccessory(device.accessory);
		this.devices.push(device);
	} catch (e) {
		device.remove();
		debug('Fail to bridge ' + device.name);
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
	this.establishBridgedNodes(callback);
};

Gateway.prototype.establishBridgedNodes = function (callback) {
	this.getInfrastructure((err, data) => {
		try {
			if (err) throw err;
			if (!data.node_detail) throw "Can't get data from " + this.mac + ":" + this.setting.ip;

			this.version = data.node_detail.version;

			this.Bridge.getService(Service.AccessoryInformation)
				.setCharacteristic(Characteristic.FirmwareRevision, this.version);

			data.node_detail.node.forEach((node) => {
				this.bridgeDevice(node);
			});

			debug('Gateway ' + this.mac + ' setting success.');
			this._info.save(); // acc, pwd and ip is correct, so save the info.
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

Gateway.prototype.destroy = function () { // destroy Bridge and devices.
	try {
		this.Bridge.destroy(); // stop publishing
		this.Bridge.removeAllBridgedAccessories(); // remove accessory

		for (var i in this.devices) {
			this.devices[i].remove();
		}
		this.devices = [];

		destroy_debug('Gateway ' + this.mac + ' is destroyed.');
	} catch (e) {
		destroy_debug(e);
	}
};

Gateway.prototype.stopPublish = function () {
	debug(this.mac + 'stop publish');
	try {
		this.Bridge.destroy();
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

Gateway.prototype.removeDevice = function (nodeId) {

	for (var index in this.devices) {
		var device = this.devices[index];

	    if (device.node.id === nodeId) {
			this.devices.splice(index, 1);
			device.remove();
			this.Bridge.removeBridgedAccessory(device.accessory);
			break;
	    }
	}
};

Gateway.prototype.removeAllDevices = function () {
	for (var index in this.devices) {
		var device = this.devices[index];
		device.remove();
		this.Bridge.removeBridgedAccessory(device.accessory);
	}
};

Gateway.prototype.getNodeValues = function (nodeId, callback) {
	let values;
	let error;
	let proc = child_process.exec('curl --digest ' + '-u ' + this.setting.acc + ':' +
		this.setting.pwd + ' ' + this.setting.ip + ':5000/' +
		'node_detail.cgi -d "fun=load&id=' + nodeId + '"', {timeout: 3 * 1000},
	(err, stdout) => {
		try {
			if (err) throw err;
			let node_detail = parser(stdout, {object: true}).node_detail;

			if (!node_detail) throw "missing node_detail.";
			if (node_detail && !node_detail.node){
				this.removeDevice(nodeId);
				throw "missing node.";
			}
			values = node_detail.node.value;
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
			callback(e);
		}
	});
}

Gateway.prototype.setValue = function (nodeId, value, state, callback) {
    let proc = child_process.exec('curl --digest ' + '-u ' + this.setting.acc + ':' +
		this.setting.pwd + ' ' + this.setting.ip + ':5000/' + 'valuepost.html -d "' +
    	nodeId + '-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' +
		value.type + '-' + value.instance + '-' + value.index + '=' +
		state + '"', {timeout: 3 * 1000});

	proc.on('close', (code, signal) => {
		try {
			if (code || signal) {
				throw Error("Can't control  " + this.name);
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
	GatewayManager.scan(); // rescan gateway on network;
}

Gateway.prototype.setWatchDog = function () {
	this.reachableUpdater = setInterval(() => {
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
	}, 30 * 1000);

};

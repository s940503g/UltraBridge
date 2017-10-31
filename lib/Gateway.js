'use strict';
const Operater = require('./Operater.js');
const debug = require('debug')('Gateway');
const tracking_debug = require('debug')('Tracking');
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

module.exports = Gateway;

function Gateway(mac) {
	this.mac = mac;
	this._info = GatewayInfo.load(mac);
	this.setting = {};
	this.name = this._info.model + " " + this.mac;
	this._info.published = false;
	this.updaters = [];
	this.emitter = new events.EventEmitter();

	if (this._info) {
		this.setting.ip = this._info.ip;
	} else {
		debug("Can't find Gateway on storage.");
		throw new Error("Can't find Gateway on storage.");
	}

	this.setBridgeAccessory();
	this.prepareForBridgingAccessories();
}

Gateway.prototype.setBridgeAccessory = function () {
	// use GatewayManager variable to get model infomation.
	this.model = GatewayManager.publishedGateway[this.mac].model;

	// init a BridgeAccessory;
	this.BridgeAccessory = this.BridgeAccessory || new Bridge(this.name, uuid.generate(this.mac));
	this.BridgeAccessory.username = this.mac.toUpperCase().match(/.{1,2}/g).join(':');
	this.BridgeAccessory.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Name, 'UltraHub')
		.setCharacteristic(Characteristic.Manufacturer, "Avadesign Technology")
		.setCharacteristic(Characteristic.Model, this.model)
		.setCharacteristic(Characteristic.SerialNumber, this.mac)

	this.BridgeAccessory.on('identify', (paired, callback) => {
		debug("Gateway "+ this.name +' identified.');
		callback();
	});
};

Gateway.prototype.getInfrastructure = function (callback) {
	debug('Getting Infrastructure on Gateway ' + this.mac);
	let cmd = 'curl --digest -u ' + this.setting.acc + ":"+ this.setting.pwd +' '+ this.setting.ip + ':5000/node_detail.cgi -d "fun=load"';
	child_process.exec(cmd, (err, stdout) => {
		if (stdout === "") err = new Error('Gateway ' + this.mac + " " + ' has no response. This may casuse by wrong acc or pwd.');
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
	// determine which zwave product transforms to which HAP template.
	this.emitter.on('bridge_node', (node) => {
		debug('Gateway ' + this.mac + ' bridging ' + node.product + ":" + node.name);
		switch (node.product) {
			case "RGB color LED Dimmer":
				this.bridgeLightDimmer(node);
				break;
			case 'ZL7435 In-Wall Switch, 2 Relays':
				this.bridgeLightSwitch(node);
				break;
			case "Wall Switch x3":
				this.bridgeLightSwitch(node);
				break;

			case "MiLocks":
				this.bridgeDoorLock(node);
				break;
			case "Wireless Electronic Deadbolt Door Lock(Real Time Version)":
				this.bridgeDoorLock(node);
				break;


			case 'ZW4102 Curtain Control Module(Relay Output)':
				this.bridgeCurtain(node);
				break;

			case 'ZD2201-5 4-in-1 Multi Sensor':
				this.bridgeSensor(node);
				break;
			case 'Door Sensor':
				this.bridgeDoorSensor(node);
				break;

			default:
				debug('UtraBridge not verified product: [' + node.product + '] Ignored.');
		}
	});

	this.emitter.on('bridge_scene', (scene) => {
		this.bridgeScene(scene);
	});

	this.emitter.on('new_accessory', (accessory) => {
		debug('add new accessory ' + accessory.displayName + ' to ' + this.mac);
		this.BridgeAccessory.addBridgedAccessory(accessory);
	});
};

Gateway.prototype.registerAdminUser = function (acc, pwd) {
	this._info.acc = acc;
	this._info.pwd = pwd;
	this._info.save();

	this.setting.acc = acc;
	this.setting.pwd = pwd;

	GatewayManager.publishedGateway[this.mac].acc = acc;
	GatewayManager.publishedGateway[this.mac].pwd = pwd;
};

Gateway.prototype.BridgeGateway = function (acc, pwd) {
	this.registerAdminUser(acc, pwd);

	this.getInfrastructure((err, data) => {
		try {
			if (err) throw err;
			if (!data || data === {}) throw "Can't get data from " + this.setting.ip + " " + this.mac;

			this.version = data.node_detail.version;


			if (!this.BridgeAccessory) throw new Error(this.mac + " BridgeAccessory not exists.");

			this.BridgeAccessory.getService(Service.AccessoryInformation)
				.setCharacteristic(Characteristic.FirmwareRevision, this.version);

			data.node_detail.node.forEach((node) => {
				this.emitter.emit('bridge_node', node);
			});

			this.getScenes((err, data) => {
				debug('Getting scene on ' + this.mac + '.');
				if (!err && data.sceneid instanceof Array) {
					data.scenes.sceneid.forEach((scene) => {
						this.emitter.emit('bridge_scene', scene);
					});
				}
			});
		} catch (e) {
			debug(e);
		}
	});
};

Gateway.prototype.destroy = function () {
	try {
		if (!this.published) throw  "Gateway" + this.mac + " not publised yet.";

		this.BridgeAccessory.destroy(); // stop publishing
		this.BridgeAccessory.removeAllBridgedAccessories(); // remove accessory
		this.updaters.forEach((val) => { // stop auto update
			clearInterval(val);
		});

		this.published = false;

		debug('Gateway ' + this.mac + ' is destroyed.');
	} catch (e) {
		debug(e);
	}
};

Gateway.prototype.publish = function (port, pincode) {
	if (port && pincode) {
		this.port = port;
		this.pincode = pincode;
	}

	this.BridgeAccessory.publish({
		port: this.port,
		pincode: this.pincode,
		username: this.BridgeAccessory.username,
		category: Accessory.Categories.BRIDGE
	});
	this.published = true;
	debug('Gateway ' + this.mac + ' published. ' + 'ip: ' + this.setting.ip);
};

Gateway.prototype.reset = function () {
	debug(this.mac + ' receieve ip reset request.');

	let old_setting = {
		acc: this.setting.acc,
		pwd: this.setting.pwd,
		ip: this.setting.ip
	};

	GatewayManager.emit(); // rescan gateway on network;

	setTimeout(() => {
		this._info = GatewayInfo.load(this.mac);
		let new_setting = {
			acc: GatewayManager.publishedGateway[this.mac].acc,
			pwd: GatewayManager.publishedGateway[this.mac].pwd,
			ip: GatewayManager.publishedGateway[this.mac].ip
		}

		if (old_setting !== new_setting) {
			debug('Gateway ' + this.mac + ' reseting ip ' + this.setting.ip + ' -> ' + new_setting.ip);
			debug('Gateway ' + this.mac + ' reseting acc ' + this.setting.acc + ' -> ' + new_setting.acc);
			debug('Gateway ' + this.mac + ' reseting pwd ' + this.setting.pwd + ' -> ' + new_setting.pwd);

			this.setting = new_setting;
		}
	}, 10);
}

/*
 *
 *

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
//			callback(null, service.getCharacteristic(Characteristic.On).value);
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

Gateway.prototype.bridgeSensor = function (node) {
	let name = node.name === "" ? node.product : node.name;
	let accessory = new Accessory(name, uuid.generate(node.product + '-' + node.id + this.mac));

	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', (paired, callback) => {
		debug(name + " identified!!");
		callback();
	});

	accessory.category = Accessory.Categories.TEMPERATURE_SENSOR;

	let operater = new Operater(this, accessory);

	node.value.forEach((value) => {
		switch (value.label) {
			case 'Temperature':
				operater.TemperatureSensor(node).CurrentTemperature(value);
				break;
			case 'Luminance':
				operater.LightSensor(node).CurrentAmbientLightLevel(value);
				break;
			case 'Relative Humidity':
				operater.HumiditySensor(node).CurrentRelativeHumidity(value);
				break;
			case 'Battery Level':
				operater.Battery(node).BatteryLevel(value);
				break;
			case 'Mode':
				operater.TemperatureSensor(node).StatusActive(value);
				break;
		}
	});
	this.emitter.emit('new_accessory', accessory);

}

Gateway.prototype.bridgeDoorSensor = function (node) {
	let name = node.name === "" ? node.product : node.name;
	let accessory = new Accessory(name, uuid.generate(node.product + '-' + node.id + this.mac));

	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', (paired, callback) => {
		debug(name + " identified!!");
		callback();
	});

	accessory.category = Accessory.Categories.CONTACT_SENSOR;

	let operater = new Operater(this, accessory);

	node.value.forEach((value) => {
		switch (value.label) {
			case 'Access Control':
				operater.ContactSensor(node).ContactSensorState(value, function(result) {
					result = result.$t;
					return result.match(/closed/) !== null ? Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
				});
				break;
			case 'Battery Level':
				operater.Battery(node).BatteryLevel(value);
				break;
			case 'Mode':
				operater.ContactSensor(node).StatusActive(value, function (result) {
					result = result.current;
					return result === 'Arm';
				});
				break;
		}
	});
	this.emitter.emit('new_accessory', accessory);

}

Gateway.prototype.bridgeCurtain = function (node) {
	let name = node.name === "" ? node.product : node.name;
	let accessory = new Accessory(name + " ", uuid.generate(node.product + '-' + node.id + this.mac));

	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', (paired, callback) => {
		debug(name + " identified!!");
		callback();
	});

	accessory.category = Accessory.Categories.WINDOW_COVERING;

	let operater = new Operater(this, accessory);

	node.value.forEach((value) => {
		switch (value.label) {
			case 'Level':
			operater.WindowCovering(node).CurrentPosition(value);
			operater.WindowCovering(node).TargetPosition(value);
		}
	});
	this.emitter.emit('new_accessory', accessory);
}
Gateway.prototype.bridgeLightDimmer = function (node) {
	let name = node.name === "" ? node.product : node.name;
	let accessory = new Accessory(name + " ", uuid.generate(node.product + '-' + node.id + this.mac));

	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', (paired, callback) => {
		debug(name + " identified!!");
		callback();
	});

	accessory.category = Accessory.Categories.LIGHTBULB;
	let operater = new Operater(this, accessory);
	node.value.forEach((value) => {
		switch (value.label) {
			case "Level":
				operater.Lightbulb(node)
					.Brightness(value);
				break;

			case "RGB Color":
				operater.Lightbulb(node)
					.Hue(value);
				operater.Lightbulb(node)
					.Saturation(value);
				operater.Lightbulb(node)
					.ColorTemperature(value);
				break;

		}
	})

	this.emitter.emit('new_accessory', accessory);
}

Gateway.prototype.bridgeLightSwitch = function (node) {
	let name = node.name === "" ? node.product : node.name;
	let accessory = new Accessory(name + " ", uuid.generate(node.id + this.mac));
	let gateway = this;
	debug('Make light switch');
	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', function(paired, callback) {
		debug(name + " identified!!");
		callback();
	});

	accessory.category = Accessory.Categories.LIGHTBULB;

	let operater = new Operater(this, accessory);

	node.value.forEach((value) => {
		switch (value.label) {
			case 'Switch':
				operater.Lightbulb(node).On(value);
				break;
		}
	});

	this.emitter.emit('new_accessory', accessory);
}

Gateway.prototype.bridgeDoorLock = function (node) {
	let name = node.name === "" ? node.product : node.name;
	let accessory = new Accessory(name + " ", uuid.generate(node.product + '-' + node.id + this.mac));

	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', (paired, callback) => {
		debug(name + " identified!!");
		callback();
	});

	accessory.category = Accessory.Categories.DOOR_LOCK;

	let operater = new Operater(this, accessory);

	node.value.forEach((value) => {
		switch (value.label) {
			case 'Mode':
				operater.LockMechanism(node).LockCurrentState(value);
				operater.LockMechanism(node).LockTargetState(value);
				break;
			case 'Battery Level':
				operater.Battery(node).BatteryLevel(value);
				break;
		}
	});

	this.emitter.emit('new_accessory', accessory);
}
*/

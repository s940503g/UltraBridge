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
const ipFinder = require("./GatewayFinder.js");
const GatewayInfo  = require("./GatewayInfo.js");

module.exports = Gateway;

function Gateway(mac) {
	this.mac = mac;
	this._info = GatewayInfo.load(mac);
	this.setting = {};
	this.name = this._info.model + ":" + this.mac;
	this.emitter = new events.EventEmitter();
	this._info.published = false;

	if (this._info) {
		this.setting.ip = this._info.ip;
	} else {
		debug("Can't find Gateway on storage.");
		throw new Error("Can't find Gateway on storage.");
	}

	// init a BridgeAccessory;
	this.BridgeAccessory = new Bridge(this.name, uuid.generate(this.mac));
	this.BridgeAccessory.username = this.mac.toUpperCase().match(/.{1,2}/g).join(':');
	this.BridgeAccessory.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Name, 'UltraBridge')
		.setCharacteristic(Characteristic.Manufacturer, "Avadesign Technology")
		.setCharacteristic(Characteristic.Model, this.model)
		.setCharacteristic(Characteristic.SerialNumber, this.mac)

	this.BridgeAccessory.on('identify', (paired, callback) => {
		debug("Gateway "+ this.name +' identified.');
		callback();
	});

	this.emitter.on('bridge_node', (node) => {
		debug('Bridge ' + node.product);
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

			default:
				debug('UtraBridge not verified product: [' + node.product + '] Ignored.');
		}
	});

	this.emitter.on('bridge_scene', (scene) => {
		this.bridgeScene(scene);
	});

	this.emitter.on('new_accessory', (accessory) => {
		debug('add new accessory to bridge');
		this.BridgeAccessory.addBridgedAccessory(accessory);
	});

}
Gateway.prototype.getInfrastructure = function (callback) {
	debug('Getting Infrastructure on Gateway' + this.mac);
	let cmd = 'curl --digest -u ' + this.setting.acc + ":"+ this.setting.pwd +' '+ this.setting.ip + ':5000/node_detail.cgi -d "fun=load"';
	child_process.exec(cmd, function (err, stdout) {
		if (stdout === "") err = new Error('Gateway has no response. This may casuse by wrong acc or password.');
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

Gateway.prototype.registerAdminUser = function (acc, pwd) {
	this.setting.acc = acc;
	this.setting.pwd = pwd;
	this._info.acc = acc;
	this._info.pwd = pwd;
	this._info.save();
};

Gateway.prototype.BridgeGateway = function (acc, pwd) {
	this.registerAdminUser(acc, pwd);

	if (!this.setting.acc && !this.setting.pwd) {
		throw new Error('Admin user not registered.');
	}

	// this.trackingStructureChange();

	let errors = [];
	this.getInfrastructure((err, data) => {
		try {
			if (err) throw err;
			this.nodeCount = data.node_detail.node.length;

			this.model = data.node_detail.model;
			this.version = data.node_detail.version;

			if (!this.BridgeAccessory) throw new Error("BridgeAccessory not exists.");

			this.BridgeAccessory.getService(Service.AccessoryInformation)
				.setCharacteristic(Characteristic.Name, 'UltraBridge')
				.setCharacteristic(Characteristic.Manufacturer, "Avadesign Technology")
				.setCharacteristic(Characteristic.Model, this.model)
				.setCharacteristic(Characteristic.SerialNumber, this.mac)
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
			errors.push(e);
		}
	});
};

Gateway.prototype.publish = function (port, pincode) {
	if (port && pincode) {
		this.port = port;
		this.pincode = pincode;
	}

	//if (this._advertiser) this.BridgeAccessory._advertiser.stopAdvertising();
	this.BridgeAccessory.publish({
		port: this.port,
		pincode: this.pincode,
		username: this.BridgeAccessory.username,
		category: Accessory.Categories.BRIDGE
	});
	this._info.published = true;
	this._info.save();
	debug('Gateway ' + this.mac + ' published. ' + 'ip: ' + this.setting.ip);
};

Gateway.prototype.resetIp = function () {
	ipFinder.emit(); // rescan gateway on network;
	this._info = GatewayInfo.load(this.mac);
	// console.log('mem: '+ipFinder.publishedGateway[this.mac].ip);
	// console.log('disk: '+this._info.ip);
	if (this.setting.ip !== this._info.ip) {
		setTimeout(()=>{

			debug('Gateway ' + this.mac + ' reseting ip ' + this.setting.ip + '=>' + this._info.ip);
			this.setting.ip = this._info.ip;

		}, 200);
	}
	// this.BridgeAccessory.destroy();
	// setTimeout(() => {
	// 	this.BridgeGateway(this.setting.acc, this.setting.pwd);
	// 	this.publish(ipFinder.port++, ipFinder.pincode);
	// }, 1000);
}

Gateway.prototype.destroy = function () {
	let err;
	if (this.BridgeAccessory) {
		debug('Terminating ' + this.mac + ' bridge service.');
		this.BridgeAccessory.destroy();
		this.emitter.removeAllListeners();
		clearInterval(this.tracking);
	}else{
		throw Error('Bridge not exists.');
	}
}
/*
 *
 * */

Gateway.prototype.bridgeScene = function (sceneid) {
	let name = sceneid.label + sceneid.id || 'Scene ' + sceneid.id;
	let accessory = new Accessory(name, uuid.generate(sceneid.id + name));

	accessory.on('identify', function(paired, callback) {
		debug(name + " identified!!");
		callback();
	});

	let service = accessory.addService(Service.Switch, name);
	service
		.getCharacteristic(Characteristic.On)
		.on('get', function (callback) {
			callback(null, false);
//			callback(null, service.getCharacteristic(Characteristic.On).value);
		})
		.on('set', function (on, callback){
			let cmd = 'curl --digest -u ' + gateway.setting.acc + ":"+ gateway.setting.pwd +' '+ gateway.setting.ip + ':5000/scenepost.html -d "fun=execute&id='+ sceneid.id +'"';
			child_process.exec(cmd, function (err) {
				service.updateCharacteristic(Characteristic.On, true);
				callback(err);
			});
		});

	this.emitter.emit('new_accessory', accessory);
}




Gateway.prototype.bridgeSensor = function (node) {
	let name = node.name === "" ? node.product : node.name;
	let accessory = new Accessory(name, uuid.generate(node.product + '-' + node.id));

	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', function(paired, callback) {
		debug(name + " identified!!");
		callback();
	});

	accessory.category = Accessory.Categories.TEMPERATURE_SENSOR;

	let operater = new Operater(this, accessory);

	node.value.forEach(function (value) {
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

Gateway.prototype.bridgeCurtain = function (node) {
	let name = node.name === "" ? node.product : node.name;
	let accessory = new Accessory(name, uuid.generate(node.product + '-' + node.id));

	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', function(paired, callback) {
		debug(name + " identified!!");
		callback();
	});

	accessory.category = Accessory.Categories.WINDOW_COVERING;

	let operater = new Operater(this, accessory);

	node.value.forEach(function (value) {
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
	let accessory = new Accessory(name, uuid.generate(node.product + '-' + node.id));

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
	node.value.forEach(function (value) {
		switch (value.label) {
			case "Level":
				operater.Lightbulb(node)
					.Brightness(value);
				break;
			/*
			case "Bright":
				operater.Lightbulb(node)
					.On(value);
				break;
			*/
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
	let accessory = new Accessory(name, uuid.generate(node.product + '-' + node.id));
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
				/*operater.Lightbulb(node).On(value, function (result, callback) {
					callback(null, result==='True');
				});*/
				operater.Lightbulb(node).On(value);
				break;
		}
	});

	this.emitter.emit('new_accessory', accessory);
}

Gateway.prototype.bridgeDoorLock = function (node) {
	let name = node.name === "" ? node.product : node.name;
	let accessory = new Accessory(name, uuid.generate(node.product + '-' + node.id));

	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', function(paired, callback) {
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
	// accessory.on('error', (err) => {
	// 	debug(err);
	// 	this.resetIp();
	// });
	this.emitter.emit('new_accessory', accessory);
}

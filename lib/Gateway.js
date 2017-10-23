'use strict';
const GatewayFinder = require("./GatewayFinder.js");
const Operater = require('./Operater.js');
const debug = require('debug')('Gateway');
const events = require('events');
const hap_nodejs = require('hap-nodejs');
const Accessory = hap_nodejs.Accessory;
const Service = hap_nodejs.Service;
const Characteristic = hap_nodejs.Characteristic;
const uuid = hap_nodejs.uuid;
const child_process = require('child_process');
const parser = require('xml2json').toJson;
const Bridge = hap_nodejs.Bridge;

module.exports = Gateway;

function Gateway(acc, pwd, ip) {
	this.setting = {
		acc: acc,
		pwd: pwd,
		ip: ip
	};

	this.emitter = new events.EventEmitter();
	this.published = false;
	let gateway = this;

	this.emitter.on('find_node', function (node) {
		debug('Find ' + node.product);

		switch (node.product) {
			case "RGB color LED Dimmer":
				gateway.bridgeLightDimmer(node);
				break;
			case 'ZL7435 In-Wall Switch, 2 Relays':
				gateway.bridgeLightSwitch(node);
				break;
			case "Wall Switch x3":
				gateway.bridgeLightSwitch(node);
				break;

			case "MiLocks":
				gateway.bridgeDoorLock(node);
				break;
			case "Wireless Electronic Deadbolt Door Lock(Real Time Version)":
				gateway.bridgeDoorLock(node);
				break;


			case 'ZW4102 Curtain Control Module(Relay Output)':
				gateway.bridgeCurtain(node);
				break;

			case 'ZD2201-5 4-in-1 Multi Sensor':
				gateway.bridgeSensor(node);
				break;

			default:
				debug('UtraBridge not verified product: ['+node.product+'] Ignored.');
		}
	});

	this.emitter.on('find_scene', function (scene) {
		gateway.bridgeScene(scene);
	});

	var bridge;

	this.emitter.on('new_accessory', function (accessory) {
		debug('add new accessory to bridge');
		bridge.addBridgedAccessory(accessory);
		gateway.Bridge = bridge;
	});


	this.emitter.on('publish', (bridge) => {
		if (gateway.port && gateway.pincode) {
			bridge.publish({
				port: gateway.port,
				pincode: gateway.pincode,
				username: bridge.username,
				category: Accessory.Categories.BRIDGE
			});

			gateway.emitter.emit('pusblish-success');
		}
	});

	this.getInfrastructure((err, data) => {
		this.info = data;
		if (!err) {
			let model = data.node_detail.model;
			let mac = data.node_detail.gateway_id;
			this.mac = mac;
			let version = data.node_detail.version;
			let name = model + " " + mac;

			debug('Make Bridge. ');
			debug('Mac address: ' + mac);
			debug('Mode: ' + model);
			debug('version: ' + version);

			bridge = new Bridge(name, uuid.generate(mac));
			bridge.username = mac.toUpperCase().match(/.{1,2}/g).join(':');
			bridge.on('identify', function (paired, callback) {
				debug("Gateway "+ name +' identified.');
				callback();
			});

			bridge.getService(Service.AccessoryInformation)
				.setCharacteristic(Characteristic.Name, 'UltraBridge')
				.setCharacteristic(Characteristic.Manufacturer, "Avadesign Technology Corp.")
				.setCharacteristic(Characteristic.Model, model)
				.setCharacteristic(Characteristic.SerialNumber, mac)
				.setCharacteristic(Characteristic.FirmwareRevision, version);

			data.node_detail.node.forEach(function (node) {
				gateway.emitter.emit('find_node', node);
			});

			gateway.getScenes(function (err, data) {
				if (!err && data.sceneid instanceof Array) {
					debug(data.sceneid);
					data.scenes.sceneid.forEach(function (scene) {
						gateway.emitter.emit('find_scene', scene);
					});
				}
			});

			gateway.emitter.emit('publish', bridge);
		}else{
			debug(err);
		}
	});

	this.trackingStructureChange();

}
Gateway.prototype.getInfrastructure = function (callback) {
	debug('Getting Infrastructure');
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


Gateway.prototype.publish = function (pincode, port, callback) {
	this.pincode = pincode;
	this.port = port;

	this.emitter.once('pusblish-success', () => {
		let err = null;
		this.published = true;
		callback(err);
	});
}

Gateway.prototype.trackingStructureChange = function () {
	this.tracking = setInterval(() => {
		this.getInfrastructure((err, data) => {
			if (err || data == {}) this.resetIp(mac);
			// Discover new node
			if (data.node_detail.node.length != this.info.node_detail.node.length) this.reloadNodes(data);
		});
		debug(this.mac + ' tracking node change.');
	}, 1000 * 30 * 1);
}

Gateway.prototype.resetIp = function (mac) {
	// Success -> new IP
	// Fail -> destroy
	GatewayFinder.emit();
	GatewayFinder.on(mac, (err, ip) => {
		if (err) {
			this.destroy();
		}else{
			this.setting.ip = ip;
		}
	});
}

Gateway.prototype.reloadNodes = function (data) {
	data.node_detail.node.forEach(function (node) {
		gateway.emitter.emit('find_node', node);
	});

	gateway.getScenes(function (err, data) {
		if (!err && data.sceneid instanceof Array) {
			debug(data.sceneid);
			data.scenes.sceneid.forEach(function (scene) {
				gateway.emitter.emit('find_scene', scene);
			});
		}
	});

	gateway.emitter.emit('publish', this.Bridge);
}

Gateway.prototype.destroy = function (callback) {
	let err;
	if (this.Bridge) {
		debug('Terminating bridge service.');
		this.Bridge.destroy();
		this.emitter.removeAllListeners();
		clearInterval(this.tracking);
		this.published = false;
	}else{
		throw Error('Bridge not exists.');
	}
	callback(err);
}
/*
 *
 * */

Gateway.prototype.bridgeScene = function (sceneid) {
	let name = sceneid.label + sceneid.id || 'Scene ' + sceneid.id;
	let accessory = new Accessory(name, uuid.generate(sceneid.id + name));
	let gateway = this;

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
	let name = node.name === "" ? "未命名裝置" : node.name;
	let accessory = new Accessory(name, uuid.generate(node.product + node.id));
	let gateway = this;

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
	let name = node.name === "" ? "未命名裝置" : node.name;
	let accessory = new Accessory(name, uuid.generate(node.product + node.id));
	let gateway = this;

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
	let name = node.name === "" ? "未命名裝置" : node.name;
	let accessory = new Accessory(name, uuid.generate(node.product + node.id));

	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', function(paired, callback) {
		debug(name + " identified!!");
		callback();
	});
	let gateway = this;
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
	let name = node.name === "" ? "未命名裝置" : node.name;
	let accessory = new Accessory(name, uuid.generate(node.product + node.id));
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
	let name = node.name === "" ? "未命名裝置" : node.name;
	let accessory = new Accessory(name, uuid.generate(node.product + node.id));

	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', function(paired, callback) {
		debug(name + " identified!!");
		callback();
	});

	accessory.category = Accessory.Categories.DOOR_LOCK;

	let gateway = this;
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

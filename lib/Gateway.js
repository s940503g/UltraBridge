'use strict';
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

	let gateway = this;

	this.emitter.on('find_node', function (node) {
		switch (node.product) {

			case "RGB color LED Dimmer":
				gateway.bridgeLightDimmer(node);
/*
			case "ZL7435 In-Wall Switch, 2 Relays":
				gateway.bridgeLightSwitch_v2(node);
				break;
			case "Wall Switch x3":
				gateway.bridgeLightSwitch_v2(node);
				break;

			case "MiLocks":
				gateway.bridgeDoorLock_v2(node);
				break;
			case "Wireless Electronic Deadbolt Door Lock(Real Time Version)":
				gateway.bridgeDoorLock_v2(node);
				break;


			case 'ZW4102 Curtain Control Module(Relay Output)':
				gateway.bridgeCurtain(node);
				break;

*/
			default:
				debug('UtraBridge not verified product: ['+node.product+'] Ignored.');
		}
	});

	var bridge;
	this.emitter.on('new_accessory', function (accessory) {
		debug('add new accessory to bridge');
		bridge.addBridgedAccessory(accessory);
		gateway.Bridge = bridge;
	});


	this.emitter.once('configure-finish', function (bridge) {
		if (gateway.port && gateway.pincode) {
			bridge.publish({
				port: gateway.port,
				pincode: gateway.pincode,
				username: bridge.username,
				category: Accessory.Categories.BRIDGE
			});
		}	
	});

	this.getInfrastructure(function (err, data) {
		let model = data.node_detail.model;
		let mac = data.node_detail.gateway_id;
		let version = data.node_detail.version;	
		let name = model + " " + mac;
		
		debug('Make Bridge. ');
		debug('Mac address: ' + mac);
		debug('Mode: ' + model);
		debug('version: ' + version);
		bridge = new Bridge(name, uuid.generate(mac));
		bridge.username = mac.toUpperCase().match(/.{1,2}/g).join(':');
		bridge.on('identify', function (paired, callback) {
			console.log("Gateway "+ name +' identified.');
			callback();
		});

		bridge
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Name, 'UltraBridge')
			.setCharacteristic(Characteristic.Manufacturer, "Avadesign Technology Corp.")
			.setCharacteristic(Characteristic.Model, model)
			.setCharacteristic(Characteristic.SerialNumber, mac)
			.setCharacteristic(Characteristic.FirmwareRevision, version);
		bridge.addService(Service.Relay);

		
		data.node_detail.node.forEach(function (node) {
			gateway.emitter.emit('find_node', node);
		});

		gateway.emitter.emit('configure-finish', bridge);
	});
}
Gateway.prototype.getInfrastructure = function (callback) {
	debug('Getting Infrastructure');
	let cmd = 'curl --digest -u ' + this.setting.acc + ":"+ this.setting.pwd +' '+ this.setting.ip + ':5000/node_detail.cgi -d "fun=load"';
	child_process.exec(cmd, function (err, stdout) {
		let json = parser(stdout, {
			object:true
		});	
		callback(err, json);
	});
}

Gateway.prototype.publish = function (pincode, port) {
	this.pincode = pincode;
	this.port = port;
}


/*
 *
 * */
Gateway.prototype.bridgeCurtain = function (node) {
	let name = node.name === "" ? "未命名裝置" : node.name;
	let accessory = new Accessory(name, uuid.generate(node.product + node.id));
	let gateway = this;
	
	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)		
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', function(paired, callback) {
		console.log(name + " identified!!");
		callback();
	});
	
	accessory.category = Accessory.Categories.WINDOW_COVERING;
	
	let operater = new Operater(this, accessory);
	
	node.value.forEach(function (value) {
		switch (value.label) {
			case 'Level':

		}
	});
}
Gateway.prototype.bridgeLightDimmer = function (node) {	
	let name = node.name === "" ? "未命名裝置" : node.name;
	let accessory = new Accessory(name, uuid.generate(node.product + node.id));

	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)		
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', function(paired, callback) {
		console.log(name + " identified!!");
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
			case "Bright":
				operater.Lightbulb(node)
					.On(value);
				break;
			case "RGB Color":
				operater.Lightbulb(node)
					.Hue(value);
				operater.Lightbulb(node)
					.Saturation(value);
				operater.Lightbulb(node)
					.ColorTemperature(value);

		}
	})

	this.emitter.emit('new_accessory', accessory);
}

Gateway.prototype.bridgeLigthSwitch = function (node) {
	let name = node.name === "" ? "未命名裝置" : node.name;
	let accessory = new Accessory(name, uuid.generate(node.product + node.id));
	let gateway = this;
	
	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)		
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', function(paired, callback) {
		console.log(name + " identified!!");
		callback();
	});
	
	accessory.category = Accessory.Categories.SWITCH;
	
	let operater = new Operater(this, accessory);
	
	node.value.forEach(function (value) {
		switch (value.label) {
			case 'Switch': 
				operater.Lightbulb(node).On(value);
				break;
	});
}

Gateway.prototype.bridgeDoorLock = function (node) {
	let name = node.name === "" ? "未命名裝置" : node.name;
	let accessory = new Accessory(name, uuid.generate(node.product + node.id));
	let gateway = this;
	
	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)		
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', function(paired, callback) {
		console.log(name + " identified!!");
		callback();
	});
	
	accessory.category = Accessory.Categories.DOOR_LOCK;
	
	let operater = new Operater(this, accessory);
	
	node.value.forEach(function (value) {
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

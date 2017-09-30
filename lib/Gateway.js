'use strict';
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


			default:
				debug('UtraBridge not verified product: ['+node.product+'] Ignored.');
		}
	});

	var bridge = null;
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

Gateway.prototype.getSwitchBinaryState = function (nodeId, index, instance, callback) {
	let cmd = 'curl --digest '+ '-u '+ this.setting.acc + ":" + this.setting.pwd +' -d "fun=load&id=' + nodeId + '" ' + this.setting.ip + ":5000/node_detail.cgi";
	child_process.exec(cmd, function (err, stdout) {
		var result = parser(stdout, {object: true}).node_detail.node.value.filter(function(value) {
			return value.index===index.toString() && value.instance === instance.toString() && value.class !== "BASIC";
		})[0].$t;
		callback(err, result === "True" ? true : false);
	});
}
Gateway.prototype.setSwitchBinaryState = function (nodeId, index, instance, value, callback) {	
	var stat = value ? "True" : "False";
	let cmd = 'curl --digest '+ '-u '+ this.setting.acc + ":" + this.setting.pwd +' -d "'+nodeId+'-SWITCH+BINARY-user-bool-'+instance+'-'+index+'=' + stat + '" ' + this.setting.ip + ":5000/valuepost.html"; 
	child_process.exec(cmd, function(err, stdout, stderr) {	
		if (err) console.log(err);		
		callback(err);
	});
}
Gateway.prototype.bridgeDoorLock_v2 = function (node) {	
	let name = node.name;
	let accessory = new Accessory(name, uuid.generate(node.product));

	var en_nodeId = parseInt(node.id).toString(16).toUpperCase();
	
	while (en_nodeId.length < 2) {
			en_nodeId = '0'+en_nodeId;
	}

	accessory.username = '12:34:56:78:' + en_nodeId;
	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)		
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', function(paired, callback) {
		console.log(name+" identified!!");
		callback();
	});

	let configure = new events.EventEmitter();
	let gateway = this;

	accessory.category = Accessory.Categories.DOOR_LOCK;

	configure.on('add-service-Mode', function (value) {
		let service_name = name + " " + value.instance;
		debug("Make "+service_name);
		
		let doorLock = accessory.addService(Service.LockMechanism, service_name, value.instance);

		doorLock
			.getCharacteristic(Characteristic.LockCurrentState)
			.on('get', function (callback) {
				gateway.getDoorLockModeValue(node.id, value.index, value.instance, function (err, state) {
					switch (state) {
						case "Secured":
							doorLock.updateCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED);
							callback(err, Characteristic.LockCurrentState.SECURED);
							break;
						case "Unsecured":
							doorLock.updateCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.UNSECURED);
							callback(err, Characteristic.LockCurrentState.UNSECURED);
							break;
					}				
				});
			});

		doorLock
			.getCharacteristic(Characteristic.LockTargetState)
			.on('set', function (state, callback) {
				gateway.setDoorLockModeValue(node.id, value.index, value.instance, state, function (err) {
					let setter = new events.EventEmitter();
					var times = 0;
					let limit = 20;
					let completion = function (success) {
						if (success || times > limit) {
							callback(err);
						}else{
							times++;
							setter.once('completion', completion);
							setTimeout(()=>{
								setter.emit('completion', state === doorLock.getCharacteristic(Characteristic.LockCurrentState).value);
							}, 1000);
						}
					}

					setter.once('completion', completion);
					setter.emit('completion', state === doorLock.getCharacteristic(Characteristic.LockCurrentState).value);

				});
			});

		// update state
		setInterval(function(){
			gateway.getDoorLockModeValue(node.id, value.index, value.instance, function (err, value) {
				let state = (value === "Secured") ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
				/* Target & Current should update at the same time */
				doorLock.updateCharacteristic(Characteristic.LockCurrentState, state);
				doorLock.updateCharacteristic(Characteristic.LockTargetState, state);
				
			});
		}, 3000);
	});
	
	configure.on('add-service-Battery', function (value) {
		let service_name = name + " Battery " + value.instance;
		debug('Make '+service_name);
		let battery = accessory.addService(Service.BatteryService, service_name + " Battery", value.instance);
		battery
			.getCharacteristic(Characteristic.BatteryLevel)
			.on('get', function (callback) {
				gateway.getBatteryLevel(node.id, value.index, value.instance, function (err, state) {
					debug('Battery: ' + state + '%');
					callback(err, state);
				});
			});

		let low_battery = 10;

		battery
			.getCharacteristic(Characteristic.StatusLowBattery)
			.on('get', function (callback) {
				gateway.getBatteryLevel(node.id, value.index, value.instance, function (err, state) {
					callback(err, state < low_battery ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
				});
			});
		
		battery
			.getCharacteristic(Characteristic.ChargingState)
			.on('get', function (callback) {
				callback(null, Characteristic.ChargingState.NOT_CHARGING);
			});
	});

	node.value.forEach(function (value) {
		switch (value.label) {
			case "Mode":
				configure.emit('add-service-Mode', value);
				break;
			case "Battery Level":
				configure.emit('add-service-Battery', value);
				break;
		}	
	});

	this.emitter.emit('new_accessory', accessory);
	
}

Gateway.prototype.getBatteryLevel = function (nodeId, index, instance, callback) {
	let cmd = 'curl --digest '+ '-u '+ this.setting.acc + ":" + this.setting.pwd +' -d "fun=load&id=' + nodeId + '" ' + this.setting.ip + ":5000/node_detail.cgi";
	child_process.exec(cmd, function (err, stdout) {
		let result = parser(stdout, {object: true}).node_detail.node.value.filter(function(value) {
			return value.index===index.toString() && value.instance === instance.toString() && value.label=="Battery Level";
		})[0].$t;
		debug('get battery' + result);
		callback(err, parseInt(result, 10));
	});
}

Gateway.prototype.getDoorLockModeValue = function (nodeId, index, instance, callback) {
	let cmd = 'curl --digest '+ '-u '+ this.setting.acc + ":" + this.setting.pwd +' -d "fun=load&id=' + nodeId + '" ' + this.setting.ip + ":5000/node_detail.cgi";
	child_process.exec(cmd, function (err, stdout) {
		let result = parser(stdout, {object: true}).node_detail.node.value.filter(function(value) {
			return value.index===index.toString() && value.instance === instance.toString() && value.class === "DOOR LOCK";
		})[0].current;
		callback(err, result);
	});
}
Gateway.prototype.setDoorLockModeValue = function (nodeId, index, instance, value, callback) {
	var state = (value === Characteristic.LockCurrentState.SECURED) ? "Secured" : "Unsecured";
	let cmd = 'curl --digest '+ '-u '+ this.setting.acc + ":" + this.setting.pwd +' -d "'+nodeId+'-DOOR+LOCK-user-list-'+instance+'-'+index+'=' + state + '" ' + this.setting.ip + ":5000/valuepost.html"; 
	child_process.exec(cmd, function (err, stdout) {
		callback(err);
	});
}

Gateway.prototype.bridgeLightSwitch_v2 = function (node) {	
	let name = node.name;
	let accessory = new Accessory(name, uuid.generate(node.product));

	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)		
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', function(paired, callback) {
		console.log(name + " identified!!");
		callback();
	});
	let configure = new events.EventEmitter();
	let gateway = this;

	accessory.category = Accessory.Categories.SWITCH;

	configure.on('add-service', function (value) {
		let service_name = name + " " + value.instance;
		console.log("Make "+service_name);
		let lightSwitch = accessory.addService(Service.Lightbulb, service_name, value.instance);
		if (value.instance === "1") accessory.setPrimaryService(lightSwitch);
		lightSwitch.on('identify', function (paired, callback) {
			console.log(service_name+' identified.');
			callback();
		});

		lightSwitch
			.getCharacteristic(Characteristic.On)
			.on('get', function (callback) {
				console.log('getting light switch  state.');
				gateway.getSwitchBinaryState(node.id, value.index, value.instance, callback);
			});
		lightSwitch
			.getCharacteristic(Characteristic.On)
			.on('set', function (on, callback) {
				gateway.setSwitchBinaryState(node.id, value.index, value.instance, on, callback);
			});

		// update state	
		gateway.emitter.on('update', function (on) {
			gateway.getSwitchBinaryState(node.id, value.index, value.instance, function (err, onLock) {
				lightSwitch
					.updateCharacteristic(Characteristic.On, onLock);	
			});
		});
		
	});
	node.value.forEach(function (value) {
		switch (value.label) {
			case "Switch":
				configure.emit('add-service', value);
				break;
		}	
	})

	this.emitter.emit('new_accessory', accessory);
}

Gateway.prototype.bridgeCurtain = function (node) { 
	let name = node.name;
	let accessory = new Accessory(name, uuid.generate(node.product));
	
	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)		
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', function(paired, callback) {
		console.log(name+" identified.");
		callback();
	});
	let configure = new events.EventEmitter();
	let gateway = this;

	configure.on('add-service', function (value) {
		let service_name = name+" "+value.instance;
		console.log("Make "+service_name);
		
		let curtain = accessory.addService(Service.WindowCovering, service_name, value.instance);
		if (value.instance === "1") accessory.setPrimaryService(curtain);
		curtain.on('identify', function (paired, callback) {
			console.log(service_name+' identified.');
			callback(null, paired);
		});
		curtain
			.getCharacteristic(Characteristic.CurrentPosition)
			.on('get', function (callback) {
				gateway.getCurtainState(node.id, value.index, value.instance, function (err, state) {
					curtain.updateCharacteristic(Characteristic.TargetPosition, state);
					curtain.updateCharacteristic(Characteristic.PositionState, state);
					callback(null, state);
				});
			});

		curtain
			.getCharacteristic(Characteristic.TargetPosition)
			.on('set', function (state, callback) {
				gateway.setCurtainState(node.id, value.index, value.instance, state, function (err) {
					curtain.updateCharacteristic(Characteristic.CurrentPosition, state);
					curtain.updateCharacteristic(Characteristic.PositionState, state);	
					callback(err);
				});
			});

		setInterval(function () {
			gateway.getCurtainState(node.id, value.index, value.instance, function (err, state) {
				debug('Curtain level: ' + state);
				curtain.updateCharacteristic(Characteristic.TargetPosition, state);
				curtain.updateCharacteristic(Characteristic.PositionState, state);
				curtain.updateCharacteristic(Characteristic.CurrentPosition, state);
			});
		}, 3000);
	});

	node.value.forEach(function (value) {
		switch (value.label) {
			case "Level":
				configure.emit('add-service', value);
				break;
		}	
	});
	this.emitter.emit('new_accessory', accessory);
}
Gateway.prototype.setCurtainState = function (nodeId, index, instance, value, callback) {
	let state = (value > 49) ? "99":"0";
	let cmd = 'curl --digest '+ '-u '+ this.setting.acc + ":" + this.setting.pwd +' -d "'+nodeId+'-SWITCH+MULTILEVEL-user-byte-'+instance+'-'+ index +'=' + state + '" ' + this.setting.ip + ":5000/valuepost.html"; 
	child_process.exec(cmd, function (err, stdout) {
		callback(err);
	});
}
Gateway.prototype.getCurtainState = function (nodeId, index, instance, callback) {
	let cmd = 'curl --digest '+ '-u '+ this.setting.acc + ":" + this.setting.pwd +' -d "fun=load&id=' + nodeId + '" ' + this.setting.ip + ":5000/node_detail.cgi";
	child_process.exec(cmd, function (err, stdout) {
		var result = parser(stdout, {object: true}).node_detail.node.value.filter(function(value) {
			return value.index===index.toString() && value.instance === instance.toString() && value.label === "Level";
		})[0].$t;
		if (typeof result === 'string'){
			result = parseInt(result, 10);
		}else{
			err = "Wrong type of curtain state";
		}
		if (result == 99) result = 100;
		callback(err, result);
	});
}

Gateway.prototype.bridgeLightDimmer = function (node) {	
	let name = node.name;
	let accessory = new Accessory(name, uuid.generate(node.product));

	accessory
		.getService(Service.AccessoryInformation)
		.setCharacteristic(Characteristic.Manufacturer, node.manufacturer)		
		.setCharacteristic(Characteristic.Model, node.product);

	accessory.on('identify', function(paired, callback) {
		console.log(name + " identified!!");
		callback();
	});
	let configure = new events.EventEmitter();
	let gateway = this;

	accessory.category = Accessory.Categories.SWITCH;

	configure.on('add-service', function (value) {
		let service_name = name + " " + value.instance;
		console.log("Make "+service_name);
		let lightSwitch = accessory.addService(Service.Lightbulb, service_name, value.instance);
		if (value.instance === "1") accessory.setPrimaryService(lightSwitch);
		lightSwitch.on('identify', function (paired, callback) {
			console.log(service_name+' identified.');
			callback();
		});

		lightSwitch
			.getCharacteristic(Characteristic.On)
			.on('get', function (callback) {
				console.log('getting light switch  state.');
				gateway.getSwitchMultiLevelState(node.id, value.index, value.instance, callback);
			});
		lightSwitch
			.getCharacteristic(Characteristic.On)
			.on('set', function (on, callback) {
				gateway.setSwitchMultiLevelState(node.id, value.index, value.instance, on, callback);
			});

		// update state	
		
	});
	node.value.forEach(function (value) {
		switch (value.label) {
			case "Switch":
				configure.emit('add-service', value);
				break;
		}	
	})

	this.emitter.emit('new_accessory', accessory);
}




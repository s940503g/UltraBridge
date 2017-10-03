'use strict';
const ct = require('color-temperature');
const debug = require('debug')('Operater');
const hap_nodejs = require('hap-nodejs');
const Accessory = hap_nodejs.Accessory;
const Service = hap_nodejs.Service;
const Characteristic = hap_nodejs.Characteristic;
const uuid = hap_nodejs.uuid;
const child_process = require('child_process');
const parser = require('xml2json').toJson;

module.exports = Operater;

function Operater (gateway, accessory) {
	this.gateway = gateway;
	this.accessory = accessory;
	return this;
}


Operater.prototype.Switch = function (node) {
	let accessory = this.accessory;
	let nodeId = node.id;
	var cmd = 'curl --digest ' + '-u ' + this.gateway.setting.acc + ':' + this.gateway.setting.pwd + ' ' + this.gateway.setting.ip + ':5000/';
	let binarySwitch = accessory.getService(Service.Switch) || accessory.addService(Service.Switch);

	return {
		On: function (value) {
			binarySwitch.getCharacteristic(Characteristic.On)
				.on('get', function (callback) {
					child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
						let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;

						callback(err, result==='True');
				})
				.on('set', function (on, callback) {
					child_process.exec(cmd+'valuepost.html -d "'+ nodeId+'-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + brightness + '"', function (err, stdout) {
						callback(err);
				});

			AutoUpdate(binarySwitch, function () {
				child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
					let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
						return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
					})[0].$t;

					binarySwitch.updateCharacteristic(Characteristic.On, result === 'True');
				});
			});
		}	
	}
}
Operater.prototype.LockMechanism = function (node) {
	let accessory = this.accessory;
	let nodeId = node.id;
	var cmd = 'curl --digest ' + '-u ' + this.gateway.setting.acc + ':' + this.gateway.setting.pwd + ' ' + this.gateway.setting.ip + ':5000/';
	let lock  = accessory.getService(Service.LockMechanism) || accessory.addService(Service.LockMechanism);

	return {
		LockCurrentState: function (node) {
			lock.getCharacteristic(Characteristic.LockCurrentState)
				.on('get', function (callback) {
					child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout) => {
						let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].current;

						callback(err, result === 'Secured' ? Characteristic.SECURED : Characteristic.UNSECURED);
					});
				});

			AutoUpdate(lock, function () {
				child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
					let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
						return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
					})[0].current;

					lock.updateCharacteristic(Characteristic.LockCurrentState, result === 'Secured' ? Characteristic.SECURED : Characteristic.UNSECURED);
					lock.updateCharacteristic(Characteristic.LockTargetState, result === 'Secured' ? Characteristic.SECURED : Characteristic.UNSECURED);
				});
			});	
		},
		LockTargetState: function (node) {
			lock.getCharacteristic(Characteristic.LockTargetState)
				.on('set', function (onLock, callback) {
					onLock = onLock ? 'True' : 'False';
					child_process.exec(cmd+'valuepost.html -d "'+ nodeId+'-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + onLock ? 'True' : 'False' + '"', function (err, stdout) {
						// Should I force state checking?
						let check = setInterval(() => {
							if (lock.getCharacteristic(Characteristic.LockCurrentState).value === onLock) {
								clearInterval(check);
								callback(err);
							}
						}, 1500);

						setTimeout(() => {
							clearInterval(check);
							let currentState = lock.getCharacteristic(Characteristic.LockCurrentState).value;
							lock.updateCharacteristic(Characteristic.LockTargetState, currentState);
							callback(err);
						}, 10000);
					});
				});
		}
	}
}
Operater.prototype.Battery = function (node) {
	let accessory = this.accessory;
	let nodeId = node.id;
	var cmd = 'curl --digest ' + '-u ' + this.gateway.setting.acc + ':' + this.gateway.setting.pwd + ' ' + this.gateway.setting.ip + ':5000/';
	let battery = accessory.getService(Service.BatteryService) || accessory.addService(Service.BatteryService);

	return {
		BatteryLevel: function (value) {
			battery.getCharacteristic(Characteristic.BatteryLevel)
				.on('get', function (callback) {
					child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
						let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;

						callback(err, parseInt(result, 10));
					});
				})
				.on('set', function (brightness, callback) {
					child_process.exec(cmd+'valuepost.html -d "'+ nodeId+'-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + brightness + '"', function (err, stdout) {
						callback(err);
					});
				});

			AutoUpdate(battery, function () {
				child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
					let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
						return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
					})[0].$t;
					let level = parseInt(result, 10);
					battery.updateCharacteristic(Characteristic.BatteryLevel, level);
				});	
			});
		},
		ChargingState: function (value) {
			// No zwave instance
		},
		StatusLowBattery: function (value) {
			let lowPower = 10
			battery.getCharacteristic(Characteristic.StatusLowBattery)
				.on('get', function (callback) {
					callback(null, battery.getCharacteristic(Characteristic.BatteryLevel).value <= LowPower);
				});

			AutoUpdate(battery, function () {
				battery.updateCharacteristic(Characteristic.StatusLowBattery, battery.getCharacteristic(Characteristic.BatteryLevel).value <= LowPower);
			});
		}
	}
}
Operater.prototype.Door = function (node) {
	let accessory = this.accessory;
	let nodeId = node.id;
	var cmd = 'curl --digest ' + '-u ' + this.gateway.setting.acc + ':' + this.gateway.setting.pwd + ' ' + this.gateway.setting.ip + ':5000/';
	let door = accessory.getService(Service.Door) || accessory.addService(Service.Door);

	return {
		CurrentPosition: function (value) {
		},
		PositionState: function (value) {
		},
		TargetPosition: function (value) {
		},
		HoldPosition: function (value) {
		},
		ObstructionDetected: function (value) {
		}
	}
}
Operater.prototype.ContactSensor = function (node) {
	let accessory = this.accessory;
	let nodeId = node.id;
	var cmd = 'curl --digest ' + '-u ' + this.gateway.setting.acc + ':' + this.gateway.setting.pwd + ' ' + this.gateway.setting.ip + ':5000/';
	let contactSensor = accessory.getService(Service.ContactSensor) || accessory.addService(Service.ContactSensor);

	return {
		ContactSensorState: function (value) {
		},
		StatusActive: function (value) {

		},
		StatusTampered: function (value) {
		},
		StatusLowBattery: function (value) {
		}
	}
}
Operater.prototype.LeakSensor = function (node) {
	let accessory = this.accessory;
	let nodeId = node.id;
	var cmd = 'curl --digest ' + '-u ' + this.gateway.setting.acc + ':' + this.gateway.setting.pwd + ' ' + this.gateway.setting.ip + ':5000/';
	let leakSensor = accessory.getService(Service.LeakSensor) || accessory.addService(Service.LeakSensor);

	return {
		LeakDetected: function (value) {
		},
		StatusActive: function (value) {
		},
		StatusTampered: function (value) {
		},
		StatusLowBattery: function (value) {
		}
	}

}
Operater.prototype.HumiditySensor = function (node) {
	let accessory = this.accessory;
	let nodeId = node.id;
	var cmd = 'curl --digest ' + '-u ' + this.gateway.setting.acc + ':' + this.gateway.setting.pwd + ' ' + this.gateway.setting.ip + ':5000/';
	let sensor = accessory.getService(Service.HumiditySensor) || accessory.addService(Service.HumiditySensor);

	return {
		CurrentRelativeHumidity: function (value) {
			sensor.getCharacteristic(Characteristic.CurrentRelativeHumidity)
				.on('get', function (callback) {
					child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
						let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;

						callback(err, parseFloat(result));
					});
				});

			AutoUpdate(sensor, function () {
				child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
					let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
						return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
					})[0].$t;
					
					let hum = parseFloat(result);
					sensor.updateCharacteristic(Characteristic.CurrentRelativeHumidity, hum);
				});
			});
		},
		StatusActive: function (value) {
		},
		StatusFault: function (value) {
		},
		StatusTampered: function (value) {
		},
		StatusLowBattery: function (value) {
			let lowPower = 10;
			sensor.getCharacteristic(Characteristic.StatusLowBattery)
				.on('get', function (callback) {
					child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
						let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;

						callback(err, result <= LowPower);
					});
				});

			AutoUpdate(sensor, function () {
				child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
					let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
						return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
					})[0].$t;
					
					sensor.updateCharacteristic(Characteristic.StatusLowBattery, result <= lowPower);
				});
		}
	}
}
Operater.prototype.TemperatureSensor = function (node) {
	let accessory = this.accessory;
	let nodeId = node.id;
	var cmd = 'curl --digest ' + '-u ' + this.gateway.setting.acc + ':' + this.gateway.setting.pwd + ' ' + this.gateway.setting.ip + ':5000/';
	let sensor = accessory.getService(Service.TemperatureSensor) || accessory.addService(Service.TemperatureSensor);

	return {
		CurrentTemperature: function (value) {
			sensor.getCharacteristic(Characteristic.CurrentTemperature)
				.on('get', function (callback) {
					child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
						let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;

						callback(err, parseFloat(result));
					});
				});

			AutoUpdate(sensor, function () {
				child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
					let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
						return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
					})[0].$t;
					
					let temp = parseFloat(result);
					sensor.updateCharacteristic(Characteristic.CurrentTemperature, temp);
				});
			});
		},
		StatusActive: function (value) {
			sensor.getCharacteristic(Characteristic.CurrentTemperature)
				.on('get', function (callback) {
					child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
						let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;

						callback(err, result === 'True');
					});
				});

			AutoUpdate(sensor, function () {
				child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
					let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
						return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
					})[0].$t;
					
					sensor.updateCharacteristic(Characteristic.CurrentTemperature, result === 'True');
				});
			});

		},
		StatusFault: function (value) {
		},
		StatusLowBattery: function (value) {
			let lowPower = 10;
			sensor.getCharacteristic(Characteristic.StatusLowBattery)
				.on('get', function (callback) {
					child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
						let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;

						callback(err, result <= LowPower);
					});
				});

			AutoUpdate(sensor, function () {
				child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
					let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
						return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
					})[0].$t;
					
					sensor.updateCharacteristic(Characteristic.StatusLowBattery, result <= lowPower);
				});
		},
		StatusTampered: function (value) {
		}
	}
}

Operater.prototype.Lightbulb = function (node) {
	let accessory = this.accessory;
	let nodeId = node.id;
	var cmd = 'curl --digest ' + '-u ' + this.gateway.setting.acc + ':' + this.gateway.setting.pwd + ' ' + this.gateway.setting.ip + ':5000/';
	let lightbulb = accessory.getService(Service.Lightbulb) || accessory.addService(Service.Lightbulb);	
	
	return {
		Brightness: function (value) {
			lightbulb.addCharacteristic(Characteristic.Brightness)
				.on('get', function (callback) {
					child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
						let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;

						callback(err, parseInt(result, 10));
					});
				})
				.on('set', function (brightness, callback) {
					child_process.exec(cmd+'valuepost.html -d "'+ nodeId+'-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + brightness + '"', function (err, stdout) {
						callback(err);
					});
				});

			AutoUpdate(lightbulb, function () {
				child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
					let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
						return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
					})[0].$t;
					let brightness = parseInt(result, 10);
					lightbulb.updateCharacteristic(Characteristic.Brightness, brightness);
				});	
			});
		},
		On: function (value) {
			lightbulb.getCharacteristic(Characteristic.On)
				.on('get', function (callback) {
					child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
						let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;

						callback(err, result === 'True');
					});
				})
				.on('set', function (on, callback) {
					let state = on ? "True":"False";
					child_process.exec(cmd+'valuepost.html -d "'+ nodeId+'-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + state + '"', function (err, stdout) {
						callback(err);
					});
				});

			AutoUpdate(lightbulb, function () {
				child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
					let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
						return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
					})[0].$t;
					lightbulb.updateCharacteristic(Characteristic.On, result === 'True');
				});	
			});
		},
		Hue: function (value) {
			lightbulb.addCharacteristic(Characteristic.Hue)
				.on('get', function (callback) {
					child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
						let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;

						let [r, g, b] = result.split(/\s/).map(function (v) {
							return parseInt(v, 16);
						});
						let hsv = rgb2hsv(r, g, b);
						lightbulb.updateCharacteristic(Characteristic.Saturation, hsv.saturation);
						lightbulb.updateCharacteristic(Characteristic.Brightness, hsv.value);

						callback(err, hsv.hue);
					});
				})
				.on('set', function (hue, callback) {
					let h = hue;
					// Get Saturation
					let s = lightbulb.getCharacteristic(Characteristic.Saturation).value;
					// Value (Brightness)
					let v = lightbulb.getCharacteristic(Characteristic.Brightness).value;
					var {r, g, b} = HSVtoRGB(h, s, v);
					let RGB = r.toString(16) + ' ' + g.toString(16) + ' ' + b.toString(16);
					child_process.exec(cmd+'valuepost.html -d "'+ nodeId+'-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + RGB + '"', function (err, stdout) {
						callback(err);
					});
				});

		},
		Saturation: function (value) {
			lightbulb.addCharacteristic(Characteristic.Saturation)
				.on('get', function (callback) {
					child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
						let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;

						let [r, g, b] = result.split(/\s/).map(function (v) {
							return parseInt(v, 16);
						});
						let hsv = rgb2hsv(r, g, b);
						lightbulb.updateCharacteristic(Characteristic.Hue, hsv.hue);
						lightbulb.updateCharacteristic(Characteristic.Brightness, hsv.value);

						callback(err, hsv.saturation);
					});
				})
				.on('set', function (saturation, callback) {
					let s = saturation; 
					// Hue
					let h = lightbulb.getCharacteristic(Characteristic.Hue).value;	
					// Value (Brightness)
					let v = lightbulb.getCharacteristic(Characteristic.Brightness).value;

					let {r, g, b} = HSVtoRGB(h, s, v);	

					let RGB = r.toString(16) + ' ' + g.toString(16) + ' ' + b.toString(16);
					child_process.exec(cmd+'valuepost.html -d "'+ nodeId+'-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + RGB + '"', function (err, stdout) {
						callback(err);
					});
				});			
		},
		ColorTemperature: function (value) {
			lightbulb.addCharacteristic(Characteristic.ColorTemperature)
				.on('get', function (callback) {
					child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout)=>{
						let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;

						let [r, g, b] = result.split(/\s/).map(function (v) {
							return parseInt(v, 16);
						});
						let cTemp = ct.rgb2colorTemperature({red: r, green: g, blue: b});

						callback(err, cTemp);
					});
				})
				.on('set', function (cTemp, callback) {

					let rgb = ct.colorTemperature2rgb(cTemp);
					let RGB = rgb.red.toString(16) + ' ' + rgb.green.toString(16) + ' ' + rgb.blue.toString(16);
					child_process.exec(cmd+'valuepost.html -d "'+ nodeId+'-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + RGB + '"', function (err, stdout) {
						callback(err);
					});
				});
		}
	};
}

Operater.prototype.WindowCovering = function (node) {
	let accessory = this.accessory;
	let nodeId = node.id;
	var cmd = 'curl --digest ' + '-u ' + this.gateway.setting.acc + ':' + this.gateway.setting.pwd + ' ' + this.gateway.setting.ip + ':5000/';
	let windowCovering = accessory.getService(Service.WindowCovering) || accessory.addService(Service.WindowCovering);

	return {
		CurrentPosition: function (value) {
			windowCovering.getCharacteristic(Characteristic.CurrentPosition)
				.on('get', function (callback) {
					child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout) => {
						let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;
						
						let level = parseInt(result, 10) + 1;
						callback(err, level);
					});
				});

			AutoUpdate(windowCovering, function () {
				child_process.exec(cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', (err, stdout) => {
					let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value) => {
						return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
					})[0].$t;

					let level = parseInt(result, 10) + 1;

					windowCovering.updateCharacteristic(Characteristic.CurrentPosition, level);
					windowCovering.updateCharacteristic(Characteristic.TargetPosition, level);
				});
			});
		},
		TargetPosition: function (value) {
			windowCovering.getCharacteristic(Characteristic.TargetPosition)
				.on('set', function (level, callback) {
					child_process.exec(cmd+'valuepost.html -d "'+ nodeId+'-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + level + '"', function (err, stdout) {
						// Should I force state checking?
						let check = setInterval(() => {
							if (lock.getCharacteristic(Characteristic.CurrentPosition).value === level) {
								clearInterval(check);
								callback(err);
							}
						}, 1500);

						setTimeout(() => {
							clearInterval(check);
							let current = lock.getCharacteristic(Characteristic.CurrentPosition).value;
							lock.updateCharacteristic(Characteristic.TargetPosition, current);
							callback(err);
						}, 10000);
					});
				});
		},
		PositionState: function (value) {
		},
		HoldPosition: function (value) {
		},
		TargetHorizontalTiltAngle: function (value) {
		},
		TargetVerticalTiltAngle: function (value) {
		},
		CurrentHorizontalTiltAngle: function (value) {
		},
		CurrentVerticalTiltAngle: function (value) {
		},
		ObstructionDetected: function (value) {
		}
	}
}



/*
 *
 * */


function rgb2hsv () {
	var rr, gg, bb,
			r = arguments[0] / 255,
			g = arguments[1] / 255,
			b = arguments[2] / 255,
			h, s,
			v = Math.max(r, g, b),
			diff = v - Math.min(r, g, b),
			diffc = function(c){
				return (v - c) / 6 / diff + 1 / 2;
			};

			if (diff == 0) {
				h = s = 0;
			} else {
				s = diff / v;
				rr = diffc(r);
				gg = diffc(g);
				bb = diffc(b);

				if (r === v) {
					h = bb - gg;
				}else if (g === v) {
					h = (1 / 3) + rr - bb;
				}else if (b === v) {
					h = (2 / 3) + gg - rr;
				}
				if (h < 0) {
					h += 1;
				}else if (h > 1) {
					h -= 1;
				}
			}
			return {
						hue: Math.round(h * 360),
						saturation: Math.round(s * 100),
						value: Math.round(v * 100)
					};
}

function HSVtoRGB(h, s, v) {
		h = h/360;
		s = s/100;
		v = v/100;
	    var r, g, b, i, f, p, q, t;
	    if (arguments.length === 1) {
	        s = h.s, v = h.v, h = h.h;
		}
	    i = Math.floor(h * 6);
	    f = h * 6 - i;
	    p = v * (1 - s);
	    q = v * (1 - f * s);
	    t = v * (1 - (1 - f) * s);
	    switch (i % 6) {
	 		case 0: r = v, g = t, b = p; break;
	        case 1: r = q, g = v, b = p; break;
	        case 2: r = p, g = v, b = t; break;
	        case 3: r = p, g = q, b = v; break;
	        case 4: r = t, g = p, b = v; break;
	        case 5: r = v, g = p, b = q; break;
	    }
	    return {
	        r: Math.round(r * 255),
	        g: Math.round(g * 255),
	        b: Math.round(b * 255)
	   };
}

function AutoUpdater(service, callback) {
	if (!(typeof(updateFunction) === 'function')) 
		console.log('Updater should be a function.');
		return null;
	let updater = function () {
		callback();
		service.once('update', updater);
		setTimeout(function () {
			emitter.emit('update');
		}, 3000)
	}
	service.once('update', updater);
	service.emit('update');
	
}

'use strict';
const ct = require('color-temperature');
const debug = require('debug')('Operater');
const auto_update_debug = require('debug')('AutoUpdate');
const hap_nodejs = require('hap-nodejs');
const Accessory = hap_nodejs.Accessory;
const Service = hap_nodejs.Service;
const Characteristic = hap_nodejs.Characteristic;
const uuid = hap_nodejs.uuid;
const child_process = require('child_process');
const parser = require('xml2json').toJson;
const events = require('events');
const GatewayInfo = require('./GatewayInfo.js')
const EXEC_OPTIONS = {timeout: 7 * 1000, killSignal: "SIGKILL"};

module.exports = Operater;

function Operater (gateway, accessory) {
	this.gateway = gateway;
	this.cmd = 'curl --digest ' + '-u ' + this.gateway.setting.acc + ':' + this.gateway.setting.pwd + ' ' + this.gateway.setting.ip + ':5000/';
	this.emitter = accessory;
	this.emitter.on('error', (err) => {
		debug(err);
		gateway.reset();
		let info_ip = GatewayInfo.load(gateway.mac).ip;
		this.cmd = 'curl --digest ' + '-u ' + this.gateway.setting.acc + ':' + this.gateway.setting.pwd + ' ' + this.gateway.setting.ip + ':5000/';
	});

	return this;
}
Operater.prototype.LightSensor = function (node) {
	let nodeId = node.id;
	let name = accessory.displayName;

	return {
		CurrentAmbientLightLevel: (value) => {
			let service = accessory.getService(name, value.instance) || accessory.addService(Service.LightSensor, name, value.instance);

			service.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
				.on('get', (callback) => {
					child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
						let result;
						try {
							if (err) throw err;
							result = parser(stdout, {object: true}).node_detail.node.value.filter((_value) => {
								return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
							})[0].$t;
						} catch (e) {
							this.emitter.emit('error', e);
						} finally {
							callback(err, parseFloat(result)*1000);
						}
					});
				});

			let update = () => {
				child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
					let result;
					try {
						if (err) throw err;
						result = parser(stdout, {object: true}).node_detail.node.value.filter((_value) => {
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;
					} catch (e) {
						result = 0;
						this.emitter.emit('error', e);
					} finally {

						service.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, parseFloat(result)*1000);
						service.getCharacteristic(Characteristic.CurrentAmbientLightLevel).once('update', update);
						setTimeout(() => {
							service.getCharacteristic(Characteristic.CurrentAmbientLightLevel).emit('update');
						}, 3000);

						auto_update_debug('update light sensor: ' + result);
					}
				});
			}
			service.getCharacteristic(Characteristic.CurrentAmbientLightLevel).once('update', update);
			service.getCharacteristic(Characteristic.CurrentAmbientLightLevel).emit('update');
		},
		StatusActive: (value) => {
		},
		StatusFault: (value) => {
		},
		StatusTampered: (value) => {
		},
		StatusLowBattery: (value) => {
		}
	};
}

Operater.prototype.Switch = function (node) {
	let nodeId = node.id;
	let name = accessory.displayName;

	return {
		On: (value) => {
			let service = accessory.getService(name+value.instance, value.instance) || accessory.addService(Service.Switch, name+value.instance, value.instance);

			service.getCharacteristic(Characteristic.On)
				.on('get', (callback) => {
					child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id='+nodeId+'"', EXEC_OPTIONS, function (err, stdout) {
						let result;
						try {
							let result = parser(stdout, {object: true}).node_detail.node.value.filter(function(_value) {
								return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
							})[0].$t;
						} catch (e) {
							result = 'False';
							this.emitter.emit('error', e);
						} finally {
							callback(err, result==='True');
						}
					});
				})
				.on('set', (On, callback) => {
					let state = On ? 'True':'False';

					child_process.exec(this.cmd + 'valuepost.html -d "' + nodeId + '-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + state + '"',
					EXEC_OPTIONS, (err, stdout) => {
						try {
							if (err) throw err;
						} catch (e) {
							this.emitter.emit('error', e);
						} finally {
							callback(err);
						}
					});
				});

			let update = (next) => {
				child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout)=>{
					let result;
					try {
						result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;
					} catch (e) {
						result = 'False'
						this.emitter.emit('error', e);
					} finally {
						service.updateCharacteristic(Characteristic.On, result === 'True');
						service.getCharacteristic(Characteristic.On).once('update', update);
						setTimeout(()=>{
							service.getCharacteristic(Characteristic.On).emit('update');
						}, 3000);
					}
				});
				auto_update_debug('Switch state update');
			}
			service.getCharacteristic(Characteristic.On).once('update', update);
			service.getCharacteristic(Characteristic.On).emit('update');
		}
	}
}
Operater.prototype.LockMechanism = function (node) {
	let nodeId = node.id;
	let name = accessory.displayName;

	return {
		LockCurrentState: (value) => {
			let service = accessory.getService(name, value.instance) || accessory.addService(Service.LockMechanism, name, value.instance);

			service.getCharacteristic(Characteristic.LockCurrentState)
				.on('get', (callback) => {
					child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
						let result;
						try {
							 result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
								return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
							})[0].current;
						} catch (e) {
							result = 'Secured';
							this.emitter.emit('error', e);
						} finally {
							callback(err, result === 'Secured' ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED);
						}
					});
				});

			let update = () => {
				child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout)=>{
					var result;
					try {
						result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].current;
					} catch (e) {
						result = "Secured";
						self.emitter.emit('error', e);
					} finally {
						service.updateCharacteristic(Characteristic.LockCurrentState, result === 'Secured' ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED);
						service.updateCharacteristic(Characteristic.LockTargetState, result === 'Secured' ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED);

						service.getCharacteristic(Characteristic.LockCurrentState).once('update', update);
						setTimeout(()=>{
							service.getCharacteristic(Characteristic.LockCurrentState).emit('update');
						}, 3000);
						auto_update_debug('Update current lock state: ' + result);
					}
				});
			}

			service.getCharacteristic(Characteristic.LockCurrentState).once('update', update);
			service.getCharacteristic(Characteristic.LockCurrentState).emit('update');
		},
		LockTargetState: (value) => {
			let service = accessory.getService(name, value.instance) || accessory.addService(Service.LockMechanism, name, value.instance);
			service.getCharacteristic(Characteristic.LockTargetState)
				.on('set', (onLock, callback) => {
					let _onLock = onLock === Characteristic.LockTargetState.SECURED ? 'Secured' : 'Unsecured';
					child_process.exec(this.cmd + 'valuepost.html -d "' + nodeId+'-' + value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + _onLock + '"',
					EXEC_OPTIONS, (err, stdout) => {
						try {
							if (err) throw err;
						} catch (e) {
							this.emitter.emit('error', e);
						} finally {
							let timeout = setTimeout(() => {
								clearInterval(check);
								let currentState = service.getCharacteristic(Characteristic.LockCurrentState).value;
								service.updateCharacteristic(Characteristic.LockTargetState, currentState);
								callback(err);
							}, 10000);

							let check = setInterval(() => {
								debug('Lock wait for response');
								if (service.getCharacteristic(Characteristic.LockCurrentState).value === onLock) {
									clearInterval(check);
									clearTimeout(timeout);
									callback(err);
								}
							}, 1500);
						}
					});
				});
		}
	}
}
Operater.prototype.Battery = function (node) {
	let nodeId = node.id;
	let name = accessory.display;

	return {
		BatteryLevel: (value) => {
			let service = accessory.getService(name, value.instance) || accessory.addService(Service.BatteryService, name, value.instance);

			service.getCharacteristic(Characteristic.BatteryLevel)
				.on('get', (callback) => {
					child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout)=>{
						let result;
						try {
							if (err) throw err;
							result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
								return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
							})[0].$t;
							result = parseInt(result, 10);
						} catch (e) {
							result = 0;
							this.emitter.emit('error', e);
						} finally {
							callback(err, result);
						}
					});
				})

			let update = () => {
				child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
					var level;
					try {
						if (err) throw err;
						level = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;
						level = parseInt(level, 10);
					} catch (e) {
						level = 100;
						this.emitter.emit('error', e);
					} finally {
						service.updateCharacteristic(Characteristic.BatteryLevel, level);
						service.getCharacteristic(Characteristic.BatteryLevel).once('update', update);
						setTimeout(() => {
							service.getCharacteristic(Characteristic.BatteryLevel).emit('update');
						}, 60 * 1000);

						auto_update_debug('BatteryLevel update: ' + level);
					}
				});
			}
			service.getCharacteristic(Characteristic.BatteryLevel).once('update', update);
			service.getCharacteristic(Characteristic.BatteryLevel).emit('update');
		},
		ChargingState: (value) => {
			let service = accessory.getService(name, value.instance) || accessory.addService(Service.BatteryService, name, value.instance);
			// No zwave instance
		},
		StatusLowBattery: (value) => {
			let service = accessory.getService(name, value.instance) || accessory.addService(Service.BatteryService, name, value.instance);
			let lowPower = 10
			service.getCharacteristic(Characteristic.StatusLowBattery)
				.on('get', (callback) => {
					callback(null, service.getCharacteristic(Characteristic.BatteryLevel).value <= LowPower);
				});

			let update = () => {
				service.updateCharacteristic(Characteristic.StatusLowBattery, service.getCharacteristic(Characteristic.BatteryLevel).value <= LowPower);

				service.getCharacteristic(Characteristic.StatusLowBattery).once('update', update);
				setTimeout(() => {
					service.getCharacteristic(Characteristic.StatusLowBattery).emit('update');
				}, 30 * 60 * 1000); // check if low battery every 30 min.
				auto_update_debug('LowBatteryLevel state update: ' + level <= lowPower);
			};
			service.getCharacteristic(Characteristic.StatusLowBattery).once('update', update);
			service.getCharacteristic(Characteristic.StatusLowBattery).emit('update');
		}
	}
}
Operater.prototype.Door = function (node) {
	let nodeId = node.id;
	let door = accessory.getService(Service.Door) || accessory.addService(Service.Door);

	return {
		CurrentPosition: (value) => {
		},
		PositionState: (value) => {
		},
		TargetPosition: (value) => {
		},
		HoldPosition: (value) => {
		},
		ObstructionDetected: (value) => {
		}
	}
}
Operater.prototype.ContactSensor = function (node) {
	let nodeId = node.id;
	let contactSensor = accessory.getService(Service.ContactSensor) || accessory.addService(Service.ContactSensor);

	return {
		ContactSensorState: (value) => {
		},
		StatusActive: (value) => {

		},
		StatusTampered: (value) => {
		},
		StatusLowBattery: (value) => {
		}
	}
}
Operater.prototype.LeakSensor = function (node) {
	let nodeId = node.id;
	let leakSensor = accessory.getService(Service.LeakSensor) || accessory.addService(Service.LeakSensor);

	return {
		LeakDetected: (value) => {
		},
		StatusActive: (value) => {
		},
		StatusTampered: (value) => {
		},
		StatusLowBattery: (value) => {
		}
	}

}
Operater.prototype.HumiditySensor = function (node) {
	let nodeId = node.id;
	let name = accessory.displayName;

	return {
		CurrentRelativeHumidity: (value) => {
			let service = accessory.getService(name, value.instance) || accessory.addService(Service.HumiditySensor, name, value.instance);

			service.getCharacteristic(Characteristic.CurrentRelativeHumidity)
				.on('get', (callback) => {
					child_process.exec(this.cmd+'node_detail.cgi -d "fun=load&id='+nodeId+'"', EXEC_OPTIONS, (err, stdout) => {
						let result;
						try {
							if (err) throw err;
							result = parser(stdout, {object: true}).node_detail.node.value.filter((_value) => {
								return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
							})[0].$t;
							result = parseFloat(result);
						} catch (e) {
							result = 0;
							this.emitter.emit('error', e);
						} finally {
							callback(err, result);
						}
					});
				});

			let update = () => {
				child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
					let hum;
					try {
						if (err) throw err;
						let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value) => {
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;
						hum = parseFloat(result);
					} catch (e) {
						hum = 0;
						this.emitter.emit('error', e);
					} finally {
						service.updateCharacteristic(Characteristic.CurrentRelativeHumidity, hum);
						service.getCharacteristic(Characteristic.CurrentRelativeHumidity).once('update', update);
						setTimeout(() => {
							service.getCharacteristic(Characteristic.CurrentRelativeHumidity).emit('update');
						}, 3000);
						auto_update_debug('CurrentRelativeHumidity state update: ' + hum);
					}
				});
			}
			service.getCharacteristic(Characteristic.CurrentRelativeHumidity).once('update', update);
			service.getCharacteristic(Characteristic.CurrentRelativeHumidity).emit('update');
		},
		StatusActive: (value) => {
		},
		StatusFault: (value) => {
		},
		StatusTampered: (value) => {
		},
		StatusLowBattery: (value) => {
			let service = accessory.getService(name, value.instance) || accessory.addService(Service.HumiditySensor, name, value.instance);

			let lowPower = 10;
			service.getCharacteristic(Characteristic.StatusLowBattery)
				.on('get', (callback) => {
					child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
						let result;
						try {
							if (err) throw err;
							result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
								return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
							})[0].$t;
						} catch (e) {
							result = 0;
							this.emitter.emit('error', e);
						} finally {
							callback(err, result <= LowPower);
						}
					});
				});

			let update = () => {
				child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout)=>{
					let result;
					try {
						if (err) throw err;
						result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;
					} catch (e) {
						result = 0;
						this.emitter.emit('error', e);
					} finally {
						service.updateCharacteristic(Characteristic.StatusLowBattery, result <= lowPower);

						service.getCharacteristic(Characteristic.StatusLowBattery).once('update', update);
						setTimeout(() => {
							service.getCharacteristic(Characteristic.StatusLowBattery).emit('update');
						}, 30 * 60 * 1000);
						auto_update_debug('StatusLowBattery state update: ' + result <= lowPower);
					}
				});
			}
			service.getCharacteristic(Characteristic.StatusLowBattery).once('update', update);
			service.getCharacteristic(Characteristic.StatusLowBattery).emit('update');
		}
	}
}
Operater.prototype.TemperatureSensor = function (node) {
	let nodeId = node.id;
	let name = accessory.displayName;

	return {
		CurrentTemperature: (value) => {
			let service = accessory.getService(name, value.instance) || accessory.addService(Service.TemperatureSensor, name, value.instance);

			service.getCharacteristic(Characteristic.CurrentTemperature)
				.on('get', (callback) => {
					child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
						let result;
						try {
							if (err) throw err;
							result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
								return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
							})[0].$t;
						} catch (e) {
							result = 0;
							this.emitter.emit('error', e);
						} finally {
							callback(err, parseFloat(result));
						}
					});
				});

			let update = () => {
				child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
					let temp;
					try {
						if (err) throw err;
						let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;
						temp = parseFloat(result);
					} catch (e) {
						temp = 0;
						this.emitter.emit('error', e);
					} finally {
						service.updateCharacteristic(Characteristic.CurrentTemperature, temp);

						service.getCharacteristic(Characteristic.CurrentTemperature).once('update', update);
						setTimeout(()=>{
							service.getCharacteristic(Characteristic.CurrentTemperature).emit('update');
						}, 3000);
						auto_update_debug('CurrentTemperature state update: ' + temp);
					}
				});
			}
			service.getCharacteristic(Characteristic.CurrentTemperature).once('update', update);
			service.getCharacteristic(Characteristic.CurrentTemperature).emit('update');
		},
		StatusActive: (value) => {
			let service = accessory.getService(name, value.instance) || accessory.addService(Service.TemperatureSensor, name, value.instance);

			service.getCharacteristic(Characteristic.StatusActive)
				.on('get', (callback) => {
					child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
						let result;
						try {
							if (err) throw err;
							result = parser(stdout, {object: true}).node_detail.node.status;
						} catch (e) {
							this.emitter.emit('error', e);
						} finally {
							callback(err, result === 'Awake');
						}
					});
				});

			let update = () => {
				child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
					let result;
					try {
						if (err) throw err;
						result = parser(stdout, {object: true}).node_detail.node.status;
					} catch (e) {
						this.emitter.emit('error', e);
					} finally {
						service.updateCharacteristic(Characteristic.StatusActive, result === 'Awake');

						service.getCharacteristic(Characteristic.StatusActive).once('update', update);
						setTimeout(()=>{
							service.getCharacteristic(Characteristic.StatusActive).emit('update');
						}, 3000);
						auto_update_debug('StatusActive state update: ' + result);
					}
				});
			}
			service.getCharacteristic(Characteristic.StatusActive).once('update', update);
			service.getCharacteristic(Characteristic.StatusActive).emit('update');
		},
		StatusFault: (value) => {
		},
		StatusLowBattery: (value) => {
			let service = accessory.getService(name, value.instance) || accessory.addService(Service.TemperatureSensor, name, value.instance);

			let lowPower = 10;
			service.getCharacteristic(Characteristic.StatusLowBattery)
				.on('get', (callback) => {
					child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
						let result;
						try {
							if (err) throw err;
							result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
								return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
							})[0].$t;
						} catch (e) {
							this.emitter.emit('error', e);
						} finally {
							callback(err, result <= LowPower);
						}
					});
				});

			let update = () => {
				child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
					let result;
					try {
						if (err) throw err;
						result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;
					} catch (e) {
						result = 0;
						this.emitter.emit('error', e);
					} finally {
						service.updateCharacteristic(Characteristic.StatusLowBattery, result <= lowPower);

						servic.getCharacteristic(Characteristic.StatusLowBattery).once('update', update);
						setTimeout(()=>{
							service.getCharacteristic(Characteristic.StatusLowBattery).emit('update');
						}, 3000);
					}
				});
			}
			service.getCharacteristic(Characteristic.StatusLowBattery).once('update', update);
			service.getCharacteristic(Characteristic.StatusLowBattery).emit('update');
		},
		StatusTampered: (value) => {
		}
	}
}

Operater.prototype.Lightbulb = function (node) {
	let nodeId = node.id;
	let name = accessory.displayName;
	var brightnessLog = 0;
	return {
		Brightness: (value) => {
			let service = accessory.getService(name, value.instance) || accessory.addService(Service.Lightbulb, name, value.instance);

			service.addCharacteristic(Characteristic.Brightness)
				.on('get', (callback) => {
					child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
						let result;
						try {
							if (err) throw err;
							result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
								return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
							})[0].$t;
							result = parseInt(result, 10)
						} catch (e) {
							this.emitter.emit('error', e);
						} finally {
							callback(err, result);
						}
					});
				})
				.on('set', (brightness, callback) => {
					child_process.exec(this.cmd+'valuepost.html -d "'+ nodeId+'-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + brightness + '"', EXEC_OPTIONS, function (err, stdout) {
						try {
							if (err) throw err;
							brightnessLog = brightness;
						} catch (e) {
							brightnessLog = brightness;
							this.emitter.emit('error', e)
						} finally {
							callback(err);
						}
					});
				});

			let update = () => {
				child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
					let result;
					try {
						if (err) throw err;
						result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;
					} catch (e) {
						result = 0;
						this.emitter.emit('error', e);
					} finally {
						let brightness = parseInt(result, 10);
						service.updateCharacteristic(Characteristic.Brightness, brightness);

						service.getCharacteristic(Characteristic.Brightness).once('update', update);
						setTimeout(() => {
							service.getCharacteristic(Characteristic.Brightness).emit('update');
						}, 3000);

						service.setCharacteristic(Characteristic.Brightness, service.getCharacteristic(Characteristic.On).value ? brightnessLog : 0);
						service.updateCharacteristic(Characteristic.Brightness, service.getCharacteristic(Characteristic.On).value ? brightnessLog : 0);

						auto_update_debug('Brightness state update: ' + brightness);
					}

				});
			}
			service.getCharacteristic(Characteristic.Brightness).once('update', update);
			service.getCharacteristic(Characteristic.Brightness).emit('update');
		},
		On: (value) => {
			let service = accessory.getService(name+value.instance, value.instance) || accessory.addService(Service.Lightbulb, name+value.instance, value.instance);

			service.getCharacteristic(Characteristic.On)
				.on('get', (callback) => {
					child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
						let result;
						try {
							if (err) throw err;
							result = parser(stdout, {object: true}).node_detail.node.value.filter((_value) => {
								return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
							})[0].$t;
						} catch (e) {
							this.emitter.emit('error', e);
						} finally {
							callback(err, result==='True');
						}
					});
				})
				.on('set', (On, callback) => {
					let state = On ? 'True':'False';

					child_process.exec(this.cmd + 'valuepost.html -d "'+ nodeId + '-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + state + '"',
					EXEC_OPTIONS, (err, stdout) => {
						try {
							if (err) throw err;
						} catch (e) {
							this.emitter.emit('error', e);
						} finally {
							callback(err);
						}
					});
				});

			let update = (next) => {
				child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
					let result;
					try {
						if (err) throw err;
						result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;
					} catch (e) {
						this.emitter.emit('error', e);
					} finally {
						service.updateCharacteristic(Characteristic.On, result === 'True');

						service.getCharacteristic(Characteristic.On).once('update', update);
						setTimeout(() => {
							service.getCharacteristic(Characteristic.On).emit('update');
						}, 3000);
						auto_update_debug('Lightbulb state update: ' + result);
					}
				});
			}
			service.getCharacteristic(Characteristic.On).once('update', update);
			service.getCharacteristic(Characteristic.On).emit('update');
		},
		Hue: (value) => {
			let service = accessory.getService(name, value.instance) || accessory.addService(Service.Lightbulb, name, value.instance);

			service.addCharacteristic(Characteristic.Hue)
				.on('get', (callback) => {
					child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout)=>{
						let result;
						try {
							if (err) throw err;
							result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
								return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
							})[0].$t;
							let [r, g, b] = result.split(/\s/).map((v) => {
								return parseInt(v, 16);
							});
							let hsv = rgb2hsv(r, g, b);
							result = hsv.hue;
						} catch (e) {
							result = 0;
							this.emitter.emit('error', e);
						} finally {
							service.updateCharacteristic(Characteristic.Saturation, hsv.saturation);
							service.updateCharacteristic(Characteristic.Brightness, hsv.value);

							callback(err, result);
						}
					});
				})
				.on('set', (hue, callback) => {
					let h = hue;
					// Get Saturation
					let s = service.getCharacteristic(Characteristic.Saturation).value;
					// Value (Brightness)
					let v = service.getCharacteristic(Characteristic.Brightness).value;
					var {r, g, b} = HSVtoRGB(h, s, v);
					let RGB = r.toString(16) + ' ' + g.toString(16) + ' ' + b.toString(16);
					child_process.exec(this.cmd + 'valuepost.html -d "'+ nodeId + '-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + RGB + '"',
					EXEC_OPTIONS, (err, stdout) => {
						try {
							if (err) throw err;
						} catch (e) {
							this.emitter.emit('error', e);
						} finally {
							callback(err);
						}
					});
				});
		},
		Saturation: (value) => {
			let service = accessory.getService(name, value.instance) || accessory.addService(Service.Lightbulb, name, value.instance);

			service.addCharacteristic(Characteristic.Saturation)
				.on('get', (callback) => {
					child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout)=>{
						let result;
						try {
							result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
								return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
							})[0].$t;

							let [r, g, b] = result.split(/\s/).map((v) => {
								return parseInt(v, 16);
							});
							let hsv = rgb2hsv(r, g, b);
							result = hsv.saturation
						} catch (e) {
							result = 0;
							this.emitter.emit('error', e);
						} finally {
							service.updateCharacteristic(Characteristic.Hue, hsv.hue);
							service.updateCharacteristic(Characteristic.Brightness, hsv.value);

							callback(err, result);
						}
					});
				})
				.on('set', (saturation, callback) => {
					let s = saturation;
					// Hue
					let h = service.getCharacteristic(Characteristic.Hue).value;
					// Value (Brightness)
					let v = service.getCharacteristic(Characteristic.Brightness).value;

					let {r, g, b} = HSVtoRGB(h, s, v);

					let RGB = r.toString(16) + ' ' + g.toString(16) + ' ' + b.toString(16);
					child_process.exec(this.cmd + 'valuepost.html -d "'+ nodeId + '-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + RGB + '"',
					EXEC_OPTIONS, (err, stdout) => {
						try {
							if (err) throw err;
						} catch (e) {
							this.emitter.emit('error', e);
						} finally {
							callback(err);
						}
					});
				});
		},
		ColorTemperature: (value) => {
			let service = accessory.getService(name, value.instance) || accessory.addService(Service.Lightbulb, name, value.instance);

			service.addCharacteristic(Characteristic.ColorTemperature)
				.on('get', (callback) => {
					child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
						let result;
						try {
							let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
								return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
							})[0].$t;

							let [r, g, b] = result.split(/\s/).map((v) => {
								return parseInt(v, 16);
							});
							let cTemp = ct.rgb2colorTemperature({red: r, green: g, blue: b});
							result = cTemp;
						} catch (e) {
							result = 0;
							this.emitter.emit('error', e);
						} finally {
							callback(err, result);
						}
					});
				})
				.on('set', (cTemp, callback) => {

					let rgb = ct.colorTemperature2rgb(cTemp);
					let RGB = rgb.red.toString(16) + ' ' + rgb.green.toString(16) + ' ' + rgb.blue.toString(16);
					child_process.exec(this.cmd + 'valuepost.html -d "'+ nodeId + '-' + value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + RGB + '"', EXEC_OPTIONS, function (err, stdout) {
						try {
							if (err) throw err;
						} catch (e) {
							this.emitter.emit('error', e);
						} finally {
							callback(err);
						}
					});
				});
		}
	};
}

Operater.prototype.WindowCovering = function (node) {
	let nodeId = node.id;
	let name = accessory.displayName;

	return {
		CurrentPosition: (value) => {
			let service = accessory.getService(name, value.instance) || accessory.addService(Service.WindowCovering, name, value.instance);

			service.getCharacteristic(Characteristic.CurrentPosition)
				.on('get', (callback) => {
					child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
						let level;
						try {
							if (err) throw err;
							let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value)=>{
								return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
							})[0].$t;
							let level = parseInt(result, 10);
						} catch (e) {
							level = 0;
							this.emitter.emit('error', e);
						} finally {
							callback(err, level);
						}
					});
				});

			let update = () => {
				child_process.exec(this.cmd + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"', EXEC_OPTIONS, (err, stdout) => {
					let level;
					try {
						if (err) throw err;
						let result = parser(stdout, {object: true}).node_detail.node.value.filter((_value) => {
							return _value.index===value.index.toString() && _value.instance === value.instance.toString() && _value.label === value.label;
						})[0].$t;

						let level = parseInt(result, 10);
					} catch (e) {
						level = 0;
						this.emitter.emit('error', e);
					} finally {
						service.updateCharacteristic(Characteristic.CurrentPosition, level);
						service.updateCharacteristic(Characteristic.TargetPosition, level);

						service.getCharacteristic(Characteristic.CurrentPosition).once('update', update);
						setTimeout(()=>{
							service.getCharacteristic(Characteristic.CurrentPosition).emit('update');
						}, 3000);
						auto_update_debug('WindowCovering CurrentPosition state update: ' + level);
					}
				});
			}
			service.getCharacteristic(Characteristic.CurrentPosition).once('update', update);
			service.getCharacteristic(Characteristic.CurrentPosition).emit('update');
		},
		TargetPosition: (value) => {
			let service = accessory.getService(name, value.instance) || accessory.addService(Service.WindowCovering, name, value.instance);

			service.getCharacteristic(Characteristic.TargetPosition)
				.on('set', (level, callback) => {
					child_process.exec(this.cmd + 'valuepost.html -d "' + nodeId + '-' + value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + level + '"',
					EXEC_OPTIONS, (err, stdout) => {
						try {
							if (err) throw err;
						} catch (e) {
							this.emitter.emit('error', e);
						} finally {
							let timeout = setTimeout(() => {
								clearInterval(check);
								let current = service.getCharacteristic(Characteristic.CurrentPosition).value;
								service.updateCharacteristic(Characteristic.TargetPosition, current);
								callback(err);
							}, 10000);
							let check = setInterval(() => {
								if (service.getCharacteristic(Characteristic.CurrentPosition).value === level) {
									clearInterval(check);
									clearTimeout(timeout);
									callback(err);
								}
							}, 1500);
						}
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

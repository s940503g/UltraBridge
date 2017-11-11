'use strict';
const dgram = require('dgram');
const debug = require('debug')('GatewayManager');
const http = require('http');
const GatewayInfo = require('./GatewayInfo.js');
const Gateway = require('./Gateway.js');
const events = require('events');

module.exports = new GatewayManager();

function GatewayManager() {
	this.port = 5050;
	this.pincode = '222-21-266';
	this.publishedGateway = {};
	this.emitter = new events.EventEmitter();

	this.server = dgram.createSocket('udp4');
	this.socket = dgram.createSocket('udp4');

	this.socket.bind(() => { this.socket.setBroadcast(true); });
	this.server.bind(10000);
};

GatewayManager.prototype.scan = function () {
	debug('Send broadcast.');
	var message = new Buffer('WHOIS_AVA_ZWAVE#');
	this.socket.send(message, 0, message.length, 10000, '255.255.255.255', (err, bytes) => {
        if (err) debug(err);
	});
}

GatewayManager.prototype.on = function () {
	const Gateway = require('./Gateway.js');

    this.server.on('message', (msg, rinfo) => {

    	msg = msg.toString('utf8').split(/&/);

    	var title = msg[0];

    	if (title.match(/^RE_WHOIS_AVA_ZWAVE#/)) {
			let mac = msg[1].replace(/mac=/g, '').trim();
			let model = msg[2].replace(/model=/g, '').trim();
			let ip = rinfo.address;
    		let info = GatewayInfo.load(mac) || GatewayInfo.create(mac);

			info.ip = ip;
			info.model = model;
			info.mac = mac;
			info.save();

			var acc = info.acc;
			var pwd = info.pwd;

			if (!this.publishedGateway[mac]) { // this mac haven't published yet;
				try {
					var gateway = new Gateway(mac, model, ip);
					if (acc && pwd) gateway.BridgeGateway(acc, pwd); // admin user have registered.

				} catch (e) {
					debug('Fail to bridge the gateway ' + mac);
					debug(e);
				}
				try {
					gateway.publish(this.port++, this.pincode);
					this.publishedGateway[mac] = gateway;
				} catch (e) {
					debug('Fail to publish the gateway ' + mac);
					debug(e);
				}
			} else {
				console.log(info);
				console.log(info.mac + " acc: " + info.acc);
				console.log(info.mac + " pwd: " + info.pwd);
				if (acc) this.publishedGateway[mac].setting.acc = acc;
				if (pwd) this.publishedGateway[mac].setting.pwd = pwd;
				if (ip) this.publishedGateway[mac].setting.ip = ip;
			}
/*
    		if (!info) { // Discover new gateway not on storage.
				info = GatewayInfo.create(mac);
				info.ip = ip;
				info.model = model;
				info.mac = mac;
				info.save();

				let gateway = new Gateway(mac, model, ip);
				gateway.publish(this.port++, this.pincode);
				this.publishedGateway[mac] = gateway;

				debug('Create gateway info ' + mac + ' ip: ' + ip + ', model: ' + model);
    		} else {
				// update disk data
    			info.ip = ip;
				info.model = model;
				info.mac = mac;
				info.save();
				debug('Renew gateway info.');
				var acc = info.acc;
				var pwd = info.pwd;
				if (!this.publishedGateway[mac]) { // this mac haven't published yet;
					try {
						var gateway = new Gateway(mac, model, ip);
						if (acc && pwd) gateway.BridgeGateway(acc, pwd); // admin user have registered.

					} catch (e) {
						debug('Fail to bridge the gateway ' + mac);
						debug(e);
					}
					try {
						gateway.publish(this.port++, this.pincode);
						this.publishedGateway[mac] = gateway;
					} catch (e) {
						debug('Fail to publish the gateway ' + mac);
						debug(e);
					}
				} else {
					if (acc) this.publishedGateway[mac].setting.acc = acc;
					if (pwd) this.publishedGateway[mac].setting.pwd = pwd;
					if (ip) this.publishedGateway[mac].setting.ip = ip;
				}
			}
			*/
		}

		if (title.match(/^WHOIS_AVA_BRIDGE#/)) {
			debug('Someone is finding UltraBridge.');
			var message = new Buffer('RE_WHOIS_AVA_BRIDGE#');
			this.socket.send(message, 0, message.length, 10000, '255.255.255.255', (err, bytes) => {
		        if (err) debug(err);
			});
			debug('Send "RE_WHOIS_AVA_BRIDGE#" back.');
		}
    });
}

GatewayManager.prototype.clear = function () {
	for (var mac in this.publishedGateway) {
		this.remove(mac);
	}
	this.scan();
};

GatewayManager.prototype.remove = function (mac) {
	let gateway = this.publishedGateway[mac];
	if (gateway) {
		gateway.destroy();
		gateway.emitter.removeAllListeners();
		gateway._info.remove();

		this.emitter.removeAllListeners('renew-${mac}');
		this.publishedGateway[mac] = undefined;
		delete this.publishedGateway[mac];

		setTimeout(() => { this.scan() }, 2 * 1000);
	} else {
		debug(mac + ' not found.');
	}
};

GatewayManager.prototype.close = function () {
    this.socket.close();
    this.server.close();
};

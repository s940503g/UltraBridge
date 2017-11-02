'use strict';
const dgram = require('dgram');
const debug = require('debug')('GatewayManager');
const http = require('http');
const GatewayInfo = require('./GatewayInfo.js');
const Gateway = require('./Gateway.js');

module.exports = new GatewayManager();

function GatewayManager() {
	this.port = 5050;
	this.pincode = '222-21-266';
	this.publishedGateway = {};

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
    		let info = GatewayInfo.load(mac);

    		if (!info) { // Discover new gateway not on storage.
				info = GatewayInfo.create(mac);
				info.ip = ip;
				info.model = model;
				info.mac = mac;
				info.save();

				let gateway = new Gateway(mac, model, ip);
				if (gateway._info.reachable) {
					gateway.publish(this.port++, this.pincode);
					this.publishedGateway[mac] = gateway;
				} else {
					debug(`Gateway ${mac} not reachable.`);
				}

				debug('Create gateway info ' + mac + ' ip: ' + ip + ', model: ' + model);
    		} else {
				// update disk data
    			info.ip = ip;
				info.model = model;
				info.reachable = false;
				info.save();
				debug('Renew gateway info.');

				if (!this.publishedGateway[mac]) { // this mac haven't published yet;
					try {
						var gateway = new Gateway(mac, model, ip);
						let acc = info.acc;
						let pwd = info.pwd;

						if (acc && pwd) gateway.BridgeGateway(acc, pwd); // admin user have registered.
					} catch (e) {
						debug('Fail to bridge the gateway ' + mac);
						debug(e);
					} finally {
						gateway.publish(this.port++, this.pincode);
						this.publishedGateway[mac] = gateway;
					}
				}
			}
		}
    });
}

GatewayManager.prototype.clear = function () {
	for (var mac in this.publishedGateway) {
		this.publishedGateway[mac].destroy();
		this.publishedGateway[mac]._info.remove();
		this.publishedGateway[mac] = undefined;
	}
	this.scan();
};

GatewayManager.prototype.remove = function (mac) {
	let gateway = this.publishedGateway[mac];
	if (gateway) {
		gateway.destroy();
		gateway._info.remove();
		this.publishedGateway[mac] = undefined;
		this.scan();
	} else {
		debug('mac not found.');
	}
};

GatewayManager.prototype.close = function () {
    this.socket.close();
    this.server.close();
};

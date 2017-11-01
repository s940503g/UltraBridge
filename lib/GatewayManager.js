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

GatewayManager.prototype.emit = function () {
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
				info.published = true;
				info.save();

				this.publishedGateway[mac] = {
					model: model, ip: ip, acc: "", pwd: ""
				};

				let gateway = new Gateway(mac);
				gateway.publish(this.port++, this.pincode);

				this.publishedGateway[mac]._gateway = gateway;

				debug('Create gateway info ' + mac + ' ip: ' + ip + ', model: ' + model);
    		} else {
				// update disk data
    			info.ip = ip;
				info.model = model;
				info.save();

				if (!this.publishedGateway[mac]) { // haven't published yet;
					try {
						let acc = info.acc;
						let pwd = info.pwd;

						this.publishedGateway[mac] = {
							model: model,
							ip: ip, acc: acc, pwd: pwd
						};

						var gateway = new Gateway(mac);

						if (acc && pwd) gateway.BridgeGateway(acc, pwd); // admin user have registered.

					} catch (e) {
						debug(e);
						debug('Fail to bridge the gateway ' + mac);
					} finally {
						gateway.publish(this.port++, this.pincode);
						this.publishedGateway[mac]._gateway = gateway;

						let accCount = gateway.Bridge.bridgedAccessories.length;
						debug('Bridging ' + accCount + ' accessory in the gateway ' + mac);
					}
				}
			}
		}
    });
}

GatewayManager.prototype.close = function () {
    this.socket.close();
    this.server.close();
};

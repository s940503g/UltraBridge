'use strict';
const dgram = require('dgram');
const debug = require('debug')('GatewayFinder');
const http = require('http');
const GatewayInfo = require('./GatewayInfo.js');
const Gateway = require('./Gateway.js');

module.exports = new GatewayFinder();

function GatewayFinder() {
	this.port = 5050;
	this.pincode = '222-21-266';
	this.publishedGateway = {};

	this.server = dgram.createSocket('udp4');
	this.socket = dgram.createSocket('udp4');

	this.socket.bind(() => { this.socket.setBroadcast(true); });
	this.server.bind(10000);
};

GatewayFinder.prototype.emit = function () {
	var message = new Buffer('WHOIS_AVA_ZWAVE#');
	this.socket.send(message, 0, message.length, 10000, '255.255.255.255', (err, bytes) => {
        if (err) debug(err);
	});
}

GatewayFinder.prototype.on = function () {
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
					model: model, ip: ip
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

				// update memory data
				this.publishedGateway[mac] = {};
				this.publishedGateway[mac].model = model;
				this.publishedGateway[mac].ip = ip;

				if (!this.publishedGateway[mac]) { // haven't published yet;
					try {
						var gateway = new Gateway(mac);
						if ((acc !== "") && (pwd !== "")) { // admin user have registered.
							let {acc, pwd} = info;
							gateway.BridgeGateway(acc, pwd);
						}
					} catch (e) {
						debug('Fail to bridge the gateway ' + mac);
						debug(e);
					} finally {
						let accCount = gateway.BridgeAccessory.bridgedAccessories.length;
						debug('Have bridged ' + accCount + ' accessory in the gateway ' + mac);
						gateway.publish(this.port++, this.pincode);
						this.publishedGateway[mac]._gateway = gateway;
					}
				}
			}
		}
    });
}

GatewayFinder.prototype.close = function () {
    this.socket.close();
    this.server.close();
};

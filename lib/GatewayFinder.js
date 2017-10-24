'use strict';
const dgram = require('dgram');
const debug = require('debug')('GatewayFinder');
const http = require('http');
const GatewayInfo = require('GatewayInfo.js');
const Gateway = require('./Gateway.js');

module.exports = new GatewayFinder();

function GatewayFinder() {
    this.server = dgram.createSocket('udp4');
    this.socket = dgram.createSocket('udp4');
    this.gateway_list = {};

    this.socket.bind(() => {
    	this.socket.setBroadcast(true);
    });
    this.server.bind(10000);
};

GatewayFinder.prototype.emit = function () {
	var message = new Buffer('WHOIS_AVA_ZWAVE#');
	this.socket.send(message, 0, message.length, 10000, '255.255.255.255', (err, bytes) => {
        if (err) debug(err);
	});
}

GatewayFinder.prototype.on = function () {

    this.server.on('message', (msg, rinfo) => {

    	msg = msg.toString('utf8').split(/&/);
    	var title = msg[0];
    	var _mac = msg[1];
    	var ip = rinfo.address;

    	if (title.match(/^RE_WHOIS_AVA_ZWAVE#/)) {
            mac = _mac.replace(/mac=/g, '').trim();

    		var info = GatewayInfo.load(mac);

    		if (!info) { // Discover new gateway not on storage.
    			info = GatewayInfo.create(mac);

                info.ip = ip;
    			info.model = model.replace(/model=/g, '').trim();;
    			info.mac = mac;
                info.save();

                let gateway = new Gateway(mac);
                gateway.publish(port++, pincode);

                this.gateway_list[mac] = { _info: info };

                debug('Create gateway info' + mac + ' ip: ' + ip + ', model: ' + model);
    		} else { // Already on the storage.
    			info.ip = ip; // Gateway ip probably change.
                info.save();

                let {acc, pwd, ip, mac} = info;
                let gateway = new Gateway(mac);

                if ((acc !== "") && (pwd !== "")) {
                    debug('Register admin user on the gateway ' + mac);
                    try {
                        gateway.BridgeGateway(acc, pwd);
                    } catch (e) {
                        debug('Fail to bridge the gateway ' + mac);
                    } finally {
                        let accCount = gateway.BridgeAccessory.bridgedAccessories.length;
                        debug('Have bridged ' + accCount + ' accessory in the gateway ' + mac);
                    }
                }

                gateway.publish(port++, pincode);

                this.gateway_list[mac] = { _info: info };

                debug('load the gateway info'+ mac +' IP address: ' + ip + 'bridged: ' + info.bridged);
    		}
    });
}

GatewayFinder.prototype.close = function () {
    this.socket.close();
    this.server.close();
};

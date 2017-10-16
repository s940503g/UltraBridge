'use strict';
const hap_nodejs = require('hap-nodejs');
const Gateway = require('./lib/Gateway.js');
const dgram = require('dgram');
const debug = require('debug')('test');

var gatewayList = {};

var port = 5050;
let pincode = "222-21-266";

var socket = dgram.createSocket('udp4');
var server = dgram.createSocket('udp4');

socket.bind(function () {
	socket.setBroadcast(true);
});

var message = new Buffer('WHOIS_AVA_ZWAVE#');

socket.send(message, 0, message.length, 10000, '255.255.255.255', function (err, bytes) {
	if (err) console.log(err);
});

setInterval(function () {
	socket.send(message, 0, message.length, 10000, '255.255.255.255', function (err, bytes) {
		if (err) console.log(err);
	});
}, 10000);

server.on('message', function (msg, rinfo) {
	msg = msg.toString('utf8').split(/&/);
	let title = msg[0];
	let mac = msg[1];
	let model = msg[2];

	if (title.match(/^RE_WHOIS_AVA_ZWAVE#/)) {
		hap_nodejs.init();

		let address = rinfo.address;

		if (gatewayList[mac]) {
			let old_gw = gatewayList[mac];
			if (old_gw.setting.ip != address) {
				old_gw.destroy();
				let gateway = new Gateway('admin', '123456', address);
				gateway.publish(pincode, port++);
				gatewayList[mac] = gateway;
				debug('Reset ' + mac);
			}
			debug(address + " is Alive.");
		}else{
			let gateway = new Gateway('admin', '123456', address);
			gateway.publish(pincode, port++);
			gatewayList[mac] = gateway;

			debug('Create new Gateway at ip: ' + address);
		}

	} else if (title.match(/^WHOIS_AVA_BRIDGE#/)) {

		let message = new Buffer('RE_WHOIS_AVA_BRIDGE#');
		socket.send(message, 0, message.length, 10000, '255.255.255.255', function (err, bytes) {
			if (err) console.log(err);
		});
	}
});

server.bind(10000);

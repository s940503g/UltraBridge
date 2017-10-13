'use strict';
const hap_nodejs = require('hap-nodejs');
const Gateway = require('./lib/Gateway.js');
const dgram = require('dgram');

var port = 51826;
let pincode = "222-21-266";

var socket = dgram.createSocket('udp4');
var server = dgram.createSocket('udp4');

socket.bind(function () {
	socket.setBroadcast(true);
});

var message = new Buffer('WHOIS_AVA_ZWAVE#');
socket.send(message, 0, message.length, 10000, '255.255.255.255', function (err, bytes) {
	if (err) console.log(err);
//	socket.close();
});

server.on('message', function (msg, rinfo) {
	msg = msg.toString('utf8');
	console.log('receive message: ' + msg);
	
	if (msg.match(/^RE_WHOIS_AVA_ZWAVE#/)) {
		hap_nodejs.init();
	
		let address = rinfo.address;

		console.log('get message form'+address);

		let gateway = new Gateway('admin', '123456', address);

		gateway.publish(pincode, port);
	} else if (msg.match(/^WHOIS_AVA_BRIDGE#/)) {
		
		let message = new Buffer('RE_WHOIS_AVA_BRIDGE#');
		socket.send(message, 0, message.length, 10000, '255.255.255.255', function (err, bytes) {
			if (err) console.log(err);
//			socket.close();
		});
	}
});

server.bind(10000);

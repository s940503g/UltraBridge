'use strict';
const hap_nodejs = require('hap-nodejs');
const Gateway = require('./lib/Gateway.js');
const dgram = require('dgram');
const debug = require('debug')('main');
const http = require('http');
const express = require('express');

hap_nodejs.init();

var app = express();
var gateway_list = {};
var bridged_gateway = {};

var port = 5050;
let pincode = "222-21-266";

var socket = dgram.createSocket('udp4');
var server = dgram.createSocket('udp4');

app.get('/show_geteway_list', function (req, res) {
	res.status(200).send(gateway_list);
});

app.get('/gateway/add_bridge', function (req, res) {
	let acc = req.query.acc;
	let pwd = req.query.pwd;
	let mac = req.query.mac;
	let ip = gateway_list[mac].ip;

	try {
		if (!acc || !pwd || !mac)
			throw {status: 422, msg: 'Required parameter missed.'};
		else if (!ip)
			throw {status: 400, msg: 'Gateway not found.'};
		else if (bridged_gateway[mac])
			throw {status: 304, msg: 'Gateway ' + mac + ' is already bridged.'};
		else
			let gateway = new Gateway(acc, pwd, ip);

			gateway.publish(pincode, port++, function (err) {
				if (err) {
					throw {status: 500, msg: 'Server error.'};
				} else {
					gateway_list[mac].bridged = true;
					console.log('Gateway ' + mac + ' bridged to Apple HomeKit.');
				}
			});

	} catch (error) {
		res.status(error.status).send(error.msg);
	} finally {
		res.status(200).send('Success.');
	}
});

app.get('/gateway/remove_bridge', function (req, res) {
	let acc = req.query.acc;
	let pwd = req.query.pwd;
	let mac = req.query.mac;
	let ip = gateway_list[mac].ip;

	try {
		if (!acc || !pwd || !mac)
			throw {status: 422, msg: 'Required parameter missed.'};
		else if (!ip)
			throw {status: 400, msg: 'Gateway not found.'};
		else if (!bridged_gateway[mac])
			throw {status: 304, msg: 'Gateway ' + mac + ' not exists.'};
		else
			bridged_gateway[mac].destroy();
			console.log('The biridge of the gateway ' + mac + ' removed.');

	} catch (error) {
		res.status(error.status).send(error.msg);
	} finally {
		res.status(200).send('The biridge of the gateway ' + mac + ' removed.');
	}

});

app.listen(3000);


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
	if (title.match(/^RE_WHOIS_AVA_ZWAVE#/)) {
		msg = msg.toString('utf8').split(/&/);
		let title = msg[0];
		let mac = msg[1];
		let model = msg[2];
		let address = rinfo.address;

		gateway_list[mac.replace(/mac=/g, '')] = {
			ip: address,
			model: model
		};

	} else if (title.match(/^WHOIS_AVA_BRIDGE#/)) {
		let message = new Buffer('RE_WHOIS_AVA_BRIDGE#');
		socket.send(message, 0, message.length, 10000, '255.255.255.255', function (err, bytes) {
			if (err) console.log(err);
		});
	}
});

server.bind(10000);
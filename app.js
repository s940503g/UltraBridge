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

app.get('/scan_gateway', function (req, res) {
	scan_ava_zave_gateway();
	res.status(200).send('Success');
});

app.get('/show_gateway_list', function (req, res) {
	res.status(200).send(gateway_list);
});

app.get('/add_gateway', function (req, res) {
	let acc = req.query.acc;
	let pwd = req.query.pwd;
	let mac = req.query.mac;
	let ip;

	if (gateway_list[mac]) {
		ip = gateway_list[mac].ip;
	}

	try {
		if (!acc || !pwd || !mac){
			throw {status: 422, msg: 'Required parameter missed.'};
		}else if (!ip){
			throw {status: 400, msg: 'Gateway not found.'};
		}else if (bridged_gateway[mac]){
			throw {status: 304, msg: 'Gateway ' + mac + ' is already bridged.'};
		}else{
			let gateway = new Gateway(acc, pwd, ip);

			gateway.publish(pincode, port++, function (err) {
				if (err) {
					throw {status: 500, msg: 'Server error.'};
				} else {

					gateway_list[mac].bridged = true;
					bridged_gateway[mac] = gateway;

					console.log('Gateway ' + mac + ' bridge to Apple HomeKit.');
					res.status(200).send('Success.');
				}
			});
		}
	} catch (error) {
		console.log(error.msg);
		res.status(error.status);;
	}
});

app.get('/remove_gateway', function (req, res) {

	let mac = req.query.mac;
	let ip;
	if (gateway_list[mac]) {
		ip = gateway_list[mac].ip;
	}

	try {
		if (!mac)
			throw {status: 422, msg: 'Required parameter missed.'};
		else if (!ip)
			throw {status: 400, msg: 'Gateway not found.'};
		else if (!bridged_gateway[mac])
			throw {status: 304, msg: 'Gateway ' + mac + ' not exists.'};
		else
			bridged_gateway[mac].destroy();
			bridged_gateway[mac] = null;

			if (gateway_list[mac]) gateway_list[mac].bridged = false;

			res.status(200).send('Success');

	} catch (error) {
		console.log(error);
		res.status(error.status);
	}
});

app.get('/show_bridged_gateway', function (req, res) {
	var output = {};
	for (var mac in bridged_gateway) {
		let gw = bridged_gateway[mac]
		output[mac] = {
			acc: gw.setting.acc,
			pwd: gw.setting.pwd,
			ip: gw.setting.ip
		}
	}
	res.status(200).send(output);
});

app.listen(3000);


socket.bind(function () {
	socket.setBroadcast(true);
});

function scan_ava_zave_gateway () {
	var message = new Buffer('WHOIS_AVA_ZWAVE#');
	socket.send(message, 0, message.length, 10000, '255.255.255.255', function (err, bytes) {
		if (err) console.log(err);
	});
}

server.on('message', function (msg, rinfo) {
	msg = msg.toString('utf8').split(/&/);
	let title = msg[0];
	let mac = msg[1];
	let model = msg[2];
	let address = rinfo.address;

	if (title.match(/^RE_WHOIS_AVA_ZWAVE#/)) {

		gateway_list[mac.replace(/mac=/g, '').trim()] = {
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

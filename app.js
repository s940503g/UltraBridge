'use strict';
const hap_nodejs = require('hap-nodejs');
const Gateway = require('./lib/Gateway.js');
const dgram = require('dgram');
const debug = require('debug')('main');
const http = require('http');
const express = require('express');
const GatewayInfo = require('./lib/GatewayInfo.js')
const ipFinder = require("./lib/GatewayFinder.js");

ipFinder.on(); // Waiting for gateway callback.
hap_nodejs.init();

var app = express();

var port = 5050;
let pincode = "222-21-266";

app.get('/scan', function (req, res) {
	ipFinder.emit();
	res.status(200).send('Success.\n');
});

app.get('/register', function (req, res) {
	let acc = req.query.acc;
	let pwd = req.query.pwd;
	let mac = req.query.mac;

	try {
		if (!acc || !pwd || !mac){
			throw {status: 422, msg: 'Error: Required parameter missed.\n'};
		}else{
			let info = GatewayInfo.load(mac);
			if (info) {
				let gateway = new Gateway(mac);
				gateway.BridgeGateway(acc, pwd);
				gateway.publish(port, pincode);
			} else {
				throw "Gateway not found.";
			}
		}
	} catch (error) {
		debug(error);
		if (error.status)
			res.status(error.status).send(error);
		else
			res.status(400).send(error);
	}
});

app.get('/show_bridged_gateway', function (req, res) {
	var output = {};
	for (var mac in ipFinder.gateway_list) {
		let gw = ipFinder.gateway_list[mac]._gateway;
		if (gw) {
			output[mac] = {acc: gw.setting.acc, ip: gw.setting.ip, mac: mac};
		}
	}
	res.status(200).send(output);
});

app.listen(3000);

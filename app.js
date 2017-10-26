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

ipFinder.emit();
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
				let gw = ipFinder.publishedGateway[mac]._gateway;
				gw.BridgeGateway(acc, pwd);

				res.status(200).send('Success.\n');

				gw.publish(this.port++, this.pincode);
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

app.get('/show', function (req, res) {
	var output = {};
	for (var mac in ipFinder.publishedGateway) {
		let ip = ipFinder.publishedGateway[mac].ip;
		output[mac] = {ip: ip};
	}
	res.status(200).send(output);
});

app.get('/unpaired', function (req, res) {
	let mac = req.query.mac;
	let gw_info = GatewayInfo.load(mac);

	ipFinder.publishedGateway[mac]._gateway.BridgeAccessory._accessoryInfo.removePairedClient(mac);

	gw_info.acc = "";
	gw_info.pwd = "";
	gw_info.save();

	ipFinder.emit();
	res.status(200).send('Success.\n');
});

app.listen(3000);

'use strict';
const hap_nodejs = require('hap-nodejs');
const Gateway = require('./lib/Gateway.js');
const dgram = require('dgram');
const debug = require('debug')('main');
const http = require('http');
const express = require('express');
const GatewayInfo = require('./lib/GatewayInfo.js');
const GatewayManager = require("./lib/GatewayManager.js");

GatewayManager.on(); // Waiting for gateway callback.
hap_nodejs.init();

var app = express();

GatewayManager.emit();
app.get('/scan', function (req, res) {
	GatewayManager.emit();
	res.status(200).send('Success.\n');
});

app.get('/register', function (req, res) {
	let acc = req.query.acc;
	let pwd = req.query.pwd;
	let mac = req.query.mac;

	try {
		if (!acc || !pwd || !mac){
			throw 'ERROR: Required parameter missed.\n'
		}else{
			if (!GatewayManager.publishedGateway[mac]) throw "ERROR: Gateway not found.\n";
			let gw = GatewayManager.publishedGateway[mac]._gateway;
			gw.BridgeGateway(acc, pwd);
			gw.publish(GatewayManager.port++, GatewayManager.pincode);
			res.status(200).send('Success.\n');
		}
	} catch (error) {
		debug(error);
		res.status(400).send(error);
	}

});

app.get('/show', function (req, res) {
	var output = {};
	for (var mac in GatewayManager.publishedGateway) {
		let ip = GatewayManager.publishedGateway[mac].ip;
		output[mac] = {ip: ip};
	}
	res.status(200).send(output);
});

app.get('/reset', function (req, res) {
	try {
		let mac = req.query.mac;
		let gw_info = GatewayInfo.load(mac);

		if (gw_info.acc !== "" && gw_info.pwd !== "") {
			GatewayManager.publishedGateway[mac]._gateway.BridgeGateway(gw_info.acc, gw_info.pwd);
		}
		GatewayManager.publishedGateway[mac]._gateway.publish(GatewayManager.port++, GatewayManager.pincode);

		GatewayManager.emit();
		res.status(200).send('Success.\n');
	} catch (e) {
		debug(e);
		res.status(400).send(e);
	}
});

app.listen(3000);

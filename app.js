'use strict';
const hap_nodejs = require('hap-nodejs');
const Gateway = require('./lib/Gateway.js');
const dgram = require('dgram');
const debug = require('debug')('main');
const http = require('http');
const express = require('express');
const GatewayInfo = require('./lib/GatewayInfo.js');
const GatewayManager = require("./lib/GatewayManager.js");

hap_nodejs.init();

var app = express();

GatewayManager.on();
GatewayManager.emit();

app.get('/scan', function (req, res) {
	GatewayManager.emit();
	res.status(200).send('Success.\n');
});

app.get('/register', function (req, res) {
	let {acc, pwd, ip} = req.query;

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
		let {mac, acc, pwd} = req.query;

		GatewayManager.publishedGateway[mac]._gateway.reset();
		GatewayManager.publishedGateway[mac]._gateway.destroy();

		let info = GatewayInfo.load(mac);
		info.acc = acc || "";
		info.pwd = pwd || "";
		info.save(); // reset acc and pwd in storage.

		try {
			if (acc && pwd) GatewayManager.publishedGateway[mac]._gateway.BridgeGateway(acc, pwd);
		} catch (e) {
			debug(e);
		} finally {
			GatewayManager.publishedGateway[mac]._gateway.publish(GatewayManager.port++, GatewayManager.pincode);
			res.status(200).send('Success.\n');
		}

	} catch (e) {
		debug(e);
		res.status(400).send(e);
	}
});

app.listen(3000);

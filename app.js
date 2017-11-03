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
GatewayManager.scan();

app.get('/scan', function (req, res) {
	GatewayManager.scan();
	res.status(200).send('Success.\n');
});

app.get('/show', function (req, res) {
	var output = {};
	for (var mac in GatewayManager.publishedGateway) {
		let ip = GatewayManager.publishedGateway[mac].setting.ip;
		output[mac] = {ip: ip};
	}
	res.status(200).send(output);
});

app.get('/register', function (req, res) {
	try {
		let {mac, acc, pwd} = req.query;
		let info = GatewayInfo.load(mac);
		let gateway = GatewayManager.publishedGateway[mac];

		if (!info) throw `Can't find gateway ${mac}. Please check or rescan.`;
		if (acc && pwd) {
			gateway.destroy();
			gateway.BridgeGateway(acc, pwd, (err) => {
				if (err) throw err;
			});
		}
		gateway.publish(GatewayManager.port++, GatewayManager.pincode);

		res.status(200).send('Success.\n');
	} catch (e) {
		debug(e);
		res.status(400).send(e);
	}
});

app.get('/clear', function (req, res) {
	try {
		GatewayManager.clear();
		GatewayManager.scan();
		res.status(200).send('Success.\n');
	} catch (e) {
		debug(e);
		res.status(400).send(e);
	}
})

app.listen(3000);

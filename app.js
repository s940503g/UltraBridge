'use strict';
const hap_nodejs = require('hap-nodejs');
const Gateway = require('./lib/Gateway.js');
const dgram = require('dgram');
const debug = require('debug')('app');
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

app.get('/paired', function (req, res) {
	var output = {};
	for (var mac in GatewayManager.publishedGateway) {
		let gateway = GatewayManager.publishedGateway[mac];
		let clients = gateway.Bridge._accessoryInfo.pairedClients;
		let acc = gateway.setting.acc;
		let ip = gateway.setting.ip;
		let reachable = gateway.reachable;

		if (clients === {}) {
			output[mac] = {ip: ip, acc: acc, reachable: reachable};
		}
	}
	res.status(200).send(output);
});

app.get('/unpaired', function (req, res) {
	var output = {};
	for (var mac in GatewayManager.publishedGateway) {
		let gateway = GatewayManager.publishedGateway[mac];
		let clients = gateway.Bridge._accessoryInfo.pairedClients;
		let acc = gateway.setting.acc;
		let ip = gateway.setting.ip;
		let reachable = gateway.reachable;

		if (!clients === {}) {
			output[mac] = {ip: ip, acc: acc, reachable: reachable};
		}
	}
	res.status(200).send(output);
});

app.get('/unregistered', function (req, res) {
	var output = {};
	for (var mac in GatewayManager.publishedGateway) {
		let ip = GatewayManager.publishedGateway[mac].setting.ip;
		let acc = GatewayManager.publishedGateway[mac].setting.acc;
		let pwd = GatewayManager.publishedGateway[mac].setting.pwd;

		if (!acc || !pwd) {
			output[mac] = {ip: ip, acc:acc};
		}
	}
	res.status(200).send(output);
});

app.get('/register', function (req, res) {
	try {
		GatewayManager.scan();
		let {mac, acc, pwd} = req.query;
		let info = GatewayInfo.load(mac);
		let gateway = GatewayManager.publishedGateway[mac];

		if (!info) throw `Can't find gateway ${mac}. Please check or rescan.`;
		if (acc && pwd) {
			debug('')
			gateway.BridgeGateway(acc, pwd, (err) => {
				if (err) debug(err);
			});
		}
		res.status(200).send('Success.\n');
	} catch (e) {
		debug(e);
		res.status(400).send(e);
	}
});

app.get('/remove', function (req, res) {
	try {
		let {mac} = req.query;
		GatewayManager.remove(mac);
		res.status(200).send('Success.\n');
	} catch (e) {
		debug(e);
		res.status(400).send(e);
	}
});

app.get('/rebridge', function (req, res) {
	try {
		let {mac} = req.query;
		let gateway = GatewayManager.publishedGateway[mac];
		gateway.rebridgeGateway();
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
});

app.listen(3000);

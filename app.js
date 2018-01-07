'use strict';
const hap_nodejs = require('hap-nodejs');
const Gateway = require('./lib/Gateway.js');
const dgram = require('dgram');
const debug = require('debug')('app');
const http = require('http');
const express = require('express');
const GatewayInfo = require('./lib/GatewayInfo.js');
const GatewayManager = require("./lib/GatewayManager.js");
const bodyParser = require('body-parser');
var child_process = require('child_process');

hap_nodejs.init();

var app = express();

GatewayManager.on();
GatewayManager.scan();

app.set('view engine', 'ejs')
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/', express.static(__dirname + '/views')); // redirect root
app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js')); // redirect bootstrap JS
app.use('/js', express.static(__dirname + '/node_modules/jquery/dist')); // redirect JS jQuery
app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css')); // redirect CSS bootstrap

app.get('/api/scan', function (req, res) {
	GatewayManager.scan();
	res.status(200).send('Success.\n');
});

app.get('/show', function (req, res) {
	var output = {};
	for (var mac in GatewayManager.publishedGateway) {
		let gateway = GatewayManager.publishedGateway[mac];
		let clients = gateway.Bridge._accessoryInfo.pairedClients;
		let acc = gateway.setting.acc;
		let reachable = gateway.reachable;
		let ip = gateway.setting.ip;
		let pwd = gateway.setting.pwd;
		let isRegistered = acc && pwd ? true:false;

		output[mac] = {ip: ip, acc: acc, reachable: reachable, paired: false, is_registered: isRegistered};

		for (var client in clients) {
			output[mac].paired = true;
			break;
		}
	}
	res.status(200).send(output);
});

app.get('/api/register', function (req, res) {
	try {
		GatewayManager.scan();
		let {mac, acc, pwd} = req.query;
		let info = GatewayInfo.load(mac);
		let gateway = GatewayManager.publishedGateway[mac];

		if (!info) throw `Can't find gateway ${mac}. Please check or rescan.`;
		if (acc && pwd) {
			debug('')
			gateway.BridgeGateway(acc, pwd, (err) => {
				if (err) throw 'Error: Wrong account or password.';
			});
		}
		res.status(200).send('Success.\n');
	} catch (e) {
		debug(e);
		if (e == 'Wrong account or password.') {
			res.status(401).send(e);
		} else {
			res.status(400).send(e);
		}
	}
});

app.get('/api/remove', function (req, res) {
	try {
		let {mac} = req.query;
		GatewayManager.remove(mac);
		res.status(200).send('Success.\n');
	} catch (e) {
		debug(e);
		res.status(400).send(e);
	}
});

app.get('/api/clear', function (req, res) {
	try {
		GatewayManager.clear();
		GatewayManager.scan();
		res.status(200).send('Success.\n');
	} catch (e) {
		debug(e);
		res.status(400).send(e);
	}
});

/*
web interface
 */

app.post('/gateway/:mac/register', (req, res) => {
	try {
		let {mac} = req.params;
		let {acc, pwd} = req.body;
		let gateway = GatewayManager.publishedGateway[mac];

		if (acc && pwd) {
			gateway.BridgeGateway(acc, pwd, (err) => {
				if (err) console.log(err);
			});
		}
		res.redirect('/');
	} catch (e) {
		debug(e);
		if (e == 'Wrong account or password.') {
			res.status(401).send(e);
		} else {
			res.status(400).send(e);
		}
	};
});

app.post('/gateway/:mac/remove', (req, res) => {
	try {
		let {mac} = req.params;
		GatewayManager.remove(mac);
		res.redirect('/');
	} catch (e) {
		debug(e);
		res.status(400).send(e);
	}
});

app.post('/reboot', (req, res) => {
	child_process.exec('forever restartall', function (err, stdout) {
		if (err) console.log(err)
		console.log(stdout);
	});
	res.redirect('/');
});

app.get('/', (req, res) => {
	GatewayManager.scan();
	let gateway_list = [];
	for (var mac in GatewayManager.publishedGateway) {
		let gateway = GatewayManager.publishedGateway[mac];
		let clients = gateway.Bridge._accessoryInfo.pairedClients;
		let acc = gateway.setting.acc;
		let reachable = gateway.reachable;
		let ip = gateway.setting.ip;
		let pwd = gateway.setting.pwd;
		let isRegistered = acc && pwd ? true:false;
		let model = gateway.model;

		let content = {ip: ip, reachable: reachable, paired: false, is_registered: isRegistered, mac: mac, model: model};
		for (var client in clients) {
			content.paired = true;
			break;
		}
		gateway_list.push(content);
	}
	res.render('home', { gateway_list: gateway_list });
})

app.get('/gateway/:mac', (req, res) => {
	try {
		let mac = req.params.mac;
		let gateway = GatewayManager.publishedGateway[mac];
		let acc = gateway.setting.acc;
		let model = gateway.model;

		res.render('gateway', {mac: mac, acc:acc, model: model});
	} catch (e) {
		res.status(400).send(e);
	}
});

console.log('Listening on port 3000');

app.listen(3000);

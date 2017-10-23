'use strict';
const hap_nodejs = require('hap-nodejs');
const Gateway = require('./lib/Gateway.js');
const dgram = require('dgram');
const debug = require('debug')('main');
const http = require('http');
const express = require('express');
const GatewayInfo = require('./lib/GatewayInfo.js')

hap_nodejs.init();

var app = express();
var gateway_list = {};

var port = 5050;
let pincode = "222-21-266";

var socket = dgram.createSocket('udp4');
var server = dgram.createSocket('udp4');

setInterval(() => {
	reset_all_gateway_bridge();
}, 1000 * 30);

function reset_all_gateway_bridge () {
	scan_ava_zave_gateway();

	for (var mac in gateway_list) {
		let info = gateway_list[mac]._info;
		let gw = gateway_list[mac]._gateway;

		if (gw) {
			gw.destroy();
		}

		set_gateway_bridge(info, (err) => {
			if (err) throw err;
			info.save();
		});
	}
}

function set_gateway_bridge (info, callback) {
	let {acc, pwd, ip, mac} = info;
	let gateway = new Gateway(acc, pwd, ip);

	gateway.publish(pincode, port++, function (err) {
		if (err) {
			debug(err);
			err = {status: 500, msg: 'Error: Server error.'};
		} else {
			info._gateway = gateway;
			info.save();

			debug('Gateway ' + mac + ' bridge to Apple HomeKit.');
		}
		callback(err);
	});
}



app.get('/scan', function (req, res) {
	scan_ava_zave_gateway();

	res.status(200).send('Success.');
});

app.get('/show_unbridged_gateway_list', function (req, res) {
	var output = {};
	for(var mac in gateway_list) {
		let info = gateway_list[mac]._info;
		if (!info.bridged) {
			debug(info)
			output[mac] = info;
		}
	}
	res.status(200).send(output);
});

app.get('/add_gateway', function (req, res) {
	let acc = req.query.acc;
	let pwd = req.query.pwd;
	let mac = req.query.mac;

	let info = gateway_list[mac]._info;
	let ip = info.ip;

	try {
		if (!acc || !pwd || !mac){
			throw {status: 422, msg: 'Error: Required parameter missed.\n'};
		}else if (!ip){
			throw {status: 400, msg: 'Error: Gateway not found.\n'};
		}else if (gateway_list[mac]._gateway) {
			throw {status: 304, msg: 'Error: Gateway ' + mac + ' is already bridged.\n'};
		}else{
			info.acc = acc;
			info.pwd = pwd;
			set_gateway_bridge(info, (err) => {
				if (err) throw err;
				info.save();
				res.status(200).send("Success.\n");
			});
		}
	} catch (error) {
		debug(error.msg);
		res.status(error.status).send(error.msg);;
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
			throw {status: 422, msg: 'Error: Required parameter missed.'};
		else if (!ip)
			throw {status: 400, msg: 'Error: Gateway not found.'};
		else if (!bridged_gateway[mac])
			throw {status: 304, msg: 'Error: Gateway ' + mac + ' not exists.'};
		else
			gateway_list[mac]._gateway.destroy(function (err) {
				if (err) throw {status: 400, msg: err};
				gateway_list[mac]._info.remove();
				gateway_list[mac]._info = undefined;
			});
			delete gateway_list[mac]._gateway;

			if (gateway_list[mac]) gateway_list[mac].bridged = false;

			res.status(200).send('Success');

	} catch (error) {
		debug(error);
		res.status(error.status).send(error.msg);
	}
});

app.get('/show_bridged_gateway', function (req, res) {
	var output = {};
	for (var mac in gateway_list) {
		let gw = gateway_list[mac]._gateway;
		if (gw) {
			output[mac] = {acc: gw.setting.acc, ip: gw.setting.ip, mac: mac};
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
		if (err) debug(err);
	});
}

scan_ava_zave_gateway();

server.on('message', function (msg, rinfo) {
	msg = msg.toString('utf8').split(/&/);
	var title = msg[0];
	var mac = msg[1];
	var model = msg[2];
	var ip = rinfo.address;

	if (title.match(/^RE_WHOIS_AVA_ZWAVE#/)) {
		mac = mac.replace(/mac=/g, '').trim()

		var info = GatewayInfo.load(mac);
		gateway_list[mac] = { _info: info };

		if (!info) {
			info = GatewayInfo.create(mac);
			info.ip = ip;
			info.model = model.replace(/model=/g, '').trim();;
			info.mac = mac;
			debug('Add gateway ' + mac + ' ip: ' + ip + ', model: ' + model);
			info.save();
		} else if (info.ip != ip) {
			debug('Reload the gateway '+ mac +' IP address: ' + ip);
			info.ip = ip;
			info.save();
		}
	} else if (title.match(/^WHOIS_AVA_BRIDGE#/)) {

		let message = new Buffer('RE_WHOIS_AVA_BRIDGE#');
		socket.send(message, 0, message.length, 10000, '255.255.255.255', function (err, bytes) {
			if (err) debug(err);
		});

	}
});

server.bind(10000);

'use strict';
const dgram = require('dgram');
const debug = require('debug')('GatewayFinder');
const http = require('http');

module.exports = {
    emit: function () {
        var socket = dgram.createSocket('udp4');
        socket.bind(() => {
        	socket.setBroadcast(true);
        });
    	var message = new Buffer('WHOIS_AVA_ZWAVE#');
    	socket.send(message, 0, message.length, 10000, '255.255.255.255', function (err, bytes) {
            if (err) debug(err);
            socket.close();
    	});
    },
    on: function (mac, callback) {
        var server = dgram.createSocket('udp4');
        server.on('message', function (msg, rinfo) {
        	msg = msg.toString('utf8').split(/&/);
        	var title = msg[0];
        	var _mac = msg[1];
        	var ip = rinfo.address;

        	if (title.match(/^RE_WHOIS_AVA_ZWAVE#/)) {
        		_mac = _mac.replace(/mac=/g, '').trim();

                let timeoutID = setTimeout(function () {
                    socket.close();
                    callback('Timeout.');
                }, 10 * 1000);

                if (_mac === mac) {
                    clearTimeout(timeoutID);
                    socket.close();
                    callback(null, ip);
                }
        	}
        });
        server.bind(10000);
    }
}

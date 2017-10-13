'use strict';
const debug = require('debug')('Gateway');
const events = require('events');
const hap_nodejs = require('hap-nodejs');
const Accessory = hap_nodejs.Accessory;
const Service = hap_nodejs.Service;
const Characteristic = hap_nodejs.Characteristic;
const uuid = hap_nodejs.uuid;
const child_process = require('child_process');
const parser = require('xml2json').toJson;
const Bridge = hap_nodejs.Bridge;
const Gateway = require('./lib/Gateway.js').Gateway;
var storage = require('node-persist');

storage.initSync();

let gw = new Gateway('admin', '123456', '192.168.1.101');
gw.publish('222-21-266', 5001);

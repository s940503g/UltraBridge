'use strict';
var storage = require('node-persist');
var util = require('util');

module.exports = GatewayInfo;

function GatewayInfo (usr) {
    this.username = usr;
    this.mac = "";
    this.model = "";
    this.ip = "";
    this.acc = "";
    this.pwd = "";

    this.bridged = false;
}

GatewayInfo.persistKey = function(usr) {
  return util.format("GatewayInfo.%s.json", usr.replace(/:/g,"").toUpperCase());
};

GatewayInfo.create = function(usr) {
  return new GatewayInfo(usr);
}
GatewayInfo.load = function(usr) {
  var key = GatewayInfo.persistKey(usr);
  var saved = storage.getItem(key);

  if (saved) {
    var info = new GatewayInfo(usr);
    info.mac = saved.mac || "";
    info.model = saved.model || "";

    info.acc = saved.acc || "";
    info.pwd = saved.pwd || "";

    this.bridged = saved.bridged || false;

    return info;
  }
  else {
    return null;
  }
};

GatewayInfo.prototype.save = function () {
    var content = {
        username: this.username = usr,
        mac: this.mac,
        model: this.model,
        ip: this.ip,
        acc: this.acc,
        pwd: this.pwd,
        bridged: this.bridged
    }
    var key = GatewayInfo.persistKey(this.username);

    storage.setItemSync(key, content);
    storage.persistSync();
};

GatewayInfo.prototype.remove = function () {
  var key = GatewayInfo.persistKey(this.username);

  storage.removeItemSync(key);
};

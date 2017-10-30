const ct = require('color-temperature');
const debug = require('debug')('Operater');
const auto_update_debug = require('debug')('AutoUpdate');
const hap_nodejs = require('hap-nodejs');
const Accessory = hap_nodejs.Accessory;
const Service = hap_nodejs.Service;
const Characteristic = hap_nodejs.Characteristic;
const uuid = hap_nodejs.uuid;
const child_process = require('child_process');
const parser = require('xml2json').toJson;
const events = require('events');
const GatewayInfo = require('./GatewayInfo.js')
const GatewayManager = require('./GatewayManager.js');
const jsonQuery = require('json-query');

const EXEC_OPTIONS = {timeout: 7 * 1000, killSignal: "SIGKILL"};

module.exports = DeviceTemplate;

function DeviceTemplate (gateway, node) {
    this.gateway = gateway;
    this.node = node.id;
    this.name = node.name || node.product;


    this.accessory = new Accessory(this.name, uuid.generate(this.node.product + this.node.id + this.gateway.mac));
    this.updaters = [];

    this.emitter = new events.EventEmitter();


    return this.accessory;
}

DeviceTemplate.prototype.getValues = function (calback) {
    this.gateway.getNodeValues(this.node.id, (err, values) => {
        callback(err, values);
    });
};

DeviceTemplate.prototype.setValues = function (nodeId, value, state, callback) {
    this.curl = 'curl --digest ' + '-u ' + this.setting.acc + ':' + this.setting.pwd + ' ' + this.setting.ip + ':5000/';
    let cmd = this.curl + 'valuepost.html -d "' +
    nodeId + '-'+ value.class.replace(/\s/,'+') + '-' + value.genre + '-' + value.type + '-' + value.instance + '-' + value.index + '=' + state + '"';
};

DeviceTemplate.prototype.WallSwitch = function () {
    let instances = new Set(jsonQuery(`instance`, {data: this.node.value}).value);

    let getter = (callback) => {
        this.getValues((err, values) => {
            let result = jsonQuery(`[*class=${}][*index=${}].$t`, {data:values}).value;
            callback(null, result);
        });
    }

    let updater = () => {
        getter((err, values) => {
            values.
        });
    }

    for (let instance of instances) {
        let name = this.name + " " + instance;
        let service = this.accessory.getService(name, instance);
        service = service || this.accessory.addService(Service.Switch, name, instance);

        let setter = (callback, state) => {

        }

        // service.getCharacteristic(Characteristic.On).on('get', );
        service.getCharacteristic(Characteristic.On).on('set', setter);
    }

    let updater = setInterval(() => {
        for (service in this.accessory.services) {

        }
    }, 5 * 1000);
    this.updaters(updater);
};

DeviceTemplate.prototype.stopUpdate = function () {
    this.updaters.forEach((updater)=>{
        clearInterval(updater);
    });
};


/*
 */

Accessory.prototype.getServiceBySubtype = function (name, subtype) {
    for (var index in services) {
        if (services[index].subtype == subtype) {
            return services[index];
        }
    }
};


 Gateway.prototype.getNodeValues = function (nodeId, callback) {
     this.curl = 'curl --digest ' + '-u ' + this.setting.acc + ':' + this.setting.pwd + ' ' + this.setting.ip + ':5000/';
     let cmd = this.curl + 'node_detail.cgi -d "fun=load&id=' + nodeId + '"';

     child_process.exec(cmd, (err, stdout) => {
         let values;
         let err;
         try {
             if (err) throw err;
             values = parser(stdout, {object: true}).node_detail.node.value;
         } catch (e) {
             err = e;
         } finally {
             callback(err, values);
         }
     });
 };

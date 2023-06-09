var fs = require("fs");
var path = require("path");
var redis = require("redis");
var { get_conf, get_redis_subscriber } = require("./node_utils");

var conf = get_conf();

var subscriber = redis.createClient(
  conf.redis_socketio || conf.redis_async_broker_port
);
// alternatively one can try:
// var subscriber = get_redis_subscriber();

subscriber.on("message", function (channel, message) {
  message = JSON.parse(message);
  if (message.event == "hoox_alert") {
    console.log("Got the Alert:", message);
  }
});

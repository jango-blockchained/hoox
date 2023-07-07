#!/bin/bash

while true; do
  response=$(curl --write-out '%{http_code}' --silent --output /dev/null http://influxdb:8086/ping)
  
  if [ $response -eq 204 ]; then
    echo "InfluxDB is running"
  else
    echo "InfluxDB is not running"
  fi
  
  sleep 300
done

# SQUID Proxy Server

@TODO

Setup procedure

## Manual Installation

Build the image:

    docker build -t squid-proxy .

Create a Container by running the previously created image.

    docker run -d --name squid-proxy -p 7070:7070 squid-proxy

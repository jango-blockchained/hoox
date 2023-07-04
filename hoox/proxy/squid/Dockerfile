FROM alpine:latest
RUN apk --no-cache add squid
COPY squid.conf /etc/squid/squid.conf
CMD ["squid", "-N"]

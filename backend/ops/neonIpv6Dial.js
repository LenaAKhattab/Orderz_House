/**
 * Production VPS helper: prefer Neon over IPv6 when the host cannot open IPv4
 * to Neon, while keeping the TLS server name as the Neon hostname (SNI).
 *
 * Load via NODE_OPTIONS=--require /opt/oh-neon-ipv6.js (see docker-compose.production.yml).
 * Safe no-op when IPv6 resolution fails — the original dial path is used.
 */
const dns = require("dns");
const net = require("net");

const orig = net.Socket.prototype.connect;
net.Socket.prototype.connect = function neonIpv6Connect(...args) {
  const host = args[1];
  if (typeof host === "string" && host.endsWith("neon.tech")) {
    dns.resolve6(host, (err, addrs) => {
      if (!err && addrs && addrs[0]) args[1] = addrs[0];
      orig.apply(this, args);
    });
    return this;
  }
  return orig.apply(this, args);
};

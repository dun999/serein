# Cloudflare Tunnel (ngrok replacement)

Exposes the extension proxy's external port (host `6674`) over a public HTTPS URL.
Use a named Cloudflare tunnel with a stable hostname for Coston2. Quick tunnels
are suitable only for local experiments because their rotating URL is stored
on-chain and will strand provider delivery after a restart. Compose file:
`docker-compose.cloudflared.yaml`.

Create a named tunnel in Cloudflare, route a hostname you control to it, and
place both values in the ignored `extension/.env` file:

```text
EXT_PROXY_URL=https://fcc.example.com
TUNNEL_ARGS=run --token <named-tunnel-token>
```

Then start the named tunnel. The image is pulled on first use:

```bash
docker compose -f docker-compose.cloudflared.yaml up -d
```

Confirm that the stable hostname reaches the extension proxy:

```bash
curl -fsS "$EXT_PROXY_URL/info" | jq '.machineData'
```

Then start the FCC stack with `./scripts/start-services.sh --chain coston2`.
`start-services.sh` blocks on `$EXT_PROXY_URL/info` and rejects Cloudflare
quick-tunnel hostnames on Coston2.

Stop: `docker compose -f docker-compose.cloudflared.yaml down`

## Know this

- **Do not use the default quick-tunnel mode on Coston2.** A rotating hostname
  strands the on-chain registration and provider delivery.
- **The tunnel starts fine with nothing behind it.** It just 502s until the containers are up.
- **No network dependency on the main stack**, so start order doesn't matter.
- Proxy running as a local Go binary (port 6664) instead of Docker? Prefix the first command
  with `TUNNEL_TARGET=http://host.docker.internal:6664`.

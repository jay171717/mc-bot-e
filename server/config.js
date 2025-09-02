
export default {
  serverHost: process.env.MC_HOST || "fakesalmon.aternos.me",
  serverPort: parseInt(process.env.MC_PORT || "25565", 10),
  version: process.env.MC_VERSION || "1.21.4",
  cracked: true,
  webPort: parseInt(process.env.WEB_PORT || "3000", 10),

  pingIntervalMs: 5000,
  snapshotIntervalMs: 1000,
  reconnectDelayMs: 5000,
  sleepSearchRadius: 10
}

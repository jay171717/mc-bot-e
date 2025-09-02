
import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'
import * as msu from 'minecraft-server-util'
import config from './config.js'
import {
  createBot, removeBot, listBots, setDescription, chat, forceRespawn,
  snapshot, toggleAuto, swapHands, holdSlotInHand, unequipArmorSlot,
  movementStep, movementContinuous, jumpOnce, gotoXYZ, lookAtAngles, lookAtCoord,
  setActionMode, stopAllContinuous, reconnectBot, bots
} from './bots.js'

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static('public'))

const server = http.createServer(app)
const io = new Server(server, { cors: { origin: "*" } })

let banner = { online: false, ip: config.serverHost, port: config.serverPort, version: config.version, players: [], latency: null, lastUpdated: 0 }

async function pingLoop(){
  try {
    const res = await msu.status(config.serverHost, config.serverPort, { timeout: 3000 })
    banner.online = true
    const names = (res.players?.sample || []).map(p => p.name)
    // remove bot names if ours
    const botNames = new Set(Array.from(bots.values()).map(e => e.control.username))
    banner.players = names.filter(n=>!botNames.has(n))
    banner.latency = res.roundTripLatency
    banner.version = res.version?.name || config.version
  } catch (e) {
    banner.online = false
    banner.players = []
    banner.latency = null
    banner.version = config.version
  }
  banner.lastUpdated = Date.now()
  io.emit('server_banner', banner)
}
setInterval(pingLoop, config.pingIntervalMs)
pingLoop()

io.on('connection', (socket)=>{
  socket.emit('server_banner', banner)
  socket.emit('bots_list', listBots())

  // Bot mgmt
  socket.on('add_bot', ({ username })=> {
    const id = createBot({ username })
    io.emit('bots_list', listBots())
    socket.emit('bot_snapshot', snapshot(id))
  })
  socket.on('remove_bot', ({ id })=> { removeBot(id); io.emit('bots_list', listBots()) })
  socket.on('toggle_connect', ({ id, on })=> {
    // if on=true and currently offline → reconnect; if on=false → quit
    const entry = bots.get(id); if (!entry) return
    if (on && !entry.control.connected) reconnectBot(id)
    if (!on && entry.control.connected) removeBot(id, { noDelete:true })
  })

  // Status
  socket.on('set_description', ({ id, text })=> setDescription(id, text))
  socket.on('chat', ({ id, text })=> chat(id, text))
  socket.on('respawn', ({ id })=> forceRespawn(id))

  // Inventory
  socket.on('swap_hands', ({ id })=> swapHands(id))
  socket.on('hold_slot', ({ id, slotIndex })=> holdSlotInHand(id, slotIndex))
  socket.on('unequip_armor', ({ id, which })=> unequipArmorSlot(id, which))

  // Movement / Looking
  socket.on('move_step', ({ id, dir, blocks })=> movementStep(id, dir, blocks))
  socket.on('move_cont', ({ id, dir, on })=> movementContinuous(id, dir, on))
  socket.on('jump_once', ({ id })=> jumpOnce(id))
  socket.on('goto_xyz', ({ id, x,y,z })=> gotoXYZ(id, x,y,z))
  socket.on('look_angles', ({ id, yawDeg, pitchDeg })=> lookAtAngles(id, yawDeg, pitchDeg))
  socket.on('look_at', ({ id, x,y,z })=> lookAtCoord(id, x,y,z))

  // Actions
  socket.on('action_mode', ({ id, name, mode, interval, dropStack })=> setActionMode(id, name, mode, { interval, dropStack }))
  socket.on('stop_all', ({ id })=> stopAllContinuous(id))

  // Auto toggles
  socket.on('toggle_auto', ({ id, key, value })=> toggleAuto(id, key, value))

  // Snapshots
  const snapTimer = setInterval(()=> {
    for (const b of listBots()) socket.emit('bot_snapshot', snapshot(b.id))
  }, 1000)
  socket.on('disconnect', ()=> clearInterval(snapTimer))
})

// Health endpoint
app.get('/api/health', (req,res)=> res.json({ ok: true }))

const port = process.env.PORT || config.webPort
server.listen(port, ()=> console.log(`Web UI on :${port}`))

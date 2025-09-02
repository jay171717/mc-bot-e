
import mineflayer from 'mineflayer'
import pkg from 'mineflayer-pathfinder';
const { pathfinder, goals } = pkg;

import mcDataLoader from 'minecraft-data'
import { v4 as uuidv4 } from 'uuid'
import config from './config.js'

const bots = new Map()        // id -> { bot, control }
const logs = new Map()        // id -> [lines]

function addLog(id, msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  if (!logs.has(id)) logs.set(id, [])
  const buf = logs.get(id)
  buf.push(line)
  if (buf.length > 5000) buf.splice(0, buf.length - 5000)
}

function safe(bot, path, d=null) {
  try {
    return path.split('.').reduce((o,k)=>o?.[k], bot) ?? d
  } catch { return d }
}

export function createBot({ username }) {
  const id = uuidv4()
  const bot = mineflayer.createBot({
    host: config.serverHost,
    port: config.serverPort,
    username,
    version: config.version
  })
  bot.loadPlugin(pathfinder)

  const control = {
    id,
    username,
    description: '',
    createdAt: Date.now(),
    connected: false,
    auto: { reconnect: true, respawn: true, sprint: true, jump: true, sleep: true },
    actions: {
      leftClick: { mode: 'once', interval: 10, active: false },
      rightClick: { mode: 'once', interval: 10, active: false },
      jump: { mode: 'once', interval: 10, active: false },
      sneak: { mode: 'once', interval: 10, active: false },
      drop: { mode: 'once', interval: 10, active: false, dropStack: false }
    },
    intervals: new Map(),
    continuous: new Set()
  }

  bots.set(id, { bot, control })
  wireBot(id, bot, control)
  return id
}

function wireBot(id, bot, control) {
  bot.once('login', ()=> {
    control.connected = true
    addLog(id, `Logged in as ${control.username}`)
  })
  bot.on('spawn', ()=> {
    addLog(id, `Spawn at ${fmtPos(bot.entity?.position)} in ${safe(bot,'game.dimension','?')}`)
  })
  bot.on('health', ()=> {
    if (control.auto.sprint) bot.setControlState('sprint', true)
  })
  bot.on('chat', (u,m)=> addLog(id, `<${u}> ${m}`))
  bot.on('message', (m)=> { try{ addLog(id, `[server] ${m.toString()}`) }catch{} })
  bot.on('death', ()=> {
    addLog(id, `Bot died.`)
    if (control.auto.respawn) setTimeout(()=> { try{ bot.respawn(); addLog(id,'Auto-Respawned') }catch(e){ addLog(id,`Respawn error: ${e.message}`)} }, 1000)
  })
  bot.on('kicked', r=> addLog(id, `Kicked: ${r}`))
  bot.on('end', r=> {
    control.connected = false
    addLog(id, `Disconnected: ${r}`)
    for (const [,h] of control.intervals) clearInterval(h)
    control.intervals.clear()
    control.continuous.clear()
    if (control.auto.reconnect) setTimeout(()=> reconnectBot(id), config.reconnectDelayMs)
  })

  // Auto-sleep loop
  const sleepTimer = setInterval(async ()=>{
    const entry = bots.get(id); if (!entry) return clearInterval(sleepTimer)
    if (!control.auto.sleep) return
    if (!bot.time || safe(bot,'game.dimension')!=='minecraft:overworld') return
    if (bot.time.isDay) return
    try {
      const bed = findNearbyBed(bot, config.sleepSearchRadius)
      if (bed) {
        await bot.pathfinder.goto(new goals.GoalBlock(bed.position.x, bed.position.y, bed.position.z))
        await bot.sleep(bed)
        addLog(id, `Slept at ${fmtPos(bed.position)}`)
      }
    } catch (e) {
      addLog(id, `Sleep failed: ${e.message}`)
    }
  }, 5000)
}

export function reconnectBot(id) {
  const entry = bots.get(id); if (!entry) return
  const { control } = entry
  const username = control.username
  removeBot(id, { noDelete: true })
  const newId = createBot({ username })
  const newEntry = bots.get(newId)
  bots.delete(newId)
  bots.set(id, newEntry)
  addLog(id, `Reconnected.`)
}

export function removeBot(id, opts={}) {
  const entry = bots.get(id); if (!entry) return
  const { bot, control } = entry
  for (const [,h] of control.intervals) clearInterval(h)
  control.intervals.clear()
  control.continuous.clear()
  try { bot.quit('Removed via UI') } catch {}
  if (!opts.noDelete) bots.delete(id)
}

export function listBots() {
  const out = []
  for (const [id,{control}] of bots) {
    out.push({ id, username: control.username, description: control.description, status: control.connected?'online':'offline' })
  }
  return out
}

export function setDescription(id, text) {
  const entry = bots.get(id); if (!entry) return
  entry.control.description = String(text||'').slice(0,127)
}

export function chat(id, text) {
  const entry = bots.get(id); if (!entry) return
  try { entry.bot.chat(text) } catch {}
}

export function forceRespawn(id) {
  const entry = bots.get(id); if (!entry) return
  try { entry.bot.respawn() } catch {}
}

export function snapshot(id) {
  const entry = bots.get(id); if (!entry) return null
  const { bot, control } = entry
  const mcData = mcDataLoader(bot.version)
  const effects = []
  for (const eff of (bot.entity?.effects||[])) {
    try { effects.push({ name: eff.type?.name || String(eff.type), amplifier: eff.amplifier, duration: eff.duration }) } catch {}
  }
  const looking = (()=>{
    try {
      const hit = bot.entityAtCursor(5)
      if (!hit) return null
      if (hit.type==='entity') return { type:'entity', name: hit.name, id: hit.id }
      if (hit.type==='block') return { type:'block', name: hit.name, pos: hit.position }
    } catch {}
    return null
  })()

  return {
    id,
    username: control.username,
    description: control.description,
    connected: control.connected,
    uptimeMs: Date.now() - control.createdAt,
    position: posObj(bot.entity?.position),
    dimension: safe(bot,'game.dimension','unknown'),
    health: bot.health ?? null,
    hunger: bot.food ?? null,
    xpLevel: bot.experience?.level ?? null,
    effects,
    looking,
    pitch: bot.entity?.pitch ?? 0,
    yaw: bot.entity?.yaw ?? 0,
    armor: {
      head: itemInfo(bot.inventory?.slots?.[5], mcData),
      chest: itemInfo(bot.inventory?.slots?.[6], mcData),
      legs: itemInfo(bot.inventory?.slots?.[7], mcData),
      feet: itemInfo(bot.inventory?.slots?.[8], mcData)
    },
    hand: {
      main: itemInfo(bot.heldItem, mcData),
      off: itemInfo(bot.inventory?.offHand, mcData)
    },
    inventory: listPlayerInventoryIndices().map(i=> itemInfo(bot.inventory?.slots?.[i], mcData)),
    actions: activeActions(control),
    auto: control.auto,
    debugTail: (logs.get(id)||[]).slice(-200)
  }
}

function activeActions(control){
  const list = []
  for (const [name, conf] of Object.entries(control.actions)) {
    if (conf.mode==='interval' && conf.active) list.push({ name, mode:'interval', interval: conf.interval })
  }
  for (const name of control.continuous) list.push({ name, mode:'continuous'})
  return list
}

function listPlayerInventoryIndices() {
  const arr = []
  for (let i=9;i<=44;i++) arr.push(i)
  return arr
}

function itemInfo(item, mcData) {
  if (!item) return null
  const ench = []
  try {
    const raw = item.nbt?.value?.Enchantments?.value?.value || []
    for (const e of raw) ench.push({ id: e.id?.value || '', lvl: e.lvl?.value || 0 })
  } catch {}
  const max = item.maxDurability ?? null
  const cur = (item.durabilityUsed!=null && max!=null) ? (max - item.durabilityUsed) : null
  return {
    name: item.name,
    displayName: mcData.itemsByName[item.name]?.displayName || item.name,
    count: item.count,
    durability: max!=null ? { current: cur, max } : null,
    enchants: ench
  }
}

function posObj(v){ if(!v) return null; return { x:+v.x.toFixed(2), y:+v.y.toFixed(2), z:+v.z.toFixed(2) } }
function fmtPos(v){ if(!v) return '(?, ?, ?)'; return `(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})` }

function findNearbyBed(bot, radius){
  const pos = bot.entity?.position; if(!pos) return null
  const r = radius|0
  for (let dx=-r; dx<=r; dx++) for (let dy=-2; dy<=2; dy++) for (let dz=-r; dz<=r; dz++) {
    const p = bot.entity.position.offset(dx,dy,dz)
    const block = bot.blockAt(p)
    if (!block) continue
    if (String(block.name).includes('bed')) return block
  }
  return null
}

// ===== Controls

export function toggleAuto(id, key, value){
  const entry = bots.get(id); if (!entry) return
  entry.control.auto[key] = !!value
}

export async function swapHands(id){
  const entry = bots.get(id); if (!entry) return
  try { await entry.bot.swapHands() } catch {}
}

export async function holdSlotInHand(id, slotIndex){
  const entry = bots.get(id); if (!entry) return
  const { bot } = entry
  try {
    const item = bot.inventory?.slots?.[slotIndex]
    if (!item) return
    await bot.equip(item, 'hand')
  } catch (e) { addLog(id, `equip error: ${e.message}`) }
}

export async function unequipArmorSlot(id, which){ // which: head|chest|legs|feet
  const entry = bots.get(id); if (!entry) return
  try {
    await entry.bot.unequip(which)
  } catch (e) { addLog(id, `unequip ${which} failed: ${e.message}`) }
}

export function movementStep(id, dir, blocks=5){
  const entry = bots.get(id); if (!entry) return
  const { bot } = entry
  try {
    const p = bot.entity.position
    let dx=0, dz=0
    if (dir==='forward') dz = 1
    if (dir==='back') dz = -1
    if (dir==='left') dx = -1
    if (dir==='right') dx = 1
    const yaw = bot.entity.yaw
    const rx = Math.round(Math.sin(yaw) * dz + Math.cos(yaw) * dx)
    const rz = Math.round(Math.cos(yaw) * dz - Math.sin(yaw) * dx)
    const target = { x: Math.round(p.x + rx*blocks), y: Math.round(p.y), z: Math.round(p.z + rz*blocks) }
    bot.pathfinder.setGoal(new goals.GoalBlock(target.x, target.y, target.z))
  } catch (e) { addLog(id, `move step failed: ${e.message}`) }
}

export function movementContinuous(id, dir, on){
  const entry = bots.get(id); if (!entry) return
  const { bot } = entry
  const map = { forward:'forward', back:'back', left:'left', right:'right' }
  const key = map[dir]; if (!key) return
  bot.setControlState(key, !!on)
}

export function jumpOnce(id){
  const entry = bots.get(id); if (!entry) return
  const { bot } = entry
  bot.setControlState('jump', true)
  setTimeout(()=> bot.setControlState('jump', false), 200)
}

export async function gotoXYZ(id, x,y,z){
  const entry = bots.get(id); if (!entry) return
  try {
    await entry.bot.pathfinder.goto(new goals.GoalBlock(x,y,z))
  } catch (e) {
    try {
      await entry.bot.pathfinder.goto(new goals.GoalXZ(x,z))
    } catch (e2) {
      addLog(id, `goto failed: ${e2.message}`)
    }
  }
}

export function setLookIncrement(id, axis, degrees){ /* client-side only; server not needed */ }

export function lookAtAngles(id, yawDeg, pitchDeg){
  const entry = bots.get(id); if (!entry) return
  const yaw = yawDeg * Math.PI/180
  const pitch = pitchDeg * Math.PI/180
  entry.bot.look(yaw, pitch, true)
}

export function lookAtCoord(id, x,y,z){
  const entry = bots.get(id); if (!entry) return
  const bot = entry.bot
  bot.lookAt({ x, y, z }, true)
}

// Actions modes
function startInterval(entry, name, fn, ticks){
  stopInterval(entry, name)
  const ms = Math.max(1, ticks) * 50
  const h = setInterval(fn, ms)
  entry.control.intervals.set(name, h)
  entry.control.actions[name].active = True
}
function stopInterval(entry, name){
  const h = entry.control.intervals.get(name)
  if (h) clearInterval(h)
  entry.control.intervals.delete(name)
  if (entry.control.actions[name]) entry.control.actions[name].active = false
}

export function setActionMode(id, name, mode, opts={}){
  const entry = bots.get(id); if (!entry) return
  const { bot, control } = entry
  const conf = control.actions[name]; if (!conf) return
  conf.mode = mode
  if ('interval' in opts) conf.interval = opts.interval|0
  if ('dropStack' in opts && name==='drop') conf.dropStack = !!opts.dropStack

  // stop previous
  stopInterval(entry, name)
  control.continuous.delete(name)

  // apply
  if (mode==='once'){
    doActionOnce(bot, name, conf)
  } else if (mode==='interval'){
    startInterval(entry, name, ()=> doActionOnce(bot, name, conf), conf.interval||10)
  } else if (mode==='continuous'){
    startContinuous(entry, name)
  } else if (mode==='stop'){
    // nothing
  }
}

function startContinuous(entry, name){
  const { bot, control } = entry
  control.continuous.add(name)
  if (name==='leftClick'){
    // try mining or attacking repeatedly
    const h = setInterval(()=> {
      try {
        const hit = bot.entityAtCursor(5)
        if (!hit) return
        if (hit.type==='block') {
          if (!bot.targetDigBlock) bot.dig(hit, true)
        } else if (hit.type==='entity') {
          bot.attack(hit)
        }
      } catch {}
    }, 150)
    control.intervals.set('__hold_left', h)
  } else if (name==='rightClick'){
    try { bot.activateItem() } catch {}
  } else if (name==='sneak'){
    bot.setControlState('sneak', true)
  } else if (name==='jump'){
    bot.setControlState('jump', true)
  }
}

function doActionOnce(bot, name, conf){
  if (name==='leftClick'){
    try {
      const hit = bot.entityAtCursor(5)
      if (hit?.type==='entity') bot.attack(hit)
      else if (hit?.type==='block') bot.swingArm('right') // simple click
      else bot.swingArm('right')
    } catch {}
  } else if (name==='rightClick'){
    try { bot.activateItem() } catch {}
    setTimeout(()=> { try{ bot.deactivateItem() }catch{} }, 100)
  } else if (name==='jump'){
    bot.setControlState('jump', true); setTimeout(()=> bot.setControlState('jump', false), 150)
  } else if (name==='sneak'){
    bot.setControlState('sneak', true); setTimeout(()=> bot.setControlState('sneak', false), 300)
  } else if (name==='drop'){
    const item = bot.heldItem
    if (!item) return
    if (conf.dropStack) {
      bot.tossStack(item).catch(()=>{})
    } else {
      bot.toss(item.type, null, 1).catch(()=>{})
    }
  }
}

export function stopAllContinuous(id){
  const entry = bots.get(id); if (!entry) return
  const { bot, control } = entry
  for (const name of control.continuous) {
    if (name==='rightClick') { try{ bot.deactivateItem() }catch{} }
    if (name==='sneak') bot.setControlState('sneak', false)
    if (name==='jump') bot.setControlState('jump', false)
  }
  control.continuous.clear()
  const h = control.intervals.get('__hold_left')
  if (h) clearInterval(h)
  control.intervals.delete('__hold_left')
}

export { bots }


const { createApp, ref, reactive, computed } = Vue

const socket = io()

createApp({
  setup(){
    const banner = reactive({ online:false, ip:'', port:0, version:'', players:[], latency:null })
    const bots = ref([])
    const newBotName = ref('Bot_'+Math.floor(Math.random()*1000))

    const current = reactive({ id: null, bot: null, snapshot: null })
    const currentDesc = ref('')
    const chatMsg = ref('')

    // Movement / Looking
    const moveBlocks = ref(5)
    const gotoX = ref(0), gotoY = ref(0), gotoZ = ref(0)
    const rotDeg = ref(15)
    const yawSet = ref(0), pitchSet = ref(0)
    const lookX = ref(0), lookY = ref(0), lookZ = ref(0)

    // Actions
    const actionMode = reactive({ leftClick:'once', rightClick:'once', jump:'once', sneak:'once', drop:'once' })
    const actionInterval = reactive({ leftClick:10, rightClick:10, jump:10, sneak:10, drop:10 })
    const dropStack = ref(false)

    const auto = reactive({ reconnect:true, respawn:true, sprint:true, jump:true, sleep:true })

    socket.on('server_banner', b => Object.assign(banner, b))
    socket.on('bots_list', list => {
      bots.value = list
      if (current.id){
        const found = list.find(x=>x.id===current.id)
        current.bot = found || null
      }
    })
    socket.on('bot_snapshot', s => {
      if (!current.id || s.id!==current.id) return
      current.snapshot = s
      currentDesc.value = s.description || ''
      Object.assign(auto, s.auto || {})
    })

    function addBot(){
      if (!newBotName.value) return
      socket.emit('add_bot', { username: newBotName.value })
      newBotName.value = 'Bot_'+Math.floor(Math.random()*1000)
    }
    function removeBot(id){
      socket.emit('remove_bot', { id })
      if (current.id===id) { current.id=null; current.bot=null; current.snapshot=null }
    }
    function selectBot(id){
      current.id = id
      current.bot = bots.value.find(x=>x.id===id) || null
    }
    function toggleConnect(b, ev){
      socket.emit('toggle_connect', { id:b.id, on: ev.target.checked })
    }

    function emit(evt, data={}){
      if (!current.id) return
      socket.emit(evt, { id: current.id, ...data })
    }

    function saveDesc(){ emit('set_description',{ text: currentDesc.value }) }
    function sendChat(){ if (!chatMsg.value) return; emit('chat',{ text: chatMsg.value }); chatMsg.value='' }
    function respawn(){ emit('respawn') }

    // Movement / Looking helpers
    function moveStep(dir){ emit('move_step',{ dir, blocks: moveBlocks.value }) }
    function moveCont(dir, on){ emit('move_cont',{ dir, on }) }
    function stopAll(){ emit('stop_all') }
    function rot(yawDelta, pitchDelta){
      const yaw = deg(current.snapshot?.yaw) + yawDelta
      const pitch = deg(current.snapshot?.pitch) + pitchDelta
      emit('look_angles',{ yawDeg:yaw, pitchDeg:pitch })
    }

    function applyAction(name){
      const mode = actionMode[name]
      const interval = actionInterval[name]
      const opts = { interval }
      if (name==='drop') opts.dropStack = dropStack.value
      emit('action_mode',{ name, mode, ...opts })
    }

    // Utils
    function pos(p){ if (!p) return '—'; return `${p.x}, ${p.y}, ${p.z}` }
    function prettyMs(ms){ if (!ms) return '—'; const s=Math.floor(ms/1000); const h=String(Math.floor(s/3600)).padStart(2,'0'); const m=String(Math.floor((s%3600)/60)).padStart(2,'0'); const ss=String(s%60).padStart(2,'0'); return `${h}:${m}:${ss}` }
    function lookingTxt(l){ if (!l) return '—'; if (l.type==='entity') return `Entity: ${l.name}`; if (l.type==='block') return `Block: ${l.name}`; return '—' }
    function itemLabel(it){ if (!it) return '—'; const d = it.durability ? ` (${it.durability.current}/${it.durability.max})` : ''; return `${it.displayName} x${it.count}${d}` }
    function deg(rad){ return Math.round((rad||0)*180/Math.PI) }
    function slotIndexFromIndex(i){ return 9 + i } // server uses 9..44

    return {
      banner, bots, newBotName, addBot, removeBot, selectBot, toggleConnect,
      current, currentDesc, saveDesc, chatMsg, sendChat, respawn,
      moveBlocks, gotoX, gotoY, gotoZ, rotDeg, yawSet, pitchSet, lookX, lookY, lookZ,
      moveStep, moveCont, stopAll, rot,
      actionMode, actionInterval, dropStack, applyAction,
      emit, pos, prettyMs, lookingTxt, itemLabel, deg, slotIndexFromIndex
    }
  }
}).mount('#app')

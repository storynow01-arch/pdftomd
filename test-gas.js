fetch('https://script.google.com/macros/s/AKfycbz46u8wujcIULqyESiwgK336eoXNobn2aIXvz_TzDGcn_OwFWDxeXbMxMp_Pb5G6y6o_g/exec', {
  method: 'POST',
  body: JSON.stringify({action: 'listEvents'})
})
.then(r => r.text())
.then(t => console.log(t))
.catch(e => console.error(e));

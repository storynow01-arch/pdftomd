// 臨時測試腳本也應遵守資安規範，從環境變數或環境設定中讀取
const gasUrl = process.env.GAS_URL || 'https://script.google.com/macros/s/YOUR_GAS_ID/exec';

fetch(gasUrl, {
  method: 'POST',
  body: JSON.stringify({ action: 'listEvents' })
})
.then(r => r.text())
.then(t => console.log(t))
.catch(e => console.error(e));


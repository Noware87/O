```js
(async()=>{
  const res=await fetch('/api/admin/history');
  const data=await res.json();
  document.getElementById('history').innerText=JSON.stringify(data,null,2);
})();
```

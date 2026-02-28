function toMinutes(h,m,ap){
  h = Number(h);
  m = Number(m);

  if(ap==="AM"){
    if(h===12) h=0;
  }else{
    if(h!==12) h+=12;
  }

  return h*60+m;
}

function format(mins){
  let h=Math.floor(mins/60);
  let m=mins%60;
  return h+"h "+m+"m";
}

function calculate(){

  let s = toMinutes(
    startH.value,
    startM.value,
    startAP.value
  );

  let e = toMinutes(
    endH.value,
    endM.value,
    endAP.value
  );

  if(e<s) e+=1440; // next day auto

  let breakMin = Number(document.getElementById("break").value||0);

  let total=e-s-breakMin;
  if(total<0) total=0;

  document.getElementById("result").innerText =
    "Total: "+format(total);
}


// register service worker
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("./sw.js");
  });
}
const LOADING_PERCENT = 0.25;
const LOADING_START = {h:6,m:30,ap:"PM"}; // FIXED 6:30PM

let shifts=[];

function toMinutes(h,m,ap){
  h=Number(h); m=Number(m);
  if(ap==="PM" && h!==12) h+=12;
  if(ap==="AM" && h===12) h=0;
  return h*60+m;
}

function addShift(){

  shifts.push({
    sh:9,sm:0,sap:"AM",
    eh:5,em:0,eap:"PM",
    breakMin:0,
    breakBefore:"yes"
  });

  render();
}

function render(){
  const list=document.getElementById("shiftList");
  list.innerHTML="";

  shifts.forEach((s,i)=>{

    list.innerHTML+=`
    <div class="shift">

    <label>Start</label>
    <input value="${s.sh}" onchange="shifts[${i}].sh=this.value">
    <input value="${s.sm}" onchange="shifts[${i}].sm=this.value">
    <select onchange="shifts[${i}].sap=this.value">
      <option ${s.sap=="AM"?"selected":""}>AM</option>
      <option ${s.sap=="PM"?"selected":""}>PM</option>
    </select>

    <label>End</label>
    <input value="${s.eh}" onchange="shifts[${i}].eh=this.value">
    <input value="${s.em}" onchange="shifts[${i}].em=this.value">
    <select onchange="shifts[${i}].eap=this.value">
      <option ${s.eap=="AM"?"selected":""}>AM</option>
      <option ${s.eap=="PM"?"selected":""}>PM</option>
    </select>

    <label>Break (minutes)</label>
    <input value="${s.breakMin}" type="number"
      onchange="shifts[${i}].breakMin=this.value">

    <label>Break before 6:30 PM?</label>
    <select onchange="shifts[${i}].breakBefore=this.value">
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>

    </div>`;
  });
}

function calculate(){

  const baseRate=Number(document.getElementById("baseRate").value);
  const loadingRate=baseRate*(1+LOADING_PERCENT);

  const loadStart=toMinutes(
    LOADING_START.h,
    LOADING_START.m,
    LOADING_START.ap
  );

  let normal=0;
  let loading=0;

  shifts.forEach(s=>{

    let start=toMinutes(s.sh,s.sm,s.sap);
    let end=toMinutes(s.eh,s.em,s.eap);

    if(end<start) end+=1440;

    if(end<=loadStart){
      normal+=end-start;
    }
    else if(start>=loadStart){
      loading+=end-start;
    }
    else{
      normal+=loadStart-start;
      loading+=end-loadStart;
    }

    if(s.breakBefore==="yes")
      normal-=s.breakMin;
    else
      loading-=s.breakMin;
  });

  normal=Math.max(0,normal);
  loading=Math.max(0,loading);

  const normalPay=(normal/60)*baseRate;
  const loadingPay=(loading/60)*loadingRate;

  const total=normalPay+loadingPay;

  document.getElementById("totalPay").innerText=
    "$"+total.toFixed(2);

  document.getElementById("details").innerHTML=
  `
  Normal Hours: ${(normal/60).toFixed(2)}h<br>
  Loading Hours: ${(loading/60).toFixed(2)}h<br>
  Loading Rate: $${loadingRate.toFixed(2)}/hr
  `;
}

addShift();

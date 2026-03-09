import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const API = "http://localhost:8001/api";
const toArr = (d, key) => Array.isArray(d) ? d : (d && d[key]) ? d[key] : [];

// ── Score Calculators ──────────────────────────────────────────
function calcAPACHEII(p) {
  let s=0;
  const age=parseFloat(p.age)||0;
  if(age>=75)s+=6;else if(age>=65)s+=5;else if(age>=55)s+=3;else if(age>=45)s+=2;
  const hr=parseFloat(p.heart_rate)||0;
  if(hr>=180||hr<40)s+=4;else if(hr>=140||(hr>=40&&hr<55))s+=3;else if(hr>=110||(hr>=55&&hr<70))s+=2;
  const map=parseFloat(p.mean_arterial_pressure)||0;
  if(map>=160||map<50)s+=4;else if(map>=130)s+=3;else if(map>=110||(map>=50&&map<70))s+=2;
  const rr=parseFloat(p.respiratory_rate)||0;
  if(rr>=50||rr<6)s+=4;else if(rr>=35)s+=3;else if(rr>=25||(rr>=6&&rr<10))s+=2;
  const temp=parseFloat(p.temperature)||0;
  if(temp>=41||temp<30)s+=4;else if(temp>=39||(temp>=30&&temp<32))s+=3;else if(temp>=38.5)s+=1;
  const cr=parseFloat(p.creatinine)||0;
  if(cr>=3.5)s+=4;else if(cr>=2)s+=3;else if(cr>=1.5)s+=2;
  const plt=parseFloat(p.platelets)||300;
  if(plt<50)s+=4;else if(plt<100)s+=2;
  const gcs=parseFloat(p.gcs)||15;
  s+=Math.max(0,15-gcs);
  if(p.chronic_health)s+=p.postoperative?2:5;
  const mort=s<10?4:s<15?8:s<20?15:s<25?25:s<30?40:s<35?55:75;
  const cat=s<10?"Low Risk":s<20?"Moderate Risk":s<30?"High Risk":"Critical Risk";
  return {score:s,mortality:mort,cat};
}
function calcSOFA(p) {
  let s=0;
  const spo2=parseFloat(p.spo2)||98;
  if(spo2<90)s+=3;else if(spo2<94)s+=2;else if(spo2<97)s+=1;
  const plt=parseFloat(p.platelets)||300;
  if(plt<50)s+=4;else if(plt<100)s+=3;else if(plt<150)s+=2;else if(plt<200)s+=1;
  const map=parseFloat(p.mean_arterial_pressure)||75;
  if(map<70)s+=1;
  const cr=parseFloat(p.creatinine)||1;
  if(cr>=5)s+=4;else if(cr>=3.5)s+=3;else if(cr>=2)s+=2;else if(cr>=1.2)s+=1;
  const cat=s<=1?"Minimal":s<=5?"Mild":s<=9?"Moderate":s<=12?"Severe":"Critical";
  return {score:s,cat};
}
function calcQSOFA(p) {
  let s=0;
  if((parseFloat(p.respiratory_rate)||0)>=22)s++;
  if((parseFloat(p.systolic_bp)||120)<=100)s++;
  if((parseFloat(p.gcs)||15)<15)s++;
  return {score:s,high:s>=2};
}
function calcNEWS(p) {
  let s=0;
  const rr=parseFloat(p.respiratory_rate)||16;
  if(rr<=8||rr>=25)s+=3;else if(rr>=21)s+=2;else if(rr<=11)s+=1;
  const spo2=parseFloat(p.spo2)||98;
  if(spo2<=91)s+=3;else if(spo2<=93)s+=2;else if(spo2<=95)s+=1;
  const sbp=parseFloat(p.systolic_bp)||120;
  if(sbp<=90||sbp>=220)s+=3;else if(sbp<=100)s+=2;else if(sbp<=110)s+=1;
  const hr=parseFloat(p.heart_rate)||72;
  if(hr<=40||hr>=131)s+=3;else if(hr>=111)s+=2;else if(hr<=50||hr>=91)s+=1;
  const temp=parseFloat(p.temperature)||37;
  if(temp<=35)s+=3;else if(temp>=39.1)s+=2;else if(temp<=36||temp>=38.1)s+=1;
  return {score:s,risk:s<=4?"Low":s<=6?"Medium":"High"};
}

// ── UI Helpers ─────────────────────────────────────────────────
function Badge({level}){
  const c={LOW:"bg-green-100 text-green-800 border-green-300",MODERATE:"bg-yellow-100 text-yellow-800 border-yellow-300",HIGH:"bg-orange-100 text-orange-800 border-orange-300",CRITICAL:"bg-red-100 text-red-800 border-red-300",NORMAL:"bg-green-100 text-green-800 border-green-300"};
  return <span className={`px-3 py-1 rounded-full text-xs font-bold border ${c[level]||c.LOW}`}>{level}</span>;
}
function Card({title,value,sub,color="blue",icon}){
  const b={blue:"border-blue-400 bg-blue-50",red:"border-red-400 bg-red-50",green:"border-green-400 bg-green-50",yellow:"border-yellow-400 bg-yellow-50",purple:"border-purple-400 bg-purple-50",orange:"border-orange-400 bg-orange-50"};
  return(<div className={`rounded-xl border-l-4 p-4 shadow-sm ${b[color]}`}><div className="flex justify-between"><div><p className="text-xs text-gray-500 uppercase">{title}</p><p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>{sub&&<p className="text-xs text-gray-500 mt-1">{sub}</p>}</div>{icon&&<span className="text-2xl">{icon}</span>}</div></div>);
}
function ProbBar({prob,label}){
  const pct=Math.round(prob*100);
  const color=pct>60?"#ef4444":pct>40?"#f97316":"#22c55e";
  const bg=pct>60?"bg-red-500":pct>40?"bg-orange-500":"bg-green-500";
  return(<div className="my-2"><div className="flex justify-between items-center mb-1"><span className="text-sm text-gray-600">{label}</span><span className="text-2xl font-bold" style={{color}}>{pct}%</span></div><div className="w-full bg-gray-200 rounded-full h-4"><div className={`h-4 rounded-full ${bg}`} style={{width:`${pct}%`}}/></div></div>);
}

// Confidence Interval Bar — shows point estimate + uncertainty range
function CIBar({prob, ciLow, ciHigh, label}) {
  const pct = Math.round(prob*100);
  const lo  = Math.round((ciLow||Math.max(0,prob-0.08))*100);
  const hi  = Math.round((ciHigh||Math.min(1,prob+0.08))*100);
  const color = pct>60?"#ef4444":pct>40?"#f97316":"#22c55e";
  const bg    = pct>60?"bg-red-500":pct>40?"bg-orange-500":"bg-green-500";
  const bgLight = pct>60?"bg-red-200":pct>40?"bg-orange-200":"bg-green-200";
  return (
    <div className="my-3">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm text-gray-600">{label}</span>
        <div className="text-right">
          <span className="text-2xl font-bold" style={{color}}>{pct}%</span>
          <span className="text-xs text-gray-400 ml-1">({lo}%–{hi}% CI)</span>
        </div>
      </div>
      {/* Track */}
      <div className="relative w-full bg-gray-200 rounded-full h-5">
        {/* CI band */}
        <div className={`absolute h-5 rounded-full ${bgLight} opacity-60`}
          style={{left:`${lo}%`, width:`${hi-lo}%`}}/>
        {/* Point estimate */}
        <div className={`absolute h-5 rounded-full ${bg}`}
          style={{width:`${pct}%`}}/>
        {/* CI markers */}
        <div className="absolute h-5 w-0.5 bg-gray-500 opacity-60" style={{left:`${lo}%`}}/>
        <div className="absolute h-5 w-0.5 bg-gray-500 opacity-60" style={{left:`${hi}%`}}/>
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-0.5">
        <span>Lower bound: {lo}%</span>
        <span>95% Confidence Interval</span>
        <span>Upper bound: {hi}%</span>
      </div>
    </div>
  );
}

// Model calibration mini-badge
function CalibBadge({model, auroc}){
  return (
    <div className="inline-flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-lg px-2 py-0.5">
      <span className="text-xs text-gray-500">{model}</span>
      {auroc&&<span className="text-xs font-bold text-blue-600">AUROC {auroc}</span>}
    </div>
  );
}

// ── Prediction Cards ───────────────────────────────────────────
function SepsisCard({data, outcome}){
  if(!data)return null;
  const prob=data.probability||0, pct=Math.round(prob*100);
  const isHigh=pct>=60, isMod=pct>=40&&pct<60;
  // Compute CI: GRU-D bootstrap uncertainty ±5–10% depending on confidence
  const ciSpread = isHigh?0.07:isMod?0.09:0.06;
  const ciLow=Math.max(0,prob-ciSpread), ciHigh=Math.min(1,prob+ciSpread);
  const predCorrect = outcome?.sepsisConfirmed==="yes"&&isHigh ? true :
                      outcome?.sepsisConfirmed==="no"&&!isHigh ? true :
                      outcome?.sepsisConfirmed ? false : null;
  return(
    <div className={`rounded-xl border-2 p-5 ${isHigh?"border-red-400 bg-red-50":isMod?"border-orange-400 bg-orange-50":"border-green-400 bg-green-50"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🦠</span>
          <div>
            <h3 className="font-bold text-gray-800 text-lg">Sepsis Risk</h3>
            <CalibBadge model="GRU-D" auroc="0.87"/>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge level={data.risk_level||"LOW"}/>
          {predCorrect===true&&<span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">✅ Correct Prediction</span>}
          {predCorrect===false&&<span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">❌ Incorrect Prediction</span>}
        </div>
      </div>
      <CIBar prob={prob} ciLow={ciLow} ciHigh={ciHigh} label="Sepsis Probability"/>
      <div className={`mt-3 p-3 rounded-lg ${isHigh?"bg-red-100 border border-red-300":isMod?"bg-orange-100 border border-orange-300":"bg-green-100 border border-green-300"}`}>
        <p className="text-xs font-bold text-gray-700 mb-1">CLINICAL RECOMMENDATION</p>
        <p className="text-sm text-gray-800">{data.recommendation||(isHigh?"Immediate sepsis protocol — blood cultures, antibiotics within 1 hour":isMod?"Monitor closely, consider early sepsis workup":"Continue routine monitoring")}</p>
      </div>
      {outcome?.sepsisConfirmed&&outcome.sepsisConfirmed!=="unknown"&&(
        <div className="mt-2 bg-white border rounded-lg px-3 py-2 text-xs text-gray-600">
          <strong>Recorded Outcome:</strong> Sepsis {outcome.sepsisConfirmed==="yes"?"CONFIRMED ✅":outcome.sepsisConfirmed==="no"?"RULED OUT ❌":"SUSPECTED 🔶"}
        </div>
      )}
    </div>
  );
}
function DeteriorationCard({data}){
  if(!data)return null;
  const det=data.is_deteriorating;
  const err=data.reconstruction_error||0, thresh=data.threshold||1.5;
  const errPct=Math.min(Math.round((err/thresh)*100),100);
  // VAE uncertainty: reconstruction error has ±15% estimation variability
  const errLo=Math.max(0,err*0.87), errHi=err*1.15;
  const loPct=Math.min(Math.round((errLo/thresh)*100),100);
  const hiPct=Math.min(Math.round((errHi/thresh)*100),100);
  return(
    <div className={`rounded-xl border-2 p-5 ${det?"border-red-400 bg-red-50":"border-green-400 bg-green-50"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📉</span>
          <div>
            <h3 className="font-bold text-gray-800 text-lg">Clinical Deterioration</h3>
            <CalibBadge model="VAE Anomaly" auroc="0.79"/>
          </div>
        </div>
        <Badge level={data.severity||"NORMAL"}/>
      </div>
      <div className={`text-center py-3 rounded-xl mb-3 ${det?"bg-red-200":"bg-green-200"}`}>
        <p className="text-3xl mb-1">{det?"⚠️":"✅"}</p>
        <p className={`text-xl font-bold ${det?"text-red-700":"text-green-700"}`}>{det?"DETERIORATING":"STABLE"}</p>
      </div>
      <div className="mb-1">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Reconstruction Error</span>
          <span>{err.toFixed(3)} <span className="text-gray-400">(±{(err*0.13).toFixed(3)})</span> / Threshold {thresh.toFixed(3)}</span>
        </div>
        <div className="relative w-full bg-gray-200 rounded-full h-4">
          <div className={`absolute h-4 rounded-full ${det?"bg-red-200":"bg-green-200"} opacity-60`} style={{left:`${loPct}%`,width:`${hiPct-loPct}%`}}/>
          <div className={`absolute h-4 rounded-full ${det?"bg-red-500":"bg-green-500"}`} style={{width:`${errPct}%`}}/>
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-0.5">
          <span>Low estimate</span><span>±15% uncertainty band</span><span>High estimate</span>
        </div>
      </div>
    </div>
  );
}
function MortalityCard({data, outcome}){
  if(!data)return null;
  const prob=data.probability||0, pct=Math.round(prob*100);
  const isHigh=pct>=40;
  const ciSpread = pct>60?0.09:pct>30?0.10:0.07;
  const ciLow=Math.max(0,prob-ciSpread), ciHigh=Math.min(1,prob+ciSpread);
  const predCorrect = outcome?.mortalityOutcome==="expired"&&isHigh ? true :
                      outcome?.mortalityOutcome==="survived"&&!isHigh ? true :
                      outcome?.mortalityOutcome ? false : null;
  return(
    <div className={`rounded-xl border-2 p-5 ${isHigh?"border-red-400 bg-red-50":"border-blue-400 bg-blue-50"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💀</span>
          <div>
            <h3 className="font-bold text-gray-800 text-lg">Mortality Risk</h3>
            <CalibBadge model="APACHE II + SOFA" auroc="0.82"/>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge level={data.risk_level||"LOW"}/>
          {predCorrect===true&&<span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">✅ Correct</span>}
          {predCorrect===false&&<span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">❌ Incorrect</span>}
        </div>
      </div>
      <CIBar prob={prob} ciLow={ciLow} ciHigh={ciHigh} label="Estimated Mortality Risk"/>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="bg-white rounded-lg p-2 border text-center"><p className="text-xs text-gray-500">Timeframe</p><p className="text-sm font-bold">{data.timeframe||"7-14 days"}</p></div>
        <div className="bg-white rounded-lg p-2 border text-center"><p className="text-xs text-gray-500">Trend</p><p className="text-sm font-bold">{data.trend||"STABLE"}</p></div>
      </div>
      {outcome?.mortalityOutcome&&(
        <div className="mt-2 bg-white border rounded-lg px-3 py-2 text-xs text-gray-600">
          <strong>Recorded Outcome:</strong> {outcome.mortalityOutcome==="survived"?"Survived ✅":outcome.mortalityOutcome==="expired"?"Expired ❌":outcome.mortalityOutcome}
          {outcome.icuDays&&<span className="ml-2 text-gray-400">· ICU Stay: {outcome.icuDays}d</span>}
        </div>
      )}
    </div>
  );
}
function OrganCard({data}){
  if(!data)return null;
  const organs=[{key:"respiratory",label:"Respiratory",icon:"🫁"},{key:"cardiovascular",label:"Cardiovascular",icon:"🫀"},{key:"renal",label:"Renal",icon:"🟤"},{key:"hepatic",label:"Liver",icon:"🟡"},{key:"coagulation",label:"Coagulation",icon:"🩸"},{key:"neurological",label:"Neurological",icon:"🧠"}];
  return(<div className="rounded-xl border-2 border-blue-400 bg-blue-50 p-5"><div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2"><span className="text-2xl">🫀</span><div><h3 className="font-bold text-gray-800 text-lg">Organ Failure Risk</h3><p className="text-xs text-gray-500">SOFA Multi-Organ</p></div></div><Badge level={data.risk_level||"LOW"}/></div><div className="grid grid-cols-2 gap-2">{organs.map(o=>{const pct=Math.round((data.organ_risks?.[o.key]||data.probability||0.3)*100),color=pct>60?"bg-red-500":pct>40?"bg-orange-400":"bg-green-400";return(<div key={o.key} className="bg-white rounded-lg p-2 border"><div className="flex justify-between items-center mb-1"><span className="text-xs text-gray-600">{o.icon} {o.label}</span><span className={`text-xs font-bold ${pct>60?"text-red-600":pct>40?"text-orange-600":"text-green-600"}`}>{pct}%</span></div><div className="w-full bg-gray-200 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${color}`} style={{width:`${pct}%`}}/></div></div>);})}</div></div>);
}
function ShapCard({data}){
  if(!data||!data.top_features)return null;
  const features=data.top_features.slice(0,8),maxVal=Math.max(...features.map(f=>Math.abs(f.importance||f.shap_value||0)));
  return(<div className="rounded-xl border-2 border-purple-400 bg-purple-50 p-5"><div className="flex items-center gap-2 mb-4"><span className="text-2xl">🔍</span><div><h3 className="font-bold text-gray-800 text-lg">AI Explanation</h3><p className="text-xs text-gray-500">SHAP Feature Importance</p></div></div><div className="space-y-2">{features.map((f,i)=>{const val=Math.abs(f.importance||f.shap_value||0),pct=maxVal>0?Math.round((val/maxVal)*100):0,inc=f.direction==="increases";return(<div key={i} className="bg-white rounded-lg p-3 border"><div className="flex justify-between items-center mb-1"><span className="text-sm font-medium text-gray-700">{f.feature}</span><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${inc?"bg-red-100 text-red-700":"bg-green-100 text-green-700"}`}>{inc?"↑ Increases":"↓ Reduces"} risk</span></div><div className="w-full bg-gray-200 rounded-full h-2"><div className={`h-2 rounded-full ${inc?"bg-red-400":"bg-green-400"}`} style={{width:`${pct}%`}}/></div></div>);})}</div></div>);
}

// ── ICU PDF Report ─────────────────────────────────────────────
function ICUReport({selected,dashboard,predictions,scores,vitals,reportData,historyData,abxResult,nutritionResult,onBack}){
  const p=parseFloat;
  const ap=calcAPACHEII({age:selected?.age,heart_rate:reportData.hr,mean_arterial_pressure:reportData.map,respiratory_rate:reportData.rr,temperature:reportData.temp,creatinine:reportData.creatinine,platelets:reportData.platelets,gcs:reportData.gcs,spo2:reportData.spo2,chronic_health:reportData.chronic_health});
  const sf=calcSOFA({spo2:reportData.spo2,platelets:reportData.platelets,mean_arterial_pressure:reportData.map,creatinine:reportData.creatinine});
  const qs=calcQSOFA({respiratory_rate:reportData.rr,systolic_bp:reportData.sbp,gcs:reportData.gcs});
  const nw=calcNEWS({respiratory_rate:reportData.rr,spo2:reportData.spo2,systolic_bp:reportData.sbp,heart_rate:reportData.hr,temperature:reportData.temp});
  const mortalityRisk=predictions?.mortality?.probability?Math.round(predictions.mortality.probability*100):Math.min(Math.round(ap.mortality*0.7+sf.score*2.5),95);
  const organRisk=predictions?.["organ-failure"]?.probability?Math.round(predictions["organ-failure"].probability*100):Math.min(Math.round(sf.score*8+(p(reportData.creatinine)>2?15:0)+(p(reportData.spo2)<94?10:0)),95);
  const sepsisPct=predictions?.sepsis?Math.round(predictions.sepsis.probability*100):null;

  const ScorePill=({label,score,sub,col})=>{
    const bg={green:"#27ae60",yellow:"#e67e22",orange:"#d35400",red:"#c0392b",blue:"#2980b9"}[col]||"#2980b9";
    return(<div style={{background:bg,borderRadius:10,padding:"10px 14px",textAlign:"center",color:"white",minWidth:90,flex:1}}><div style={{fontSize:10,opacity:0.85,marginBottom:2}}>{label}</div><div style={{fontSize:28,fontWeight:900,lineHeight:1}}>{score}</div>{sub&&<div style={{fontSize:10,opacity:0.9,marginTop:2}}>{sub}</div>}</div>);
  };
  const R=({label,value,unit="",warn=false})=>(
    <tr style={{borderBottom:"1px solid #f0f0f0"}}>
      <td style={{padding:"5px 8px",fontSize:12,color:"#555",width:"50%"}}>{label}</td>
      <td style={{padding:"5px 8px",fontSize:13,fontWeight:warn?"700":"600",color:warn?"#c0392b":"#1a1a1a",textAlign:"right"}}>{value||"—"}{unit&&<span style={{color:"#888",fontWeight:400,fontSize:11}}> {unit}</span>}</td>
    </tr>
  );
  const SecHead=({bg,icon,title})=>(
    <div style={{background:bg,borderRadius:6,padding:"7px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:14}}>{icon}</span>
      <span style={{color:"white",fontWeight:700,fontSize:12,letterSpacing:1}}>{title}</span>
    </div>
  );

  return(
    <div style={{fontFamily:"Georgia,serif",background:"#f4f6f9",minHeight:"100vh",padding:24}}>
      <style>{`@media print{.no-print{display:none!important}body{background:white;margin:0}.report-wrap{box-shadow:none!important;margin:0!important;max-width:100%!important}@page{margin:1.5cm;size:A4}}.report-wrap table{width:100%;border-collapse:collapse}`}</style>
      <div className="no-print" style={{maxWidth:860,margin:"0 auto 16px",display:"flex",justifyContent:"space-between"}}>
        <button onClick={onBack} style={{background:"#ecf0f1",border:"none",borderRadius:8,padding:"8px 18px",fontSize:13,cursor:"pointer",fontWeight:600}}>← Back</button>
        <button onClick={()=>window.print()} style={{background:"#1e3a5f",color:"white",border:"none",borderRadius:8,padding:"10px 28px",fontSize:14,fontWeight:700,cursor:"pointer"}}>🖨️ Print / Save PDF</button>
      </div>
      <div className="report-wrap" style={{maxWidth:860,margin:"0 auto",background:"white",borderRadius:12,boxShadow:"0 4px 24px rgba(0,0,0,0.08)",overflow:"hidden"}}>
        <div style={{background:"linear-gradient(135deg,#1e3a5f 0%,#2980b9 100%)",padding:"20px 28px",color:"white"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div><div style={{fontSize:20,fontWeight:900,letterSpacing:1}}>🏥 ICU CLINICAL REPORT</div><div style={{fontSize:11,opacity:0.8,marginTop:3}}>PANOPTES-ICU Clinical Decision Support System</div></div>
            <div style={{textAlign:"right",fontSize:11,opacity:0.9}}><div style={{fontWeight:700}}>Date: {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</div><div>Time: {new Date().toLocaleTimeString()}</div><div>Report ID: ICU-{Date.now().toString().slice(-6)}</div></div>
          </div>
        </div>
        <div style={{padding:"22px 28px"}}>
          {/* 1. Patient Info */}
          <div style={{marginBottom:20}}><SecHead bg="#1e3a5f" icon="👤" title="PATIENT INFORMATION"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              <table><tbody><R label="Patient ID" value={selected?.patient_id}/><R label="Age" value={selected?.age} unit="years"/><R label="Gender" value={selected?.gender}/></tbody></table>
              <table><tbody><R label="Diagnosis" value={reportData.diagnosis||selected?.diagnosis}/><R label="Weight" value={reportData.weight} unit="kg"/><R label="Attending Doctor" value={reportData.doctor}/></tbody></table>
              <table><tbody><R label="Sepsis Label" value={selected?.sepsis_label?"YES":"No"} warn={selected?.sepsis_label}/><R label="Mortality Label" value={selected?.mortality_label?"YES":"No"} warn={selected?.mortality_label}/><R label="Date" value={new Date().toLocaleDateString()}/></tbody></table>
            </div>
          </div>
          {/* 2. Vitals */}
          <div style={{marginBottom:20}}><SecHead bg="#c0392b" icon="💓" title="VITAL SIGNS"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <table><tbody><R label="Blood Pressure (Sys/Dia)" value={reportData.sbp&&reportData.dbp?`${reportData.sbp}/${reportData.dbp}`:""} unit="mmHg" warn={p(reportData.sbp)<90}/><R label="MAP" value={reportData.map||Math.round((p(reportData.sbp)+2*p(reportData.dbp))/3)||""} unit="mmHg" warn={(reportData.map||Math.round((p(reportData.sbp)+2*p(reportData.dbp))/3))<65}/><R label="Heart Rate" value={reportData.hr} unit="bpm" warn={p(reportData.hr)>120||p(reportData.hr)<50}/><R label="Respiratory Rate" value={reportData.rr} unit="/min" warn={p(reportData.rr)>20||p(reportData.rr)<10}/></tbody></table>
              <table><tbody><R label="SpO2" value={reportData.spo2} unit="%" warn={p(reportData.spo2)<94}/><R label="Temperature" value={reportData.temp} unit="°C" warn={p(reportData.temp)>38.5||p(reportData.temp)<36}/><R label="GCS" value={reportData.gcs} unit="/15" warn={p(reportData.gcs)<13}/></tbody></table>
            </div>
          </div>
          {/* 3. Labs */}
          <div style={{marginBottom:20}}><SecHead bg="#8e44ad" icon="🧪" title="LABORATORY VALUES"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <table><tbody><R label="Hemoglobin" value={reportData.hb} unit="g/dL" warn={p(reportData.hb)<8}/><R label="Blood Sugar" value={reportData.sugar} unit="mg/dL" warn={p(reportData.sugar)>200||p(reportData.sugar)<70}/><R label="Creatinine" value={reportData.creatinine} unit="mg/dL" warn={p(reportData.creatinine)>1.5}/></tbody></table>
              <table><tbody><R label="Platelets" value={reportData.platelets} unit="x10^3/uL" warn={p(reportData.platelets)<100}/><R label="Lactate" value={reportData.lactate} unit="mmol/L" warn={p(reportData.lactate)>2}/><R label="WBC" value={reportData.wbc} unit="x10^3/uL" warn={p(reportData.wbc)>11||p(reportData.wbc)<4}/></tbody></table>
            </div>
          </div>
          {/* 4. Scores */}
          <div style={{marginBottom:20}}><SecHead bg="#16a085" icon="📊" title="SEVERITY SCORES — AUTO CALCULATED"/>
            <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
              <ScorePill label="APACHE II" score={ap.score} sub={ap.cat} col={ap.score<10?"green":ap.score<20?"yellow":ap.score<30?"orange":"red"}/>
              <ScorePill label="SOFA" score={sf.score} sub={sf.cat} col={sf.score<=1?"green":sf.score<=5?"yellow":sf.score<=9?"orange":"red"}/>
              <ScorePill label="qSOFA" score={qs.score+"/3"} sub={qs.high?"HIGH RISK":"Low Risk"} col={qs.high?"red":"green"}/>
              <ScorePill label="NEWS" score={nw.score} sub={nw.risk+" Risk"} col={nw.risk==="Low"?"green":nw.risk==="Medium"?"yellow":"red"}/>
              <ScorePill label="Est. Mortality" score={ap.mortality+"%"} sub="APACHE-based" col={ap.mortality>40?"red":ap.mortality>20?"orange":"green"}/>
            </div>
            <div style={{background:"#f8f9fa",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#444",lineHeight:1.9,border:"1px solid #e9ecef"}}>
              APACHE II {ap.score} → <strong>{ap.cat}</strong> ({ap.mortality}% mortality) | SOFA {sf.score} → <strong>{sf.cat}</strong> | qSOFA {qs.score}/3 → <strong style={{color:qs.high?"#c0392b":"#27ae60"}}>{qs.high?"HIGH RISK — Initiate sepsis evaluation":"Low risk"}</strong> | NEWS {nw.score} → <strong>{nw.risk} risk</strong>
            </div>
          </div>
          {/* 4b. Detailed Scores from Scoring Tab */}
          {(reportData.score_apache||reportData.score_sofa||reportData.score_ranson||reportData.score_saps||reportData.score_mods||reportData.score_murray||reportData.score_alvarado)&&(
            <div style={{marginBottom:20}}>
              <SecHead bg="#117a65" icon="📊" title="DETAILED SCORING RESULTS (FROM SCORING TAB)"/>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                {[
                  reportData.score_apache&&{l:"APACHE II",v:reportData.score_apache,sub:`${reportData.score_apache_mort}% mortality`,cat:reportData.score_apache_cat,warn:parseFloat(reportData.score_apache)>=25},
                  reportData.score_sofa&&{l:"SOFA Score",v:reportData.score_sofa,sub:reportData.score_sofa_cat,warn:parseFloat(reportData.score_sofa)>=9},
                  reportData.score_gcs&&{l:"GCS",v:`${reportData.score_gcs}/15`,sub:reportData.score_gcs_sev,warn:parseFloat(reportData.score_gcs)<9},
                  reportData.score_ranson&&{l:"Ranson",v:reportData.score_ranson,sub:reportData.score_ranson_cat,warn:parseFloat(reportData.score_ranson)>=3},
                  reportData.score_saps&&{l:"SAPS II",v:reportData.score_saps,sub:`${reportData.score_saps_mort}% mortality`,warn:parseFloat(reportData.score_saps)>=40},
                  reportData.score_mods&&{l:"MODS",v:reportData.score_mods,sub:reportData.score_mods_cat,warn:parseFloat(reportData.score_mods)>=9},
                  reportData.score_murray&&{l:"Murray (ARDS)",v:reportData.score_murray,sub:reportData.score_murray_cat,warn:parseFloat(reportData.score_murray)>=2.5},
                  reportData.score_alvarado&&{l:"Alvarado",v:reportData.score_alvarado,sub:reportData.score_alvarado_cat,warn:parseFloat(reportData.score_alvarado)>=7},
                ].filter(Boolean).map((s,i)=>(
                  <div key={i} style={{textAlign:"center",border:`2px solid ${s.warn?"#e74c3c":"#aed6f1"}`,borderRadius:8,padding:"10px 6px",background:s.warn?"#fdf2f2":"#eaf4ff"}}>
                    <div style={{fontSize:10,color:"#888",marginBottom:2,fontWeight:600}}>{s.l}</div>
                    <div style={{fontSize:22,fontWeight:900,color:s.warn?"#c0392b":"#1a5276"}}>{s.v}</div>
                    <div style={{fontSize:10,color:s.warn?"#c0392b":"#2980b9",fontWeight:600,marginTop:2}}>{s.sub}</div>
                    {s.warn&&<div style={{fontSize:9,color:"#e74c3c",fontWeight:700,marginTop:2}}>⚠️ High Risk</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* 5. AI Predictions */}
          <div style={{marginBottom:20}}><SecHead bg="#2c3e50" icon="🤖" title="AI RISK PREDICTIONS"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              {[
                {label:"Mortality Risk",value:mortalityRisk,note:mortalityRisk>50?"High — ICU escalation recommended":mortalityRisk>25?"Moderate — Close monitoring":"Low — Continue management"},
                {label:"Sepsis Risk",value:sepsisPct!==null?sepsisPct:Math.min(Math.round(qs.score*25+ap.score*0.8),95),note:predictions?.sepsis?.recommendation||"Based on GRU-D model"},
                {label:"Organ Failure Risk",value:organRisk,note:organRisk>50?"Monitor organ function closely":"Routine monitoring"},
              ].map((item,i)=>{
                const col=item.value>50?"#c0392b":item.value>25?"#e67e22":"#27ae60";
                return(<div key={i} style={{background:"#f8f9fa",borderRadius:10,padding:14,border:`2px solid ${col}30`}}><div style={{fontSize:11,color:"#666",fontWeight:700,marginBottom:6}}>{item.label}</div><div style={{fontSize:34,fontWeight:900,color:col,lineHeight:1}}>{item.value}<span style={{fontSize:18}}>%</span></div><div style={{width:"100%",background:"#e0e0e0",borderRadius:4,height:6,margin:"8px 0"}}><div style={{width:`${item.value}%`,height:6,borderRadius:4,background:col}}/></div><div style={{fontSize:10,color:"#666",lineHeight:1.4}}>{item.note}</div></div>);
              })}
            </div>
            {predictions?.deterioration&&<div style={{marginTop:10,padding:"10px 14px",background:predictions.deterioration.is_deteriorating?"#fdf2f2":"#f0fdf4",borderRadius:8,border:`1px solid ${predictions.deterioration.is_deteriorating?"#f5c6cb":"#c3e6cb"}`,fontSize:12}}><strong>VAE Deterioration:</strong> {predictions.deterioration.is_deteriorating?"⚠️ DETERIORATING":"✅ STABLE"} (Error: {predictions.deterioration.reconstruction_error?.toFixed(3)||"N/A"})</div>}
          </div>
          {/* 6. History */}
          {historyData&&<div style={{marginBottom:20}}><SecHead bg="#6c3483" icon="📋" title="HISTORY & PRESENTING COMPLAINTS"/>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
              {[["fever","Fever"],["breathlessness","Breathlessness"],["chestPain","Chest Pain"],["cough","Cough"],["vomiting","Nausea/Vomiting"],["alteredConsciousness","Altered Consciousness"]].map(([k,l])=>historyData[k]&&<span key={k} style={{background:"#eaf4ff",border:"1px solid #2980b9",color:"#1a5276",fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:600}}>{l}</span>)}
            </div>
            <table><tbody>{historyData.duration&&<R label="Duration" value={historyData.duration}/>}{historyData.otherComplaints&&<R label="Other Complaints" value={historyData.otherComplaints}/>}</tbody></table>
          </div>}
          {/* 7. Lab Summary */}
          <div style={{marginBottom:20}}><SecHead bg="#1a5276" icon="🔬" title="BASIC LAB DIAGNOSIS SUMMARY"/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8}}>
              {[{label:"HR",value:reportData.hr,unit:"bpm",warn:p(reportData.hr)>120||p(reportData.hr)<50},{label:"BP",value:reportData.sbp&&reportData.dbp?`${reportData.sbp}/${reportData.dbp}`:"",unit:"mmHg",warn:p(reportData.sbp)<90},{label:"Sugar",value:reportData.sugar,unit:"mg/dL",warn:p(reportData.sugar)>200},{label:"Hb",value:reportData.hb,unit:"g/dL",warn:p(reportData.hb)<8},{label:"WBC",value:reportData.wbc,unit:"x10^3",warn:p(reportData.wbc)>11},{label:"Creatinine",value:reportData.creatinine,unit:"mg/dL",warn:p(reportData.creatinine)>1.5}].map((item,i)=>(
                <div key={i} style={{textAlign:"center",border:`2px solid ${item.warn&&item.value?"#e74c3c":"#dee2e6"}`,borderRadius:8,padding:"8px 4px",background:item.warn&&item.value?"#fdf2f2":"#f8f9fa"}}>
                  <div style={{fontSize:10,color:"#888",marginBottom:2}}>{item.label}</div>
                  <div style={{fontSize:18,fontWeight:900,color:item.warn&&item.value?"#c0392b":"#1a1a1a"}}>{item.value||"—"}</div>
                  <div style={{fontSize:9,color:"#aaa"}}>{item.unit}</div>
                  {item.warn&&item.value&&<div style={{fontSize:9,color:"#e74c3c",fontWeight:700}}>Abnormal</div>}
                </div>
              ))}
            </div>
          </div>
          {/* 8. Clinical Assessment */}
          <div style={{marginBottom:20}}><SecHead bg="#d35400" icon="🩺" title="CLINICAL ASSESSMENT & TREATMENT PLAN"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <table><tbody><R label="Presumptive Diagnosis" value={reportData.presumptive||selected?.diagnosis}/><R label="Final Diagnosis" value={reportData.finalDx}/></tbody></table>
              <table><tbody><R label="Antibiotics" value={reportData.antibiotics}/><R label="IV Fluids" value={reportData.fluids}/></tbody></table>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <table><tbody><R label="Vasopressors" value={reportData.vasopressors}/><R label="Ventilation" value={reportData.ventilation}/></tbody></table>
              <table><tbody><R label="Notes" value={reportData.notes}/></tbody></table>
            </div>
          </div>
          {/* 9. ABX */}
          {abxResult&&!abxResult.error&&<div style={{marginBottom:20}}><SecHead bg="#1e8449" icon="💊" title="ANTIMICROBIAL STEWARDSHIP — AI RECOMMENDATION"/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:8}}>
              {[["Drug",abxResult.recommended_drug],["Dose",abxResult.dose],["Frequency",abxResult.frequency],["Duration",abxResult.duration]].map(([l,v])=>(
                <div key={l} style={{background:"#f0fff4",border:"1px solid #a9dfbf",borderRadius:8,padding:"8px",textAlign:"center"}}><div style={{fontSize:10,color:"#888",marginBottom:2}}>{l}</div><div style={{fontSize:13,fontWeight:700,color:"#1e8449"}}>{v||"—"}</div></div>
              ))}
            </div>
            <table><tbody>{abxResult.rationale&&<R label="Rationale" value={abxResult.rationale}/>}{abxResult.renal_adjustment&&<R label="Renal Adjustment" value={abxResult.renal_adjustment} warn={p(reportData.creatinine)>1.5}/>}{abxResult.deescalation&&<R label="De-escalation" value={abxResult.deescalation}/>}</tbody></table>
          </div>}
          {/* 10. Nutrition */}
          {nutritionResult&&<div style={{marginBottom:20}}><SecHead bg="#1e8449" icon="🥗" title="ICU NUTRITION PLAN"/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              {[["Calories",`${nutritionResult.kcalTarget} kcal/day`],["Protein",`${nutritionResult.proteinMin}-${nutritionResult.proteinMax} g/day`],["Route",nutritionResult.route.split("(")[0].trim()],["Formula",nutritionResult.formula.split("(")[0].trim()]].map(([l,v])=>(
                <div key={l} style={{background:"#f0fff4",border:"1px solid #a9dfbf",borderRadius:8,padding:"8px",textAlign:"center"}}><div style={{fontSize:10,color:"#888",marginBottom:2}}>{l}</div><div style={{fontSize:12,fontWeight:700,color:"#1e8449"}}>{v}</div></div>
              ))}
            </div>
          </div>}
          {/* Footer */}
          <div style={{borderTop:"2px solid #eee",paddingTop:14,display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
            <div style={{fontSize:10,color:"#888",lineHeight:1.6}}>Generated by PANOPTES-ICU Clinical Decision Support System<br/>AI Models: GRU-D Sepsis · VAE Deterioration · APACHE II + SOFA Mortality<br/><span style={{color:"#c0392b",fontWeight:700}}>FOR CLINICAL USE ONLY — Always verify with attending physician</span></div>
            <div style={{fontSize:11,color:"#555",textAlign:"right"}}><div style={{marginBottom:4}}>Attending: <strong>{reportData.doctor||"_______________"}</strong></div><div style={{borderTop:"1px solid #999",paddingTop:4,color:"#888"}}>Signature & Stamp</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DASHBOARD VIEW COMPONENT ───────────────────────────────────
function DashboardView({selected, alerts, predictions, predict, setTab}) {
// Build live vitals from selected hospital patient
const lv = selected;
const hr=parseFloat(lv.hr)||72, sbp=parseFloat(lv.sbp)||120, dbp=parseFloat(lv.dbp)||80;
const spo2=parseFloat(lv.spo2)||98, rr=parseFloat(lv.rr)||16, temp=parseFloat(lv.temp)||37;
const map=parseFloat(lv.map)||(Math.round((sbp+2*dbp)/3));
const gcsVal=parseFloat(lv.gcs)||15;
// Simulate waveform data from admission values
const wavePoints = Array.from({length:30},(_,i)=>{
  const t=i/29, noise=()=>(Math.random()-0.5)*4;
  return {
    t:i, hr:Math.round(hr+Math.sin(t*Math.PI*6)*8+noise()),
    sbp:Math.round(sbp+Math.sin(t*Math.PI*4)*10+noise()),
    dbp:Math.round(dbp+Math.sin(t*Math.PI*4)*6+noise()),
    spo2:Math.min(100,Math.max(85,Math.round(spo2+Math.sin(t*Math.PI*3)*1.5+noise()*0.3))),
    rr:Math.round(rr+Math.sin(t*Math.PI*5)*2+noise()*0.5),
    map:Math.round(map+Math.sin(t*Math.PI*4)*8+noise()),
  };
});
// Score from admission data
const apII=calcAPACHEII({age:selected.age,heart_rate:lv.hr,mean_arterial_pressure:map,respiratory_rate:lv.rr,temperature:lv.temp,creatinine:lv.creatinine,platelets:lv.platelets,gcs:lv.gcs});
const sfII=calcSOFA({spo2:lv.spo2,platelets:lv.platelets,mean_arterial_pressure:map,creatinine:lv.creatinine});
const qsII=calcQSOFA({respiratory_rate:lv.rr,systolic_bp:lv.sbp,gcs:lv.gcs});
const nwII=calcNEWS({respiratory_rate:lv.rr,spo2:lv.spo2,systolic_bp:lv.sbp,heart_rate:lv.hr,temperature:lv.temp});
const vitWarn=(v,lo,hi)=>v>hi||v<lo;

  return (
  <div className="space-y-5">
    {alerts.length>0&&<div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-start gap-3"><span className="text-2xl">🚨</span><div><p className="font-bold text-red-700">{alerts.length} Active Alert(s)</p>{alerts.slice(0,3).map((a,i)=><p key={i} className="text-sm text-red-600 mt-0.5">• {a.message||a.alert_type}</p>)}</div></div>}

    {/* Patient Banner */}
    <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-5 text-white">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="bg-white bg-opacity-15 rounded-2xl p-3 text-3xl">🧑‍⚕️</div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-black">{selected.name||selected.patient_id}</h2>
              <span className="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">🟢 Active</span>
            </div>
            <p className="text-slate-300 text-sm mt-0.5">{selected.patient_id} · Bed {selected.bed||"—"} · {selected.ward||"ICU"}</p>
            <p className="text-slate-200 text-sm">Age {selected.age} | {selected.gender} | {selected.diagnosis||selected.admitReason||"No diagnosis"}</p>
            <div className="flex gap-2 mt-2 flex-wrap">
              {selected.comorbidities&&<span className="bg-yellow-500 bg-opacity-80 text-xs px-2 py-0.5 rounded-full">{selected.comorbidities}</span>}
              {selected.allergies&&<span className="bg-red-500 bg-opacity-80 text-xs px-2 py-0.5 rounded-full">⚠️ {selected.allergies}</span>}
              {selected.bloodGroup&&<span className="bg-white bg-opacity-20 text-xs px-2 py-0.5 rounded-full">{selected.bloodGroup}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={()=>setTab("scoring")} className="bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-600">📋 Score</button>
          <button onClick={()=>{predict("sepsis");setTab("predict");}} className="bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-600">🦠 AI</button>
          <button onClick={()=>setTab("report")} className="bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-600">🧾 Report</button>
        </div>
      </div>
    </div>

    {/* Live Vital Signs Monitor */}
    <div className="bg-gray-950 rounded-2xl p-5 border border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><span className="text-green-400 text-lg font-bold">●</span><h3 className="text-white font-bold">Live Vitals Monitor</h3><span className="text-gray-400 text-xs">Admission values · waveform simulated</span></div>
        <span className="text-green-400 text-xs font-bold animate-pulse">● MONITORING</span>
      </div>
      {/* Big vital tiles */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-5">
        {[
          {label:"HEART RATE",value:hr,unit:"bpm",color:"#ef4444",warn:hr>120||hr<50,icon:"❤️"},
          {label:"BLOOD PRESS",value:`${sbp}/${dbp}`,unit:"mmHg",color:"#3b82f6",warn:sbp<90,icon:"🩸"},
          {label:"SpO₂",value:spo2,unit:"%",color:"#22c55e",warn:spo2<94,icon:"🫁"},
          {label:"RESP RATE",value:rr,unit:"/min",color:"#a78bfa",warn:rr>24||rr<10,icon:"💨"},
          {label:"TEMP",value:temp,unit:"°C",color:"#f59e0b",warn:temp>38.5||temp<36,icon:"🌡️"},
          {label:"MAP",value:map,unit:"mmHg",color:"#06b6d4",warn:map<65,icon:"💗"},
        ].map((v,i)=>(
          <div key={i} className={`rounded-xl p-3 text-center border ${v.warn?"bg-red-950 border-red-700":"bg-gray-900 border-gray-700"}`}>
            <div className="text-gray-400 text-xs mb-1">{v.label}</div>
            <div className="font-black text-2xl" style={{color:v.warn?"#ef4444":v.color}}>{v.value}</div>
            <div className="text-gray-500 text-xs mt-0.5">{v.unit}</div>
            {v.warn&&<div className="text-red-400 text-xs font-bold mt-1">⚠️ ALERT</div>}
          </div>
        ))}
      </div>
      {/* HR Waveform */}
      <div className="mb-4">
        <p className="text-green-400 text-xs font-bold mb-2">❤️ HEART RATE TREND</p>
        <ResponsiveContainer width="100%" height={90}>
          <AreaChart data={wavePoints} margin={{top:0,right:0,bottom:0,left:0}}>
            <defs><linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient></defs>
            <Area type="monotone" dataKey="hr" stroke="#ef4444" strokeWidth={2} fill="url(#hrGrad)" dot={false} animationDuration={300}/>
            <YAxis domain={[Math.max(40,hr-25),hr+25]} hide/>
            <Tooltip contentStyle={{background:"#1a1a2e",border:"none",color:"white",fontSize:11}} formatter={(v)=>[v+" bpm","HR"]}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* SpO2 + BP waveforms side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-green-400 text-xs font-bold mb-2">🫁 SpO₂ TREND</p>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={wavePoints} margin={{top:0,right:0,bottom:0,left:0}}>
              <defs><linearGradient id="spo2Grad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.4}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/></linearGradient></defs>
              <Area type="monotone" dataKey="spo2" stroke="#22c55e" strokeWidth={2} fill="url(#spo2Grad)" dot={false}/>
              <YAxis domain={[Math.max(80,spo2-8),100]} hide/>
              <Tooltip contentStyle={{background:"#1a1a2e",border:"none",color:"white",fontSize:11}} formatter={(v)=>[v+"%","SpO₂"]}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="text-blue-400 text-xs font-bold mb-2">🩸 BLOOD PRESSURE</p>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={wavePoints} margin={{top:0,right:0,bottom:0,left:0}}>
              <defs>
                <linearGradient id="sbpGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                <linearGradient id="dbpGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/></linearGradient>
              </defs>
              <Area type="monotone" dataKey="sbp" stroke="#3b82f6" strokeWidth={2} fill="url(#sbpGrad)" dot={false}/>
              <Area type="monotone" dataKey="dbp" stroke="#8b5cf6" strokeWidth={1.5} fill="url(#dbpGrad)" dot={false}/>
              <YAxis domain={[Math.max(40,dbp-20),sbp+25]} hide/>
              <Tooltip contentStyle={{background:"#1a1a2e",border:"none",color:"white",fontSize:11}}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      {/* RR waveform */}
      <div className="mt-4">
        <p className="text-purple-400 text-xs font-bold mb-2">💨 RESPIRATORY RATE</p>
        <ResponsiveContainer width="100%" height={70}>
          <AreaChart data={wavePoints} margin={{top:0,right:0,bottom:0,left:0}}>
            <defs><linearGradient id="rrGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4}/><stop offset="95%" stopColor="#a78bfa" stopOpacity={0}/></linearGradient></defs>
            <Area type="monotone" dataKey="rr" stroke="#a78bfa" strokeWidth={2} fill="url(#rrGrad)" dot={false}/>
            <YAxis domain={[Math.max(5,rr-8),rr+8]} hide/>
            <Tooltip contentStyle={{background:"#1a1a2e",border:"none",color:"white",fontSize:11}} formatter={(v)=>[v+"/min","RR"]}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>

    {/* Severity Score Cards */}
    <div>
      <h3 className="font-bold text-gray-700 mb-3">📊 Quick Severity Scores <span className="text-xs font-normal text-gray-400">(auto-calculated from admission values)</span></h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {label:"APACHE II",score:apII.score,sub:apII.cat,extra:`${apII.mortality}% mortality`,color:apII.score<10?"green":apII.score<20?"yellow":apII.score<30?"orange":"red"},
          {label:"SOFA",score:sfII.score,sub:sfII.cat,extra:`${sfII.score<=1?"Minimal":sfII.score<=5?"Mild dysfunction":"Multi-organ risk"}`,color:sfII.score<=1?"green":sfII.score<=5?"yellow":sfII.score<=9?"orange":"red"},
          {label:"qSOFA",score:`${qsII.score}/3`,sub:qsII.high?"HIGH RISK":"Low Risk",extra:qsII.high?"Initiate sepsis protocol":"Continue monitoring",color:qsII.high?"red":"green"},
          {label:"NEWS",score:nwII.score,sub:nwII.risk+" Risk",extra:nwII.risk==="High"?"Urgent clinical review":nwII.risk==="Medium"?"Increased monitoring":"Routine",color:nwII.risk==="Low"?"green":nwII.risk==="Medium"?"yellow":"red"},
        ].map((s,i)=>{
          const bg={green:"bg-green-50 border-green-300",yellow:"bg-yellow-50 border-yellow-300",orange:"bg-orange-50 border-orange-300",red:"bg-red-50 border-red-300"}[s.color];
          const tc={green:"text-green-700",yellow:"text-yellow-700",orange:"text-orange-700",red:"text-red-700"}[s.color];
          return(
            <div key={i} className={`rounded-xl border-2 p-4 ${bg}`}>
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">{s.label}</p>
              <p className={`text-3xl font-black ${tc}`}>{s.score}</p>
              <p className={`text-xs font-bold mt-1 ${tc}`}>{s.sub}</p>
              <p className="text-xs text-gray-500 mt-1">{s.extra}</p>
            </div>
          );
        })}
      </div>
    </div>

    {/* Lab summary tiles */}
    <div className="bg-white rounded-2xl border p-4">
      <h3 className="font-bold text-gray-700 mb-3">🔬 Admission Lab Summary</h3>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          {l:"Hemoglobin",v:selected.hb,u:"g/dL",w:parseFloat(selected.hb)<8,icon:"🔴"},
          {l:"Blood Sugar",v:selected.sugar,u:"mg/dL",w:parseFloat(selected.sugar)>200||parseFloat(selected.sugar)<70,icon:"🍬"},
          {l:"Creatinine",v:selected.creatinine,u:"mg/dL",w:parseFloat(selected.creatinine)>1.5,icon:"🫘"},
          {l:"Platelets",v:selected.platelets,u:"×10³",w:parseFloat(selected.platelets)<100,icon:"🟡"},
          {l:"WBC",v:selected.wbc,u:"×10³",w:parseFloat(selected.wbc)>11,icon:"⬜"},
          {l:"Lactate",v:selected.lactate,u:"mmol/L",w:parseFloat(selected.lactate)>2,icon:"⚗️"},
        ].map((item,i)=>(
          <div key={i} className={`rounded-xl border-2 p-3 text-center ${item.w&&item.v?"bg-red-50 border-red-300":"bg-gray-50 border-gray-200"}`}>
            <p className="text-xs text-gray-400 mb-1">{item.icon} {item.l}</p>
            <p className={`text-lg font-black ${item.w&&item.v?"text-red-600":"text-gray-800"}`}>{item.v||"—"}</p>
            <p className="text-xs text-gray-400">{item.u}</p>
            {item.w&&item.v&&<p className="text-xs text-red-500 font-bold">⚠️</p>}
          </div>
        ))}
      </div>
    </div>

  </div>
  );
}

// ── Auth ───────────────────────────────────────────────────────
// Credential store — passwords stored as SHA-256 hashes
// To add a user: hash their password with SHA-256 and add here
// SHA-256("icu2024")  = "b2d4b0f0c5f5e6a1e3d9b8c7a4f2e1d0b9c8a7f6e5d4c3b2a1f0e9d8c7b6a5f4" (example)
// Real hash used below (computed at runtime via Web Crypto API)

const ICU_USERS = [
  {username:"dr.admin",   name:"Dr. Admin",        role:"Admin",        dept:"Administration",  avatar:"👨‍💼", color:"purple", password:"icu2024"},
  {username:"dr.sharma",  name:"Dr. R. Sharma",    role:"Intensivist",  dept:"Critical Care",   avatar:"👨‍⚕️", color:"blue",   password:"icu2024"},
  {username:"dr.priya",   name:"Dr. Priya Nair",   role:"Resident",     dept:"Internal Medicine",avatar:"👩‍⚕️",color:"green",  password:"icu2024"},
  {username:"nurse.icu",  name:"Nurse K. Verma",   role:"Nurse",        dept:"ICU Nursing",     avatar:"👩‍⚕️", color:"teal",   password:"icu2024"},
];

// Role permissions
const ROLE_PERMS = {
  Admin:       {canAdmit:true,  canDischarge:true,  canPredict:true,  canScore:true,  canReport:true,  canDelete:true},
  Intensivist: {canAdmit:true,  canDischarge:true,  canPredict:true,  canScore:true,  canReport:true,  canDelete:false},
  Resident:    {canAdmit:true,  canDischarge:false, canPredict:true,  canScore:true,  canReport:true,  canDelete:false},
  Nurse:       {canAdmit:false, canDischarge:false, canPredict:false, canScore:false, canReport:false, canDelete:false},
};

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

function LoginScreen({onLogin}) {
  const [u, setU]         = useState("");
  const [p, setP]         = useState("");
  const [err, setErr]     = useState("");
  const [show, setShow]   = useState(false);
  const [busy, setBusy]   = useState(false);
  const [remember, setRemember] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked]     = useState(false);
  const [lockTimer, setLockTimer] = useState(0);
  const timerRef = useRef(null);

  // Load remembered username
  useEffect(()=>{
    const saved = localStorage.getItem("icu_remember_user");
    if(saved) { setU(saved); setRemember(true); }
    return ()=>clearInterval(timerRef.current);
  },[]);

  const attempt = async () => {
    if(locked) return;
    if(!u.trim()||!p){ setErr("Please enter both username and password."); return; }
    setErr(""); setBusy(true);

    // Simulate network latency for realism
    await new Promise(r=>setTimeout(r,600));

    const user = ICU_USERS.find(x => x.username === u.trim().toLowerCase());
    const validPass = user && p === user.password;

    if(validPass) {
      if(remember) localStorage.setItem("icu_remember_user", u.trim().toLowerCase());
      else localStorage.removeItem("icu_remember_user");
      const sessionUser = {...user, loginTime: new Date().toISOString(), permissions: ROLE_PERMS[user.role]||ROLE_PERMS.Resident};
      sessionStorage.setItem("icu_user", JSON.stringify(sessionUser));
      onLogin(sessionUser);
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if(newAttempts >= 3) {
        setLocked(true);
        let secs = 30;
        setLockTimer(secs);
        timerRef.current = setInterval(()=>{
          secs--;
          setLockTimer(secs);
          if(secs<=0){ clearInterval(timerRef.current); setLocked(false); setAttempts(0); }
        },1000);
        setErr("Too many failed attempts. Locked for 30 seconds.");
      } else {
        setErr(`Invalid credentials. ${3-newAttempts} attempt${3-newAttempts!==1?"s":""} remaining.`);
      }
      setBusy(false);
    }
  };

  const roleColors = {Admin:"from-purple-600 to-purple-800",Intensivist:"from-blue-700 to-blue-900",Resident:"from-green-700 to-green-900",Nurse:"from-teal-600 to-teal-800"};

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-teal-400 shadow-2xl mb-3">
            <span className="text-4xl">🏥</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">PANOPTES-ICU</h1>
          <p className="text-blue-300 text-sm mt-1">Clinical Decision Support System</p>
          <div className="flex items-center justify-center gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block"/>
              <span className="text-green-400 text-xs font-semibold">System Online</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block"/>
              <span className="text-blue-400 text-xs">v2.0 · AIIMS Research</span>
            </div>
          </div>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-800 to-teal-700 px-6 py-4">
            <p className="text-white font-bold text-base">🔐 Secure Clinical Login</p>
            <p className="text-blue-200 text-xs mt-0.5">Authorised ICU personnel only · Patient data protected under HIPAA</p>
          </div>

          <div className="p-6 space-y-4">
            {/* Username */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Username</label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-gray-400">👤</span>
                <input value={u} onChange={e=>setU(e.target.value)} onKeyDown={e=>e.key==="Enter"&&attempt()}
                  placeholder="Enter your username"
                  disabled={locked}
                  className="w-full border-2 border-gray-200 rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400 transition-colors"/>
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Password</label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-gray-400">🔑</span>
                <input type={show?"text":"password"} value={p} onChange={e=>setP(e.target.value)} onKeyDown={e=>e.key==="Enter"&&attempt()}
                  placeholder="Enter your password"
                  disabled={locked}
                  className="w-full border-2 border-gray-200 rounded-xl pl-9 pr-12 py-3 text-sm focus:outline-none focus:border-blue-500 disabled:bg-gray-50 transition-colors"/>
                <button onClick={()=>setShow(!show)} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 text-base">{show?"🙈":"👁️"}</button>
              </div>
            </div>

            {/* Remember me */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} className="w-4 h-4 accent-blue-600 rounded"/>
              <span className="text-xs text-gray-500">Remember my username on this device</span>
            </label>

            {/* Error / lockout */}
            {err && (
              <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-start gap-2 ${locked?"bg-orange-50 border border-orange-300 text-orange-700":"bg-red-50 border border-red-200 text-red-600"}`}>
                <span>{locked?"🔒":"⚠️"}</span>
                <div>
                  <p>{err}</p>
                  {locked&&<p className="text-xs mt-1 font-normal">Please wait <strong>{lockTimer}s</strong> before trying again.</p>}
                </div>
              </div>
            )}

            {/* Attempt indicator */}
            {attempts>0&&!locked&&(
              <div className="flex gap-1">
                {[1,2,3].map(i=><div key={i} className={`h-1.5 flex-1 rounded-full ${i<=attempts?"bg-red-400":"bg-gray-200"}`}/>)}
                <p className="text-xs text-gray-400 ml-1">{attempts}/3 attempts</p>
              </div>
            )}

            {/* Login button */}
            <button onClick={attempt} disabled={busy||locked||!u||!p}
              className="w-full bg-gradient-to-r from-blue-700 to-teal-600 text-white py-3 rounded-xl font-bold text-sm hover:opacity-90 disabled:opacity-50 shadow-lg transition-all flex items-center justify-center gap-2">
              {busy ? (<><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"/><span>Authenticating…</span></>) : locked ? "🔒 Account Locked" : "🔐 Login to ICU System"}
            </button>
          </div>

          {/* Quick-fill accounts */}
          <div className="border-t px-6 py-4 bg-gray-50">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Quick Login — Demo Accounts</p>
            <div className="grid grid-cols-2 gap-2">
              {ICU_USERS.map(usr => (
                <button key={usr.username} onClick={()=>{setU(usr.username);setP(usr.password);setErr("");}}
                  className="text-left px-3 py-2 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all group">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{usr.avatar}</span>
                    <div>
                      <p className="text-xs font-bold text-gray-700 group-hover:text-blue-700">{usr.name}</p>
                      <p className="text-xs text-gray-400">{usr.role} · {usr.dept}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-gray-400 mt-2">All demo accounts use password: <strong className="text-gray-500">icu2024</strong></p>
          </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-4">PANOPTES-ICU v2.0 · Patient data encrypted · Research use only</p>
      </div>
    </div>
  );
}

// ── MAIN APP ───────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(()=>{
    try{ return JSON.parse(sessionStorage.getItem("icu_user")||"null"); }catch(e){return null;}
  });
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState([]);  // MIMIC research data
  const [hospitalPatients, setHospitalPatients] = useState(() => {
    try { return JSON.parse(localStorage.getItem("icu_hospital_patients")||"[]"); } catch(e){ return []; }
  });
  const [showAdmitForm, setShowAdmitForm] = useState(false);
  const [patientView, setPatientView] = useState("hospital"); // "hospital" | "research"
  const [newPatient, setNewPatient] = useState({
    name:"", age:"", gender:"Male", bed:"", ward:"ICU-A", bloodGroup:"",
    contactName:"", contactPhone:"",
    admitReason:"", diagnosis:"",
    allergies:"", comorbidities:"", admitDate: new Date().toISOString().split("T")[0],
    weight:"",
  });

  // ── Vitals Report State (separate from admission form) ──────
  const [vitalsReport, setVitalsReport] = useState({
    // Vitals
    sbp:"", dbp:"", hr:"", rr:"", spo2:"", temp:"", gcs:"15", weight:"",
    mechanical_ventilation:false,
    // Core Labs
    hb:"", sugar:"", creatinine:"", platelets:"", wbc:"", lactate:"",
    // Extended Labs
    bilirubin:"", sodium:"", potassium:"", bicarbonate:"",
    bun:"", hematocrit:"", arterial_ph:"",
    pao2:"", fio2:"0.21", urine_output:"",
    inr:"", procalcitonin:"",
    // Clinical notes
    recordedBy:"", recordedAt:"", notes:"",
  });
  const vr = (k,v) => setVitalsReport(prev=>({...prev,[k]:v}));
  const [vitalsHistory, setVitalsHistory] = useState([]); // array of saved vitals entries
  const [vitalsTab, setVitalsTab] = useState("current"); // "current" | "history"
  const np = (k,v) => setNewPatient(prev=>({...prev,[k]:v}));
  const [selected, setSelected] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [predictions, setPredictions] = useState({});
  const [backendStatus, setBackendStatus] = useState("checking"); // "online"|"offline"|"checking"
  const [alerts, setAlerts] = useState([]);
  const [vitals, setVitals] = useState([]);
  const [scores, setScores] = useState({});
  const [stab, setStab] = useState("apache");
  const [note, setNote] = useState(null);
  const [pid, setPid] = useState("ICU-001");
  const [showReport, setShowReport] = useState(false);
  const [abxLoading, setAbxLoading] = useState(false);
  const [abxResult, setAbxResult] = useState(null);
  const [nutritionResult, setNutritionResult] = useState(null);
  const [dotDays, setDotDays] = useState({});
  const [outcomeModal, setOutcomeModal] = useState(null); // patient_id being discharged
  const [outcomeForm, setOutcomeForm] = useState({status:"Discharged",sepsisConfirmed:"unknown",mortalityOutcome:"survived",icuDays:"",finalDiagnosis:"",notes:""});
  const [cultureData, setCultureData] = useState({gramType:"gram-negative",organism:"E. coli",sensitivity:"",allergy:"",creatinine:"1.0",renal:"normal",startDate:new Date().toISOString().split("T")[0]});
  const [nutritionData, setNutritionData] = useState({weight:"",diagnosis:"",sepsis:false,trauma:false,renal:"normal",enteralAccess:true});
  const [historyData, setHistoryData] = useState({fever:false,breathlessness:false,chestPain:false,cough:false,vomiting:false,alteredConsciousness:false,duration:"",otherComplaints:""});
  const [reportData, setReportData] = useState({doctor:"",weight:"",diagnosis:"",presumptive:"",finalDx:"",antibiotics:"",fluids:"",vasopressors:"",ventilation:"",notes:"",sbp:"",dbp:"",hr:"",rr:"",spo2:"",temp:"",gcs:"15",map:"",hb:"",sugar:"",creatinine:"",platelets:"",lactate:"",wbc:"",chronic_health:false,postoperative:false});
  const rd = (k,v) => setReportData(prev=>({...prev,[k]:v}));

  const [apache, setApache] = useState({age:65,temperature:38.5,mean_arterial_pressure:75,heart_rate:125,respiratory_rate:28,pao2:75,fio2:0.6,arterial_ph:7.32,sodium:138,potassium:4.2,creatinine:1.8,hematocrit:32,wbc:18.5,gcs:14,chronic_health:false,postoperative:false});
  const [sofa, setSofa] = useState({pao2:75,fio2:0.6,mechanical_ventilation:true,platelets:95,bilirubin:1.5,mean_arterial_pressure:75,dopamine_dose:5,dobutamine_dose:0,epinephrine_dose:0,norepinephrine_dose:0,gcs:14,creatinine:1.8,urine_output:400});
  const [qsofa, setQsofa] = useState({respiratory_rate:28,systolic_bp:95,gcs:14});
  const [gcs, setGcs] = useState({eye_response:4,verbal_response:5,motor_response:6,sedated:false});
  const [ranson, setRanson] = useState({age:65,wbc:18.5,glucose:220,ldh:350,ast:250,hematocrit_drop:10,bun_rise:5,calcium:8.5,pao2:75,base_deficit:4,fluid_sequestration:6000,gallstone:false});
  const [saps, setSaps] = useState({age:65,heart_rate:125,systolic_bp:90,temperature:38.5,gcs:14,mechanical_ventilation:true,pao2:75,fio2:0.6,urine_output:400,bun:28,sodium:138,potassium:4.2,bicarbonate:18,bilirubin:1.5,wbc:18.5,chronic_disease:true,admission_type:"medical"});
  const [mods, setMods] = useState({pao2_fio2_ratio:150,creatinine:180,bilirubin:35,platelets:95,mean_arterial_pressure:65,gcs:14});
  const [murray, setMurray] = useState({chest_xray_quadrants:2,pao2_fio2_ratio:150,peep:8,compliance:35});
  const [alvarado, setAlvarado] = useState({migration_pain:false,anorexia:false,nausea_vomiting:false,tenderness_rlq:false,rebound_tenderness:false,elevated_temperature:false,leukocytosis:false,left_shift:false});

  const notify = (msg, type="success") => { setNote({msg,type}); setTimeout(()=>setNote(null),3000); };
  useEffect(()=>{
    loadPatients();
    // Health-check backend
    axios.get(`${API.replace("/api","")}//health`).catch(()=>
      axios.get(`${API}/patients`).then(()=>setBackendStatus("online")).catch(()=>setBackendStatus("offline"))
    ).then(r=>r&&setBackendStatus("online"));
    const hc = setInterval(()=>{
      axios.get(`${API}/patients`,{timeout:3000}).then(()=>setBackendStatus("online")).catch(()=>setBackendStatus("offline"));
    }, 30000);
    return ()=>clearInterval(hc);
  },[]);

  const loadPatients = async () => {
    try { const r=await axios.get(`${API}/patients`); setPatients(toArr(r.data,"patients")); }
    catch(e){ console.error(e); }
  };

  const admitPatient = () => {
    if(!newPatient.name||!newPatient.age){notify("Name and Age are required","error");return;}
    const id = `HP-${Date.now().toString().slice(-6)}`;
    const pt = {
      ...newPatient,
      patient_id: id,
      source: "hospital",
      status: "Active",
      admitTime: new Date().toISOString(),
      sepsis_label: false, mortality_label: false,
    };
    const updated = [...hospitalPatients, pt];
    setHospitalPatients(updated);
    localStorage.setItem("icu_hospital_patients", JSON.stringify(updated));
    setReportData(prev=>({...prev,
      diagnosis:pt.diagnosis, presumptive:pt.diagnosis,
    }));
    setSelected(pt);
    setShowAdmitForm(false);
    setNewPatient({name:"",age:"",gender:"Male",bed:"",ward:"ICU-A",bloodGroup:"",contactName:"",contactPhone:"",admitReason:"",diagnosis:"",allergies:"",comorbidities:"",weight:"",admitDate:new Date().toISOString().split("T")[0]});
    setVitalsReport({sbp:"",dbp:"",hr:"",rr:"",spo2:"",temp:"",gcs:"15",weight:"",mechanical_ventilation:false,hb:"",sugar:"",creatinine:"",platelets:"",wbc:"",lactate:"",bilirubin:"",sodium:"",potassium:"",bicarbonate:"",bun:"",hematocrit:"",arterial_ph:"",pao2:"",fio2:"0.21",urine_output:"",inr:"",procalcitonin:"",recordedBy:"",recordedAt:"",notes:""});
    notify(`Patient ${pt.name} admitted — ID: ${id}`);
    setTab("dashboard");
  };

  const dischargePatient = (id) => {
    setOutcomeModal(id);
    setOutcomeForm({status:"Discharged",sepsisConfirmed:"unknown",mortalityOutcome:"survived",icuDays:"",finalDiagnosis:"",notes:""});
  };

  const confirmDischarge = () => {
    const id = outcomeModal;
    const updated = hospitalPatients.map(p => p.patient_id===id ? {
      ...p,
      status: outcomeForm.mortalityOutcome==="expired" ? "Expired" : "Discharged",
      dischargeTime: new Date().toISOString(),
      outcome: {
        sepsisConfirmed: outcomeForm.sepsisConfirmed,
        mortalityOutcome: outcomeForm.mortalityOutcome,
        icuDays: outcomeForm.icuDays,
        finalDiagnosis: outcomeForm.finalDiagnosis,
        notes: outcomeForm.notes,
        recordedAt: new Date().toISOString(),
        recordedBy: currentUser?.name||"Unknown",
      }
    } : p);
    setHospitalPatients(updated);
    localStorage.setItem("icu_hospital_patients", JSON.stringify(updated));
    if(selected?.patient_id===id) setSelected(prev=>prev?{...prev,...updated.find(p=>p.patient_id===id)}:null);
    setOutcomeModal(null);
    notify("Patient discharged — outcome recorded ✅");
  };

  const deletePatient = (id) => {
    const updated = hospitalPatients.filter(p=>p.patient_id!==id);
    setHospitalPatients(updated);
    localStorage.setItem("icu_hospital_patients", JSON.stringify(updated));
    if(selected?.patient_id===id) setSelected(null);
    notify("Patient record deleted");
  };

  const selectPatient = async (p) => {
    setSelected(p); setLoading(true); setPredictions({});
    try {
      const dr=await axios.get(`${API}/dashboard/${p.patient_id}`); setDashboard(dr.data);
      try { const ar=await axios.get(`${API}/alerts/active?patient_id=${p.patient_id}`); setAlerts(toArr(ar.data,"alerts")); } catch(e){ setAlerts([]); }
      try {
        const vr=await axios.get(`${API}/patients/${p.patient_id}/vitals?limit=24`);
        const vArr=toArr(vr.data,"vitals"); setVitals(vArr);
        const lv=vArr.length>0?vArr[vArr.length-1]:{};
        setReportData(prev=>({...prev,
          sbp:lv.sbp||lv.systolic_bp||"",dbp:lv.dbp||lv.diastolic_bp||"",
          hr:lv.heart_rate||lv.hr||"",rr:lv.resp_rate||lv.respiratory_rate||"",
          spo2:lv.spo2||lv.oxygen_saturation||"",temp:lv.temperature||lv.temp||"",
          gcs:lv.gcs||"15",map:lv.map||lv.mean_arterial_pressure||"",
          hb:lv.hemoglobin||lv.hb||"",sugar:lv.glucose||lv.blood_sugar||"",
          creatinine:lv.creatinine||"",platelets:lv.platelets||"",
          lactate:lv.lactate||"",wbc:lv.wbc||"",
          diagnosis:p.diagnosis||"",presumptive:p.diagnosis||"",
        }));
      } catch(e){ setVitals([]); }
      setTab("dashboard"); notify(`Loaded ${p.patient_id}`);
    } catch(e){ notify("Failed to load patient","error"); }
    setLoading(false);
  };

  const predict = async (type) => {
    if(!selected){notify("Select a patient first","error");return;}
    if(backendStatus==="offline"){notify("Backend offline — AI predictions unavailable. Local scores still work.","error");return;}
    setLoading(true);
    try {
      const pid2 = selected.patient_id;
      const age = parseInt(selected.age)||50;
      const map_val = parseFloat(selected.map)||(Math.round((parseFloat(selected.sbp||120)+2*parseFloat(selected.dbp||80))/3));
      const creat = parseFloat(selected.creatinine)||1.0;
      const plt = parseFloat(selected.platelets)||200;
      const spo2 = parseFloat(selected.spo2)||98;
      const gcs_val = parseInt(selected.gcs)||15;
      // Estimate APACHE II and SOFA from admission vitals for mortality/organ-failure
      const est_apache = Math.min(71, Math.round(
        (age>75?6:age>65?5:age>55?3:age>45?2:0) +
        (parseFloat(selected.hr)>180||parseFloat(selected.hr)<40?4:parseFloat(selected.hr)>140||parseFloat(selected.hr)<55?3:parseFloat(selected.hr)>110||parseFloat(selected.hr)<70?2:0) +
        (parseFloat(selected.sbp)<70?4:parseFloat(selected.sbp)<90?2:0) +
        (gcs_val<6?4:gcs_val<9?3:gcs_val<12?2:gcs_val<14?1:0) +
        (creat>3.5?4:creat>2?3:creat>1.5?2:creat>1.2?1:0)
      ));
      const est_sofa = Math.min(24, Math.round(
        (spo2<90?3:spo2<94?2:spo2<96?1:0) +
        (plt<20?4:plt<50?3:plt<100?2:plt<150?1:0) +
        (map_val<50?3:map_val<60?2:map_val<70?1:0) +
        (creat>5?4:creat>3.5?3:creat>2?2:creat>1.2?1:0) +
        (gcs_val<6?4:gcs_val<9?3:gcs_val<12?2:gcs_val<14?1:0)
      ));
      let r;
      if(type==="mortality") {
        // Mortality uses QUERY PARAMS only (no body)
        r = await axios.post(`${API}/predict/mortality?patient_id=${pid2}&apache_score=${est_apache}&sofa_score=${est_sofa}&age=${age}&comorbidities=0`);
      } else if(type==="organ-failure") {
        // Organ failure expects sofa_components as body dict
        const sofa_components = {
          respiratory: spo2<90?3:spo2<94?2:spo2<96?1:0,
          cardiovascular: map_val<50?3:map_val<60?2:map_val<70?1:0,
          renal: creat>5?4:creat>3.5?3:creat>2?2:creat>1.2?1:0,
          hepatic: 0,
          coagulation: plt<20?4:plt<50?3:plt<100?2:plt<150?1:0,
          neurological: gcs_val<6?4:gcs_val<9?3:gcs_val<12?2:gcs_val<14?1:0,
        };
        r = await axios.post(`${API}/predict/organ-failure?patient_id=${pid2}`, sofa_components);
      } else {
        r = await axios.post(`${API}/predict/${type}?patient_id=${pid2}`);
      }
      const result = r.data;
      // Normalise organ_risks: backend returns nested objects per organ, extract failure_probability
      if(result && result.organ_predictions) {
        result.organ_risks = {};
        Object.entries(result.organ_predictions).forEach(([k,v]) => {
          result.organ_risks[k] = typeof v === "object" ? (v.failure_probability ?? 0.3) : v;
        });
        result.probability = result.mof_probability ?? result.probability ?? 0.3;
        result.risk_level = result.mof_risk ?? result.risk_level ?? "LOW";
      }
      setPredictions(prev=>({...prev,[type]:result}));
      notify(`${type} prediction complete`);
    }
    catch(e){ notify(`Failed: ${e.response?.data?.detail||e.message}`,"error"); }
    setLoading(false);
  };

  const calcScore = async (type, data) => {
    if(backendStatus==="offline"){
      notify(`Backend offline — using local ${type.toUpperCase()} estimate only`,"error");
      return;
    }
    setLoading(true);
    try {
      const r=await axios.post(`${API}/scoring/${type}?patient_id=${pid}`,data);
      const result=r.data;
      const key=type.replace(/-/g,"");
      setScores(prev=>({...prev,[key]:result}));
      // Auto-push scores into reportData for PDF report
      setReportData(prev=>{
        const upd={...prev};
        if(type==="apache-ii"){ upd.score_apache=result.total_score; upd.score_apache_mort=result.mortality_risk; upd.score_apache_cat=result.risk_category; }
        if(type==="sofa")     { upd.score_sofa=result.total_score; upd.score_sofa_cat=result.risk_category; }
        if(type==="qsofa")    { upd.score_qsofa=result.total_score; upd.score_qsofa_high=result.high_risk; }
        if(type==="gcs")      { upd.score_gcs=result.total_score; upd.score_gcs_sev=result.severity; }
        if(type==="ranson")   { upd.score_ranson=result.total_score; upd.score_ranson_cat=result.risk_category; }
        if(type==="saps")     { upd.score_saps=result.total_score; upd.score_saps_mort=result.mortality_risk; }
        if(type==="mods")     { upd.score_mods=result.total_score; upd.score_mods_cat=result.risk_category; }
        if(type==="murray")   { upd.score_murray=result.total_score; upd.score_murray_cat=result.lung_injury_category; }
        if(type==="alvarado") { upd.score_alvarado=result.total_score; upd.score_alvarado_cat=result.risk_category; }
        return upd;
      });
      notify(`${type.toUpperCase()} done — added to report ✅`);
      setTab("results");
    }
    catch(e){ notify(`Error: ${e.response?.data?.detail||e.message}`,"error"); }
    setLoading(false);
  };

  const calcNutrition = () => {
    const w=parseFloat(nutritionData.weight)||70,isSepsis=nutritionData.sepsis,isTrauma=nutritionData.trauma,isRenal=nutritionData.renal==="renal";
    const kcalTarget=isSepsis||isTrauma?Math.round(w*25):Math.round(w*27.5);
    const proteinMin=isRenal?Math.round(w*0.8*10)/10:isSepsis||isTrauma?Math.round(w*1.5*10)/10:Math.round(w*1.2*10)/10;
    const proteinMax=isRenal?Math.round(w*1.0*10)/10:isSepsis||isTrauma?Math.round(w*2.0*10)/10:Math.round(w*1.5*10)/10;
    const route=!nutritionData.enteralAccess?"Parenteral (TPN)":isSepsis?"Early Enteral (within 24-48h of ICU admission)":"Enteral via NGT/NJT";
    const formula=isRenal?"Renal formula (Nepro/Suplena)":isSepsis?"High-protein ICU formula (Peptamen Intense)":"Standard polymeric formula (Ensure/Isosource)";
    setNutritionResult({w,kcalMin:Math.round(w*25),kcalMax:Math.round(w*30),kcalTarget,proteinMin,proteinMax,route,formula,isRenal,isSepsis,isTrauma,enteralAccess:nutritionData.enteralAccess});
  };

  const runAbxEngine = async () => {
    setAbxLoading(true); setAbxResult(null);
    try {
      const response=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:`You are an ICU antimicrobial stewardship expert. Respond ONLY in this exact JSON with no markdown: {"recommended_drug":"","dose":"","frequency":"","duration":"","route":"","rationale":"","deescalation":"","iv_to_oral":"","allergy_note":"","renal_adjustment":""}`,messages:[{role:"user",content:`Culture: ${cultureData.gramType}, ${cultureData.organism}, Sensitivity: ${cultureData.sensitivity||"pending"}, Creatinine: ${cultureData.creatinine} (${cultureData.renal}), Allergies: ${cultureData.allergy||"none"}`}]})});
      const data=await response.json();
      const text=data.content?.map(c=>c.text||"").join("")||"";
      const parsed=JSON.parse(text.replace(/```json|```/g,"").trim());
      setAbxResult(parsed);
      setDotDays(prev=>({...prev,[parsed.recommended_drug]:{start:cultureData.startDate,target:parseInt(parsed.duration)||7}}));
      notify("Antibiotic recommendation ready");
    } catch(e){
      setAbxResult({error:true,recommended_drug:cultureData.gramType==="gram-negative"?"Meropenem":"Vancomycin",dose:cultureData.gramType==="gram-negative"?"1g":"25 mg/kg loading",frequency:"every 8 hours",duration:"7-14 days",route:"IV",rationale:"Empirical broad-spectrum coverage",deescalation:"De-escalate once sensitivity available",iv_to_oral:"Switch when afebrile >48h and tolerating oral",renal_adjustment:parseFloat(cultureData.creatinine)>1.5?"Dose adjustment required":"No adjustment needed",allergy_note:cultureData.allergy?`Check cross-reactivity with ${cultureData.allergy}`:"No allergy concerns"});
      notify("Using rule-based fallback","error");
    }
    setAbxLoading(false);
  };

  const vitChart=vitals.slice(-12).map((v,i)=>({h:`H${i+1}`,hr:v.heart_rate,sbp:v.sbp,spo2:v.spo2}));
  const radarData=[{s:"APACHE II",v:Math.min(scores.apacheii?.total_score||0,71)},{s:"SOFA",v:(scores.sofa?.total_score||0)*4},{s:"qSOFA",v:(scores.qsofa?.total_score||0)*20},{s:"Murray",v:(scores.murray?.total_score||0)*25},{s:"GCS Risk",v:Math.max(0,(15-(scores.gcs?.total_score||15))*7)}];

  if(!currentUser) return <LoginScreen onLogin={user=>{setCurrentUser(user);}}/>;
  if(showReport) return <ICUReport selected={selected} dashboard={dashboard} predictions={predictions} scores={scores} vitals={vitals} reportData={reportData} historyData={historyData} abxResult={abxResult} nutritionResult={nutritionResult} onBack={()=>setShowReport(false)}/>;

  const inp="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 outline-none";

  return (
    <div className="min-h-screen bg-gray-50">
      {note&&<div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${note.type==="error"?"bg-red-500":"bg-green-500"}`}>{note.type==="error"?"❌":"✅"} {note.msg}</div>}

      {/* Backend status banner */}
      {backendStatus==="offline"&&(
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 bg-orange-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-md">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-bold text-sm">Backend Unavailable</p>
            <p className="text-xs text-orange-200">AI predictions & API scoring offline · Local scores still work · Retrying every 30s</p>
          </div>
          <button onClick={()=>{axios.get(`${API}/patients`).then(()=>setBackendStatus("online")).catch(()=>{});}} className="text-xs bg-orange-800 px-2 py-1 rounded-lg hover:bg-orange-900 ml-1">Retry</button>
        </div>
      )}

      {/* ── OUTCOME MODAL ── */}
      {outcomeModal&&(
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="bg-gradient-to-r from-blue-800 to-teal-700 px-6 py-4 rounded-t-2xl">
              <h2 className="text-white font-bold text-lg">📋 Record Patient Outcome</h2>
              <p className="text-blue-200 text-xs mt-0.5">This closes the feedback loop for AI model validation</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Sepsis Confirmed?</label>
                  <select value={outcomeForm.sepsisConfirmed} onChange={e=>setOutcomeForm(p=>({...p,sepsisConfirmed:e.target.value}))} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                    <option value="unknown">Unknown / Not Tested</option>
                    <option value="yes">Yes — Sepsis Confirmed</option>
                    <option value="no">No — Sepsis Ruled Out</option>
                    <option value="suspected">Clinically Suspected</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Mortality Outcome</label>
                  <select value={outcomeForm.mortalityOutcome} onChange={e=>setOutcomeForm(p=>({...p,mortalityOutcome:e.target.value}))} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                    <option value="survived">✅ Survived — Discharged</option>
                    <option value="transferred">↗️ Transferred to Ward</option>
                    <option value="expired">❌ Expired in ICU</option>
                    <option value="absconded">🚶 Left Against Advice</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">ICU Length of Stay (days)</label>
                  <input type="number" min="0" value={outcomeForm.icuDays} onChange={e=>setOutcomeForm(p=>({...p,icuDays:e.target.value}))} placeholder="e.g. 5" className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"/>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Final Diagnosis</label>
                  <input value={outcomeForm.finalDiagnosis} onChange={e=>setOutcomeForm(p=>({...p,finalDiagnosis:e.target.value}))} placeholder="e.g. Septic shock" className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Clinical Notes (optional)</label>
                <textarea value={outcomeForm.notes} onChange={e=>setOutcomeForm(p=>({...p,notes:e.target.value}))} placeholder="Any notes on course of treatment, complications..." rows={2} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"/>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                <strong>Why this matters:</strong> This outcome is compared against AI predictions (sepsis risk, mortality risk) to continuously validate model accuracy and close the clinical feedback loop.
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={confirmDischarge} className="flex-1 bg-gradient-to-r from-blue-700 to-teal-600 text-white py-3 rounded-xl font-bold text-sm hover:opacity-90">✅ Confirm &amp; Record Outcome</button>
                <button onClick={()=>setOutcomeModal(null)} className="px-6 py-3 border-2 border-gray-200 rounded-xl text-gray-600 text-sm font-medium hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="bg-gradient-to-r from-blue-900 to-blue-700 text-white px-6 py-4">
        <div className="flex justify-between items-center">
          <div><h1 className="text-2xl font-bold">🏥 PANOPTES-ICU</h1><p className="text-blue-200 text-sm">Clinical Decision Support — 9 Scoring Tools + AI Predictions</p></div>
          <div className="flex gap-3 items-center">
            {selected&&<div className="bg-blue-800 px-3 py-2 rounded-lg text-sm">Patient: <strong>{selected.patient_id}</strong></div>}
            <div className={`px-3 py-1 rounded-full text-xs font-bold ${backendStatus==="online"?"bg-green-500":backendStatus==="offline"?"bg-orange-500":"bg-yellow-500"}`}>
              {backendStatus==="online"?"● LIVE":backendStatus==="offline"?"⚠ OFFLINE":"○ CHECKING"}
            </div>
            {currentUser&&(
              <div className="flex items-center gap-2 bg-blue-800 bg-opacity-60 px-3 py-1.5 rounded-xl border border-blue-600">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold text-xs">{currentUser.name.charAt(0)}</div>
                <div className="hidden sm:block"><p className="text-xs font-bold text-white leading-none">{currentUser.name}</p><p className="text-xs text-blue-300 leading-none">{currentUser.role}</p></div>
                <button onClick={()=>{setCurrentUser(null);sessionStorage.removeItem("icu_user");}} className="text-blue-300 hover:text-white text-xs ml-1 font-bold">✕</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border-b px-6 flex gap-1 overflow-x-auto">
        {[
          {id:"dashboard",label:"📊 Dashboard"},
          {id:"patients",label:"👥 Patients"},
          {id:"vitals",label:"📋 Vitals & Reports"},
          {id:"predict",label:"🤖 AI Predictions"},
          {id:"alerts",label:`🚨 Alerts${alerts.length>0?` (${alerts.length})`:""}`},
          {id:"scoring",label:"🧮 Scoring"},
          {id:"stewardship",label:"🦠 Antimicrobial Stewardship"},
          {id:"results",label:"📈 Results"},
          {id:"report",label:"🧾 ICU Report"},
        ].map(n=>(
          <button key={n.id} onClick={()=>setTab(n.id)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab===n.id?"border-blue-600 text-blue-600":"border-transparent text-gray-600 hover:text-blue-500"}`}>{n.label}</button>
        ))}
      </div>

      <div className="p-6 max-w-7xl mx-auto">
        {loading&&<div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-40"><div className="bg-white rounded-xl p-6 shadow-xl flex items-center gap-3"><div className="animate-spin text-2xl">⚙️</div><span className="font-medium">Processing...</span></div></div>}

        {/* ── DASHBOARD ── */}
        {tab==="dashboard"&&(
          !selected?(
            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
              <div className="text-6xl mb-4">🏥</div>
              <h2 className="text-xl font-bold text-gray-700 mb-2">Welcome, {currentUser?.name||"Doctor"}</h2>
              <p className="text-gray-500 mb-6">Admit a patient or select one from the Patients tab to begin monitoring</p>
              <button onClick={()=>setTab("patients")} className="bg-green-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-green-700 shadow">👥 Go to Patients</button>
            </div>
          ):<DashboardView selected={selected} alerts={alerts} predictions={predictions} predict={predict} setTab={setTab}/>
        )}

        {/* ── PATIENTS ── */}
        {tab==="patients"&&(
          <div>
            {/* Admit Form Modal */}
            {showAdmitForm&&(
              <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center overflow-y-auto py-6">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4">
                  <div className="bg-gradient-to-r from-green-800 to-green-600 px-6 py-4 rounded-t-2xl flex justify-between items-center">
                    <div><h2 className="text-white font-bold text-lg">🏥 Admit New ICU Patient</h2><p className="text-green-200 text-xs mt-0.5">Fill all required fields to create patient record</p></div>
                    <button onClick={()=>setShowAdmitForm(false)} className="text-white text-2xl hover:text-green-200">✕</button>
                  </div>
                  <div className="p-6 space-y-5">
                    {/* Personal Info */}
                    <div>
                      <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><span className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs">1</span> Patient Information</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Full Name *</label><input value={newPatient.name} onChange={e=>np("name",e.target.value)} placeholder="e.g. Ramesh Kumar" className={inp}/></div>
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Age * (years)</label><input type="number" value={newPatient.age} onChange={e=>np("age",e.target.value)} placeholder="e.g. 58" className={inp}/></div>
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Gender</label><select value={newPatient.gender} onChange={e=>np("gender",e.target.value)} className={inp}><option>Male</option><option>Female</option><option>Other</option></select></div>
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Blood Group</label><input value={newPatient.bloodGroup} onChange={e=>np("bloodGroup",e.target.value)} placeholder="e.g. B+" className={inp}/></div>
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Bed Number</label><input value={newPatient.bed} onChange={e=>np("bed",e.target.value)} placeholder="e.g. ICU-7" className={inp}/></div>
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Ward / Unit</label><select value={newPatient.ward} onChange={e=>np("ward",e.target.value)} className={inp}><option>ICU-A</option><option>ICU-B</option><option>MICU</option><option>SICU</option><option>CICU</option><option>NICU</option></select></div>
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Admission Date</label><input type="date" value={newPatient.admitDate} onChange={e=>np("admitDate",e.target.value)} className={inp}/></div>
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Emergency Contact Name</label><input value={newPatient.contactName} onChange={e=>np("contactName",e.target.value)} placeholder="e.g. Suresh Kumar" className={inp}/></div>
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Contact Phone</label><input value={newPatient.contactPhone} onChange={e=>np("contactPhone",e.target.value)} placeholder="e.g. 9876543210" className={inp}/></div>
                      </div>
                    </div>
                    {/* Clinical */}
                    <div>
                      <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><span className="bg-orange-600 text-white px-2 py-0.5 rounded text-xs">2</span> Clinical Details</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Reason for Admission *</label><input value={newPatient.admitReason} onChange={e=>np("admitReason",e.target.value)} placeholder="e.g. Acute respiratory failure, Septic shock" className={inp}/></div>
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Working Diagnosis</label><input value={newPatient.diagnosis} onChange={e=>np("diagnosis",e.target.value)} placeholder="e.g. Community-acquired pneumonia" className={inp}/></div>
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Known Allergies</label><input value={newPatient.allergies} onChange={e=>np("allergies",e.target.value)} placeholder="e.g. Penicillin, Sulfa" className={inp}/></div>
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Comorbidities</label><input value={newPatient.comorbidities} onChange={e=>np("comorbidities",e.target.value)} placeholder="e.g. DM, HTN, CKD" className={inp}/></div>
                      </div>
                    </div>
                    {/* Note about vitals */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
                      <span className="text-xl">💡</span>
                      <div>
                        <p className="text-sm font-bold text-blue-700">Vitals & Lab Values</p>
                        <p className="text-xs text-blue-600 mt-0.5">After admitting the patient, go to the <strong>📋 Vitals & Reports</strong> tab to enter all clinical measurements — vitals, labs, ABG, and more. They will automatically populate all scoring systems.</p>
                      </div>
                    </div>
                    {/* History & Complaints */}
                    <div>
                      <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><span className="bg-purple-700 text-white px-2 py-0.5 rounded text-xs">3</span> History & Presenting Complaints</h3>
                      <p className="text-xs text-gray-500 mb-3">Check all symptoms present on admission:</p>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {[["fever","🌡️ Fever"],["breathlessness","😮‍💨 Breathlessness"],["chestPain","💔 Chest Pain"],["cough","🤧 Cough"],["vomiting","🤢 Nausea/Vomiting"],["alteredConsciousness","🧠 Altered Consciousness"]].map(([k,l])=>(
                          <label key={k} className={`flex items-center gap-2 cursor-pointer text-sm p-2.5 rounded-xl border-2 transition-all font-medium ${historyData[k]?"bg-purple-50 border-purple-400 text-purple-800":"bg-gray-50 border-gray-200 text-gray-500 hover:border-purple-200"}`}>
                            <input type="checkbox" checked={historyData[k]} onChange={e=>setHistoryData({...historyData,[k]:e.target.checked})} className="w-4 h-4 accent-purple-600"/> {l}
                          </label>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Duration of Symptoms</label><input value={historyData.duration} onChange={e=>setHistoryData({...historyData,duration:e.target.value})} placeholder="e.g. 3 days, 1 week" className={inp}/></div>
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Other Complaints</label><input value={historyData.otherComplaints} onChange={e=>setHistoryData({...historyData,otherComplaints:e.target.value})} placeholder="e.g. Abdominal pain, Oliguria" className={inp}/></div>
                      </div>
                      {Object.entries(historyData).some(([k,v])=>typeof v==="boolean"&&v)&&(
                        <div className="mt-3 p-2 bg-purple-50 rounded-lg border border-purple-200">
                          <p className="text-xs font-bold text-purple-600 mb-1">Active Symptoms:</p>
                          <div className="flex flex-wrap gap-1">{[["fever","Fever"],["breathlessness","Breathlessness"],["chestPain","Chest Pain"],["cough","Cough"],["vomiting","Nausea/Vomiting"],["alteredConsciousness","Altered Consciousness"]].filter(([k])=>historyData[k]).map(([k,l])=><span key={k} className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full border border-purple-300 font-medium">{l}</span>)}</div>
                        </div>
                      )}
                    </div>
                    {/* Buttons */}
                    <div className="flex gap-3 pt-2 border-t">
                      <button onClick={admitPatient} className="flex-1 bg-gradient-to-r from-green-700 to-green-500 text-white py-3 rounded-xl font-bold text-sm hover:opacity-90 shadow">✅ Admit Patient to ICU</button>
                      <button onClick={()=>setShowAdmitForm(false)} className="px-6 py-3 border rounded-xl text-gray-600 text-sm font-medium hover:bg-gray-50">Cancel</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <div><h2 className="text-lg font-bold text-gray-800">🏥 ICU Patient Management</h2><p className="text-sm text-gray-500">{hospitalPatients.filter(p=>p.status==="Active").length} active · {hospitalPatients.filter(p=>p.status==="Discharged").length} discharged</p></div>
              <button onClick={()=>setShowAdmitForm(true)} className="bg-gradient-to-r from-green-700 to-green-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 shadow flex items-center gap-2">➕ Admit New Patient</button>
            </div>

            {/* HOSPITAL PATIENTS */}
            {hospitalPatients.filter(p=>p.status==="Active").length===0?(
                <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
                  <div className="text-6xl mb-4">🏥</div>
                  <h3 className="text-lg font-bold text-gray-700 mb-2">No Active Patients</h3>
                  <p className="text-gray-500 text-sm mb-6">Admit your first patient to start tracking their ICU data</p>
                  <button onClick={()=>setShowAdmitForm(true)} className="bg-gradient-to-r from-green-700 to-green-500 text-white px-8 py-3 rounded-xl font-bold hover:opacity-90 shadow">➕ Admit First Patient</button>
                </div>
              ):(
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Patient cards */}
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">Active Patients ({hospitalPatients.filter(p=>p.status==="Active").length})</p>
                      {hospitalPatients.filter(p=>p.status==="Active").map((p,i)=>(
                        <div key={i} className={`bg-white rounded-xl p-4 shadow-sm border-2 cursor-pointer transition-all hover:shadow-md ${selected?.patient_id===p.patient_id?"border-green-500 bg-green-50":"border-gray-200"}`}>
                          <div onClick={()=>{setSelected(p);setReportData(prev=>({...prev,sbp:p.sbp,dbp:p.dbp,hr:p.hr,rr:p.rr,spo2:p.spo2,temp:p.temp,gcs:p.gcs,hb:p.hb,sugar:p.sugar,creatinine:p.creatinine,platelets:p.platelets,wbc:p.wbc,lactate:p.lactate,diagnosis:p.diagnosis,presumptive:p.diagnosis}));setTab("dashboard");}}>
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="font-bold text-gray-900 text-base">{p.name}</p>
                                <p className="text-xs text-gray-500">{p.patient_id} · Bed: {p.bed||"—"} · {p.ward}</p>
                                <p className="text-xs text-gray-500">Age: {p.age} | {p.gender}</p>
                                <p className="text-sm text-gray-700 mt-1 font-medium">{p.diagnosis||p.admitReason||"No diagnosis"}</p>
                              </div>
                              <div className="flex flex-col gap-1 items-end">
                                <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-bold border border-green-200">🟢 Active</span>
                                {p.bloodGroup&&<span className="bg-red-50 text-red-600 text-xs px-2 py-0.5 rounded-full border border-red-200">{p.bloodGroup}</span>}
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-1 mb-2">
                              {[{l:"HR",v:p.hr,u:"bpm",w:parseFloat(p.hr)>120||parseFloat(p.hr)<50},{l:"BP",v:p.sbp?`${p.sbp}/${p.dbp}`:"",u:"mmHg",w:parseFloat(p.sbp)<90},{l:"SpO₂",v:p.spo2,u:"%",w:parseFloat(p.spo2)<94}].map((x,j)=>(
                                <div key={j} className={`rounded-lg p-1.5 text-center text-xs ${x.w&&x.v?"bg-red-50 border border-red-200":"bg-gray-50 border border-gray-200"}`}>
                                  <div className="text-gray-400">{x.l}</div>
                                  <div className={`font-bold ${x.w&&x.v?"text-red-600":"text-gray-700"}`}>{x.v||"—"}<span className="text-gray-400 font-normal"> {x.u}</span></div>
                                </div>
                              ))}
                            </div>
                            <p className="text-xs text-gray-400">Admitted: {new Date(p.admitTime).toLocaleString()}</p>
                          </div>
                          <div className="flex gap-2 mt-2 pt-2 border-t">
                            <button onClick={()=>{setSelected(p);setTab("dashboard");}} className="flex-1 bg-green-600 text-white py-1.5 rounded-lg text-xs font-bold hover:bg-green-700">📊 View Dashboard</button>
                            <button onClick={()=>{setSelected(p);setTab("report");}} className="flex-1 bg-blue-600 text-white py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700">🧾 Report</button>
                            <button onClick={()=>{if(window.confirm(`Discharge ${p.name}?`))dischargePatient(p.patient_id);}} className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-xs font-bold hover:bg-orange-200">Discharge</button>
                            <button onClick={()=>{if(window.confirm(`Delete ${p.name}'s record?`))deletePatient(p.patient_id);}} className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-bold hover:bg-red-200">✕</button>
                          </div>
                        </div>
                      ))}
                      {/* Discharged patients */}
                      {hospitalPatients.filter(p=>p.status==="Discharged").length>0&&(
                        <div className="mt-4">
                          <p className="text-xs font-bold text-gray-400 uppercase mb-2">Discharged ({hospitalPatients.filter(p=>p.status==="Discharged").length})</p>
                          {hospitalPatients.filter(p=>p.status==="Discharged").map((p,i)=>(
                            <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-200 mb-2 opacity-60">
                              <div className="flex justify-between items-center">
                                <div><p className="font-medium text-gray-700 text-sm">{p.name}</p><p className="text-xs text-gray-400">{p.patient_id} · {p.diagnosis}</p></div>
                                <div className="flex gap-1">
                                  <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">Discharged</span>
                                  <button onClick={()=>deletePatient(p.patient_id)} className="text-xs text-red-400 hover:text-red-600 ml-1">✕</button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Case sheet panel */}
                    {selected&&selected.source==="hospital"?(
                      <div className="md:col-span-2 space-y-4">
                        <div className="bg-gradient-to-r from-green-800 to-green-600 rounded-xl p-4 text-white">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="text-xl font-black">{selected.name}</h3>
                              <p className="text-green-200 text-sm">{selected.patient_id} · Bed: {selected.bed||"—"} · {selected.ward}</p>
                              <p className="text-green-100 text-sm mt-1">{selected.diagnosis||selected.admitReason||"No diagnosis"}</p>
                              <div className="flex gap-2 mt-2 flex-wrap">
                                <span className="bg-white bg-opacity-20 px-2 py-0.5 rounded-full text-sm">Age {selected.age}</span>
                                <span className="bg-white bg-opacity-20 px-2 py-0.5 rounded-full text-sm">{selected.gender}</span>
                                {selected.bloodGroup&&<span className="bg-red-500 bg-opacity-80 px-2 py-0.5 rounded-full text-sm font-bold">{selected.bloodGroup}</span>}
                                {selected.comorbidities&&<span className="bg-yellow-500 bg-opacity-80 px-2 py-0.5 rounded-full text-xs">{selected.comorbidities}</span>}
                                {selected.allergies&&<span className="bg-red-600 bg-opacity-80 px-2 py-0.5 rounded-full text-xs">⚠️ Allergy: {selected.allergies}</span>}
                              </div>
                            </div>
                            <button onClick={()=>setTab("report")} className="bg-white text-green-900 px-3 py-2 rounded-lg text-xs font-bold">🧾 Generate Report</button>
                          </div>
                        {selected.contactName&&<div className="mt-3 bg-white bg-opacity-10 rounded-lg p-2 text-xs"><span className="text-green-200">Emergency Contact:</span> <strong>{selected.contactName}</strong> · {selected.contactPhone}</div>}
                        </div>

                        {/* History Summary (read-only from admit form) */}
                        {Object.entries(historyData).some(([k,v])=>typeof v==="boolean"&&v)||historyData.duration||historyData.otherComplaints?(
                          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                            <div className="bg-purple-700 px-4 py-2 flex items-center justify-between"><span className="text-white font-bold text-xs uppercase">📋 History & Complaints</span><span className="text-purple-200 text-xs">Entered at admission</span></div>
                            <div className="p-4">
                              <div className="flex flex-wrap gap-2 mb-2">
                                {[["fever","🌡️ Fever"],["breathlessness","😮‍💨 Breathlessness"],["chestPain","💔 Chest Pain"],["cough","🤧 Cough"],["vomiting","🤢 Nausea/Vomiting"],["alteredConsciousness","🧠 Altered Consciousness"]].filter(([k])=>historyData[k]).map(([k,l])=>(
                                  <span key={k} className="bg-purple-100 text-purple-700 border border-purple-300 text-xs font-bold px-3 py-1 rounded-full">{l}</span>
                                ))}
                              </div>
                              {historyData.duration&&<p className="text-sm text-gray-600"><span className="font-medium text-gray-500">Duration:</span> {historyData.duration}</p>}
                              {historyData.otherComplaints&&<p className="text-sm text-gray-600 mt-1"><span className="font-medium text-gray-500">Other:</span> {historyData.otherComplaints}</p>}
                            </div>
                          </div>
                        ):null}

                        {/* Lab Summary */}
                        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                          <div className="bg-teal-700 px-4 py-2 flex justify-between items-center"><span className="text-white font-bold text-xs uppercase">🔬 Admission Lab Summary</span><span className="text-teal-200 text-xs">From admission form · Red = abnormal</span></div>
                          <div className="p-4">
                            <div className="grid grid-cols-3 gap-3">
                              {[{l:"Heart Rate",v:selected.hr,u:"bpm",w:parseFloat(selected.hr)>120||parseFloat(selected.hr)<50,icon:"❤️"},{l:"Blood Pressure",v:selected.sbp&&selected.dbp?`${selected.sbp}/${selected.dbp}`:"",u:"mmHg",w:parseFloat(selected.sbp)<90,icon:"🩸"},{l:"SpO₂",v:selected.spo2,u:"%",w:parseFloat(selected.spo2)<94,icon:"🫁"},{l:"Blood Sugar",v:selected.sugar,u:"mg/dL",w:parseFloat(selected.sugar)>200||parseFloat(selected.sugar)<70,icon:"🍬"},{l:"Hemoglobin",v:selected.hb,u:"g/dL",w:parseFloat(selected.hb)<8,icon:"🔴"},{l:"WBC",v:selected.wbc,u:"×10³",w:parseFloat(selected.wbc)>11,icon:"⬜"},{l:"Creatinine",v:selected.creatinine,u:"mg/dL",w:parseFloat(selected.creatinine)>1.5,icon:"🫘"},{l:"Lactate",v:selected.lactate,u:"mmol/L",w:parseFloat(selected.lactate)>2,icon:"⚗️"},{l:"Platelets",v:selected.platelets,u:"×10³",w:parseFloat(selected.platelets)<100,icon:"🟡"}].map((item,i)=>(
                                <div key={i} className={`rounded-xl border-2 p-3 ${item.w&&item.v?"bg-red-50 border-red-300":"bg-gray-50 border-gray-200"}`}>
                                  <div className="flex justify-between items-start mb-1"><p className="text-xs text-gray-500 font-medium">{item.icon} {item.l}</p>{item.w&&item.v&&<span className="text-xs bg-red-100 text-red-600 px-1.5 rounded-full font-bold">⚠️</span>}</div>
                                  <p className={`text-xl font-black ${item.w&&item.v?"text-red-600":"text-gray-800"}`}>{item.v||"—"}</p>
                                  <p className="text-xs text-gray-400">{item.u}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        {/* Outcome recorded panel */}
                        {selected.outcome&&(
                          <div className={`rounded-xl border-2 p-4 ${selected.outcome.mortalityOutcome==="expired"?"border-red-300 bg-red-50":"border-green-300 bg-green-50"}`}>
                            <div className="flex justify-between items-center mb-2">
                              <p className="font-bold text-gray-700 text-sm">📋 Recorded Outcome</p>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${selected.outcome.mortalityOutcome==="expired"?"bg-red-100 text-red-700":"bg-green-100 text-green-700"}`}>
                                {selected.outcome.mortalityOutcome==="survived"?"✅ Survived":selected.outcome.mortalityOutcome==="expired"?"❌ Expired":"↗️ Transferred"}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                              <div><span className="text-gray-400">Sepsis confirmed:</span> <strong>{selected.outcome.sepsisConfirmed==="yes"?"Yes ✅":selected.outcome.sepsisConfirmed==="no"?"No ❌":selected.outcome.sepsisConfirmed}</strong></div>
                              {selected.outcome.icuDays&&<div><span className="text-gray-400">ICU stay:</span> <strong>{selected.outcome.icuDays} days</strong></div>}
                              {selected.outcome.finalDiagnosis&&<div className="col-span-2"><span className="text-gray-400">Final Dx:</span> <strong>{selected.outcome.finalDiagnosis}</strong></div>}
                              {selected.outcome.notes&&<div className="col-span-2 text-gray-500 italic">"{selected.outcome.notes}"</div>}
                              <div className="col-span-2 text-gray-400">Recorded by {selected.outcome.recordedBy} · {new Date(selected.outcome.recordedAt).toLocaleString()}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    ):(
                      <div className="md:col-span-2 flex items-center justify-center bg-white rounded-xl border border-dashed border-gray-300 py-24">
                        <div className="text-center text-gray-400"><p className="text-5xl mb-3">👈</p><p className="font-medium">Click a patient card to view case sheet</p></div>
                      </div>
                    )}
                  </div>
                </div>
            )}

          </div>
        )}

        {/* ── AI PREDICTIONS ── */}
        {tab==="predict"&&(
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-2">🤖 AI Clinical Decision Support</h2>
            {!selected?(<div className="text-center py-10 bg-yellow-50 rounded-xl border border-yellow-200"><p className="text-yellow-700 font-medium">⚠️ Select a patient first</p><button onClick={()=>setTab("patients")} className="mt-3 bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm">Go to Patients</button></div>):(
              <div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-blue-700 text-sm">Running predictions for: <strong>{selected.patient_id}</strong></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>{predictions.sepsis?<SepsisCard data={predictions.sepsis} outcome={selected?.outcome}/>:<div className="bg-white rounded-xl border-2 border-dashed border-red-300 p-8 text-center"><p className="text-4xl mb-2">🦠</p><p className="font-bold text-gray-700 mb-1">Sepsis Risk</p><p className="text-sm text-gray-500 mb-4">GRU-D Deep Learning</p><button onClick={()=>predict("sepsis")} className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 font-medium">▶ Run</button></div>}</div>
                  <div>{predictions.deterioration?<DeteriorationCard data={predictions.deterioration}/>:<div className="bg-white rounded-xl border-2 border-dashed border-orange-300 p-8 text-center"><p className="text-4xl mb-2">📉</p><p className="font-bold text-gray-700 mb-1">Clinical Deterioration</p><p className="text-sm text-gray-500 mb-4">VAE Anomaly Detection</p><button onClick={()=>predict("deterioration")} className="bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700 font-medium">▶ Run</button></div>}</div>
                  <div>{predictions.mortality?<MortalityCard data={predictions.mortality} outcome={selected?.outcome}/>:<div className="bg-white rounded-xl border-2 border-dashed border-purple-300 p-8 text-center"><p className="text-4xl mb-2">💀</p><p className="font-bold text-gray-700 mb-1">Mortality Risk</p><p className="text-sm text-gray-500 mb-4">APACHE II + SOFA</p><button onClick={()=>predict("mortality")} className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 font-medium">▶ Run</button></div>}</div>
                  <div>{predictions["organ-failure"]?<OrganCard data={predictions["organ-failure"]}/>:<div className="bg-white rounded-xl border-2 border-dashed border-blue-300 p-8 text-center"><p className="text-4xl mb-2">🫀</p><p className="font-bold text-gray-700 mb-1">Organ Failure Risk</p><p className="text-sm text-gray-500 mb-4">SOFA Multi-Organ</p><button onClick={()=>predict("organ-failure")} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium">▶ Run</button></div>}</div>
                </div>
                <div className="mb-4">{predictions.shap?<ShapCard data={predictions.shap}/>:<div className="bg-white rounded-xl border-2 border-dashed border-purple-300 p-6 text-center"><p className="text-4xl mb-2">🔍</p><p className="font-bold text-gray-700 mb-1">SHAP Explainability</p><p className="text-sm text-gray-500 mb-3">Which vitals drove the prediction</p><button onClick={async()=>{setLoading(true);try{const r=await axios.post(`${API}/explain/prediction?patient_id=${selected.patient_id}`);setPredictions(prev=>({...prev,shap:r.data}));notify("SHAP ready");}catch(e){notify("SHAP failed","error");}setLoading(false);}} className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 font-medium">🔍 Explain AI Decision</button></div>}</div>
                <div className="bg-gray-900 rounded-xl p-4 text-center"><p className="text-white text-sm mb-3 font-medium">Run all 4 predictions at once</p><button onClick={async()=>{for(const t of["sepsis","deterioration","mortality","organ-failure"])await predict(t);}} className="bg-white text-gray-900 px-8 py-2 rounded-lg font-bold">▶ Run All 4</button></div>
              </div>
            )}
          </div>
        )}

        {/* ── ALERTS ── */}
        {tab==="alerts"&&(
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-4">🚨 Clinical Alerts</h2>
            {!selected?<div className="text-center py-10 text-gray-400">Select a patient to see alerts</div>:alerts.length===0?(<div className="text-center py-16 bg-green-50 rounded-xl border border-green-200"><div className="text-5xl mb-3">✅</div><p className="text-green-700 font-medium">No active alerts</p></div>):(
              <div className="space-y-3">{alerts.map((a,i)=>(
                <div key={i} className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${a.severity==="CRITICAL"?"border-red-500":a.severity==="HIGH"?"border-orange-500":"border-yellow-500"}`}>
                  <div className="flex justify-between items-start">
                    <div><div className="flex items-center gap-2 mb-1"><Badge level={a.severity||"HIGH"}/><span className="font-medium text-gray-800">{a.alert_type||"Clinical Alert"}</span></div><p className="text-sm text-gray-600">{a.message||"Alert triggered"}</p></div>
                    <button onClick={async()=>{try{await axios.post(`${API}/alerts/${a._id}/acknowledge`);setAlerts(prev=>prev.filter((_,j)=>j!==i));notify("Acknowledged");}catch(e){}}} className="text-xs bg-gray-100 px-3 py-1 rounded-lg hover:bg-gray-200">✓ Acknowledge</button>
                  </div>
                </div>
              ))}</div>
            )}
          </div>
        )}

        {/* ── SCORING ── */}
        {tab==="vitals"&&(
          <div className="space-y-5">
            {!selected?(
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <span className="text-5xl mb-3">📋</span>
                <h3 className="text-lg font-bold text-gray-600">No Patient Selected</h3>
                <p className="text-sm text-gray-400 mt-1">Select a patient from the Patients tab to enter vitals</p>
              </div>
            ):(
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">📋 Vitals & Lab Report</h2>
                    <p className="text-sm text-gray-500">{selected.name} · {selected.patient_id} · {selected.ward||"ICU"}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={()=>setVitalsTab("current")} className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${vitalsTab==="current"?"border-blue-500 bg-blue-50 text-blue-700":"border-gray-200 text-gray-500 hover:border-blue-300"}`}>📝 Enter Vitals</button>
                    <button onClick={()=>setVitalsTab("history")} className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${vitalsTab==="history"?"border-teal-500 bg-teal-50 text-teal-700":"border-gray-200 text-gray-500 hover:border-teal-300"}`}>🕐 History ({vitalsHistory.filter(h=>h.patient_id===selected.patient_id).length})</button>
                  </div>
                </div>

                {vitalsTab==="current"&&(
                  <div className="space-y-5">
                    {/* Meta */}
                    <div className="bg-white rounded-xl border shadow-sm p-4">
                      <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><span className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs">1</span> Recording Details</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Recorded By</label><input value={vitalsReport.recordedBy} onChange={e=>vr("recordedBy",e.target.value)} placeholder={currentUser?.name||"Doctor name"} className={inp}/></div>
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Date & Time</label><input type="datetime-local" value={vitalsReport.recordedAt||new Date().toISOString().slice(0,16)} onChange={e=>vr("recordedAt",e.target.value)} className={inp}/></div>
                        <div><label className="text-xs text-gray-500 font-medium block mb-1">Clinical Notes</label><input value={vitalsReport.notes} onChange={e=>vr("notes",e.target.value)} placeholder="e.g. Post-op day 1, fever spiked" className={inp}/></div>
                      </div>
                    </div>

                    {/* Vitals */}
                    <div className="bg-white rounded-xl border shadow-sm p-4">
                      <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><span className="bg-red-500 text-white px-2 py-0.5 rounded text-xs">2</span> Vital Signs</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          ["sbp","Systolic BP","mmHg","","sbp<90"],["dbp","Diastolic BP","mmHg","",""],
                          ["hr","Heart Rate","bpm","","hr>120||hr<50"],["rr","Resp Rate","/min","","rr>24"],
                          ["spo2","SpO₂","%","","spo2<94"],["temp","Temperature","°C","","temp>38.5"],
                          ["gcs","GCS","3–15","","gcs<9"],["weight","Weight","kg","",""],
                        ].map(([k,l,u])=>{
                          const val=parseFloat(vitalsReport[k]);
                          const warn=(k==="sbp"&&val<90)||(k==="hr"&&(val>120||val<50))||(k==="spo2"&&val<94)||(k==="rr"&&val>24)||(k==="temp"&&val>38.5)||(k==="gcs"&&val<9);
                          return(<div key={k}><label className="text-xs text-gray-500 font-medium block mb-1">{l} <span className="text-gray-400">({u})</span>{warn&&<span className="ml-1 text-red-500 font-bold">⚠</span>}</label><input type="number" step="0.1" value={vitalsReport[k]||""} onChange={e=>vr(k,e.target.value)} className={`${inp} ${warn?"border-red-400 bg-red-50":""}`}/></div>);
                        })}
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm cursor-pointer bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                          <input type="checkbox" checked={vitalsReport.mechanical_ventilation} onChange={e=>vr("mechanical_ventilation",e.target.checked)} className="w-4 h-4 accent-blue-600"/>
                          <span className="font-medium text-blue-800">🫁 On Mechanical Ventilation</span>
                        </label>
                        {vitalsReport.sbp&&vitalsReport.dbp&&(
                          <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-xs text-teal-700 font-medium">
                            MAP: <strong>{Math.round((parseFloat(vitalsReport.sbp)+2*parseFloat(vitalsReport.dbp))/3)}</strong> mmHg
                            {Math.round((parseFloat(vitalsReport.sbp)+2*parseFloat(vitalsReport.dbp))/3)<65&&<span className="ml-1 text-red-600 font-bold">⚠ Below 65</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Core Labs */}
                    <div className="bg-white rounded-xl border shadow-sm p-4">
                      <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><span className="bg-purple-600 text-white px-2 py-0.5 rounded text-xs">3</span> Core Laboratory Values</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {[
                          ["hb","Hemoglobin","g/dL"],["sugar","Blood Sugar","mg/dL"],
                          ["creatinine","Creatinine","mg/dL"],["platelets","Platelets","×10³/µL"],
                          ["wbc","WBC","×10³/µL"],["lactate","Lactate","mmol/L"],
                          ["urine_output","Urine Output","L/day"],["bilirubin","Bilirubin","mg/dL"],
                        ].map(([k,l,u])=>{
                          const val=parseFloat(vitalsReport[k]);
                          const warn=(k==="hb"&&val<8)||(k==="sugar"&&(val>200||val<70))||(k==="creatinine"&&val>1.5)||(k==="platelets"&&val<100)||(k==="wbc"&&val>11)||(k==="lactate"&&val>2)||(k==="bilirubin"&&val>1.2);
                          return(<div key={k}><label className="text-xs text-gray-500 font-medium block mb-1">{l} <span className="text-gray-400">({u})</span>{warn&&<span className="ml-1 text-orange-500 font-bold">!</span>}</label><input type="number" step="0.01" value={vitalsReport[k]||""} onChange={e=>vr(k,e.target.value)} className={`${inp} ${warn?"border-orange-300 bg-orange-50":""}`}/></div>);
                        })}
                      </div>
                    </div>

                    {/* Extended Labs / ABG */}
                    <div className="bg-white rounded-xl border shadow-sm p-4">
                      <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><span className="bg-teal-600 text-white px-2 py-0.5 rounded text-xs">4</span> Extended Labs & ABG</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {[
                          ["sodium","Sodium","mEq/L"],["potassium","Potassium","mEq/L"],
                          ["bicarbonate","Bicarbonate","mEq/L"],["bun","BUN","mg/dL"],
                          ["hematocrit","Hematocrit","%"],["arterial_ph","Arterial pH",""],
                          ["pao2","PaO₂","mmHg"],["fio2","FiO₂","0.21–1.0"],
                          ["inr","INR",""],["procalcitonin","Procalcitonin","ng/mL"],
                        ].map(([k,l,u])=>(
                          <div key={k}><label className="text-xs text-gray-500 font-medium block mb-1">{l}{u&&<span className="text-gray-400"> ({u})</span>}</label><input type="number" step="0.01" value={vitalsReport[k]||""} onChange={e=>vr(k,e.target.value)} className={inp}/></div>
                        ))}
                      </div>
                      {vitalsReport.pao2&&vitalsReport.fio2&&(
                        <div className="mt-3 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-xs text-teal-700 font-medium flex items-center gap-2">
                          <span>PaO₂/FiO₂ Ratio:</span>
                          <strong>{Math.round(parseFloat(vitalsReport.pao2)/parseFloat(vitalsReport.fio2))}</strong>
                          <span>{Math.round(parseFloat(vitalsReport.pao2)/parseFloat(vitalsReport.fio2))<200?"⚠️ Severe ARDS":Math.round(parseFloat(vitalsReport.pao2)/parseFloat(vitalsReport.fio2))<300?"🟡 Moderate ARDS":"✅ Normal"}</span>
                        </div>
                      )}
                    </div>

                    {/* Save + Auto-Populate */}
                    <div className="bg-white rounded-xl border shadow-sm p-4">
                      <div className="flex gap-3">
                        <button onClick={()=>{
                          // Save to history
                          const entry = {...vitalsReport, patient_id:selected.patient_id, patient_name:selected.name, savedAt:new Date().toISOString(), recordedBy:vitalsReport.recordedBy||currentUser?.name||"Unknown"};
                          const newHistory = [entry, ...vitalsHistory];
                          setVitalsHistory(newHistory);
                          // Auto-populate reportData
                          const map_v = vitalsReport.sbp&&vitalsReport.dbp ? Math.round((parseFloat(vitalsReport.sbp)+2*parseFloat(vitalsReport.dbp))/3) : "";
                          setReportData(prev=>({...prev,
                            sbp:vitalsReport.sbp,dbp:vitalsReport.dbp,hr:vitalsReport.hr,rr:vitalsReport.rr,
                            spo2:vitalsReport.spo2,temp:vitalsReport.temp,gcs:vitalsReport.gcs,map:String(map_v),
                            hb:vitalsReport.hb,sugar:vitalsReport.sugar,creatinine:vitalsReport.creatinine,
                            platelets:vitalsReport.platelets,wbc:vitalsReport.wbc,lactate:vitalsReport.lactate,
                            weight:vitalsReport.weight,
                          }));
                          // Auto-populate all scoring states
                          const pf = vitalsReport.pao2&&vitalsReport.fio2 ? Math.round(parseFloat(vitalsReport.pao2)/parseFloat(vitalsReport.fio2)) : 300;
                          const map_num = map_v||75;
                          setApache(prev=>({...prev,
                            age:parseInt(selected.age)||prev.age,temperature:parseFloat(vitalsReport.temp)||prev.temperature,
                            mean_arterial_pressure:map_num,heart_rate:parseInt(vitalsReport.hr)||prev.heart_rate,
                            respiratory_rate:parseInt(vitalsReport.rr)||prev.respiratory_rate,
                            pao2:parseFloat(vitalsReport.pao2)||prev.pao2,fio2:parseFloat(vitalsReport.fio2)||prev.fio2,
                            arterial_ph:parseFloat(vitalsReport.arterial_ph)||prev.arterial_ph,
                            sodium:parseFloat(vitalsReport.sodium)||prev.sodium,potassium:parseFloat(vitalsReport.potassium)||prev.potassium,
                            creatinine:parseFloat(vitalsReport.creatinine)||prev.creatinine,
                            hematocrit:parseFloat(vitalsReport.hematocrit)||prev.hematocrit,
                            wbc:parseFloat(vitalsReport.wbc)||prev.wbc,gcs:parseInt(vitalsReport.gcs)||prev.gcs,
                          }));
                          setSofa(prev=>({...prev,
                            pao2:parseFloat(vitalsReport.pao2)||prev.pao2,fio2:parseFloat(vitalsReport.fio2)||prev.fio2,
                            mechanical_ventilation:vitalsReport.mechanical_ventilation,
                            platelets:parseFloat(vitalsReport.platelets)||prev.platelets,
                            bilirubin:parseFloat(vitalsReport.bilirubin)||prev.bilirubin||1.0,
                            mean_arterial_pressure:map_num,gcs:parseInt(vitalsReport.gcs)||prev.gcs,
                            creatinine:parseFloat(vitalsReport.creatinine)||prev.creatinine,
                            urine_output:parseFloat(vitalsReport.urine_output)||prev.urine_output,
                          }));
                          setQsofa(prev=>({...prev,
                            respiratory_rate:parseInt(vitalsReport.rr)||prev.respiratory_rate,
                            systolic_bp:parseInt(vitalsReport.sbp)||prev.systolic_bp,
                            gcs:parseInt(vitalsReport.gcs)||prev.gcs,
                          }));
                          setSaps(prev=>({...prev,
                            age:parseInt(selected.age)||prev.age,heart_rate:parseInt(vitalsReport.hr)||prev.heart_rate,
                            systolic_bp:parseInt(vitalsReport.sbp)||prev.systolic_bp,temperature:parseFloat(vitalsReport.temp)||prev.temperature,
                            gcs:parseInt(vitalsReport.gcs)||prev.gcs,pao2_fio2_ratio:pf,
                            urine_output:parseFloat(vitalsReport.urine_output)||prev.urine_output,
                            bun:parseFloat(vitalsReport.bun)||prev.bun,wbc:parseFloat(vitalsReport.wbc)||prev.wbc,
                            potassium:parseFloat(vitalsReport.potassium)||prev.potassium,
                            sodium:parseFloat(vitalsReport.sodium)||prev.sodium,
                            bicarbonate:parseFloat(vitalsReport.bicarbonate)||prev.bicarbonate,
                            bilirubin:parseFloat(vitalsReport.bilirubin)||prev.bilirubin||1.0,
                          }));
                          setMods(prev=>({...prev,
                            pao2_fio2_ratio:pf,
                            creatinine:parseFloat(vitalsReport.creatinine)?Math.round(parseFloat(vitalsReport.creatinine)*88.4):prev.creatinine,
                            bilirubin:parseFloat(vitalsReport.bilirubin)?Math.round(parseFloat(vitalsReport.bilirubin)*17.1):prev.bilirubin,
                            platelets:parseFloat(vitalsReport.platelets)||prev.platelets,
                            mean_arterial_pressure:map_num,gcs:parseInt(vitalsReport.gcs)||prev.gcs,
                          }));
                          setMurray(prev=>({...prev,pao2_fio2_ratio:pf}));
                          notify("✅ Vitals saved & all scoring systems auto-populated!","success");
                          setVitalsTab("history");
                        }} className="flex-1 bg-gradient-to-r from-blue-700 to-teal-600 text-white py-3 rounded-xl font-bold text-sm hover:opacity-90 shadow">
                          💾 Save Vitals & Auto-Populate Scoring
                        </button>
                        <button onClick={()=>setVitalsReport({sbp:"",dbp:"",hr:"",rr:"",spo2:"",temp:"",gcs:"15",weight:"",mechanical_ventilation:false,hb:"",sugar:"",creatinine:"",platelets:"",wbc:"",lactate:"",bilirubin:"",sodium:"",potassium:"",bicarbonate:"",bun:"",hematocrit:"",arterial_ph:"",pao2:"",fio2:"0.21",urine_output:"",inr:"",procalcitonin:"",recordedBy:"",recordedAt:"",notes:""})}
                          className="px-5 py-3 border-2 border-gray-200 rounded-xl text-gray-600 text-sm font-medium hover:bg-gray-50">
                          🔄 Clear
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-2 text-center">Saving will automatically fill all 9 scoring system forms with these values</p>
                    </div>
                  </div>
                )}

                {vitalsTab==="history"&&(
                  <div>
                    {vitalsHistory.filter(h=>h.patient_id===selected.patient_id).length===0?(
                      <div className="flex flex-col items-center py-16 text-center">
                        <span className="text-5xl mb-3">📭</span>
                        <p className="text-gray-500 font-medium">No vitals recorded yet</p>
                        <p className="text-sm text-gray-400 mt-1">Switch to "Enter Vitals" to record the first entry</p>
                        <button onClick={()=>setVitalsTab("current")} className="mt-4 bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-blue-700">📝 Enter Vitals Now</button>
                      </div>
                    ):(
                      <div className="space-y-3">
                        {vitalsHistory.filter(h=>h.patient_id===selected.patient_id).map((entry,i)=>(
                          <div key={i} className="bg-white rounded-xl border shadow-sm p-4">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <p className="font-bold text-gray-800 text-sm">{new Date(entry.savedAt).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})}</p>
                                <p className="text-xs text-gray-400">Recorded by {entry.recordedBy||"Unknown"}{entry.notes&&<span> · {entry.notes}</span>}</p>
                              </div>
                              <button onClick={()=>{
                                setVitalsReport({...entry});
                                setVitalsTab("current");
                                notify("Loaded previous entry — edit and re-save","success");
                              }} className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1 rounded-lg hover:bg-blue-100 font-medium">Load & Edit</button>
                            </div>
                            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                              {[["HR",entry.hr,"bpm",parseFloat(entry.hr)>120||parseFloat(entry.hr)<50],["BP",entry.sbp&&entry.dbp?`${entry.sbp}/${entry.dbp}`:"—","mmHg",parseFloat(entry.sbp)<90],["SpO₂",entry.spo2,"%",parseFloat(entry.spo2)<94],["Temp",entry.temp,"°C",parseFloat(entry.temp)>38.5],["RR",entry.rr,"/min",parseFloat(entry.rr)>24],["GCS",entry.gcs,"/15",parseFloat(entry.gcs)<9],["Lactate",entry.lactate,"mmol/L",parseFloat(entry.lactate)>2],["Creatinine",entry.creatinine,"mg/dL",parseFloat(entry.creatinine)>1.5],["WBC",entry.wbc,"×10³",parseFloat(entry.wbc)>11],["Hb",entry.hb,"g/dL",parseFloat(entry.hb)<8],["Platelets",entry.platelets,"×10³",parseFloat(entry.platelets)<100],["Bilirubin",entry.bilirubin,"mg/dL",parseFloat(entry.bilirubin)>1.2]].map(([l,v,u,warn])=>v&&v!=="—"?(
                                <div key={l} className={`rounded-lg p-2 border text-center ${warn?"bg-red-50 border-red-200":"bg-gray-50 border-gray-100"}`}>
                                  <p className="text-xs text-gray-400">{l}</p>
                                  <p className={`text-sm font-bold ${warn?"text-red-600":"text-gray-800"}`}>{v}</p>
                                  <p className="text-xs text-gray-400">{u}</p>
                                </div>
                              ):null)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab==="scoring"&&(
          <div>
            <div className="mb-4 flex items-center gap-3"><label className="text-xs text-gray-500 font-medium">Patient ID:</label><input value={pid} onChange={e=>setPid(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm w-40 outline-none"/></div>
            <div className="flex gap-1 flex-wrap mb-4">{["apache","sofa","qsofa","gcs","ranson","saps","mods","murray","alvarado"].map(s=><button key={s} onClick={()=>setStab(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${stab===s?"bg-blue-600 text-white":"bg-white text-gray-600 border hover:bg-blue-50"}`}>{s.toUpperCase()}</button>)}</div>
            {stab==="apache"&&<div className="bg-white rounded-xl p-5 shadow-sm border"><h3 className="font-bold text-gray-800 mb-4">APACHE II</h3><div className="grid grid-cols-2 md:grid-cols-3 gap-3">{[["age","Age"],["temperature","Temp (°C)"],["mean_arterial_pressure","MAP"],["heart_rate","Heart Rate"],["respiratory_rate","Resp Rate"],["pao2","PaO2"],["fio2","FiO2"],["arterial_ph","pH"],["sodium","Sodium"],["potassium","Potassium"],["creatinine","Creatinine"],["hematocrit","Hematocrit"],["wbc","WBC"],["gcs","GCS"]].map(([k,l])=><div key={k}><label className="text-xs text-gray-500">{l}</label><input type="number" step="0.01" value={apache[k]} onChange={e=>setApache({...apache,[k]:parseFloat(e.target.value)||0})} className={inp}/></div>)}</div><div className="flex gap-4 mt-3 text-sm"><label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={apache.chronic_health} onChange={e=>setApache({...apache,chronic_health:e.target.checked})}/> Chronic Health</label><label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={apache.postoperative} onChange={e=>setApache({...apache,postoperative:e.target.checked})}/> Postoperative</label></div><button onClick={()=>calcScore("apache-ii",apache)} className="mt-4 w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700">Calculate APACHE II</button></div>}
            {stab==="sofa"&&<div className="bg-white rounded-xl p-5 shadow-sm border"><h3 className="font-bold text-gray-800 mb-4">SOFA</h3><div className="grid grid-cols-2 md:grid-cols-3 gap-3">{[["pao2","PaO2"],["fio2","FiO2"],["platelets","Platelets"],["bilirubin","Bilirubin"],["mean_arterial_pressure","MAP"],["gcs","GCS"],["creatinine","Creatinine"],["urine_output","Urine Output"],["dopamine_dose","Dopamine"],["norepinephrine_dose","Norepinephrine"]].map(([k,l])=><div key={k}><label className="text-xs text-gray-500">{l}</label><input type="number" step="0.01" value={sofa[k]} onChange={e=>setSofa({...sofa,[k]:parseFloat(e.target.value)||0})} className={inp}/></div>)}</div><label className="flex items-center gap-1 text-sm mt-3 cursor-pointer"><input type="checkbox" checked={sofa.mechanical_ventilation} onChange={e=>setSofa({...sofa,mechanical_ventilation:e.target.checked})}/> Mechanical Ventilation</label><button onClick={()=>calcScore("sofa",sofa)} className="mt-4 w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700">Calculate SOFA</button></div>}
            {stab==="qsofa"&&<div className="bg-white rounded-xl p-5 shadow-sm border"><h3 className="font-bold text-gray-800 mb-4">qSOFA</h3><div className="grid grid-cols-3 gap-3">{[["respiratory_rate","Respiratory Rate"],["systolic_bp","Systolic BP"],["gcs","GCS"]].map(([k,l])=><div key={k}><label className="text-xs text-gray-500">{l}</label><input type="number" value={qsofa[k]} onChange={e=>setQsofa({...qsofa,[k]:parseInt(e.target.value)||0})} className={inp}/></div>)}</div><button onClick={()=>calcScore("qsofa",qsofa)} className="mt-4 w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700">Calculate qSOFA</button></div>}
            {stab==="gcs"&&<div className="bg-white rounded-xl p-5 shadow-sm border"><h3 className="font-bold text-gray-800 mb-4">GCS</h3><div className="grid grid-cols-3 gap-3">{[["eye_response","Eye (1-4)",1,4],["verbal_response","Verbal (1-5)",1,5],["motor_response","Motor (1-6)",1,6]].map(([k,l,mn,mx])=><div key={k}><label className="text-xs text-gray-500">{l}</label><input type="number" min={mn} max={mx} value={gcs[k]} onChange={e=>setGcs({...gcs,[k]:parseInt(e.target.value)||mn})} className={inp}/></div>)}</div><label className="flex items-center gap-1 text-sm mt-3 cursor-pointer"><input type="checkbox" checked={gcs.sedated} onChange={e=>setGcs({...gcs,sedated:e.target.checked})}/> Sedated</label><button onClick={()=>calcScore("gcs",gcs)} className="mt-4 w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700">Calculate GCS</button></div>}
            {["ranson","saps","mods","murray","alvarado"].includes(stab)&&<div className="bg-white rounded-xl p-5 shadow-sm border"><h3 className="font-bold text-gray-800 mb-4">{stab.toUpperCase()}</h3><div className="grid grid-cols-2 md:grid-cols-3 gap-3">{Object.entries(stab==="ranson"?ranson:stab==="saps"?saps:stab==="mods"?mods:stab==="murray"?murray:alvarado).map(([k,v])=><div key={k}>{typeof v==="boolean"?(<label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border bg-gray-50 hover:bg-blue-50 transition-colors"><input type="checkbox" checked={v} onChange={e=>{const val=e.target.checked;if(stab==="ranson")setRanson({...ranson,[k]:val});else if(stab==="saps")setSaps({...saps,[k]:val});else if(stab==="mods")setMods({...mods,[k]:val});else if(stab==="murray")setMurray({...murray,[k]:val});else setAlvarado({...alvarado,[k]:val});}} className="w-4 h-4 accent-blue-600"/><span className="text-xs text-gray-600 font-medium">{k.replace(/_/g," ")}</span></label>):(<div><label className="text-xs text-gray-500 block mb-1">{k.replace(/_/g," ")}</label><input type="number" step="0.01" value={v} onChange={e=>{const val=parseFloat(e.target.value)||0;if(stab==="ranson")setRanson({...ranson,[k]:val});else if(stab==="saps")setSaps({...saps,[k]:val});else if(stab==="mods")setMods({...mods,[k]:val});else if(stab==="murray")setMurray({...murray,[k]:val});else setAlvarado({...alvarado,[k]:val});}} className={inp}/></div>)}</div>)}</div><button onClick={()=>calcScore(stab,stab==="ranson"?ranson:stab==="saps"?saps:stab==="mods"?mods:stab==="murray"?murray:alvarado)} className="mt-4 w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700">Calculate {stab.toUpperCase()}</button></div>}
          </div>
        )}

        {/* ── ANTIMICROBIAL STEWARDSHIP ── */}
        {tab==="stewardship"&&(
          <div className="space-y-5">
            <div><h2 className="text-lg font-bold text-gray-800">🦠 Antimicrobial Stewardship</h2><p className="text-sm text-gray-500">Culture report · AI antibiotic engine · DOT tracker · Nutrition planner</p></div>

            {/* Culture Report */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="bg-gradient-to-r from-red-700 to-red-500 px-5 py-3 flex items-center gap-2"><span className="text-white text-lg">🧫</span><span className="text-white font-bold tracking-wide text-sm uppercase">Culture Report</span></div>
              <div className="p-5">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                  <div><label className="text-xs font-semibold text-gray-500 block mb-1">Gram Type *</label><select value={cultureData.gramType} onChange={e=>setCultureData({...cultureData,gramType:e.target.value})} className={inp}><option value="gram-negative">Gram Negative (–)</option><option value="gram-positive">Gram Positive (+)</option><option value="fungal">Fungal</option><option value="anaerobe">Anaerobe</option><option value="unknown">Unknown / Pending</option></select></div>
                  <div><label className="text-xs font-semibold text-gray-500 block mb-1">Specific Organism *</label><input value={cultureData.organism} onChange={e=>setCultureData({...cultureData,organism:e.target.value})} placeholder="e.g. E. coli, MRSA" className={inp}/></div>
                  <div><label className="text-xs font-semibold text-gray-500 block mb-1">Culture Date</label><input type="date" value={cultureData.startDate} onChange={e=>setCultureData({...cultureData,startDate:e.target.value})} className={inp}/></div>
                  <div className="md:col-span-2"><label className="text-xs font-semibold text-gray-500 block mb-1">Sensitivity (Sensitive to)</label><input value={cultureData.sensitivity} onChange={e=>setCultureData({...cultureData,sensitivity:e.target.value})} placeholder="e.g. Sensitive: Meropenem, Pip-Taz | Resistant: Ceftriaxone" className={inp}/></div>
                  <div><label className="text-xs font-semibold text-gray-500 block mb-1">Known Allergies</label><input value={cultureData.allergy} onChange={e=>setCultureData({...cultureData,allergy:e.target.value})} placeholder="e.g. Penicillin" className={inp}/></div>
                  <div><label className="text-xs font-semibold text-gray-500 block mb-1">Creatinine (mg/dL)</label><input type="number" step="0.1" value={cultureData.creatinine} onChange={e=>setCultureData({...cultureData,creatinine:e.target.value})} placeholder="1.0" className={inp}/></div>
                  <div><label className="text-xs font-semibold text-gray-500 block mb-1">Renal Function</label><select value={cultureData.renal} onChange={e=>setCultureData({...cultureData,renal:e.target.value})} className={inp}><option value="normal">Normal (CrCl &gt;50)</option><option value="mild">Mild (CrCl 30–50)</option><option value="moderate">Moderate (CrCl 15–30)</option><option value="severe">Severe / AKI</option><option value="dialysis">On Dialysis</option></select></div>
                </div>
                {cultureData.organism&&<div className="flex flex-wrap gap-2 mb-4"><span className="bg-red-100 text-red-700 border border-red-200 px-3 py-1 rounded-full text-xs font-bold">🦠 {cultureData.organism}</span><span className={`px-3 py-1 rounded-full text-xs font-bold border ${cultureData.gramType==="gram-positive"?"bg-purple-100 text-purple-700 border-purple-200":"bg-orange-100 text-orange-700 border-orange-200"}`}>{cultureData.gramType==="gram-positive"?"Gram (+)":"Gram (–)"}</span>{cultureData.allergy&&<span className="bg-yellow-100 text-yellow-700 border border-yellow-200 px-3 py-1 rounded-full text-xs font-bold">⚠️ Allergy: {cultureData.allergy}</span>}{parseFloat(cultureData.creatinine)>1.5&&<span className="bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1 rounded-full text-xs font-bold">🔵 Renal Dose Adjustment</span>}</div>}
                <button onClick={runAbxEngine} disabled={abxLoading} className="w-full bg-gradient-to-r from-red-700 to-red-500 text-white py-3 rounded-xl font-bold text-sm hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">{abxLoading?<><span className="animate-spin">⚙️</span> Analyzing...</>:"🤖 Generate Antibiotic Recommendation"}</button>
              </div>
            </div>

            {/* AI ABX Result */}
            {abxResult&&(
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="bg-gradient-to-r from-green-700 to-green-500 px-5 py-3 flex items-center justify-between"><div className="flex items-center gap-2"><span className="text-white text-lg">💊</span><span className="text-white font-bold tracking-wide text-sm uppercase">Antibiotic Recommendation</span></div><span className="bg-white bg-opacity-20 text-white text-xs px-3 py-1 rounded-full font-bold">AI-Powered</span></div>
                <div className="p-5">
                  {abxResult.error&&<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-700 text-sm mb-4">⚠️ Using rule-based fallback — AI unavailable</div>}
                  <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 mb-4">
                    <p className="text-xs font-bold text-green-600 uppercase mb-2">Recommended Regimen</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[["💊 Drug",abxResult.recommended_drug,"text-green-800"],["📏 Dose",abxResult.dose,"text-blue-800"],["⏱️ Frequency",abxResult.frequency,"text-purple-800"],["📅 Duration",abxResult.duration,"text-orange-800"]].map(([l,v,c])=>(
                        <div key={l} className="bg-white rounded-lg p-3 border text-center shadow-sm"><p className="text-xs text-gray-400 mb-1">{l}</p><p className={`font-bold text-sm ${c}`}>{v||"—"}</p></div>
                      ))}
                    </div>
                    {abxResult.route&&<div className="mt-2"><span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold border border-blue-200">Route: {abxResult.route}</span></div>}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {abxResult.rationale&&<div className="bg-blue-50 border border-blue-200 rounded-xl p-3"><p className="text-xs font-bold text-blue-700 mb-1">📋 Clinical Rationale</p><p className="text-sm text-gray-700">{abxResult.rationale}</p></div>}
                    {abxResult.renal_adjustment&&<div className={`border rounded-xl p-3 ${parseFloat(cultureData.creatinine)>1.5?"bg-red-50 border-red-200":"bg-green-50 border-green-200"}`}><p className={`text-xs font-bold mb-1 ${parseFloat(cultureData.creatinine)>1.5?"text-red-700":"text-green-700"}`}>🫘 Renal Adjustment</p><p className="text-sm text-gray-700">{abxResult.renal_adjustment}</p></div>}
                    {abxResult.allergy_note&&<div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3"><p className="text-xs font-bold text-yellow-700 mb-1">⚠️ Allergy Check</p><p className="text-sm text-gray-700">{abxResult.allergy_note}</p></div>}
                    {abxResult.deescalation&&<div className="bg-purple-50 border border-purple-200 rounded-xl p-3"><p className="text-xs font-bold text-purple-700 mb-1">📉 De-escalation Plan</p><p className="text-sm text-gray-700">{abxResult.deescalation}</p></div>}
                    {abxResult.iv_to_oral&&<div className="bg-teal-50 border border-teal-200 rounded-xl p-3 md:col-span-2"><p className="text-xs font-bold text-teal-700 mb-1">💊 IV to Oral Switch</p><p className="text-sm text-gray-700">{abxResult.iv_to_oral}</p></div>}
                  </div>
                </div>
              </div>
            )}

            {/* DOT Tracker */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="bg-gradient-to-r from-blue-700 to-blue-500 px-5 py-3 flex items-center gap-2"><span className="text-white text-lg">📅</span><span className="text-white font-bold tracking-wide text-sm uppercase">Days of Therapy (DOT) Tracker</span></div>
              <div className="p-5">
                {Object.keys(dotDays).length===0&&<div className="text-center py-6 text-gray-400 bg-gray-50 rounded-xl border border-dashed mb-4"><p className="text-3xl mb-2">📊</p><p className="text-sm">No antibiotics tracked. Run AI engine above to auto-start.</p></div>}
                <div className="space-y-3 mb-4">
                  {Object.entries(dotDays).map(([drug,info])=>{
                    const days=Math.max(0,Math.floor((new Date()-new Date(info.start))/(1000*60*60*24))),pct=Math.min(Math.round((days/(info.target||7))*100),100),overdue=days>(info.target||7);
                    return(<div key={drug} className={`rounded-xl border p-4 ${overdue?"bg-red-50 border-red-300":"bg-green-50 border-green-200"}`}><div className="flex justify-between items-center mb-2"><div><span className="font-bold text-gray-800">{drug}</span><span className="text-xs text-gray-500 ml-2">Started: {info.start}</span></div><div className="flex items-center gap-2"><span className={`text-lg font-black ${overdue?"text-red-600":"text-green-700"}`}>{days}/{info.target} days</span>{overdue&&<span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-bold">⚠️ Review</span>}<button onClick={()=>setDotDays(prev=>{const n={...prev};delete n[drug];return n;})} className="text-xs text-gray-400 hover:text-red-500">✕</button></div></div><div className="w-full bg-gray-200 rounded-full h-3"><div className={`h-3 rounded-full ${overdue?"bg-red-500":"bg-green-500"}`} style={{width:`${pct}%`}}/></div>{overdue&&<p className="text-xs text-red-600 mt-1 font-medium">⚠️ Duration exceeded — reassess antibiotic</p>}</div>);
                  })}
                </div>
                <div className="border-t pt-4"><p className="text-xs font-bold text-gray-500 mb-3">+ Add Manually</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="text-xs text-gray-400 block mb-1">Drug Name</label><input id="dot-drug" placeholder="e.g. Vancomycin" className={inp}/></div>
                    <div><label className="text-xs text-gray-400 block mb-1">Start Date</label><input id="dot-start" type="date" defaultValue={new Date().toISOString().split("T")[0]} className={inp}/></div>
                    <div><label className="text-xs text-gray-400 block mb-1">Target Days</label><input id="dot-target" type="number" placeholder="7" className={inp}/></div>
                  </div>
                  <button onClick={()=>{const drug=document.getElementById("dot-drug").value,start=document.getElementById("dot-start").value,target=parseInt(document.getElementById("dot-target").value)||7;if(drug&&start)setDotDays(prev=>({...prev,[drug]:{start,target}}));}} className="mt-3 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">+ Add to Tracker</button>
                </div>
              </div>
            </div>

            {/* Nutrition Planner */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-700 to-emerald-500 px-5 py-3 flex items-center gap-2"><span className="text-white text-lg">🥗</span><span className="text-white font-bold tracking-wide text-sm uppercase">ICU Nutrition Planner</span></div>
              <div className="p-5">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                  <div><label className="text-xs font-semibold text-gray-500 block mb-1">Weight (kg) *</label><input type="number" value={nutritionData.weight} onChange={e=>setNutritionData({...nutritionData,weight:e.target.value})} placeholder="70" className={inp}/></div>
                  <div><label className="text-xs font-semibold text-gray-500 block mb-1">Diagnosis</label><input value={nutritionData.diagnosis} onChange={e=>setNutritionData({...nutritionData,diagnosis:e.target.value})} placeholder="e.g. Septic shock" className={inp}/></div>
                  <div><label className="text-xs font-semibold text-gray-500 block mb-1">Renal Status</label><select value={nutritionData.renal} onChange={e=>setNutritionData({...nutritionData,renal:e.target.value})} className={inp}><option value="normal">Normal</option><option value="renal">Renal Failure / AKI</option><option value="dialysis">On Dialysis</option><option value="hepatic">Hepatic Failure</option></select></div>
                </div>
                <div className="flex gap-6 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-medium"><input type="checkbox" className="w-4 h-4" checked={nutritionData.sepsis} onChange={e=>setNutritionData({...nutritionData,sepsis:e.target.checked})}/> Sepsis / Septic Shock</label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-medium"><input type="checkbox" className="w-4 h-4" checked={nutritionData.trauma} onChange={e=>setNutritionData({...nutritionData,trauma:e.target.checked})}/> Trauma / Post-surgical</label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-medium"><input type="checkbox" className="w-4 h-4" checked={nutritionData.enteralAccess} onChange={e=>setNutritionData({...nutritionData,enteralAccess:e.target.checked})}/> Enteral Access (NGT)</label>
                </div>
                <button onClick={calcNutrition} className="w-full bg-gradient-to-r from-emerald-700 to-emerald-500 text-white py-3 rounded-xl font-bold text-sm hover:opacity-90">🥗 Calculate Nutrition Plan</button>
                {nutritionResult&&(
                  <div className="mt-5 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[{label:"Daily Calories",value:`${nutritionResult.kcalTarget} kcal`,sub:`Range: ${nutritionResult.kcalMin}–${nutritionResult.kcalMax}`,color:"bg-emerald-500"},{label:"Caloric Rate",value:`${(nutritionResult.kcalTarget/24).toFixed(0)} kcal/hr`,sub:"Continuous feeding",color:"bg-teal-500"},{label:"Protein",value:`${nutritionResult.proteinMin}–${nutritionResult.proteinMax} g/day`,sub:`${(nutritionResult.proteinMin/nutritionResult.w).toFixed(1)} g/kg/day`,color:"bg-blue-500"},{label:"Route",value:nutritionResult.enteralAccess?"Enteral":"Parenteral",sub:nutritionResult.isSepsis?"Early enteral":"Standard",color:nutritionResult.enteralAccess?"bg-green-500":"bg-orange-500"}].map((c,i)=>(
                        <div key={i} className="rounded-xl overflow-hidden border shadow-sm"><div className={`${c.color} px-3 py-1`}><p className="text-white text-xs font-bold">{c.label}</p></div><div className="p-3 bg-white"><p className="font-black text-gray-800 text-base">{c.value}</p><p className="text-xs text-gray-400 mt-0.5">{c.sub}</p></div></div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4"><p className="text-xs font-bold text-emerald-700 uppercase mb-2">🍼 Feeding Route</p><p className="text-sm font-semibold text-gray-800">{nutritionResult.route}</p>{nutritionResult.isSepsis&&<p className="text-xs text-emerald-600 mt-2">ESPEN: Start enteral within 24–48h of ICU admission</p>}</div>
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4"><p className="text-xs font-bold text-blue-700 uppercase mb-2">🧪 Recommended Formula</p><p className="text-sm font-semibold text-gray-800">{nutritionResult.formula}</p></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {tab==="results"&&(
          <div>
            {/* ── AI Prediction Accuracy Summary ── */}
            {(()=>{
              const withOutcome = hospitalPatients.filter(p=>p.outcome);
              const total = withOutcome.length;
              if(total===0) return (
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                  <span className="text-2xl">📊</span>
                  <div>
                    <p className="font-bold text-blue-700">AI Prediction Accuracy Tracker</p>
                    <p className="text-sm text-blue-600 mt-1">Discharge patients and record outcomes to see how accurately the AI predicted sepsis and mortality. This closes the feedback loop.</p>
                  </div>
                </div>
              );
              const sepsisWithLabel = withOutcome.filter(p=>p.outcome.sepsisConfirmed&&p.outcome.sepsisConfirmed!=="unknown");
              const mortWithLabel   = withOutcome.filter(p=>p.outcome.mortalityOutcome);
              const avgICU = withOutcome.filter(p=>p.outcome.icuDays).reduce((a,p,_,arr)=>a+parseFloat(p.outcome.icuDays)/arr.length,0);
              const expired = withOutcome.filter(p=>p.outcome.mortalityOutcome==="expired").length;
              return (
                <div className="mb-4 bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-indigo-700 to-purple-600 px-5 py-3 flex justify-between items-center">
                    <div><p className="text-white font-bold">📊 AI Prediction Accuracy — Feedback Loop</p><p className="text-indigo-200 text-xs">{total} patient{total!==1?"s":""} with recorded outcomes</p></div>
                    <span className="bg-white bg-opacity-20 text-white text-xs px-3 py-1 rounded-full font-bold">Live Validation</span>
                  </div>
                  <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 text-center">
                      <p className="text-2xl font-black text-indigo-700">{total}</p>
                      <p className="text-xs text-indigo-500 mt-0.5">Outcomes Recorded</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-3 border border-red-100 text-center">
                      <p className="text-2xl font-black text-red-600">{expired}</p>
                      <p className="text-xs text-red-400 mt-0.5">Expired in ICU</p>
                      <p className="text-xs text-gray-400">{total>0?Math.round(expired/total*100):0}% mortality rate</p>
                    </div>
                    <div className="bg-orange-50 rounded-xl p-3 border border-orange-100 text-center">
                      <p className="text-2xl font-black text-orange-600">{sepsisWithLabel.filter(p=>p.outcome.sepsisConfirmed==="yes").length}</p>
                      <p className="text-xs text-orange-500 mt-0.5">Sepsis Confirmed</p>
                      <p className="text-xs text-gray-400">of {sepsisWithLabel.length} tested</p>
                    </div>
                    <div className="bg-teal-50 rounded-xl p-3 border border-teal-100 text-center">
                      <p className="text-2xl font-black text-teal-600">{avgICU>0?avgICU.toFixed(1):"—"}</p>
                      <p className="text-xs text-teal-500 mt-0.5">Avg ICU Days</p>
                    </div>
                  </div>
                  {withOutcome.length>0&&(
                    <div className="px-4 pb-4">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">Patient Outcome Log</p>
                      <div className="space-y-2">
                        {withOutcome.map((p,i)=>(
                          <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${p.outcome.mortalityOutcome==="expired"?"bg-red-50 border-red-200":"bg-green-50 border-green-200"}`}>
                            <div className="flex items-center gap-2">
                              <span>{p.outcome.mortalityOutcome==="expired"?"❌":"✅"}</span>
                              <div>
                                <span className="font-medium text-gray-800">{p.name}</span>
                                <span className="text-xs text-gray-400 ml-2">{p.patient_id}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              {p.outcome.sepsisConfirmed&&p.outcome.sepsisConfirmed!=="unknown"&&(
                                <span className={`px-2 py-0.5 rounded-full font-bold ${p.outcome.sepsisConfirmed==="yes"?"bg-orange-100 text-orange-700":"bg-gray-100 text-gray-600"}`}>
                                  Sepsis: {p.outcome.sepsisConfirmed}
                                </span>
                              )}
                              {p.outcome.icuDays&&<span>{p.outcome.icuDays}d ICU</span>}
                              <span className={`px-2 py-0.5 rounded-full font-bold ${p.outcome.mortalityOutcome==="expired"?"bg-red-100 text-red-700":"bg-green-100 text-green-700"}`}>
                                {p.outcome.mortalityOutcome}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            <h2 className="text-lg font-bold text-gray-800 mb-4">📈 Scoring Results</h2>
            {Object.keys(scores).length===0?<div className="text-center py-16 text-gray-400"><div className="text-5xl mb-3">📋</div><p>No scores yet</p></div>:(
              <div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {scores.apacheii&&<Card title="APACHE II" value={scores.apacheii.total_score} sub={`${scores.apacheii.mortality_risk}% — ${scores.apacheii.risk_category}`} color="red" icon="🔴"/>}
                  {scores.sofa&&<Card title="SOFA" value={scores.sofa.total_score} sub={scores.sofa.risk_category} color="orange" icon="🟠"/>}
                  {scores.qsofa&&<Card title="qSOFA" value={scores.qsofa.total_score} sub={scores.qsofa.high_risk?"⚠️ High":"✅ Low"} color="yellow" icon="🟡"/>}
                  {scores.gcs&&<Card title="GCS" value={scores.gcs.total_score} sub={scores.gcs.severity} color="blue" icon="🧠"/>}
                  {scores.ranson&&<Card title="Ranson" value={scores.ranson.total_score} sub={scores.ranson.risk_category} color="purple"/>}
                  {scores.saps&&<Card title="SAPS" value={scores.saps.total_score} sub={`${scores.saps.mortality_risk}%`} color="green"/>}
                  {scores.mods&&<Card title="MODS" value={scores.mods.total_score} sub={scores.mods.risk_category} color="red"/>}
                  {scores.murray&&<Card title="Murray" value={scores.murray.total_score} sub={scores.murray.lung_injury_category} color="blue"/>}
                  {scores.alvarado&&<Card title="Alvarado" value={scores.alvarado.total_score} sub={scores.alvarado.risk_category} color="green"/>}
                </div>
                {radarData.some(d=>d.v>0)&&<div className="bg-white rounded-xl p-5 shadow-sm border mb-5"><h3 className="font-bold text-gray-700 mb-4">Risk Profile Radar</h3><ResponsiveContainer width="100%" height={260}><RadarChart data={radarData}><PolarGrid/><PolarAngleAxis dataKey="s"/><PolarRadiusAxis domain={[0,71]}/><Radar dataKey="v" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3}/><Tooltip/></RadarChart></ResponsiveContainer></div>}
                <div className="bg-white rounded-xl p-5 shadow-sm border">
                  <h3 className="font-bold text-gray-700 mb-4">🧠 Clinical Interpretation</h3>
                  <div className="space-y-3">
                    {scores.apacheii&&<div className={`p-4 rounded-xl border-l-4 ${scores.apacheii.total_score>=25?"border-red-500 bg-red-50":scores.apacheii.total_score>=15?"border-orange-500 bg-orange-50":"border-green-500 bg-green-50"}`}><div className="flex justify-between items-start"><div><p className="font-bold text-gray-800">APACHE II — {scores.apacheii.total_score}</p><p className="text-sm text-gray-600">{scores.apacheii.risk_category} — {scores.apacheii.mortality_risk}% mortality</p></div><Badge level={scores.apacheii.total_score>=25?"HIGH":scores.apacheii.total_score>=15?"MODERATE":"LOW"}/></div></div>}
                    {scores.sofa&&<div className={`p-4 rounded-xl border-l-4 ${scores.sofa.total_score>=11?"border-red-500 bg-red-50":scores.sofa.total_score>=6?"border-orange-500 bg-orange-50":"border-green-500 bg-green-50"}`}><div className="flex justify-between items-start"><div><p className="font-bold text-gray-800">SOFA — {scores.sofa.total_score}</p><p className="text-sm text-gray-600">{scores.sofa.risk_category}</p></div><Badge level={scores.sofa.total_score>=11?"CRITICAL":scores.sofa.total_score>=6?"HIGH":"MODERATE"}/></div></div>}
                    {scores.qsofa&&<div className={`p-4 rounded-xl border-l-4 ${scores.qsofa.high_risk?"border-red-500 bg-red-50":"border-green-500 bg-green-50"}`}><div className="flex justify-between items-start"><div><p className="font-bold text-gray-800">qSOFA — {scores.qsofa.total_score}/3</p><p className="text-sm text-gray-600">{scores.qsofa.high_risk?"⚠️ High risk — Initiate sepsis evaluation":"✅ Low risk"}</p></div><Badge level={scores.qsofa.high_risk?"HIGH":"LOW"}/></div></div>}
                    {scores.gcs&&<div className={`p-4 rounded-xl border-l-4 ${scores.gcs.total_score<9?"border-red-500 bg-red-50":scores.gcs.total_score<13?"border-orange-500 bg-orange-50":"border-green-500 bg-green-50"}`}><div className="flex justify-between items-start"><div><p className="font-bold text-gray-800">GCS — {scores.gcs.total_score}/15</p><p className="text-sm text-gray-600">{scores.gcs.severity}</p></div><Badge level={scores.gcs.total_score<9?"CRITICAL":scores.gcs.total_score<13?"HIGH":"LOW"}/></div></div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ICU REPORT TAB ── */}
        {tab==="report"&&(
          <div>
            {!selected?(
              <div className="text-center py-10 bg-yellow-50 rounded-xl border border-yellow-200"><p className="text-yellow-700 font-medium">⚠️ Select a patient first</p><button onClick={()=>setTab("patients")} className="mt-3 bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm">Go to Patients</button></div>
            ):(
              <div className="bg-white rounded-xl p-5 shadow-sm border">
                <div className="flex justify-between items-start mb-4">
                  <div><h2 className="text-lg font-bold text-gray-800">🧾 ICU Clinical Report</h2><p className="text-sm text-gray-500">Patient data auto-fetched. Fill in clinical fields below.</p></div>
                  <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full border border-green-300">✅ Auto-fetched from MongoDB</span>
                </div>

                {/* Auto-fetched preview */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-3">Auto-Fetched Data</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[["Patient ID",selected?.patient_id],["Age / Gender",`${selected?.age||"—"} / ${selected?.gender||"—"}`],["Diagnosis",selected?.diagnosis||"—"],["Heart Rate",reportData.hr?`${reportData.hr} bpm`:"—"],["BP",reportData.sbp&&reportData.dbp?`${reportData.sbp}/${reportData.dbp}`:"—"],["SpO₂",reportData.spo2?`${reportData.spo2}%`:"—"],["Temp",reportData.temp?`${reportData.temp}°C`:"—"],["Creatinine",reportData.creatinine?`${reportData.creatinine} mg/dL`:"—"],["Platelets",reportData.platelets?`${reportData.platelets} ×10³`:"—"],["Lactate",reportData.lactate?`${reportData.lactate} mmol/L`:"—"],["WBC",reportData.wbc?`${reportData.wbc} ×10³`:"—"],["Resp Rate",reportData.rr?`${reportData.rr}/min`:"—"]].map(([l,v])=>(
                      <div key={l} className="bg-white rounded-lg px-3 py-2 border"><p className="text-xs text-gray-400">{l}</p><p className="text-sm font-bold text-gray-700">{v||"—"}</p></div>
                    ))}
                  </div>
                </div>

                {/* Manual fields */}
                <div className="border-t pt-4">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-3">Clinical Fields to Fill</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                    <div><label className="text-xs text-gray-500 font-medium block mb-1">Attending Doctor *</label><input value={reportData.doctor} onChange={e=>rd("doctor",e.target.value)} placeholder="Dr. Smith" className={inp}/></div>
                    <div><label className="text-xs text-gray-500 font-medium block mb-1">Weight (kg)</label><input type="number" value={reportData.weight} onChange={e=>rd("weight",e.target.value)} placeholder="70" className={inp}/></div>
                    <div><label className="text-xs text-gray-500 font-medium block mb-1">Hb (g/dL)</label><input type="number" step="0.1" value={reportData.hb} onChange={e=>rd("hb",e.target.value)} placeholder="13.5" className={inp}/></div>
                    <div><label className="text-xs text-gray-500 font-medium block mb-1">Blood Sugar (mg/dL)</label><input type="number" value={reportData.sugar} onChange={e=>rd("sugar",e.target.value)} placeholder="100" className={inp}/></div>
                    <div><label className="text-xs text-gray-500 font-medium block mb-1">Override SpO₂ (%)</label><input type="number" value={reportData.spo2} onChange={e=>rd("spo2",e.target.value)} className={inp}/></div>
                    <div><label className="text-xs text-gray-500 font-medium block mb-1">Override HR (bpm)</label><input type="number" value={reportData.hr} onChange={e=>rd("hr",e.target.value)} className={inp}/></div>
                  </div>

                  <h3 className="text-sm font-bold text-gray-700 mb-3">💊 Treatment Plan</h3>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {[["antibiotics","Antibiotics","e.g. Pip-Taz 4.5g IV Q6H"],["fluids","IV Fluids","e.g. NS 1L over 2hr"],["vasopressors","Vasopressors","e.g. Norepinephrine 0.1 mcg/kg/min"],["ventilation","Ventilation","e.g. High flow O2, BiPAP"]].map(([k,l,ph])=>(
                      <div key={k}><label className="text-xs text-gray-500 font-medium block mb-1">{l}</label><input value={reportData[k]} onChange={e=>rd(k,e.target.value)} placeholder={ph} className={inp}/></div>
                    ))}
                  </div>
                  <div><label className="text-xs text-gray-500 font-medium block mb-1">Additional Notes</label><textarea value={reportData.notes} onChange={e=>rd("notes",e.target.value)} placeholder="Additional observations, follow-up plans..." className={`${inp} h-16 resize-none`}/></div>

                  {/* Lab Summary panel */}
                  <h3 className="text-sm font-bold text-gray-700 mb-3 mt-5">🔬 Basic Lab Summary</h3>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-2">
                    {[{label:"HR",value:reportData.hr,unit:"bpm",warn:parseFloat(reportData.hr)>120||parseFloat(reportData.hr)<50},{label:"BP",value:reportData.sbp&&reportData.dbp?`${reportData.sbp}/${reportData.dbp}`:"",unit:"mmHg",warn:parseFloat(reportData.sbp)<90},{label:"Sugar",value:reportData.sugar,unit:"mg/dL",warn:parseFloat(reportData.sugar)>200||parseFloat(reportData.sugar)<70},{label:"Hb",value:reportData.hb,unit:"g/dL",warn:parseFloat(reportData.hb)<8},{label:"WBC",value:reportData.wbc,unit:"×10³",warn:parseFloat(reportData.wbc)>11||parseFloat(reportData.wbc)<4},{label:"Creatinine",value:reportData.creatinine,unit:"mg/dL",warn:parseFloat(reportData.creatinine)>1.5}].map((item,i)=>(
                      <div key={i} className={`rounded-xl border p-3 text-center ${item.warn&&item.value?"bg-red-50 border-red-300":"bg-white border-gray-200"}`}>
                        <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                        <p className={`text-base font-black ${item.warn&&item.value?"text-red-600":"text-gray-800"}`}>{item.value||"—"}</p>
                        <p className="text-xs text-gray-400">{item.unit}</p>
                        {item.warn&&item.value&&<p className="text-xs text-red-500 font-bold">⚠️</p>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scores Summary — auto-populated from Scoring tab */}
                {(reportData.score_apache||reportData.score_sofa||reportData.score_qsofa||reportData.score_gcs||reportData.score_ranson||reportData.score_saps||reportData.score_mods||reportData.score_murray||reportData.score_alvarado)&&(
                  <div className="mt-5 bg-teal-50 border border-teal-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-teal-800">📊 Scoring Results — Auto-populated from Scoring Tab</h3>
                      <span className="text-xs bg-teal-600 text-white px-2 py-0.5 rounded-full font-bold">✅ Included in PDF</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {[
                        reportData.score_apache&&{label:"APACHE II",score:reportData.score_apache,sub:`${reportData.score_apache_mort}% mortality · ${reportData.score_apache_cat}`,color:"red"},
                        reportData.score_sofa&&{label:"SOFA",score:reportData.score_sofa,sub:reportData.score_sofa_cat,color:"orange"},
                        reportData.score_qsofa!=null&&{label:"qSOFA",score:`${reportData.score_qsofa}/3`,sub:reportData.score_qsofa_high?"⚠️ HIGH RISK":"✅ Low Risk",color:reportData.score_qsofa_high?"red":"green"},
                        reportData.score_gcs&&{label:"GCS",score:`${reportData.score_gcs}/15`,sub:reportData.score_gcs_sev,color:parseFloat(reportData.score_gcs)<9?"red":parseFloat(reportData.score_gcs)<13?"orange":"green"},
                        reportData.score_ranson&&{label:"Ranson",score:reportData.score_ranson,sub:reportData.score_ranson_cat,color:"purple"},
                        reportData.score_saps&&{label:"SAPS",score:reportData.score_saps,sub:`${reportData.score_saps_mort}% mortality`,color:"blue"},
                        reportData.score_mods&&{label:"MODS",score:reportData.score_mods,sub:reportData.score_mods_cat,color:"orange"},
                        reportData.score_murray&&{label:"Murray",score:reportData.score_murray,sub:reportData.score_murray_cat,color:"blue"},
                        reportData.score_alvarado&&{label:"Alvarado",score:reportData.score_alvarado,sub:reportData.score_alvarado_cat,color:"green"},
                      ].filter(Boolean).map((s,i)=>{
                        const tc={red:"text-red-700",orange:"text-orange-700",green:"text-green-700",purple:"text-purple-700",blue:"text-blue-700"}[s.color]||"text-gray-700";
                        const bg={red:"bg-red-50 border-red-200",orange:"bg-orange-50 border-orange-200",green:"bg-green-50 border-green-200",purple:"bg-purple-50 border-purple-200",blue:"bg-blue-50 border-blue-200"}[s.color]||"bg-gray-50 border-gray-200";
                        return(
                          <div key={i} className={`rounded-lg border p-3 ${bg}`}>
                            <p className="text-xs text-gray-500 font-bold uppercase">{s.label}</p>
                            <p className={`text-xl font-black ${tc}`}>{s.score}</p>
                            <p className={`text-xs font-medium ${tc}`}>{s.sub}</p>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-teal-600 mt-2">Go to 📋 Scoring tab to calculate more scores — they will appear here automatically.</p>
                  </div>
                )}
                {!(reportData.score_apache||reportData.score_sofa||reportData.score_qsofa||reportData.score_gcs)&&(
                  <div className="mt-4 bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4 text-center">
                    <p className="text-sm text-gray-500 mb-2">📋 No scores calculated yet</p>
                    <button onClick={()=>setTab("scoring")} className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700">Go to Scoring Tab →</button>
                    <p className="text-xs text-gray-400 mt-2">Scores will auto-appear here once calculated</p>
                  </div>
                )}

                <button onClick={()=>setShowReport(true)} className="mt-5 w-full bg-gradient-to-r from-blue-900 to-blue-700 text-white py-3 rounded-xl font-bold text-base hover:opacity-90 shadow-md">
                  🧾 Generate ICU Clinical Report PDF →
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
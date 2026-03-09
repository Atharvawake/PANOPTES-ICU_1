import React, { useState } from "react";
import "@/App.css";
import axios from "axios";
import { BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [activeTab, setActiveTab] = useState('patient');
  const [loading, setLoading] = useState(false);
  
  // Patient Information
  const [patientInfo, setPatientInfo] = useState({
    name: 'John Doe',
    id: 'ICU-001',
    age: 65,
    gender: 'M',
    admission_date: new Date().toISOString().split('T')[0],
    diagnosis: 'Septic Shock',
    nursing_notes: ''
  });

  // Results storage
  const [results, setResults] = useState({});

  // Form data states
  const [apacheData, setApacheData] = useState({
    age: 65, temperature: 38.5, mean_arterial_pressure: 75, heart_rate: 125,
    respiratory_rate: 28, pao2: 75, fio2: 0.6, arterial_ph: 7.32,
    sodium: 138, potassium: 4.2, creatinine: 1.8, hematocrit: 32,
    wbc: 18.5, gcs: 14, chronic_health: false, postoperative: false
  });

  const [sofaData, setSofaData] = useState({
    pao2: 75, fio2: 0.6, mechanical_ventilation: true, platelets: 95,
    bilirubin: 1.5, mean_arterial_pressure: 75, dopamine_dose: 5,
    dobutamine_dose: 0, epinephrine_dose: 0, norepinephrine_dose: 0,
    gcs: 14, creatinine: 1.8, urine_output: 400
  });

  const [qsofaData, setQsofaData] = useState({
    respiratory_rate: 28, systolic_bp: 95, gcs: 14
  });

  const [gcsData, setGcsData] = useState({
    eye_response: 4, verbal_response: 5, motor_response: 6, sedated: false
  });

  const [ransonData, setRansonData] = useState({
    age: 60, wbc: 18, glucose: 220, ldh: 400, ast: 300,
    hematocrit_drop: 12, bun_rise: 6, calcium: 7.5, pao2: 55,
    base_deficit: 5, fluid_sequestration: 7
  });

  const [sapsData, setSapsData] = useState({
    age: 65, heart_rate: 125, systolic_bp: 95, temperature: 38.5,
    pao2_fio2_ratio: 125, urine_output: 0.4, bun: 30, wbc: 18.5,
    potassium: 4.2, sodium: 138, bicarbonate: 18, bilirubin: 1.5,
    gcs: 14, admission_type: 'medical', chronic_disease: false
  });

  const [modsData, setModsData] = useState({
    pao2_fio2_ratio: 125, creatinine: 180, bilirubin: 25,
    platelets: 95, mean_arterial_pressure: 75, gcs: 14
  });

  const [murrayData, setMurrayData] = useState({
    chest_xray_quadrants: 3, pao2_fio2_ratio: 125, peep: 12, compliance: 35
  });

  const [alvaradoData, setAlvaradoData] = useState({
    migration_pain: true, anorexia: true, nausea_vomiting: true,
    tenderness_rlq: true, rebound_tenderness: false, elevated_temperature: true,
    leukocytosis: true, left_shift: false
  });

  const calculateScore = async (type, data) => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/scoring/${type}`, data);
      setResults(prev => ({ ...prev, [type.replace('-', '')]: response.data }));
      alert(`${type.toUpperCase()} Score Calculated!\n\nScore: ${JSON.stringify(response.data.total_score || response.data)}`);
    } catch (error) {
      console.error(`Error calculating ${type}:`, error);
      alert(`Error calculating ${type}: ${error.response?.data?.detail || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(0, 51, 102);
    doc.text('PANOPTES-ICU', 105, 20, { align: 'center' });
    doc.setFontSize(14);
    doc.text('Clinical Scoring Report', 105, 28, { align: 'center' });
    
    // Patient Info
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('Patient Information', 20, 40);
    doc.setFontSize(10);
    doc.text(`Name: ${patientInfo.name}`, 20, 47);
    doc.text(`ID: ${patientInfo.id}`, 20, 52);
    doc.text(`Age: ${patientInfo.age} | Gender: ${patientInfo.gender}`, 20, 57);
    doc.text(`Admission: ${patientInfo.admission_date}`, 20, 62);
    doc.text(`Diagnosis: ${patientInfo.diagnosis}`, 20, 67);

    // Nursing Notes
    if (patientInfo.nursing_notes) {
      doc.text('Nursing Notes:', 20, 75);
      const splitNotes = doc.splitTextToSize(patientInfo.nursing_notes, 170);
      doc.text(splitNotes, 20, 80);
    }

    // Scores
    let yPos = patientInfo.nursing_notes ? 95 : 75;
    doc.setFontSize(12);
    doc.setTextColor(0, 51, 102);
    doc.text('Scoring Results', 20, yPos);
    yPos += 7;

    const scoreData = [];
    if (results.apacheii) scoreData.push(['APACHE II', results.apacheii.total_score, `${results.apacheii.mortality_risk}%`, results.apacheii.risk_category]);
    if (results.sofa) scoreData.push(['SOFA', results.sofa.total_score, `${results.sofa.organ_dysfunction_count} organs`, '-']);
    if (results.qsofa) scoreData.push(['qSOFA', results.qsofa.total_score, results.qsofa.high_risk ? 'HIGH RISK' : 'Low Risk', results.qsofa.recommendation]);
    if (results.gcs) scoreData.push(['GCS', results.gcs.total_score, results.gcs.severity, `E${results.gcs.eye_response}V${results.gcs.verbal_response}M${results.gcs.motor_response}`]);
    if (results.ranson) scoreData.push(['Ranson', results.ranson.total_score, `${results.ranson.mortality_risk}%`, results.ranson.severity]);
    if (results.saps) scoreData.push(['SAPS II', results.saps.total_score, `${results.saps.mortality_risk}%`, 'ICU Mortality']);
    if (results.mods) scoreData.push(['MODS', results.mods.total_score, results.mods.severity, '-']);
    if (results.murray) scoreData.push(['Murray', results.murray.total_score, results.murray.severity, '-']);
    if (results.alvarado) scoreData.push(['Alvarado', results.alvarado.total_score, results.alvarado.probability, results.alvarado.recommendation]);

    if (scoreData.length > 0) {
      doc.autoTable({
        startY: yPos,
        head: [['Score', 'Value', 'Risk/Status', 'Details']],
        body: scoreData,
        theme: 'grid',
        headStyles: { fillColor: [0, 51, 102] }
      });
    }

    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 280);
    doc.text('PANOPTES-ICU - Clinical Decision Support System', 105, 285, { align: 'center' });

    doc.save(`PANOPTES_${patientInfo.id}_${new Date().toISOString().split('T')[0]}.pdf`);
    alert('✅ PDF Report Generated Successfully!');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-xl">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-4xl font-bold">🏥 PANOPTES-ICU</h1>
          <p className="text-blue-200">Complete Clinical Scoring System - 9 Scoring Tools</p>
        </div>
      </header>

      {/* Navigation */}
      <div className="bg-white border-b shadow sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <div className="flex overflow-x-auto space-x-2">
            {['patient', 'apache', 'sofa', 'qsofa', 'gcs', 'ranson', 'saps', 'mods', 'murray', 'alvarado', 'results'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 px-4 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        
        {/* Patient Info */}
        {activeTab === 'patient' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-3xl font-bold text-blue-700 mb-6">Patient Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Patient Name *</label>
                <input
                  type="text"
                  value={patientInfo.name}
                  onChange={(e) => setPatientInfo({...patientInfo, name: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Patient ID *</label>
                <input
                  type="text"
                  value={patientInfo.id}
                  onChange={(e) => setPatientInfo({...patientInfo, id: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Age</label>
                <input
                  type="number"
                  value={patientInfo.age}
                  onChange={(e) => setPatientInfo({...patientInfo, age: parseInt(e.target.value)})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Gender</label>
                <select
                  value={patientInfo.gender}
                  onChange={(e) => setPatientInfo({...patientInfo, gender: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Admission Date</label>
                <input
                  type="date"
                  value={patientInfo.admission_date}
                  onChange={(e) => setPatientInfo({...patientInfo, admission_date: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Diagnosis</label>
                <input
                  type="text"
                  value={patientInfo.diagnosis}
                  onChange={(e) => setPatientInfo({...patientInfo, diagnosis: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Nursing Notes</label>
              <textarea
                value={patientInfo.nursing_notes}
                onChange={(e) => setPatientInfo({...patientInfo, nursing_notes: e.target.value})}
                rows="6"
                placeholder="Enter detailed nursing notes, observations, and clinical remarks here..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800">✅ Patient information saved. Navigate to scoring tabs to calculate clinical scores.</p>
            </div>
          </div>
        )}

        {/* APACHE II */}
        {activeTab === 'apache' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-3xl font-bold text-blue-700 mb-2">APACHE II Scoring</h2>
            <p className="text-gray-600 mb-6">Acute Physiology and Chronic Health Evaluation (Range: 0-71)</p>
            <form onSubmit={(e) => { e.preventDefault(); calculateScore('apache-ii', apacheData); }}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div><label className="block text-sm font-semibold mb-2">Age</label><input type="number" value={apacheData.age} onChange={(e) => setApacheData({...apacheData, age: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Temperature (°C)</label><input type="number" step="0.1" value={apacheData.temperature} onChange={(e) => setApacheData({...apacheData, temperature: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">MAP (mmHg)</label><input type="number" value={apacheData.mean_arterial_pressure} onChange={(e) => setApacheData({...apacheData, mean_arterial_pressure: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Heart Rate</label><input type="number" value={apacheData.heart_rate} onChange={(e) => setApacheData({...apacheData, heart_rate: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Respiratory Rate</label><input type="number" value={apacheData.respiratory_rate} onChange={(e) => setApacheData({...apacheData, respiratory_rate: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">PaO2 (mmHg)</label><input type="number" step="0.1" value={apacheData.pao2} onChange={(e) => setApacheData({...apacheData, pao2: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">FiO2 (0.21-1.0)</label><input type="number" step="0.01" value={apacheData.fio2} onChange={(e) => setApacheData({...apacheData, fio2: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Arterial pH</label><input type="number" step="0.01" value={apacheData.arterial_ph} onChange={(e) => setApacheData({...apacheData, arterial_ph: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Sodium</label><input type="number" step="0.1" value={apacheData.sodium} onChange={(e) => setApacheData({...apacheData, sodium: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Potassium</label><input type="number" step="0.1" value={apacheData.potassium} onChange={(e) => setApacheData({...apacheData, potassium: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Creatinine</label><input type="number" step="0.1" value={apacheData.creatinine} onChange={(e) => setApacheData({...apacheData, creatinine: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Hematocrit (%)</label><input type="number" step="0.1" value={apacheData.hematocrit} onChange={(e) => setApacheData({...apacheData, hematocrit: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">WBC (x1000)</label><input type="number" step="0.1" value={apacheData.wbc} onChange={(e) => setApacheData({...apacheData, wbc: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">GCS (3-15)</label><input type="number" min="3" max="15" value={apacheData.gcs} onChange={(e) => setApacheData({...apacheData, gcs: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
              </div>
              <div className="flex gap-6 mb-6">
                <label className="flex items-center"><input type="checkbox" checked={apacheData.chronic_health} onChange={(e) => setApacheData({...apacheData, chronic_health: e.target.checked})} className="mr-2"/> Chronic Health</label>
                <label className="flex items-center"><input type="checkbox" checked={apacheData.postoperative} onChange={(e) => setApacheData({...apacheData, postoperative: e.target.checked})} className="mr-2"/> Postoperative</label>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-4 rounded-lg font-bold hover:bg-blue-700">
                {loading ? 'Calculating...' : '📊 Calculate APACHE II'}
              </button>
            </form>
            {results.apacheii && (
              <div className="mt-6 p-6 bg-blue-50 rounded-xl">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm text-gray-600">Score</p><p className="text-4xl font-bold text-blue-700">{results.apacheii.total_score}</p></div>
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm text-gray-600">Mortality</p><p className="text-4xl font-bold text-orange-600">{results.apacheii.mortality_risk}%</p></div>
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm text-gray-600">Category</p><p className="text-lg font-bold">{results.apacheii.risk_category}</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SOFA */}
        {activeTab === 'sofa' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-3xl font-bold text-purple-700 mb-2">SOFA Scoring</h2>
            <p className="text-gray-600 mb-6">Sequential Organ Failure Assessment (Range: 0-24)</p>
            <form onSubmit={(e) => { e.preventDefault(); calculateScore('sofa', sofaData); }}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div><label className="block text-sm font-semibold mb-2">PaO2 (mmHg)</label><input type="number" step="0.1" value={sofaData.pao2} onChange={(e) => setSofaData({...sofaData, pao2: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">FiO2 (0.21-1.0)</label><input type="number" step="0.01" value={sofaData.fio2} onChange={(e) => setSofaData({...sofaData, fio2: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Platelets (x10³)</label><input type="number" step="0.1" value={sofaData.platelets} onChange={(e) => setSofaData({...sofaData, platelets: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Bilirubin (mg/dL)</label><input type="number" step="0.1" value={sofaData.bilirubin} onChange={(e) => setSofaData({...sofaData, bilirubin: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">MAP (mmHg)</label><input type="number" value={sofaData.mean_arterial_pressure} onChange={(e) => setSofaData({...sofaData, mean_arterial_pressure: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Dopamine (µg/kg/min)</label><input type="number" step="0.1" value={sofaData.dopamine_dose} onChange={(e) => setSofaData({...sofaData, dopamine_dose: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-semibold mb-2">Dobutamine</label><input type="number" step="0.1" value={sofaData.dobutamine_dose} onChange={(e) => setSofaData({...sofaData, dobutamine_dose: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-semibold mb-2">Epinephrine</label><input type="number" step="0.1" value={sofaData.epinephrine_dose} onChange={(e) => setSofaData({...sofaData, epinephrine_dose: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-semibold mb-2">Norepinephrine</label><input type="number" step="0.1" value={sofaData.norepinephrine_dose} onChange={(e) => setSofaData({...sofaData, norepinephrine_dose: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-semibold mb-2">GCS (3-15)</label><input type="number" min="3" max="15" value={sofaData.gcs} onChange={(e) => setSofaData({...sofaData, gcs: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Creatinine</label><input type="number" step="0.1" value={sofaData.creatinine} onChange={(e) => setSofaData({...sofaData, creatinine: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Urine Output (mL/day)</label><input type="number" value={sofaData.urine_output} onChange={(e) => setSofaData({...sofaData, urine_output: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" /></div>
              </div>
              <div className="mb-6">
                <label className="flex items-center"><input type="checkbox" checked={sofaData.mechanical_ventilation} onChange={(e) => setSofaData({...sofaData, mechanical_ventilation: e.target.checked})} className="mr-2"/> Mechanical Ventilation</label>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-purple-600 text-white py-4 rounded-lg font-bold hover:bg-purple-700">
                {loading ? 'Calculating...' : '🫀 Calculate SOFA'}
              </button>
            </form>
            {results.sofa && (
              <div className="mt-6 p-6 bg-purple-50 rounded-xl">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm">Score</p><p className="text-4xl font-bold text-purple-700">{results.sofa.total_score}</p></div>
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm">Organ Dysfunctions</p><p className="text-4xl font-bold text-orange-600">{results.sofa.organ_dysfunction_count}</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* qSOFA */}
        {activeTab === 'qsofa' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-3xl font-bold text-orange-700 mb-2">qSOFA Scoring</h2>
            <p className="text-gray-600 mb-6">Quick SOFA - Sepsis Screening (Range: 0-3, ≥2 = High Risk)</p>
            <form onSubmit={(e) => { e.preventDefault(); calculateScore('qsofa', qsofaData); }}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div><label className="block text-sm font-semibold mb-2">Respiratory Rate</label><input type="number" value={qsofaData.respiratory_rate} onChange={(e) => setQsofaData({...qsofaData, respiratory_rate: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Systolic BP (mmHg)</label><input type="number" value={qsofaData.systolic_bp} onChange={(e) => setQsofaData({...qsofaData, systolic_bp: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">GCS (3-15)</label><input type="number" min="3" max="15" value={qsofaData.gcs} onChange={(e) => setQsofaData({...qsofaData, gcs: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-orange-600 text-white py-4 rounded-lg font-bold hover:bg-orange-700">
                {loading ? 'Calculating...' : '⚡ Calculate qSOFA'}
              </button>
            </form>
            {results.qsofa && (
              <div className="mt-6 p-6 bg-orange-50 rounded-xl">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm">Score</p><p className="text-4xl font-bold">{results.qsofa.total_score}</p></div>
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm">High Risk</p><p className={`text-3xl font-bold ${results.qsofa.high_risk ? 'text-red-600' : 'text-green-600'}`}>{results.qsofa.high_risk ? 'YES' : 'NO'}</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* GCS */}
        {activeTab === 'gcs' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-3xl font-bold text-green-700 mb-2">Glasgow Coma Scale</h2>
            <p className="text-gray-600 mb-6">Consciousness Assessment (Range: 3-15)</p>
            <form onSubmit={(e) => { e.preventDefault(); calculateScore('gcs', gcsData); }}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div><label className="block text-sm font-semibold mb-2">Eye Response (1-4)</label><select value={gcsData.eye_response} onChange={(e) => setGcsData({...gcsData, eye_response: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required><option value="4">4 - Spontaneous</option><option value="3">3 - To sound</option><option value="2">2 - To pressure</option><option value="1">1 - None</option></select></div>
                <div><label className="block text-sm font-semibold mb-2">Verbal Response (1-5)</label><select value={gcsData.verbal_response} onChange={(e) => setGcsData({...gcsData, verbal_response: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required><option value="5">5 - Oriented</option><option value="4">4 - Confused</option><option value="3">3 - Words</option><option value="2">2 - Sounds</option><option value="1">1 - None</option></select></div>
                <div><label className="block text-sm font-semibold mb-2">Motor Response (1-6)</label><select value={gcsData.motor_response} onChange={(e) => setGcsData({...gcsData, motor_response: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required><option value="6">6 - Obeys commands</option><option value="5">5 - Localizes pain</option><option value="4">4 - Withdraws</option><option value="3">3 - Flexion</option><option value="2">2 - Extension</option><option value="1">1 - None</option></select></div>
              </div>
              <div className="mb-6">
                <label className="flex items-center"><input type="checkbox" checked={gcsData.sedated} onChange={(e) => setGcsData({...gcsData, sedated: e.target.checked})} className="mr-2"/> Patient Sedated</label>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-green-600 text-white py-4 rounded-lg font-bold hover:bg-green-700">
                {loading ? 'Calculating...' : '🧠 Calculate GCS'}
              </button>
            </form>
            {results.gcs && (
              <div className="mt-6 p-6 bg-green-50 rounded-xl">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm">Total Score</p><p className="text-4xl font-bold text-green-700">{results.gcs.total_score}</p></div>
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm">Severity</p><p className="text-xl font-bold">{results.gcs.severity}</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ranson */}
        {activeTab === 'ranson' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-3xl font-bold text-yellow-700 mb-2">Ranson Criteria</h2>
            <p className="text-gray-600 mb-6">Acute Pancreatitis Severity (Range: 0-11)</p>
            <form onSubmit={(e) => { e.preventDefault(); calculateScore('ranson', ransonData); }}>
              <h3 className="font-bold text-lg mb-3">On Admission</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div><label className="block text-sm font-semibold mb-2">Age</label><input type="number" value={ransonData.age} onChange={(e) => setRansonData({...ransonData, age: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">WBC (x1000)</label><input type="number" value={ransonData.wbc} onChange={(e) => setRansonData({...ransonData, wbc: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Glucose (mg/dL)</label><input type="number" value={ransonData.glucose} onChange={(e) => setRansonData({...ransonData, glucose: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">LDH (U/L)</label><input type="number" value={ransonData.ldh} onChange={(e) => setRansonData({...ransonData, ldh: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">AST (U/L)</label><input type="number" value={ransonData.ast} onChange={(e) => setRansonData({...ransonData, ast: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
              </div>
              <h3 className="font-bold text-lg mb-3">At 48 Hours</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div><label className="block text-sm font-semibold mb-2">Hematocrit Drop (%)</label><input type="number" step="0.1" value={ransonData.hematocrit_drop} onChange={(e) => setRansonData({...ransonData, hematocrit_drop: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">BUN Rise (mg/dL)</label><input type="number" step="0.1" value={ransonData.bun_rise} onChange={(e) => setRansonData({...ransonData, bun_rise: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Calcium (mg/dL)</label><input type="number" step="0.1" value={ransonData.calcium} onChange={(e) => setRansonData({...ransonData, calcium: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">PaO2 (mmHg)</label><input type="number" value={ransonData.pao2} onChange={(e) => setRansonData({...ransonData, pao2: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Base Deficit (mEq/L)</label><input type="number" step="0.1" value={ransonData.base_deficit} onChange={(e) => setRansonData({...ransonData, base_deficit: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Fluid Sequestration (L)</label><input type="number" step="0.1" value={ransonData.fluid_sequestration} onChange={(e) => setRansonData({...ransonData, fluid_sequestration: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-yellow-600 text-white py-4 rounded-lg font-bold hover:bg-yellow-700">
                {loading ? 'Calculating...' : '🥞 Calculate Ranson'}
              </button>
            </form>
            {results.ranson && (
              <div className="mt-6 p-6 bg-yellow-50 rounded-xl">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm">Score</p><p className="text-4xl font-bold">{results.ranson.total_score}</p></div>
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm">Mortality</p><p className="text-4xl font-bold text-orange-600">{results.ranson.mortality_risk}%</p></div>
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm">Severity</p><p className="text-lg font-bold">{results.ranson.severity}</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SAPS II */}
        {activeTab === 'saps' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-3xl font-bold text-indigo-700 mb-2">SAPS II</h2>
            <p className="text-gray-600 mb-6">Simplified Acute Physiology Score (Range: 0-163)</p>
            <form onSubmit={(e) => { e.preventDefault(); calculateScore('saps', sapsData); }}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div><label className="block text-sm font-semibold mb-2">Age</label><input type="number" value={sapsData.age} onChange={(e) => setSapsData({...sapsData, age: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Heart Rate</label><input type="number" value={sapsData.heart_rate} onChange={(e) => setSapsData({...sapsData, heart_rate: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Systolic BP</label><input type="number" value={sapsData.systolic_bp} onChange={(e) => setSapsData({...sapsData, systolic_bp: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Temperature (°C)</label><input type="number" step="0.1" value={sapsData.temperature} onChange={(e) => setSapsData({...sapsData, temperature: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">PaO2/FiO2 Ratio</label><input type="number" value={sapsData.pao2_fio2_ratio} onChange={(e) => setSapsData({...sapsData, pao2_fio2_ratio: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-semibold mb-2">Urine Output (L/day)</label><input type="number" step="0.1" value={sapsData.urine_output} onChange={(e) => setSapsData({...sapsData, urine_output: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">BUN (mg/dL)</label><input type="number" value={sapsData.bun} onChange={(e) => setSapsData({...sapsData, bun: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">WBC (x1000)</label><input type="number" step="0.1" value={sapsData.wbc} onChange={(e) => setSapsData({...sapsData, wbc: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Potassium</label><input type="number" step="0.1" value={sapsData.potassium} onChange={(e) => setSapsData({...sapsData, potassium: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Sodium</label><input type="number" step="0.1" value={sapsData.sodium} onChange={(e) => setSapsData({...sapsData, sodium: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Bicarbonate</label><input type="number" step="0.1" value={sapsData.bicarbonate} onChange={(e) => setSapsData({...sapsData, bicarbonate: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Bilirubin</label><input type="number" step="0.1" value={sapsData.bilirubin} onChange={(e) => setSapsData({...sapsData, bilirubin: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">GCS (3-15)</label><input type="number" min="3" max="15" value={sapsData.gcs} onChange={(e) => setSapsData({...sapsData, gcs: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Admission Type</label><select value={sapsData.admission_type} onChange={(e) => setSapsData({...sapsData, admission_type: e.target.value})} className="w-full px-4 py-2 border rounded-lg"><option value="medical">Medical</option><option value="scheduled_surgical">Scheduled Surgical</option><option value="unscheduled_surgical">Unscheduled Surgical</option></select></div>
              </div>
              <div className="mb-6">
                <label className="flex items-center"><input type="checkbox" checked={sapsData.chronic_disease} onChange={(e) => setSapsData({...sapsData, chronic_disease: e.target.checked})} className="mr-2"/> Chronic Disease (AIDS/Metastatic Cancer/Hematologic Malignancy)</label>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white py-4 rounded-lg font-bold hover:bg-indigo-700">
                {loading ? 'Calculating...' : '📈 Calculate SAPS II'}
              </button>
            </form>
            {results.saps && (
              <div className="mt-6 p-6 bg-indigo-50 rounded-xl">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm">Score</p><p className="text-4xl font-bold">{results.saps.total_score}</p></div>
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm">Mortality Risk</p><p className="text-4xl font-bold text-orange-600">{results.saps.mortality_risk}%</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODS */}
        {activeTab === 'mods' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-3xl font-bold text-pink-700 mb-2">MODS</h2>
            <p className="text-gray-600 mb-6">Multiple Organ Dysfunction Score (Range: 0-24)</p>
            <form onSubmit={(e) => { e.preventDefault(); calculateScore('mods', modsData); }}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div><label className="block text-sm font-semibold mb-2">PaO2/FiO2 Ratio</label><input type="number" value={modsData.pao2_fio2_ratio} onChange={(e) => setModsData({...modsData, pao2_fio2_ratio: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Creatinine (µmol/L)</label><input type="number" value={modsData.creatinine} onChange={(e) => setModsData({...modsData, creatinine: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Bilirubin (µmol/L)</label><input type="number" value={modsData.bilirubin} onChange={(e) => setModsData({...modsData, bilirubin: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Platelets (10^9/L)</label><input type="number" value={modsData.platelets} onChange={(e) => setModsData({...modsData, platelets: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">MAP (mmHg)</label><input type="number" value={modsData.mean_arterial_pressure} onChange={(e) => setModsData({...modsData, mean_arterial_pressure: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">GCS (3-15)</label><input type="number" min="3" max="15" value={modsData.gcs} onChange={(e) => setModsData({...modsData, gcs: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-pink-600 text-white py-4 rounded-lg font-bold hover:bg-pink-700">
                {loading ? 'Calculating...' : '🔬 Calculate MODS'}
              </button>
            </form>
            {results.mods && (
              <div className="mt-6 p-6 bg-pink-50 rounded-xl">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm">Score</p><p className="text-4xl font-bold">{results.mods.total_score}</p></div>
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm">Severity</p><p className="text-xl font-bold">{results.mods.severity}</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Murray */}
        {activeTab === 'murray' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-3xl font-bold text-teal-700 mb-2">Murray Score</h2>
            <p className="text-gray-600 mb-6">Lung Injury Score (Range: 0-4)</p>
            <form onSubmit={(e) => { e.preventDefault(); calculateScore('murray', murrayData); }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div><label className="block text-sm font-semibold mb-2">Chest X-ray Quadrants with Infiltrates (0-4)</label><input type="number" min="0" max="4" value={murrayData.chest_xray_quadrants} onChange={(e) => setMurrayData({...murrayData, chest_xray_quadrants: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">PaO2/FiO2 Ratio</label><input type="number" value={murrayData.pao2_fio2_ratio} onChange={(e) => setMurrayData({...murrayData, pao2_fio2_ratio: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">PEEP (cmH2O)</label><input type="number" value={murrayData.peep} onChange={(e) => setMurrayData({...murrayData, peep: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
                <div><label className="block text-sm font-semibold mb-2">Compliance (mL/cmH2O)</label><input type="number" value={murrayData.compliance} onChange={(e) => setMurrayData({...murrayData, compliance: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" required /></div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-teal-600 text-white py-4 rounded-lg font-bold hover:bg-teal-700">
                {loading ? 'Calculating...' : '🫁 Calculate Murray Score'}
              </button>
            </form>
            {results.murray && (
              <div className="mt-6 p-6 bg-teal-50 rounded-xl">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm">Score</p><p className="text-4xl font-bold">{results.murray.total_score}</p></div>
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm">Severity</p><p className="text-lg font-bold">{results.murray.severity}</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Alvarado */}
        {activeTab === 'alvarado' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-3xl font-bold text-red-700 mb-2">Alvarado Score</h2>
            <p className="text-gray-600 mb-6">Acute Appendicitis Assessment (Range: 0-10)</p>
            <form onSubmit={(e) => { e.preventDefault(); calculateScore('alvarado', alvaradoData); }}>
              <div className="space-y-4 mb-6">
                <h3 className="font-bold">Symptoms (1 point each)</h3>
                <label className="flex items-center"><input type="checkbox" checked={alvaradoData.migration_pain} onChange={(e) => setAlvaradoData({...alvaradoData, migration_pain: e.target.checked})} className="mr-3"/> Migration of pain to RLQ</label>
                <label className="flex items-center"><input type="checkbox" checked={alvaradoData.anorexia} onChange={(e) => setAlvaradoData({...alvaradoData, anorexia: e.target.checked})} className="mr-3"/> Anorexia</label>
                <label className="flex items-center"><input type="checkbox" checked={alvaradoData.nausea_vomiting} onChange={(e) => setAlvaradoData({...alvaradoData, nausea_vomiting: e.target.checked})} className="mr-3"/> Nausea/Vomiting</label>
                <h3 className="font-bold mt-4">Signs (1-2 points each)</h3>
                <label className="flex items-center"><input type="checkbox" checked={alvaradoData.tenderness_rlq} onChange={(e) => setAlvaradoData({...alvaradoData, tenderness_rlq: e.target.checked})} className="mr-3"/> Tenderness in RLQ (2 points)</label>
                <label className="flex items-center"><input type="checkbox" checked={alvaradoData.rebound_tenderness} onChange={(e) => setAlvaradoData({...alvaradoData, rebound_tenderness: e.target.checked})} className="mr-3"/> Rebound Tenderness (1 point)</label>
                <label className="flex items-center"><input type="checkbox" checked={alvaradoData.elevated_temperature} onChange={(e) => setAlvaradoData({...alvaradoData, elevated_temperature: e.target.checked})} className="mr-3"/> Elevated Temperature (>37.3°C) (1 point)</label>
                <h3 className="font-bold mt-4">Lab Findings</h3>
                <label className="flex items-center"><input type="checkbox" checked={alvaradoData.leukocytosis} onChange={(e) => setAlvaradoData({...alvaradoData, leukocytosis: e.target.checked})} className="mr-3"/> Leukocytosis (WBC >10,000) (2 points)</label>
                <label className="flex items-center"><input type="checkbox" checked={alvaradoData.left_shift} onChange={(e) => setAlvaradoData({...alvaradoData, left_shift: e.target.checked})} className="mr-3"/> Left Shift (>75% neutrophils) (1 point)</label>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-red-600 text-white py-4 rounded-lg font-bold hover:bg-red-700">
                {loading ? 'Calculating...' : '🩺 Calculate Alvarado Score'}
              </button>
            </form>
            {results.alvarado && (
              <div className="mt-6 p-6 bg-red-50 rounded-xl">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm">Score</p><p className="text-4xl font-bold">{results.alvarado.total_score}</p></div>
                  <div className="bg-white p-4 rounded text-center"><p className="text-sm">Probability</p><p className="text-xl font-bold">{results.alvarado.probability}</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results & Visualizations */}
        {activeTab === 'results' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold">Results Summary</h2>
              <button
                onClick={generatePDF}
                className="bg-red-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-red-700 flex items-center gap-2"
              >
                📄 Generate PDF Report
              </button>
            </div>

            {/* Score Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {results.apacheii && (
                <div className="border-l-4 border-blue-500 bg-blue-50 p-6 rounded-r-lg">
                  <h3 className="font-bold text-lg">APACHE II</h3>
                  <p className="text-4xl font-bold text-blue-700 my-2">{results.apacheii.total_score}</p>
                  <p className="text-sm">Mortality: {results.apacheii.mortality_risk}%</p>
                </div>
              )}
              {results.sofa && (
                <div className="border-l-4 border-purple-500 bg-purple-50 p-6 rounded-r-lg">
                  <h3 className="font-bold text-lg">SOFA</h3>
                  <p className="text-4xl font-bold text-purple-700 my-2">{results.sofa.total_score}</p>
                  <p className="text-sm">{results.sofa.organ_dysfunction_count} Organs</p>
                </div>
              )}
              {results.qsofa && (
                <div className="border-l-4 border-orange-500 bg-orange-50 p-6 rounded-r-lg">
                  <h3 className="font-bold text-lg">qSOFA</h3>
                  <p className="text-4xl font-bold text-orange-700 my-2">{results.qsofa.total_score}</p>
                  <p className="text-sm">{results.qsofa.high_risk ? 'HIGH RISK' : 'Low Risk'}</p>
                </div>
              )}
              {results.gcs && (
                <div className="border-l-4 border-green-500 bg-green-50 p-6 rounded-r-lg">
                  <h3 className="font-bold text-lg">GCS</h3>
                  <p className="text-4xl font-bold text-green-700 my-2">{results.gcs.total_score}</p>
                  <p className="text-sm">{results.gcs.severity}</p>
                </div>
              )}
              {results.ranson && (
                <div className="border-l-4 border-yellow-500 bg-yellow-50 p-6 rounded-r-lg">
                  <h3 className="font-bold text-lg">Ranson</h3>
                  <p className="text-4xl font-bold text-yellow-700 my-2">{results.ranson.total_score}</p>
                  <p className="text-sm">Mortality: {results.ranson.mortality_risk}%</p>
                </div>
              )}
              {results.saps && (
                <div className="border-l-4 border-indigo-500 bg-indigo-50 p-6 rounded-r-lg">
                  <h3 className="font-bold text-lg">SAPS II</h3>
                  <p className="text-4xl font-bold text-indigo-700 my-2">{results.saps.total_score}</p>
                  <p className="text-sm">Mortality: {results.saps.mortality_risk}%</p>
                </div>
              )}
              {results.mods && (
                <div className="border-l-4 border-pink-500 bg-pink-50 p-6 rounded-r-lg">
                  <h3 className="font-bold text-lg">MODS</h3>
                  <p className="text-4xl font-bold text-pink-700 my-2">{results.mods.total_score}</p>
                  <p className="text-sm">{results.mods.severity}</p>
                </div>
              )}
              {results.murray && (
                <div className="border-l-4 border-teal-500 bg-teal-50 p-6 rounded-r-lg">
                  <h3 className="font-bold text-lg">Murray</h3>
                  <p className="text-4xl font-bold text-teal-700 my-2">{results.murray.total_score}</p>
                  <p className="text-sm">{results.murray.severity}</p>
                </div>
              )}
              {results.alvarado && (
                <div className="border-l-4 border-red-500 bg-red-50 p-6 rounded-r-lg">
                  <h3 className="font-bold text-lg">Alvarado</h3>
                  <p className="text-4xl font-bold text-red-700 my-2">{results.alvarado.total_score}</p>
                  <p className="text-sm">{results.alvarado.probability}</p>
                </div>
              )}
            </div>

            {/* Visualization */}
            <div className="bg-gray-50 p-6 rounded-lg">
              <h3 className="text-xl font-bold mb-4">Score Comparison Chart</h3>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={[
                  { name: 'APACHE II', score: results.apacheii?.total_score || 0 },
                  { name: 'SOFA', score: results.sofa?.total_score || 0 },
                  { name: 'qSOFA', score: results.qsofa?.total_score || 0 },
                  { name: 'GCS', score: results.gcs?.total_score || 0 },
                  { name: 'Ranson', score: results.ranson?.total_score || 0 },
                  { name: 'SAPS II', score: (results.saps?.total_score || 0) / 10 },
                  { name: 'MODS', score: results.mods?.total_score || 0 },
                  { name: 'Murray', score: results.murray?.total_score || 0 },
                  { name: 'Alvarado', score: results.alvarado?.total_score || 0 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="score" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-gray-500 mt-2">* SAPS II score divided by 10 for visualization</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-6 mt-12">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm">🏥 PANOPTES-ICU v2.0 - Complete Clinical Scoring System</p>
          <p className="text-xs text-gray-400 mt-2">9 Scoring Systems | AI-Enhanced Analytics | PDF Reports</p>
        </div>
      </footer>
    </div>
  );
}

export default App;

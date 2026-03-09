import React, { useState, useEffect } from "react";
import "@/App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [activeTab, setActiveTab] = useState('apache');
  const [systemInfo, setSystemInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // APACHE II Form State
  const [apacheData, setApacheData] = useState({
    age: 65,
    temperature: 38.5,
    mean_arterial_pressure: 75,
    heart_rate: 125,
    respiratory_rate: 28,
    pao2: 75,
    fio2: 0.6,
    arterial_ph: 7.32,
    sodium: 138,
    potassium: 4.2,
    creatinine: 1.8,
    hematocrit: 32,
    wbc: 18.5,
    gcs: 14,
    chronic_health: false,
    postoperative: false
  });
  const [apacheResult, setApacheResult] = useState(null);

  // SOFA Form State
  const [sofaData, setSofaData] = useState({
    pao2: 75,
    fio2: 0.6,
    mechanical_ventilation: true,
    platelets: 95,
    bilirubin: 1.5,
    mean_arterial_pressure: 75,
    dopamine_dose: 5,
    dobutamine_dose: 0,
    epinephrine_dose: 0,
    norepinephrine_dose: 0,
    gcs: 14,
    creatinine: 1.8,
    urine_output: 400
  });
  const [sofaResult, setSofaResult] = useState(null);

  // qSOFA Form State
  const [qsofaData, setQsofaData] = useState({
    respiratory_rate: 28,
    systolic_bp: 95,
    gcs: 14
  });
  const [qsofaResult, setQsofaResult] = useState(null);

  // GCS Form State
  const [gcsData, setGcsData] = useState({
    eye_response: 4,
    verbal_response: 5,
    motor_response: 6,
    sedated: false
  });
  const [gcsResult, setGcsResult] = useState(null);

  // Sepsis Prediction State
  const [sepsisResult, setSepsisResult] = useState(null);

  useEffect(() => {
    fetchSystemInfo();
  }, []);

  const fetchSystemInfo = async () => {
    try {
      const response = await axios.get(`${API}/system-info`);
      setSystemInfo(response.data);
    } catch (error) {
      console.error('Error fetching system info:', error);
    }
  };

  // Calculate APACHE II
  const calculateApache = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(`${API}/scoring/apache-ii`, apacheData);
      setApacheResult(response.data);
      alert(`APACHE II Score: ${response.data.total_score}\nMortality Risk: ${response.data.mortality_risk}%\nCategory: ${response.data.risk_category}`);
    } catch (error) {
      console.error('Error calculating APACHE II:', error);
      alert('Error calculating APACHE II score');
    } finally {
      setLoading(false);
    }
  };

  // Calculate SOFA
  const calculateSofa = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(`${API}/scoring/sofa`, sofaData);
      setSofaResult(response.data);
      alert(`SOFA Score: ${response.data.total_score}\nOrgan Dysfunctions: ${response.data.organ_dysfunction_count}`);
    } catch (error) {
      console.error('Error calculating SOFA:', error);
      alert('Error calculating SOFA score');
    } finally {
      setLoading(false);
    }
  };

  // Calculate qSOFA
  const calculateQsofa = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(`${API}/scoring/qsofa`, qsofaData);
      setQsofaResult(response.data);
      alert(`qSOFA Score: ${response.data.total_score}\nHigh Risk: ${response.data.high_risk ? 'YES' : 'NO'}\n\n${response.data.recommendation}`);
    } catch (error) {
      console.error('Error calculating qSOFA:', error);
      alert('Error calculating qSOFA score');
    } finally {
      setLoading(false);
    }
  };

  // Calculate GCS
  const calculateGcs = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(`${API}/scoring/gcs`, gcsData);
      setGcsResult(response.data);
      alert(`GCS Score: ${response.data.total_score}\nSeverity: ${response.data.severity}\n\nEye: ${response.data.eye_response}\nVerbal: ${response.data.verbal_response}\nMotor: ${response.data.motor_response}`);
    } catch (error) {
      console.error('Error calculating GCS:', error);
      alert('Error calculating GCS score');
    } finally {
      setLoading(false);
    }
  };

  // Predict Sepsis
  const predictSepsis = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/predict/sepsis?patient_id=PATIENT_001`);
      setSepsisResult(response.data);
      alert(`Sepsis Risk: ${(response.data.probability * 100).toFixed(1)}%\nRisk Level: ${response.data.risk_level}\n\n${response.data.recommendation}`);
    } catch (error) {
      console.error('Error predicting sepsis:', error);
      alert('Error predicting sepsis');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-xl">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between flex-wrap">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">🏥 PANOPTES-ICU</h1>
              <p className="text-blue-200 text-sm md:text-base">Intelligent Clinical Decision Support System</p>
            </div>
            <div className="mt-4 md:mt-0">
              <button
                onClick={predictSepsis}
                disabled={loading}
                className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                🤖 AI Sepsis Prediction
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <div className="flex overflow-x-auto space-x-2 md:space-x-4">
            {['apache', 'sofa', 'qsofa', 'gcs', 'results'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-4 md:px-6 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'apache' && '📊 APACHE II'}
                {tab === 'sofa' && '🫀 SOFA'}
                {tab === 'qsofa' && '⚡ qSOFA'}
                {tab === 'gcs' && '🧠 GCS'}
                {tab === 'results' && '📈 Results'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        
        {/* APACHE II Form */}
        {activeTab === 'apache' && (
          <div className="bg-white rounded-xl shadow-lg p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-blue-700 mb-6">APACHE II Scoring</h2>
            <p className="text-gray-600 mb-6">Acute Physiology and Chronic Health Evaluation (Range: 0-71)</p>
            
            <form onSubmit={calculateApache} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Age */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Age (years)</label>
                  <input
                    type="number"
                    value={apacheData.age}
                    onChange={(e) => setApacheData({...apacheData, age: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* Temperature */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Temperature (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={apacheData.temperature}
                    onChange={(e) => setApacheData({...apacheData, temperature: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* MAP */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Mean Arterial Pressure (mmHg)</label>
                  <input
                    type="number"
                    value={apacheData.mean_arterial_pressure}
                    onChange={(e) => setApacheData({...apacheData, mean_arterial_pressure: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* Heart Rate */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Heart Rate (bpm)</label>
                  <input
                    type="number"
                    value={apacheData.heart_rate}
                    onChange={(e) => setApacheData({...apacheData, heart_rate: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* Respiratory Rate */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Respiratory Rate (breaths/min)</label>
                  <input
                    type="number"
                    value={apacheData.respiratory_rate}
                    onChange={(e) => setApacheData({...apacheData, respiratory_rate: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* PaO2 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">PaO2 (mmHg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={apacheData.pao2}
                    onChange={(e) => setApacheData({...apacheData, pao2: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* FiO2 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">FiO2 (0.21-1.0)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.21"
                    max="1.0"
                    value={apacheData.fio2}
                    onChange={(e) => setApacheData({...apacheData, fio2: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* Arterial pH */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Arterial pH</label>
                  <input
                    type="number"
                    step="0.01"
                    min="6.0"
                    max="8.0"
                    value={apacheData.arterial_ph}
                    onChange={(e) => setApacheData({...apacheData, arterial_ph: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* Sodium */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Sodium (mEq/L)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={apacheData.sodium}
                    onChange={(e) => setApacheData({...apacheData, sodium: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* Potassium */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Potassium (mEq/L)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={apacheData.potassium}
                    onChange={(e) => setApacheData({...apacheData, potassium: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* Creatinine */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Creatinine (mg/dL)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={apacheData.creatinine}
                    onChange={(e) => setApacheData({...apacheData, creatinine: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* Hematocrit */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Hematocrit (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={apacheData.hematocrit}
                    onChange={(e) => setApacheData({...apacheData, hematocrit: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* WBC */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">WBC (thousands)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={apacheData.wbc}
                    onChange={(e) => setApacheData({...apacheData, wbc: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* GCS */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Glasgow Coma Scale (3-15)</label>
                  <input
                    type="number"
                    min="3"
                    max="15"
                    value={apacheData.gcs}
                    onChange={(e) => setApacheData({...apacheData, gcs: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              {/* Checkboxes */}
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={apacheData.chronic_health}
                    onChange={(e) => setApacheData({...apacheData, chronic_health: e.target.checked})}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-gray-700 font-medium">Chronic Health Condition</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={apacheData.postoperative}
                    onChange={(e) => setApacheData({...apacheData, postoperative: e.target.checked})}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-gray-700 font-medium">Postoperative</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-bold text-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Calculating...' : '🔬 Calculate APACHE II Score'}
              </button>
            </form>

            {apacheResult && (
              <div className="mt-8 p-6 bg-blue-50 border-2 border-blue-200 rounded-xl">
                <h3 className="text-2xl font-bold text-blue-800 mb-4">Results</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-lg">
                    <p className="text-gray-600 text-sm">Total Score</p>
                    <p className="text-4xl font-bold text-blue-700">{apacheResult.total_score}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg">
                    <p className="text-gray-600 text-sm">Mortality Risk</p>
                    <p className="text-4xl font-bold text-orange-600">{apacheResult.mortality_risk}%</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg">
                    <p className="text-gray-600 text-sm">Category</p>
                    <p className="text-xl font-bold text-gray-800">{apacheResult.risk_category}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SOFA Form */}
        {activeTab === 'sofa' && (
          <div className="bg-white rounded-xl shadow-lg p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-purple-700 mb-6">SOFA Scoring</h2>
            <p className="text-gray-600 mb-6">Sequential Organ Failure Assessment (Range: 0-24)</p>
            
            <form onSubmit={calculateSofa} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* PaO2 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">PaO2 (mmHg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={sofaData.pao2}
                    onChange={(e) => setSofaData({...sofaData, pao2: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    required
                  />
                </div>

                {/* FiO2 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">FiO2 (0.21-1.0)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.21"
                    max="1.0"
                    value={sofaData.fio2}
                    onChange={(e) => setSofaData({...sofaData, fio2: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    required
                  />
                </div>

                {/* Platelets */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Platelets (x10³/µL)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={sofaData.platelets}
                    onChange={(e) => setSofaData({...sofaData, platelets: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    required
                  />
                </div>

                {/* Bilirubin */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Bilirubin (mg/dL)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={sofaData.bilirubin}
                    onChange={(e) => setSofaData({...sofaData, bilirubin: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    required
                  />
                </div>

                {/* MAP */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Mean Arterial Pressure (mmHg)</label>
                  <input
                    type="number"
                    value={sofaData.mean_arterial_pressure}
                    onChange={(e) => setSofaData({...sofaData, mean_arterial_pressure: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    required
                  />
                </div>

                {/* Dopamine */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Dopamine (µg/kg/min)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={sofaData.dopamine_dose}
                    onChange={(e) => setSofaData({...sofaData, dopamine_dose: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>

                {/* Dobutamine */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Dobutamine (µg/kg/min)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={sofaData.dobutamine_dose}
                    onChange={(e) => setSofaData({...sofaData, dobutamine_dose: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>

                {/* Epinephrine */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Epinephrine (µg/kg/min)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={sofaData.epinephrine_dose}
                    onChange={(e) => setSofaData({...sofaData, epinephrine_dose: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>

                {/* Norepinephrine */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Norepinephrine (µg/kg/min)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={sofaData.norepinephrine_dose}
                    onChange={(e) => setSofaData({...sofaData, norepinephrine_dose: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>

                {/* GCS */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Glasgow Coma Scale (3-15)</label>
                  <input
                    type="number"
                    min="3"
                    max="15"
                    value={sofaData.gcs}
                    onChange={(e) => setSofaData({...sofaData, gcs: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    required
                  />
                </div>

                {/* Creatinine */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Creatinine (mg/dL)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={sofaData.creatinine}
                    onChange={(e) => setSofaData({...sofaData, creatinine: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    required
                  />
                </div>

                {/* Urine Output */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Urine Output (mL/day)</label>
                  <input
                    type="number"
                    value={sofaData.urine_output}
                    onChange={(e) => setSofaData({...sofaData, urine_output: parseFloat(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Mechanical Ventilation Checkbox */}
              <div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sofaData.mechanical_ventilation}
                    onChange={(e) => setSofaData({...sofaData, mechanical_ventilation: e.target.checked})}
                    className="w-5 h-5 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                  />
                  <span className="text-gray-700 font-medium">Mechanical Ventilation</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-purple-600 text-white py-4 px-6 rounded-lg font-bold text-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Calculating...' : '🫀 Calculate SOFA Score'}
              </button>
            </form>

            {sofaResult && (
              <div className="mt-8 p-6 bg-purple-50 border-2 border-purple-200 rounded-xl">
                <h3 className="text-2xl font-bold text-purple-800 mb-4">Results</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-white p-4 rounded-lg">
                    <p className="text-gray-600 text-sm">Total Score</p>
                    <p className="text-4xl font-bold text-purple-700">{sofaResult.total_score}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg">
                    <p className="text-gray-600 text-sm">Organ Dysfunctions</p>
                    <p className="text-4xl font-bold text-orange-600">{sofaResult.organ_dysfunction_count}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div className="bg-white p-3 rounded">
                    <p className="text-gray-600">Respiration</p>
                    <p className="font-bold text-lg">{sofaResult.respiration_score}</p>
                  </div>
                  <div className="bg-white p-3 rounded">
                    <p className="text-gray-600">Coagulation</p>
                    <p className="font-bold text-lg">{sofaResult.coagulation_score}</p>
                  </div>
                  <div className="bg-white p-3 rounded">
                    <p className="text-gray-600">Liver</p>
                    <p className="font-bold text-lg">{sofaResult.liver_score}</p>
                  </div>
                  <div className="bg-white p-3 rounded">
                    <p className="text-gray-600">Cardiovascular</p>
                    <p className="font-bold text-lg">{sofaResult.cardiovascular_score}</p>
                  </div>
                  <div className="bg-white p-3 rounded">
                    <p className="text-gray-600">CNS</p>
                    <p className="font-bold text-lg">{sofaResult.cns_score}</p>
                  </div>
                  <div className="bg-white p-3 rounded">
                    <p className="text-gray-600">Renal</p>
                    <p className="font-bold text-lg">{sofaResult.renal_score}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* qSOFA Form */}
        {activeTab === 'qsofa' && (
          <div className="bg-white rounded-xl shadow-lg p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-orange-700 mb-6">qSOFA Scoring</h2>
            <p className="text-gray-600 mb-6">Quick Sequential Organ Failure Assessment (Range: 0-3, ≥2 = High Risk)</p>
            
            <form onSubmit={calculateQsofa} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Respiratory Rate */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Respiratory Rate (breaths/min)</label>
                  <input
                    type="number"
                    value={qsofaData.respiratory_rate}
                    onChange={(e) => setQsofaData({...qsofaData, respiratory_rate: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Criteria: ≥22</p>
                </div>

                {/* Systolic BP */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Systolic BP (mmHg)</label>
                  <input
                    type="number"
                    value={qsofaData.systolic_bp}
                    onChange={(e) => setQsofaData({...qsofaData, systolic_bp: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Criteria: ≤100</p>
                </div>

                {/* GCS */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Glasgow Coma Scale (3-15)</label>
                  <input
                    type="number"
                    min="3"
                    max="15"
                    value={qsofaData.gcs}
                    onChange={(e) => setQsofaData({...qsofaData, gcs: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Criteria: &lt;15</p>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-600 text-white py-4 px-6 rounded-lg font-bold text-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Calculating...' : '⚡ Calculate qSOFA Score'}
              </button>
            </form>

            {qsofaResult && (
              <div className="mt-8 p-6 bg-orange-50 border-2 border-orange-200 rounded-xl">
                <h3 className="text-2xl font-bold text-orange-800 mb-4">Results</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-lg">
                    <p className="text-gray-600 text-sm">Total Score</p>
                    <p className="text-4xl font-bold text-orange-700">{qsofaResult.total_score}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg">
                    <p className="text-gray-600 text-sm">High Risk</p>
                    <p className={`text-3xl font-bold ${qsofaResult.high_risk ? 'text-red-600' : 'text-green-600'}`}>
                      {qsofaResult.high_risk ? 'YES' : 'NO'}
                    </p>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-white rounded-lg">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Recommendation:</p>
                  <p className="text-gray-600">{qsofaResult.recommendation}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* GCS Form */}
        {activeTab === 'gcs' && (
          <div className="bg-white rounded-xl shadow-lg p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-green-700 mb-6">Glasgow Coma Scale</h2>
            <p className="text-gray-600 mb-6">Consciousness Level Assessment (Range: 3-15)</p>
            
            <form onSubmit={calculateGcs} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Eye Response */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Eye Response (1-4)</label>
                  <select
                    value={gcsData.eye_response}
                    onChange={(e) => setGcsData({...gcsData, eye_response: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    required
                  >
                    <option value="4">4 - Spontaneous</option>
                    <option value="3">3 - To sound</option>
                    <option value="2">2 - To pressure</option>
                    <option value="1">1 - None</option>
                  </select>
                </div>

                {/* Verbal Response */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Verbal Response (1-5)</label>
                  <select
                    value={gcsData.verbal_response}
                    onChange={(e) => setGcsData({...gcsData, verbal_response: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    required
                  >
                    <option value="5">5 - Oriented</option>
                    <option value="4">4 - Confused</option>
                    <option value="3">3 - Words</option>
                    <option value="2">2 - Sounds</option>
                    <option value="1">1 - None</option>
                  </select>
                </div>

                {/* Motor Response */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Motor Response (1-6)</label>
                  <select
                    value={gcsData.motor_response}
                    onChange={(e) => setGcsData({...gcsData, motor_response: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    required
                  >
                    <option value="6">6 - Obeys commands</option>
                    <option value="5">5 - Localizes pain</option>
                    <option value="4">4 - Withdraws from pain</option>
                    <option value="3">3 - Abnormal flexion</option>
                    <option value="2">2 - Extension</option>
                    <option value="1">1 - None</option>
                  </select>
                </div>
              </div>

              {/* Sedated Checkbox */}
              <div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gcsData.sedated}
                    onChange={(e) => setGcsData({...gcsData, sedated: e.target.checked})}
                    className="w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                  />
                  <span className="text-gray-700 font-medium">Patient is Sedated</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 text-white py-4 px-6 rounded-lg font-bold text-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Calculating...' : '🧠 Calculate GCS Score'}
              </button>
            </form>

            {gcsResult && (
              <div className="mt-8 p-6 bg-green-50 border-2 border-green-200 rounded-xl">
                <h3 className="text-2xl font-bold text-green-800 mb-4">Results</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-lg">
                    <p className="text-gray-600 text-sm">Total Score</p>
                    <p className="text-4xl font-bold text-green-700">{gcsResult.total_score}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg">
                    <p className="text-gray-600 text-sm">Severity</p>
                    <p className="text-2xl font-bold text-gray-800">{gcsResult.severity}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="bg-white p-3 rounded text-center">
                    <p className="text-gray-600 text-sm">Eye</p>
                    <p className="text-2xl font-bold text-green-700">{gcsResult.eye_response}</p>
                  </div>
                  <div className="bg-white p-3 rounded text-center">
                    <p className="text-gray-600 text-sm">Verbal</p>
                    <p className="text-2xl font-bold text-green-700">{gcsResult.verbal_response}</p>
                  </div>
                  <div className="bg-white p-3 rounded text-center">
                    <p className="text-gray-600 text-sm">Motor</p>
                    <p className="text-2xl font-bold text-green-700">{gcsResult.motor_response}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results Summary */}
        {activeTab === 'results' && (
          <div className="bg-white rounded-xl shadow-lg p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">📈 All Results Summary</h2>
            
            <div className="space-y-6">
              {/* APACHE II Result */}
              {apacheResult && (
                <div className="border-l-4 border-blue-500 p-6 bg-blue-50 rounded-r-lg">
                  <h3 className="text-xl font-bold text-blue-800 mb-3">APACHE II</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Score</p>
                      <p className="text-2xl font-bold text-blue-700">{apacheResult.total_score}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Mortality Risk</p>
                      <p className="text-2xl font-bold text-orange-600">{apacheResult.mortality_risk}%</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-gray-600">Category</p>
                      <p className="text-lg font-bold text-gray-800">{apacheResult.risk_category}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* SOFA Result */}
              {sofaResult && (
                <div className="border-l-4 border-purple-500 p-6 bg-purple-50 rounded-r-lg">
                  <h3 className="text-xl font-bold text-purple-800 mb-3">SOFA</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Score</p>
                      <p className="text-2xl font-bold text-purple-700">{sofaResult.total_score}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Organ Dysfunctions</p>
                      <p className="text-2xl font-bold text-orange-600">{sofaResult.organ_dysfunction_count}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* qSOFA Result */}
              {qsofaResult && (
                <div className="border-l-4 border-orange-500 p-6 bg-orange-50 rounded-r-lg">
                  <h3 className="text-xl font-bold text-orange-800 mb-3">qSOFA</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Score</p>
                      <p className="text-2xl font-bold text-orange-700">{qsofaResult.total_score}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">High Risk</p>
                      <p className={`text-2xl font-bold ${qsofaResult.high_risk ? 'text-red-600' : 'text-green-600'}`}>
                        {qsofaResult.high_risk ? 'YES' : 'NO'}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-gray-700">{qsofaResult.recommendation}</p>
                </div>
              )}

              {/* GCS Result */}
              {gcsResult && (
                <div className="border-l-4 border-green-500 p-6 bg-green-50 rounded-r-lg">
                  <h3 className="text-xl font-bold text-green-800 mb-3">Glasgow Coma Scale</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Score</p>
                      <p className="text-2xl font-bold text-green-700">{gcsResult.total_score}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Severity</p>
                      <p className="text-lg font-bold text-gray-800">{gcsResult.severity}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Sepsis Prediction */}
              {sepsisResult && (
                <div className="border-l-4 border-red-500 p-6 bg-red-50 rounded-r-lg">
                  <h3 className="text-xl font-bold text-red-800 mb-3">AI Sepsis Prediction</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Risk Probability</p>
                      <p className="text-2xl font-bold text-red-700">{(sepsisResult.probability * 100).toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Risk Level</p>
                      <p className="text-lg font-bold text-gray-800">{sepsisResult.risk_level}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-gray-700">{sepsisResult.recommendation}</p>
                </div>
              )}

              {(!apacheResult && !sofaResult && !qsofaResult && !gcsResult && !sepsisResult) && (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-lg">No results yet. Calculate scores using the tabs above.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-6 mt-12">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm">🏥 PANOPTES-ICU v1.0.0 | AI-Enhanced Clinical Decision Support</p>
          <p className="text-xs text-gray-400 mt-2">6 Cutting-Edge Innovations: GRU-D • SHAP • VAE • Smart Alerts • Multi-Score • HIPAA</p>
        </div>
      </footer>
    </div>
  );
}

export default App;

/**
 * API Service for PANOPTES-ICU
 * 
 * Manages all backend API calls
 */

import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// API Service Object
const apiService = {
  // Health & Info
  getSystemInfo: () => api.get('/system-info'),
  getHealth: () => api.get('/health'),
  
  // Scoring Systems
  calculateApacheII: (data) => api.post('/scoring/apache-ii', data),
  calculateSOFA: (data) => api.post('/scoring/sofa', data),
  calculateQSOFA: (data) => api.post('/scoring/qsofa', data),
  calculateGCS: (data) => api.post('/scoring/gcs', data),
  
  // ML Predictions
  predictSepsis: (patientId) => api.post(`/predict/sepsis?patient_id=${patientId}`),
  predictMortality: (patientId, data) => 
    api.post(`/predict/mortality?patient_id=${patientId}`, null, { params: data }),
  predictOrganFailure: (patientId, sofa_components) => 
    api.post(`/predict/organ-failure?patient_id=${patientId}`, { sofa_components }),
  
  // Explainability
  explainPrediction: (data) => api.post('/explain/prediction', data),
  
  // Alerts
  getActiveAlerts: (params) => api.get('/alerts/active', { params }),
  acknowledgeAlert: (alertId, acknowledgedBy) => 
    api.post(`/alerts/${alertId}/acknowledge?acknowledged_by=${acknowledgedBy}`),
  getAlertSummary: (patientId) => 
    api.get('/alerts/summary', { params: { patient_id: patientId } }),
  
  // Dashboard
  getPatientDashboard: (patientId) => api.get(`/dashboard/${patientId}`),
  getDemoPatientData: () => api.get('/demo/patient-data'),
};

export default apiService;

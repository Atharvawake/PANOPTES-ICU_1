"""Alert Service for PANOPTES-ICU

Smart alerting system with:
- Context-aware thresholds
- Multi-criteria decision making
- Alert fatigue reduction
- Escalation protocols
"""

from typing import Dict, List, Optional
from datetime import datetime, timedelta
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class AlertSeverity(Enum):
    """Alert severity levels"""
    INFO = "INFO"
    WARNING = "WARNING"
    URGENT = "URGENT"
    CRITICAL = "CRITICAL"


class AlertType(Enum):
    """Types of clinical alerts"""
    SEPSIS_RISK = "SEPSIS_RISK"
    DETERIORATION = "DETERIORATION"
    ORGAN_FAILURE = "ORGAN_FAILURE"
    SCORE_THRESHOLD = "SCORE_THRESHOLD"
    TREND_CHANGE = "TREND_CHANGE"
    VITAL_SIGN = "VITAL_SIGN"


class Alert:
    """Alert data model"""
    
    def __init__(
        self,
        alert_id: str,
        patient_id: str,
        alert_type: AlertType,
        severity: AlertSeverity,
        message: str,
        details: Dict,
        recommendations: List[str],
        timestamp: datetime = None
    ):
        self.alert_id = alert_id
        self.patient_id = patient_id
        self.alert_type = alert_type
        self.severity = severity
        self.message = message
        self.details = details
        self.recommendations = recommendations
        self.timestamp = timestamp or datetime.now()
        self.acknowledged = False
        self.acknowledged_by = None
        self.acknowledged_at = None
    
    def to_dict(self) -> Dict:
        return {
            'alert_id': self.alert_id,
            'patient_id': self.patient_id,
            'alert_type': self.alert_type.value,
            'severity': self.severity.value,
            'message': self.message,
            'details': self.details,
            'recommendations': self.recommendations,
            'timestamp': self.timestamp.isoformat(),
            'acknowledged': self.acknowledged,
            'acknowledged_by': self.acknowledged_by,
            'acknowledged_at': self.acknowledged_at.isoformat() if self.acknowledged_at else None
        }


class AlertService:
    """Intelligent alert management system"""
    
    def __init__(self):
        self.active_alerts = {}
        self.alert_history = []
        self.alert_counter = 0
        
        # Alert suppression (prevent alert fatigue)
        self.suppression_windows = {}
        self.default_suppression_minutes = {
            AlertType.SEPSIS_RISK: 30,
            AlertType.DETERIORATION: 15,
            AlertType.ORGAN_FAILURE: 30,
            AlertType.SCORE_THRESHOLD: 60,
            AlertType.TREND_CHANGE: 45,
            AlertType.VITAL_SIGN: 10
        }
    
    def create_alert(
        self,
        patient_id: str,
        alert_type: AlertType,
        severity: AlertSeverity,
        message: str,
        details: Dict,
        recommendations: List[str]
    ) -> Optional[Alert]:
        """Create a new alert with suppression logic
        
        Args:
            patient_id: Patient identifier
            alert_type: Type of alert
            severity: Severity level
            message: Alert message
            details: Additional details
            recommendations: Clinical recommendations
            
        Returns:
            Alert object if created, None if suppressed
        """
        # Check if alert should be suppressed
        suppression_key = f"{patient_id}_{alert_type.value}"
        
        if suppression_key in self.suppression_windows:
            last_alert_time = self.suppression_windows[suppression_key]
            suppression_minutes = self.default_suppression_minutes[alert_type]
            
            if datetime.now() - last_alert_time < timedelta(minutes=suppression_minutes):
                logger.info(f"Alert suppressed for {patient_id}: {alert_type.value}")
                return None
        
        # Create alert
        self.alert_counter += 1
        alert_id = f"ALERT_{self.alert_counter:06d}"
        
        alert = Alert(
            alert_id=alert_id,
            patient_id=patient_id,
            alert_type=alert_type,
            severity=severity,
            message=message,
            details=details,
            recommendations=recommendations
        )
        
        # Store alert
        if patient_id not in self.active_alerts:
            self.active_alerts[patient_id] = []
        
        self.active_alerts[patient_id].append(alert)
        self.alert_history.append(alert)
        
        # Update suppression window
        self.suppression_windows[suppression_key] = datetime.now()
        
        logger.info(f"Alert created: {alert_id} for patient {patient_id}")
        
        return alert
    
    def evaluate_sepsis_alert(
        self,
        patient_id: str,
        sepsis_probability: float,
        qsofa_score: int,
        lactate: Optional[float] = None
    ) -> Optional[Alert]:
        """Evaluate and create sepsis risk alert
        
        Args:
            patient_id: Patient identifier
            sepsis_probability: ML model prediction
            qsofa_score: qSOFA score
            lactate: Lactate level (optional)
            
        Returns:
            Alert if criteria met, None otherwise
        """
        # Multi-criteria decision
        alert_triggered = False
        severity = AlertSeverity.INFO
        details = {
            'sepsis_probability': sepsis_probability,
            'qsofa_score': qsofa_score,
            'lactate': lactate
        }
        
        recommendations = []
        
        # Critical criteria
        if sepsis_probability >= 0.7 or (qsofa_score >= 2 and sepsis_probability >= 0.5):
            alert_triggered = True
            severity = AlertSeverity.CRITICAL
            message = f"CRITICAL SEPSIS RISK: {sepsis_probability:.0%} probability, qSOFA={qsofa_score}"
            recommendations = [
                "Initiate sepsis protocol immediately",
                "Obtain blood cultures before antibiotics",
                "Start broad-spectrum antibiotics within 1 hour",
                "Administer 30 mL/kg crystalloid for hypotension or lactate ≥4 mmol/L",
                "Consider ICU transfer"
            ]
        
        # Urgent criteria
        elif sepsis_probability >= 0.5 or qsofa_score >= 2:
            alert_triggered = True
            severity = AlertSeverity.URGENT
            message = f"HIGH SEPSIS RISK: {sepsis_probability:.0%} probability, qSOFA={qsofa_score}"
            recommendations = [
                "Complete full SOFA assessment",
                "Monitor vital signs every 15 minutes",
                "Consider early sepsis workup (cultures, lactate)",
                "Notify attending physician"
            ]
        
        # Warning criteria
        elif sepsis_probability >= 0.3:
            alert_triggered = True
            severity = AlertSeverity.WARNING
            message = f"MODERATE SEPSIS RISK: {sepsis_probability:.0%} probability"
            recommendations = [
                "Increased monitoring frequency",
                "Reassess qSOFA in 1 hour",
                "Review for infection source"
            ]
        
        # Add lactate-specific recommendations
        if lactate and lactate >= 4.0:
            severity = AlertSeverity.CRITICAL
            recommendations.insert(0, f"ELEVATED LACTATE ({lactate} mmol/L) - Fluid resuscitation urgent")
        elif lactate and lactate >= 2.0:
            recommendations.append(f"Moderate lactate elevation ({lactate} mmol/L) - Monitor closely")
        
        if alert_triggered:
            return self.create_alert(
                patient_id=patient_id,
                alert_type=AlertType.SEPSIS_RISK,
                severity=severity,
                message=message,
                details=details,
                recommendations=recommendations
            )
        
        return None
    
    def evaluate_deterioration_alert(
        self,
        patient_id: str,
        deterioration_result: Dict
    ) -> Optional[Alert]:
        """Evaluate and create deterioration alert
        
        Args:
            patient_id: Patient identifier
            deterioration_result: Result from deterioration detector
            
        Returns:
            Alert if deterioration detected
        """
        if not deterioration_result.get('is_deteriorating'):
            return None
        
        severity_map = {
            'HIGH': AlertSeverity.CRITICAL,
            'MODERATE': AlertSeverity.URGENT,
            'LOW': AlertSeverity.WARNING
        }
        
        severity = severity_map.get(
            deterioration_result.get('severity', 'MODERATE'),
            AlertSeverity.WARNING
        )
        
        message = f"PATIENT DETERIORATION DETECTED: {deterioration_result.get('severity')} severity"
        
        details = {
            'reconstruction_error': deterioration_result.get('reconstruction_error'),
            'cusum_alert': deterioration_result.get('cusum_alert'),
            'deviation_score': deterioration_result.get('deviation_score')
        }
        
        recommendations = [
            "Immediate clinical assessment required",
            "Review vital signs and lab trends",
            "Consider STAT labs and imaging",
            "Notify physician immediately",
            "Prepare for potential escalation of care"
        ]
        
        return self.create_alert(
            patient_id=patient_id,
            alert_type=AlertType.DETERIORATION,
            severity=severity,
            message=message,
            details=details,
            recommendations=recommendations
        )
    
    def evaluate_score_alert(
        self,
        patient_id: str,
        score_name: str,
        score_value: int,
        threshold: int,
        details: Dict
    ) -> Optional[Alert]:
        """Evaluate score-based alerts (APACHE, SOFA, etc.)
        
        Args:
            patient_id: Patient identifier
            score_name: Name of scoring system
            score_value: Current score
            threshold: Alert threshold
            details: Additional details
            
        Returns:
            Alert if threshold exceeded
        """
        if score_value < threshold:
            return None
        
        # Determine severity based on score
        if score_name == 'APACHE II':
            if score_value >= 30:
                severity = AlertSeverity.CRITICAL
            elif score_value >= 25:
                severity = AlertSeverity.URGENT
            else:
                severity = AlertSeverity.WARNING
        elif score_name == 'SOFA':
            if score_value >= 15:
                severity = AlertSeverity.CRITICAL
            elif score_value >= 10:
                severity = AlertSeverity.URGENT
            else:
                severity = AlertSeverity.WARNING
        else:
            severity = AlertSeverity.WARNING
        
        message = f"{score_name} SCORE ELEVATED: {score_value} (threshold: {threshold})"
        
        recommendations = [
            f"Review {score_name} component scores",
            "Assess for modifiable factors",
            "Consider intensification of therapy",
            "Document clinical deterioration"
        ]
        
        return self.create_alert(
            patient_id=patient_id,
            alert_type=AlertType.SCORE_THRESHOLD,
            severity=severity,
            message=message,
            details={'score_name': score_name, 'score_value': score_value, **details},
            recommendations=recommendations
        )
    
    def get_active_alerts(
        self,
        patient_id: Optional[str] = None,
        severity: Optional[AlertSeverity] = None
    ) -> List[Dict]:
        """Get active alerts
        
        Args:
            patient_id: Filter by patient (optional)
            severity: Filter by severity (optional)
            
        Returns:
            List of active alerts
        """
        alerts = []
        
        if patient_id:
            alerts = self.active_alerts.get(patient_id, [])
        else:
            for patient_alerts in self.active_alerts.values():
                alerts.extend(patient_alerts)
        
        # Filter by severity
        if severity:
            alerts = [a for a in alerts if a.severity == severity]
        
        # Filter out acknowledged alerts older than 1 hour
        cutoff = datetime.now() - timedelta(hours=1)
        alerts = [
            a for a in alerts
            if not a.acknowledged or (a.acknowledged_at and a.acknowledged_at > cutoff)
        ]
        
        return [a.to_dict() for a in alerts]
    
    def acknowledge_alert(
        self,
        alert_id: str,
        acknowledged_by: str
    ) -> bool:
        """Acknowledge an alert
        
        Args:
            alert_id: Alert identifier
            acknowledged_by: User who acknowledged
            
        Returns:
            True if successful
        """
        for patient_alerts in self.active_alerts.values():
            for alert in patient_alerts:
                if alert.alert_id == alert_id:
                    alert.acknowledged = True
                    alert.acknowledged_by = acknowledged_by
                    alert.acknowledged_at = datetime.now()
                    logger.info(f"Alert {alert_id} acknowledged by {acknowledged_by}")
                    return True
        
        return False
    
    def get_alert_summary(self, patient_id: Optional[str] = None) -> Dict:
        """Get summary of alerts
        
        Args:
            patient_id: Filter by patient (optional)
            
        Returns:
            Dictionary with alert statistics
        """
        alerts = self.get_active_alerts(patient_id)
        
        return {
            'total_active': len(alerts),
            'critical': len([a for a in alerts if a['severity'] == 'CRITICAL']),
            'urgent': len([a for a in alerts if a['severity'] == 'URGENT']),
            'warning': len([a for a in alerts if a['severity'] == 'WARNING']),
            'unacknowledged': len([a for a in alerts if not a['acknowledged']]),
            'by_type': {
                alert_type.value: len([a for a in alerts if a['alert_type'] == alert_type.value])
                for alert_type in AlertType
            }
        }

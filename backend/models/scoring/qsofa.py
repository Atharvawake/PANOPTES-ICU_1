"""qSOFA (Quick SOFA) Scoring System Implementation

Quick Sequential Organ Failure Assessment for sepsis screening
Range: 0-3, ≥2 indicates high risk
"""

from pydantic import BaseModel, Field
from typing import Dict


class qSOFA_Input(BaseModel):
    """Input parameters for qSOFA calculation"""
    respiratory_rate: int = Field(..., description="Respiratory rate in breaths/min")
    systolic_bp: int = Field(..., description="Systolic BP in mmHg")
    gcs: int = Field(..., ge=3, le=15, description="Glasgow Coma Scale")


class qSOFA_Score(BaseModel):
    """qSOFA Score Output"""
    total_score: int
    high_risk: bool
    criteria_met: Dict[str, bool]
    recommendation: str


def calculate_qsofa(input_data: qSOFA_Input) -> qSOFA_Score:
    """Calculate qSOFA Score
    
    Args:
        input_data: Patient clinical parameters
        
    Returns:
        qSOFA_Score with risk assessment
    """
    criteria_met = {
        'tachypnea': input_data.respiratory_rate >= 22,
        'hypotension': input_data.systolic_bp <= 100,
        'altered_mentation': input_data.gcs < 15
    }
    
    total_score = sum(criteria_met.values())
    high_risk = total_score >= 2
    
    if high_risk:
        recommendation = "HIGH RISK - Consider full SOFA assessment and sepsis workup"
    elif total_score == 1:
        recommendation = "MODERATE RISK - Monitor closely"
    else:
        recommendation = "LOW RISK - Continue routine monitoring"
    
    return qSOFA_Score(
        total_score=total_score,
        high_risk=high_risk,
        criteria_met=criteria_met,
        recommendation=recommendation
    )

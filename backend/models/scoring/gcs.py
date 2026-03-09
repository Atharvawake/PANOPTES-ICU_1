"""Glasgow Coma Scale (GCS) Scoring System

Assesses level of consciousness
Range: 3-15
"""

from pydantic import BaseModel, Field
from typing import Dict


class GCS_Input(BaseModel):
    """Input parameters for GCS calculation"""
    eye_response: int = Field(..., ge=1, le=4, description="Eye opening response (1-4)")
    verbal_response: int = Field(..., ge=1, le=5, description="Verbal response (1-5)")
    motor_response: int = Field(..., ge=1, le=6, description="Motor response (1-6)")
    sedated: bool = Field(False, description="Patient is sedated")


class GCS_Score(BaseModel):
    """GCS Score Output"""
    total_score: int
    eye_response: int
    verbal_response: int
    motor_response: int
    severity: str
    component_descriptions: Dict[str, str]
    corrected_for_sedation: bool


EYE_RESPONSE_DESC = {
    4: "Spontaneous",
    3: "To sound",
    2: "To pressure",
    1: "None"
}

VERBAL_RESPONSE_DESC = {
    5: "Oriented",
    4: "Confused",
    3: "Words",
    2: "Sounds",
    1: "None"
}

MOTOR_RESPONSE_DESC = {
    6: "Obeys commands",
    5: "Localizes pain",
    4: "Withdraws from pain",
    3: "Abnormal flexion",
    2: "Extension",
    1: "None"
}


def calculate_gcs(input_data: GCS_Input) -> GCS_Score:
    """Calculate Glasgow Coma Scale
    
    Args:
        input_data: GCS component scores
        
    Returns:
        GCS_Score with severity assessment
    """
    total_score = input_data.eye_response + input_data.verbal_response + input_data.motor_response
    
    # Severity classification
    if total_score >= 13:
        severity = "Mild TBI"
    elif total_score >= 9:
        severity = "Moderate TBI"
    else:
        severity = "Severe TBI"
    
    component_descriptions = {
        'eye': EYE_RESPONSE_DESC.get(input_data.eye_response, "Unknown"),
        'verbal': VERBAL_RESPONSE_DESC.get(input_data.verbal_response, "Unknown"),
        'motor': MOTOR_RESPONSE_DESC.get(input_data.motor_response, "Unknown")
    }
    
    return GCS_Score(
        total_score=total_score,
        eye_response=input_data.eye_response,
        verbal_response=input_data.verbal_response,
        motor_response=input_data.motor_response,
        severity=severity,
        component_descriptions=component_descriptions,
        corrected_for_sedation=input_data.sedated
    )

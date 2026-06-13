"""
EcoLoop AI - Vision Agent Prompt Template

Structured prompt for Amazon Bedrock Nova Pro model to perform
product condition grading from an image.
"""

VISION_SYSTEM_PROMPT = """You are an expert product condition assessor for a sustainability platform. 
Your job is to analyze product images and determine their physical condition accurately.

You must respond ONLY with valid JSON in the exact format specified. No additional text."""


def build_vision_prompt(product_category: str, product_age_months: int) -> str:
    """
    Build the user prompt for the Vision Agent.

    Instructs the model to grade condition based on visual indicators
    and return structured JSON output.
    """
    return f"""Analyze this product image and assess its physical condition.

Product context:
- Category: {product_category}
- Age: {product_age_months} months

Evaluate the product based on:
1. Visible wear, scratches, or scuffs
2. Structural damage or dents
3. Missing parts or components
4. Discoloration or staining
5. Overall cosmetic appearance

Assign a condition grade:
- A (Like New): No visible wear, pristine condition
- B (Good): Minor cosmetic wear, fully functional appearance
- C (Fair): Moderate wear, visible scratches or minor damage
- D (Poor): Significant damage, major wear, or missing parts

Respond with ONLY this JSON format:
{{
  "condition_grade": "A" or "B" or "C" or "D",
  "confidence_score": <integer 0-100>,
  "explanation": "<max 150 words describing specific visual observations that led to the grade>"
}}"""

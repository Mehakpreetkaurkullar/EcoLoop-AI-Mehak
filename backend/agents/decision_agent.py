"""
EcoLoop AI - Decision Agent

Determines the optimal next action (resell, refurbish, donate, recycle)
based on condition grade and resale value using rule-based logic.
Generates a reasoning explanation via Amazon Bedrock Nova Pro.

Pipeline position: Agent 3 of 5
Input: condition_grade, confidence_score, valuation_result, product metadata
Output: action_recommendation, reasoning explanation
"""

import json
import logging
from dataclasses import dataclass

from botocore.exceptions import BotoCoreError, ClientError

from config.aws import get_bedrock_client
from config.settings import get_settings
from agents.valuation_agent import ValuationResult

logger = logging.getLogger("ecoloop.decision_agent")


@dataclass
class DecisionResult:
    """Output from the Decision Agent."""

    action: str  # resell, refurbish, donate, recycle
    reasoning: str  # Explanation (max 100 words)


class DecisionAgent:
    """
    Decision Agent — determines optimal next action for a product.

    Rule-based action selection:
    - resell: Grade A or B AND resale_value > 20% of original price
    - refurbish: Grade B or C AND resale_value > 5% of original price
    - donate: Grade C or D AND product has some value (> 5% original)
    - recycle: Grade D OR resale_value < 5% of original price

    Reasoning generation: Amazon Bedrock Nova Pro produces a human-readable
    explanation (max 100 words) referencing grade, value, and category.
    """

    def __init__(self):
        self.settings = get_settings()
        self.model_id = self.settings.bedrock_text_model_id

    async def decide(
        self,
        condition_grade: str,
        confidence_score: int,
        valuation: ValuationResult,
        product_category: str,
        product_age_months: int,
        original_price: float,
    ) -> DecisionResult:
        """
        Determine the optimal action and generate reasoning.

        Args:
            condition_grade: A, B, C, or D (from Vision Agent).
            confidence_score: 0-100 (from Vision Agent).
            valuation: ValuationResult (from Valuation Agent).
            product_category: Product category string.
            product_age_months: Product age in months.
            original_price: Original price in USD.

        Returns:
            DecisionResult with action and reasoning.
        """
        logger.info(
            f"Deciding: grade={condition_grade}, confidence={confidence_score}, "
            f"base_value=₹{valuation.base_value:.2f}, category={product_category}, "
            f"age={product_age_months}mo, original_price=₹{original_price:.2f}"
        )

        # Step 1: Rule-based action selection
        action = self._select_action(condition_grade, valuation, original_price)
        logger.info(f"Rule-based action selected: {action}")

        # Step 2: Generate reasoning via Bedrock
        reasoning = await self._generate_reasoning(
            action=action,
            condition_grade=condition_grade,
            confidence_score=confidence_score,
            valuation=valuation,
            product_category=product_category,
            product_age_months=product_age_months,
            original_price=original_price,
        )

        result = DecisionResult(action=action, reasoning=reasoning)
        logger.info(f"Decision complete: action={result.action}, reasoning_words={len(result.reasoning.split())}")

        return result

    def _select_action(
        self,
        condition_grade: str,
        valuation: ValuationResult,
        original_price: float,
    ) -> str:
        """
        Deterministic grade-first action selection.

        Each grade maps to exactly one decision branch — no overlap, no priority ambiguity.

        Policy:
          Grade A → resell (Like New always resells)
          Grade B → resell if value > 30% of original, else refurbish
          Grade C → refurbish if value > 15% of original, else donate
          Grade D → donate if value > 5% of original, else recycle
        """
        base_value = valuation.base_value

        if condition_grade == "A":
            return "resell"

        elif condition_grade == "B":
            threshold_30 = original_price * 0.30
            if base_value > threshold_30:
                return "resell"
            else:
                return "refurbish"

        elif condition_grade == "C":
            threshold_15 = original_price * 0.15
            if base_value > threshold_15:
                return "refurbish"
            else:
                return "donate"

        elif condition_grade == "D":
            threshold_05 = original_price * 0.05
            if base_value > threshold_05:
                return "donate"
            else:
                return "recycle"

        return "recycle"

    async def _generate_reasoning(
        self,
        action: str,
        condition_grade: str,
        confidence_score: int,
        valuation: ValuationResult,
        product_category: str,
        product_age_months: int,
        original_price: float,
    ) -> str:
        """
        Generate a human-readable reasoning explanation via Bedrock Nova Pro.

        Falls back to a template-based explanation if Bedrock fails.
        """
        try:
            reasoning = await self._call_bedrock_for_reasoning(
                action, condition_grade, confidence_score,
                valuation, product_category, product_age_months, original_price,
            )
            return reasoning
        except Exception as e:
            logger.warning(f"Bedrock reasoning generation failed: {e}. Using fallback.")
            return self._fallback_reasoning(
                action, condition_grade, valuation, product_category
            )

    async def _call_bedrock_for_reasoning(
        self,
        action: str,
        condition_grade: str,
        confidence_score: int,
        valuation: ValuationResult,
        product_category: str,
        product_age_months: int,
        original_price: float,
    ) -> str:
        """Call Bedrock Nova Pro to generate reasoning text."""
        bedrock_client = get_bedrock_client()

        prompt = (
            f"You are a sustainability advisor. Explain in exactly one paragraph (max 100 words) "
            f"why the recommended action for this product is '{action}'.\n\n"
            f"Product details:\n"
            f"- Category: {product_category}\n"
            f"- Age: {product_age_months} months\n"
            f"- Original price: ₹{original_price:.2f}\n"
            f"- Condition grade: {condition_grade} (confidence: {confidence_score}%)\n"
            f"- Estimated resale value: {valuation.display}\n"
            f"- Has significant resale value: {valuation.has_significant_value}\n\n"
            f"Reference the condition grade, resale value, and product category in your explanation. "
            f"Be concise and actionable."
        )

        request_body = json.dumps({
            "messages": [
                {
                    "role": "user",
                    "content": [{"text": prompt}],
                }
            ],
            "system": [
                {"text": "You are a concise sustainability advisor. Respond with only the explanation paragraph. No headers, no bullet points, no JSON."}
            ],
            "inferenceConfig": {
                "maxTokens": 200,
                "temperature": 0.3,
            },
        })

        response = bedrock_client.invoke_model(
            modelId=self.model_id,
            contentType="application/json",
            accept="application/json",
            body=request_body,
        )

        response_body = json.loads(response["body"].read())
        reasoning = (
            response_body.get("output", {})
            .get("message", {})
            .get("content", [{}])[0]
            .get("text", "")
        ).strip()

        # Truncate to 100 words if needed
        words = reasoning.split()
        if len(words) > 100:
            reasoning = " ".join(words[:100])
            logger.warning("Reasoning exceeded 100 words, truncated.")

        return reasoning

    def _fallback_reasoning(
        self,
        action: str,
        condition_grade: str,
        valuation: ValuationResult,
        product_category: str,
    ) -> str:
        """Template-based fallback reasoning if Bedrock is unavailable."""
        templates = {
            "resell": (
                f"With condition grade {condition_grade} and estimated resale value of "
                f"{valuation.display}, this {product_category} product retains significant market value. "
                f"Reselling maximizes financial recovery while extending the product's useful life."
            ),
            "refurbish": (
                f"With condition grade {condition_grade} and moderate resale potential of "
                f"{valuation.display}, this {product_category} product can be restored to better condition. "
                f"Refurbishment increases value recovery and reduces waste."
            ),
            "donate": (
                f"With condition grade {condition_grade} and limited resale value of "
                f"{valuation.display}, this {product_category} product is still functional. "
                f"Donating extends its useful life and supports community needs."
            ),
            "recycle": (
                f"With condition grade {condition_grade} and minimal resale value, "
                f"this {product_category} product has reached the end of its useful life. "
                f"Responsible recycling recovers materials and prevents landfill waste."
            ),
        }
        return templates.get(action, f"Recommended action: {action}")


# Module-level singleton
decision_agent = DecisionAgent()

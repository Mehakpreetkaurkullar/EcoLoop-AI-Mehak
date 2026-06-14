"""
EcoLoop AI - Assessment Orchestrator

Coordinates the agentic assessment pipeline:
  Vision Agent → Valuation Agent → Decision Agent → Sustainability Agent → Buyer Matching Agent

All 5 agents are fully implemented:
  Vision Agent: Amazon Nova Pro via Bedrock (multimodal image analysis)
  Valuation Agent: Deterministic depreciation logic
  Decision Agent: Rule-based action selection + Bedrock reasoning
  Sustainability Agent: Deterministic scoring framework
  Buyer Matching Agent: Deterministic category-specific persona matching
"""

import logging
from models.schemas import (
    AssessmentRequest,
    AssessmentResponse,
    ResaleValue,
    BuyerPersona,
    ActionRecommendation,
)
from models.database import generate_assessment_id
from agents.vision_agent import vision_agent, VisionResult
from agents.valuation_agent import valuation_agent, ValuationResult
from agents.decision_agent import decision_agent, DecisionResult
from agents.sustainability_agent import sustainability_agent, SustainabilityResult
from agents.buyer_matching_agent import buyer_matching_agent, BuyerMatchingResult

logger = logging.getLogger("ecoloop.orchestrator")


class AssessmentOrchestrator:
    """
    Orchestrates the 5-agent pipeline for product assessment.

    Currently: Vision Agent is real (Bedrock Nova Pro).
    Remaining agents use deterministic logic (to be replaced later).
    """

    async def run(self, request: AssessmentRequest) -> AssessmentResponse:
        """
        Execute the full assessment pipeline.

        Steps:
        1. Vision Agent — analyze image via Bedrock (REAL)
        2. Valuation Agent — compute resale value (deterministic placeholder)
        3. Decision Agent — determine action (deterministic placeholder)
        4. Sustainability Agent — compute credits/CO2 (deterministic placeholder)
        5. Buyer Matching Agent — generate personas (deterministic placeholder)
        """
        assessment_id = generate_assessment_id()
        logger.info(f"[ORCHESTRATOR] Starting pipeline for assessment_id={assessment_id}")

        # =====================================================================
        # Step 1: Vision Agent (REAL — Amazon Nova Pro via Bedrock)
        # =====================================================================
        logger.info("[ORCHESTRATOR] Step 1: Invoking Vision Agent...")
        vision_result = await vision_agent.analyze(
            image_key=request.image_key,
            product_category=request.product_category.value,
            product_age_months=request.product_age_months,
        )
        logger.info(
            f"[ORCHESTRATOR] Vision Agent complete: "
            f"grade={vision_result.condition_grade}, "
            f"confidence={vision_result.confidence_score}%, "
            f"model_id={vision_agent.model_id}"
        )
        print(
            f"[ORCHESTRATOR] VisionResult: grade={vision_result.condition_grade}, "
            f"confidence={vision_result.confidence_score}, "
            f"explanation_words={len(vision_result.explanation.split())}"
        )

        # =====================================================================
        # Step 2: Valuation Agent (REAL — deterministic depreciation logic)
        # =====================================================================
        logger.info("[ORCHESTRATOR] Step 2: Invoking Valuation Agent...")
        valuation_result = valuation_agent.calculate(
            condition_grade=vision_result.condition_grade,
            product_category=request.product_category.value,
            product_age_months=request.product_age_months,
            original_price=request.original_price,
        )
        logger.info(
            f"[ORCHESTRATOR] Valuation Agent complete: "
            f"base=₹{valuation_result.base_value:.2f}, "
            f"range={valuation_result.display}, "
            f"significant={valuation_result.has_significant_value}"
        )
        print(
            f"[ORCHESTRATOR] ValuationResult: base=₹{valuation_result.base_value:.2f}, "
            f"min=₹{valuation_result.resale_min:.2f}, max=₹{valuation_result.resale_max:.2f}, "
            f"display={valuation_result.display}"
        )

        # =====================================================================
        # Step 3: Decision Agent (REAL — rule-based + Bedrock reasoning)
        # =====================================================================
        logger.info("[ORCHESTRATOR] Step 3: Invoking Decision Agent...")
        decision_result = await decision_agent.decide(
            condition_grade=vision_result.condition_grade,
            confidence_score=vision_result.confidence_score,
            valuation=valuation_result,
            product_category=request.product_category.value,
            product_age_months=request.product_age_months,
            original_price=request.original_price,
        )
        logger.info(
            f"[ORCHESTRATOR] Decision Agent complete: "
            f"action={decision_result.action}, "
            f"reasoning_words={len(decision_result.reasoning.split())}"
        )
        print(
            f"[ORCHESTRATOR] DecisionResult: action={decision_result.action}, "
            f"reasoning={decision_result.reasoning[:80]}..."
        )

        # =====================================================================
        # Step 4: Sustainability Agent (REAL — deterministic scoring framework)
        # =====================================================================
        logger.info("[ORCHESTRATOR] Step 4: Invoking Sustainability Agent...")
        sustainability_result = sustainability_agent.calculate(
            action=decision_result.action,
            condition_grade=vision_result.condition_grade,
            product_category=request.product_category.value,
            product_age_months=request.product_age_months,
            original_price=request.original_price,
            valuation=valuation_result,
        )
        logger.info(
            f"[ORCHESTRATOR] Sustainability Agent complete: "
            f"credits={sustainability_result.green_credits}, "
            f"CO2={sustainability_result.co2_savings_kg}kg"
        )
        print(
            f"[ORCHESTRATOR] SustainabilityResult: credits={sustainability_result.green_credits}, "
            f"co2={sustainability_result.co2_savings_kg}kg, "
            f"reasoning_words={len(sustainability_result.reasoning.split())}"
        )

        # =====================================================================
        # Step 5: Buyer Matching Agent (REAL — deterministic persona matching)
        # =====================================================================
        logger.info("[ORCHESTRATOR] Step 5: Invoking Buyer Matching Agent...")
        buyer_matching_result = buyer_matching_agent.match(
            product_category=request.product_category.value,
            condition_grade=vision_result.condition_grade,
            valuation=valuation_result,
            action=decision_result.action,
            product_age_months=request.product_age_months,
            original_price=request.original_price,
        )
        if buyer_matching_result.skipped:
            logger.info(f"[ORCHESTRATOR] Buyer Matching skipped: {buyer_matching_result.skip_reason}")
        else:
            logger.info(
                f"[ORCHESTRATOR] Buyer Matching Agent complete: "
                f"{len(buyer_matching_result.personas)} personas generated"
            )
        print(
            f"[ORCHESTRATOR] BuyerMatchingResult: "
            f"personas={len(buyer_matching_result.personas)}, "
            f"skipped={buyer_matching_result.skipped}"
        )

        # Convert to response schema
        buyer_personas = [
            BuyerPersona(
                label=p.label,
                description=p.description,
                relevance_score=p.relevance_score,
            )
            for p in buyer_matching_result.personas
        ]

        # =====================================================================
        # Assemble final response
        # =====================================================================
        logger.info(f"[ORCHESTRATOR] Pipeline complete for assessment_id={assessment_id}")

        return AssessmentResponse(
            assessment_id=assessment_id,
            condition_grade=vision_result.condition_grade,
            confidence_score=vision_result.confidence_score,
            grade_explanation=vision_result.explanation,
            action_recommendation=decision_result.action,
            action_reasoning=decision_result.reasoning,
            resale_value=ResaleValue(
                min=valuation_result.resale_min,
                max=valuation_result.resale_max,
                display=valuation_result.display,
            ),
            green_credits=sustainability_result.green_credits,
            co2_savings_kg=sustainability_result.co2_savings_kg,
            buyer_personas=buyer_personas,
        )

    # =========================================================================
    # All agents are now real implementations — no placeholders remain.
    # =========================================================================


# Module-level singleton
orchestrator = AssessmentOrchestrator()

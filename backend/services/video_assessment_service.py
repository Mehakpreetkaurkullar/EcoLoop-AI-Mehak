"""
EcoLoop AI - Video Assessment Service

Runs the existing image assessment pipeline on 3 extracted video frames
(beginning, middle, end), then merges the results into a single
AssessmentResponse using worst-case condition grade prioritization.

Final output matches the exact same AssessmentResponse schema as image assessment,
with an added `video_note` field to indicate the video origin.
"""

import logging
import uuid
import base64
from typing import List, Tuple

from models.schemas import (
    AssessmentRequest,
    AssessmentResponse,
    ResaleValue,
    BuyerPersona,
    ConditionGrade,
    ActionRecommendation,
)
from models.database import generate_assessment_id
from agents.vision_agent import VisionResult
from agents.valuation_agent import valuation_agent, ValuationResult
from agents.decision_agent import decision_agent
from agents.sustainability_agent import sustainability_agent
from agents.buyer_matching_agent import buyer_matching_agent
from services.video_frame_extractor import video_frame_extractor
from config.aws import get_bedrock_client
from config.settings import get_settings
from prompts.vision_prompt import build_vision_prompt

import json
import asyncio
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger("ecoloop.video_assessment")

# Grade severity order: D is worst, A is best
GRADE_SEVERITY = {"A": 0, "B": 1, "C": 2, "D": 3}
VALID_GRADES = {"A", "B", "C", "D"}

VIDEO_ASSESSMENT_NOTE = "Assessment generated from key video frames."


class VideoAssessmentService:
    """
    Orchestrates assessment of a video by:
    1. Extracting 3 frames via VideoFrameExtractor
    2. Running the Vision Agent on each frame directly (without S3 re-upload)
    3. Merging the 3 VisionResults — worst condition grade wins
    4. Running the remaining 4 agents with the merged result
    5. Returning a standard AssessmentResponse with video_note set
    """

    async def assess(self, request: AssessmentRequest) -> AssessmentResponse:
        """
        Run video assessment pipeline.

        Args:
            request: Standard AssessmentRequest where image_key points to the
                     uploaded video file in S3.

        Returns:
            AssessmentResponse matching the standard schema, with video_note set.
        """
        assessment_id = generate_assessment_id()
        logger.info(
            f"[VIDEO ASSESSMENT] Starting pipeline for assessment_id={assessment_id}, "
            f"video_key={request.image_key}"
        )

        # =====================================================================
        # Step 1: Extract 3 frames from video
        # =====================================================================
        logger.info("[VIDEO ASSESSMENT] Step 1: Extracting video frames...")
        frames: List[Tuple[bytes, str]] = (
            await video_frame_extractor.extract_frames_from_s3(request.image_key)
        )
        logger.info(f"[VIDEO ASSESSMENT] Extracted {len(frames)} frames")

        # =====================================================================
        # Step 2: Run Vision Agent on each frame
        # =====================================================================
        logger.info("[VIDEO ASSESSMENT] Step 2: Analyzing frames with Vision Agent...")
        frame_labels = ["beginning", "middle", "end"]
        vision_results: List[VisionResult] = []

        for i, (frame_bytes, content_type) in enumerate(frames):
            label = frame_labels[i] if i < len(frame_labels) else f"frame_{i}"
            logger.info(f"[VIDEO ASSESSMENT] Analyzing {label} frame ({len(frame_bytes)} bytes)...")
            vision_result = await self._analyze_frame(
                frame_bytes=frame_bytes,
                content_type=content_type,
                product_category=request.product_category.value,
                product_age_months=request.product_age_months,
                frame_label=label,
            )
            vision_results.append(vision_result)
            logger.info(
                f"[VIDEO ASSESSMENT] {label} frame: grade={vision_result.condition_grade}, "
                f"confidence={vision_result.confidence_score}%"
            )

        # =====================================================================
        # Step 3: Merge frame results — worst grade wins
        # =====================================================================
        merged_vision = self._merge_vision_results(vision_results)
        logger.info(
            f"[VIDEO ASSESSMENT] Merged result: grade={merged_vision.condition_grade}, "
            f"confidence={merged_vision.confidence_score}%"
        )

        # =====================================================================
        # Step 4: Valuation Agent
        # =====================================================================
        valuation_result = valuation_agent.calculate(
            condition_grade=merged_vision.condition_grade,
            product_category=request.product_category.value,
            product_age_months=request.product_age_months,
            original_price=request.original_price,
        )

        # =====================================================================
        # Step 5: Decision Agent
        # =====================================================================
        decision_result = await decision_agent.decide(
            condition_grade=merged_vision.condition_grade,
            confidence_score=merged_vision.confidence_score,
            valuation=valuation_result,
            product_category=request.product_category.value,
            product_age_months=request.product_age_months,
            original_price=request.original_price,
        )

        # =====================================================================
        # Step 6: Sustainability Agent
        # =====================================================================
        sustainability_result = sustainability_agent.calculate(
            action=decision_result.action,
            condition_grade=merged_vision.condition_grade,
            product_category=request.product_category.value,
            product_age_months=request.product_age_months,
            original_price=request.original_price,
            valuation=valuation_result,
        )

        # =====================================================================
        # Step 7: Buyer Matching Agent
        # =====================================================================
        buyer_matching_result = buyer_matching_agent.match(
            product_category=request.product_category.value,
            condition_grade=merged_vision.condition_grade,
            valuation=valuation_result,
            action=decision_result.action,
            product_age_months=request.product_age_months,
            original_price=request.original_price,
        )

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
        logger.info(f"[VIDEO ASSESSMENT] Pipeline complete for assessment_id={assessment_id}")

        return AssessmentResponse(
            assessment_id=assessment_id,
            condition_grade=merged_vision.condition_grade,
            confidence_score=merged_vision.confidence_score,
            grade_explanation=merged_vision.explanation,
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
            video_note=VIDEO_ASSESSMENT_NOTE,
        )

    async def _analyze_frame(
        self,
        frame_bytes: bytes,
        content_type: str,
        product_category: str,
        product_age_months: int,
        frame_label: str,
    ) -> VisionResult:
        """
        Run the Vision Agent's Bedrock invocation directly on frame bytes,
        bypassing the S3 fetch step (frames are already in memory).
        """
        from agents.vision_agent import vision_agent as _vision_agent

        # Reuse the private Bedrock invocation method — frames are already bytes
        MAX_RETRIES = 3
        BASE_BACKOFF = 1
        last_error = None

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                raw_response = await _vision_agent._invoke_bedrock(
                    image_bytes=frame_bytes,
                    content_type=content_type,
                    product_category=product_category,
                    product_age_months=product_age_months,
                )
                result = _vision_agent._parse_response(raw_response)
                return result
            except (BotoCoreError, ClientError) as e:
                last_error = e
                if attempt < MAX_RETRIES:
                    backoff = BASE_BACKOFF * (2 ** (attempt - 1))
                    logger.warning(
                        f"[VIDEO ASSESSMENT] Frame '{frame_label}' attempt {attempt} failed: {e}. "
                        f"Retrying in {backoff}s..."
                    )
                    await asyncio.sleep(backoff)

        logger.error(
            f"[VIDEO ASSESSMENT] All {MAX_RETRIES} attempts failed for frame '{frame_label}'."
        )
        raise RuntimeError(
            f"Vision Agent failed for video frame '{frame_label}' after {MAX_RETRIES} attempts: {last_error}"
        )

    def _merge_vision_results(self, results: List[VisionResult]) -> VisionResult:
        """
        Merge multiple VisionResults into one.

        Rules:
        - Worst condition grade wins (D > C > B > A)
        - Confidence score: average of all frames
        - Explanation: taken from the worst-grade frame; if multiple frames share
          the worst grade, the one with the lowest confidence is used (most uncertain)
          to give the most conservative assessment. A preamble lists all frame grades.
        """
        if not results:
            return VisionResult(
                condition_grade="C",
                confidence_score=30,
                explanation="No frames could be analyzed from the video.",
            )

        # Find worst grade
        worst_grade = max(
            (r.condition_grade for r in results),
            key=lambda g: GRADE_SEVERITY.get(g, 0),
        )

        # Among frames with the worst grade, pick lowest confidence (most uncertain)
        worst_frames = [r for r in results if r.condition_grade == worst_grade]
        representative = min(worst_frames, key=lambda r: r.confidence_score)

        # Average confidence across all frames, rounded to int
        avg_confidence = round(sum(r.confidence_score for r in results) / len(results))

        # Build a merged explanation
        frame_labels = ["beginning", "middle", "end"]
        grade_summary = ", ".join(
            f"{frame_labels[i] if i < len(frame_labels) else f'frame {i}'}: Grade {r.condition_grade}"
            for i, r in enumerate(results)
        )
        merged_explanation = (
            f"[Video analysis — {grade_summary}] "
            f"{representative.explanation}"
        )

        # Trim to 200 words to stay reasonable
        words = merged_explanation.split()
        if len(words) > 200:
            merged_explanation = " ".join(words[:200])

        return VisionResult(
            condition_grade=worst_grade,
            confidence_score=avg_confidence,
            explanation=merged_explanation,
        )


# Module-level singleton
video_assessment_service = VideoAssessmentService()

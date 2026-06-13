"""
EcoLoop AI - Vision Agent

Analyzes product images using Amazon Bedrock Nova Pro multimodal model
to determine condition grade, confidence score, and explanation.

Pipeline position: Agent 1 of 5
Input: product image (S3 key) + product metadata
Output: condition_grade (A/B/C/D), confidence_score (0-100), explanation (max 150 words)
"""

import asyncio
import base64
import json
import logging
from dataclasses import dataclass
from typing import Optional

from botocore.exceptions import BotoCoreError, ClientError

from config.aws import get_s3_client, get_bedrock_client
from config.settings import get_settings
from prompts.vision_prompt import build_vision_prompt

logger = logging.getLogger("ecoloop.vision_agent")

# Valid condition grades
VALID_GRADES = {"A", "B", "C", "D"}

# Retry configuration
MAX_RETRIES = 3
BASE_BACKOFF_SECONDS = 1  # 1s, 2s, 4s exponential backoff


@dataclass
class VisionResult:
    """Output from the Vision Agent."""

    condition_grade: str  # A, B, C, or D
    confidence_score: int  # 0-100
    explanation: str  # Max 150 words


class VisionAgent:
    """
    Vision Agent — analyzes product images via Amazon Bedrock Nova Pro model.

    Responsibilities:
    - Retrieve product image from S3
    - Invoke Bedrock multimodal model with structured prompt
    - Parse and validate the response
    - Retry on transient failures with exponential backoff
    """

    def __init__(self):
        self.settings = get_settings()
        self.model_id = self.settings.bedrock_model_id

    async def analyze(
        self,
        image_key: str,
        product_category: str,
        product_age_months: int,
    ) -> VisionResult:
        """
        Analyze a product image and return condition assessment.

        Args:
            image_key: S3 object key of the uploaded product image.
            product_category: Product category (e.g., "Electronics").
            product_age_months: Product age in months.

        Returns:
            VisionResult with condition_grade, confidence_score, explanation.

        Raises:
            RuntimeError: If all retry attempts fail.
        """
        print("VISION AGENT STARTED")
        logger.info(
            f"Starting analysis: image_key={image_key}, "
            f"category={product_category}, age={product_age_months}mo"
        )

        # Step 1: Retrieve image from S3
        image_bytes, content_type = await self._get_image_from_s3(image_key)
        logger.info(f"Image retrieved from S3: {len(image_bytes)} bytes, type={content_type}")

        # Step 2: Invoke Bedrock with retries
        raw_response = await self._invoke_bedrock_with_retries(
            image_bytes, content_type, product_category, product_age_months
        )

        # Step 3: Parse and validate response
        result = self._parse_response(raw_response)
        logger.info(
            f"Analysis complete: grade={result.condition_grade}, "
            f"confidence={result.confidence_score}%"
        )

        return result

    async def _get_image_from_s3(self, image_key: str) -> tuple[bytes, str]:
        """
        Retrieve product image from S3.

        Returns:
            Tuple of (image_bytes, content_type).
        """
        s3_client = get_s3_client()

        try:
            response = s3_client.get_object(
                Bucket=self.settings.s3_bucket_name,
                Key=image_key,
            )
            image_bytes = response["Body"].read()
            content_type = response.get("ContentType", "image/jpeg")
            return image_bytes, content_type
        except (BotoCoreError, ClientError) as e:
            logger.error(f"S3 retrieval failed for key={image_key}: {e}")
            raise RuntimeError(f"Failed to retrieve image from S3: {e}")

    async def _invoke_bedrock_with_retries(
        self,
        image_bytes: bytes,
        content_type: str,
        product_category: str,
        product_age_months: int,
    ) -> str:
        """
        Invoke Bedrock with exponential backoff retry (1s, 2s, 4s).

        Returns:
            Raw text response from Bedrock.

        Raises:
            RuntimeError: If all retries exhausted.
        """
        last_error: Optional[Exception] = None

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                logger.info(f"Bedrock invocation attempt {attempt}/{MAX_RETRIES}")
                response_text = await self._invoke_bedrock(
                    image_bytes, content_type, product_category, product_age_months
                )
                return response_text

            except (BotoCoreError, ClientError) as e:
                last_error = e
                if attempt < MAX_RETRIES:
                    backoff = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
                    logger.warning(
                        f"Bedrock attempt {attempt} failed: {e}. "
                        f"Retrying in {backoff}s..."
                    )
                    await asyncio.sleep(backoff)
                else:
                    logger.error(f"All {MAX_RETRIES} Bedrock attempts failed.")

        raise RuntimeError(
            f"Vision Agent failed after {MAX_RETRIES} attempts: {last_error}"
        )

    async def _invoke_bedrock(
        self,
        image_bytes: bytes,
        content_type: str,
        product_category: str,
        product_age_months: int,
    ) -> str:
        """
        Single Bedrock Nova Pro model invocation.

        Uses the Amazon Nova Messages format with image + text content.

        Returns:
            Raw text content from the model response.
        """
        bedrock_client = get_bedrock_client()

        # Determine image format for Nova
        image_format = self._get_image_format(content_type)

        # Encode image as base64
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")

        # Build the user prompt
        user_prompt = build_vision_prompt(product_category, product_age_months)

        # Construct the request body (Amazon Nova format)
        request_body = json.dumps({
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "image": {
                                "format": image_format,
                                "source": {
                                    "bytes": image_b64,
                                },
                            },
                        },
                        {
                            "text": user_prompt,
                        },
                    ],
                }
            ],
            "system": [
                {
                    "text": "You are an expert product condition assessor. "
                    "Respond ONLY with valid JSON in the exact format requested. "
                    "No additional text or explanation outside the JSON."
                }
            ],
            "inferenceConfig": {
                "maxTokens": 1024,
                "temperature": 0.2,
            },
        })

        # Invoke the model
        response = bedrock_client.invoke_model(
            modelId=self.model_id,
            contentType="application/json",
            accept="application/json",
            body=request_body,
        )

        # Parse the Nova response format
        response_body = json.loads(response["body"].read())
        text_content = (
            response_body.get("output", {})
            .get("message", {})
            .get("content", [{}])[0]
            .get("text", "")
        )

        logger.debug(f"Bedrock raw response: {text_content[:200]}")
        return text_content

    def _parse_response(self, raw_response: str) -> VisionResult:
        """
        Parse and validate the Bedrock model response.

        Validates:
        - condition_grade is one of A, B, C, D
        - confidence_score is an integer 0-100
        - explanation is present and within 150 word limit

        Falls back to grade C with low confidence if parsing fails.
        """
        try:
            # Strip markdown code fences if present
            cleaned = raw_response.strip()
            if cleaned.startswith("```"):
                # Remove opening fence (possibly with language hint)
                cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

            data = json.loads(cleaned)

            # Extract and validate grade
            grade = str(data.get("condition_grade", "")).upper().strip()
            if grade not in VALID_GRADES:
                logger.warning(f"Invalid grade '{grade}', defaulting to C")
                grade = "C"

            # Extract and validate confidence
            confidence = int(data.get("confidence_score", 50))
            confidence = max(0, min(100, confidence))

            # Extract and validate explanation
            explanation = str(data.get("explanation", "Unable to generate explanation."))
            words = explanation.split()
            if len(words) > 150:
                explanation = " ".join(words[:150])
                logger.warning("Explanation exceeded 150 words, truncated.")

            return VisionResult(
                condition_grade=grade,
                confidence_score=confidence,
                explanation=explanation,
            )

        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
            logger.error(f"Failed to parse Bedrock response: {e}. Raw: {raw_response[:300]}")
            # Fallback response for malformed output
            return VisionResult(
                condition_grade="C",
                confidence_score=30,
                explanation="Unable to parse AI response. Assigned default grade C with low confidence.",
            )

    @staticmethod
    def _get_image_format(content_type: str) -> str:
        """Map content type to Nova image format string."""
        mapping = {
            "image/jpeg": "jpeg",
            "image/jpg": "jpeg",
            "image/png": "png",
            "image/webp": "webp",
        }
        return mapping.get(content_type.lower(), "jpeg")


# Module-level singleton for convenience
vision_agent = VisionAgent()

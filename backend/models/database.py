"""
EcoLoop AI - DynamoDB Database Operations

Handles persistence of assessment records and user metrics.
Tables:
  - Assessments: PK=assessment_id, SK=user_session_id
  - UserMetrics: PK=user_session_id
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, status

from config.aws import get_assessments_table, get_usermetrics_table
from models.schemas import (
    AssessmentResponse,
    AssessmentRequest,
    ActionRecommendation,
)


def _to_decimal(value: float) -> Decimal:
    """Convert float to Decimal for DynamoDB compatibility."""
    return Decimal(str(round(value, 2)))


def build_assessment_record(
    assessment: AssessmentResponse,
    request: AssessmentRequest,
    user_session_id: str,
) -> dict[str, Any]:
    """
    Build a DynamoDB item from assessment response and request data.

    Returns a dict ready to be written to the Assessments table.
    """
    return {
        "assessment_id": assessment.assessment_id,
        "user_session_id": user_session_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "image_key": request.image_key,
        "product_category": request.product_category.value,
        "product_age_months": request.product_age_months,
        "original_price": _to_decimal(request.original_price),
        "condition_grade": assessment.condition_grade.value,
        "confidence_score": assessment.confidence_score,
        "grade_explanation": assessment.grade_explanation,
        "action_recommendation": assessment.action_recommendation.value,
        "action_reasoning": assessment.action_reasoning,
        "resale_value_min": _to_decimal(assessment.resale_value.min),
        "resale_value_max": _to_decimal(assessment.resale_value.max),
        "green_credits": assessment.green_credits,
        "co2_savings_kg": _to_decimal(assessment.co2_savings_kg),
        "buyer_personas": [
            {
                "label": p.label,
                "description": p.description,
                "relevance_score": p.relevance_score,
            }
            for p in assessment.buyer_personas
        ],
    }


async def save_assessment(
    assessment: AssessmentResponse,
    request: AssessmentRequest,
    user_session_id: str,
) -> None:
    """
    Persist a complete assessment record to the Assessments DynamoDB table.

    Args:
        assessment: The full assessment response from the pipeline.
        request: The original assessment request (image_key + metadata).
        user_session_id: Session ID identifying the user.

    Raises:
        HTTPException: If DynamoDB write fails.
    """
    table = get_assessments_table()
    record = build_assessment_record(assessment, request, user_session_id)

    try:
        table.put_item(Item=record)
    except (BotoCoreError, ClientError) as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": "persistence_failed",
                "message": f"Failed to save assessment: {str(e)}",
            },
        )


async def set_final_action(assessment_id: str, final_action: str) -> None:
    """
    Update an assessment record with the user's final circular action.

    Called when a listing is created (the user commits to an action).
    The assessment_id is the PK of the Assessments table.
    """
    table = get_assessments_table()
    try:
        table.update_item(
            Key={"assessment_id": assessment_id},
            UpdateExpression="SET final_action = :fa",
            ExpressionAttributeValues={":fa": final_action},
        )
        print(f"[INFO] Set final_action={final_action} on assessment={assessment_id}")
    except (BotoCoreError, ClientError) as e:
        print(f"[WARN] Failed to set final_action: {e}")


async def update_user_metrics(
    user_session_id: str,
    action,  # ActionRecommendation enum or str
    green_credits: int,
    co2_savings_kg: float,
) -> None:
    """
    Update aggregated user metrics in the UserMetrics DynamoDB table.

    Increments totals atomically using DynamoDB update expressions.

    Args:
        user_session_id: Session ID identifying the user.
        action: The action recommendation (resell/refurbish/donate/recycle).
        green_credits: Credits to add to the user's total.
        co2_savings_kg: CO2 savings to add to the user's total.

    Raises:
        HTTPException: If DynamoDB update fails.
    """
    table = get_usermetrics_table()

    try:
        # First, ensure the action_counts map exists on the item.
        # DynamoDB ADD cannot create nested map attributes on first write.
        # We use a two-step approach: SET the map if it doesn't exist, then ADD.
        table.update_item(
            Key={"user_session_id": user_session_id},
            UpdateExpression=(
                "SET last_updated = :now, "
                "action_counts = if_not_exists(action_counts, :empty_map)"
            ),
            ExpressionAttributeValues={
                ":now": datetime.now(timezone.utc).isoformat(),
                ":empty_map": {},
            },
        )

        # Now atomically increment all counters
        table.update_item(
            Key={"user_session_id": user_session_id},
            UpdateExpression=(
                "ADD total_green_credits :credits, "
                "total_assessments :one, "
                "total_co2_saved_kg :co2, "
                "action_counts.#action :one"
            ),
            ExpressionAttributeNames={
                "#action": action.value if hasattr(action, 'value') else str(action),
            },
            ExpressionAttributeValues={
                ":credits": green_credits,
                ":one": 1,
                ":co2": _to_decimal(co2_savings_kg),
            },
        )
        print(f"[INFO] UserMetrics updated for session={user_session_id}, action={action.value if hasattr(action, 'value') else action}, credits={green_credits}")
    except (BotoCoreError, ClientError) as e:
        # Log the full error for debugging
        print(f"[ERROR] Failed to update user metrics for session={user_session_id}: {type(e).__name__}: {e}")


async def update_exchange_metrics(
    user_session_id: str,
    green_credits: int,
    co2_savings_kg: float,
) -> None:
    """
    Update metrics for an exchange completion.

    Unlike update_user_metrics, this does NOT increment total_assessments
    because an exchange is a marketplace action, not a new AI assessment.
    Only updates: action_counts.exchange, green_credits, co2_saved.
    """
    table = get_usermetrics_table()

    try:
        table.update_item(
            Key={"user_session_id": user_session_id},
            UpdateExpression=(
                "SET last_updated = :now, "
                "action_counts = if_not_exists(action_counts, :empty_map)"
            ),
            ExpressionAttributeValues={
                ":now": datetime.now(timezone.utc).isoformat(),
                ":empty_map": {},
            },
        )

        table.update_item(
            Key={"user_session_id": user_session_id},
            UpdateExpression=(
                "ADD total_green_credits :credits, "
                "total_co2_saved_kg :co2, "
                "action_counts.#action :one"
            ),
            ExpressionAttributeNames={
                "#action": "exchange",
            },
            ExpressionAttributeValues={
                ":credits": green_credits,
                ":one": 1,
                ":co2": _to_decimal(co2_savings_kg),
            },
        )
        print(f"[INFO] Exchange metrics updated for session={user_session_id}, credits={green_credits}")
    except (BotoCoreError, ClientError) as e:
        print(f"[ERROR] Failed to update exchange metrics: {type(e).__name__}: {e}")


async def get_user_metrics(user_session_id: str) -> dict[str, Any]:
    """
    Retrieve aggregated metrics for a user from the UserMetrics table.

    Returns default values if no record exists yet.
    """
    table = get_usermetrics_table()

    try:
        response = table.get_item(Key={"user_session_id": user_session_id})
        item = response.get("Item")

        if not item:
            return {
                "total_green_credits": 0,
                "total_assessments": 0,
                "total_co2_saved_kg": 0.0,
                "action_counts": {},
            }

        return {
            "total_green_credits": int(item.get("total_green_credits", 0)),
            "total_assessments": int(item.get("total_assessments", 0)),
            "total_co2_saved_kg": float(item.get("total_co2_saved_kg", 0)),
            "action_counts": item.get("action_counts", {}),
        }
    except (BotoCoreError, ClientError) as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": "read_failed",
                "message": f"Failed to read user metrics: {str(e)}",
            },
        )


async def get_recent_assessments(
    user_session_id: str, limit: int = 10
) -> list[dict[str, Any]]:
    """
    Retrieve recent assessments for a user from the Assessments table.

    Returns a list of assessment summaries ordered by creation time (newest first).
    """
    table = get_assessments_table()

    try:
        response = table.query(
            IndexName="user_session_id-created_at-index",
            KeyConditionExpression="user_session_id = :uid",
            ExpressionAttributeValues={":uid": user_session_id},
            ScanIndexForward=False,  # newest first
            Limit=limit,
        )

        return [
            {
                "assessment_id": item["assessment_id"],
                "product_category": item.get("product_category", ""),
                "condition_grade": item.get("condition_grade", ""),
                "action_recommendation": item.get("final_action") or item.get("action_recommendation", ""),
                "recommended_action": item.get("action_recommendation", ""),
                "final_action": item.get("final_action", ""),
                "created_at": item.get("created_at", ""),
            }
            for item in response.get("Items", [])
        ]
    except (BotoCoreError, ClientError):
        # Fallback: scan ALL items then filter in-memory (no GSI available).
        # This is acceptable at hackathon scale (<1000 items).
        # For production, create the GSI: user_session_id (HASH) + created_at (RANGE).
        try:
            # Scan without Limit — DynamoDB Limit applies BEFORE FilterExpression,
            # which causes items to be missed. We need all items first, then filter.
            all_items = []
            scan_kwargs = {
                "FilterExpression": "user_session_id = :uid",
                "ExpressionAttributeValues": {":uid": user_session_id},
            }

            # Paginate through all results (handles >1MB responses)
            while True:
                response = table.scan(**scan_kwargs)
                all_items.extend(response.get("Items", []))
                # Check for pagination
                last_key = response.get("LastEvaluatedKey")
                if last_key:
                    scan_kwargs["ExclusiveStartKey"] = last_key
                else:
                    break

            # Sort by created_at descending (newest first) and take top N
            all_items.sort(
                key=lambda x: x.get("created_at", ""),
                reverse=True,
            )
            top_items = all_items[:limit]

            return [
                {
                    "assessment_id": item["assessment_id"],
                    "product_category": item.get("product_category", ""),
                    "condition_grade": item.get("condition_grade", ""),
                    "action_recommendation": item.get("final_action") or item.get("action_recommendation", ""),
                    "recommended_action": item.get("action_recommendation", ""),
                    "final_action": item.get("final_action", ""),
                    "created_at": item.get("created_at", ""),
                }
                for item in top_items
            ]
        except (BotoCoreError, ClientError) as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "error": "read_failed",
                    "message": f"Failed to read assessments: {str(e)}",
                },
            )


def generate_assessment_id() -> str:
    """Generate a unique assessment ID."""
    return uuid.uuid4().hex

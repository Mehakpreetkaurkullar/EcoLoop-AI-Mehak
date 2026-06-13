"""
EcoLoop AI - AWS Client Configuration

Provides configured boto3 clients for S3, Bedrock Runtime, and DynamoDB.
All clients are lazily initialized and cached for reuse.
"""

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError

from config.settings import get_settings

# Boto3 retry configuration for transient failures
_boto_config = BotoConfig(
    region_name=get_settings().aws_region,
    retries={"max_attempts": 3, "mode": "adaptive"},
)


def _build_session_kwargs() -> dict:
    """
    Build kwargs for boto3 client creation.

    Uses explicit credentials if provided in env vars,
    otherwise falls back to the default credential chain
    (IAM role, ~/.aws/credentials, etc.).
    """
    settings = get_settings()
    kwargs: dict = {
        "config": _boto_config,
        "region_name": settings.aws_region,
    }

    # Only inject explicit credentials if both are set.
    # Otherwise, rely on the default AWS credential chain.
    if settings.aws_access_key_id and settings.aws_secret_access_key:
        kwargs["aws_access_key_id"] = settings.aws_access_key_id
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key

    return kwargs


# ---------------------------------------------------------------------------
# S3 Client
# ---------------------------------------------------------------------------

_s3_client = None


def get_s3_client():
    """
    Return a configured S3 client.

    Used by the Upload Service to store product images.
    """
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3", **_build_session_kwargs())
    return _s3_client


# ---------------------------------------------------------------------------
# Bedrock Runtime Client
# ---------------------------------------------------------------------------

_bedrock_client = None


def get_bedrock_client():
    """
    Return a configured Bedrock Runtime client.

    Used by the Vision Agent (multimodal) and Decision/Buyer Matching Agents (text).
    """
    global _bedrock_client
    if _bedrock_client is None:
        _bedrock_client = boto3.client("bedrock-runtime", **_build_session_kwargs())
    return _bedrock_client


# ---------------------------------------------------------------------------
# DynamoDB Client
# ---------------------------------------------------------------------------

_dynamodb_resource = None


def get_dynamodb_resource():
    """
    Return a configured DynamoDB resource.

    Used for Assessments and UserMetrics table operations.
    """
    global _dynamodb_resource
    if _dynamodb_resource is None:
        _dynamodb_resource = boto3.resource("dynamodb", **_build_session_kwargs())
    return _dynamodb_resource


def get_assessments_table():
    """Return the DynamoDB Assessments table reference."""
    settings = get_settings()
    return get_dynamodb_resource().Table(settings.dynamodb_assessments_table)


def get_usermetrics_table():
    """Return the DynamoDB UserMetrics table reference."""
    settings = get_settings()
    return get_dynamodb_resource().Table(settings.dynamodb_usermetrics_table)


def get_listings_table():
    """Return the DynamoDB Listings table reference."""
    settings = get_settings()
    return get_dynamodb_resource().Table(settings.dynamodb_listings_table)

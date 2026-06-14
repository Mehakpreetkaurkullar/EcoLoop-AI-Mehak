"""
EcoLoop AI - Upload Service

Handles file validation and S3 storage for product images and videos.
"""

import uuid
from fastapi import UploadFile, HTTPException, status
from botocore.exceptions import BotoCoreError, ClientError

from config.settings import get_settings
from config.aws import get_s3_client

# Allowed MIME types for product images
ALLOWED_IMAGE_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}

# Allowed MIME types for product videos
ALLOWED_VIDEO_CONTENT_TYPES = {
    "video/mp4",
    "video/quicktime",  # .mov
    "video/webm",
}

# All allowed MIME types combined
ALLOWED_CONTENT_TYPES = ALLOWED_IMAGE_CONTENT_TYPES | ALLOWED_VIDEO_CONTENT_TYPES

# Maximum file sizes
MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024   # 10 MB
MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024   # 50 MB


def is_video_content_type(content_type: str) -> bool:
    """Return True if the MIME type is a video format."""
    return content_type in ALLOWED_VIDEO_CONTENT_TYPES


def validate_file(file: UploadFile) -> None:
    """
    Validate uploaded file type and size.

    Images: JPEG, PNG, WebP — max 10 MB
    Videos: MP4, MOV, WebM  — max 50 MB

    Raises HTTPException with 400 status if validation fails.
    """
    # Validate content type
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "invalid_format",
                "message": (
                    f"File must be JPEG, PNG, WebP (image) or MP4, MOV, WebM (video). "
                    f"Got: {file.content_type}"
                ),
            },
        )

    # Determine max size based on type
    max_size = (
        MAX_VIDEO_SIZE_BYTES
        if is_video_content_type(file.content_type)
        else MAX_IMAGE_SIZE_BYTES
    )
    limit_label = "50 MB" if is_video_content_type(file.content_type) else "10 MB"

    # Validate file size (check Content-Length header if available)
    if file.size is not None and file.size > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "file_too_large",
                "message": f"File size exceeds {limit_label} limit. Got: {file.size / (1024 * 1024):.1f} MB",
            },
        )


def generate_image_key(original_filename: str) -> str:
    """
    Generate a unique S3 object key for the uploaded file (image or video).

    Format: uploads/<uuid>/<original_filename>
    """
    unique_id = uuid.uuid4().hex
    # Sanitize filename - keep only the last part
    safe_name = original_filename.split("/")[-1].split("\\")[-1]
    return f"uploads/{unique_id}/{safe_name}"


async def upload_to_s3(file: UploadFile, image_key: str) -> str:
    """
    Upload file to S3 and return a pre-signed download URL.

    Accepts both images (≤10 MB) and videos (≤50 MB).

    Args:
        file: The uploaded file object.
        image_key: The S3 object key to store the file under.

    Returns:
        A pre-signed URL for previewing the uploaded file (15-min expiry).

    Raises:
        HTTPException: If S3 upload fails or size exceeds limit.
    """
    settings = get_settings()
    s3_client = get_s3_client()

    is_video = is_video_content_type(file.content_type or "")
    max_size = MAX_VIDEO_SIZE_BYTES if is_video else MAX_IMAGE_SIZE_BYTES
    limit_label = "50 MB" if is_video else "10 MB"

    try:
        # Read file content
        file_content = await file.read()

        # Validate actual file size after reading
        if len(file_content) > max_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "file_too_large",
                    "message": f"File size exceeds {limit_label} limit. Got: {len(file_content) / (1024 * 1024):.1f} MB",
                },
            )

        # Upload to S3
        s3_client.put_object(
            Bucket=settings.s3_bucket_name,
            Key=image_key,
            Body=file_content,
            ContentType=file.content_type,
        )

        # Generate pre-signed URL for preview (15-minute expiry)
        preview_url = s3_client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.s3_bucket_name,
                "Key": image_key,
            },
            ExpiresIn=900,  # 15 minutes
        )

        return preview_url

    except HTTPException:
        # Re-raise validation errors
        raise
    except (BotoCoreError, ClientError) as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": "upload_failed",
                "message": f"Failed to upload file to storage: {str(e)}",
            },
        )

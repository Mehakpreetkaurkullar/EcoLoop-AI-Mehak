"""
EcoLoop AI - Upload Router

POST /api/upload - Accept product image or video uploads.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException

from models.schemas import UploadResponse, ErrorResponse
from services.upload_service import (
    validate_file,
    generate_image_key,
    upload_to_s3,
    is_video_content_type,
)

router = APIRouter(prefix="/api", tags=["upload"])


@router.post(
    "/upload",
    response_model=UploadResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid file type or size"},
        502: {"model": ErrorResponse, "description": "S3 upload failed"},
    },
    summary="Upload a product image or video",
    description=(
        "Accepts a product image (JPEG, PNG, WebP; max 10MB) or "
        "a product video (MP4, MOV, WebM; max 50MB), "
        "stores it in S3, and returns the file key and preview URL."
    ),
)
async def upload_file(file: UploadFile = File(..., description="Product image or video file")):
    """
    Upload a product image or video for assessment.

    Flow: Frontend → Backend (validate) → S3 → return image_key + preview_url
    """
    # Step 1: Validate file type and size
    validate_file(file)

    # Step 2: Generate unique S3 key
    image_key = generate_image_key(file.filename or "upload.jpg")

    # Step 3: Upload to S3 and get preview URL
    preview_url = await upload_to_s3(file, image_key)

    # Step 4: Return structured response
    return UploadResponse(
        image_key=image_key,
        preview_url=preview_url,
        file_name=file.filename or "upload.jpg",
        content_type=file.content_type or "image/jpeg",
        file_size=file.size or 0,
    )

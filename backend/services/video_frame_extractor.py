"""
EcoLoop AI - Video Frame Extractor

Extracts 3 representative frames (beginning, middle, end) from a video
stored in S3, returning each as JPEG bytes suitable for the Vision Agent.

Uses OpenCV (opencv-python-headless) for frame extraction.
"""

import io
import logging
import tempfile
import os
from typing import List, Tuple

import cv2
import numpy as np

from config.aws import get_s3_client
from config.settings import get_settings

logger = logging.getLogger("ecoloop.video_frame_extractor")

# Number of representative frames to extract
FRAME_COUNT = 3

# JPEG encode quality (0-100)
JPEG_QUALITY = 90


class VideoFrameExtractor:
    """
    Extracts representative frames from a video file stored in S3.

    Frame positions:
      - Frame 0: beginning  (5% into the video to skip black intro)
      - Frame 1: middle     (50%)
      - Frame 2: end        (95% to avoid black outro)
    """

    # Relative positions within the video (0.0 to 1.0)
    FRAME_POSITIONS = [0.05, 0.50, 0.95]

    async def extract_frames_from_s3(
        self, video_key: str
    ) -> List[Tuple[bytes, str]]:
        """
        Download a video from S3 and extract 3 representative frames.

        Args:
            video_key: S3 object key of the uploaded video.

        Returns:
            List of (jpeg_bytes, content_type) tuples — always 3 items.
            content_type is always "image/jpeg".

        Raises:
            RuntimeError: If video cannot be downloaded or decoded.
        """
        logger.info(f"Extracting frames from video: {video_key}")

        # Step 1: Download video from S3 into a temp file
        video_bytes = self._download_from_s3(video_key)
        logger.info(f"Downloaded video: {len(video_bytes)} bytes")

        # Step 2: Write to a temporary file (OpenCV needs a file path)
        frames = self._extract_frames_from_bytes(video_bytes)
        logger.info(f"Extracted {len(frames)} frames from video")

        return frames

    def _download_from_s3(self, video_key: str) -> bytes:
        """Download video bytes from S3."""
        settings = get_settings()
        s3_client = get_s3_client()

        try:
            response = s3_client.get_object(
                Bucket=settings.s3_bucket_name,
                Key=video_key,
            )
            return response["Body"].read()
        except Exception as e:
            logger.error(f"Failed to download video from S3: {e}")
            raise RuntimeError(f"Failed to download video from S3: {e}")

    def _extract_frames_from_bytes(
        self, video_bytes: bytes
    ) -> List[Tuple[bytes, str]]:
        """
        Write video bytes to a temp file, open with OpenCV, and extract frames.

        Returns list of (jpeg_bytes, "image/jpeg") tuples.
        """
        tmp_path = None
        try:
            # Write video to a temp file — OpenCV requires a seekable file path
            with tempfile.NamedTemporaryFile(
                suffix=".mp4", delete=False
            ) as tmp_file:
                tmp_path = tmp_file.name
                tmp_file.write(video_bytes)

            cap = cv2.VideoCapture(tmp_path)
            if not cap.isOpened():
                raise RuntimeError("OpenCV could not open the video file.")

            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            if total_frames <= 0:
                raise RuntimeError("Video has no readable frames.")

            logger.info(f"Video has {total_frames} total frames")

            frames: List[Tuple[bytes, str]] = []
            for position in self.FRAME_POSITIONS:
                target_frame = max(0, min(int(total_frames * position), total_frames - 1))
                cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
                ret, frame = cap.read()

                if not ret or frame is None:
                    logger.warning(
                        f"Could not read frame at position {position:.0%} "
                        f"(frame #{target_frame}). Using blank frame."
                    )
                    # Fall back to a 1×1 blank white JPEG so the pipeline never breaks
                    blank = np.full((480, 640, 3), 255, dtype=np.uint8)
                    frame = blank

                # Encode frame as JPEG
                encode_params = [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]
                success, buffer = cv2.imencode(".jpg", frame, encode_params)
                if not success:
                    raise RuntimeError(f"Failed to JPEG-encode frame at {position:.0%}")

                jpeg_bytes = buffer.tobytes()
                frames.append((jpeg_bytes, "image/jpeg"))
                logger.info(
                    f"Frame at {position:.0%}: {len(jpeg_bytes)} bytes"
                )

            cap.release()
            return frames

        except RuntimeError:
            raise
        except Exception as e:
            logger.error(f"Unexpected error extracting video frames: {e}")
            raise RuntimeError(f"Video frame extraction failed: {e}")
        finally:
            # Always clean up the temp file
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass


# Module-level singleton
video_frame_extractor = VideoFrameExtractor()

import base64
import contextlib
import io
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime
import importlib.util
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).resolve().parents[3]
LIVENESS_SCRIPT = ROOT_DIR / "ml" / "liveness-service" / "liveness.py"
OUTPUT_DIR = ROOT_DIR / "ml" / "liveness-service" / "extracted_faces"
UPLOAD_DIR = ROOT_DIR / "ml" / "docservice" / "uploads"
CROP_OUTPUT_DIR = ROOT_DIR / "ml" / "docservice" / "crops"
FACE_SERVICE_COMPARE_URL = os.getenv("FACE_SERVICE_COMPARE_URL", "http://127.0.0.1:8001/compare")

DOC_SERVICE_DIR = ROOT_DIR / "ml" / "docservice"
FACE_SERVICE_DIR = ROOT_DIR / "ml" / "face-services"
for service_dir in (DOC_SERVICE_DIR, FACE_SERVICE_DIR):
    if str(service_dir) not in sys.path:
        sys.path.append(str(service_dir))

from detect_crop import DocumentDetector
from embed import get_embedding
from match import compare_embeddings

app = FastAPI(title="KYC Unified Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


detector = DocumentDetector()


def _save_upload(file: UploadFile, destination_dir: Path, prefix: str) -> Path:
    destination_dir.mkdir(parents=True, exist_ok=True)
    extension = Path(file.filename or "").suffix or ".jpg"
    destination_path = destination_dir / f"{prefix}_{uuid4().hex}{extension}"

    with destination_path.open("wb") as out_file:
        out_file.write(file.file.read())

    return destination_path


def _build_multipart_body(doc_path: Path, selfie_path: Path, boundary: str) -> bytes:
    parts = []

    for field_name, file_path in (("doc_image", doc_path), ("selfie_image", selfie_path)):
        filename = file_path.name
        content = file_path.read_bytes()
        header = (
            f"--{boundary}\r\n"
            f"Content-Disposition: form-data; name=\"{field_name}\"; filename=\"{filename}\"\r\n"
            "Content-Type: image/jpeg\r\n\r\n"
        ).encode("utf-8")
        parts.append(header + content + b"\r\n")

    parts.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(parts)


def _compare_faces(doc_path: Path, selfie_path: Path) -> dict:
    boundary = f"----OuchBoundary{uuid4().hex}"
    body = _build_multipart_body(doc_path=doc_path, selfie_path=selfie_path, boundary=boundary)

    request = urllib.request.Request(
        FACE_SERVICE_COMPARE_URL,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.URLError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to reach face service at {FACE_SERVICE_COMPARE_URL}: {exc}",
        ) from exc

    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Invalid response from face service: {payload}",
        ) from exc


@app.post("/api/kyc/upload")
def upload_kyc_documents(
    full_name: str = Form(...),
    date_of_birth: str = Form(...),
    gender: str = Form(...),
    citizenship_number: str = Form(...),
    permanent_address: str = Form(...),
    current_address: str = Form(...),
    selfie_image: UploadFile = File(...),
    document_front: UploadFile = File(...),
    document_back: UploadFile = File(...),
):
    del full_name, date_of_birth, gender, citizenship_number
    del permanent_address, current_address, document_back

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    front_image_path = _save_upload(
        file=document_front,
        destination_dir=UPLOAD_DIR,
        prefix=f"front_{timestamp}",
    )

    selfie_image_path = _save_upload(
        file=selfie_image,
        destination_dir=UPLOAD_DIR,
        prefix=f"selfie_{timestamp}",
    )

    crop_dir = CROP_OUTPUT_DIR / timestamp
    detections = detector.detect_and_crop(
        image_path=str(front_image_path),
        output_dir=str(crop_dir),
    )

    if not detections:
        raise HTTPException(
            status_code=400,
            detail="No front-side citizenship regions were detected in the uploaded image.",
        )

    photo_crop = next((item for item in detections if item.get("class_name", "").lower() == "photo"), None)
    if not photo_crop:
        raise HTTPException(status_code=400, detail="No citizenship photo crop detected for face comparison.")

    crop_photo_path = Path(photo_crop["crop_path"])
    face_similarity = _compare_faces(doc_path=crop_photo_path, selfie_path=selfie_image_path)
    print(f"Face similarity score: {face_similarity.get('similarity')}")

    return {
        "status": "processed",
        "message": "Citizenship front image processed and crops saved.",
        "uploaded_front_image": str(front_image_path),
        "uploaded_selfie_image": str(selfie_image_path),
        "crop_directory": str(crop_dir),
        "face_similarity": face_similarity,
        "detections": detections,
    }


def _load_liveness_runner():
    if not LIVENESS_SCRIPT.exists():
        raise HTTPException(status_code=500, detail="ml/liveness-service/liveness.py not found")

    spec = importlib.util.spec_from_file_location("liveness_service", str(LIVENESS_SCRIPT))
    if spec is None or spec.loader is None:
        raise HTTPException(status_code=500, detail="Unable to load liveness service module")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    if not hasattr(module, "run_liveness"):
        raise HTTPException(status_code=500, detail="run_liveness not found in liveness service module")

    return module.run_liveness


@app.post("/api/liveness/run")
def run_liveness():
    try:
        run_liveness_fn = _load_liveness_runner()
        result = run_liveness_fn(output_dir=str(OUTPUT_DIR), show_window=False)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Liveness service execution failed: {exc}") from exc

    image_path = getattr(result, "image_path", None)
    image_data_url = None

    if image_path and os.path.exists(image_path):
        with open(image_path, "rb") as image_file:
            encoded = base64.b64encode(image_file.read()).decode("utf-8")
        image_data_url = f"data:image/jpeg;base64,{encoded}"

    return {
        "passed": bool(getattr(result, "passed", False)),
        "message": getattr(result, "message", "Liveness failed"),
        "image": image_data_url,
    }

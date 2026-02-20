import base64
import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
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
LIVENESS_SHOW_WINDOW = os.getenv("LIVENESS_SHOW_WINDOW", "1").strip().lower() in {"1", "true", "yes", "on"}

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


def _compare_faces_from_paths(doc_path: Path, selfie_path: Path) -> dict:
    try:
        emb_doc = get_embedding(str(doc_path))
        emb_selfie = get_embedding(str(selfie_path))
        result = compare_embeddings(emb_doc, emb_selfie)
        return {
            "similarity": float(result["similarity"]),
            "match": bool(result["match"]),
            "threshold_used": float(result["threshold_used"]),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Face comparison failed: {exc}") from exc


@app.post("/compare")
async def compare_faces(
    doc_image: UploadFile = File(...),
    selfie_image: UploadFile = File(...),
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp_doc, tempfile.NamedTemporaryFile(
        delete=False, suffix=".jpg"
    ) as tmp_selfie:
        tmp_doc.write(await doc_image.read())
        tmp_selfie.write(await selfie_image.read())

    doc_path = Path(tmp_doc.name)
    selfie_path = Path(tmp_selfie.name)

    try:
        return _compare_faces_from_paths(doc_path=doc_path, selfie_path=selfie_path)
    finally:
        if doc_path.exists():
            doc_path.unlink()
        if selfie_path.exists():
            selfie_path.unlink()


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
    face_similarity = _compare_faces_from_paths(doc_path=crop_photo_path, selfie_path=selfie_image_path)
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


def _run_liveness_subprocess() -> dict:
    cmd = [
        sys.executable,
        str(LIVENESS_SCRIPT),
        "--json",
        "--output-dir",
        str(OUTPUT_DIR),
    ]

    completed = subprocess.run(
        cmd,
        cwd=str(ROOT_DIR),
        capture_output=True,
        text=True,
        check=False,
        stderr=subprocess.DEVNULL,
    )

    stdout_lines = completed.stdout.strip().splitlines()
    payload_line = stdout_lines[-1] if stdout_lines else "{}"

    try:
        payload = json.loads(payload_line)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Invalid liveness response: {payload_line}") from exc

    return {
        "passed": bool(payload.get("passed", False)),
        "message": payload.get("message", "Liveness failed"),
        "image_path": payload.get("image_path"),
    }


@app.post("/api/liveness/run")
def run_liveness(show_window: bool | None = None):
    if show_window is None:
        show_window = LIVENESS_SHOW_WINDOW

    if show_window:
        result_payload = _run_liveness_subprocess()
        image_path = result_payload.get("image_path")
        passed = bool(result_payload.get("passed", False))
        message = result_payload.get("message", "Liveness failed")
    else:
        try:
            run_liveness_fn = _load_liveness_runner()
            with contextlib.redirect_stderr(io.StringIO()):
                result = run_liveness_fn(output_dir=str(OUTPUT_DIR), show_window=False)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Liveness service execution failed: {exc}") from exc

        image_path = getattr(result, "image_path", None)
        passed = bool(getattr(result, "passed", False))
        message = getattr(result, "message", "Liveness failed")
    image_data_url = None

    if image_path and os.path.exists(image_path):
        with open(image_path, "rb") as image_file:
            encoded = base64.b64encode(image_file.read()).decode("utf-8")
        image_data_url = f"data:image/jpeg;base64,{encoded}"

    return {
        "passed": passed,
        "message": message,
        "image": image_data_url,
        "show_window": bool(show_window),
    }

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import tempfile
import os
from .embed import get_embedding
from .match import compare_embeddings

app = FastAPI(title="Face Similarity Service")

@app.post("/embed")
async def embed_image(file: UploadFile = File(...)):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        embedding = get_embedding(tmp_path)
        os.unlink(tmp_path)  # clean up

        return {"embedding": embedding.tolist()}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/compare")
async def compare_faces(
    doc_image: UploadFile = File(...),      # cropped citizen photo
    selfie_image: UploadFile = File(...)
):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp_doc, \
             tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp_selfie:

            tmp_doc.write(await doc_image.read())
            tmp_selfie.write(await selfie_image.read())

            emb_doc = get_embedding(tmp_doc.name)
            emb_selfie = get_embedding(tmp_selfie.name)

            os.unlink(tmp_doc.name)
            os.unlink(tmp_selfie.name)

        result = compare_embeddings(emb_doc, emb_selfie)
        safe_result = {
    "similarity": float(result["similarity"]),
    "match": bool(result["match"]),        
    "threshold_used": float(result["threshold_used"])
}
        return safe_result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# health check
@app.get("/health")
def health():
    return {"status": "healthy"}
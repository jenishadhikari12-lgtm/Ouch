import cv2
import numpy as np

from insightface.app import FaceAnalysis      

app = None 

def load_model():
    global app
    if app is None:
        app = FaceAnalysis(name='buffalo_l', providers=['CUDAExecutionProvider', 'CPUExecutionProvider'])
        app.prepare(ctx_id=0, det_size=(640, 640))  # 0 = GPU if available, -1 = CPU
    return app

def get_embedding(image_path: str) -> np.ndarray:
    """
    Returns normalized 512-dim embedding from image.
    Raises ValueError if no face or multiple faces.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError("Cannot read image")

    app = load_model()
    faces = app.get(img)

    if len(faces) == 0:
        raise ValueError("No face detected")
    if len(faces) > 1:
        raise ValueError("Multiple faces detected – please crop to single face")

    embedding = faces[0].normed_embedding  # already normalized
    return np.array(embedding, dtype=np.float32)

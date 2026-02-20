import numpy as np

def cosine_similarity(emb1: np.ndarray, emb2: np.ndarray) -> float:
    if emb1.ndim == 1:
        emb1 = emb1.reshape(1, -1)
    if emb2.ndim == 1:
        emb2 = emb2.reshape(1, -1)
    return float(np.dot(emb1, emb2.T)[0][0])  # ensure Python float

def is_match(similarity: float, threshold: float = 0.40) -> bool:
    return bool(similarity >= threshold)  # force Python bool

def compare_embeddings(emb_doc: np.ndarray, emb_selfie: np.ndarray, threshold: float = 0.60):
    sim = cosine_similarity(emb_doc, emb_selfie)
    match_result = is_match(sim, threshold)
    return {
        "similarity": sim,                # already float
        "match": match_result,            # now Python bool
        "threshold_used": float(threshold)
    }
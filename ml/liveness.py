import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import random
import time
import os
import sys

# ─────────────────────────────────────────────────────────────
# PATH CONFIG
# ─────────────────────────────────────────────────────────────
MODEL_PATH = os.path.join(os.path.dirname(__file__), "face_landmarker.task")
if not os.path.exists(MODEL_PATH):
    print("❌ face_landmarker.task not found!")
    sys.exit(1)

# ─────────────────────────────────────────────────────────────
# MEDIAPIPE INIT (VIDEO MODE ✅)
# ─────────────────────────────────────────────────────────────
base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
options = vision.FaceLandmarkerOptions(
    base_options=base_options,
    running_mode=vision.RunningMode.VIDEO,
    num_faces=1,
    min_face_detection_confidence=0.4,
    min_face_presence_confidence=0.4,
    min_tracking_confidence=0.4
)
face_landmarker = vision.FaceLandmarker.create_from_options(options)

# ─────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]

depth_history = []
stability_buffer = []

os.makedirs("extracted_faces", exist_ok=True)

# ─────────────────────────────────────────────────────────────
# HELPER FUNCTIONS
# ─────────────────────────────────────────────────────────────
def get_face_bounds(frame, landmarks):
    h, w, _ = frame.shape
    xs = [int(lm.x * w) for lm in landmarks]
    ys = [int(lm.y * h) for lm in landmarks]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    pad_x = int((max_x - min_x) * 0.25)
    pad_y = int((max_y - min_y) * 0.35)

    return (
        max(0, min_x - pad_x),
        max(0, min_y - pad_y),
        min(w, max_x + pad_x),
        min(h, max_y + pad_y),
    )


def eye_aspect_ratio(landmarks, idx):
    p = [np.array([landmarks[i].x, landmarks[i].y]) for i in idx]
    return (np.linalg.norm(p[1]-p[5]) + np.linalg.norm(p[2]-p[4])) / (2*np.linalg.norm(p[0]-p[3]))


def get_mouth_ratio(landmarks):
    up = np.array([landmarks[13].x, landmarks[13].y])
    low = np.array([landmarks[14].x, landmarks[14].y])
    l = np.array([landmarks[61].x, landmarks[61].y])
    r = np.array([landmarks[291].x, landmarks[291].y])
    return np.linalg.norm(up-low) / np.linalg.norm(l-r)


def get_head_pose_and_depth(landmarks):
    nose = landmarks[1]
    left = landmarks[234]
    right = landmarks[454]

    face_w = right.x - left.x
    if face_w <= 0:
        return "CENTER", 0.0

    rel = (nose.x - left.x) / face_w
    direction = "LEFT" if rel < 0.25 else "RIGHT" if rel > 0.75 else "CENTER"
    depth = abs(nose.z - (left.z + right.z) / 2)
    return direction, depth


def is_face_stable(landmarks):
    stability_buffer.append([landmarks[1].x, landmarks[1].y])
    if len(stability_buffer) > 15:
        stability_buffer.pop(0)
    if len(stability_buffer) < 15:
        return False
    return np.max(np.std(stability_buffer, axis=0)) < 0.006


def spoof_check(depth):
    depth_history.append(depth)
    if len(depth_history) > 50:
        depth_history.pop(0)
    if len(depth_history) < 50:
        return True
    return np.var(depth_history) > 5e-8

# ─────────────────────────────────────────────────────────────
# LIVENESS SESSION
# ─────────────────────────────────────────────────────────────
class LivenessSession:
    def __init__(self):
        self.tasks = ["BLINK", "TURN_LEFT", "TURN_RIGHT", "OPEN_MOUTH"]
        random.shuffle(self.tasks)
        self.idx = 0
        self.counter = 0
        self.active = True

    def update(self, landmarks):
        direction, depth = get_head_pose_and_depth(landmarks)
        if not spoof_check(depth):
            self.active = False
            return "SPOOF DETECTED", (0,0,255)

        task = self.tasks[self.idx]
        passed = False

        if task == "BLINK":
            ear = (eye_aspect_ratio(landmarks, LEFT_EYE) +
                   eye_aspect_ratio(landmarks, RIGHT_EYE)) / 2
            if ear < 0.18:
                self.counter += 1
            if self.counter >= 2:
                passed = True

        elif task == "OPEN_MOUTH":
            if get_mouth_ratio(landmarks) > 0.5:
                self.counter += 1
            if self.counter >= 5:
                passed = True

        elif "TURN" in task and direction == task.split("_")[1]:
            self.counter += 1
            if self.counter >= 6:
                passed = True

        if passed:
            self.idx += 1
            self.counter = 0
            if self.idx >= len(self.tasks):
                self.active = False
                return "LIVENESS PASSED ✅", (0,255,0)

        return f"{task}", (0,255,255)

# ─────────────────────────────────────────────────────────────
# MAIN LOOP
# ─────────────────────────────────────────────────────────────
cap = cv2.VideoCapture(0)
if not cap.isOpened():
    print("❌ Webcam not found")
    sys.exit(1)

session = LivenessSession()
photo_saved = False
hold_start = None

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.flip(frame, 1)
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_img = mp.Image(mp.ImageFormat.SRGB, rgb)
    timestamp = int(time.time() * 1000)

    result = face_landmarker.detect_for_video(mp_img, timestamp)

    msg, color = "LOOK AT CAMERA", (200,200,200)

    if result.face_landmarks:
        lm = result.face_landmarks[0]
        direction, _ = get_head_pose_and_depth(lm)
        mouth = get_mouth_ratio(lm)

        if not photo_saved:
            if direction == "CENTER" and mouth < 0.2 and is_face_stable(lm):
                if hold_start is None:
                    hold_start = time.time()
                elapsed = time.time() - hold_start
                msg = f"HOLD STILL {round(2-elapsed,1)}s"
                color = (0,255,0)

                if elapsed >= 2:
                    x1,y1,x2,y2 = get_face_bounds(frame, lm)
                    cv2.imwrite("extracted_faces/face.jpg", frame[y1:y2, x1:x2])
                    photo_saved = True
                    msg = "PHOTO CAPTURED ✓"
                    color = (0,255,80)
            else:
                hold_start = None
                msg = "CENTER FACE & CLOSE MOUTH"
                color = (255,200,0)
        else:
            msg, color = session.update(lm)

    cv2.putText(frame, msg, (20,50), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
    cv2.imshow("KYC Liveness System", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()

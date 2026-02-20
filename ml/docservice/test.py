import os
import cv2
import sys

script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(script_dir, "..", "..", ".."))

if script_dir not in sys.path:
    sys.path.append(script_dir)

try:
    from ml.docservice.src.detect_crop import DocumentDetector
except ImportError:
    from detect_crop import DocumentDetector

def run_root_test():
    IMAGE_NAME = "testimage2.jpg" 
    MODEL_NAME = "frontbest.pt"
    CROP_OUTPUT_FOLDER = os.path.join(project_root, "detected_crops")
    
    image_path = os.path.join(project_root, IMAGE_NAME)
    weights_path = os.path.join(script_dir, "weights", MODEL_NAME)

    if not os.path.exists(image_path):
        print(f"❌ ERROR: Image not found at {image_path}")
        return
    
    if not os.path.exists(weights_path):
        print(f"❌ ERROR: Weights not found at {weights_path}")
        return

    print("🚀 Initializing Detector...")
    detector = DocumentDetector(model_path=weights_path)
    
    print(f"🔍 Processing {IMAGE_NAME}...")
    # The logic happens inside this one function call now
    detections = detector.detect_and_crop(image_path, output_dir=CROP_OUTPUT_FOLDER)

    img = cv2.imread(image_path)
    
    if not detections:
        print("⚠️ No Logo or Photo detected.")
    else:
        for det in detections:
            name = det['class_name']
            conf = det['confidence']
            x1, y1, x2, y2 = det['bbox']
            
            print(f"✅ Found {name} | Saved to: {det['crop_path']}")

            # Draw the box for visual confirmation
            color = (0, 255, 0) if name == "photo" else (255, 0, 0)
            cv2.rectangle(img, (x1, y1), (x2, y2), color, 3)
            cv2.putText(img, f"{name} {conf:.2f}", (x1, y1 - 10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

        

if __name__ == "__main__":
    run_root_test()